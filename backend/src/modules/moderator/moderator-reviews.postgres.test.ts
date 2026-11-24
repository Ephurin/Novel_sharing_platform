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
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { submitPublish } from '../novels/novels.service.js';
import { applySanction } from '../admin/admin-sanctions.js';

describe('PR-02: moderator review queue, variants and independence', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const admin = randomUUID();
  const adminAuth: AuthContext = { userId: admin, role: 'ADMIN', adminScope: 'SUPER_ADMIN' };
  const modOwner = randomUUID();
  const modIndependent = randomUUID();
  const modReporter = randomUUID();
  const modBump = randomUUID();
  const authorX = randomUUID();
  const reader1 = randomUUID();
  const reader2 = randomUUID();
  const reader3 = randomUUID();
  let authorNovelId = '';
  let authorReviewId = '';
  let publishedNovelId = '';
  let server: Server;
  let base = '';

  const mint = (userId: string, role: string, ver?: number) =>
    jwt.sign({ sub: userId, role, ...(ver === undefined ? {} : { ver }) }, env.JWT_ACCESS_SECRET);

  async function insertUser(id: string, role: string, scope?: string) {
    await pool.query(
      "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,'test-only',$4,'ACTIVE')",
      [id, `pr02-${id}@example.test`, `pr02-${id.slice(0, 12)}`, role]
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

  async function insertNovel(authorId: string, title: string, synopsis: string, status: 'DRAFT' | 'PUBLISHED') {
    return (
      await pool.query(
        `insert into novels(author_id,title,slug,synopsis,status${status === 'PUBLISHED' ? ",published_at" : ''})
         values($1,$2,$3,$4,$5${status === 'PUBLISHED' ? ',now()' : ''}) returning novel_id`,
        [authorId, title, `pr02-${authorId.slice(0, 8)}-${Date.now()}`, synopsis, status]
      )
    ).rows[0].novel_id;
  }

  async function insertPendingReview(targetType: 'NOVEL' | 'CHAPTER', targetId: string, evidenceTag: string) {
    return (
      await pool.query(
        "insert into moderation_reviews(target_type,target_id,source,evidence_id) values($1,$2,'PUBLICATION_REQUEST',$3) returning review_id",
        [targetType, targetId, evidenceTag]
      )
    ).rows[0].review_id;
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

  before(async () => {
    env.MODERATOR_ENABLED = true;
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    for (const [id, role, scope] of [
      [admin, 'ADMIN', 'SUPER_ADMIN'],
      [modOwner, 'MODERATOR', undefined],
      [modIndependent, 'MODERATOR', undefined],
      [modReporter, 'MODERATOR', undefined],
      [modBump, 'MODERATOR', undefined],
      [authorX, 'AUTHOR', undefined],
      [reader1, 'READER', undefined],
      [reader2, 'READER', undefined],
      [reader3, 'READER', undefined]
    ] as Array<[string, string, string | undefined]>) {
      await insertUser(id, role, scope);
    }

    // Author novel with five publishable chapters: the submission path queues one PUBLICATION_REQUEST review.
    authorNovelId = await insertNovel(
      authorX,
      'PR-02 pending novel',
      'Bản gửi cho hàng chờ duyệt của điều hành viên với đoạn giới thiệu dài hợp lệ.',
      'DRAFT'
    );
    for (let number = 1; number <= 5; number++) {
      await pool.query(
        "insert into chapters(novel_id,chapter_number,title,content,status) values($1,$2,$3,$4,'DRAFT')",
        [authorNovelId, number, `Chương ${number}`, 'Nội dung chương hợp lệ để phát hành theo luật chương dài của nền tảng. '.repeat(12)]
      );
    }

    // Published novel: comment and report scenarios need public content.
    publishedNovelId = await insertNovel(
      authorX,
      'PR-02 published novel',
      'Truyện đã phát hành dùng cho bình luận và các kịch bản báo cáo điều hành viên.',
      'PUBLISHED'
    );
    await pool.query(
      "insert into chapters(novel_id,chapter_number,title,content,status) values($1,1,'Chương công khai','Nội dung chương công khai cho bình luận của chương một.','PUBLISHED')",
      [publishedNovelId]
    );

    //reader2 carries one real WARN so the detail view reports the bounded violation history.
    await withPostgresTransaction((client) =>
      applySanction(client, adminAuth, {
        targetType: 'USER',
        targetId: reader2,
        action: 'WARN',
        reason: 'Lịch sử vi phạm mẫu cho hiển thị hồ sơ.'
      })
    );

    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}${env.API_PREFIX}`;
  });

  after(async () => {
    server?.close();
    await disconnectPostgres();
    await disconnectMongo();
  });

  test('E02: /moderator/access exposes the operational permission set only to moderators', async () => {
    const mine = await bearerCall('/moderator/access', { token: mint(modOwner, 'MODERATOR') });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.role, 'MODERATOR');
    assert.deepEqual(mine.body.data.permissions, [
      'publication.review',
      'comment.review',
      'report.review',
      'sanction.warn',
      'sanction.hide',
      'discussion.operate',
      'escalation.submit'
    ]);
    assert.equal((await bearerCall('/moderator/access', { token: mint(reader1, 'READER') })).status, 403);
    assert.equal((await bearerCall('/moderator/access')).status, 401);
  });

  test('E03: the operational routes deny while MODERATOR_ENABLED is off', async () => {
    env.MODERATOR_ENABLED = false;
    try {
      const deniedList = await bearerCall('/moderator/reviews?status=PENDING', { token: mint(modIndependent, 'MODERATOR') });
      assert.equal(deniedList.status, 403);
      assert.equal(deniedList.body.error.code, 'MOD_PERMISSION');
      const deniedResolve = await bearerCall(`/moderator/reviews/${randomUUID()}/resolve`, {
        method: 'POST',
        token: mint(modIndependent, 'MODERATOR'),
        body: { decision: 'APPROVED' }
      });
      assert.equal(deniedResolve.status, 403);
      assert.equal(deniedResolve.body.error.code, 'MOD_PERMISSION');
    } finally {
      env.MODERATOR_ENABLED = true;
    }
    assert.equal(
      (await bearerCall('/moderator/reviews?status=PENDING', { token: mint(modIndependent, 'MODERATOR') })).status,
      200
    );
  });

  test('E03: an author submission lands on the shared pending queue envelope', async () => {
    const submission = await submitPublish({ userId: authorX, role: 'AUTHOR' } as AuthContext, authorNovelId);
    assert.ok(submission.moderationReviewId, 'submission must queue a review');
    authorReviewId = submission.moderationReviewId as string;
    const queue = await bearerCall('/moderator/reviews?status=PENDING', { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(queue.status, 200);
    const row = queue.body.data.find((item: { reviewId: string }) => item.reviewId === authorReviewId);
    assert.ok(row, 'queue lists the author submission');
    assert.equal(row.source, 'PUBLICATION_REQUEST');
    assert.equal(row.targetType, 'NOVEL');
    assert.equal(row.reportCount, 0);
  });

  test('E03: review detail returns the target and the bounded owner violation history', async () => {
    const detail = await bearerCall(`/moderator/reviews/${authorReviewId}`, { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.reviewId, authorReviewId);
    assert.equal(detail.body.data.targetType, 'NOVEL');
    assert.ok(Array.isArray(detail.body.data.ownerViolations));
    assert.equal((await bearerCall(`/moderator/reviews/${authorReviewId}`, { token: mint(reader1, 'READER') })).status, 403);
  });

  test('D01: a moderator cannot resolve a review of their own work', async () => {
    const modNovelId = await insertNovel(
      modOwner,
      'PR-02 mod owned novel',
      'Truyện của điều hành viên để chứng minh quy tắc độc lập khi tự duyệt chính tác phẩm của mình.',
      'DRAFT'
    );
    const reviewId = await insertPendingReview('NOVEL', modNovelId, 'pr02-self');
    const conflict = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modOwner, 'MODERATOR'),
      body: { decision: 'REJECTED', reason: 'Tự duyet tác phẩm của mình' }
    });
    assert.equal(conflict.status, 403);
    assert.equal(conflict.body.error.code, 'MOD_CONFLICT');
    const still = (await pool.query('select status,reviewed_by from moderation_reviews where review_id=$1', [reviewId])).rows[0];
    assert.equal(still.status, 'PENDING');
    assert.equal(still.reviewed_by, null);
  });

  test('E03: an independent moderator approves the queue entry and the audit names them', async () => {
    const resolved = await bearerCall(`/moderator/reviews/${authorReviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED' }
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, 'APPROVED');
    const novel = (await pool.query('select status from novels where novel_id=$1', [authorNovelId])).rows[0];
    assert.equal(novel.status, 'PUBLISHED');
    const auditRow = (
      await pool.query('select actor_id from admin_audit where action=$1 and target_id=$2', ['PUBLICATION_APPROVED', authorNovelId])
    ).rows[0];
    assert.equal(auditRow.actor_id, modIndependent);
  });

  test('E03: two moderators race one entry and exactly one decision wins', async () => {
    const reviewId = await insertPendingReview('NOVEL', publishedNovelId, 'pr02-race');
    const outcomes = await Promise.all([
      bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
        method: 'POST',
        token: mint(modOwner, 'MODERATOR'),
        body: { decision: 'REJECTED', reason: 'Không đủ chất lượng công khai.' }
      }),
      bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
        method: 'POST',
        token: mint(modIndependent, 'MODERATOR'),
        body: { decision: 'REJECTED', reason: 'Nội dung không phù hợp Chuẩn cộng đồng.' }
      })
    ]);
    const byStatus = outcomes.map((outcome) => outcome.status).sort((a, b) => a - b);
    assert.deepEqual(byStatus, [200, 409], 'exactly one resolve wins');
    const stored = (
      await pool.query('select status,reviewed_by from moderation_reviews where review_id=$1', [reviewId])
    ).rows[0];
    assert.equal(stored.status, 'REJECTED');
    assert.ok([modOwner, modIndependent].includes(stored.reviewed_by));
  });

  test('E03: REVISION_REQUIRED demands a reason and leaves the live version untouched', async () => {
    const chapter = (
      await pool.query(
        "insert into chapters(novel_id,chapter_number,title,content,status) values($1,2,'Chương hai','Nội dung chương hai công khai trước khi yêu cầu sửa.','PUBLISHED') returning chapter_id",
        [publishedNovelId]
      )
    ).rows[0];
    const reviewId = (
      await pool.query(
        "insert into moderation_reviews(target_type,target_id,source,evidence_id,submitted_content) values('CHAPTER',$1,'PUBLICATION_REQUEST','pr02-revision',$2::jsonb) returning review_id",
        [chapter.chapter_id, JSON.stringify({ title: 'Chương hai', content: 'Nội dung chương hai công khai trước khi yêu cầu sửa.' })]
      )
    ).rows[0].review_id;
    const missingReason = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'REVISION_REQUIRED' }
    });
    assert.equal(missingReason.status, 422);
    assert.equal(missingReason.body.error.code, 'ADMIN_003');
    const withReason = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'REVISION_REQUIRED', reason: 'Cần chỉnh diễn đạt trước khi xuất bản.' }
    });
    assert.equal(withReason.status, 200);
    assert.equal(withReason.body.data.status, 'REVISION_REQUIRED');
    const publicChapter = (await pool.query('select content,status from chapters where chapter_id=$1', [chapter.chapter_id])).rows[0];
    assert.equal(publicChapter.content, 'Nội dung chương hai công khai trước khi yêu cầu sửa.');
    assert.equal(publicChapter.status, 'PUBLISHED');
  });

  test('D04-B: a bumped access version invalidates the stale decision', async () => {
    const reviewId = await insertPendingReview('NOVEL', publishedNovelId, 'pr02-bump');
    await pool.query('update users set access_version=access_version+1 where user_id=$1', [modBump]);
    const stale = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modBump, 'MODERATOR'),
      body: { decision: 'REJECTED', reason: 'Phiên đăng nhập cũ' }
    });
    assert.equal(stale.status, 401);
    assert.equal(stale.body.error.code, 'AUTH_009');
    const still = (await pool.query('select status from moderation_reviews where review_id=$1', [reviewId])).rows[0];
    assert.equal(still.status, 'PENDING');
    const fresh = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modBump, 'MODERATOR', 1),
      body: { decision: 'REJECTED', reason: 'Phiên đăng nhập mới xử lý hồ sơ này.' }
    });
    assert.equal(fresh.status, 200);
  });

  test('E03: a flagged comment resolves through the comment variant and retries stay idempotent', async () => {
    const flagged = await bearerCall(`/novels/${publishedNovelId}/comments`, {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { content: 'This comment contains harassment which triggers filter' }
    });
    assert.equal(flagged.status, 201);
    assert.equal(flagged.body.data.status, 'PENDING_MODERATION');
    const reviewId = flagged.body.data.moderationReviewId as string;
    assert.ok(reviewId);
    const approved = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED' }
    });
    assert.equal(approved.status, 200);
    const retry = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED' }
    });
    assert.equal(retry.status, 200, 'retry after commit converges to the same decision');
    const flip = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'REJECTED', reason: 'Đổi ý sau khi đã duyệt' }
    });
    assert.equal(flip.status, 409);
    const comment = await getMongoDatabase().collection('comments').findOne({ commentId: flagged.body.data.commentId });
    assert.equal(comment?.status, 'APPROVED');
  });

  test('E04: a user report warns through the moderator path with a durable sanction', async () => {
    const report = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { targetType: 'USER', targetId: reader2, reason: 'SPAM', description: 'Gửi tin quấy rối nhiều lần.' }
    });
    assert.equal(report.status, 201);
    const reviewId = report.body.data.moderationReviewId as string;
    const warned = await bearerCall(`/moderator/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED', action: 'WARN', reason: 'Cảnh cáo vì quấy rối người khác.' }
    });
    assert.equal(warned.status, 200);
    assert.equal(warned.body.data.action, 'WARN');
    const sanction = (await pool.query('select action,active,owner_id from admin_sanctions where review_id=$1', [reviewId])).rows[0];
    assert.ok(sanction, 'an accepted report records its sanction');
    assert.equal(sanction.action, 'WARN');
    assert.equal(sanction.active, true);
    assert.equal(sanction.owner_id, reader2);
    const detail = await bearerCall(`/moderator/reviews/${reviewId}`, { token: mint(modIndependent, 'MODERATOR') });
    assert.ok(detail.body.data.ownerViolations.length >= 1, 'detail exposes the bounded violation history');
  });

  test('E04: duplicate reports from different readers merge into one review', async () => {
    const witness = await insertReader();
    const first = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { targetType: 'USER', targetId: witness, reason: 'SPAM', description: 'Báo cáo lần một.' }
    });
    const second = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader3, 'READER'),
      body: { targetType: 'USER', targetId: witness, reason: 'SPAM', description: 'Báo cáo lần hai.' }
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.body.data.moderationReviewId, first.body.data.moderationReviewId);
    const merged = (
      await pool.query('select count(*)::int as n from reports where review_id=$1', [first.body.data.moderationReviewId])
    ).rows[0];
    assert.equal(merged.n, 2);
    const sameReporter = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { targetType: 'USER', targetId: witness, reason: 'SPAM', description: 'Báo cáo trùng lặp.' }
    });
    assert.equal(sameReporter.status, 409);
  });

  test('E04: moderators cannot LOCK, resolve privileged targets, or decide their own report', async () => {
    const lockTarget = await insertReader();
    const lockReport = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { targetType: 'USER', targetId: lockTarget, reason: 'SPAM', description: 'Lặp vi phạm nhiều lần.' }
    });
    const lockAttempt = await bearerCall(`/moderator/reviews/${lockReport.body.data.moderationReviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED', action: 'LOCK', reason: 'Nghiêm trọng' }
    });
    assert.equal(lockAttempt.status, 403);
    assert.equal(lockAttempt.body.error.code, 'MOD_LOCK_ADMIN');

    const privileged = await bearerCall('/reports', {
      method: 'POST',
      token: mint(reader1, 'READER'),
      body: { targetType: 'USER', targetId: modOwner, reason: 'ABUSE', description: 'Nghi lạm quyền điều hành.' }
    });
    const privilegedAttempt = await bearerCall(`/moderator/reviews/${privileged.body.data.moderationReviewId}/resolve`, {
      method: 'POST',
      token: mint(modIndependent, 'MODERATOR'),
      body: { decision: 'APPROVED', action: 'WARN', reason: 'Báo cáo nhắm điều hành viên.' }
    });
    assert.equal(privilegedAttempt.status, 403);
    assert.equal(privilegedAttempt.body.error.code, 'MOD_PRIVILEGED_TARGET');

    const witness = await insertReader();
    const own = await bearerCall('/reports', {
      method: 'POST',
      token: mint(modReporter, 'MODERATOR'),
      body: { targetType: 'USER', targetId: witness, reason: 'SPAM', description: 'Người này spam nhóm.' }
    });
    assert.equal(own.status, 201);
    const selfAttempt = await bearerCall(`/moderator/reviews/${own.body.data.moderationReviewId}/resolve`, {
      method: 'POST',
      token: mint(modReporter, 'MODERATOR'),
      body: { decision: 'APPROVED', action: 'WARN', reason: 'Tự xử lý báo cáo của chính mình.' }
    });
    assert.equal(selfAttempt.status, 403);
    assert.equal(selfAttempt.body.error.code, 'MOD_CONFLICT');
  });

  test('E09: the admin moderation contract is unchanged on the shared service', async () => {
    const reviewId = await insertPendingReview('NOVEL', publishedNovelId, 'pr02-admin');
    const adminResolve = await bearerCall(`/admin/moderation/reviews/${reviewId}/resolve`, {
      method: 'POST',
      token: mint(admin, 'ADMIN'),
      body: { decision: 'REJECTED', reason: 'Quản trị vẫn duyệt theo hợp đồng cũ.' }
    });
    assert.equal(adminResolve.status, 200);
    const adminList = await bearerCall('/admin/moderation/reviews?status=PENDING', { token: mint(admin, 'ADMIN') });
    assert.equal(adminList.status, 200);
    assert.ok(Array.isArray(adminList.body.data));
    const noAdminToken = await bearerCall('/admin/moderation/reviews?status=PENDING', { token: mint(modIndependent, 'MODERATOR') });
    assert.equal(noAdminToken.status, 403, 'a moderator must not reach the admin routes');
  });
});
