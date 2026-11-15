import { publishDueChapters } from './modules/novels/chapter-schedules.js';
import { drainAdminJobs } from './modules/admin/admin-jobs.js';
import { deliverDomainNotifications } from './modules/interactions/domain-notifications.js';
import { createApp } from './app.js';
import { env } from './core/config/env.js';
import { connectDatabases, disconnectDatabases } from './core/database/database.js';
import { logger } from './core/logger/logger.js';
import { startOutboxProcessor, stopOutboxProcessor } from './jobs/outbox-processor.js';

const app = createApp();
let scheduleTimer: ReturnType<typeof setInterval> | undefined;
let notificationTimer: ReturnType<typeof setInterval> | undefined;
let adminTimer: ReturnType<typeof setInterval> | undefined;

if (env.DB_CONNECT_ON_START) {
  await connectDatabases();
  adminTimer = setInterval(() => void drainAdminJobs().catch((error) => logger.error(error)), 5000);
  void drainAdminJobs().catch((error) => logger.error(error));
  startOutboxProcessor();
  scheduleTimer = setInterval(() => void publishDueChapters(), 10000);
  void publishDueChapters();
  notificationTimer = setInterval(() => void deliverDomainNotifications(), 5000);
  void deliverDomainNotifications();
}

const server = app.listen(env.PORT, () => {
  logger.info(`Ephurin API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down API server`);
  stopOutboxProcessor();
  if (scheduleTimer) clearInterval(scheduleTimer);
  if (notificationTimer) clearInterval(notificationTimer);
  if (adminTimer) clearInterval(adminTimer);

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
