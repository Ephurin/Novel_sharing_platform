import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { successResponse } from '../../core/response/response.js';
import { findAuthUserByEmailOrUsername } from '../auth/auth.repository.js';

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
          { sub: user.userId, role: user.role, purpose: 'APPEAL_ONLY' },
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
        "select user_id,role from users where user_id::text=$1 and status<>'DELETED' and deleted_at is null",
        [payload.sub]
      )
    ).rows[0];
    if (!user) throw new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Tài khoản không tồn tại.');
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
