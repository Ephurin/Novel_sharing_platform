import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';

type Fixture = { userId: string; identifier: string; password: string };

test('direct discussion moderation hides through one reversible sanction shared with reports', {
  skip: process.env.DISCUSSIONS_TEST_DATABASE !== '1'
}, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { connectMongo, disconnectMongo, getMongoDatabase } = await import('../../core/database/mongo.js');
  const { createApp } = await import('../../app.js');
  const { env } = await import('../../core/config/env.js');
  const db = getPostgresPool();
  let server: Server | undefined;
  const previousModeratorEnabled = env.MODERATOR_ENABLED;
  env.MODERATOR_ENABLED = true;
  try {
    await connectMongo();
    const stamp = randomUUID().slice(0, 8);
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('Fixture1Pass', 4);
    const insertUser = async (role: string, scope?: string): Promise<Fixture> => {
      const name = role.toLowerCase() + randomUUID().slice(0, 8);
      const { rows } = await db.query<{ user_id: string }>(
        "insert into users(email, username, password_hash, role, status) values($1, $2, $3, $4, 'ACTIVE') returning user_id",
        [name + '@test.invalid', name, hash, role]
      );
      if (scope) {
        await db.query("insert into admin_access(user_id, scope) values($1, $2)", [rows[0].user_id, scope]);
      }
      return { userId: rows[0].user_id, identifier: name, password: 'Fixture1Pass' };
    };
    const author = await insertUser('READER');
    const commenter = await insertUser('READER');
    const outsider = await insertUser('READER');
    const moderator = await insertUser('MODERATOR');
    const secondModerator = await insertUser('MODERATOR');
    const contentAdmin = await insertUser('ADMIN', 'MODERATOR');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port + '/api/v1';
    const call = async <T = unknown>(method: string, path: string, body?: unknown, token?: string) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: 'Bearer ' + token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json() as { data: T; error?: { code?: string } };
      return { status: response.status, data: payload.data, code: payload.error?.code };
    };
    const login = async (user: Fixture) => {
      const result = await call<{ accessToken: string }>('POST', '/auth/login', { identifier: user.identifier, password: user.password });
      assert.equal(result.status, 200);
      return result.data.accessToken;
    };
    const authorToken = await login(author);
    const commenterToken = await login(commenter);
    const outsiderToken = await login(outsider);
    const moderatorToken = await login(moderator);
    const secondModeratorToken = await login(secondModerator);
    const contentAdminToken = await login(contentAdmin);

    const categories = await call<Array<{ slug: string; categoryId: string }>>('GET', '/discussions/categories');
    const categoryId = categories.data.find(item => item.slug === 'thao-luan-chung')!.categoryId;

    const sanctionCount = async (kind: string, id: string) =>
      (await db.query<{ count: string }>(
        'select count(*)::text as count from admin_sanctions where target_type=$1 and target_id=$2',
        [kind, id]
      )).rows[0].count;
    const activeSanction = async (kind: string, id: string) =>
      (await db.query<any>(
        "select * from admin_sanctions where target_type=$1 and target_id=$2 and active",
        [kind, id]
      )).rows[0] ?? null;
    const auditCount = async (action: string, targetId: string) =>
      (await db.query<{ count: string }>(
        'select count(*)::text as count from admin_audit where action=$1 and target_id=$2',
        [action, targetId]
      )).rows[0].count;
    const jobCount = async (targetId: string) =>
      (await db.query<{ count: string }>(
        "select count(*)::text as count from admin_jobs where kind='NOTIFY' and payload->'payload'->>'targetId'=$1",
        [targetId]
      )).rows[0].count;

    // 1. Direct moderator hide records one sanction, one audit and one notification.
    const topic = await call<{ topicId: string }>('POST', '/discussions', {
      categoryId, title: 'Sanction topic ' + stamp, body: 'Direct hide body'
    }, authorToken);
    assert.equal(topic.status, 200);
    const topicId = topic.data.topicId;
    const comment = await call<{ commentId: string }>('POST', '/discussions/' + topicId + '/comments', {
      body: 'Comment for moderation'
    }, commenterToken);
    assert.equal(comment.status, 200);
    const commentId = comment.data.commentId;

    const hidden = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn trực tiếp', expected: 'VISIBLE' }, moderatorToken
    );
    assert.equal(hidden.status, 200);
    assert.equal(hidden.data.status, 'HIDDEN');
    assert.equal(await sanctionCount('DISCUSSION', topicId), '1');
    const topicSanction = await activeSanction('DISCUSSION', topicId);
    assert.equal(topicSanction.action, 'HIDE');
    assert.equal(topicSanction.owner_id, author.userId);
    assert.equal(topicSanction.previous_state.status, 'VISIBLE');
    assert.equal(await auditCount('DISCUSSION_HIDE', topicId), '1');
    assert.equal(await jobCount(topicId), '1');
    const authorNotices = await getMongoDatabase().collection('notifications').find({
      userId: author.userId,
      'payload.targetId': topicId
    }).toArray();
    assert.equal(authorNotices.length, 1, 'the hidden author is notified exactly once');
    assert.equal(authorNotices[0].type, 'DISCUSSION_CONTENT_HIDDEN');
    assert.equal(authorNotices[0].payload.reason, 'ẩn trực tiếp');
    assert.equal(authorNotices[0].payload.appealsUrl, '/appeals');
    assert.equal(await getMongoDatabase().collection('notifications').countDocuments({ userId: outsider.userId }), 0);

    // The author reads the decision and can open an appeal about it.
    const decisions = await call<Array<{ sanction_id: string; audit_id: string; target_type: string; appeal_status: string | null; active: boolean }>>(
      'GET', '/account/decisions', undefined, authorToken
    );
    assert.equal(decisions.status, 200);
    const decision = decisions.data.find(item => item.sanction_id === topicSanction.sanction_id);
    assert.ok(decision, 'the author sees the hide sanction in their decisions');
    assert.equal(decision.target_type, 'DISCUSSION');

    // Achieved state: repeating the hide records nothing new.
    assert.equal(await auditCount('DISCUSSION_HIDE', topicId), '1');
    const hiddenRepeat = await call(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'lặp', expected: 'STALE-IGNORED' }, moderatorToken
    );
    assert.equal(hiddenRepeat.status, 200, 'achieved state returns current state even with a stale expected value');
    assert.equal(await sanctionCount('DISCUSSION', topicId), '1');
    assert.equal(await auditCount('DISCUSSION_HIDE', topicId), '1');

    // 2. Self-reversal is blocked; a different independent moderator restores.
    const selfRestore = await call(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'tự đảo', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(selfRestore.status, 403);
    assert.equal(selfRestore.code, 'SANCTION_SELF_REVERSE');
    assert.ok(await activeSanction('DISCUSSION', topicId));
    assert.equal((await db.query<{ status: string }>(
      'select status from discussion_topics where topic_id=$1', [topicId]
    )).rows[0].status, 'HIDDEN');

    const restored = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'khôi phục đúng hiệu ứng', expected: 'HIDDEN' }, secondModeratorToken
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.data.status, 'VISIBLE');
    const restoredSanction = await activeSanction('DISCUSSION', topicId);
    assert.equal(restoredSanction, null);
    assert.equal(await auditCount('SANCTION_RESTORED', topicId), '1');
    assert.equal((await call('GET', '/discussions/' + topicId)).status, 200, 'board shows the topic again');

    // A new hide after a restore creates exactly one fresh sanction.
    const rehidden = await call(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn lại', expected: 'VISIBLE' }, secondModeratorToken
    );
    assert.equal(rehidden.status, 200);
    assert.equal(await sanctionCount('DISCUSSION', topicId), '2');
    assert.ok(await activeSanction('DISCUSSION', topicId));
    assert.equal(await auditCount('DISCUSSION_HIDE', topicId), '2');

    // 3. An open appeal blocks every manual restore path.
    const rehiddenSanction = await activeSanction('DISCUSSION', topicId);
    assert.ok(rehiddenSanction);
    const appeal = await call<{ appeal_id: string }>('POST', '/account/appeals', {
      auditId: rehiddenSanction.audit_id,
      message: 'Tôi cho rằng nội dung này không vi phạm quy định diễn đàn.'
    }, authorToken);
    assert.equal(appeal.status, 201);
    const appealRestore = await call(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'còn khiếu nại', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(appealRestore.status, 409);
    assert.equal(appealRestore.code, 'APPEAL_OPEN');
    assert.ok(await activeSanction('DISCUSSION', topicId), 'the sanction stays effective while the appeal is open');
    const appealRejected = await call<{ status: string }>(
      'POST', '/admin/appeals/' + appeal.data.appeal_id + '/resolve',
      { decision: 'REJECTED', reason: 'nội dung vi phạm quy định đăng bài' }, contentAdminToken
    );
    assert.equal(appealRejected.status, 200);
    const afterAppeal = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'khôi phục sau khiếu nại', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(afterAppeal.status, 200, 'once the appeal is rejected an independent restore works');
    assert.equal(afterAppeal.data.status, 'VISIBLE');

    // 4. The legacy admin route writes the same sanction and refuses self moderation.
    const adminHidden = await call<{ status: string }>(
      'PATCH', '/admin/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn qua route admin cũ' }, contentAdminToken
    );
    assert.equal(adminHidden.status, 200);
    assert.equal(adminHidden.data.status, 'HIDDEN');
    assert.equal(await activeSanction('DISCUSSION', topicId) !== null, true);
    const adminCommentHidden = await call<{ status: string }>(
      'PATCH', '/admin/discussions/' + topicId + '/comments/' + commentId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn comment qua admin' }, contentAdminToken
    );
    assert.equal(adminCommentHidden.status, 200);
    assert.ok(await activeSanction('DISCUSSION_COMMENT', commentId));
    assert.equal(await auditCount('DISCUSSION_COMMENT_HIDE', commentId), '1');
    const adminSelfRestore = await call(
      'PATCH', '/admin/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'admin tự đảo' }, contentAdminToken
    );
    assert.equal(adminSelfRestore.status, 403);
    assert.equal(adminSelfRestore.code, 'SANCTION_SELF_REVERSE');

    const moderatorRestoresAdminHide = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'VISIBLE', reason: 'mod khôi phục sau admin ẩn', expected: 'HIDDEN' }, secondModeratorToken
    );
    assert.equal(moderatorRestoresAdminHide.status, 200);
    assert.equal(moderatorRestoresAdminHide.data.status, 'VISIBLE');
    const adminSelfHide = await call<{ topicId: string }>(
      'POST', '/discussions', { categoryId, title: 'Admin own topic ' + stamp, body: 'Own body' }, contentAdminToken
    );
    assert.equal(adminSelfHide.status, 200, 'admins may create topics like everyone else');
    const adminHideOwn = await call(
      'PATCH', '/admin/discussions/' + adminSelfHide.data.topicId + '/moderation',
      { status: 'HIDDEN', reason: 'tự ẩn' }, contentAdminToken
    );
    assert.equal(adminHideOwn.status, 403);
    assert.equal(adminHideOwn.code, 'MOD_CONFLICT', 'the legacy route enforces independence too');
    assert.equal(await sanctionCount('DISCUSSION', adminSelfHide.data.topicId), '0');

    // 5. Legacy audit-only hides keep their history and restore without inventing a snapshot.
    const legacyTopic = await call<{ topicId: string }>('POST', '/discussions', {
      categoryId, title: 'Legacy hidden ' + stamp, body: 'Hidden before sanctions'
    }, authorToken);
    assert.equal(legacyTopic.status, 200);
    await db.query("update discussion_topics set status='HIDDEN' where topic_id=$1", [legacyTopic.data.topicId]);
    const legacyRestore = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + legacyTopic.data.topicId + '/moderation',
      { status: 'VISIBLE', reason: 'khôi phục lịch sử cũ', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(legacyRestore.status, 200);
    assert.equal(legacyRestore.data.status, 'VISIBLE');
    assert.equal(await sanctionCount('DISCUSSION', legacyTopic.data.topicId), '0', 'no sanction is inferred from legacy history');
    assert.equal(await auditCount('DISCUSSION_TOPIC_MODERATE', legacyTopic.data.topicId), '1');

    // 6. Deleted targets keep their state and produce no new sanction or notification.
    const deletedComment = await call<{ commentId: string }>('POST', '/discussions/' + topicId + '/comments', {
      body: 'To be deleted then reported'
    }, commenterToken);
    assert.equal(deletedComment.status, 200);
    const deletedReport = await call<{ moderationReviewId: string }>('POST', '/reports', {
      targetType: 'DISCUSSION_COMMENT', targetId: deletedComment.data.commentId, reason: 'spam content'
    }, outsiderToken);
    assert.equal(deletedReport.status, 201);
    const deleteAfterReport = await call<{ status: string }>(
      'PATCH', '/admin/discussions/' + topicId + '/comments/' + deletedComment.data.commentId + '/moderation',
      { status: 'DELETED', reason: 'xoá vĩnh viễn qua admin' }, contentAdminToken
    );
    assert.equal(deleteAfterReport.status, 200);
    const deletedReviews = await call<Array<{ reviewId: string; targetId: string }>>(
      'GET', '/moderator/reviews?status=PENDING', undefined, moderatorToken
    );
    const deletedReportRow = deletedReviews.data.find(item => item.targetId === deletedComment.data.commentId);
    assert.ok(deletedReportRow);
    const resolvedDeleted = await call('POST', '/moderator/reviews/' + deletedReportRow.reviewId + '/resolve', {
      decision: 'APPROVED', action: 'HIDE', reason: 'rác rồi'
    }, secondModeratorToken);
    assert.equal(resolvedDeleted.status, 200, 'the report still resolves');
    assert.equal(await sanctionCount('DISCUSSION_COMMENT', deletedComment.data.commentId), '0');
    assert.equal((await db.query<{ status: string }>(
      'select status from discussion_comments where comment_id=$1', [deletedComment.data.commentId]
    )).rows[0].status, 'DELETED');
    const deletedNotices = await getMongoDatabase().collection('notifications').find({
      userId: commenter.userId,
      'payload.targetId': deletedComment.data.commentId
    }).toArray();
    assert.equal(deletedNotices.length, 0, 'deleted content gets no hide notification');

    // 7. HIDE keeps its lock order under a moderator whose session changed mid-flight.
    await db.query('update users set access_version=access_version+1 where user_id=$1', [moderator.userId]);
    const staleHide = await call(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'phiên cũ', expected: 'VISIBLE' }, moderatorToken
    );
    assert.equal(staleHide.status, 401);
    assert.equal(staleHide.code, 'AUTH_009');
    assert.equal((await db.query<{ status: string }>(
      'select status from discussion_topics where topic_id=$1', [topicId]
    )).rows[0].status, 'VISIBLE');
    await db.query('update users set access_version=access_version-1 where user_id=$1', [moderator.userId]);
  } finally {
    env.MODERATOR_ENABLED = previousModeratorEnabled;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await disconnectMongo().catch(() => undefined);
    await disconnectPostgres();
  }
});

