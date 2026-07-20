import { MongoClient } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../logger/logger.js';
import { ensureCommentIndexes } from '../../modules/interactions/comments.repository.js';
import { ensureNotificationIndexes } from '../../modules/interactions/notifications.repository.js';
import { ensureDraftChapterIndexes } from '../../modules/novels/draft-chapters.repository.js';

let client: MongoClient | null = null;

export function getMongoClient() {
  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
  }

  return client;
}

export function getMongoDatabase() {
  return getMongoClient().db();
}

export async function connectMongo() {
  const mongoClient = getMongoClient();
  await mongoClient.connect();
  await mongoClient.db().command({ ping: 1 });
  await Promise.all([ensureDraftChapterIndexes(), ensureCommentIndexes(), ensureNotificationIndexes()]);
  logger.info('MongoDB connection ready');
}

export async function disconnectMongo() {
  if (!client) {
    return;
  }

  await client.close();
  client = null;
  logger.info('MongoDB connection closed');
}
