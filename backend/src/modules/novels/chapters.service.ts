import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { readNovel } from './novels.service.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { checkContent } from '../content-control/content-control.service.js';
import type { CreateChapterInput, UpdateChapterInput } from './chapters.schemas.js';
import {
  createChapter as createChapterRow,
  findChapterById,
  getNextChapterNumber,
  listChaptersByNovelId,
  listPublicationSchedules,
  publishChapter,
  submitChapterForPublish,
  updateChapterMetadata,
  touchChapterUpdatedAt,
  updateChapterPricing
} from './chapters.repository.js';
import { findDraftChapterByChapterId, upsertDraftChapter } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';

function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function assertOwner(resource: { authorId: string }, auth: AuthContext) {
  if (auth.role === 'ADMIN') {
    return;
  }

  if (resource.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

function assertPremiumPricing(input: { isVip: boolean; priceCoins: number }) {
  if (input.isVip && input.priceCoins <= 0) {
    throw new AppError(400, 'VALIDATION_001', 'Premium chapter requires priceCoins greater than 0');
  }

  if (!input.isVip && input.priceCoins !== 0) {
    throw new AppError(400, 'VALIDATION_001', 'Free chapter requires priceCoins to be 0');
  }
}

export async function createChapter(auth: AuthContext, novelId: string, input: CreateChapterInput) {
  const novel = await getNovel(novelId);
  assertOwner(novel, auth);
  assertPremiumPricing({ isVip: input.isVip, priceCoins: input.priceCoins });

  const importHash = createHash('sha256').update(JSON.stringify([input.title, input.content, input.isVip, input.priceCoins])).digest('hex');
  const wordCount = countWords(input.content);
  const chapter = await withPostgresTransaction(async (client) => {
    const chapterNumber = await getNextChapterNumber(client, novelId);
    if (input.clientRequestId) {
      const prior = (await client.query('select * from chapters where novel_id = $1 and import_key = $2', [novelId, input.clientRequestId])).rows[0];
      if (prior) {
        if (prior.import_hash !== importHash || prior.deleted_at) throw new AppError(409, 'IMPORT_CONFLICT', 'Mã nhập đã được dùng cho nội dung khác hoặc chương đã xóa');
        return { chapterId: prior.chapter_id, novelId, title: prior.title, chapterNumber: prior.chapter_number, content: prior.content, wordCount: prior.word_count, isVip: prior.is_vip, priceCoins: prior.price_coins, status: prior.status, updatedAt: prior.updated_at, publicationSchedule: null };
      }
    }

    return createChapterRow(client, {
      novelId,
      title: input.title,
      chapterNumber,
      importKey: input.clientRequestId,
      importHash,
      wordCount,
      isVip: input.isVip,
      priceCoins: input.priceCoins
    });
  });

  const draft = await findDraftChapterByChapterId(chapter.chapterId) ?? await upsertDraftChapter({
    chapterId: chapter.chapterId,
    expectedVersion: 0,
    novelId,
    authorId: auth.userId,
    title: input.title,
    content: input.content,
    wordCount,
    autosave: false
  });

  return {
    ...chapter,
    draftVersion: draft?.version ?? 1
  };
}

export async function listChapters(novelId: string, auth?: AuthContext) {
  const novel = await readNovel(novelId, auth);
  const rows = await listChaptersByNovelId(novelId);
  if (auth && (auth.userId === novel.authorId || auth.role === 'ADMIN')) { const schedules = await listPublicationSchedules(novelId); return rows.map(chapter => ({ ...chapter, publicationSchedule: schedules.get(chapter.chapterId) ?? null })); }
  return rows.filter(chapter => chapter.status === 'PUBLISHED').map(({ publicationSchedule: _schedule, ...chapter }) => ({ ...chapter, content: null }));
}

export async function getChapter(chapterId: string, auth: AuthContext) {
  await assertActiveAccount(auth);
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);
  const draft = await findDraftChapterByChapterId(chapterId);

  return {
    ...chapter,
    publicationSchedule: (await listPublicationSchedules(chapter.novelId)).get(chapterId) ?? null,
    draft: draft
      ? {
          title: draft.title,
          content: draft.content,
          wordCount: draft.wordCount,
          version: draft.version,
          autosave: draft.autosave,
          updatedAt: draft.updatedAt
        }
      : null
  };
}

export async function updateChapter(auth: AuthContext, chapterId: string, input: UpdateChapterInput) {
  return withPostgresTransaction(async client => {
  await client.query('select chapter_id from chapters where chapter_id = $1 for update', [chapterId]);
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  const isPublishedPricingOnlyUpdate =
    chapter.status === 'PUBLISHED' &&
    (input.isVip !== undefined || input.priceCoins !== undefined) &&
    input.title === undefined &&
    input.content === undefined;

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED'].includes(chapter.status) && !isPublishedPricingOnlyUpdate) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const existingDraft = await findDraftChapterByChapterId(chapterId);
  const nextTitle = input.title ?? existingDraft?.title ?? chapter.title;
  const nextContent = input.content ?? existingDraft?.content ?? chapter.content ?? '';
  const wordCount = countWords(nextContent);
  const nextIsVip = input.isVip ?? chapter.isVip;
  const nextPriceCoins = input.priceCoins ?? (nextIsVip ? chapter.priceCoins : 0);
  assertPremiumPricing({ isVip: nextIsVip, priceCoins: nextPriceCoins });

  const isPublishedDraftUpdate =
    chapter.status === 'PUBLISHED' && (input.title !== undefined || input.content !== undefined) && !isPublishedPricingOnlyUpdate;

  let draft = existingDraft;
  if ((input.title !== undefined || input.content !== undefined) && input.expectedVersion === undefined) throw new AppError(428, 'DRAFT_VERSION_REQUIRED', 'Đọc phiên bản bản nháp trước khi lưu');

  if (input.title !== undefined || input.content !== undefined) {
    draft = await upsertDraftChapter({
      chapterId,
      novelId: chapter.novelId,
      authorId: auth.userId,
      title: nextTitle,
      content: nextContent,
      wordCount,
      autosave: input.autosave,
      expectedVersion: input.expectedVersion
    });
    await client.query("update chapter_publication_schedules set status='CANCELLED', error='Bản thảo đã thay đổi; hãy đặt lịch lại.', updated_at=now() where chapter_id=$1 and status='PENDING'", [chapterId]);
    if (isPublishedDraftUpdate) await touchChapterUpdatedAt(chapterId, client);
  }

  let updatedChapter;

  if (isPublishedDraftUpdate) {
    updatedChapter =
      input.isVip !== undefined || input.priceCoins !== undefined
        ? await updateChapterPricing(chapterId, {
            isVip: nextIsVip,
            priceCoins: nextPriceCoins
          }, client)
        : chapter;
  } else if (isPublishedPricingOnlyUpdate) {
    updatedChapter = await updateChapterPricing(chapterId, {
      isVip: nextIsVip,
      priceCoins: nextPriceCoins
    }, client);
  } else {
    updatedChapter = await updateChapterMetadata(chapterId, {
      title: input.title,
      wordCount,
      isVip: nextIsVip,
      priceCoins: nextPriceCoins
    }, client);
  }

  if (!updatedChapter) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }


  return {
    ...updatedChapter,
    draft: draft ? { title: draft.title, content: draft.content, wordCount: draft.wordCount, version: draft.version, autosave: draft.autosave, updatedAt: draft.updatedAt } : null,
    draftVersion: draft?.version ?? null
  };
  });
}

