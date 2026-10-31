import { getPostgresPool } from '../../core/database/postgres.js';
import { findCommentRecordById } from '../interactions/comments.repository.js';

export async function getAdminReviewTarget(type: string, targetId: string) {
  const pool = getPostgresPool();
  if (type === 'COMMENT') {
    const comment = await findCommentRecordById(targetId);
    if (!comment) return null;
    const result = await pool.query(
      `select u.username, n.title as novel_title, c.title as chapter_title from users u left join novels n on n.novel_id=$2 left join chapters c on c.chapter_id=$3 where u.user_id=$1`,
      [comment.userId, comment.novelId, comment.chapterId]
    );
    return {
      title: 'Bình luận độc giả',
      content: comment.content,
      username: result.rows[0]?.username,
      novelTitle: result.rows[0]?.novel_title,
      chapterTitle: result.rows[0]?.chapter_title,
      novelId: comment.novelId,
      chapterId: comment.chapterId,
      status: comment.status,
      deletedAt: comment.deletedAt
    };
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(targetId)) return null;
  if (type === 'NOVEL') {
    const result = await pool.query(
      `select n.*, u.username from novels n join users u on u.user_id=n.author_id where novel_id=$1`,
      [targetId]
    );
    const row = result.rows[0];
    return row
      ? {
          title: row.title,
          content: row.synopsis,
          username: row.username,
          novelId: row.novel_id,
          status: row.status,
          deletedAt: row.deleted_at
        }
      : null;
  }
  if (type === 'CHAPTER') {
    const result = await pool.query(
      `select c.*, n.title as novel_title, u.username from chapters c join novels n on n.novel_id=c.novel_id join users u on u.user_id=n.author_id where chapter_id=$1`,
      [targetId]
    );
    const row = result.rows[0];
    return row
      ? {
          title: row.title,
          content: row.content,
          username: row.username,
          novelTitle: row.novel_title,
          novelId: row.novel_id,
          chapterId: row.chapter_id,
          status: row.status,
          deletedAt: row.deleted_at
        }
      : null;
  }
  if (type === 'USER') {
    const result = await pool.query(
      `select u.username,u.status,p.display_name,p.bio from users u left join user_profiles p on p.user_id=u.user_id where u.user_id=$1`,
      [targetId]
    );
    const row = result.rows[0];
    return row
      ? {
          title: row.display_name || row.username,
          content: row.bio,
          username: row.username,
          status: row.status
        }
      : null;
  }
  return null;
}
