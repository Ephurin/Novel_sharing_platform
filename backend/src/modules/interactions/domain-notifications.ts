import { notifyComment } from './comment-notifications.js';
import type { CommentDocument } from './comments.repository.js';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { createNotification } from './notifications.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { logger } from '../../core/logger/logger.js';
import { approvedCommentFilter } from './comments.repository.js';
import { isPublicDiscussionTarget } from '../discussions/discussions.read.js';
let running = false;
// Pending flags live with the originating records. Idempotent IDs allow retry after crashes.
export async function deliverDomainNotifications() {
  if (running) return; running = true;
  try {
    const comments = getMongoDatabase().collection('comments');
    for (const comment of await comments.find({ notificationPending: true, ...approvedCommentFilter }).limit(100).toArray()) {
      await notifyComment(comment as unknown as CommentDocument);
      await comments.updateOne({ _id: comment._id, updatedAt: comment.updatedAt }, { $set: { notificationPending: false } });
    }
    const pool = getPostgresPool();
    const events = await pool.query('select * from notification_events where delivered_at is null order by created_at limit 100');
    for (const event of events.rows) {
      if (event.type === 'DISCUSSION_REPLY') {
        const commentId = event.payload?.commentId;
        const visible = typeof commentId === 'string' && await isPublicDiscussionTarget('DISCUSSION_COMMENT', commentId);
        if (!visible) {
          await pool.query('update notification_events set delivered_at = now() where event_key = $1', [event.event_key]);
          continue;
        }
      }
      if (event.type === 'NOVEL_CHAPTER_PUBLISHED') {
        const eligible = await pool.query(`select 1 from novel_notification_subscriptions s
          join users u on u.user_id=s.user_id join novels n on n.novel_id=s.novel_id
          join chapters c on c.novel_id=n.novel_id and c.chapter_id=$3
          where s.novel_id=$1 and s.user_id=$2 and s.enabled
            and u.role in ('READER','MODERATOR') and u.status='ACTIVE' and u.deleted_at is null
            and n.status='PUBLISHED' and n.deleted_at is null and c.status='PUBLISHED' and c.deleted_at is null`,
        [event.payload.novelId,event.user_id,event.payload.chapterId]);
        if (!eligible.rowCount) {
          await pool.query('update notification_events set delivered_at=now() where event_key=$1', [event.event_key]);
          continue;
        }
      }
      await createNotification({ eventKey: event.event_key, userId: event.user_id, type: event.type, title: event.title, content: event.content, payload: event.payload });
      await pool.query('update notification_events set delivered_at = now() where event_key = $1', [event.event_key]);
    }
    const reviews = await pool.query("select * from moderation_reviews where notification_pending = true and status in ('APPROVED','REJECTED','REVISION_REQUIRED') limit 100");
    for (const review of reviews.rows) {
      if (['NOVEL','CHAPTER'].includes(review.target_type)) {
        const chapter = review.target_type === 'CHAPTER' ? await findChapterById(review.target_id) : null;
        const novel = await findNovelById(chapter?.novelId ?? review.target_id);
        if (novel) await createNotification({ eventKey: 'moderation:' + review.review_id, userId: novel.authorId, type: 'PUBLICATION_REVIEW', title: review.status === 'APPROVED' ? 'Nội dung đã được duyệt' : 'Nội dung cần chỉnh sửa', content: (chapter?.title ?? novel.title) + (review.reason ? ' · ' + review.reason : ''), payload: { href: '/author/novels/' + novel.novelId, reviewId: review.review_id } });
      }
      await pool.query('update moderation_reviews set notification_pending = false where review_id = $1', [review.review_id]);
    }
  } catch (error) { logger.error({ err: error }, 'Domain notification delivery will retry'); }
  finally { running = false; }
}
