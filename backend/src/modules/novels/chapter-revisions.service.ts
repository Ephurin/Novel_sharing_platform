import crypto from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { env } from '../../core/config/env.js';
import { findChapterById } from './chapters.repository.js';
import { findDraftChapterByChapterId, upsertDraftChapter } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';
import {
  findLatestRevisionByChapterId,
  findRevisionById,
  findRevisionBySourceGenerationId,
  insertRevision,
  listRevisionsByChapterId,
  lockChapterForUpdate,
  updateChapterLatestRevision,
  type ChapterRevisionRecord
} from './chapter-revisions.repository.js';

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function assertOwner(resource: { authorId: string }, auth: AuthContext) {
  if (auth.role === 'ADMIN') {
    return;
  }
  if (resource.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

export function applyPatchToContent(
  content: string,
  patch: { start: number; end: number; replacement: string }
): string {
  const codePoints = Array.from(content);
  if (
    typeof patch.start !== 'number' ||
    typeof patch.end !== 'number' ||
    !Number.isInteger(patch.start) ||
    !Number.isInteger(patch.end) ||
    patch.start < 0 ||
    patch.end < patch.start ||
    patch.end > codePoints.length
  ) {
    throw new AppError(
      422,
      'INVALID_PATCH_BOUNDS',
      `Patch bounds [${patch.start}, ${patch.end}] are out of range for content of length ${codePoints.length}`
    );
  }
  const before = codePoints.slice(0, patch.start).join('');
  const after = codePoints.slice(patch.end).join('');
  return before + patch.replacement + after;
}

export async function createSnapshot(
  auth: AuthContext,
  chapterId: string,
  input?: { content?: string }
): Promise<ChapterRevisionRecord> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }
  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  // Content priority: explicit input > draft content in MongoDB > published content in SQL > empty
  let content = input?.content;
  if (content === undefined) {
    const draft = await findDraftChapterByChapterId(chapterId);
    content = draft?.content ?? chapter.content ?? '';
  }

  const contentHash = sha256(content);
  const wordCount = countWords(content);

  const revision = await withPostgresTransaction(async (client) => {
    await lockChapterForUpdate(client, chapterId);

    const latest = await findLatestRevisionByChapterId(client, chapterId);

    const record = await insertRevision(client, {
      novelId: chapter.novelId,
      chapterId,
      parentRevisionId: latest?.revisionId ?? null,
      contentHash,
      content,
      wordCount,
      sourceType: 'AUTHOR_MANUAL',
      createdBy: auth.userId
    });

    await updateChapterLatestRevision(client, chapterId, record.revisionId, wordCount);
    return record;
  });

  // Dual-write to Mongo draft storage with reconciliation fallback
  try {
    await upsertDraftChapter({
      chapterId,
      novelId: chapter.novelId,
      authorId: auth.userId,
      title: chapter.title,
      content,
      wordCount,
      autosave: false
    });
  } catch (mongoErr: any) {
    console.error(
      `[DUAL_WRITE_RECONCILIATION_REQUIRED] MongoDB upsertDraftChapter failed in snapshot for revision ${revision.revisionId}:`,
      mongoErr?.message || mongoErr
    );
  }

  return revision;
}

