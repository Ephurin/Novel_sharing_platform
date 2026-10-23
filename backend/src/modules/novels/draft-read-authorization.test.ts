import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { getChapter, listChapters } from './chapters.service.js';
import { getChapterController, listChaptersController } from './chapters.controller.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from './chapter-writer.js';

test('private read boundaries deny before Mongo; controllers require trusted actor', async () => {
  const pool = getPostgresPool();
  const original = pool.query;
  const db = getMongoDatabase();
  const collection = db.collection;
  let mongoReads = 0;
  db.collection = (() => { mongoReads++; throw new Error('unauthorized Mongo read'); }) as typeof db.collection;
  try {
    for (const scenario of [
      { auth: undefined, status: 401 },
      { auth: { userId: 'A', role: 'READER' }, status: 403 },
      { auth: { userId: 'B', role: 'AUTHOR' }, status: 403 },
      { auth: { userId: 'A', role: 'AUTHOR' }, status: 403, accountStatus: 'LOCKED' },
      { auth: { userId: 'A', role: 'ADMIN' }, status: 403, accountRole: 'AUTHOR' },
      { auth: { userId: 'A', role: 'AUTHOR' }, status: 401, missingUser: true },
      { auth: { userId: 'A', role: 'ADMIN' }, status: 404, missingNovel: true }
    ]) {
      pool.query = (async (sql: string) => ({
        rows: sql.includes('from users')
          ? scenario.missingUser ? [] : [{ user_id: scenario.auth?.userId, role: scenario.accountRole ?? scenario.auth?.role, status: scenario.accountStatus ?? 'ACTIVE' }]
          : sql.includes('from chapters') ? [{ chapter_id: 'C', novel_id: 'N' }]
          : scenario.missingNovel ? [] : [{ novel_id: 'N', author_id: 'A', status: 'DRAFT' }]
      })) as typeof pool.query;
      await assert.rejects(() => getChapter('C', scenario.auth as any), (e: any) => e.httpStatus === scenario.status);
    }

    // Public list chapters for reader/anonymous must never read Mongo draft
    pool.query = (async (sql: string) => {
      if (sql.includes('from novels')) return { rows: [{ novel_id: 'N', author_id: 'A', status: 'PUBLISHED' }] };
      if (sql.includes('from chapters')) return { rows: [{ chapter_id: 'C1', novel_id: 'N', status: 'PUBLISHED', chapter_number: 1 }] };
      return { rows: [] };
    }) as typeof pool.query;
    const publicChapters = await listChapters('N', undefined);
    assert.equal(publicChapters.length, 1);
    assert.equal(publicChapters[0].content, null);

    // Controller guards
    let error: any;
    await getChapterController(
      { params: { chapterId: 'C' }, body: { userId: 'A' }, query: { authorId: 'A' } } as unknown as Request,
      { json() { throw new Error('private response emitted'); } } as unknown as Response,
      ((e: unknown) => { error = e; }) as NextFunction
    );
    assert.equal(error?.httpStatus, 401);

    assert.equal(mongoReads, 0);
  } finally {
    pool.query = original;
    db.collection = collection;
    await disconnectPostgres();
    await disconnectMongo();
    await disconnectChapterWriter();
  }
});
