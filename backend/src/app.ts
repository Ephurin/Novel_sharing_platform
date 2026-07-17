import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './core/config/env.js';
import { errorMiddleware } from './core/middleware/error.middleware.js';
import { notFoundMiddleware } from './core/middleware/not-found.middleware.js';
import { successResponse } from './core/response/response.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { chaptersRoutes } from './modules/novels/chapters.routes.js';
import { novelsRoutes } from './modules/novels/novels.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
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
  app.use(`${env.API_PREFIX}/users`, usersRoutes);
  app.use(`${env.API_PREFIX}/novels`, novelsRoutes);
  app.use(`${env.API_PREFIX}/chapters`, chaptersRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
