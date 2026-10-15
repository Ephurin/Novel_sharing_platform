import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { disconnectMongo } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import {
  addToLibrary,
  removeFromLibrary,
  syncHistory,
  getHistoryForNovel,
  listHistory
} from './reading.service.js';

describe('Phase C: Reader Discovery and Reading State Invariants', () => {
  const pool = getPostgresPool();
  let authorId: string;
  let reader1Id: string;
  let reader2Id: string;
  let reader1Auth: AuthContext;
  let reader2Auth: AuthContext;

  let publishedNovelId: string;
  let publishedChapterId: string;
  let otherNovelId: string;
  let otherChapterId: string;
  let draftNovelId: string;
  let draftChapterId: string;

  before(async () => {
    const timestamp = Date.now();

    // 1. Create Author
    const authorRes = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'AUTHOR')
       returning user_id`,
      [`author-reading-${timestamp}@ephurin.com`, `author_rd_${timestamp}`]
    );
    authorId = authorRes.rows[0].user_id;

    // 2. Create Reader 1
    const reader1Res = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'READER')
       returning user_id`,
      [`reader1-reading-${timestamp}@ephurin.com`, `reader1_rd_${timestamp}`]
    );
    reader1Id = reader1Res.rows[0].user_id;
    reader1Auth = { userId: reader1Id, role: 'READER' };

    // 3. Create Reader 2 (for isolation check)
    const reader2Res = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'READER')
       returning user_id`,
      [`reader2-reading-${timestamp}@ephurin.com`, `reader2_rd_${timestamp}`]
    );
    reader2Id = reader2Res.rows[0].user_id;
    reader2Auth = { userId: reader2Id, role: 'READER' };

    // 4. Create Published Novel + Published Chapter
    const pubNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status, published_at)
       values ($1, $2, $3, $4, 'PUBLISHED', now())
       returning novel_id`,
      [
        authorId,
        `Published Reading Test Novel ${timestamp}`,
        `pub-reading-test-${timestamp}`,
        `Synopsis for published reading test novel.`
      ]
    );
    publishedNovelId = pubNovelRes.rows[0].novel_id;

    const pubChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Published chapter 1 content.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [publishedNovelId, `Published Chapter 1 ${timestamp}`]
    );
    publishedChapterId = pubChapRes.rows[0].chapter_id;

    // 5. Create Other Published Novel + Chapter (for mismatch check)
    const otherNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status, published_at)
       values ($1, $2, $3, $4, 'PUBLISHED', now())
       returning novel_id`,
      [
        authorId,
        `Other Reading Test Novel ${timestamp}`,
        `other-reading-test-${timestamp}`,
        `Synopsis for other reading test novel.`
      ]
    );
    otherNovelId = otherNovelRes.rows[0].novel_id;

    const otherChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Other chapter 1 content.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [otherNovelId, `Other Chapter 1 ${timestamp}`]
    );
    otherChapterId = otherChapRes.rows[0].chapter_id;

    // 6. Create Draft Novel + Draft Chapter (for non-published check)
    const draftNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [
        authorId,
        `Draft Reading Test Novel ${timestamp}`,
        `draft-reading-test-${timestamp}`,
        `Synopsis for draft novel.`
      ]
    );
    draftNovelId = draftNovelRes.rows[0].novel_id;

    const draftChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins)
       values ($1, $2, 1, 'Draft chapter 1 content.', 'DRAFT', false, 0)
       returning chapter_id`,
      [draftNovelId, `Draft Chapter 1 ${timestamp}`]
    );
    draftChapterId = draftChapRes.rows[0].chapter_id;
  });

  after(async () => {
    // Cleanup created test records
    await pool.query('delete from reading_histories where user_id in ($1, $2)', [reader1Id, reader2Id]);
    await pool.query('delete from bookmarks where user_id in ($1, $2)', [reader1Id, reader2Id]);
    await pool.query('delete from chapters where novel_id in ($1, $2, $3)', [publishedNovelId, otherNovelId, draftNovelId]);
    await pool.query('delete from novels where novel_id in ($1, $2, $3)', [publishedNovelId, otherNovelId, draftNovelId]);
    await pool.query('delete from users where user_id in ($1, $2, $3)', [authorId, reader1Id, reader2Id]);

    await disconnectMongo();
    await disconnectPostgres();
  });

  test('Invariant 1: anonymous POST /reading/library/me is rejected by auth (401)', () => {
    let errAnonymous: any = null;
    let nextCalled = false;
    const reqAnonymous = {
      header: (_name: string) => undefined,
      headers: {}
    } as any; // No auth header
    const res = {} as any;

    requireAuth(reqAnonymous, res, (err?: any) => {
      if (err) errAnonymous = err;
      else nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.ok(errAnonymous instanceof AppError);
    assert.equal(errAnonymous.httpStatus, 401);
    assert.equal(errAnonymous.code, 'AUTH_002');
  });

  test('Invariant 2: duplicate Add library fails closed with existing conflict contract (409)', async () => {
    // First addition must succeed
    const firstAdd = await addToLibrary(reader1Auth, { novelId: publishedNovelId });
    assert.equal(firstAdd.novelId, publishedNovelId);
    assert.equal(firstAdd.bookmarked, true);

    // Duplicate addition must fail closed with 409 INTERACTION_001
    await assert.rejects(
      async () => {
        await addToLibrary(reader1Auth, { novelId: publishedNovelId });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'INTERACTION_001');
        return true;
      }
    );
  });

  test('Invariant 3: removing a non-existent bookmark fails with existing not-found contract (404)', async () => {
    // Reader 2 has no bookmarks; removing must fail closed with 404 INTERACTION_002
    await assert.rejects(
      async () => {
        await removeFromLibrary(reader2Auth, publishedNovelId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'INTERACTION_002');
        return true;
      }
    );
  });

  test('Invariant 4: history sync rejects mismatched novelId/chapterId (404)', async () => {
    // Attempt to sync history using novelId of Novel A with chapterId of Novel B
    await assert.rejects(
      async () => {
        await syncHistory(reader1Auth, {
          novelId: publishedNovelId,
          chapterId: otherChapterId,
          paragraphIndex: 0,
          pageOffset: 0
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'CONTENT_001');
        return true;
      }
    );
  });

  test('Invariant 5: history is user-scoped: another reader cannot satisfy/read back the target reader\'s state as their own', async () => {
    // Reader 1 syncs history for published novel & chapter
    const syncRes = await syncHistory(reader1Auth, {
      novelId: publishedNovelId,
      chapterId: publishedChapterId,
      paragraphIndex: 0,
      pageOffset: 0
    });
    assert.equal(syncRes.synced, true);

    // Reader 1 can read back their history
    const reader1Hist = await getHistoryForNovel(reader1Auth, publishedNovelId);
    assert.equal(reader1Hist.novelId, publishedNovelId);
    assert.equal(reader1Hist.chapterId, publishedChapterId);

    // Reader 2 must NOT have history for this novel (fails with 404 CONTENT_001)
    await assert.rejects(
      async () => {
        await getHistoryForNovel(reader2Auth, publishedNovelId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'CONTENT_001');
        return true;
      }
    );

    // Reader 2 list history must return 0 items
    const reader2List = await listHistory(reader2Auth, { page: 1, limit: 10 });
    assert.equal(reader2List.data.length, 0);
    assert.equal(reader2List.meta.totalItems, 0);
  });

  test('Invariant 6: non-published novel/chapter cannot be used to create accepted reader state (404)', async () => {
    // Adding draft novel to library must fail with 404 CONTENT_001
    await assert.rejects(
      async () => {
        await addToLibrary(reader1Auth, { novelId: draftNovelId });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'CONTENT_001');
        return true;
      }
    );

    // Syncing history on draft novel & chapter must fail with 404 CONTENT_001
    await assert.rejects(
      async () => {
        await syncHistory(reader1Auth, {
          novelId: draftNovelId,
          chapterId: draftChapterId,
          paragraphIndex: 0,
          pageOffset: 0
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'CONTENT_001');
        return true;
      }
    );
  });
});
