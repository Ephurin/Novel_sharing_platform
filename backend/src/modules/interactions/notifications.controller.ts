import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { listMyNotifications, readNotification, registerDeviceToken } from './notifications.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }
  return request.auth;
}

export const listNotificationsController: RequestHandler = async (request, response, next) => {
  try {
    const result = await listMyNotifications(requireRequestAuth(request), request.query as never);
    response.json(successResponse(result.data, result.meta));
  } catch (error) {
    next(error);
  }
};

export const readNotificationController: RequestHandler = async (request, response, next) => {
  try {
    const result = await readNotification(requireRequestAuth(request), String(request.params.notificationId));
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const registerDeviceTokenController: RequestHandler = async (request, response, next) => {
  try {
    const result = await registerDeviceToken(requireRequestAuth(request), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
