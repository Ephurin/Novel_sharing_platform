
import { disconnectPostgres, getPostgresPool } from '../core/database/postgres.js';
import { backfillUrlIdentifiers } from '../core/database/url-identifiers.js';

const client = await getPostgresPool().connect();
try {
  await backfillUrlIdentifiers(client);
} finally {
  client.release();
  await disconnectPostgres();
}
