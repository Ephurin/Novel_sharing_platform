import { getMongoDatabase } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { disconnectMongo } from '../../core/database/mongo.js';
import { checkContent, resolveModerationReview } from './content-control.service.js';
import { submitPublish } from '../novels/novels.service.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { requireRoles } from '../../core/security/auth.middleware.js';

describe('Phase C: Author Publish -> Admin Moderation Lifecycle Invariants', () => {
  const pool = getPostgresPool();
  let authorId: string;
  let adminId: string;
  let readerId: string;
  let novelId: string;
  let authorAuth: AuthContext;
  let adminAuth: AuthContext;
  let readerAuth: AuthContext;

  before(async () => {
    await validateTestDatabaseIsolation(pool,getMongoDatabase());
    const timestamp = Date.now();
    // 1. Create Author
    const authorRes = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'AUTHOR')
       returning user_id`,
      [`author-test-${timestamp}@ephurin.com`, `author_${timestamp}`]
    );
    authorId = authorRes.rows[0].user_id;
    authorAuth = { userId: authorId, role: 'AUTHOR' };

    // 2. Create Admin
    const adminRes = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'ADMIN')
       returning user_id`,
      [`admin-test-${timestamp}@ephurin.com`, `admin_${timestamp}`]
    );
    adminId = adminRes.rows[0].user_id;
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')",[adminId]);
    adminAuth = { userId: adminId, role: 'ADMIN',adminScope:'SUPER_ADMIN' };

    // 3. Create Reader
    const readerRes = await pool.query(
      `insert into users (email, username, password_hash, role)
       values ($1, $2, 'dummy-hash', 'READER')
       returning user_id`,
      [`reader-test-${timestamp}@ephurin.com`, `reader_${timestamp}`]
    );
    readerId = readerRes.rows[0].user_id;
    readerAuth = { userId: readerId, role: 'READER' };

    // 4. Create Novel with keyword 'harassment'
    const novelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [
        authorId,
        `E2E Moderation Lifecycle Deterministic ${timestamp}`,
        `e2e-moderation-lifecycle-${timestamp}`,
        `This novel contains the harassment test token for keyword moderation.`
      ]
    );
    novelId = novelRes.rows[0].novel_id;
  });

  after(async () => {
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('Checkpoint 1: Reader/Author cannot access Admin moderation resolve route (403)', () => {
    const guard = requireRoles(['ADMIN']);
    let errAuthor: any = null;
    let nextCalledAuthor = false;
    const reqAuthor = { auth: authorAuth } as any;
    const res = {} as any;

    guard(reqAuthor, res, (err?: any) => {
      if (err) errAuthor = err;
      else nextCalledAuthor = true;
    });

    assert.equal(nextCalledAuthor, false);
    assert.ok(errAuthor instanceof AppError);
    assert.equal(errAuthor.httpStatus, 403);
    assert.equal(errAuthor.code, 'AUTH_008');

    let errReader: any = null;
    let nextCalledReader = false;
    const reqReader = { auth: readerAuth } as any;

    guard(reqReader, res, (err?: any) => {
      if (err) errReader = err;
      else nextCalledReader = true;
    });

    assert.equal(nextCalledReader, false);
    assert.ok(errReader instanceof AppError);
    assert.equal(errReader.httpStatus, 403);
    assert.equal(errReader.code, 'AUTH_008');
  });

  test('Checkpoint 2 & 4: Submitting novel triggers moderation, returns reviewId, and does not produce duplicate open reviews', async () => {
    // First submit: should trigger moderation
    const submitResult1 = await submitPublish(authorAuth, novelId);
    assert.equal(submitResult1.moderationRequired, true);
    assert.equal(submitResult1.status, 'PENDING_MODERATION');
    assert.ok(submitResult1.moderationReviewId);

    const reviewId1 = submitResult1.moderationReviewId;

    // Direct checkContent on the same target while review is open must return existing review
    const checkResult2 = await checkContent({
      targetType: 'NOVEL',
      targetId: novelId,
      content: 'Title\nharassment token',
      submittedBy: authorId
    });
    assert.equal(checkResult2.moderationRequired, true);
    assert.equal(checkResult2.moderationReviewId, reviewId1, 'Must return the same open reviewId without duplicating');

    // Verify DB count of open reviews for this novel is exactly 1
    const reviewCountRes = await pool.query(
      `select count(*)::int as count from moderation_reviews where target_id = $1 and status = 'PENDING'`,
      [novelId]
    );
    assert.equal(reviewCountRes.rows[0].count, 1);
  });

  test('Checkpoint 5: An unrelated pending review cannot satisfy approval of target novel', async () => {
    const timestamp = Date.now();
    // Create an unrelated novel
    const otherNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [
        authorId,
        `Unrelated Novel ${timestamp}`,
        `unrelated-novel-${timestamp}`,
        `Another synopsis containing harassment keyword.`
      ]
    );
    const otherNovelId = otherNovelRes.rows[0].novel_id;
    const otherSubmit = await submitPublish(authorAuth, otherNovelId);
    assert.ok(otherSubmit.moderationReviewId);

    // Resolve the other review
    const otherResolve = await resolveModerationReview(adminAuth, otherSubmit.moderationReviewId!, {
      decision: 'APPROVED'
    });
    assert.equal(otherResolve.status, 'APPROVED');

    // Verify target novel is STILL in PENDING_MODERATION
    const targetNovelRes = await pool.query(
      `select status, published_at from novels where novel_id = $1`,
      [novelId]
    );
    assert.equal(targetNovelRes.rows[0].status, 'PENDING_MODERATION');
    assert.equal(targetNovelRes.rows[0].published_at, null);
  });

  test('Checkpoint 2: Resolving review approves novel; duplicate resolve fails closed with 409', async () => {
    // Find target review
    const reviewRes = await pool.query(
      `select review_id from moderation_reviews where target_id = $1 and status = 'PENDING'`,
      [novelId]
    );
    const reviewId = reviewRes.rows[0].review_id;

    // 1. First resolve: APPROVE
    const resolveResult = await resolveModerationReview(adminAuth, reviewId, {
      decision: 'APPROVED'
    });
    assert.equal(resolveResult.status, 'APPROVED');

    // Verify novel status in DB
    const novelAfterRes = await pool.query(
      `select status, published_at from novels where novel_id = $1`,
      [novelId]
    );
    assert.equal(novelAfterRes.rows[0].status, 'PUBLISHED');
    assert.ok(novelAfterRes.rows[0].published_at !== null);

    // 2. Duplicate resolve: must fail closed with 409 (ADMIN_002)
    await assert.rejects(
      async () => {
        await resolveModerationReview(adminAuth, reviewId, { decision: 'APPROVED' });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'ADMIN_002');
        return true;
      }
    );
  });

  test('Checkpoint 3: Already-PUBLISHED novel cannot be resubmitted through normal author publish flow (409)', async () => {
    await assert.rejects(
      async () => {
        await submitPublish(authorAuth, novelId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'CONTENT_004');
        return true;
      }
    );
  });
});
