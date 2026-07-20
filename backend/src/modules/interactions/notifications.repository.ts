import { createHash, randomUUID } from 'node:crypto';
import { getMongoDatabase } from '../../core/database/mongo.js';
import type { DeviceTokenInput, ListNotificationsInput } from './notifications.schemas.js';

export type NotificationStatus = 'UNREAD' | 'READ';

function notificationsCollection() {
  return getMongoDatabase().collection('notifications');
}

function deviceTokensCollection() {
  return getMongoDatabase().collection('device_tokens');
}

export async function ensureNotificationIndexes() {
  await notificationsCollection().createIndex({ notificationId: 1 }, { unique: true });
  await notificationsCollection().createIndex({ userId: 1, status: 1, createdAt: -1 });
  await notificationsCollection().createIndex({ type: 1, createdAt: -1 });
  await deviceTokensCollection().createIndex({ userId: 1, active: 1 });
  await deviceTokensCollection().createIndex({ deviceTokenHash: 1 }, { unique: true });
}

function mapNotification(document: any) {
  return {
    notificationId: document.notificationId,
    userId: document.userId,
    type: document.type,
    status: document.status,
    title: document.title,
    content: document.content,
    payload: document.payload ?? {},
    createdAt: document.createdAt,
    readAt: document.readAt ?? null
  };
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  content: string;
  payload?: Record<string, unknown>;
}) {
  const now = new Date();
  const document = {
    notificationId: randomUUID(),
    userId: input.userId,
    type: input.type,
    status: 'UNREAD' as NotificationStatus,
    title: input.title,
    content: input.content,
    payload: input.payload ?? {},
    push: {
      provider: null,
      sent: false,
      sentAt: null,
      error: null
    },
    createdAt: now,
    readAt: null
  };

  await notificationsCollection().insertOne(document);
  return mapNotification(document);
}

export async function listNotifications(userId: string, input: ListNotificationsInput) {
  const filter = {
    userId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {})
  };
  const skip = (input.page - 1) * input.limit;
  const [items, totalItems] = await Promise.all([
    notificationsCollection().find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).toArray(),
    notificationsCollection().countDocuments(filter)
  ]);

  return {
    items: items.map(mapNotification),
    totalItems
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await notificationsCollection().findOneAndUpdate(
    { userId, notificationId },
    {
      $set: {
        status: 'READ',
        readAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  return result ? mapNotification(result) : null;
}

export async function upsertDeviceToken(userId: string, input: DeviceTokenInput) {
  const now = new Date();
  const deviceTokenHash = createHash('sha256').update(input.deviceToken).digest('hex');
  await deviceTokensCollection().updateOne(
    { deviceTokenHash },
    {
      $set: {
        userId,
        provider: input.provider,
        platform: input.platform,
        active: true,
        updatedAt: now,
        lastUsedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return {
    provider: input.provider,
    platform: input.platform,
    registered: true
  };
}
