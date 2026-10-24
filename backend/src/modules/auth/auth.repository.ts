import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type { AuthUser } from './auth.types.js';

type DbClient = Pick<PoolClient, 'query'>;

function mapAuthUser(row: QueryResultRow): AuthUser {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash
  };
}

export async function findAuthUserByEmailOrUsername(identifier: string) {
  const result = await getPostgresPool().query(
    `
      select u.*, p.display_name, p.avatar_url
      from users u
      left join user_profiles p on p.user_id = u.user_id
      where (lower(u.email) = lower($1) or lower(u.username) = lower($1))
        and u.deleted_at is null
      limit 1
    `,
    [identifier]
  );

  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function findAuthUserById(userId: string) {
  const result = await getPostgresPool().query(
    `
      select u.*, p.display_name, p.avatar_url
      from users u
      left join user_profiles p on p.user_id = u.user_id
      where u.user_id = $1 and u.deleted_at is null
      limit 1
    `,
    [userId]
  );

  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function createUserAccount(
  client: DbClient,
  input: {
    email: string;
    username: string;
    passwordHash: string;
  }
) {
  const userResult = await client.query(
    `
      insert into users (email, username, password_hash, role, status)
      values ($1, $2, $3, 'READER', 'ACTIVE')
      returning *
    `,
    [input.email.toLowerCase(), input.username, input.passwordHash]
  );
  const user = userResult.rows[0];

  await client.query(
    `
      insert into user_profiles (user_id, display_name)
      values ($1, $2)
    `,
    [user.user_id, input.username]
  );

  await client.query(
    `
      insert into wallets (user_id)
      values ($1)
    `,
    [user.user_id]
  );

  return mapAuthUser({
    ...user,
    display_name: input.username,
    avatar_url: null
  });
}

export async function updateLastLoginAt(userId: string) {
  await getPostgresPool().query(
    `
      update users
      set last_login_at = now(), updated_at = now()
      where user_id = $1
    `,
    [userId]
  );
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await getPostgresPool().query(
    `
      update users
      set password_hash = $2, updated_at = now()
      where user_id = $1
    `,
    [userId, passwordHash]
  );
}

export async function createRefreshToken(
  client: DbClient,
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }
) {
  await client.query(
    `
      insert into refresh_tokens (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [input.userId, input.tokenHash, input.expiresAt]
  );
}

export async function findValidRefreshToken(tokenHash: string) {
  const result = await getPostgresPool().query(
    `
      select rt.*, u.status
      from refresh_tokens rt
      join users u on u.user_id = rt.user_id
      where rt.token_hash = $1
        and rt.revoked_at is null
        and rt.expires_at > now()
        and u.deleted_at is null
      limit 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(tokenHash: string) {
  await getPostgresPool().query(
    `
      update refresh_tokens
      set revoked_at = now()
      where token_hash = $1 and revoked_at is null
    `,
    [tokenHash]
  );
}

export async function promoteReaderToAuthor(userId: string) {
  await getPostgresPool().query("update users set role = 'AUTHOR', updated_at = now() where user_id = $1 and role = 'READER' and status = 'ACTIVE' and deleted_at is null", [userId]);
  return findAuthUserById(userId);
}
