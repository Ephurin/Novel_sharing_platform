import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { requireAuth } from '../../core/security/auth.middleware.js';
import {
  likePublishedNovel,
  unlikePublishedNovel,
  followPublishedAuthor,
  unfollowPublishedAuthor
} from './social.service.js';
import {
  createComment,
  updateComment,
  deleteComment
} from './comments.service.js';
import {
  getPreferences,
  savePreferences
} from '../reading/reading.service.js';

describe('Phase C: Reader Social, Comment, and Preferences Invariants', () => {
  const pool = getPostgresPool();
  let authorId: string;
  let reader1Id: string;
  let reader2Id: string;
  let reader1Auth: AuthContext;
  let reader2Auth: AuthContext;

  let publishedNovelId: string;
  let publishedChapterId: string;
  let draftNovelId: string;
  let draftChapterId: string;

  before(async () => {
    await validateTestDatabaseIsolation(pool,getMongoDatabase());
    const timestamp = Date.now();

    // 1. Create Author
    const authorRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'AUTHOR', 'ACTIVE')
       returning user_id`,
      [`author-social-${timestamp}@ephurin.com`, `author_soc_${timestamp}`]
    );
    authorId = authorRes.rows[0].user_id;

    // 2. Create Reader 1
    const reader1Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reader1-social-${timestamp}@ephurin.com`, `reader1_soc_${timestamp}`]
    );
    reader1Id = reader1Res.rows[0].user_id;
    reader1Auth = { userId: reader1Id, role: 'READER' };

    // 3. Create Reader 2
    const reader2Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reader2-social-${timestamp}@ephurin.com`, `reader2_soc_${timestamp}`]
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
        `Published Social Test Novel ${timestamp}`,
        `pub-soc-test-${timestamp}`,
        `Synopsis for published social test novel.`
      ]
    );
    publishedNovelId = pubNovelRes.rows[0].novel_id;

    const pubChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Published chapter 1 content for social.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [publishedNovelId, `Published Social Chapter 1 ${timestamp}`]
    );
    publishedChapterId = pubChapRes.rows[0].chapter_id;

    // 5. Create Draft Novel + Draft Chapter
    const draftNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [
        authorId,
        `Draft Social Test Novel ${timestamp}`,
        `draft-soc-test-${timestamp}`,
        `Synopsis for draft novel.`
      ]
    );
    draftNovelId = draftNovelRes.rows[0].novel_id;

    const draftChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins)
       values ($1, $2, 1, 'Draft chapter 1 content.', 'DRAFT', false, 0)
       returning chapter_id`,
      [draftNovelId, `Draft Social Chapter 1 ${timestamp}`]
    );
    draftChapterId = draftChapRes.rows[0].chapter_id;
  });

  after(async () => {
    // Cleanup MongoDB comments
    try {
      await getMongoDatabase().collection('comments').deleteMany({
        userId: { $in: [reader1Id, reader2Id] }
      });
    } catch {
      // ignore
    }

    // Cleanup PostgreSQL
    await pool.query('delete from reading_preferences where user_id in ($1, $2)', [reader1Id, reader2Id]);
    await pool.query('delete from likes where user_id in ($1, $2)', [reader1Id, reader2Id]);
    await pool.query('delete from follows where follower_id in ($1, $2)', [reader1Id, reader2Id]);
    await pool.query('delete from chapters where novel_id in ($1, $2)', [publishedNovelId, draftNovelId]);
    await pool.query('delete from novels where novel_id in ($1, $2)', [publishedNovelId, draftNovelId]);
    await pool.query('delete from users where user_id in ($1, $2, $3)', [authorId, reader1Id, reader2Id]);

    await disconnectMongo();
    await disconnectPostgres();
  });

  test('Invariant 1: anonymous like/follow/comment mutations are rejected by auth (401)', () => {
    let errAnonymous: any = null;
    let nextCalled = false;
    const reqAnonymous = {
      header: (_name: string) => undefined,
      headers: {}
    } as any;
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

  test('Invariant 2: duplicate like -> 409 INTERACTION_001', async () => {
    const firstLike = await likePublishedNovel(reader1Auth, publishedNovelId);
    assert.equal(firstLike.liked, true);
    assert.equal(firstLike.novelId, publishedNovelId);

    await assert.rejects(
      async () => {
        await likePublishedNovel(reader1Auth, publishedNovelId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'INTERACTION_001');
        return true;
      }
    );
  });

  test('Invariant 3: unlike without existing like -> 404 INTERACTION_002', async () => {
    // Reader 2 has not liked the novel
    await assert.rejects(
      async () => {
        await unlikePublishedNovel(reader2Auth, publishedNovelId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'INTERACTION_002');
        return true;
      }
    );
  });

  test('Invariant 4: duplicate follow -> 409 INTERACTION_001', async () => {
    const firstFollow = await followPublishedAuthor(reader1Auth, authorId);
    assert.equal(firstFollow.following, true);
    assert.equal(firstFollow.authorId, authorId);

    await assert.rejects(
      async () => {
        await followPublishedAuthor(reader1Auth, authorId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'INTERACTION_001');
        return true;
      }
    );
  });

  test('Invariant 5: unfollow without existing follow -> 404 INTERACTION_002', async () => {
    // Reader 2 has not followed the author
    await assert.rejects(
      async () => {
        await unfollowPublishedAuthor(reader2Auth, authorId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 404);
        assert.equal(err.code, 'INTERACTION_002');
        return true;
      }
    );
  });

  test("Invariant 6: reader cannot edit/delete another user's comment -> 403 AUTH_008", async () => {
    const comment = await createComment(reader1Auth, publishedChapterId, {
      content: 'Unique comment by Reader 1'
    });
    assert.ok(comment.commentId);

    // Reader 2 tries to edit Reader 1's comment
    await assert.rejects(
      async () => {
        await updateComment(reader2Auth, comment.commentId, {
          content: 'Malicious edit by Reader 2'
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 403);
        assert.equal(err.code, 'AUTH_008');
        return true;
      }
    );

    // Reader 2 tries to delete Reader 1's comment
    await assert.rejects(
      async () => {
        await deleteComment(reader2Auth, comment.commentId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 403);
        assert.equal(err.code, 'AUTH_008');
        return true;
      }
    );
  });

  test('Invariant 7: clean comment -> APPROVED without moderation review', async () => {
    const cleanComment = await createComment(reader1Auth, publishedChapterId, {
      content: 'This is an entirely clean and respectful reader comment'
    });
    assert.equal(cleanComment.status, 'APPROVED');
    assert.equal(cleanComment.moderationReviewId, null);
  });

  test('Invariant 8: filtered comment -> PENDING_MODERATION with review ID', async () => {
    const filteredComment = await createComment(reader1Auth, publishedChapterId, {
      content: 'This comment contains harassment which triggers filter'
    });
    assert.equal(filteredComment.status, 'PENDING_MODERATION');
    assert.ok(filteredComment.moderationReviewId, 'Must have non-null moderationReviewId');
  });

  test('Invariant 9: commenting on non-reader-visible/non-published chapter must fail closed (404)', async () => {
    await assert.rejects(
      async () => {
        await createComment(reader1Auth, draftChapterId, {
          content: 'Comment on draft chapter'
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

  test('Invariant 10: reading preferences are user-scoped', async () => {
    // Reader 1 saves custom preferences
    await savePreferences(reader1Auth, {
      fontFamily: 'Georgia',
      fontSize: 22,
      background: 'SEPIA',
      lineHeight: 2.1
    });

    const reader1Prefs = await getPreferences(reader1Auth);
    assert.equal(reader1Prefs.fontFamily, 'Georgia');
    assert.equal(reader1Prefs.fontSize, 22);
    assert.equal(reader1Prefs.background, 'SEPIA');
    assert.equal(reader1Prefs.lineHeight, 2.1);

    // Reader 2 gets preferences -> should NOT match reader 1's custom settings
    const reader2Prefs = await getPreferences(reader2Auth);
    assert.notEqual(reader2Prefs.fontFamily, 'Georgia');
    assert.notEqual(reader2Prefs.background, 'SEPIA');
  });
});
