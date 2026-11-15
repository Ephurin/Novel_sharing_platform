import type { PoolClient } from 'pg';
import { enqueueNotification } from './notification-events.js';

// SRS interaction-social-service §3.4: when a chapter goes public, readers who follow the author get one
// notification. Readers who turned on notifications for the novel itself are served by the
// notify_new_chapter_subscribers trigger (migration 021, NOVEL_CHAPTER_PUBLISHED); they are skipped here, and the
// shared event key makes the two paths collapse into one event per chapter and reader whatever runs first.
export async function notifyFollowersOfPublishedChapter(client: Pick<PoolClient, 'query'>, chapterId: string) {
  const chapter = (await client.query(`
    select c.chapter_id, c.title, c.chapter_number, n.novel_id, n.title as novel_title, n.author_id
    from chapters c join novels n on n.novel_id = c.novel_id
    where c.chapter_id = $1 and c.status = 'PUBLISHED' and c.deleted_at is null
      and n.status = 'PUBLISHED' and n.deleted_at is null`, [chapterId])).rows[0];
  if (!chapter) return 0;

  const followers = await client.query<{ user_id: string }>(`
    select f.follower_id as user_id
    from follows f join users u on u.user_id = f.follower_id
    where f.author_id = $1 and f.follower_id <> $1
      and u.status = 'ACTIVE' and u.deleted_at is null
      and not exists (select 1 from novel_notification_subscriptions s
                      where s.novel_id = $2 and s.user_id = f.follower_id and s.enabled)`,
    [chapter.author_id, chapter.novel_id]);

  for (const { user_id: userId } of followers.rows) {
    await enqueueNotification(client, {
      eventKey: `chapter-published:${chapterId}:${userId}`,
      userId,
      type: 'NEW_CHAPTER',
      title: `Chương mới: ${chapter.novel_title}`,
      content: `Chương ${chapter.chapter_number}: ${chapter.title}`,
      payload: { href: '/reader/chapters/' + chapterId, novelId: chapter.novel_id, chapterId }
    });
  }
  return followers.rowCount ?? 0;
}
