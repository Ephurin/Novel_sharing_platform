import { promoteReaderToAuthor } from './auth.repository.js';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PoolClient } from 'pg';
import { env } from '../../core/config/env.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  consumeGoogleChallenge,
  createRefreshToken,
  createUserAccount,
  deletePendingRegistration,
  findAuthUserByEmailOrUsername,
  findAuthUserById,
  findGoogleAccount,
  findValidRefreshToken,
  linkGoogleAccount,
  lockPendingRegistration,
  lockRegistrationForResend,
  recordFailedRegistrationCode,
  registrationConflicts,
  REGISTRATION_RESEND_SECONDS,
  replaceRegistrationProofs,
  revokeRefreshToken,
  savePendingRegistration,
  updateLastLoginAt,
  updatePasswordHash,
  type RegistrationChannel
} from './auth.repository.js';
import type { AuthUser, PublicAuthUser } from './auth.types.js';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas.js';
import { sendRegistrationEmail } from './registration-mail.js';

const refreshTokenPayloadSchema = {
  issuer: 'ephurin-api',
  audience: 'ephurin-client'
};

function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    userId: user.userId,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status
  };
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.userId,
      role: user.role,
      jti: randomUUID()
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_SECONDS,
      issuer: refreshTokenPayloadSchema.issuer,
      audience: refreshTokenPayloadSchema.audience
    }
  );
}

function createRefreshJwt(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.userId,
      role: user.role,
      jti: randomUUID(),
      typ: 'refresh'
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: `${env.JWT_REFRESH_EXPIRES_DAYS}d`,
      issuer: refreshTokenPayloadSchema.issuer,
      audience: refreshTokenPayloadSchema.audience
    }
  );
}

function getRefreshExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRES_DAYS);
  return expiresAt;
}

async function issueTokenPair(user: AuthUser, client?: PoolClient) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshJwt(user);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();

  const persist = (sessionClient: PoolClient) => createRefreshToken(sessionClient, {
    userId: user.userId,
    tokenHash,
    expiresAt
  });
  await (client ? persist(client) : withPostgresTransaction(persist));

  return {
    accessToken,
    refreshToken,
    refreshTokenMaxAgeMs: env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000
  };
}

export const REGISTRATION_EXPIRY_MINUTES = 15;

function registrationCodeHash(registrationId: string, code: string) {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(`registration:${registrationId}:${code}`).digest('hex');
}

function createRegistrationProofs(registrationId: string, channel: RegistrationChannel, previousCodeHash?: string) {
  let code: string;
  let codeHash: string;
  do {
    code = randomInt(100_000_000).toString().padStart(8, '0');
    codeHash = registrationCodeHash(registrationId, code);
  } while (codeHash === previousCodeHash);
  if (channel === 'native') return { code, codeHash, confirmationUrl: null, linkTokenHash: null };
  const linkToken = randomBytes(32).toString('base64url');
  const confirmationUrl = new URL('/verify-email', env.WEB_ORIGIN);
  confirmationUrl.hash = `token=${linkToken}`;
  return { code, codeHash, confirmationUrl: confirmationUrl.href, linkTokenHash: hashToken(linkToken) };
}

function isGmailAddress(email: string) {
  return email.toLowerCase().endsWith('@gmail.com');
}

async function assertRegistrationAvailable(email: string, username: string, client?: PoolClient) {
  if (!isGmailAddress(email)) {
    throw new AppError(400, 'AUTH_EMAIL_DOMAIN', 'Bạn cần dùng địa chỉ @gmail.com để tạo tài khoản.');
  }
  const conflicts = await registrationConflicts(email, username, client);
  if (conflicts.email) throw new AppError(409, 'USER_005', 'Email này đã có tài khoản.');
  if (conflicts.username) throw new AppError(409, 'USER_004', 'Tên người dùng đã được sử dụng.');
}

export async function register(input: RegisterInput, channel: RegistrationChannel = 'web'): Promise<{ registrationId: string; email: string; resendAfterSeconds: number }> {
  const email = input.email.toLowerCase();
  await assertRegistrationAvailable(email, input.username);
  const registrationId = randomUUID();
  const { code, codeHash, confirmationUrl, linkTokenHash } = createRegistrationProofs(registrationId, channel);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const saved = await savePendingRegistration({
    registrationId, email, username: input.username, passwordHash,
    codeHash, linkTokenHash, channel,
    expiresAt: new Date(Date.now() + REGISTRATION_EXPIRY_MINUTES * 60_000)
  });
  if (!saved) {
    throw new AppError(429, 'AUTH_EMAIL_RATE_LIMIT', 'Email này đang chờ xác nhận. Hãy dùng email đã gửi hoặc yêu cầu gửi lại từ phiên đăng ký trước.');
  }

  try {
    await sendRegistrationEmail(email, code, confirmationUrl, REGISTRATION_EXPIRY_MINUTES);
  } catch (error) {
    await deletePendingRegistration(registrationId);
    throw error;
  }

  return { registrationId, email, resendAfterSeconds: REGISTRATION_RESEND_SECONDS };
}

