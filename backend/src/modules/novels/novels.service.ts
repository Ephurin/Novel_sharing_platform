import { isContentAdmin } from '../../core/security/auth-context.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { randomUUID } from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { slugify } from '../../core/utils/slug.js';
import { checkContent } from '../content-control/content-control.service.js';
import type { CreateNovelInput, ListNovelsInput, UpdateNovelInput } from './novels.schemas.js';
import type { PoolClient } from 'pg';
import { CHAPTER_CONTENT_MIN, CHAPTER_TITLE_MAX } from './chapters.schemas.js';
import { findDraftChapterByChapterId } from './draft-chapters.repository.js';
import {
  createNovel as createNovelRow,
  findNovelById,
  getNovelUnlockEarnings,
  listNovels as listNovelRows,
  listNovelsByAuthor,
  publishNovel,
  softDeleteNovel,
  submitNovelForPublish,
  updateNovel as updateNovelRow,
  upsertGenre
} from './novels.repository.js';

function assertNovelOwner(novel: { authorId: string }, auth: AuthContext) {
  if (isContentAdmin(auth)) {
    return;
  }

  if (novel.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

// novels.slug is varchar(255); keep room for the 9-character suffix so a long title cannot overflow it.
const SLUG_BASE_MAX = 200;

function makeUniqueSlug(title: string) {
  const baseSlug = slugify(title).slice(0, SLUG_BASE_MAX).replace(/-+$/, '') || 'novel';
  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export async function createNovel(auth: AuthContext, input: CreateNovelInput) {
  return withPostgresTransaction(async (client) => {
    const genreId = await upsertGenre(client, input.genres !== undefined ? input.genres[0] : input.genre);

    return createNovelRow(client, {
      ...input,
      authorId: auth.userId,
      slug: makeUniqueSlug(input.title),
      genreId
    });
  });
}

export async function listNovels(input: ListNovelsInput) {
  if (input.status && input.status !== 'PUBLISHED') throw new AppError(403, 'CONTENT_005', 'Use the authenticated author workspace to read drafts');
  const result = await listNovelRows(input);
  const totalPages = Math.ceil(result.totalItems / input.limit);

  return {
    data: result.items,
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages
    }
  };
}

export async function listMyNovels(auth: AuthContext, input: ListNovelsInput) {
  const result = await listNovelsByAuthor(auth.userId, input);
  const totalPages = Math.ceil(result.totalItems / input.limit);

  return {
    data: result.items,
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages
    }
  };
}

export async function getNovel(novelId: string) {
  const novel = await findNovelById(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return novel;
}

export async function getNovelEarnings(auth: AuthContext, novelId: string) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);
  return { unlockCoins: await getNovelUnlockEarnings(novelId) };
}

export async function updateNovel(auth: AuthContext, novelId: string, input: UpdateNovelInput) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);

  const updatedNovel = await updateNovelRow(novelId, input);
  if (!updatedNovel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return updatedNovel;
}

export async function deleteNovel(auth: AuthContext, novelId: string) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);
  await softDeleteNovel(novelId);
}

// SRS novel-chapter-service §1: a novel needs five valid chapters before its publish request.
export const INITIAL_PUBLISH_MIN_CHAPTERS = 5;
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
    if (title.length <= CHAPTER_TITLE_MAX && content.trim().length >= CHAPTER_CONTENT_MIN) ready += 1;
  }
  return ready;
}

export async function submitPublish(auth: AuthContext, novelId: string) {
  const owned = await getNovel(novelId);
  assertNovelOwner(owned, auth);
  return withPostgresTransaction(client => submitPublishLocked(auth, novelId, client));
}

async function submitPublishLocked(auth: AuthContext, novelId: string, client: PoolClient) {
  await client.query('select novel_id from novels where novel_id = $1 for update', [novelId]);
  const novel = await getNovel(novelId);

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION'].includes(novel.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const readyChapters = await countPublishReadyChapters(client, novelId);
  if (readyChapters < INITIAL_PUBLISH_MIN_CHAPTERS) {
    throw new AppError(422, 'VALIDATION_002',
      `Truyện cần ít nhất ${INITIAL_PUBLISH_MIN_CHAPTERS} chương hợp lệ (tiêu đề dưới ${CHAPTER_TITLE_MAX + 1} ký tự, nội dung từ ${CHAPTER_CONTENT_MIN} ký tự) trước khi gửi xuất bản.`,
      { readyChapters, requiredChapters: INITIAL_PUBLISH_MIN_CHAPTERS });
  }

  const moderation = await checkContent({
    targetType: 'NOVEL',
    targetId: novel.novelId,
    content: `${novel.title}\n\n${novel.synopsis}`,
    submittedBy: auth.userId
  }, client);

  if (!moderation.moderationRequired) {
    const publishedNovel = await publishNovel(novelId, client);
    if (!publishedNovel) {
      throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    }

    return {
      novelId: publishedNovel.novelId,
      status: publishedNovel.status,
      moderationRequired: false,
      moderationReviewId: null
    };
  }

  const updatedNovel = novel.status === 'PENDING_MODERATION' ? novel : await submitNovelForPublish(novelId, client);
  if (!updatedNovel) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  return {
    novelId: updatedNovel.novelId,
    status: updatedNovel.status,
    moderationRequired: true,
    moderationReviewId: moderation.moderationReviewId
  };
}

export async function readNovel(novelId: string, auth?: AuthContext) {
  const novel = await getNovel(novelId);
  const owner = auth && (auth.userId === novel.authorId || isContentAdmin(auth));
  if (owner) await assertActiveAccount(auth);
  else if (novel.status !== 'PUBLISHED') throw new AppError(404, 'CONTENT_001', 'Content not found');
  return novel;
}