test('the two hide paths converge on one sanction: races, achieved report accepts and rollback', {
  skip: process.env.DISCUSSIONS_TEST_DATABASE !== '1'
}, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { connectMongo, disconnectMongo, getMongoDatabase } = await import('../../core/database/mongo.js');
  const { createApp } = await import('../../app.js');
  const { withPostgresTransaction } = await import('../../core/database/transaction.js');
  const { applySanction } = await import('../admin/admin-sanctions.js');
  const { drainAdminJobs } = await import('../admin/admin-jobs.js');
  const { env } = await import('../../core/config/env.js');
  const db = getPostgresPool();
  let server: Server | undefined;
  const previousModeratorEnabled = env.MODERATOR_ENABLED;
  env.MODERATOR_ENABLED = true;
  try {
    await connectMongo();
    const stamp = randomUUID().slice(0, 8);
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('Fixture1Pass', 4);
    const insertUser = async (role: string, scope?: string): Promise<Fixture> => {
      const name = role.toLowerCase() + randomUUID().slice(0, 8);
      const { rows } = await db.query<{ user_id: string }>(
        "insert into users(email, username, password_hash, role, status) values($1, $2, $3, $4, 'ACTIVE') returning user_id",
        [name + '@test.invalid', name, hash, role]
      );
      if (scope) {
        await db.query("insert into admin_access(user_id, scope) values($1, $2)", [rows[0].user_id, scope]);
      }
      return { userId: rows[0].user_id, identifier: name, password: 'Fixture1Pass' };
    };
    const author = await insertUser('READER');
    const reporter = await insertUser('READER');
    const moderator = await insertUser('MODERATOR');
    const contentAdmin = await insertUser('ADMIN', 'MODERATOR');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = 'http://127.0.0.1:' + address.port + '/api/v1';
    const call = async <T = unknown>(method: string, path: string, body?: unknown, token?: string) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: 'Bearer ' + token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json() as { data: T; error?: { code?: string } };
      return { status: response.status, data: payload.data, code: payload.error?.code };
    };
    const login = async (user: Fixture) => {
      const result = await call<{ accessToken: string }>('POST', '/auth/login', { identifier: user.identifier, password: user.password });
      assert.equal(result.status, 200);
      return result.data.accessToken;
    };
    const authorToken = await login(author);
    const reporterToken = await login(reporter);
    const moderatorToken = await login(moderator);
    const contentAdminToken = await login(contentAdmin);
    const categories = await call<Array<{ slug: string; categoryId: string }>>('GET', '/discussions/categories');
    const categoryId = categories.data.find(item => item.slug === 'thao-luan-chung')!.categoryId;

    const activeCount = async (kind: string, id: string) =>
      (await db.query<{ count: string }>(
        "select count(*)::text as count from admin_sanctions where target_type=$1 and target_id=$2 and active",
        [kind, id]
      )).rows[0].count;

    // 1. A direct hide racing a report resolution yields exactly one sanction.
    const raceTopic = await call<{ topicId: string }>('POST', '/discussions', {
      categoryId, title: 'Race topic ' + stamp, body: 'Race body'
    }, authorToken);
    assert.equal(raceTopic.status, 200);
    const raceTopicId = raceTopic.data.topicId;
    const raceComment = await call<{ commentId: string }>('POST', '/discussions/' + raceTopicId + '/comments', {
      body: 'Reported race comment'
    }, authorToken);
    await call('POST', '/reports', { targetType: 'DISCUSSION_COMMENT', targetId: raceComment.data.commentId, reason: 'spam' }, reporterToken);
    const reviews = await call<Array<{ reviewId: string; targetId: string }>>(
      'GET', '/admin/moderation/reviews?status=PENDING', undefined, contentAdminToken
    );
    const raceReview = reviews.data.find(item => item.targetId === raceComment.data.commentId);
    assert.ok(raceReview);
    const [directResult, reportResult] = await Promise.all([
      call('PATCH', '/moderator/discussions/' + raceTopicId + '/comments/' + raceComment.data.commentId + '/moderation',
        { status: 'HIDDEN', reason: 'ẩn trực tiếp' }, moderatorToken),
      call('POST', '/admin/moderation/reviews/' + raceReview.reviewId + '/resolve',
        { decision: 'APPROVED', action: 'HIDE', reason: 'báo cáo đúng' }, contentAdminToken)
    ]);
    assert.equal(directResult.status, 200, 'the direct hide resolves even when the report wins the race');
    assert.equal(reportResult.status, 200, 'the report resolves even when the direct hide wins the race');
    assert.equal(await activeCount('DISCUSSION_COMMENT', raceComment.data.commentId), '1');
    const raceNotices = await getMongoDatabase().collection('notifications').find({
      userId: author.userId,
      'payload.targetId': raceComment.data.commentId
    }).toArray();
    const hiddenByDirect = raceNotices.filter(item => item.type === 'DISCUSSION_CONTENT_HIDDEN').length;
    const hiddenByReport = raceNotices.filter(item => item.type === 'DISCUSSION_REMOVED_BY_REPORT').length;
    assert.ok(hiddenByDirect <= 1 && hiddenByReport <= 1, 'each decision notifies the author at most once');
    assert.equal(raceNotices.length, hiddenByDirect + hiddenByReport);

    // 2. An accepted report on already hidden content keeps the single effective sanction.
    const achievedTopic = await call<{ topicId: string }>('POST', '/discussions', {
      categoryId, title: 'Achieved topic ' + stamp, body: 'Already hidden'
    }, authorToken);
    const achievedReport = await call<{ moderationReviewId: string }>('POST', '/reports', {
      targetType: 'DISCUSSION', targetId: achievedTopic.data.topicId, reason: 'spam topic'
    }, reporterToken);
    assert.equal(achievedReport.status, 201);
    const directFirst = await call(
      'PATCH', '/moderator/discussions/' + achievedTopic.data.topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn trước', expected: 'VISIBLE' }, moderatorToken
    );
    assert.equal(directFirst.status, 200);
    const achievedReviews = await call<Array<{ reviewId: string; targetId: string }>>(
      'GET', '/admin/moderation/reviews?status=PENDING', undefined, contentAdminToken
    );
    const achievedReview = achievedReviews.data.find(item => item.targetId === achievedTopic.data.topicId);
    assert.ok(achievedReview, 'the accepted report has an open review');
    const achievedResolve = await call('POST', '/admin/moderation/reviews/' + achievedReview.reviewId + '/resolve', {
      decision: 'APPROVED', action: 'HIDE', reason: 'báo cáo xác nhận'
    }, contentAdminToken);
    assert.equal(achievedResolve.status, 200);
    assert.equal(await activeCount('DISCUSSION', achievedTopic.data.topicId), '1', 'no second sanction for one content');
    const achievedNotices = await getMongoDatabase().collection('notifications').find({
      userId: author.userId,
      'payload.targetId': achievedTopic.data.topicId
    }).toArray();
    assert.equal(achievedNotices.filter(item => item.type === 'DISCUSSION_CONTENT_HIDDEN').length, 1);
    assert.equal(achievedNotices.filter(item => item.type === 'DISCUSSION_REMOVED_BY_REPORT').length, 1);
    assert.equal(achievedNotices.length, 2, 'each decision notifies once, once per type');

    // 3. A failure inside the transaction leaves no sanction, audit, job or notification.
    const rollbackTopic = await call<{ topicId: string }>('POST', '/discussions', {
      categoryId, title: 'Rollback topic ' + stamp, body: 'Rollback body'
    }, authorToken);
    assert.equal(rollbackTopic.status, 200);
    await assert.rejects(
      withPostgresTransaction(async (client) => {
        await applySanction(client, { userId: contentAdmin.userId, role: 'ADMIN' } as {
          userId: string;
          role: 'ADMIN';
        } as never, {
          targetType: 'DISCUSSION',
          targetId: rollbackTopic.data.topicId,
          action: 'HIDE',
          reason: 'sẽ rollback',
          permission: 'discussion.operate'
        });
        throw new Error('rehearsed failure');
      }),
      /rehearsed failure/
    );
    assert.equal(
      (await db.query<{ count: string }>(
        'select count(*)::text as count from admin_sanctions where target_id=$1', [rollbackTopic.data.topicId]
      )).rows[0].count, '0'
    );
    assert.equal(
      (await db.query<{ count: string }>(
        'select count(*)::text as count from admin_audit where target_id=$1', [rollbackTopic.data.topicId]
      )).rows[0].count, '0'
    );
    assert.equal(
      (await db.query<{ count: string }>(
        "select count(*)::text as count from admin_jobs where kind='NOTIFY' and payload->'payload'->>'targetId'=$1",
        [rollbackTopic.data.topicId]
      )).rows[0].count, '0'
    );
    assert.equal((await db.query<{ status: string }>(
      'select status from discussion_topics where topic_id=$1', [rollbackTopic.data.topicId]
    )).rows[0].status, 'VISIBLE');
    assert.equal(await getMongoDatabase().collection('notifications').countDocuments({
      userId: author.userId,
      'payload.targetId': rollbackTopic.data.topicId
    }), 0);
    // After the failed attempt the same hide commits exactly once.
    const retry = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + rollbackTopic.data.topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn sau rollback', expected: 'VISIBLE' }, moderatorToken
    );
    assert.equal(retry.status, 200);
    assert.equal(await activeCount('DISCUSSION', rollbackTopic.data.topicId), '1');

    // 4. A worker crash after commit replays the notification exactly once.
    const jobRow = (
      await db.query<{ job_id: string }>(
        "select job_id from admin_jobs where kind='NOTIFY' and payload->'payload'->>'targetId'=$1 order by job_order desc limit 1",
        [rollbackTopic.data.topicId]
      )
    ).rows[0];
    await db.query(
      "update admin_jobs set status='PENDING',error='rehearsed worker crash',completed_at=null where job_id=$1",
      [jobRow.job_id]
    );
    await drainAdminJobs();
    assert.equal(await getMongoDatabase().collection('notifications').countDocuments({
      userId: author.userId,
      'payload.targetId': rollbackTopic.data.topicId
    }), 1, 'the retry delivers the notification exactly once');
    const jobAfter = (
      await db.query<{ status: string }>('select status from admin_jobs where job_id=$1', [jobRow.job_id])
    ).rows[0];
    assert.equal(jobAfter.status, 'DONE');
  } finally {
    env.MODERATOR_ENABLED = previousModeratorEnabled;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await disconnectMongo().catch(() => undefined);
    await disconnectPostgres();
  }
});
