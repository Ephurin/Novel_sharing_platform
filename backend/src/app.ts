import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './core/config/env.js';
import { errorMiddleware } from './core/middleware/error.middleware.js';
import { notFoundMiddleware } from './core/middleware/not-found.middleware.js';
import { successResponse } from './core/response/response.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { aiCopilotRoutes } from './modules/ai-copilot/ai-copilot.routes.js';
import { aiGatewayRoutes } from './modules/ai/ai-gateway.routes.js';
import {
  adminModerationRoutes,
  contentControlRoutes,
  reportsRoutes
} from './modules/content-control/content-control.routes.js';
import { commentsRoutes } from './modules/interactions/comments.routes.js';
import { notificationRoutes } from './modules/interactions/notifications.routes.js';
import { socialRoutes } from './modules/interactions/social.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { chaptersRoutes } from './modules/novels/chapters.routes.js';
import { novelsRoutes } from './modules/novels/novels.routes.js';
import { readingRoutes } from './modules/reading/reading.routes.js';
import { storyContextRoutes } from './modules/story-context/story-context.routes.js';
import { authorsRoutes, usersRoutes } from './modules/users/users.routes.js';
import { walletResourceRoutes, walletRoutes } from './modules/wallet/wallet.routes.js';
import { internalGetRevisionController } from './modules/novels/chapter-revisions.controller.js';
import { internalRevisionSchema } from './modules/novels/chapter-revisions.schemas.js';
import { validateRequest } from './core/validation/validate.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = [env.WEB_ORIGIN, 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://localhost:8080'];
        if (allowed.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
        return callback(new Error('CORS not allowed'), false);
      },
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get(`${env.API_PREFIX}/health`, (_request, response) => {
    response.json(
      successResponse({
        status: 'OK',
        service: 'ephurin-backend'
      })
    );
  });

  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/ai`, aiCopilotRoutes);
  app.use(`${env.API_PREFIX}/ai`, aiGatewayRoutes);
  app.use(`${env.API_PREFIX}/users`, usersRoutes);
  app.use(`${env.API_PREFIX}`, storyContextRoutes);
  app.use(`${env.API_PREFIX}/novels`, novelsRoutes);
  app.use(`${env.API_PREFIX}/chapters`, chaptersRoutes);
  app.use(`${env.API_PREFIX}/reading`, readingRoutes);
  app.use(`${env.API_PREFIX}/wallet`, walletRoutes);
  app.use(`${env.API_PREFIX}/content-control`, contentControlRoutes);
  app.use(`${env.API_PREFIX}/reports`, reportsRoutes);
  app.use(`${env.API_PREFIX}/admin`, adminRoutes);
  app.use(`${env.API_PREFIX}/admin/moderation`, adminModerationRoutes);
  app.use(`${env.API_PREFIX}`, authorsRoutes);
  app.use(`${env.API_PREFIX}`, commentsRoutes);
  app.use(`${env.API_PREFIX}`, notificationRoutes);
  app.use(`${env.API_PREFIX}`, socialRoutes);
  app.use(`${env.API_PREFIX}`, walletResourceRoutes);

  // Internal server-to-server endpoints (e.g. AI Service)
  app.get(
    '/internal/v1/revisions/:revisionId',
    validateRequest(internalRevisionSchema),
    internalGetRevisionController
  );

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
