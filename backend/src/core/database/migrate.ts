
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PoolClient } from 'pg';
import { disconnectPostgres, getPostgresPool } from './postgres.js';
import { logger } from '../logger/logger.js';
import { backfillUrlIdentifiers } from './url-identifiers.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const migrationLock = 'storycraft:schema-migrations';
const urlConstraintGate = '054_url_identifiers_require_values.sql';

export async function runPostgresMigrations(client: PoolClient, directory = migrationsDirectory) {
  await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [migrationLock]);
  try {
    await client.query(`
      create table if not exists schema_migrations (
        migration_id varchar(255) primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      const applied = await client.query('select 1 from schema_migrations where migration_id = $1', [file]);
      if (applied.rowCount) continue;

      // An upgrade can jump directly to a release containing both migrations.
      // Backfill commits its own batches before beginning any constraint migration.
      if (file === urlConstraintGate) await backfillUrlIdentifiers(client);

      const sql = await readFile(path.join(directory, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (migration_id) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
      logger.info(`Applied migration ${file}`);
    }
  } finally {
    await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [migrationLock]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = await getPostgresPool().connect();
  try {
    await runPostgresMigrations(client);
  } finally {
    client.release();
    await disconnectPostgres();
  }
}
