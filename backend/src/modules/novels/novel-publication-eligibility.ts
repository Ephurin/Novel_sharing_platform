import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors/app-error.js';
import { CHAPTER_CONTENT_MIN, CHAPTER_TITLE_MAX } from './chapters.schemas.js';
import { findDraftChapterByChapterId } from './draft-chapters.repository.js';

// SRS novel-chapter-service §1 (product-owner decision D2, 2026-11-09): a novel needs two valid chapters before
// its first publish request.
export const INITIAL_PUBLISH_MIN_CHAPTERS = 2;
// Chapters an author is still working on or has published. ARCHIVED chapters are set aside by the author
// (chapter-lifecycle.ts) without deleted_at, so they must not count toward the rule.
const PUBLISH_ELIGIBLE_CHAPTER_STATUSES = ['DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED'];

// FOR SHARE holds the counted rows until the publish request commits: an archive racing the submission
// either lands first (and is counted out) or waits for it.
async function countPublishReadyChapters(client: PoolClient, novelId: string) {
  const chapters = (await client.query(
    `select chapter_id, title, content from chapters
     where novel_id = $1 and deleted_at is null and status = any($2::chapter_status[])
     for share`,
    [novelId, PUBLISH_ELIGIBLE_CHAPTER_STATUSES]
  )).rows;
  let ready = 0;
  for (const chapter of chapters) {
    const draft = await findDraftChapterByChapterId(chapter.chapter_id);
    const title: string = draft?.title ?? chapter.title;
    const content: string = draft?.content ?? chapter.content ?? '';
    if (title.trim() && title.length <= CHAPTER_TITLE_MAX && content.trim().length >= CHAPTER_CONTENT_MIN) ready += 1;
  }
  return ready;
}

export async function assertNovelReadyForPublication(client: PoolClient, novelId: string) {
  const readyChapters = await countPublishReadyChapters(client, novelId);
  if (readyChapters < INITIAL_PUBLISH_MIN_CHAPTERS) {
    throw new AppError(422, 'VALIDATION_002',
      `Truyện cần ít nhất ${INITIAL_PUBLISH_MIN_CHAPTERS} chương hợp lệ (tiêu đề dưới ${CHAPTER_TITLE_MAX + 1} ký tự, nội dung từ ${CHAPTER_CONTENT_MIN} ký tự) trước khi gửi xuất bản.`,
      { readyChapters, requiredChapters: INITIAL_PUBLISH_MIN_CHAPTERS });
  }
}
