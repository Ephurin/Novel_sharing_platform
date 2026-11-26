import { setTimeout } from 'node:timers/promises';
import type { Pool, PoolClient } from 'pg';

// Wait for PostgreSQL to confirm the competing transaction reached the gate.
export async function waitForBlockedTransaction(pool: Pool, blocker: PoolClient | number) {
  const blockerPid = typeof blocker === 'number' ? blocker :
    (await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
  const deadline = Date.now() + 5_000;
  do {
    const { rows: [waiter] } = await pool.query<{ pid: number }>(
      `select pid from pg_stat_activity
        where datname=current_database() and $1=any(pg_blocking_pids(pid))
        limit 1`,
      [blockerPid]
    );
    if (waiter) return waiter.pid;
    await setTimeout(20);
  } while (Date.now() < deadline);
  throw new Error('No competing transaction waited on the PostgreSQL gate');
}
