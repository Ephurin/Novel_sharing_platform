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

export async function registrationConflicts(email: string, username: string, client?: DbClient) {
  const result = await (client ?? getPostgresPool()).query<{ email: boolean; username: boolean }>(
    `select exists(select 1 from users where lower(email) = $1) as email,
            exists(select 1 from users where username = $2) as username`,
    [email, username]
  );
  return result.rows[0];
}

export const REGISTRATION_RESEND_SECONDS = 60;
export const REGISTRATION_RECOVERY_MINUTES = 60;

export async function savePendingRegistration(input: {
  registrationId: string;
  email: string;
  username: string;
  passwordHash: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: Date;
}) {
  const pool = getPostgresPool();
  await pool.query(
    "delete from pending_email_registrations where requested_at <= now() - $1 * interval '1 minute'",
    [REGISTRATION_RECOVERY_MINUTES]
  );
  const result = await pool.query(
    `insert into pending_email_registrations (email, registration_id, username, password_hash, code_hash, link_token_hash, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (email) do update
     set registration_id = excluded.registration_id, username = excluded.username, password_hash = excluded.password_hash,
         code_hash = excluded.code_hash, link_token_hash = excluded.link_token_hash,
         attempts = 0, requested_at = now(), expires_at = excluded.expires_at
     where pending_email_registrations.requested_at <= now() - $8 * interval '1 second'`,
    [input.email, input.registrationId, input.username, input.passwordHash, input.codeHash, input.linkTokenHash, input.expiresAt, REGISTRATION_RESEND_SECONDS]
  );
  return result.rowCount === 1;
}

export async function lockRegistrationForResend(client: DbClient, registrationId: string) {
  const result = await client.query<{ email: string; username: string; code_hash: string; retry_after_seconds: number }>(
    `select email, username, code_hash,
            greatest(0, ceil(extract(epoch from requested_at + $2 * interval '1 second' - clock_timestamp())))::int as retry_after_seconds
     from pending_email_registrations
     where registration_id = $1 and requested_at > now() - $3 * interval '1 minute' for update`,
    [registrationId, REGISTRATION_RESEND_SECONDS, REGISTRATION_RECOVERY_MINUTES]
  );
  return result.rows[0] ?? null;
}

export async function replaceRegistrationProofs(client: DbClient, registrationId: string, proof: {
  codeHash: string;
  linkTokenHash: string;
  expiryMinutes: number;
}) {
  await client.query(
    `update pending_email_registrations
     set code_hash = $2, link_token_hash = $3, attempts = 0,
         requested_at = clock_timestamp(), expires_at = clock_timestamp() + $4 * interval '1 minute'
     where registration_id = $1`,
    [registrationId, proof.codeHash, proof.linkTokenHash, proof.expiryMinutes]
  );
}

export async function lockPendingRegistration(client: DbClient, registrationId: string) {
  const result = await client.query<{
    email: string;
    username: string;
    password_hash: string;
    code_hash: string;
    link_token_hash: string | null;
    attempts: number;
  }>(
    `select email, username, password_hash, code_hash, link_token_hash, attempts
     from pending_email_registrations where registration_id = $1 and expires_at > now() for update`,
    [registrationId]
  );
  return result.rows[0] ?? null;
}

export async function recordFailedRegistrationCode(client: DbClient, registrationId: string) {
  await client.query('update pending_email_registrations set attempts = attempts + 1 where registration_id = $1', [registrationId]);
}

export async function deletePendingRegistration(registrationId: string, client?: DbClient) {
  await (client ?? getPostgresPool()).query('delete from pending_email_registrations where registration_id = $1', [registrationId]);
}

export async function createUserAccount(
  client: DbClient,
  input: {
    email: string;
    username: string;
    passwordHash: string | null;
    displayName?: string;
    googleSubject?: string;
  }
) {
  const userResult = await client.query(
    `
      insert into users (email, username, password_hash, role, status, oauth_provider, oauth_subject)
      values ($1, $2, $3, 'READER', 'ACTIVE', $4, $5)
      returning *
    `,
    [input.email.toLowerCase(), input.username, input.passwordHash, input.googleSubject ? 'google' : null, input.googleSubject ?? null]
  );
  const user = userResult.rows[0];
  const displayName = input.displayName || input.username;

  await client.query(
    `
      insert into user_profiles (user_id, display_name)
      values ($1, $2)
    `,
    [user.user_id, displayName]
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
    display_name: displayName,
    avatar_url: null
  });
}

export async function updateLastLoginAt(userId: string, client?: DbClient) {
  await (client ?? getPostgresPool()).query(
    `
      update users
      set last_login_at = now(), updated_at = now()
      where user_id = $1
    `,
    [userId]
  );
}

export async function findGoogleAccount(client: DbClient, subject: string, email: string) {
  const result = await client.query(
    `select u.*, p.display_name, p.avatar_url
     from users u left join user_profiles p on p.user_id = u.user_id
     where (u.oauth_provider = 'google' and u.oauth_subject = $1) or lower(u.email) = $2
     order by coalesce(u.oauth_provider = 'google' and u.oauth_subject = $1, false) desc,
              (u.email = $2) desc, u.user_id
     limit 1 for update of u`,
    [subject, email]
  );
  const row = result.rows[0];
  return row ? {
    user: mapAuthUser(row),
    deleted: row.deleted_at !== null,
    hasProvider: Boolean(row.oauth_provider || row.oauth_subject),
    matchesGoogle: row.oauth_provider === 'google' && row.oauth_subject === subject
  } : null;
}

export async function linkGoogleAccount(client: DbClient, userId: string, subject: string) {
  await client.query(
    "update users set oauth_provider = 'google', oauth_subject = $2 where user_id = $1",
    [userId, subject]
  );
}

export async function consumeGoogleChallenge(client: DbClient, nonce: string, expiresAt: Date) {
  await client.query('delete from consumed_google_challenges where expires_at <= now()');
  const result = await client.query(
    'insert into consumed_google_challenges (nonce, expires_at) select $1, $2::timestamptz where $2 > now() on conflict do nothing',
    [nonce, expiresAt]
  );
  return result.rowCount === 1;
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
