import { withChapterWriter, type ChapterWriterLease } from './chapter-writer.js';
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
  publishChapter,
  submitChapterForPublish,
  updateChapterMetadata,
  updateChapterPricing
} from './chapters.repository.js';
import { findDraftChapterByChapterId, upsertDraftChapter } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';
import { snapshotSavedChapter } from './chapter-revisions.service.js';
import { findAuthUserById } from '../auth/auth.repository.js';

// Private author projections must also be safe for direct service callers.
async function assertDraftReader(auth: AuthContext) {
  if (!auth?.userId) throw new AppError(401, 'AUTH_002', 'Missing access token');
  if (!['AUTHOR', 'ADMIN'].includes(auth.role)) {
    throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  }
  const user = await findAuthUserById(auth.userId);
  if (!user) throw new AppError(401, 'AUTH_002', 'Missing or invalid account');
  if (user.status !== 'ACTIVE' || user.role !== auth.role) {
    throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  }
}

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

  const wordCount = countWords(input.content);
  const chapter = await withPostgresTransaction(async (client) => {
    const chapterNumber = await getNextChapterNumber(client, novelId);

    return createChapterRow(client, {
      novelId,
      title: input.title,
      chapterNumber,
      wordCount,
      isVip: input.isVip,
      priceCoins: input.priceCoins
    });
  });

  const draft = await upsertDraftChapter({
    chapterId: chapter.chapterId,
    novelId,
    authorId: auth.userId,
    title: input.title,
    content: input.content,
    wordCount,
    autosave: false
  });

  if (input.content.trim()) await snapshotSavedChapter(auth, chapter.chapterId, input.content);

  return {
    ...chapter,
    draftVersion: draft?.version ?? 1
  };
}

export async function listChapters(novelId: string, auth: AuthContext) {
  await assertDraftReader(auth);
  assertOwner(await getNovel(novelId), auth);
  return listChaptersByNovelId(novelId);
}

export async function getChapter(chapterId: string, auth: AuthContext) {
  await assertDraftReader(auth);
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  assertOwner(await getNovel(chapter.novelId), auth);
  const draft = await findDraftChapterByChapterId(chapterId);

  return {
    ...chapter,
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
  const chapter = await findChapterById(chapterId);
  if (!chapter) throw new AppError(404, 'CONTENT_001', 'Content not found');
  assertOwner(await getNovel(chapter.novelId), auth);
  return withChapterWriter(chapterId, lease => updateChapterUnderLease(auth, chapterId, input, lease));
}
async function updateChapterUnderLease(auth: AuthContext, chapterId: string, input: UpdateChapterInput, lease: ChapterWriterLease) {
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

  const nextTitle = input.title ?? chapter.title;
  const existingDraft = await findDraftChapterByChapterId(chapterId);
  const nextContent = input.content ?? existingDraft?.content ?? chapter.content ?? '';
  const wordCount = nextContent ? countWords(nextContent) : chapter.wordCount;
  const nextIsVip = input.isVip ?? chapter.isVip;
  const nextPriceCoins = input.priceCoins ?? (nextIsVip ? chapter.priceCoins : 0);
  assertPremiumPricing({ isVip: nextIsVip, priceCoins: nextPriceCoins });

  const isPublishedDraftUpdate =
    chapter.status === 'PUBLISHED' && (input.title !== undefined || input.content !== undefined) && !isPublishedPricingOnlyUpdate;

  let draft = existingDraft;
  // Compare-and-swap happens before PostgreSQL metadata/revision/outbox writes.
  if (input.title !== undefined || input.content !== undefined) {
    if (!nextContent) throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    draft = await upsertDraftChapter({ chapterId, novelId: chapter.novelId, authorId: auth.userId,
      title: nextTitle, content: nextContent, wordCount, autosave: input.autosave,
      expectedVersion: input.expectedVersion });
  }

  let updatedChapter;

  if (isPublishedDraftUpdate) {
    updatedChapter =
      input.isVip !== undefined || input.priceCoins !== undefined
        ? await updateChapterPricing(chapterId, {
            isVip: nextIsVip,
            priceCoins: nextPriceCoins
          })
        : chapter;
  } else if (isPublishedPricingOnlyUpdate) {
    updatedChapter = await updateChapterPricing(chapterId, {
      isVip: nextIsVip,
      priceCoins: nextPriceCoins
    });
  } else {
    updatedChapter = await updateChapterMetadata(chapterId, {
      title: input.title,
      wordCount,
      isVip: nextIsVip,
      priceCoins: nextPriceCoins
    });
  }

  if (!updatedChapter) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const revision = input.content !== undefined
    ? await snapshotSavedChapter(auth, chapterId, input.content, lease)
    : null;

  return {
    ...updatedChapter,
    analysisRevisionId: revision?.revisionId ?? null,
    draftVersion: draft?.version ?? null
  };
}

export async function submitChapterPublish(auth: AuthContext, chapterId: string) {
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
    submittedBy: auth.userId
  });

  if (!moderation.moderationRequired) {
    const publishedChapter = await publishChapter(chapterId, {
      title: publishTitle,
      content: publishContent,
      wordCount: publishWordCount
    });

    if (!publishedChapter) {
      throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    }

    return {
      chapterId: publishedChapter.chapterId,
      status: publishedChapter.status,
      moderationRequired: false,
      moderationReviewId: null
    };
  }

  const updatedChapter = chapter.status === 'PENDING_MODERATION' ? chapter : await submitChapterForPublish(chapterId);
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
