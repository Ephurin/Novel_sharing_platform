import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectMongo, disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { disconnectChapterWriter } from './chapter-writer.js';
import {
  syncDraftFromRevisionConditional,
  findDraftChapterByChapterId,
  upsertDraftChapter,
} from './draft-chapters.repository.js';

describe('Live MongoDB Draft Reconciliation Probe (P6.5 Hardening)', () => {
  const testChapterId = randomUUID();
  const testNovelId = randomUUID();
  const testAuthorId = randomUUID();
  const recoveryChapterId = randomUUID();
  const ownedChapterIds = new Set([testChapterId]);
  let cleanupAuthorized = false;

  async function cleanupOwnedDrafts() {
    const db = getMongoDatabase();
    await db.collection('draft_chapters').deleteMany({ chapterId: { $in: [...ownedChapterIds] } });
  }

  before(async () => {
    // Authorize actual targets before indexes, fixture writes or cleanup.
    await validateTestDatabaseIsolation(getPostgresPool(), getMongoDatabase());
    cleanupAuthorized = true; // Admission precedes connection/index creation, which may partially fail.
    await connectMongo();
  });

  after(async () => {
    try {
      if (cleanupAuthorized) {
        await cleanupOwnedDrafts();
        assert.equal(await getMongoDatabase().collection('draft_chapters').countDocuments({
          chapterId: { $in: [testChapterId, recoveryChapterId] }
        }), 0, 'All run-created drafts must be absent after teardown');
      }
    } finally {
      await disconnectMongo();
      await disconnectPostgres();
      await disconnectChapterWriter();
    }
  });

  test('Targeted Probe 1: Older draft is cleanly updated by accepted revision', async () => {
    // 1. Seed initial draft with older timestamp (10 seconds ago)
    const tenSecondsAgo = new Date(Date.now() - 10000);
    await upsertDraftChapter({
      novelId: testNovelId,
      chapterId: testChapterId,
      authorId: testAuthorId,
      title: 'Bản thảo ban đầu',
      content: 'Nội dung ban đầu của tác giả',
      wordCount: 6,
      autosave: false,
    });

    const db = getMongoDatabase();
    await db.collection('draft_chapters').updateOne(
      { chapterId: testChapterId },
      { $set: { updatedAt: tenSecondsAgo } }
    );

    // 2. Sync accepted revision with newer timestamp (5 seconds ago)
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const syncRes = await syncDraftFromRevisionConditional({
      novelId: testNovelId,
      chapterId: testChapterId,
      authorId: testAuthorId,
      revisionId: 'rev-ai-accept-001',
      title: 'Bản thảo cập nhật AI',
      content: 'Nội dung AI đã được tác giả chấp nhận',
      wordCount: 8,
      acceptTimestamp: fiveSecondsAgo,
    });

    assert.equal(syncRes.status, 'synced');
    assert.equal(syncRes.draft?.content, 'Nội dung AI đã được tác giả chấp nhận');
    assert.equal(syncRes.draft?.lastAcceptedRevisionId, 'rev-ai-accept-001');
  });

  test('Targeted Probe 2: Newer manual draft edit is NOT overwritten by delayed revision sync', async () => {
    // 1. Author performs manual edit right now (newer timestamp)
    const manualEditTime = new Date();
    await upsertDraftChapter({
      novelId: testNovelId,
      chapterId: testChapterId,
      authorId: testAuthorId,
      title: 'Tác giả sửa tay mới nhất',
      content: 'Nội dung sửa tay quan trọng vừa viết xong!',
      wordCount: 8,
      autosave: false,
    });

    // 2. A delayed outbox worker runs with older acceptTimestamp (e.g., 20 seconds ago)
    const delayedAcceptTime = new Date(Date.now() - 20000);
    const delayedSync = await syncDraftFromRevisionConditional({
      novelId: testNovelId,
      chapterId: testChapterId,
      authorId: testAuthorId,
      revisionId: 'rev-stale-outbox',
      content: 'Nội dung outbox cũ đến muộn',
      wordCount: 6,
      acceptTimestamp: delayedAcceptTime,
    });

    assert.equal(delayedSync.status, 'skipped_newer_draft');
    assert.equal(delayedSync.draft?.content, 'Nội dung sửa tay quan trọng vừa viết xong!');

    // Verify in DB directly
    const currentDoc = await findDraftChapterByChapterId(testChapterId);
    assert.equal(currentDoc?.content, 'Nội dung sửa tay quan trọng vừa viết xong!');
    assert.notEqual(currentDoc?.lastAcceptedRevisionId, 'rev-stale-outbox');
  });

  test('Targeted Probe 3: No-draft recovery creates document with non-empty novelId and authorId', async () => {
    const freshChapterId = recoveryChapterId;
    ownedChapterIds.add(freshChapterId); // Track before any operation can partially create it.
    const syncNullRes = await syncDraftFromRevisionConditional({
      novelId: testNovelId,
      chapterId: freshChapterId,
      authorId: testAuthorId,
      revisionId: 'rev-recovery-001',
      title: 'Chương phục hồi',
      content: 'Bản thảo ban đầu được phục hồi từ revision',
      wordCount: 8,
      acceptTimestamp: new Date(),
    });

    assert.equal(syncNullRes.status, 'synced');
    assert.ok(syncNullRes.draft);
    assert.equal(syncNullRes.draft.chapterId, freshChapterId);
    assert.equal(syncNullRes.draft.version, 1);
    assert.equal(syncNullRes.draft.novelId, testNovelId);
    assert.equal(syncNullRes.draft.authorId, testAuthorId);
    assert.ok(syncNullRes.draft.novelId.length > 0, 'novelId must not be empty');
    assert.ok(syncNullRes.draft.authorId.length > 0, 'authorId must not be empty');
  });
  test('Targeted Probe 4: Cleanup removes the recovery fixture and preserves an unrelated draft', async () => {
    const db = getMongoDatabase();
    const sentinelId = randomUUID();
    const sentinel = { chapterId: sentinelId, novelId: randomUUID(), authorId: randomUUID(), content: 'FOREIGN_DRAFT_MUST_SURVIVE' };
    await db.collection('draft_chapters').insertOne({ ...sentinel });
    try {
      await cleanupOwnedDrafts();
      // Independent expected identities catch an omitted recovery ownership registration.
      assert.equal(await db.collection('draft_chapters').countDocuments({
        chapterId: { $in: [testChapterId, recoveryChapterId] }
      }), 0, 'Recovery fixture was orphaned by cleanup');
      const stored = await db.collection('draft_chapters').findOne({ chapterId: sentinelId });
      assert.equal(stored?.content, sentinel.content);
      assert.equal(stored?.novelId, sentinel.novelId);
      assert.equal(stored?.authorId, sentinel.authorId);
    } finally {
      await db.collection('draft_chapters').deleteOne({ chapterId: sentinelId });
    }
  });

});