export async function resendRegistrationEmail(registrationId: string, channel: RegistrationChannel = 'web') {
  return withPostgresTransaction(async (client) => {
    const pending = await lockRegistrationForResend(client, registrationId, channel);
    if (!pending) {
      throw new AppError(400, 'AUTH_EMAIL_REGISTRATION_EXPIRED', 'Phiên đăng ký đã hết hạn. Hãy quay lại để đăng ký lại.');
    }
    if (pending.retry_after_seconds > 0) {
      throw new AppError(429, 'AUTH_EMAIL_RATE_LIMIT', 'Hãy chờ trước khi gửi lại email.', {
        retryAfterSeconds: pending.retry_after_seconds
      });
    }
    await assertRegistrationAvailable(pending.email, pending.username, client);
    const { code, codeHash, confirmationUrl, linkTokenHash } = createRegistrationProofs(registrationId, channel, pending.code_hash);
    // Keep the existing link and code valid if the SMTP provider rejects the resend.
    await sendRegistrationEmail(pending.email, code, confirmationUrl, REGISTRATION_EXPIRY_MINUTES);
    await replaceRegistrationProofs(client, registrationId, { codeHash, linkTokenHash, expiryMinutes: REGISTRATION_EXPIRY_MINUTES });
    return { registrationId, email: pending.email, resendAfterSeconds: REGISTRATION_RESEND_SECONDS };
  });
}

type RegistrationProof = { code: string } | { linkToken: string };

export async function verifyRegistration(registrationId: string, proof: RegistrationProof) {
  try {
    const session = await withPostgresTransaction(async (client) => {
      const pending = await lockPendingRegistration(client, registrationId);
      if (!pending) return null;
      if ('code' in proof) {
        if (pending.attempts >= 5) return null;
        const hash = registrationCodeHash(registrationId, proof.code);
        if (!timingSafeEqual(Buffer.from(pending.code_hash, 'hex'), Buffer.from(hash, 'hex'))) {
          await recordFailedRegistrationCode(client, registrationId);
          return null;
        }
      } else if (!pending.link_token_hash || !timingSafeEqual(
        Buffer.from(pending.link_token_hash, 'hex'), Buffer.from(hashToken(proof.linkToken), 'hex')
      )) {
        return null;
      }

      await assertRegistrationAvailable(pending.email, pending.username, client);
      const user = await createUserAccount(client, {
        email: pending.email,
        username: pending.username,
        passwordHash: pending.password_hash
      });
      await deletePendingRegistration(registrationId, client);
      return { user: toPublicUser(user), ...await issueTokenPair(user, client) };
    });
    if (!session) {
      if ('linkToken' in proof) {
        throw new AppError(400, 'AUTH_EMAIL_LINK', 'Link không còn hiệu lực. Hãy dùng mã 8 số ở tab đăng ký hoặc yêu cầu email mới.');
      }
      throw new AppError(400, 'AUTH_EMAIL_CODE', 'Mã không đúng hoặc đã hết hiệu lực. Hãy kiểm tra lại hoặc yêu cầu mã mới.');
    }
    return session;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'constraint' in error) {
      if (error.constraint === 'users_email_key') {
        throw new AppError(409, 'USER_005', 'Email này đã có tài khoản.');
      }
      if (error.constraint === 'users_username_key') {
        throw new AppError(409, 'USER_004', 'Tên người dùng đã được sử dụng.');
      }
    }
    throw error;
  }
}

export async function login(input: LoginInput) {
  const user = await findAuthUserByEmailOrUsername(input.identifier);

  if (!user?.passwordHash) {
    throw new AppError(401, 'AUTH_003', 'Invalid credentials');
  }

  if (user.status === 'LOCKED') {
    throw new AppError(403, 'AUTH_004', 'Account locked');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'AUTH_003', 'Invalid credentials');
  }

  await updateLastLoginAt(user.userId);
  const tokens = await issueTokenPair(user);

  return {
    user: toPublicUser(user),
    ...tokens
  };
}

function googleLinkRequired() {
  return new AppError(409, 'AUTH_GOOGLE_LINK_REQUIRED', 'Email này đã có tài khoản StoryCraft. Nhập mật khẩu StoryCraft để liên kết với Google.');
}

