import type { PoolClient } from 'pg';
import { enqueueNotification } from './notification-events.js';

// SRS interaction-social-service §3.4: when a chapter goes public, every reader who follows the author
// (or the novel) gets one notification. The event key makes repeated publishes of the same chapter a no-op.
export async function notifyFollowersOfPublishedChapter(client: Pick<PoolClient, 'query'>, chapterId: string) {
  const chapter = (await client.query(`
    select c.chapter_id, c.title, c.chapter_number, n.novel_id, n.title as novel_title, n.author_id
    from chapters c join novels n on n.novel_id = c.novel_id
    where c.chapter_id = $1 and c.status = 'PUBLISHED' and c.deleted_at is null
      and n.status = 'PUBLISHED' and n.deleted_at is null`, [chapterId])).rows[0];
  if (!chapter) return 0;

  const followers = await client.query<{ user_id: string }>(`
    select follower_id as user_id from follows where author_id = $1
    union
    select user_id from novel_follows where novel_id = $2`, [chapter.author_id, chapter.novel_id]);

  let queued = 0;
  for (const { user_id: userId } of followers.rows) {
    if (userId === chapter.author_id) continue;
    await enqueueNotification(client, {
      eventKey: `new-chapter:${chapterId}:${userId}`,
      userId,
      type: 'NEW_CHAPTER',
      title: `Chương mới: ${chapter.novel_title}`,
      content: `Chương ${chapter.chapter_number}: ${chapter.title}`,
      payload: { href: '/reader/chapters/' + chapterId, novelId: chapter.novel_id, chapterId }
    });
    queued += 1;
  }
  return queued;
}
