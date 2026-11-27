import { publishDueChapters } from './modules/novels/chapter-schedules.js';
import { drainAdminJobs } from './modules/admin/admin-jobs.js';
import { deliverDomainNotifications } from './modules/interactions/domain-notifications.js';
import { pruneDiscussionViewKeys } from './modules/discussions/discussions.write.js';
import { createApp } from './app.js';
import { env } from './core/config/env.js';
import { connectDatabases, disconnectDatabases } from './core/database/database.js';
import { logger } from './core/logger/logger.js';
import { appealGoogleWindowMs, pruneExpiredAppealGoogleRateLimits } from './core/security/appeal-google-rate-limit.js';
import { startOutboxProcessor, stopOutboxProcessor } from './jobs/outbox-processor.js';

const app = createApp();
let scheduleTimer: ReturnType<typeof setInterval> | undefined;
let notificationTimer: ReturnType<typeof setInterval> | undefined;
let adminTimer: ReturnType<typeof setInterval> | undefined;
let discussionRetentionTimer: ReturnType<typeof setInterval> | undefined;
let appealRateLimitRetentionTimer: ReturnType<typeof setInterval> | undefined;

const pruneViewKeys = () => {
  void pruneDiscussionViewKeys().catch(error => logger.error({ err: error }, 'Could not prune discussion view keys'));
};

const pruneAppealRateLimits = () => {
  void pruneExpiredAppealGoogleRateLimits().catch(error => logger.error({ err: error }, 'Could not prune Google appeal rate limits'));
};

if (env.DB_CONNECT_ON_START) {
  await connectDatabases();
  adminTimer = setInterval(() => void drainAdminJobs().catch((error) => logger.error(error)), 5000);
  void drainAdminJobs().catch((error) => logger.error(error));
  startOutboxProcessor();
  scheduleTimer = setInterval(() => void publishDueChapters(), 10000);
  void publishDueChapters();
  notificationTimer = setInterval(() => void deliverDomainNotifications(), 5000);
  void deliverDomainNotifications();
  discussionRetentionTimer = setInterval(pruneViewKeys, 86_400_000);
  pruneViewKeys();
  appealRateLimitRetentionTimer = setInterval(pruneAppealRateLimits, appealGoogleWindowMs);
  pruneAppealRateLimits();
}

const server = app.listen(env.PORT, () => {
  logger.info(`StoryCraft API listening on port ${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down API server`);
  stopOutboxProcessor();
  if (scheduleTimer) clearInterval(scheduleTimer);
  if (notificationTimer) clearInterval(notificationTimer);
  if (adminTimer) clearInterval(adminTimer);
  if (discussionRetentionTimer) clearInterval(discussionRetentionTimer);
  if (appealRateLimitRetentionTimer) clearInterval(appealRateLimitRetentionTimer);

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
