import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

describe('Phase C: Comment User Report, Admin Moderation, and Notifications Invariants', () => {
  const pool = getPostgresPool();
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

  before(async () => {
    const timestamp = Date.now();

    // 1. Create Admin
    const adminRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'ADMIN', 'ACTIVE')
       returning user_id`,
      [`admin-report-${timestamp}@ephurin.com`, `admin_rep_${timestamp}`]
    );
    adminId = adminRes.rows[0].user_id;
    adminAuth = { userId: adminId, role: 'ADMIN' };

    // 2. Create Comment Owner
    const ownerRes = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`owner-report-${timestamp}@ephurin.com`, `owner_rep_${timestamp}`]
    );
    ownerId = ownerRes.rows[0].user_id;
    ownerAuth = { userId: ownerId, role: 'READER' };

    // 3. Create Reporter 1
    const rep1Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reporter1-report-${timestamp}@ephurin.com`, `rep1_${timestamp}`]
    );
    reporter1Id = rep1Res.rows[0].user_id;
    reporter1Auth = { userId: reporter1Id, role: 'READER' };

    // 4. Create Reporter 2
    const rep2Res = await pool.query(
      `insert into users (email, username, password_hash, role, status)
       values ($1, $2, 'dummy-hash', 'READER', 'ACTIVE')
       returning user_id`,
      [`reporter2-report-${timestamp}@ephurin.com`, `rep2_${timestamp}`]
    );
    reporter2Id = rep2Res.rows[0].user_id;
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

    const pubChapRes = await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, is_vip, price_coins, published_at)
       values ($1, $2, 1, 'Content of free published chapter.', 'PUBLISHED', false, 0, now())
       returning chapter_id`,
      [publishedNovelId, `Chapter 1 ${timestamp}`]
    );
    publishedChapterId = pubChapRes.rows[0].chapter_id;
  });

  after(async () => {
    // Clean up created novel, chapters, reports, reviews, users
    if (publishedNovelId) {
      await pool.query('delete from reports where target_type = $1', ['COMMENT']);
      await pool.query('delete from moderation_reviews where target_type = $1', ['COMMENT']);
      await pool.query('delete from chapters where novel_id = $1', [publishedNovelId]);
      await pool.query('delete from novels where novel_id = $1', [publishedNovelId]);
    }
    const testUserIds = [adminId, ownerId, reporter1Id, reporter2Id].filter(Boolean);
    if (testUserIds.length) {
      await pool.query('delete from reports where reporter_id = any($1)', [testUserIds]);
      await pool.query('delete from users where user_id = any($1)', [testUserIds]);
    }
    await disconnectMongo();
    await disconnectPostgres();
  });

  // Helper to create an approved comment in MongoDB
  async function seedApprovedComment(content: string) {
    const comment = await createComment({
      chapterId: publishedChapterId,
      novelId: publishedNovelId,
      userId: ownerId,
      content
    });
    // Set status to APPROVED directly
    const col = getMongoDatabase().collection('comments');
    await col.updateOne({ commentId: comment.commentId }, { $set: { status: 'APPROVED' } });
    return comment;
  }

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

  test('Invariant 6: two distinct reporters on same comment reuse ONE open moderation review and produce reportCount=2', async () => {
    // Reporter 2 reports same comment C1
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

    const count = await countReportsForReview(reviewC1Id);
    assert.equal(count, 2, 'Review must now aggregate exactly 2 reports');

    const reports = await listReportsForReview(reviewC1Id);
    assert.equal(reports.length, 2);
    const reporterIds = reports.map((r) => r.reporter_id);
    assert.ok(reporterIds.includes(reporter1Id));
    assert.ok(reporterIds.includes(reporter2Id));
  });

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

  test('Invariant 12: keyword-filter COMMENT moderation semantics remain unchanged', async () => {
    const commentApproved = await seedApprovedComment('Comment for keyword approval');
    const reviewApprove = await createModerationReview({
      targetType: 'COMMENT',
      targetId: commentApproved.commentId,
      source: 'KEYWORD_FILTER'
    });

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
