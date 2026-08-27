import { connectMongo, disconnectMongo } from './mongo.js';
import { connectPostgres, disconnectPostgres } from './postgres.js';

export async function connectDatabases() {
  await Promise.all([connectPostgres(), connectMongo()]);
}

export async function disconnectDatabases() {
  await Promise.all([disconnectPostgres(), disconnectMongo()]);
}
