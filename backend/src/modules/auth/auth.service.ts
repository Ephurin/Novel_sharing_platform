import { promoteReaderToAuthor } from './auth.repository.js';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
  findAuthUserByEmailOrUsername,
  findAuthUserById,
  findGoogleAccount,
  findValidRefreshToken,
  linkGoogleAccount,
  revokeRefreshToken,
  updateLastLoginAt,
  updatePasswordHash
} from './auth.repository.js';
import type { AuthUser, PublicAuthUser } from './auth.types.js';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas.js';

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

export async function register(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await withPostgresTransaction(async (client) =>
      createUserAccount(client, {
        email: input.email,
        username: input.username,
        passwordHash
      })
    );
    const tokens = await issueTokenPair(user);

    return {
      user: toPublicUser(user),
      ...tokens
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      const detail = 'detail' in error ? String(error.detail) : '';

      if (detail.includes('email')) {
        throw new AppError(409, 'USER_005', 'Email already exists');
      }

      if (detail.includes('username')) {
        throw new AppError(409, 'USER_004', 'Username already exists');
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
