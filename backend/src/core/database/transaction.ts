import type { PoolClient } from 'pg';
import { getPostgresPool } from './postgres.js';

export async function withPostgresTransaction<TResult>(
  callback: (client: PoolClient) => Promise<TResult>
) {
  const client = await getPostgresPool().connect();

  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