export async function submitChapterPublish(auth: AuthContext, chapterId: string, client?: PoolClient): Promise<{ chapterId: string; status: string; moderationRequired: boolean; moderationReviewId: string | null }> {
  if (!client) return withPostgresTransaction(async transaction => {
    await transaction.query('select chapter_id from chapters where chapter_id=$1 for update', [chapterId]);
    return submitChapterPublish(auth, chapterId, transaction);
  });
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED'].includes(chapter.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const draft = await findDraftChapterByChapterId(chapterId);
  const publishTitle = draft?.title ?? chapter.title;
  const publishContent = draft?.content ?? chapter.content;
  const publishWordCount = draft?.wordCount ?? chapter.wordCount;

  if (!publishContent) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const moderation = await checkContent({
    targetType: 'CHAPTER',
    targetId: chapter.chapterId,
    content: `${publishTitle}\n\n${publishContent}`,
    submittedBy: auth.userId,
    publicationSnapshot: { title: publishTitle, content: publishContent, wordCount: publishWordCount }
  }, client);

  await client.query("update chapter_publication_schedules set status='CANCELLED', error='Đã gửi phát hành thủ công.', updated_at=now() where chapter_id=$1 and status='PENDING'", [chapterId]);
  if (!moderation.moderationRequired) {
    const publishedChapter = await publishChapter(chapterId, {
      title: publishTitle,
      content: publishContent,
      wordCount: publishWordCount
    }, client);

    if (!publishedChapter) {
      throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    }

    await client.query("update chapter_publication_schedules set status='CANCELLED', error='Đã phát hành phiên bản mới thủ công.', updated_at=now() where chapter_id=$1 and status='PENDING_MODERATION'", [chapterId]);
    return {
      chapterId: publishedChapter.chapterId,
      status: publishedChapter.status,
      moderationRequired: false,
      moderationReviewId: null
    };
  }

  const updatedChapter = chapter.status === 'PENDING_MODERATION' ? chapter : await submitChapterForPublish(chapterId, client);
  if (!updatedChapter) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  return {
    chapterId: updatedChapter.chapterId,
    status: updatedChapter.status,
    moderationRequired: true,
    moderationReviewId: moderation.moderationReviewId
  };
}
