import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

test('discussions use Postgres for public pagination, reply trees, counters and permissions', {
  skip: process.env.DISCUSSIONS_TEST_DATABASE !== '1'
}, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const read = await import('./discussions.read.js');
  const write = await import('./discussions.write.js');
  try {
    const db = getPostgresPool();
    const stamp = randomUUID().slice(0, 8);
    const createUser = async (role: 'READER' | 'AUTHOR') => {
      const name = role.toLowerCase() + stamp;
      const { rows } = await db.query<{ user_id: string }>(
        "insert into users(email, username, password_hash, role, status) values($1, $2, 'fixture', $3, 'ACTIVE') returning user_id",
        [name + '@test.invalid', name, role]
      );
      return { userId: rows[0].user_id, role };
    };
    const reader = await createUser('READER');
    const author = await createUser('AUTHOR');
    const categories = await read.listCategories();
    const categoryId = categories.find(category => category.slug === 'thao-luan-chung')!.categoryId;
    const { topicId, topicSlug } = await write.createTopic(author, {
      categoryId, title: 'Ki\u1ebfm hi\u1ec7p ' + stamp, body: 'First fixture'
    });
    const { topicId: second } = await write.createTopic(reader, { categoryId, title: 'Kiem ' + stamp, body: 'Second fixture' });
    const first = await read.listTopics({ q: 'kiem ' + stamp, sort: 'newest', limit: 1 });
    assert.equal(first.items[0].topicId, second);
    assert.ok(first.nextCursor);
    assert.equal((await read.listTopics({ q: 'kiem ' + stamp, sort: 'newest', limit: 1, cursor: first.nextCursor })).items[0].topicId, topicId);
    assert.equal((await read.getTopic(topicId)).category.categoryId, categoryId);
    assert.deepEqual(await read.getTopicLocator({ topicSlug }), { topicId, topicSlug });
    assert.deepEqual(await read.getTopicLocator({ topicId }), { topicId, topicSlug });
    assert.equal((await read.getTopic(topicId)).viewCount, 0);
    await write.updateTopic(author, topicId, { body: 'Edited by its owner' });
    assert.equal((await read.getTopic(topicId)).body, 'Edited by its owner');
    await assert.rejects(write.updateTopic(reader, topicId, { body: 'Forbidden' }), { httpStatus: 403 });
    const root = await write.createComment(reader, topicId, { body: 'Root' });
    const reply = await write.createComment(author, topicId, { body: 'Reply', replyToId: root });
    const nested = await write.createComment(reader, topicId, { body: 'Next reply', replyToId: reply });
    assert.equal((await read.locateComment(topicId, nested)).root.commentId, root);
    await write.setLike(reader, topicId, reply, true);
    await write.setLike(reader, topicId, reply, true);
    assert.equal((await read.listComments(topicId, { rootId: root, limit: 20 }, reader.userId)).items[0].likeCount, 1);
    await write.recordView(topicId, 'g:' + stamp);
    await write.recordView(topicId, 'g:' + stamp);
    assert.equal((await read.getTopic(topicId)).viewCount, 1);
    // Unread state rides on the same view rows: the viewer key that opened the topic
    // reads as seen, an unseen key reads as unread, and a request without a key
    // claims nothing instead of marking the whole board unread.
    const seen = await read.listTopics({ q: 'kiem ' + stamp, sort: 'newest', limit: 5 }, undefined, 'g:' + stamp);
    assert.equal(seen.items.find(item => item.topicId === topicId)?.viewerViewed, true);
    const unseen = await read.listTopics({ q: 'kiem ' + stamp, sort: 'newest', limit: 5 }, undefined, 'g:other-' + stamp);
    assert.equal(unseen.items.find(item => item.topicId === topicId)?.viewerViewed, false);
    const anonymous = await read.listTopics({ q: 'kiem ' + stamp, sort: 'newest', limit: 5 });
    assert.equal(anonymous.items.find(item => item.topicId === topicId)?.viewerViewed, undefined);
    await write.deleteComment(reader, topicId, root);
    assert.equal((await read.listComments(topicId, { limit: 20 })).items[0].body, '');
    assert.equal((await read.getTopic(topicId)).replyCount, 2);
    const community = await read.getCommunityOverview();
    assert.ok(community.stats.memberCount >= 2);
    assert.ok(community.stats.topicCount >= 1);
    assert.ok(community.stats.commentCount >= 1);
    assert.ok(community.trending.length <= 3);
    assert.ok(community.trending.every(topic => topic.status === 'VISIBLE'));
    assert.ok(community.trending.some(topic => topic.topicId === topicId));
    const outbox = await db.query("select user_id from notification_events where event_key = $1", ['discussion-comment:' + nested]);
    assert.equal(outbox.rows[0].user_id, author.userId);
    await db.query("update discussion_topics set is_locked = true where topic_id = $1", [topicId]);
    await assert.rejects(write.createComment(author, topicId, { body: 'Blocked' }), { httpStatus: 409 });
    await assert.rejects(write.updateTopic(author, topicId, { title: 'Blocked' }), { httpStatus: 409 });
    await db.query("update discussion_topics set status = 'HIDDEN' where topic_id=$1", [topicId]);
    await assert.rejects(read.getTopicLocator({ topicSlug }), { httpStatus: 404 });
    assert.ok((await read.listOwnTopics(author.userId)).items.some(item => item.topicId === topicId && item.status === 'HIDDEN'));
    await write.deleteTopic(author, topicId);
    await assert.rejects(read.getTopic(topicId), { httpStatus: 404 });
    assert.ok((await read.listOwnTopics(author.userId)).items.some(item => item.topicId === topicId && item.status === 'DELETED'));
  } finally {
    await disconnectPostgres();
  }
});
