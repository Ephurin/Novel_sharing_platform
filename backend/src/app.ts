import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './core/config/env.js';
import { errorMiddleware } from './core/middleware/error.middleware.js';
import { notFoundMiddleware } from './core/middleware/not-found.middleware.js';
import { successResponse } from './core/response/response.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get(`${env.API_PREFIX}/health`, (_request, response) => {
    response.json(
      successResponse({
        status: 'OK',
        service: 'ephurin-backend'
      })
    );
  });

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
