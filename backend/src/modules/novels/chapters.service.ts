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
  updateChapterMetadata
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

export async function createChapter(auth: AuthContext, novelId: string, input: CreateChapterInput) {
  const novel = await getNovel(novelId);
  assertOwner(novel, auth);

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

  return {
    ...chapter,
    draftVersion: draft?.version ?? 1
  };
}

export async function listChapters(novelId: string) {
  await getNovel(novelId);
  return listChaptersByNovelId(novelId);
}

export async function getChapter(chapterId: string) {
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

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

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION'].includes(chapter.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const nextTitle = input.title ?? chapter.title;
  const nextContent = input.content;
  const wordCount = nextContent ? countWords(nextContent) : chapter.wordCount;

  const updatedChapter = await updateChapterMetadata(chapterId, {
    title: input.title,
    wordCount,
    isVip: input.isVip,
    priceCoins: input.priceCoins
  });

  if (!updatedChapter) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  let draft = await findDraftChapterByChapterId(chapterId);

  if (nextContent) {
    draft = await upsertDraftChapter({
      chapterId,
      novelId: chapter.novelId,
      authorId: auth.userId,
      title: nextTitle,
      content: nextContent,
      wordCount,
      autosave: input.autosave
    });
  }

  return {
    ...updatedChapter,
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

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION'].includes(chapter.status)) {
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
