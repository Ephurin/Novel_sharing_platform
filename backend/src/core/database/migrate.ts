import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disconnectPostgres, getPostgresPool } from './postgres.js';
import { logger } from '../logger/logger.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const migrationsDirectory = path.join(currentDirectory, 'migrations');

async function ensureMigrationTable() {
  await getPostgresPool().query(`
    create table if not exists schema_migrations (
      migration_id varchar(255) primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function hasMigrationRun(migrationId: string) {
  const result = await getPostgresPool().query(
    'select 1 from schema_migrations where migration_id = $1',
    [migrationId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function runMigration(fileName: string) {
  const migrationId = fileName;

  if (await hasMigrationRun(migrationId)) {
    logger.info(`Skipping migration ${migrationId}`);
    return;
  }

  const sql = await readFile(path.join(migrationsDirectory, fileName), 'utf8');
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (migration_id) values ($1)', [migrationId]);
    await client.query('commit');
    logger.info(`Applied migration ${migrationId}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  await ensureMigrationTable();
  const files = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of files) {
    await runMigration(fileName);
  }

  await disconnectPostgres();
}

await migrate();
