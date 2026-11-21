import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';

type Review = { targetId: string; reviewId: string };
type Fixture = { userId: string; identifier: string; password: string };

test('moderation covers report dedupe, scoped admin review, hide and public visibility', {
  skip: process.env.DISCUSSIONS_TEST_DATABASE !== '1'
}, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { connectMongo, disconnectMongo } = await import('../../core/database/mongo.js');
  const { createApp } = await import('../../app.js');
  const db = getPostgresPool();
  let server: Server | undefined;
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
    const reader = await insertUser('READER');
    const reporter = await insertUser('READER');
    const moderator = await insertUser('ADMIN', 'MODERATOR');
    const finance = await insertUser('ADMIN', 'FINANCE');
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
      const payload = await response.json() as { data: T };
      return { status: response.status, data: payload.data };
    };
    const login = async (user: Fixture) => {
      const result = await call<{ accessToken: string }>('POST', '/auth/login', { identifier: user.identifier, password: user.password });
      assert.equal(result.status, 200);
      return result.data.accessToken;
    };
    const readerToken = await login(reader);
    const reporterToken = await login(reporter);
    const moderatorToken = await login(moderator);
    const financeToken = await login(finance);
    const categories = await call<Array<{ slug: string; categoryId: string }>>('GET', '/discussions/categories');
    assert.equal(categories.status, 200);
    const categoryId = categories.data.find(item => item.slug === 'thao-luan-chung')?.categoryId;
    assert.ok(categoryId);
    const guestTopics = await call('GET', '/discussions');
    assert.equal(guestTopics.status, 200);
    assert.equal((await call('GET', '/admin/moderation/reviews', undefined, readerToken)).status, 403);
    assert.equal((await call('GET', '/admin/discussions/categories', undefined, financeToken)).status, 403);
    const topic = await call<{ topicId: string }>('POST', '/discussions', { categoryId, title: 'Fixture topic ' + stamp, body: 'Body text' }, readerToken);
    assert.equal(topic.status, 200);
    const topicId = topic.data.topicId;
    const comment = await call<{ commentId: string }>('POST', '/discussions/' + topicId + '/comments', { body: 'Reported comment' }, readerToken);
    assert.equal(comment.status, 200);
    const commentId = comment.data.commentId;
    const report = await call('POST', '/reports', { targetType: 'DISCUSSION_COMMENT', targetId: commentId, reason: 'spam content' }, reporterToken);
    assert.ok([200, 201].includes(report.status));
    const duplicate = await call('POST', '/reports', { targetType: 'DISCUSSION_COMMENT', targetId: commentId, reason: 'spam content' }, reporterToken);
    assert.equal(duplicate.status, 409);
    const list = await call<Review[]>('GET', '/admin/moderation/reviews?status=PENDING', undefined, moderatorToken);
    assert.equal(list.status, 200);
    const review = list.data.find(item => item.targetId === commentId);
    assert.ok(review);
    const detail = await call<{ target: { content: string } }>('GET', '/admin/moderation/reviews/' + review.reviewId, undefined, moderatorToken);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.target.content, 'Reported comment');
    const resolved = await call('POST', '/admin/moderation/reviews/' + review.reviewId + '/resolve', {
      decision: 'APPROVED',
      action: 'HIDE',
      reason: 'confirmed spam'
    }, moderatorToken);
    assert.equal(resolved.status, 200);
    const deepLink = await call('GET', '/discussions/' + topicId + '/comments/' + commentId + '/location');
    assert.equal(deepLink.status, 404);
    const topicAfterHide = await call<{ replyCount: number }>('GET', '/discussions/' + topicId);
    assert.equal(topicAfterHide.status, 200);
    assert.equal(topicAfterHide.data.replyCount, 0);
    const topicReport = await call('POST', '/reports', { targetType: 'DISCUSSION', targetId: topicId, reason: 'off topic topic' }, reporterToken);
    assert.ok([200, 201].includes(topicReport.status));
    const topicList = await call<Review[]>('GET', '/admin/moderation/reviews?status=PENDING', undefined, moderatorToken);
    const topicReview = topicList.data.find(item => item.targetId === topicId);
    assert.ok(topicReview);
    const topicResolved = await call('POST', '/admin/moderation/reviews/' + topicReview.reviewId + '/resolve', {
      decision: 'APPROVED',
      action: 'HIDE',
      reason: 'confirmed off topic'
    }, moderatorToken);
    assert.equal(topicResolved.status, 200);
    const hiddenTopic = await call('GET', '/discussions/' + topicId);
    assert.equal(hiddenTopic.status, 404);
    const topics = await call<{ items: Array<{ topicId: string }> }>('GET', '/admin/discussions/topics?status=HIDDEN', undefined, moderatorToken);
    assert.equal(topics.status, 200);
    assert.ok(topics.data.items.some(item => item.topicId === topicId));
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await disconnectMongo().catch(() => undefined);
    await disconnectPostgres();
  }
});
