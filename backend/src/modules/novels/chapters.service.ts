import { isContentAdmin } from '../../core/security/auth-context.js';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { readNovel } from './novels.service.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { checkContent } from '../content-control/content-control.service.js';
import { CHAPTER_CONTENT_MIN, CHAPTER_TITLE_MAX, type CreateChapterInput, type UpdateChapterInput } from './chapters.schemas.js';
import { findNovelById } from './novels.repository.js';
import {
  createChapter as createChapterRow,
  findChapterById,
  getNextChapterNumber,
  listChaptersByNovelId,
  listPendingChapterRevisions,
  listPublicationSchedules,
  submitChapterForPublish,
  updateChapterMetadata,
  touchChapterUpdatedAt,
  updateChapterPricing
} from './chapters.repository.js';
import { findDraftChapterByChapterId, upsertDraftChapter } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';
import { withChapterWriter, type ChapterWriterLease } from './chapter-writer.js';
import { snapshotSavedChapter } from './chapter-revisions.service.js';

function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function assertOwner(resource: { authorId: string }, auth: AuthContext) {
  if (isContentAdmin(auth)) {
    return;
  }

  if (resource.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

async function assertDraftReader(auth?: AuthContext) {
  if (!auth?.userId) throw new AppError(401, 'AUTH_002', 'Missing access token');
  if (!['AUTHOR', 'ADMIN'].includes(auth.role)) {
    throw new AppError(403, 'AUTH_008', 'Unauthorized action');
  }
  const result = await getPostgresPool().query('select role, status from users where user_id=$1 and deleted_at is null', [auth.userId]);
  const user = result.rows[0];
  if (!user) throw new AppError(401, 'AUTH_002', 'Missing or invalid account');
  if (user.status !== 'ACTIVE' || user.role !== auth.role) {
    throw new AppError(403, 'AUTH_008', 'Tài khoản hoặc quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.');
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
  await assertActiveAccount(auth);
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

  return withChapterWriter(chapter.chapterId,async lease=>{
  assertOwner(await getNovel(novelId),auth);
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

  const revision=await snapshotSavedChapter(auth,chapter.chapterId,draft.content,lease);
  const currentChapter=await findChapterById(chapter.chapterId);
  return {
    ...(currentChapter??chapter),
    draftVersion: draft?.version ?? 1,
    analysisRevisionId:revision?.revisionId??null
  };
  });
}

export async function listChapters(novelId: string, auth?: AuthContext) {
  const novel = await readNovel(novelId, auth);
  const rows = await listChaptersByNovelId(novelId);
  if (auth && (auth.userId === novel.authorId || isContentAdmin(auth))) {
    const [schedules, pendingRevisions] = await Promise.all([
      listPublicationSchedules(novelId), listPendingChapterRevisions(novelId)
    ]);
    return rows.map(chapter => ({
      ...chapter,
      publicationSchedule: schedules.get(chapter.chapterId) ?? null,
      pendingPublicationRevision: pendingRevisions.has(chapter.chapterId)
    }));
  }
  return rows.filter(chapter => chapter.status === 'PUBLISHED').map(({ publicationSchedule: _schedule, ...chapter }) => ({ ...chapter, content: null }));
}

export async function getChapter(chapterId: string, auth: AuthContext) {
  await assertDraftReader(auth);
  const chapter = await findChapterById(chapterId);

  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);
  const [draft, schedules, pendingRevisions] = await Promise.all([
    findDraftChapterByChapterId(chapterId),
    listPublicationSchedules(chapter.novelId),
    chapter.status === 'PUBLISHED' ? listPendingChapterRevisions(chapter.novelId) : null
  ]);

  return {
    ...chapter,
    publicationSchedule: schedules.get(chapterId) ?? null,
    pendingPublicationRevision: pendingRevisions?.has(chapterId) ?? false,
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
  await assertActiveAccount(auth);

  return withChapterWriter(chapterId, lease => updateChapterUnderLease(auth, chapterId, input, lease));
}

async function updateChapterUnderLease(auth: AuthContext, chapterId: string, input: UpdateChapterInput, lease: ChapterWriterLease) {
  // Enforce version requirement on title/content updates (C04)
  if ((input.title !== undefined || input.content !== undefined) && input.expectedVersion === undefined) {
    throw new AppError(428, 'DRAFT_VERSION_REQUIRED', 'Đọc phiên bản bản nháp trước khi lưu');
  }

  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED'].includes(chapter.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const existingDraft = await findDraftChapterByChapterId(chapterId);

  const nextTitle = input.title ?? existingDraft?.title ?? chapter.title;
  const nextContent = input.content ?? existingDraft?.content ?? chapter.content ?? '';
  const wordCount = countWords(nextContent);
  const nextIsVip = input.isVip ?? chapter.isVip;
  const nextPriceCoins = input.priceCoins ?? (nextIsVip ? chapter.priceCoins : 0);
  const sameDraft = existingDraft?.title === nextTitle && existingDraft.content === nextContent &&
    existingDraft.wordCount === wordCount;
  const samePricing = nextIsVip === chapter.isVip && nextPriceCoins === chapter.priceCoins;
  const currentVersion = existingDraft?.version ?? 0;
  // C04 stays mandatory for title/content. Pricing-only is exempt from 428,
  // but a supplied version still fences all semantic mutations (C05).
  if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion &&
      !(input.expectedVersion < currentVersion && sameDraft && samePricing)) {
    throw new AppError(409, 'DRAFT_CONFLICT', 'Stale retry changes draft or metadata; reload before retrying');
  }
  assertPremiumPricing({ isVip: nextIsVip, priceCoins: nextPriceCoins });

  const editingText = input.title !== undefined || input.content !== undefined;

  let draft = existingDraft;

  // Compare-and-swap happens before PostgreSQL metadata/revision/outbox writes.
  if ((input.title !== undefined || input.content !== undefined ||
       (input.expectedVersion !== undefined && existingDraft && !samePricing)) &&
      !(sameDraft && samePricing)) {
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
  }

  const sameMetadata = samePricing && ((chapter.status === 'PUBLISHED' && editingText) ||
    ((input.title === undefined || input.title === chapter.title) && wordCount === chapter.wordCount));
  const updatedChapter = sameDraft && sameMetadata ? chapter : await withPostgresTransaction(async client => {
    const current = (await client.query(
      'select status from chapters where chapter_id=$1 and deleted_at is null for update', [chapterId]
    )).rows[0];
    if (editingText) {
      await client.query("update chapter_publication_schedules set status='CANCELLED', error='Bản thảo đã thay đổi; hãy đặt lịch lại.', updated_at=now() where chapter_id=$1 and status='PENDING'", [chapterId]);
      if (current?.status === 'PUBLISHED') await touchChapterUpdatedAt(chapterId, client);
    }

    let updated;
    if (current?.status === 'PUBLISHED') {
      // Approval can commit while MongoDB saves a newer draft. Keep its title and prose private.
      updated = input.isVip !== undefined || input.priceCoins !== undefined
        ? await updateChapterPricing(chapterId, { isVip: nextIsVip, priceCoins: nextPriceCoins }, client)
        : await findChapterById(chapterId, client);
    } else {
      updated = await updateChapterMetadata(chapterId, {
        title: input.title,
        wordCount,
        isVip: nextIsVip,
        priceCoins: nextPriceCoins
      }, client);
    }

    if (!updated) {
      throw new AppError(409, 'CONTENT_004', 'Invalid content state');
    }
    return updated;
  });

  const revision = input.content !== undefined
    ? await snapshotSavedChapter(auth, chapterId, input.content, lease)
    : null;

  // Re-read authoritative draft under lease to return reconciled draft version (C08 fix)
  const authoritativeDraft = await findDraftChapterByChapterId(chapterId);

  return {
    ...updatedChapter,
    draft: authoritativeDraft ? {
      title: authoritativeDraft.title,
      content: authoritativeDraft.content,
      wordCount: authoritativeDraft.wordCount,
      version: authoritativeDraft.version,
      autosave: authoritativeDraft.autosave,
      updatedAt: authoritativeDraft.updatedAt
    } : null,
    analysisRevisionId: revision?.revisionId ?? null,
    draftVersion: authoritativeDraft?.version ?? draft?.version ?? null
  };
}

export async function submitChapterPublish(
  auth: AuthContext,
  chapterId: string,
  client?: PoolClient,
  expectedDraftVersion?: number
) {
  if (!client) return withPostgresTransaction(async transaction => {
    await transaction.query('select chapter_id from chapters where chapter_id=$1 for update', [chapterId]);
    return submitChapterPublishLocked(auth, chapterId, transaction, expectedDraftVersion);
  });
  return submitChapterPublishLocked(auth, chapterId, client, expectedDraftVersion);
}

async function submitChapterPublishLocked(auth: AuthContext, chapterId: string, client: PoolClient, expectedDraftVersion?: number) {
  const chapter = await findChapterById(chapterId, client);
  if (!chapter) throw new AppError(404, 'CONTENT_001', 'Content not found');

  const novel = await findNovelById(chapter.novelId, client);
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  assertOwner(novel, auth);

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION', 'PUBLISHED'].includes(chapter.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  const draft = await findDraftChapterByChapterId(chapterId);
  if (expectedDraftVersion !== undefined && draft?.version !== expectedDraftVersion) {
    throw new AppError(409, 'DRAFT_CONFLICT', 'Bản thảo đã thay đổi; hãy đặt lịch lại');
  }
  const publishTitle = draft?.title ?? chapter.title;
  const publishContent = draft?.content ?? chapter.content;
  const publishWordCount = draft?.wordCount ?? chapter.wordCount;

  if (!publishContent) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  if (!publishTitle.trim() || publishTitle.length > CHAPTER_TITLE_MAX) {
    throw new AppError(422, 'CONTENT_003', `Tiêu đề chương cần từ 1 tới ${CHAPTER_TITLE_MAX} ký tự.`);
  }

  const contentLength = publishContent.trim().length;
  if (contentLength < CHAPTER_CONTENT_MIN) {
    throw new AppError(422, 'CONTENT_003', `Nội dung chương cần ít nhất ${CHAPTER_CONTENT_MIN} ký tự trước khi xuất bản.`,
      { contentLength, requiredLength: CHAPTER_CONTENT_MIN });
  }

  const moderation = await checkContent({
    targetType: 'CHAPTER',
    targetId: chapter.chapterId,
    content: `${publishTitle}\n\n${publishContent}`,
    submittedBy: auth.userId,
    publicationRequest: true,
    publicationSnapshot: { title: publishTitle, content: publishContent, wordCount: publishWordCount }
  }, client);

  await client.query("update chapter_publication_schedules set status='CANCELLED', error='Đã gửi phát hành thủ công.', updated_at=now() where chapter_id=$1 and status='PENDING'", [chapterId]);
  const updatedChapter = chapter.status === 'PENDING_MODERATION' || chapter.status === 'PUBLISHED'
    ? chapter
    : await submitChapterForPublish(chapterId, client);
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
