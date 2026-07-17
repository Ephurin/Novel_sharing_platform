import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../logger/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPostgresPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL
    });
  }

  return pool;
}

export async function connectPostgres() {
  const postgresPool = getPostgresPool();
  await postgresPool.query('select 1');
  logger.info('PostgreSQL connection ready');
}

export async function disconnectPostgres() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
  logger.info('PostgreSQL connection closed');
}
