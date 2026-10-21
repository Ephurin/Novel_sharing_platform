import type { Pool } from 'pg';
import type { Db } from 'mongodb';

export const FORBIDDEN_DB_NAMES = new Set([
  'ephurin',
  'postgres',
  'template0',
  'template1',
  'production',
  'prod',
  'demo',
  'ephurin_dev',
  'admin',
  'config',
  'local'
]);

export const APPROVED_TEST_DB_PATTERN = /^(ephurin_report_e2e_[a-zA-Z0-9_-]+|ephurin_test_[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+_test)$/;

export interface DatabaseIsolationInfo {
  postgresDb: string;
  postgresServerAddr: string | null;
  postgresServerPort: number | null;
  mongoDb: string;
  isIsolated: boolean;
  optInVerified: boolean;
}

/**
 * Checks whether a given database name qualifies as an approved isolated test database.
 */
export function isAllowedTestDbName(dbName: string): boolean {
  if (!dbName || typeof dbName !== 'string') {
    return false;
  }
  const normalized = dbName.trim().toLowerCase();
  if (FORBIDDEN_DB_NAMES.has(normalized)) {
    return false;
  }
  return APPROVED_TEST_DB_PATTERN.test(normalized);
}

export interface AssertionContext {
  pgDatabase: string;
  mongoDatabase: string;
  expectedDbName?: string;
  allowOptInEnv?: string;
  nodeEnv?: string;
  ciEnv?: string;
  npmLifecycleScript?: string;
}

/**
 * Pure fail-closed guard assertion.
 * Rejects default 'ephurin' or non-isolated DB targets and enforces external opt-in.
 * Confirms that NODE_ENV=test, CI=true, or npm lifecycle alone NEVER self-authorizes mutations.
 */
export function assertTestDatabaseIsolation(ctx: AssertionContext): void {
  const optIn = 'allowOptInEnv' in ctx ? ctx.allowOptInEnv : process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS;

  if (optIn !== '1') {
    throw new Error(
      'Refusing database mutations: missing required external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1. ' +
      'Ambient flags (NODE_ENV=test, CI=true, or npm test) do NOT grant mutation authorization.'
    );
  }

  const pgDb = ctx.pgDatabase?.trim();
  if (!pgDb || !isAllowedTestDbName(pgDb)) {
    throw new Error(
      `Refusing database mutations: PostgreSQL target "${pgDb}" is not an approved isolated test database. ` +
      'Target must match approved test pattern (e.g. ephurin_report_e2e_<run_id>) and cannot be "ephurin" or production/demo names.'
    );
  }

  const mongoDb = ctx.mongoDatabase?.trim();
  if (!mongoDb || !isAllowedTestDbName(mongoDb)) {
    throw new Error(
      `Refusing database mutations: MongoDB target "${mongoDb}" is not an approved isolated test database. ` +
      'Target must match approved test pattern (e.g. ephurin_report_e2e_<run_id>) and cannot be "ephurin" or production/demo names.'
    );
  }

  if (ctx.expectedDbName) {
    const expected = ctx.expectedDbName.trim();
    if (pgDb !== expected) {
      throw new Error(
        `Refusing database mutations: PostgreSQL database "${pgDb}" does not match expected isolated test DB "${expected}".`
      );
    }
    if (mongoDb !== expected) {
      throw new Error(
        `Refusing database mutations: MongoDB database "${mongoDb}" does not match expected isolated test DB "${expected}".`
      );
    }
  }
}

/**
 * Live preflight helper for mutating tests/runners.
 * Resolves PostgreSQL identity via `SELECT current_database(), inet_server_addr(), inet_server_port()`
 * and MongoDB identity from the active database handle, then verifies isolation.
 */
export async function validateTestDatabaseIsolation(
  pool: Pool,
  mongoDb: Db,
  options?: { expectedDbName?: string }
): Promise<DatabaseIsolationInfo> {
  const pgRes = await pool.query(
    'SELECT current_database() AS current_db, inet_server_addr() AS server_addr, inet_server_port() AS server_port'
  );
  if (pgRes.rowCount === 0) {
    throw new Error('Failed to query PostgreSQL server identity.');
  }

  const pgDb = pgRes.rows[0].current_db as string;
  const pgAddr = pgRes.rows[0].server_addr ? String(pgRes.rows[0].server_addr) : null;
  const pgPort = pgRes.rows[0].server_port ? Number(pgRes.rows[0].server_port) : null;
  const mongoDbName = mongoDb.databaseName;

  assertTestDatabaseIsolation({
    pgDatabase: pgDb,
    mongoDatabase: mongoDbName,
    expectedDbName: options?.expectedDbName ?? process.env.EXPECTED_TEST_DB_NAME
  });

  return {
    postgresDb: pgDb,
    postgresServerAddr: pgAddr,
    postgresServerPort: pgPort,
    mongoDb: mongoDbName,
    isIsolated: true,
    optInVerified: true
  };
}
