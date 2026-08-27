import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  createRefreshToken,
  createUserAccount,
  findAuthUserByEmailOrUsername,
  findAuthUserById,
  findValidRefreshToken,
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

async function issueTokenPair(user: AuthUser) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshJwt(user);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();

  await withPostgresTransaction(async (client) => {
    await createRefreshToken(client, {
      userId: user.userId,
      tokenHash,
      expiresAt
    });
  });

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
