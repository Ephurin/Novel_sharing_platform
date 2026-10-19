import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';

export async function withAutonomousRunLock<T>(runId: string, step: () => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
  let locked = false;
  try {
    const result = await client.query('select pg_try_advisory_lock(hashtextextended($1, 0)) as locked', [`auto:${runId}`]);
    locked = result.rows[0].locked === true;
    if (!locked) throw new AppError(409, 'RUN_STEP_BUSY', 'Full auto is already processing this run');
    return await step();
  } finally {
    try {
      if (locked) await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [`auto:${runId}`]);
    } finally { client.release(); }
  }
}

export async function listRunningAutonomousRuns() {
  try {
    const result = await getPostgresPool().query(
      `select r.id as run_id, n.author_id from narrative.autonomous_runs r
       join novels n on n.novel_id = r.novel_id
       where r.status = 'running' order by r.updated_at limit 10`);
    return result.rows as { run_id: string; author_id: string }[];
  } catch (error) {
    // Supports installations before narrative migrations are deployed.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') return [];
    throw error;
  }
}
