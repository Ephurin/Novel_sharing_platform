import { Router } from 'express';
import { requireAuth } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  listNotificationsController,
  readNotificationController,
  registerDeviceTokenController
} from './notifications.controller.js';
import {
  deviceTokenSchema,
  listNotificationsSchema,
  notificationIdParamSchema
} from './notifications.schemas.js';

export const notificationRoutes = Router();

notificationRoutes.get('/notifications', requireAuth, validateRequest(listNotificationsSchema), listNotificationsController);
notificationRoutes.patch(
  '/notifications/:notificationId/read',
  requireAuth,
  validateRequest(notificationIdParamSchema),
  readNotificationController
);
notificationRoutes.post('/notifications/device-token', requireAuth, validateRequest(deviceTokenSchema), registerDeviceTokenController);
