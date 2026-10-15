import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import {
  createUserReport,
  resolveModerationReview
} from './content-control.service.js';
import {
  findReviewById,
  countReportsForReview,
  listReportsForReview,
  createModerationReview
} from './content-control.repository.js';
import {
  createComment,
  softDeleteComment,
  findCommentById,
  findCommentRecordById
} from '../interactions/comments.repository.js';

function assertSafeTestEnvironment() {
  const isAllowed =
    process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' ||
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    Boolean(process.env.npm_lifecycle_script);
  if (!isAllowed) {
    throw new Error(
      'Refusing to run test mutations without test environment switch. ' +
      'Set EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 or NODE_ENV=test or run under npm test.'
    );
  }
}

describe('Phase C: Comment User Report, Admin Moderation, and Notifications Invariants', () => {
  const pool = getPostgresPool();

  // Explicit ID tracking collections — ensures strictly scoped teardown
  const trackedUserIds = new Set<string>();
  const trackedNovelIds = new Set<string>();
  const trackedChapterIds = new Set<string>();
  const trackedCommentIds = new Set<string>();
  const trackedReviewIds = new Set<string>();
  const trackedReportIds = new Set<string>();

  // Sentinel tracking
  interface SentinelRecord {
    id: string;
    type: string;
    hash: string;
    cleanup: () => Promise<void>;
  }
  const sentinels: SentinelRecord[] = [];

  let adminId: string;
  let ownerId: string;
  let reporter1Id: string;
  let reporter2Id: string;

  let adminAuth: AuthContext;
  let ownerAuth: AuthContext;
  let reporter1Auth: AuthContext;
  let reporter2Auth: AuthContext;

  let publishedNovelId: string;
  let publishedChapterId: string;
  let draftNovelId: string;
  let draftChapterId: string;

  before(async () => {
    assertSafeTestEnvironment();

    const timestamp = Date.now();

    // 1. Create Admin
    const adminRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'ADMIN', 'ACTIVE')
       returning user_id`,
      [`admin-report-${timestamp}@ephurin.com`, `admin_rep_${timestamp}`]
    );
    adminId = adminRes.rows[0].user_id;
    trackedUserIds.add(adminId);
    adminAuth = { userId: adminId, role: 'ADMIN' };

    // 2. Create Comment Owner
    const ownerRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`owner-report-${timestamp}@ephurin.com`, `owner_rep_${timestamp}`]
    );
    ownerId = ownerRes.rows[0].user_id;
    trackedUserIds.add(ownerId);
    ownerAuth = { userId: ownerId, role: 'READER' };

    // 3. Create Reporter 1
    const rep1Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reporter1-report-${timestamp}@ephurin.com`, `rep1_${timestamp}`]
    );
    reporter1Id = rep1Res.rows[0].user_id;
    trackedUserIds.add(reporter1Id);
    reporter1Auth = { userId: reporter1Id, role: 'READER' };

    // 4. Create Reporter 2
    const rep2Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reporter2-report-${timestamp}@ephurin.com`, `rep2_${timestamp}`]
    );
    reporter2Id = rep2Res.rows[0].user_id;
    trackedUserIds.add(reporter2Id);
    reporter2Auth = { userId: reporter2Id, role: 'READER' };

    // 5. Create Published Novel + Free Published Chapter
    const pubNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status, published_at)
       values ($1, $2, $3, $4, 'PUBLISHED', now())
       returning novel_id`,
      [
        adminId,
        `Report Test Novel ${timestamp}`,
        `report-test-${timestamp}`,
        'Test novel for user report moderation'
      ]
    );
    publishedNovelId = pubNovelRes.rows[0].novel_id;
    trackedNovelIds.add(publishedNovelId);

    const pubChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Content of free published chapter.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [publishedNovelId, `Chapter 1 ${timestamp}`]
    );
    publishedChapterId = pubChapRes.rows[0].chapter_id;
    trackedChapterIds.add(publishedChapterId);

    // 6. Create Draft (Unpublished) Novel + Chapter for negative test
    const draftNovelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status)
       values ($1, $2, $3, $4, 'DRAFT')
       returning novel_id`,
      [adminId, `Draft Novel ${timestamp}`, `draft-novel-${timestamp}`, 'Draft novel synopsis']
    );
    draftNovelId = draftNovelRes.rows[0].novel_id;
    trackedNovelIds.add(draftNovelId);

    const draftChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status)
       values ($1, $2, 1, 'Draft content', 'DRAFT')
       returning chapter_id`,
      [draftNovelId, `Draft Chapter 1 ${timestamp}`]
    );
    draftChapterId = draftChapRes.rows[0].chapter_id;
    trackedChapterIds.add(draftChapterId);

    // =========================================================================
    // PLANT SENTINEL RECORDS to verify no unscoped/broad test teardown occurs
    // =========================================================================
    // Sentinel 1: Unrelated COMMENT moderation review in PostgreSQL
    const sRevRes = await pool.query(
      `insert into moderation_reviews (target_type, target_id, source, status)
       values ('COMMENT', $1, 'USER_REPORT', 'PENDING')
       returning review_id, target_id, source, status`,
      [`sentinel-target-${timestamp}`]
    );
    const sRevId = sRevRes.rows[0].review_id;
    const sRevHash = createHash('sha256').update(JSON.stringify(sRevRes.rows[0])).digest('hex');
    sentinels.push({
      id: sRevId,
      type: 'sentinel_review',
      hash: sRevHash,
      cleanup: async () => {
        await pool.query('delete from moderation_reviews where review_id = $1', [sRevId]);
      }
    });

    // Sentinel 2: Unrelated COMMENT report in PostgreSQL
    const sRepRes = await pool.query(
      `insert into reports (reporter_id, target_type, target_id, reason, status)
       values ($1, 'COMMENT', $2, 'Sentinel unrelated report', 'OPEN')
       returning report_id, reporter_id, target_id, status`,
      [adminId, `sentinel-comment-${timestamp}`]
    );
    const sRepId = sRepRes.rows[0].report_id;
    const sRepHash = createHash('sha256').update(JSON.stringify(sRepRes.rows[0])).digest('hex');
    sentinels.push({
      id: sRepId,
      type: 'sentinel_report',
      hash: sRepHash,
      cleanup: async () => {
        await pool.query('delete from reports where report_id = $1', [sRepId]);
      }
    });

    // Sentinel 3: Sentinel report for reporter1 on a DIFFERENT target (novel)
    const sRepReporterRes = await pool.query(
      `insert into reports (reporter_id, target_type, target_id, reason, status)
       values ($1, 'NOVEL', $2, 'Sentinel report for reporter1 on novel', 'OPEN')
       returning report_id, reporter_id, target_id, status`,
      [reporter1Id, publishedNovelId]
    );
    const sRepReporterId = sRepReporterRes.rows[0].report_id;
    const sRepReporterHash = createHash('sha256').update(JSON.stringify(sRepReporterRes.rows[0])).digest('hex');
    sentinels.push({
      id: sRepReporterId,
      type: 'sentinel_reporter_report',
      hash: sRepReporterHash,
      cleanup: async () => {
        await pool.query('delete from reports where report_id = $1', [sRepReporterId]);
      }
    });

    // Sentinel 4: Unrelated comment belonging to the SAME seed owner and chapter in MongoDB
    const sComment = await createComment({
      chapterId: publishedChapterId,
      novelId: publishedNovelId,
      userId: ownerId,
      content: `[SENTINEL PRESERVED] Comment by owner ${timestamp}`
    });
    await getMongoDatabase().collection('comments').updateOne(
      { commentId: sComment.commentId },
      { $set: { status: 'APPROVED' } }
    );
    const sCommentDoc = await getMongoDatabase().collection('comments').findOne({ commentId: sComment.commentId });
    const sCommentHash = createHash('sha256').update(JSON.stringify(sCommentDoc)).digest('hex');
    sentinels.push({
      id: sComment.commentId,
      type: 'sentinel_owner_comment',
      hash: sCommentHash,
      cleanup: async () => {
        await getMongoDatabase().collection('comments').deleteOne({ commentId: sComment.commentId });
      }
    });

    // Sentinel 5: Unrelated notification belonging to reporter1 in MongoDB
    const notifRes = await getMongoDatabase().collection('notifications').insertOne({
      notificationId: randomUUID(),
      userId: reporter1Id,
      type: 'SYSTEM_ANNOUNCEMENT',
      payload: { message: 'Sentinel notification for reporter1' },
      read: false,
      createdAt: new Date()
    });
    const sNotifDoc = await getMongoDatabase().collection('notifications').findOne({ _id: notifRes.insertedId });
    assert.ok(sNotifDoc);
    const sNotifHash = createHash('sha256').update(JSON.stringify(sNotifDoc)).digest('hex');
    sentinels.push({
      id: sNotifDoc.notificationId,
      type: 'sentinel_notification',
      hash: sNotifHash,
      cleanup: async () => {
        await getMongoDatabase().collection('notifications').deleteOne({ _id: notifRes.insertedId });
      }
    });
  });

  after(async () => {
    // 1. Verify all sentinels remain completely unchanged before deleting anything
    for (const s of sentinels) {
      if (s.type === 'sentinel_review') {
        const res = await pool.query(
          'select review_id, target_id, source, status from moderation_reviews where review_id = $1',
          [s.id]
        );
        assert.equal(res.rowCount, 1, `Sentinel review ${s.id} was unexpectedly destroyed!`);
        const h = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(h, s.hash, `Sentinel review ${s.id} state was mutated!`);
      } else if (s.type === 'sentinel_report' || s.type === 'sentinel_reporter_report') {
        const res = await pool.query(
          'select report_id, reporter_id, target_id, status from reports where report_id = $1',
          [s.id]
        );
        assert.equal(res.rowCount, 1, `Sentinel report ${s.id} was unexpectedly destroyed!`);
        const h = createHash('sha256').update(JSON.stringify(res.rows[0])).digest('hex');
        assert.equal(h, s.hash, `Sentinel report ${s.id} state was mutated!`);
      } else if (s.type === 'sentinel_owner_comment') {
        const doc = await getMongoDatabase().collection('comments').findOne({ commentId: s.id });
        assert.ok(doc, `Sentinel owner comment ${s.id} was unexpectedly destroyed!`);
        const h = createHash('sha256').update(JSON.stringify(doc)).digest('hex');
        assert.equal(h, s.hash, `Sentinel owner comment ${s.id} state was mutated!`);
      } else if (s.type === 'sentinel_notification') {
        const doc = await getMongoDatabase().collection('notifications').findOne({ notificationId: s.id });
        assert.ok(doc, `Sentinel notification ${s.id} was unexpectedly destroyed!`);
        const h = createHash('sha256').update(JSON.stringify(doc)).digest('hex');
        assert.equal(h, s.hash, `Sentinel notification ${s.id} state was mutated!`);
      }
    }

    // 2. Clean up sentinel fixtures first (sentinel reports reference trackedUserIds)
    for (const s of sentinels) {
      await s.cleanup();
    }

    // 3. Clean up ONLY tracked test entities by explicit IDs in FK-safe order
    if (trackedReportIds.size > 0) {
      await pool.query('delete from reports where report_id = any($1)', [Array.from(trackedReportIds)]);
    }
    if (trackedUserIds.size > 0) {
      await pool.query('delete from reports where reporter_id = any($1)', [Array.from(trackedUserIds)]);
    }
    if (trackedReviewIds.size > 0) {
      await pool.query('delete from moderation_reviews where review_id = any($1)', [Array.from(trackedReviewIds)]);
    }
    if (trackedChapterIds.size > 0) {
      await pool.query('delete from chapters where chapter_id = any($1)', [Array.from(trackedChapterIds)]);
    }
    if (trackedNovelIds.size > 0) {
      await pool.query('delete from novels where novel_id = any($1)', [Array.from(trackedNovelIds)]);
    }
    if (trackedUserIds.size > 0) {
      await pool.query('delete from users where user_id = any($1)', [Array.from(trackedUserIds)]);
    }

    // Clean up MongoDB test comments and notifications by explicit IDs
    if (trackedCommentIds.size > 0) {
      await getMongoDatabase().collection('comments').deleteMany({
        commentId: { $in: Array.from(trackedCommentIds) }
      });
    }
    if (trackedReviewIds.size > 0) {
      await getMongoDatabase().collection('notifications').deleteMany({
        'payload.reviewId': { $in: Array.from(trackedReviewIds) }
      });
    }

    await disconnectMongo();
    await disconnectPostgres();
  });

  // Helper to create an approved comment in MongoDB and track its ID
  async function seedApprovedComment(content: string) {
    const comment = await createComment({
      chapterId: publishedChapterId,
      novelId: publishedNovelId,
      userId: ownerId,
      content
    });
    trackedCommentIds.add(comment.commentId);
    const col = getMongoDatabase().collection('comments');
    await col.updateOne({ commentId: comment.commentId }, { $set: { status: 'APPROVED' } });
    return comment;
  }

  // =========================================================================
  // Invariant 1: Anonymous report rejected
  // =========================================================================
  test('Invariant 1: anonymous POST /reports -> 401', () => {
    let errorCaught: any = null;
    let nextCalled = false;
    const reqAnonymous = {
      header: (_name: string) => undefined,
      headers: {}
    } as any;
    const res = {} as any;

    requireAuth(reqAnonymous, res, (err?: any) => {
      if (err) errorCaught = err;
      else nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.ok(errorCaught instanceof AppError);
    assert.equal(errorCaught.httpStatus, 401);
    assert.equal(errorCaught.code, 'AUTH_002');
  });

  // =========================================================================
  // Invariant 2: Non-Admin forbidden from moderation reviews
  // =========================================================================
  test('Invariant 2: non-Admin cannot access/resolve Admin moderation review -> 403', () => {
    let errorCaught: any = null;
    let nextCalled = false;
    const reqNonAdmin = {
      auth: reporter1Auth,
      header: (_name: string) => undefined
    } as any;
    const res = {} as any;

    const roleGuard = requireRoles(['ADMIN']);
    roleGuard(reqNonAdmin, res, (err?: any) => {
      if (err) errorCaught = err;
      else nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.ok(errorCaught instanceof AppError);
    assert.equal(errorCaught.httpStatus, 403);
    assert.equal(errorCaught.code, 'AUTH_008');
  });

  // =========================================================================
  // Invariant 3: Nonexistent target fails closed
  // =========================================================================
  test('Invariant 3: COMMENT report against nonexistent target fails closed (404)', async () => {
    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: randomUUID(),
          reason: 'Harassment or abuse'
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

  // =========================================================================
  // Invariant 4: Deleted target fails closed
  // =========================================================================
  test('Invariant 4: COMMENT report against deleted target fails closed (404)', async () => {
    const comment = await seedApprovedComment('Comment to be deleted before report');
    await softDeleteComment(comment.commentId);

    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: comment.commentId,
          reason: 'Spam'
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

  // =========================================================================
  // Invariant 4b: PENDING_MODERATION target fails closed (404 CONTENT_001)
  // =========================================================================
  test('Invariant 4b: COMMENT report against PENDING_MODERATION target fails closed (404)', async () => {
    const comment = await createComment({
      chapterId: publishedChapterId,
      novelId: publishedNovelId,
      userId: ownerId,
      content: 'Comment awaiting moderation'
    });
    trackedCommentIds.add(comment.commentId);
    // Explicitly ensure status is PENDING_MODERATION
    await getMongoDatabase().collection('comments').updateOne(
      { commentId: comment.commentId },
      { $set: { status: 'PENDING_MODERATION' } }
    );

    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: comment.commentId,
          reason: 'Premature report attempt'
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

  // =========================================================================
  // Invariant 4c: REJECTED target fails closed (404 CONTENT_001)
  // =========================================================================
  test('Invariant 4c: COMMENT report against REJECTED target fails closed (404)', async () => {
    const comment = await createComment({
      chapterId: publishedChapterId,
      novelId: publishedNovelId,
      userId: ownerId,
      content: 'Comment already rejected'
    });
    trackedCommentIds.add(comment.commentId);
    await getMongoDatabase().collection('comments').updateOne(
      { commentId: comment.commentId },
      { $set: { status: 'REJECTED' } }
    );

    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: comment.commentId,
          reason: 'Report on rejected comment'
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

  // =========================================================================
  // Invariant 4d: Comment on unpublished chapter/novel fails closed (404)
  // =========================================================================
  test('Invariant 4d: COMMENT report on unpublished chapter/novel fails closed (404)', async () => {
    // Create comment on draft chapter
    const comment = await createComment({
      chapterId: draftChapterId,
      novelId: draftNovelId,
      userId: ownerId,
      content: 'Comment on draft chapter'
    });
    trackedCommentIds.add(comment.commentId);
    await getMongoDatabase().collection('comments').updateOne(
      { commentId: comment.commentId },
      { $set: { status: 'APPROVED' } }
    );

    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: comment.commentId,
          reason: 'Report on unpublished chapter comment'
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

  // =========================================================================
  // Invariant 5: Same reporter duplicate report rejected (409 REPORT_001)
  // =========================================================================
  let commentC1Id: string;
  let reviewC1Id: string;
  let report1Id: string;

  test('Invariant 5: same reporter cannot create multiple unresolved OPEN reports for same comment (409)', async () => {
    const comment = await seedApprovedComment('Target comment C1 for duplicate report testing');
    commentC1Id = comment.commentId;

    // First report succeeds
    const rep1 = await createUserReport(reporter1Auth, {
      targetType: 'COMMENT',
      targetId: commentC1Id,
      reason: 'Offensive language',
      description: 'First report from reporter 1'
    });
    assert.ok(rep1.reportId);
    assert.ok(rep1.moderationReviewId);
    assert.equal(rep1.status, 'PENDING');
    reviewC1Id = rep1.moderationReviewId;
    report1Id = rep1.reportId;
    trackedReportIds.add(report1Id);
    trackedReviewIds.add(reviewC1Id);

    // Second report from same reporter on same comment must fail closed with 409
    await assert.rejects(
      async () => {
        await createUserReport(reporter1Auth, {
          targetType: 'COMMENT',
          targetId: commentC1Id,
          reason: 'Offensive language duplicate attempt'
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'REPORT_001');
        return true;
      }
    );
  });

  // =========================================================================
  // Invariant 5b: Concurrent same-reporter duplicate submits -> exactly 1 OPEN report & 409
  // =========================================================================
  test('Invariant 5b: concurrent same-reporter duplicate submits resolve to exactly one OPEN report and 409', async () => {
    const comment = await seedApprovedComment('Target comment for concurrent duplicate submits');
    const commentId = comment.commentId;

    const results = await Promise.allSettled([
      createUserReport(reporter1Auth, {
        targetType: 'COMMENT',
        targetId: commentId,
        reason: 'Concurrent report attempt A'
      }),
      createUserReport(reporter1Auth, {
        targetType: 'COMMENT',
        targetId: commentId,
        reason: 'Concurrent report attempt B'
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent submission must succeed');
    assert.equal(rejected.length, 1, 'Exactly one concurrent submission must be rejected');

    trackedReportIds.add(fulfilled[0].value.reportId);
    trackedReviewIds.add(fulfilled[0].value.moderationReviewId);

    const err = rejected[0].reason;
    assert.ok(err instanceof AppError, 'Rejection must be an AppError instance, not unhandled 23505/500');
    assert.equal(err.httpStatus, 409);
    assert.equal(err.code, 'REPORT_001');

    // Confirm DB has exactly one open report row
    const countRes = await pool.query(
      'select count(*) from reports where reporter_id = $1 and target_id = $2 and status = $3',
      [reporter1Id, commentId, 'OPEN']
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1);
  });

  // =========================================================================
  // Invariant 6: Distinct reporters share one review and aggregate reportCount
  // =========================================================================
  test('Invariant 6: two distinct reporters on same comment reuse ONE open moderation review and produce reportCount=2', async () => {
    const rep2 = await createUserReport(reporter2Auth, {
      targetType: 'COMMENT',
      targetId: commentC1Id,
      reason: 'Harassment',
      description: 'Second report from distinct reporter 2'
    });

    assert.ok(rep2.reportId);
    assert.notEqual(rep2.reportId, report1Id);
    assert.equal(rep2.moderationReviewId, reviewC1Id, 'Must reuse the exact same moderation review ID');
    assert.equal(rep2.status, 'PENDING');
    trackedReportIds.add(rep2.reportId);

    const count = await countReportsForReview(reviewC1Id);
    assert.equal(count, 2, 'Review must now aggregate exactly 2 reports');

    const reports = await listReportsForReview(reviewC1Id);
    assert.equal(reports.length, 2);
    const reporterIds = reports.map((r) => r.reporter_id);
    assert.ok(reporterIds.includes(reporter1Id));
    assert.ok(reporterIds.includes(reporter2Id));
  });

  // =========================================================================
  // Invariant 6b: Concurrent distinct reporters on same comment atomically share review
  // =========================================================================
  test('Invariant 6b: concurrent distinct reporters on same comment atomically share review', async () => {
    const comment = await seedApprovedComment('Target comment for concurrent distinct reporters');
    const commentId = comment.commentId;

    const [res1, res2] = await Promise.all([
      createUserReport(reporter1Auth, {
        targetType: 'COMMENT',
        targetId: commentId,
        reason: 'Concurrent report by reporter 1'
      }),
      createUserReport(reporter2Auth, {
        targetType: 'COMMENT',
        targetId: commentId,
        reason: 'Concurrent report by reporter 2'
      })
    ]);

    assert.ok(res1.reportId);
    assert.ok(res2.reportId);
    assert.notEqual(res1.reportId, res2.reportId);
    assert.equal(res1.moderationReviewId, res2.moderationReviewId, 'Must share the exact same review ID');

    trackedReportIds.add(res1.reportId);
    trackedReportIds.add(res2.reportId);
    trackedReviewIds.add(res1.moderationReviewId);

    // Verify only ONE pending review was created in PostgreSQL for this target
    const revCountRes = await pool.query(
      'select count(*) from moderation_reviews where target_type = $1 and target_id = $2 and status = $3',
      ['COMMENT', commentId, 'PENDING']
    );
    assert.equal(parseInt(revCountRes.rows[0].count, 10), 1);
  });

  // =========================================================================
  // Invariant 7: Approving USER_REPORT: review -> APPROVED, reports -> RESOLVED, comment -> DELETED
  // =========================================================================
  test('Invariant 7: approving USER_REPORT: review -> APPROVED, reports -> RESOLVED, comment -> DELETED', async () => {
    const res = await resolveModerationReview(adminAuth, reviewC1Id, {
      decision: 'APPROVED',
      reason: 'Confirmed violation of community guidelines'
    });

    assert.equal(res.status, 'APPROVED');

    // 1. Verify moderation_reviews table in PostgreSQL
    const reviewRow = await findReviewById(reviewC1Id);
    assert.equal(reviewRow.status, 'APPROVED');
    assert.equal(reviewRow.reviewed_by, adminId);
    assert.ok(reviewRow.reviewed_at);

    // 2. Verify reports table in PostgreSQL
    const reports = await listReportsForReview(reviewC1Id);
    for (const report of reports) {
      assert.equal(report.status, 'RESOLVED');
      assert.equal(report.resolved_by, adminId);
      assert.ok(report.resolved_at);
    }

    // 3. Verify comment soft-deleted in MongoDB
    const activeComment = await findCommentById(commentC1Id);
    assert.equal(activeComment, null, 'Active comment query must return null');

    const fullRecord = await findCommentRecordById(commentC1Id);
    assert.ok(fullRecord);
    assert.equal(fullRecord.status, 'DELETED');
    assert.ok(fullRecord.deletedAt);
  });

  // =========================================================================
  // Invariant 8: Rejecting USER_REPORT: review -> REJECTED, reports -> REJECTED, comment remains APPROVED
  // =========================================================================
  let commentC2Id: string;
  let reviewC2Id: string;

  test('Invariant 8: rejecting USER_REPORT: review -> REJECTED, reports -> REJECTED, comment remains APPROVED', async () => {
    const comment = await seedApprovedComment('Target comment C2 for rejection testing');
    commentC2Id = comment.commentId;

    const rep = await createUserReport(reporter1Auth, {
      targetType: 'COMMENT',
      targetId: commentC2Id,
      reason: 'False alarm report'
    });
    reviewC2Id = rep.moderationReviewId;
    trackedReportIds.add(rep.reportId);
    trackedReviewIds.add(reviewC2Id);

    const res = await resolveModerationReview(adminAuth, reviewC2Id, {
      decision: 'REJECTED',
      reason: 'No community guidelines violation found'
    });

    assert.equal(res.status, 'REJECTED');

    // 1. Verify moderation_reviews table in PostgreSQL
    const reviewRow = await findReviewById(reviewC2Id);
    assert.equal(reviewRow.status, 'REJECTED');
    assert.equal(reviewRow.reviewed_by, adminId);
    assert.ok(reviewRow.reviewed_at);

    // 2. Verify reports table in PostgreSQL
    const reports = await listReportsForReview(reviewC2Id);
    for (const report of reports) {
      assert.equal(report.status, 'REJECTED');
      assert.equal(report.resolved_by, adminId);
      assert.ok(report.resolved_at);
    }

    // 3. Verify comment remains APPROVED in MongoDB
    const activeComment = await findCommentById(commentC2Id);
    assert.ok(activeComment);
    assert.equal(activeComment.status, 'APPROVED');
    assert.equal(activeComment.deletedAt, null);
  });

  // =========================================================================
  // Invariant 9: Approve notification delivery
  // =========================================================================
  test('Invariant 9: approve notification types/payloads are correct for owner and reporter', async () => {
    const notificationsCol = getMongoDatabase().collection('notifications');

    // Owner notification for C1 approval
    const ownerNotif = await notificationsCol.findOne({
      userId: ownerId,
      type: 'COMMENT_REMOVED_BY_REPORT',
      'payload.commentId': commentC1Id
    });
    assert.ok(ownerNotif, 'Owner must receive COMMENT_REMOVED_BY_REPORT notification');
    assert.equal(ownerNotif.payload.reviewId, reviewC1Id);
    assert.equal(ownerNotif.payload.decision, 'APPROVED');
    assert.equal(ownerNotif.payload.adminId, adminId);

    // Reporter 1 notification for C1 approval
    const rep1Notif = await notificationsCol.findOne({
      userId: reporter1Id,
      type: 'COMMENT_REPORT_APPROVED',
      'payload.commentId': commentC1Id
    });
    assert.ok(rep1Notif, 'Reporter 1 must receive COMMENT_REPORT_APPROVED notification');
    assert.equal(rep1Notif.payload.reviewId, reviewC1Id);
    assert.equal(rep1Notif.payload.decision, 'APPROVED');

    // Reporter 2 notification for C1 approval
    const rep2Notif = await notificationsCol.findOne({
      userId: reporter2Id,
      type: 'COMMENT_REPORT_APPROVED',
      'payload.commentId': commentC1Id
    });
    assert.ok(rep2Notif, 'Reporter 2 must receive COMMENT_REPORT_APPROVED notification');
    assert.equal(rep2Notif.payload.reviewId, reviewC1Id);
  });

  // =========================================================================
  // Invariant 10: Reject notification delivery
  // =========================================================================
  test('Invariant 10: reject notification types/payloads are correct for owner and reporter', async () => {
    const notificationsCol = getMongoDatabase().collection('notifications');

    // Owner notification for C2 rejection
    const ownerNotif = await notificationsCol.findOne({
      userId: ownerId,
      type: 'COMMENT_REPORT_REJECTED_OWNER',
      'payload.commentId': commentC2Id
    });
    assert.ok(ownerNotif, 'Owner must receive COMMENT_REPORT_REJECTED_OWNER notification');
    assert.equal(ownerNotif.payload.reviewId, reviewC2Id);
    assert.equal(ownerNotif.payload.decision, 'REJECTED');

    // Reporter 1 notification for C2 rejection
    const rep1Notif = await notificationsCol.findOne({
      userId: reporter1Id,
      type: 'COMMENT_REPORT_REJECTED',
      'payload.commentId': commentC2Id
    });
    assert.ok(rep1Notif, 'Reporter 1 must receive COMMENT_REPORT_REJECTED notification');
    assert.equal(rep1Notif.payload.reviewId, reviewC2Id);
    assert.equal(rep1Notif.payload.decision, 'REJECTED');
  });

  // =========================================================================
  // Invariant 11: Duplicate resolve rejected (409 ADMIN_002)
  // =========================================================================
  test('Invariant 11: duplicate resolve of resolved review -> 409', async () => {
    await assert.rejects(
      async () => {
        await resolveModerationReview(adminAuth, reviewC1Id, {
          decision: 'APPROVED'
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.httpStatus, 409);
        assert.equal(err.code, 'ADMIN_002');
        return true;
      }
    );
  });

  // =========================================================================
  // Invariant 12: Keyword-filter COMMENT moderation semantics unchanged
  // =========================================================================
  test('Invariant 12: keyword-filter COMMENT moderation semantics remain unchanged', async () => {
    const commentApproved = await seedApprovedComment('Comment for keyword approval');
    const reviewApprove = await createModerationReview({
      targetType: 'COMMENT',
      targetId: commentApproved.commentId,
      source: 'KEYWORD_FILTER'
    });
    trackedReviewIds.add(reviewApprove.review_id);

    const resApprove = await resolveModerationReview(adminAuth, reviewApprove.review_id, {
      decision: 'APPROVED'
    });
    assert.equal(resApprove.status, 'APPROVED');
    const commentAfterApprove = await findCommentById(commentApproved.commentId);
    assert.ok(commentAfterApprove);
    assert.equal(commentAfterApprove.status, 'APPROVED');

    const commentRejected = await seedApprovedComment('Comment for keyword rejection');
    const reviewReject = await createModerationReview({
      targetType: 'COMMENT',
      targetId: commentRejected.commentId,
      source: 'KEYWORD_FILTER'
    });
    trackedReviewIds.add(reviewReject.review_id);

    const resReject = await resolveModerationReview(adminAuth, reviewReject.review_id, {
      decision: 'REJECTED',
      reason: 'Contains banned keyword'
    });
    assert.equal(resReject.status, 'REJECTED');
    const recordAfterReject = await findCommentRecordById(commentRejected.commentId);
    assert.ok(recordAfterReject);
    assert.equal(recordAfterReject.status, 'REJECTED');
  });
});
