import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { fixedWindowLimiter } from '../../core/security/rate-limit.js';
import { successResponse } from '../../core/response/response.js';
import { userRoles } from '../../shared/constants/roles.js';
import { authRateLimit } from '../auth/auth-rate-limit.js';
import { requireGoogleOrigin } from '../auth/auth.controller.js';
import { verifyGoogleIdentity } from '../auth/google-identity.js';
import { findAuthUserByEmailOrUsername, consumeGoogleChallenge } from '../auth/auth.repository.js';

export const accountAppealsRoutes = Router();
const attempts = new Map<string, { count: number; until: number }>();
accountAppealsRoutes.post('/appeal-session', async (req, res, next) => {
  try {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(key, entry);
    }
    if (++entry.count > 10) throw new AppError(429, 'APPEAL_LOGIN_LIMIT', 'Thử lại sau 15 phút.');
    if (attempts.size > 10000)
      for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
    const input = z
      .object({
        identifier: z.string().trim().min(1).max(254),
        password: z.string().min(1).max(200)
      })
      .parse(req.body);
    const user = await findAuthUserByEmailOrUsername(input.identifier);
    if (
      !user ||
      !user.passwordHash ||
      user.status === 'DELETED' ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    )
      throw new AppError(401, 'AUTH_001', 'Thông tin đăng nhập không đúng.');
    res.json(
      successResponse({
        token: jwt.sign(
          { sub: user.userId, role: user.role, ver: user.accessVersion ?? 0, purpose: 'APPEAL_ONLY' },
          env.JWT_ACCESS_SECRET,
          { expiresIn: '15m' }
        ),
        username: user.username
      })
    );
  } catch (error) {
    next(error);
  }
});

const webOrigin = new URL(env.WEB_ORIGIN);
const appealGoogleCookie = `${env.REFRESH_TOKEN_COOKIE_NAME}_appeal_google`;
const appealGoogleCookieOptions = {
  path: `${env.API_PREFIX}/account/appeal-session/google`,
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: webOrigin.protocol === 'https:'
};
const appealChallengeSeconds = 15 * 60;
const appealChallengeAudience = 'storycraft-google-appeal';
const appealSubjectLimit = fixedWindowLimiter(10, appealChallengeSeconds * 1000);

function readAppealGoogleChallenge(cookie: unknown) {
  if (typeof cookie !== 'string') return null;
  try {
    const claims = jwt.verify(cookie, env.JWT_REFRESH_SECRET, {
      audience: appealChallengeAudience,
      algorithms: ['HS256']
    });
    if (typeof claims !== 'string' && typeof claims.jti === 'string' && typeof claims.exp === 'number') {
      return { nonce: claims.jti, expiresAt: new Date(claims.exp * 1000) };
    }
    return null;
  } catch {
    return null;
  }
}

accountAppealsRoutes.post(
  '/appeal-session/google/challenge',
  requireGoogleOrigin,
  authRateLimit({ scope: 'appeal-google-challenge', max: 10, windowMs: appealChallengeSeconds * 1000 }),
  (req, res) => {
    const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      res.json(successResponse(null));
      return;
    }
    const nonce = randomBytes(32).toString('base64url');
    const challenge = jwt.sign({}, env.JWT_REFRESH_SECRET, {
      audience: appealChallengeAudience,
      jwtid: nonce,
      expiresIn: appealChallengeSeconds
    });
    res.cookie(appealGoogleCookie, challenge, {
      ...appealGoogleCookieOptions,
      maxAge: appealChallengeSeconds * 1000
    });
    res.json(successResponse({ clientId, nonce }));
  }
);

