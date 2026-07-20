import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import type { DeviceTokenInput, ListNotificationsInput } from './notifications.schemas.js';
import {
  listNotifications as listNotificationRows,
  markNotificationRead,
  upsertDeviceToken
} from './notifications.repository.js';

function buildMeta(totalItems: number, page: number, limit: number) {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit)
  };
}

export async function listMyNotifications(auth: AuthContext, input: ListNotificationsInput) {
  const result = await listNotificationRows(auth.userId, input);

  return {
    data: result.items,
    meta: buildMeta(result.totalItems, input.page, input.limit)
  };
}

export async function readNotification(auth: AuthContext, notificationId: string) {
  const notification = await markNotificationRead(auth.userId, notificationId);

  if (!notification) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  return notification;
}

export async function registerDeviceToken(auth: AuthContext, input: DeviceTokenInput) {
  return upsertDeviceToken(auth.userId, input);
}