export async function acceptDraft(
  auth: AuthContext,
  chapterId: string,
  input: { generationId: string }
): Promise<{ revision: ChapterRevisionRecord; chapterId: string }> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }
  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  // 1. Server-Side Trust Contract: fetch validated generation job from AI service
  const aiUrl = `${env.AI_SERVICE_URL}/internal/v1/writing/generations/${input.generationId}`;
  let generation: any;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (env.PLATFORM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${env.PLATFORM_SERVICE_TOKEN}`;
      headers['X-Service-Token'] = env.PLATFORM_SERVICE_TOKEN;
    }
    const res = await fetch(aiUrl, { headers });
    if (!res.ok) {
      throw new Error(`AI service returned status ${res.status}`);
    }
    const body = (await res.json()) as any;
    generation = body.data;
  } catch (err: any) {
    throw new AppError(
      400,
      'AI_SERVICE_ERROR',
      `Failed to verify generation draft from AI service: ${err.message}`
    );
  }

  if (generation.status !== 'completed' || !generation.patch) {
    throw new AppError(400, 'INVALID_DRAFT_STATE', 'Writing generation is not in a completed state');
  }

  // Enforce server-side validation check: cannot accept a draft with validation failures
  if (generation.validation_status !== 'passed' || generation.validations?.some((v: any) => !v.passed)) {
    throw new AppError(
      422,
      'UNVALIDATED_DRAFT',
      'Generation draft failed deterministic validation checks and cannot be accepted'
    );
  }

  if (generation.chapter_id !== chapterId) {
    throw new AppError(400, 'CHAPTER_MISMATCH', 'Generation chapter does not match target chapter');
  }

  // 2. Transactional dual-write & conflict verification
  const newRevision = await withPostgresTransaction(async (client) => {
    await lockChapterForUpdate(client, chapterId);

    // 2a. Idempotency guard: If this generation was already accepted, return existing revision
    const existingAccepted = await findRevisionBySourceGenerationId(client, chapterId, input.generationId);
    if (existingAccepted) {
      return existingAccepted;
    }

    // 2b. Get base revision
    const baseRevision = generation.revision_id
      ? await findRevisionById(client, generation.revision_id)
      : await findLatestRevisionByChapterId(client, chapterId);

    if (!baseRevision) {
      throw new AppError(404, 'BASE_REVISION_NOT_FOUND', 'Base revision for generation not found');
    }

    // 2c. Stale base revision check: Ensure the base revision is still the current latest revision
    const currentLatest = await findLatestRevisionByChapterId(client, chapterId);
    if (currentLatest && currentLatest.revisionId !== baseRevision.revisionId) {
      throw new AppError(
        409,
        'STALE_BASE_REVISION',
        'Current chapter revision has advanced beyond the base revision of this draft'
      );
    }

    if (baseRevision.contentHash !== generation.content_hash) {
      throw new AppError(
        409,
        'CONTENT_HASH_MISMATCH',
        'Base revision has been modified since AI generation draft was created'
      );
    }

    const newContent = applyPatchToContent(baseRevision.content, generation.patch);
    const newContentHash = sha256(newContent);
    const newWordCount = countWords(newContent);

    const record = await insertRevision(client, {
      novelId: chapter.novelId,
      chapterId,
      parentRevisionId: baseRevision.revisionId,
      contentHash: newContentHash,
      content: newContent,
      wordCount: newWordCount,
      sourceType: 'AI_DRAFT_ACCEPT',
      sourceGenerationId: input.generationId,
      createdBy: auth.userId
    });

    await updateChapterLatestRevision(client, chapterId, record.revisionId, newWordCount);
    return record;
  });

  // 3. Dual-write to MongoDB draft storage with reconciliation fallback
  try {
    await upsertDraftChapter({
      chapterId,
      novelId: chapter.novelId,
      authorId: auth.userId,
      title: chapter.title,
      content: newRevision.content,
      wordCount: newRevision.wordCount,
      autosave: false
    });
  } catch (mongoErr: any) {
    console.error(
      `[DUAL_WRITE_RECONCILIATION_REQUIRED] MongoDB upsertDraftChapter failed for revision ${newRevision.revisionId}:`,
      mongoErr?.message || mongoErr
    );
  }

  // 4. Post-accept background dispatch of incremental analysis (durable fire-and-forget)
  dispatchIncrementalAnalysis(chapter.novelId, chapterId, newRevision, auth.userId);

  return { revision: newRevision, chapterId };
}

function dispatchIncrementalAnalysis(
  novelId: string,
  chapterId: string,
  revision: ChapterRevisionRecord,
  userId: string
) {
  const analysisUrl = `${env.AI_SERVICE_URL}/v1/revisions/${revision.revisionId}/analyses`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
    'X-Actor-Id': userId,
    'X-Request-Id': crypto.randomUUID(),
    'Idempotency-Key': `analysis-${revision.revisionId}`
  };
  if (env.PLATFORM_SERVICE_TOKEN) {
    headers['Authorization'] = `Bearer ${env.PLATFORM_SERVICE_TOKEN}`;
  }

  fetch(analysisUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      novel_id: novelId,
      chapter_id: chapterId,
      revision_id: revision.revisionId,
      content_hash: revision.contentHash,
      operation: 'incremental_story_analysis'
    })
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[RevisionAnalysis] Background dispatch failed HTTP ${res.status}:`, body);
      }
    })
    .catch((err) => {
      console.warn(`[RevisionAnalysis] Background dispatch network error:`, err?.message || err);
    });
}

export async function getRevision(
  auth: AuthContext,
  chapterId: string,
  revisionId: string
): Promise<ChapterRevisionRecord> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }
  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  const revision = await findRevisionById(undefined, revisionId);
  if (!revision || revision.chapterId !== chapterId) {
    throw new AppError(404, 'REVISION_NOT_FOUND', 'Chapter revision not found');
  }

  return revision;
}

export async function listRevisions(
  auth: AuthContext,
  chapterId: string,
  limit: number = 50
): Promise<ChapterRevisionRecord[]> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }
  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  return listRevisionsByChapterId(undefined, chapterId, limit);
}

export async function getInternalRevision(revisionId: string) {
  const revision = await findRevisionById(undefined, revisionId);
  if (!revision) {
    throw new AppError(404, 'REVISION_NOT_FOUND', 'Chapter revision not found');
  }

  return {
    revision_id: revision.revisionId,
    novel_id: revision.novelId,
    chapter_id: revision.chapterId,
    content: revision.content,
    content_hash: revision.contentHash
  };
}
