import { createApp } from './app.js';
import { env } from './core/config/env.js';
import { logger } from './core/logger/logger.js';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Ephurin API listening on port ${env.PORT}`);
});
