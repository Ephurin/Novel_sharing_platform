import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';

describe('PR-05: moderation escalations between moderators and Admin', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const admin = randomUUID();
  const adminSecond = randomUUID();
  const adminContentOnly = randomUUID();
  const userManager = randomUUID();
  const modProposer = randomUUID();
  const modIndependent = randomUUID();
  const modSelfTarget = randomUUID();
  const modReporter = randomUUID();
  const modStale = randomUUID();
  const targetPrivileged = randomUUID();
  const targetLocked = randomUUID();
  const reporterA = randomUUID();
  const reporterB = randomUUID();
  let server: Server;
  let base = '';

  const mint = (userId: string, role: string, ver?: number) =>
    jwt.sign({ sub: userId, role, ...(ver === undefined ? {} : { ver }) }, env.JWT_ACCESS_SECRET);

  async function insertUser(id: string, role: string, scope?: string) {
    await pool.query(
      "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,'test-only',$4,'ACTIVE')",
      [id, `pr05-${id}@example.test`, `pr05-${id.slice(0, 12)}`, role]
    );
    if (scope) {
      await pool.query('insert into admin_access(user_id,scope) values($1,$2)', [id, scope]);
    }
  }

  async function insertReader() {
    const id = randomUUID();
    await insertUser(id, 'READER');
    return id;
  }

  // Each call uses its own target: only one PENDING USER_REPORT review may exist
  // per target (idx_moderation_reviews_pending_target_source).
  async function openReportReview(reporterIds: string[], targetId?: string) {
    const target = targetId ?? (await insertReader());
    const reviewId = randomUUID();
    await pool.query(
      "insert into moderation_reviews(review_id,target_type,target_id,source,status) values($1,'USER',$2,'USER_REPORT','PENDING')",
      [reviewId, target]
    );
    for (const reporterId of reporterIds) {
      await pool.query(
        "insert into reports(review_id,reporter_id,target_type,target_id,reason,description,status) values($1,$2,'USER',$3,'ABUSE','Mô tả bằng chứng lạm quyền.','OPEN')",
        [reviewId, reporterId, target]
      );
    }
    return { reviewId, targetId: target };
  }

  async function escalate(reviewId: string, token: string, reason = 'Vượt quyền điều hành, cần Admin.', action = 'WARN') {
    return bearerCall(`/moderator/reviews/${reviewId}/escalations`, {
      method: 'POST',
      token,
      body: { reason, proposedAction: action }
    });
  }

  async function bearerCall(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const response = await fetch(base + path, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : ((await response.json().catch(() => null)) as any)
    };
  }

  async function escalationRow(reviewId: string) {
    return (
      await pool.query('select * from moderation_escalations where review_id=$1 order by created_at', [
        reviewId
      ])
    ).rows;
  }

  async function jobCount() {
    return (await pool.query('select count(*)::int as n from admin_jobs')).rows[0].n;
  }

  async function notificationCount(filter: Record<string, unknown>) {
    return getMongoDatabase().collection('notifications').countDocuments(filter);
  }

  before(async () => {
    env.MODERATOR_ENABLED = true;
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    for (const [id, role, scope] of [
      [admin, 'ADMIN', 'SUPER_ADMIN'],
      [adminSecond, 'ADMIN', 'SUPER_ADMIN'],
      [adminContentOnly, 'ADMIN', 'MODERATOR'],
      [userManager, 'ADMIN', 'USER_MANAGER'],
      [modProposer, 'MODERATOR', undefined],
      [modIndependent, 'MODERATOR', undefined],
      [modSelfTarget, 'MODERATOR', undefined],
      [modReporter, 'MODERATOR', undefined],
      [modStale, 'MODERATOR', undefined],
      [targetPrivileged, 'READER', undefined],
      [targetLocked, 'READER', undefined],
      [reporterA, 'READER', undefined],
      [reporterB, 'READER', undefined]
    ] as Array<[string, string, string | undefined]>) {
      await insertUser(id, role, scope);
    }

    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}${env.API_PREFIX}`;
  });

  after(async () => {
    server?.close();
    await disconnectPostgres();
    await disconnectMongo();
  });

  test('propose creates one OPEN escalation and freezes the review for direct resolution', async () => {
    const { reviewId, targetId } = await openReportReview([reporterA]);
    const jobsBefore = await jobCount();
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(proposed.status, 201);
    assert.equal(proposed.body.data.status, 'OPEN');
    assert.equal(proposed.body.data.proposedAction, 'WARN');
    assert.equal(proposed.body.data.reviewStatus, 'PENDING');
    const rows = await escalationRow(reviewId);
    assert.equal(rows.length, 1, 'exactly one escalation row exists');
    assert.equal(rows[0].status, 'OPEN');
    const review = (
      await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(review.status, 'PENDING', 'the review stays pending for Admin');
    const reports = (
      await pool.query("select status from reports where review_id=$1", [reviewId])
    ).rows;
    assert.ok(reports.every((report) => report.status === 'OPEN'), 'reports stay open');
    const audits = (
      await pool.query(
        "select count(*)::int as n from admin_audit where action='ESCALATION_PROPOSED' and target_id=$1 and affected_user_id=$2",
        [targetId, targetId]
      )
    ).rows[0];
    assert.equal(audits.n, 1, 'the proposal is audited once');
    assert.equal(await jobCount(), jobsBefore, 'propose queues no notification jobs');

    // Both roles are blocked on the old resolve route while the escalation is open.
    const modBlocked = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'REJECTED', reason: 'Điều hành thử xử lý hồ sơ đang chuyển cấp.' }
    });
    assert.equal(modBlocked.status, 409);
    assert.equal(modBlocked.body.error.code, 'ESCALATION_OPEN');
    const adminBlocked = await bearerCall(`/admin/moderation/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'REJECTED', reason: 'Admin thử xử lý hồ sơ đang chuyển cấp.' }
    });
    assert.equal(adminBlocked.status, 409);
    assert.equal(adminBlocked.body.error.code, 'ESCALATION_OPEN');
    const stillPending = (
      await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(stillPending.status, 'PENDING');
    // The list and detail surfaces still expose the frozen state.
    const detail = await bearerCall(`/moderator/reviews/${reviewId}`, { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(detail.body.data.escalation.status, 'OPEN');
  });

  test('repeats converge to the existing row while different content conflicts', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const first = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(first.status, 201);
    const repeat = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.data.escalationId, first.body.data.escalationId);
    assert.equal((await escalationRow(reviewId)).length, 1, 'no duplicate escalation row');

    const differentReason = await escalate(reviewId, mint(modIndependent, 'MODERATOR'), 'Lý do khác.');
    assert.equal(differentReason.status, 409);
    assert.equal(differentReason.body.error.code, 'ESCALATION_CONFLICT');
    const differentAction = await escalate(reviewId, mint(modProposer, 'MODERATOR'), undefined, 'LOCK');
    assert.equal(differentAction.status, 409);
    assert.equal(differentAction.body.error.code, 'ESCALATION_CONFLICT');
    assert.equal((await escalationRow(reviewId)).length, 1);
  });

  test('concurrent identical proposals still converge to one row', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const [a, b] = await Promise.all([
      escalate(reviewId, mint(modProposer, 'MODERATOR')),
      escalate(reviewId, mint(modProposer, 'MODERATOR'))
    ]);
    const statuses = [a.status, b.status].sort();
    assert.ok(
      (statuses[0] === 200 && (statuses[1] === 200 || statuses[1] === 201)) ||
        (statuses[0] === 201 && statuses[1] === 201),
      `identical concurrent proposals converge: ${statuses}`
    );
    assert.equal(a.body.data.escalationId, b.body.data.escalationId, 'both replies name the same row');
    const open = (
      await pool.query("select count(*)::int as n from moderation_escalations where review_id=$1 and status='OPEN'", [reviewId])
    ).rows[0];
    assert.equal(open.n, 1, 'the partial unique index keeps one OPEN escalation');
  });

  test('propose validates the review variant, state and actor', async () => {
    // Non-report reviews never escalate.
    const keywordReview = (
      await pool.query(
        "insert into moderation_reviews(target_type,target_id,source,status) values('NOVEL',$1,'KEYWORD_FILTER','PENDING') returning review_id",
        [randomUUID()]
      )
    ).rows[0];
    const wrongSource = await escalate(keywordReview.review_id, mint(modProposer, 'MODERATOR'));
    assert.equal(wrongSource.status, 404);
    const unsupportedReview = (
      await pool.query(
        "insert into moderation_reviews(target_type,target_id,source,status) values('CHAPTER',$1,'USER_REPORT','PENDING') returning review_id",
        [randomUUID()]
      )
    ).rows[0];
    const wrongTarget = await escalate(unsupportedReview.review_id, mint(modProposer, 'MODERATOR'));
    assert.equal(wrongTarget.status, 422);
    assert.equal(wrongTarget.body.error.code, 'ESCALATION_TARGET');

    const resolved = await openReportReview([reporterA], targetPrivileged);
    await pool.query(
      "update moderation_reviews set status='REJECTED' where review_id=$1",
      [resolved.reviewId]
    );
    await pool.query(
      "update reports set status='REJECTED',resolution='Đã xử lý trước đó.' where review_id=$1",
      [resolved.reviewId]
    );
    const resolvedAttempt = await escalate(resolved.reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(resolvedAttempt.status, 409);
    assert.equal(resolvedAttempt.body.error.code, 'ADMIN_002');

    // Target-of-report moderators and reporter moderators cannot escalate.
    const selfTarget = await openReportReview([reporterA], modSelfTarget);
    const selfTargetAttempt = await escalate(selfTarget.reviewId, mint(modSelfTarget, 'MODERATOR'));
    assert.equal(selfTargetAttempt.status, 403);
    assert.equal(selfTargetAttempt.body.error.code, 'MOD_CONFLICT');
    const reporterReview = await openReportReview([modReporter]);
    const reporterAttempt = await escalate(reporterReview.reviewId, mint(modReporter, 'MODERATOR'));
    assert.equal(reporterAttempt.status, 403);
    assert.equal(reporterAttempt.body.error.code, 'MOD_CONFLICT');

    // A stale moderator session fails under the lock.
    const staleReview = await openReportReview([reporterA]);
    await pool.query('update users set access_version=access_version+1 where user_id=$1', [modStale]);
    const stale = await escalate(staleReview.reviewId, mint(modStale, 'MODERATOR'));
    assert.equal(stale.status, 401);
    assert.equal(stale.body.error.code, 'AUTH_009');
    assert.equal((await escalationRow(staleReview.reviewId)).length, 0);

    // Propose belongs to moderators only.
    const readerReview = await openReportReview([reporterA]);
    assert.equal((await escalate(readerReview.reviewId, mint(reporterA, 'READER'))).status, 403);
    assert.equal((await escalate(readerReview.reviewId, mint(admin, 'ADMIN'))).status, 403);

    // The flag gates the operation.
    env.MODERATOR_ENABLED = false;
    try {
      const gated = await escalate(readerReview.reviewId, mint(modProposer, 'MODERATOR'));
      assert.equal(gated.status, 403);
      assert.equal(gated.body.error.code, 'MOD_PERMISSION');
    } finally {
      env.MODERATOR_ENABLED = true;
    }
  });

  test('the admin queue lists escalations with evidence reference and denies non-admins', async () => {
    const { reviewId } = await openReportReview([reporterA, reporterB], targetPrivileged);
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Đề nghị xử lý nghi phạm đặc quyền.', 'LOCK');
    assert.equal(proposed.status, 201);
    const list = await bearerCall('/admin/escalations?status=OPEN', { token: mint(admin, 'ADMIN') });
    assert.equal(list.status, 200);
    const row = list.body.data.find((item: { escalationId: string }) => item.escalationId === proposed.body.data.escalationId);
    assert.ok(row, 'the queue lists the open escalation');
    assert.equal(row.review.targetId, targetPrivileged);
    assert.equal(row.review.targetUsername, `pr05-${targetPrivileged.slice(0, 12)}`);
    assert.equal(row.review.reportCount, 2);
    assert.equal(row.review.reviewId, reviewId);
    assert.equal(row.proposedByUsername, `pr05-${modProposer.slice(0, 12)}`);
    const noStatusFilter = await bearerCall('/admin/escalations', { token: mint(admin, 'ADMIN') });
    assert.equal(noStatusFilter.status, 200);
    assert.ok(Array.isArray(noStatusFilter.body.data));
    assert.ok((await bearerCall('/admin/escalations', { token: mint(modProposer, 'MODERATOR') })).status === 403);
    assert.ok((await bearerCall('/admin/escalations', { token: mint(reporterA, 'READER') })).status === 403);
    const contentOnlyList = await bearerCall('/admin/escalations', { token: mint(adminContentOnly, 'ADMIN') });
    assert.equal(contentOnlyList.status, 200, 'content scope reads the escalation queue');
    const userManagerList = await bearerCall('/admin/escalations', { token: mint(userManager, 'ADMIN') });
    assert.equal(userManagerList.status, 403, 'users scope alone cannot read the queue');
    // The OPEN filter exposes the privileged-target report in the Admin queue.
    const auditor = (
      await pool.query(
        "select count(*)::int as n from admin_audit where action='ESCALATION_PROPOSED' and target_id=$1",
        [targetPrivileged]
      )
    ).rows[0];
    assert.equal(auditor.n, 1);
  });

  test('accepting executes the proposal through the shared resolution core', async () => {
    const { reviewId, targetId } = await openReportReview([reporterA, reporterB]);
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Cần cảnh báo tài khoản này.', 'WARN');
    assert.equal(proposed.status, 201);
    const accepted = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'ACCEPTED', reason: 'Chấp nhận đề nghị của điều hành viên.' }
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.data.escalation.status, 'EXECUTED');
    assert.equal(accepted.body.data.reviewStatus, 'APPROVED');
    assert.equal(accepted.body.data.action, 'WARN');

    const review = (
      await pool.query('select status,reason from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(review.status, 'APPROVED');
    const reports = (
      await pool.query('select status from reports where review_id=$1', [reviewId])
    ).rows;
    assert.ok(reports.every((report) => report.status === 'RESOLVED'));
    const sanction = (
      await pool.query('select action,active,owner_id from admin_sanctions where review_id=$1', [reviewId])
    ).rows[0];
    assert.ok(sanction, 'acceptance records one sanction');
    assert.equal(sanction.action, 'WARN');
    assert.equal(sanction.active, true);
    assert.equal(sanction.owner_id, targetId);

    for (const action of ['ESCALATION_EXECUTED', 'REPORT_ACCEPTED']) {
      const count = (
        await pool.query(
          'select count(*)::int as n from admin_audit where action=$1 and target_id=$2 and target_type=$3',
          [action, targetId, 'USER']
        )
      ).rows[0];
      assert.equal(count.n, 1, `${action} is audited once`);
    }

    assert.equal(await notificationCount({ type: 'ADMIN_DECISION', 'payload.reviewId': reviewId }), 1, 'the target learns the outcome once');
    assert.equal(await notificationCount({ type: 'REPORT_RESOLVED', 'payload.reviewId': reviewId }), 2, 'each reporter learns the outcome once');
    assert.equal(await notificationCount({ type: 'ESCALATION_APPROVED', 'payload.reviewId': reviewId }), 1, 'the proposer learns the acceptance once');
  });

  for (const kind of ['DISCUSSION', 'DISCUSSION_COMMENT'] as const) {
    test(`accepting a ${kind} escalation hides the target and records one sanction`, async () => {
      const owner = await insertReader();
      const ownerToken = mint(owner, 'READER');
      const modToken = mint(modProposer, 'MODERATOR');
      const adminToken = mint(adminContentOnly, 'ADMIN');
      const categories = await bearerCall('/discussions/categories');
      const category = categories.body.data.find((row: { slug: string }) => row.slug === 'thao-luan-chung');
      assert.ok(category);
      const topic = await bearerCall('/discussions', {
        token: ownerToken,
        body: { categoryId: category.categoryId, title: 'Chủ đề được báo cáo', body: 'Nội dung thử chuyển cấp diễn đàn.' }
      });
      assert.equal(topic.status, 200);
      const topicId = topic.body.data.topicId;
      let targetId = topicId;
      if (kind === 'DISCUSSION_COMMENT') {
        const comment = await bearerCall(`/discussions/${topicId}/comments`, {
          token: ownerToken, body: { body: 'Bình luận được báo cáo.' }
        });
        assert.equal(comment.status, 200);
        targetId = comment.body.data.commentId;
      }
      const report = await bearerCall('/reports', {
        token: mint(reporterA, 'READER'),
        body: { targetType: kind, targetId, reason: 'ABUSE', description: 'Cần Admin xem lại chứng cứ thảo luận.' }
      });
      assert.equal(report.status, 201);
      const reviewId = report.body.data.moderationReviewId;
      const wrongAction = await escalate(reviewId, modToken);
      assert.equal(wrongAction.status, 422);
      assert.equal(wrongAction.body.error.code, 'ESCALATION_ACTION');
      const proposed = await escalate(reviewId, modToken, 'Cần Admin kiểm tra và ẩn nội dung.', 'HIDE');
      assert.equal(proposed.status, 201);
      const escalationId = proposed.body.data.escalationId;
      const direct = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
        token: modToken, body: { decision: 'APPROVED', action: 'HIDE', reason: 'Đề nghị đang mở.' }
      });
      assert.equal(direct.status, 409);
      assert.equal(direct.body.error.code, 'ESCALATION_OPEN');
      const accepted = await bearerCall(`/admin/escalations/${escalationId}/resolve`, {
        token: adminToken, body: { decision: 'ACCEPTED', reason: 'Xác nhận vi phạm qua chứng cứ.' }
      });
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body.data.escalation.status, 'EXECUTED');
      assert.equal(accepted.body.data.action, 'HIDE');
      const topicState = (await pool.query('select status from discussion_topics where topic_id=$1', [topicId])).rows[0];
      assert.equal(topicState.status, kind === 'DISCUSSION' ? 'HIDDEN' : 'VISIBLE');
      if (kind === 'DISCUSSION_COMMENT') {
        const commentState = (await pool.query('select status from discussion_comments where comment_id=$1', [targetId])).rows[0];
        assert.equal(commentState.status, 'HIDDEN');
      }
      const sanctions = await pool.query(
        'select target_type, target_id, owner_id, action, active from admin_sanctions where review_id=$1', [reviewId]
      );
      assert.deepEqual(sanctions.rows, [{ target_type: kind, target_id: targetId, owner_id: owner, action: 'HIDE', active: true }]);
      const audit = await pool.query(
        "select action,affected_user_id from admin_audit where target_id=$1 and action in ('ESCALATION_PROPOSED','ESCALATION_EXECUTED') order by action",
        [targetId]
      );
      assert.deepEqual(audit.rows, [
        { action: 'ESCALATION_EXECUTED', affected_user_id: owner },
        { action: 'ESCALATION_PROPOSED', affected_user_id: owner }
      ]);
      assert.equal(await notificationCount({ type: 'DISCUSSION_REMOVED_BY_REPORT', userId: owner, 'payload.reviewId': reviewId }), 1);
      assert.equal(await notificationCount({ type: 'ESCALATION_APPROVED', userId: modProposer, 'payload.reviewId': reviewId }), 1);
    });
  }

  test('rejecting returns the report to the queue and only notifies the proposer', async () => {
    const { reviewId, targetId } = await openReportReview([reporterA]);
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Đề nghị bị bác.', 'LOCK');
    const rejected = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'REJECTED', reason: 'Chưa đủ bằng chứng để khóa tài khoản.' }
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.escalation.status, 'DISMISSED');
    assert.equal(rejected.body.data.reviewStatus, 'PENDING');
    const review = (
      await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(review.status, 'PENDING', 'the review returns to the suitable queue');
    const reports = (
      await pool.query('select status from reports where review_id=$1', [reviewId])
    ).rows;
    assert.ok(reports.every((report) => report.status === 'OPEN'));
    const sanctions = (
      await pool.query('select count(*)::int as n from admin_sanctions where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(sanctions.n, 0, 'a dismissed proposal applies no sanction');
    const dismissedAudit = (
      await pool.query(
        "select count(*)::int as n from admin_audit where action='ESCALATION_DISMISSED' and target_id=$1",
        [targetId]
      )
    ).rows[0];
    assert.equal(dismissedAudit.n, 1);
    assert.equal(await notificationCount({ type: 'ESCALATION_REJECTED', 'payload.reviewId': reviewId }), 1);
    assert.equal(await notificationCount({ type: 'REPORT_RESOLVED', 'payload.reviewId': reviewId }), 0, 'reporters are not notified before the review is decided');
    assert.equal(await notificationCount({ type: 'ADMIN_DECISION', 'payload.reviewId': reviewId }), 0, 'the target is untouched');

    // After dismissal the same review can carry a fresh proposal: only OPEN rows are unique.
    const reproposed = await escalate(reviewId, mint(modIndependent, 'MODERATOR'), 'Đề nghị mới sau khi bị bác.', 'WARN');
    assert.equal(reproposed.status, 201, 'a dismissed escalation frees the review for a new proposal');
    const rows = await escalationRow(reviewId);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.status === 'OPEN').length, 1);
  });

  test('stronger permission checks: LOCK needs users scope and escalation routes stay admin-only', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Đề nghị khóa cần quyền users.', 'LOCK');
    assert.equal(proposed.status, 201);
    const lockedByContentOnly = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(adminContentOnly, 'ADMIN'),
      body: { decision: 'ACCEPTED', reason: 'Admin chỉ quyền nội dung thử khóa tài khoản.' }
    });
    assert.equal(lockedByContentOnly.status, 403, 'LOCK requires the users permission through applySanction');
    const stillOpen = (await escalationRow(reviewId)).find((row) => row.status === 'OPEN');
    assert.ok(stillOpen, 'the escalation stays open when the permission is missing');
    const untouched = (
      await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(untouched.status, 'PENDING');
    const noSanction = (
      await pool.query('select count(*)::int as n from admin_sanctions where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(noSanction.n, 0);

    // The moderator cannot reach the resolve endpoint at all.
    const modRoute = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(modProposer, 'MODERATOR'),
      body: { decision: 'ACCEPTED', reason: 'Điều hành thử tự giải quyết.' }
    });
    assert.equal(modRoute.status, 403);

    // A super admin closes the escalation so the review can serve later cases.
    const closed = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'REJECTED', reason: 'Đủ quyền nhưng chọn bác đề nghị khóa này.' }
    });
    assert.equal(closed.status, 200, 'a super admin can dismiss what a content-only admin could not accept');
  });

  test('a late failure rolls the whole escalation decision back', async () => {
    // The target already carries an active LOCK sanction, so executing a LOCK
    // proposal fails inside applySanction after the review row was locked.
    const adminAuth: AuthContext = { userId: admin, role: 'ADMIN', adminScope: 'SUPER_ADMIN' };
    const { withPostgresTransaction } = await import('../../core/database/transaction.js');
    const { applySanction } = await import('../admin/admin-sanctions.js');
    await withPostgresTransaction((client) =>
      applySanction(client, adminAuth, {
        targetType: 'USER',
        targetId: targetLocked,
        action: 'LOCK',
        reason: 'Khóa trực tiếp trước khi xử lý chuyển cấp.'
      })
    );
    const { reviewId } = await openReportReview([reporterA], targetLocked);
    const jobsBefore = await jobCount();
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Khóa lại tài khoản vi phạm.', 'LOCK');
    assert.equal(proposed.status, 201);
    const failed = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'ACCEPTED', reason: 'Chấp nhận khóa tài khoản đã khóa.' }
    });
    assert.equal(failed.status, 409);
    assert.equal(failed.body.error.code, 'ADMIN_SANCTION_ACTIVE');
    const rows = await escalationRow(reviewId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'OPEN', 'the escalation row survives intact');
    const review = (
      await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(review.status, 'PENDING');
    const executedAudit = (
      await pool.query(
        "select count(*)::int as n from admin_audit where action='ESCALATION_EXECUTED' and target_id=$1",
        [targetLocked]
      )
    ).rows[0];
    assert.equal(executedAudit.n, 0, 'no execution audit leaks from the failed transaction');
    const sanctionForReview = (
      await pool.query('select count(*)::int as n from admin_sanctions where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(sanctionForReview.n, 0);
    assert.equal(await notificationCount({ 'payload.reviewId': reviewId }), 0, 'no notification is queued');
    assert.equal(await jobCount(), jobsBefore, 'the failed resolve leaves no job behind');
  });

  test('competing resolutions mark exactly one winner', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(proposed.status, 201);
    const outcomes = await Promise.all([
      bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
        method: 'POST',
        token: mint(admin, 'ADMIN'),
        body: { decision: 'REJECTED', reason: 'Admin thứ nhất.' }
      }),
      bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
        method: 'POST',
        token: mint(adminSecond, 'ADMIN'),
        body: { decision: 'REJECTED', reason: 'Admin thứ hai.' }
      })
    ]);
    const statuses = outcomes.map((outcome) => outcome.status).sort();
    assert.deepEqual(statuses, [200, 409], 'exactly one resolution wins');
    const loser = outcomes.find((outcome) => outcome.status === 409);
    assert.equal(loser?.body.error.code, 'ESCALATION_RESOLVED');
    const rows = await escalationRow(reviewId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'DISMISSED');
  });

  test('propose racing a direct resolution never leaves an open escalation on a resolved review', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const outcomes = await Promise.all([
      escalate(reviewId, mint(modProposer, 'MODERATOR')),
      bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
        method: 'POST',
        token: mint(modIndependent, 'MODERATOR'),
        body: { decision: 'REJECTED', reason: 'Bác báo cáo song song với đề nghị.' }
      })
    ]);
    const [proposal, direct] = outcomes as any;
    if (proposal.status === 201) {
      assert.equal(direct.status, 409, 'the escalation wins the review lock and the direct path stops');
      assert.equal(direct.body.error.code, 'ESCALATION_OPEN');
    } else {
      assert.equal(proposal.status, 409, 'the direct resolution wins and the proposal sees a resolved review');
      assert.equal(direct.status, 200);
    }
    const openOnResolved = (
      await pool.query(
        "select count(*)::int as n from moderation_escalations e join moderation_reviews r on r.review_id=e.review_id where e.review_id=$1 and e.status='OPEN' and r.status<>'PENDING'",
        [reviewId]
      )
    ).rows[0];
    assert.equal(openOnResolved.n, 0, 'no open escalation dangles on a decided review');
  });

  test('admin independence covers the proposer, the target and the reporters', async () => {
    // Target==admin
    const adminTarget = await openReportReview([reporterA], admin);
    const proposedToAdmin = await escalate(adminTarget.reviewId, mint(modProposer, 'MODERATOR'), 'Báo cáo nhắm admin.');
    assert.equal(proposedToAdmin.status, 201, 'a report against a privileged account is exactly the escalation case');
    const selfTarget = await bearerCall(`/admin/escalations/${proposedToAdmin.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'ACCEPTED', reason: 'Tự xử lý báo cáo về chính mình.' }
    });
    assert.equal(selfTarget.status, 403);
    assert.equal(selfTarget.body.error.code, 'MOD_CONFLICT');
    const openRow = (await escalationRow(adminTarget.reviewId)).find((row) => row.status === 'OPEN');
    assert.ok(openRow, 'the review stays escalated');

    // Reporter==admin
    const reporterReview = await openReportReview([admin]);
    const proposedReporter = await escalate(reporterReview.reviewId, mint(modProposer, 'MODERATOR'), 'Người báo cáo là admin.');
    assert.equal(proposedReporter.status, 201);
    const byReporter = await bearerCall(`/admin/escalations/${proposedReporter.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'REJECTED', reason: 'Admin từng là người báo cáo.' }
    });
    assert.equal(byReporter.status, 403);
    assert.equal(byReporter.body.error.code, 'MOD_CONFLICT');
  });

  test('the target keeps its protection after a mid-flight role change', async () => {
    const { reviewId, targetId } = await openReportReview([reporterA]);
    await pool.query("update users set role='MODERATOR' where user_id=$1", [targetId]);
    const modDirect = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'REJECTED', reason: 'Điều hành thử xử lý báo cáo nhắm điều hành khác.' }
    });
    assert.equal(modDirect.status, 403);
    assert.equal(modDirect.body.error.code, 'MOD_PRIVILEGED_TARGET', 'the under-lock role re-check protects the new moderator');
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Đề nghị phạt điều hành vi phạm.', 'WARN');
    assert.equal(proposed.status, 201);
    const accepted = await bearerCall(`/admin/escalations/${proposed.body.data.escalationId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'ACCEPTED', reason: 'Chấp nhận phạt điều hành viên vi phạm.' }
    });
    assert.equal(accepted.status, 200, 'Admin executes the escalation against the privileged target');
    const warnings = (
      await pool.query(
        "select count(*)::int as n from admin_sanctions where review_id=$1 and action='WARN' and owner_id=$2",
        [reviewId, targetId]
      )
    ).rows[0];
    assert.equal(warnings.n, 1);
  });

  test('the shared escalation field reaches the review detail for both workspaces', async () => {
    const fresh = await openReportReview([reporterA]);
    const beforeDetail = await bearerCall(`/moderator/reviews/${fresh.reviewId}`, { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(beforeDetail.status, 200);
    assert.equal(beforeDetail.body.data.escalation, null, 'a review without proposals shows no escalation');
    const proposed = await escalate(fresh.reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(proposed.status, 201);
    const modDetail = await bearerCall(`/moderator/reviews/${fresh.reviewId}`, { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(modDetail.status, 200);
    assert.equal(modDetail.body.data.escalation.status, 'OPEN');
    assert.equal(modDetail.body.data.escalation.escalationId, proposed.body.data.escalationId);
    const adminDetail = await bearerCall(`/admin/moderation/reviews/${fresh.reviewId}`, { token: mint(admin, 'ADMIN') });
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.data.escalation.status, 'OPEN');
  });

  test('propose requires a reason and a valid action', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    const noReason = await bearerCall(`/moderator/reviews/${reviewId}/escalations`, {
      method: 'POST',
      token: mint(modProposer, 'MODERATOR'),
      body: { proposedAction: 'WARN' }
    });
    assert.equal(noReason.status, 400);
    const badAction = await bearerCall(`/moderator/reviews/${reviewId}/escalations`, {
      method: 'POST',
      token: mint(modProposer, 'MODERATOR'),
      body: { reason: 'Lý do hợp lệ.', proposedAction: 'DELETE' }
    });
    assert.equal(badAction.status, 400);
    const invalidAccountAction = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Sai loại hành động.', 'HIDE');
    assert.equal(invalidAccountAction.status, 422);
    assert.equal(invalidAccountAction.body.error.code, 'ESCALATION_ACTION');
    const unknownReview = await escalate(randomUUID(), mint(modProposer, 'MODERATOR'));
    assert.equal(unknownReview.status, 404);
    assert.equal((await escalationRow(reviewId)).length, 0);
  });

  test('propose stops on a dangling legacy target instead of failing mid-audit', async () => {
    // A legacy review may reference an account that no longer resolves; the
    // audit names the reported account, so the proposal stops before it.
    const reviewId = randomUUID();
    await pool.query(
      "insert into moderation_reviews(review_id,target_type,target_id,source,status) values($1,'USER',$2,'USER_REPORT','PENDING')",
      [reviewId, randomUUID()]
    );
    const stopped = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(stopped.status, 404);
    assert.equal(stopped.body.error.code, 'USER_001');
    assert.equal((await escalationRow(reviewId)).length, 0, 'no escalation row leaks');
  });

  test('propose on a previously resolved review stays rejected', async () => {
    const { reviewId } = await openReportReview([reporterA]);
    await pool.query("update moderation_reviews set status='REJECTED',reason='Quyết định trước PR-05.' where review_id=$1", [reviewId]);
    const legacy = await escalate(reviewId, mint(modProposer, 'MODERATOR'));
    assert.equal(legacy.status, 409);
    assert.equal(legacy.body.error.code, 'ADMIN_002');
  });

  test('a reader abuse report against a moderator flows into an escalation', async () => {
    // The plain report route keeps servicing readers against moderators; the
    // queue entry it opens is exactly the review an escalation then forwards.
    const fresh = await insertReader();
    const report = await bearerCall('/reports', {
      method: 'POST',
      token: mint(fresh, 'READER'),
      body: { targetType: 'USER', targetId: modIndependent, reason: 'ABUSE', description: 'Nghi lạm quyền điều hành viên.' }
    });
    assert.equal(report.status, 201, 'a reader report against a moderator opens a review');
    const reviewId = report.body.data.moderationReviewId;
    const proposed = await escalate(reviewId, mint(modProposer, 'MODERATOR'), 'Chuyển cấp báo cáo lạm quyền.', 'LOCK');
    assert.equal(proposed.status, 201, 'that abuse review escalates instead of being decided by moderators');
    const detail = await bearerCall(`/moderator/reviews/${reviewId}`, { token: mint(modProposer, 'MODERATOR') });
    assert.equal(detail.body.data.escalation.status, 'OPEN');
  });
});