accountAppealsRoutes.post(
  '/appeal-session/google',
  requireGoogleOrigin,
  authRateLimit({ scope: 'appeal-google-exchange', max: 10, windowMs: appealChallengeSeconds * 1000 }),
  async (req, res, next) => {
    try {
      const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId)
        throw new AppError(404, 'AUTH_GOOGLE_DISABLED', 'StoryCraft chưa bật đăng nhập Google.');
      const input = z.object({ credential: z.string().min(1).max(5000) }).parse(req.body);
      const challenge = readAppealGoogleChallenge(req.cookies?.[appealGoogleCookie]);
      if (!challenge)
        throw new AppError(401, 'AUTH_GOOGLE_CHALLENGE', 'Phiên xác minh Google đã hết hạn. Hãy thử lại.');
      // No database lock is held while Google verifies the credential.
      const identity = await verifyGoogleIdentity(input.credential, clientId, challenge.nonce);
      const retryAfterSeconds = appealSubjectLimit(`subject:${identity.subject}`);
      if (retryAfterSeconds !== null)
        throw new AppError(429, 'RATE_LIMIT_001', 'Too many requests, please retry later', {
          scope: 'appeal-google-subject',
          retryAfterSeconds
        });
      const user = await withPostgresTransaction(async (client) => {
        if (!(await consumeGoogleChallenge(client, challenge.nonce, 'appeal', challenge.expiresAt)))
          throw new AppError(401, 'AUTH_GOOGLE_CHALLENGE', 'Phiên xác minh Google đã hết hạn. Hãy thử lại.');
        return (
          await client.query(
            `select user_id,username,role,access_version from users
             where oauth_provider='google' and oauth_subject=$1 and status<>'DELETED' and deleted_at is null`,
            [identity.subject]
          )
        ).rows[0] ?? null;
      });
      if (!user)
        throw new AppError(401, 'APPEAL_GOOGLE_ACCOUNT', 'Không tìm thấy tài khoản liên kết với Google này.');
      res.clearCookie(appealGoogleCookie, appealGoogleCookieOptions);
      res.json(
        successResponse({
          token: jwt.sign(
            { sub: user.user_id, role: user.role, ver: user.access_version ?? 0, purpose: 'APPEAL_ONLY' },
            env.JWT_ACCESS_SECRET,
            { expiresIn: '15m' }
          ),
          username: user.username
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

const identity: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new AppError(401, 'AUTH_002', 'Cần đăng nhập để gửi khiếu nại.');
    let payload: any;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch {
      throw new AppError(401, 'AUTH_002', 'Phiên đã hết hạn. Hãy đăng nhập lại.');
    }
    if (typeof payload.sub !== 'string' || (payload.purpose && payload.purpose !== 'APPEAL_ONLY'))
      throw new AppError(401, 'AUTH_002', 'Phiên không hợp lệ.');
    const user = (
      await getPostgresPool().query(
        "select user_id,role,access_version from users where user_id::text=$1 and status<>'DELETED' and deleted_at is null",
        [payload.sub]
      )
    ).rows[0];
    if (!user) throw new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Tài khoản không tồn tại.');
    if (!userRoles.includes(user.role)) throw new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Tài khoản không hợp lệ.');
    const claimVersion = typeof payload.ver === 'number' && Number.isInteger(payload.ver) && payload.ver >= 0 ? payload.ver : 0;
    if (claimVersion !== Number(user.access_version ?? 0)) throw new AppError(401, 'AUTH_009', 'Phiên khiếu nại đã đổi quyền. Hãy mở phiên khiếu nại mới.');
    req.auth = { userId: user.user_id, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};
accountAppealsRoutes.use(identity);
accountAppealsRoutes.get('/decisions', async (req, res, next) => {
  try {
    const result = await getPostgresPool().query(
      `select s.sanction_id,s.audit_id,s.target_type,s.target_id,s.action,s.active,s.created_at,a.reason,p.appeal_id,p.message,p.status as appeal_status,p.resolution,p.reviewed_at from admin_sanctions s join admin_audit a using(audit_id) left join admin_appeals p on p.audit_id=s.audit_id and p.user_id=s.owner_id where s.owner_id=$1 order by s.created_at desc limit 100`,
      [req.auth!.userId]
    );
    res.json(successResponse(result.rows));
  } catch (error) {
    next(error);
  }
});
accountAppealsRoutes.post('/appeals', async (req, res, next) => {
  try {
    const input = z
      .object({ auditId: z.string().uuid(), message: z.string().trim().min(10).max(4000) })
      .parse(req.body);
    const result = await getPostgresPool().query(
      `insert into admin_appeals(audit_id,user_id,message) select audit_id,owner_id,$3 from admin_sanctions where audit_id=$1 and owner_id=$2 and active returning *`,
      [input.auditId, req.auth!.userId, input.message]
    );
    if (!result.rows[0])
      throw new AppError(
        404,
        'APPEAL_DECISION',
        'Không tìm thấy quyết định còn hiệu lực thuộc tài khoản này.'
      );
    res.status(201).json(successResponse(result.rows[0]));
  } catch (error: any) {
    next(
      error?.code === '23505'
        ? new AppError(409, 'APPEAL_EXISTS', 'Bạn đã gửi khiếu nại cho quyết định này.')
        : error
    );
  }
});
