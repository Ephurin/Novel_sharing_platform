import { createApp } from './app.js';
import { env } from './core/config/env.js';
import { connectDatabases, disconnectDatabases } from './core/database/database.js';
import { logger } from './core/logger/logger.js';
import { startOutboxProcessor, stopOutboxProcessor } from './jobs/outbox-processor.js';

const app = createApp();

if (env.DB_CONNECT_ON_START) {
  await connectDatabases();
  startOutboxProcessor();
}

const server = app.listen(env.PORT, () => {
  logger.info(`Ephurin API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down API server`);
  stopOutboxProcessor();

  server.close(async () => {
    await disconnectDatabases();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