export async function loginWithGoogle(input: {
  subject: string;
  email: string;
  displayName?: string;
  nonce: string;
  expiresAt: Date;
  password?: string;
}) {
  try {
    return await withPostgresTransaction(async (client) => {
      // Concurrent sign-ins for the same Google identity must reuse the same StoryCraft account.
      await client.query("select pg_advisory_xact_lock(hashtextextended('auth:google:' || $1, 0))", [input.subject]);
      if (!(await consumeGoogleChallenge(client, input.nonce, input.expiresAt))) {
        throw new AppError(401, 'AUTH_GOOGLE_CHALLENGE', 'Phiên đăng nhập Google đã hết hạn. Hãy thử lại.');
      }
      const account = await findGoogleAccount(client, input.subject, input.email);
      if (!account?.matchesGoogle && !isGmailAddress(input.email)) {
        throw new AppError(403, 'AUTH_GOOGLE_EMAIL_DOMAIN', 'Hãy chọn tài khoản Google có địa chỉ @gmail.com.');
      }
      let user: AuthUser;
      if (!account) {
        const prefix = input.email.split('@')[0].replace(/[^a-z0-9_]/g, '_').slice(0, 32);
        user = await createUserAccount(client, {
          email: input.email,
          username: `${prefix}_${randomBytes(6).toString('hex')}`,
          displayName: input.displayName || prefix,
          passwordHash: null,
          googleSubject: input.subject
        });
      } else {
        user = account.user;
        if (account.deleted || user.status !== 'ACTIVE') {
          throw new AppError(403, 'AUTH_GOOGLE_INACTIVE', 'Tài khoản StoryCraft này hiện không hoạt động.');
        }
        if (!account.matchesGoogle) {
          if (account.hasProvider || !user.passwordHash) {
            throw new AppError(409, 'AUTH_GOOGLE_LINK_CONFLICT', 'Email này đã được sử dụng bởi một phương thức đăng nhập khác.');
          }
          if (!input.password) throw googleLinkRequired();
          if (!(await bcrypt.compare(input.password, user.passwordHash))) {
            throw new AppError(401, 'AUTH_GOOGLE_LINK_PASSWORD', 'Mật khẩu StoryCraft không chính xác.');
          }
          await linkGoogleAccount(client, user.userId, input.subject);
        }
      }

      await updateLastLoginAt(user.userId, client);
      return { user: toPublicUser(user), ...await issueTokenPair(user, client) };
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'constraint' in error && error.constraint === 'users_email_key') {
      throw googleLinkRequired();
    }
    throw error;
  }
}

export async function refreshAccessToken(refreshToken: string | undefined) {
  if (!refreshToken) {
    throw new AppError(401, 'AUTH_006', 'Invalid refresh token');
  }

  try {
    jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      issuer: refreshTokenPayloadSchema.issuer,
      audience: refreshTokenPayloadSchema.audience
    });
  } catch {
    throw new AppError(401, 'AUTH_006', 'Invalid refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const tokenRow = await findValidRefreshToken(tokenHash);

  if (!tokenRow || tokenRow.status !== 'ACTIVE') {
    throw new AppError(401, 'AUTH_006', 'Invalid refresh token');
  }

  const user = await findAuthUserById(tokenRow.user_id);
  if (!user) {
    throw new AppError(401, 'AUTH_006', 'Invalid refresh token');
  }

  return {
    accessToken: createAccessToken(user)
  };
}

export async function logout(refreshToken: string | undefined) {
  if (refreshToken) {
    await revokeRefreshToken(hashToken(refreshToken));
  }

  return {
    loggedOut: true
  };
}

export async function getCurrentUser(auth: AuthContext) {
  const user = await findAuthUserById(auth.userId);

  if (!user) {
    throw new AppError(401, 'AUTH_002', 'Missing or invalid access token');
  }

  return toPublicUser(user);
}

export async function changePassword(auth: AuthContext, input: ChangePasswordInput) {
  const user = await findAuthUserById(auth.userId);

  if (!user?.passwordHash) {
    throw new AppError(401, 'AUTH_003', 'Invalid credentials');
  }

  const passwordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'AUTH_003', 'Invalid credentials');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await updatePasswordHash(auth.userId, passwordHash);

  return {
    passwordChanged: true
  };
}

export async function becomeAuthor(auth: AuthContext) {
  const account = await findAuthUserById(auth.userId);
  if (!account || account.status !== 'ACTIVE' || account.role !== auth.role || !['READER', 'AUTHOR'].includes(account.role)) throw new AppError(403, 'AUTH_008', 'Tài khoản không thể đăng ký sáng tác');
  const user = await promoteReaderToAuthor(auth.userId);
  if (!user || user.status !== 'ACTIVE' || user.role !== 'AUTHOR') throw new AppError(409, 'AUTH_008', 'Không thể đăng ký sáng tác');
  return { user: toPublicUser(user), ...await issueTokenPair(user) };
}
