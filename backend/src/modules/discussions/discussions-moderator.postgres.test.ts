import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';

type Fixture = { userId: string; identifier: string; password: string };

test('PR-03 moderator discussion operations: reads, single-change commands, move and denials', {
  skip: process.env.DISCUSSIONS_TEST_DATABASE !== '1'
}, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { connectMongo, disconnectMongo } = await import('../../core/database/mongo.js');
  const { createApp } = await import('../../app.js');
  const { env } = await import('../../core/config/env.js');
  const db = getPostgresPool();
  let server: Server | undefined;
  const previousModeratorEnabled = env.MODERATOR_ENABLED;
  env.MODERATOR_ENABLED = true;
  try {
    await connectMongo();
    const stamp = randomUUID().slice(0, 8);
    const password = 'Fixture1Pass';
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(password, 4);
    const insertUser = async (role: string, scope?: string): Promise<Fixture> => {
      const name = role.toLowerCase() + randomUUID().slice(0, 8);
      const { rows } = await db.query<{ user_id: string }>(
        "insert into users(email, username, password_hash, role, status) values($1, $2, $3, $4, 'ACTIVE') returning user_id",
        [name + '@test.invalid', name, hash, role]
      );
      if (scope) {
        await db.query("insert into admin_access(user_id, scope) values($1, $2)", [rows[0].user_id, scope]);
      }
      return { userId: rows[0].user_id, identifier: name, password };
    };
    const author = await insertUser('READER');
    const commenter = await insertUser('READER');
    const moderator = await insertUser('MODERATOR');
    const finance = await insertUser('ADMIN', 'FINANCE');
    const userManager = await insertUser('ADMIN', 'USER_MANAGER');
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
    const moderatorToken = await login(moderator);
    const financeToken = await login(finance);
    const userManagerToken = await login(userManager);
    const contentAdminToken = await login(contentAdmin);

    const categoryRows = await db.query<{ slug: string; category_id: string }>(
      "select slug,category_id::text as category_id from discussion_categories where slug in ('goc-tac-gia','hoi-dap','thao-luan-truyen','thong-bao-cong-dong')"
    );
    const categoryIdFor = (slug: string) => categoryRows.rows.find(item => item.slug === slug)?.category_id;
    const gocTacGiaId = categoryIdFor('goc-tac-gia');
    const hoiDapId = categoryIdFor('hoi-dap');
    const retiredId = categoryIdFor('thao-luan-truyen');
    const officialId = categoryIdFor('thong-bao-cong-dong');
    assert.ok(gocTacGiaId && hoiDapId && retiredId && officialId);

    const created = await call<{ topicId: string }>(
      'POST', '/discussions',
      { categoryId: gocTacGiaId, title: 'PR-03 topic ' + stamp, body: 'Moderated body' },
      authorToken
    );
    assert.equal(created.status, 200);
    const topicId = created.data.topicId;
    const comment = await call<{ commentId: string }>(
      'POST', '/discussions/' + topicId + '/comments', { body: 'Comment body' }, commenterToken
    );
    assert.equal(comment.status, 200);
    const commentId = comment.data.commentId;
    const like = await call('PUT', '/discussions/' + topicId + '/comments/' + commentId + '/reaction', undefined, commenterToken);
    assert.equal(like.status, 200);

    const modTopics = await call<{ items: Array<{ topicId: string; status: string }> }>(
      'GET', '/moderator/discussions/topics', undefined, moderatorToken
    );
    assert.equal(modTopics.status, 200);
    assert.ok(modTopics.data.items.some(item => item.topicId === topicId));
    const modComments = await call<{ items: Array<{ commentId: string }> }>(
      'GET', '/moderator/discussions/topics/' + topicId + '/comments', undefined, moderatorToken
    );
    assert.equal(modComments.status, 200);
    assert.ok(modComments.data.items.some(item => item.commentId === commentId));

    assert.equal((await call('GET', '/moderator/discussions/topics', undefined, financeToken)).status, 403);
    assert.equal((await call('GET', '/moderator/discussions/topics', undefined, commenterToken)).status, 403);
    for (const token of [financeToken, userManagerToken]) {
      const denied = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
        { isPinned: true, reason: 'finance scope cannot moderate', expected: false }, token);
      assert.equal(denied.status, 403);
      const pinnedRow = await db.query<{ is_pinned: boolean }>(
        'select is_pinned from discussion_topics where topic_id=$1', [topicId]
      );
      assert.equal(pinnedRow.rows[0].is_pinned, false);
    }

    const auditCount = async (action: string, targetId: string) =>
      (await db.query<{ count: string }>(
        'select count(*)::text as count from admin_audit where action=$1 and target_id=$2',
        [action, targetId]
      )).rows[0].count;

    const pinned = await call<{ isPinned: boolean; status: string; isLocked: boolean }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { isPinned: true, reason: 'quan trọng', expected: false }, moderatorToken
    );
    assert.equal(pinned.status, 200);
    assert.equal(pinned.data.isPinned, true);
    const auditsAfterPin = await auditCount('DISCUSSION_TOPIC_MODERATE', topicId);
    const repeatPin = await call<{ isPinned: boolean }>('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { isPinned: true, reason: 'lần nữa', expected: true }, moderatorToken
    );
    assert.equal(repeatPin.status, 200);
    assert.equal(repeatPin.data.isPinned, true);
    assert.equal(await auditCount('DISCUSSION_TOPIC_MODERATE', topicId), auditsAfterPin);

    const wrongExpected = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { isLocked: true, reason: 'expected sai', expected: true }, moderatorToken
    );
    assert.equal(wrongExpected.status, 409);
    assert.equal(wrongExpected.code, 'DISCUSSION_STATE_CONFLICT');
    const lockedRow = await db.query<{ is_locked: boolean }>(
      'select is_locked from discussion_topics where topic_id=$1', [topicId]
    );
    assert.equal(lockedRow.rows[0].is_locked, false);

    const locked = await call<{ isLocked: boolean }>('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { isLocked: true, reason: 'khóa tranh cãi', expected: false }, moderatorToken
    );
    assert.equal(locked.status, 200);
    assert.equal(locked.data.isLocked, true);

    const moved = await call<{ categoryId: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { destinationCategoryId: hoiDapId, reason: 'đúng chuyên mục hơn', expected: gocTacGiaId }, moderatorToken
    );
    assert.equal(moved.status, 200);
    assert.equal(moved.data.categoryId, hoiDapId);
    const likeCount = await db.query<{ count: string }>(
      'select count(*)::text as count from discussion_comment_likes where comment_id=$1', [commentId]
    );
    assert.equal(likeCount.rows[0].count, '1', 'move keeps comment likes');
    const commentBack = await db.query<{ topic_id: string; status: string }>(
      'select topic_id,status from discussion_comments where comment_id=$1', [commentId]
    );
    assert.equal(commentBack.rows[0].topic_id, topicId);
    assert.equal(commentBack.rows[0].status, 'VISIBLE');
    const moveAudits = await db.query<{ reason: string }>(
      "select reason from admin_audit where action='DISCUSSION_TOPIC_MOVE' and target_id=$1",
      [topicId]
    );
    assert.equal(moveAudits.rows.length, 1);
    assert.equal(moveAudits.rows[0].reason, 'đúng chuyên mục hơn');

    const moveInactive = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { destinationCategoryId: retiredId, reason: 'chuyên mục đã nghỉ', expected: hoiDapId }, moderatorToken
    );
    assert.equal(moveInactive.status, 422);
    const moveOfficial = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { destinationCategoryId: officialId, reason: 'không được', expected: hoiDapId }, moderatorToken
    );
    assert.equal(moveOfficial.status, 422);
    const categoryAfterDenied = await db.query<{ category_id: string }>(
      'select category_id from discussion_topics where topic_id=$1', [topicId]
    );
    assert.equal(categoryAfterDenied.rows[0].category_id, hoiDapId);

    const hiddenComment = await call<{ status: string }>(
      'PATCH', '/moderator/discussions/' + topicId + '/comments/' + commentId + '/moderation',
      { status: 'HIDDEN', reason: 'spam bình luận' }, moderatorToken
    );
    assert.equal(hiddenComment.status, 200);
    assert.equal(hiddenComment.data.status, 'HIDDEN');
    assert.equal((await call('GET', '/discussions/' + topicId + '/comments/' + commentId + '/location')).status, 404);

    const foreignTopic = await call<{ topicId: string }>(
      'POST', '/discussions',
      { categoryId: hoiDapId, title: 'Foreign topic ' + stamp, body: 'Foreign body' }, authorToken
    );
    assert.equal(foreignTopic.status, 200);
    const foreignComment = await call<{ commentId: string }>(
      'POST', '/discussions/' + foreignTopic.data.topicId + '/comments', { body: 'Foreign comment' }, commenterToken
    );
    assert.equal(foreignComment.status, 200);
    const crossTopic = await call(
      'PATCH',
      '/moderator/discussions/' + topicId + '/comments/' + foreignComment.data.commentId + '/moderation',
      { status: 'HIDDEN', reason: 'sai topic' }, moderatorToken
    );
    assert.equal(crossTopic.status, 404, 'a comment must belong to the moderated topic');
    const foreignStatusRow = await db.query<{ status: string }>(
      'select status from discussion_comments where comment_id=$1', [foreignComment.data.commentId]
    );
    assert.equal(foreignStatusRow.rows[0].status, 'VISIBLE');

    const selfHide = await call('PATCH', '/moderator/discussions/' + topicId + '/comments/' + commentId + '/moderation',
      { status: 'HIDDEN', reason: 'lặp trạng thái', }, moderatorToken
    );
    assert.equal(selfHide.status, 200);
    const commentModerateAudits = await auditCount('DISCUSSION_COMMENT_MODERATE', commentId);
    assert.equal(commentModerateAudits, '1', 're-sending the achieved state adds no second audit');

    const independentTopic = await call<{ topicId: string }>(
      'POST', '/discussions',
      { categoryId: hoiDapId, title: 'Independent topic ' + stamp, body: 'Own body' }, moderatorToken
    );
    assert.equal(independentTopic.status, 200);
    const independentComment = await call<{ commentId: string }>(
      'POST', '/discussions/' + independentTopic.data.topicId + '/comments', { body: 'Mod comment' }, moderatorToken
    );
    assert.equal(independentComment.status, 200);
    const selfTopicModeration = await call('PATCH', '/moderator/discussions/' + independentTopic.data.topicId + '/moderation',
      { isPinned: true, reason: 'tự quyết', expected: false }, moderatorToken
    );
    assert.equal(selfTopicModeration.status, 403);
    assert.equal(selfTopicModeration.code, 'MOD_CONFLICT');
    const ownPinnedRow = await db.query<{ is_pinned: boolean }>(
      'select is_pinned from discussion_topics where topic_id=$1', [independentTopic.data.topicId]
    );
    assert.equal(ownPinnedRow.rows[0].is_pinned, false);
    const selfCommentModeration = await call(
      'PATCH',
      '/moderator/discussions/' + independentTopic.data.topicId + '/comments/' + independentComment.data.commentId + '/moderation',
      { status: 'HIDDEN', reason: 'tự quyết comment' }, moderatorToken
    );
    assert.equal(selfCommentModeration.status, 403);
    assert.equal(selfCommentModeration.code, 'MOD_CONFLICT');
    const commentStatusRow = await db.query<{ status: string }>(
      'select status from discussion_comments where comment_id=$1', [independentComment.data.commentId]
    );
    assert.equal(commentStatusRow.rows[0].status, 'VISIBLE');

    const raceMove = call('PATCH', '/moderator/discussions/' + foreignTopic.data.topicId + '/moderation',
      { destinationCategoryId: gocTacGiaId, reason: 'race move', expected: hoiDapId }, moderatorToken
    );
    const raceEdit = call('PATCH', '/discussions/' + foreignTopic.data.topicId, { title: 'Race title ' + stamp }, authorToken);
    const [raceMoveResult, raceEditResult] = await Promise.all([raceMove, raceEdit]);
    assert.equal(raceMoveResult.status, 200);
    assert.equal(raceEditResult.status, 200);
    const racedRow = await db.query<{ title: string; category_id: string }>(
      'select title,category_id from discussion_topics where topic_id=$1', [foreignTopic.data.topicId]
    );
    assert.equal(racedRow.rows[0].title, 'Race title ' + stamp);
    assert.equal(racedRow.rows[0].category_id, gocTacGiaId);

    const hiddenTopic = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn topic', expected: 'VISIBLE' }, moderatorToken
    );
    assert.equal(hiddenTopic.status, 200);
    assert.equal((await call('GET', '/discussions/' + topicId)).status, 404);
    const hiddenList = await call<{ items: Array<{ topicId: string }> }>(
      'GET', '/moderator/discussions/topics?status=HIDDEN', undefined, moderatorToken
    );
    assert.equal(hiddenList.status, 200);
    assert.ok(hiddenList.data.items.some(item => item.topicId === topicId));

    const auditsBeforeRepeat = await auditCount('DISCUSSION_TOPIC_MODERATE', topicId);
    const hiddenRepeat = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'HIDDEN', reason: 'ẩn lần nữa', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(hiddenRepeat.status, 200);
    assert.equal(
      await auditCount('DISCUSSION_TOPIC_MODERATE', topicId),
      auditsBeforeRepeat,
      're-sending the achieved topic status adds no second audit'
    );

    const deleteTopic = await call('PATCH', '/moderator/discussions/' + topicId + '/moderation',
      { status: 'DELETED', reason: 'định xoá vĩnh viễn', expected: 'HIDDEN' }, moderatorToken
    );
    assert.equal(deleteTopic.status, 400, 'moderators cannot permanently delete someone else\'s topic');
    const topicStatusRow = await db.query<{ status: string }>(
      'select status from discussion_topics where topic_id=$1', [topicId]
    );
    assert.equal(topicStatusRow.rows[0].status, 'HIDDEN');
    const deleteComment = await call('PATCH', '/moderator/discussions/' + topicId + '/comments/' + commentId + '/moderation',
      { status: 'DELETED', reason: 'định xoá vĩnh viễn' }, moderatorToken
    );
    assert.equal(deleteComment.status, 400, 'moderators cannot permanently delete someone else\'s comment');
    const commentStateRow = await db.query<{ status: string }>(
      'select status from discussion_comments where comment_id=$1', [commentId]
    );
    assert.equal(commentStateRow.rows[0].status, 'HIDDEN');

    assert.equal((await call('POST', '/moderator/discussions/categories',
      { slug: 'khong-co-' + stamp, name: 'Không có' }, moderatorToken)).status, 404);
    assert.equal((await call('PATCH', '/moderator/discussions/categories/' + hoiDapId,
      { name: 'Đổi tên' }, moderatorToken)).status, 404);

    env.MODERATOR_ENABLED = false;
    const disabledDeny = await call('PATCH', '/moderator/discussions/' + independentTopic.data.topicId + '/moderation',
      { isLocked: true, reason: 'flag tắt', expected: false }, moderatorToken
    );
    assert.equal(disabledDeny.status, 403);
    assert.equal(disabledDeny.code, 'MOD_PERMISSION');
    env.MODERATOR_ENABLED = true;

    const raceTopic = await call<{ topicId: string }>(
      'POST', '/discussions',
      { categoryId: hoiDapId, title: 'Admin legacy topic ' + stamp, body: 'Legacy body' }, authorToken
    );
    assert.equal(raceTopic.status, 200);
    const adminStillWorks = await call<{ isPinned: boolean }>(
      'PATCH', '/admin/discussions/' + raceTopic.data.topicId + '/moderation',
      { isPinned: true, status: 'VISIBLE', reason: 'legacy admin path không đổi' }, contentAdminToken
    );
    assert.equal(adminStillWorks.status, 200, 'admin legacy multi-field moderation stays available');
    assert.equal(adminStillWorks.data.isPinned, true);
  } finally {
    env.MODERATOR_ENABLED = previousModeratorEnabled;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await disconnectMongo().catch(() => undefined);
    await disconnectPostgres();
  }
});
