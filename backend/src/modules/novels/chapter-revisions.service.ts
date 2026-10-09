import crypto from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { env } from '../../core/config/env.js';
import { findChapterById } from './chapters.repository.js';
import { findDraftChapterByChapterId, upsertDraftChapter, syncDraftFromRevisionConditional } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';
import { insertOutboxEvent } from './outbox.repository.js';
import { triggerImmediateProcessing } from '../../jobs/outbox-processor.js';
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

    // Transactional Outbox for incremental analysis
    await insertOutboxEvent(client, {
      eventType: 'INCREMENTAL_ANALYSIS',
      novelId: chapter.novelId,
      chapterId,
      revisionId: record.revisionId,
      contentHash,
      createdBy: auth.userId,
      payload: { operation: 'incremental_story_analysis' }
    });

    return record;
  });

  // Dual-write to Mongo draft storage with conditional reconciliation
  const snapshotTime = new Date();
  try {
    await syncDraftFromRevisionConditional({
      chapterId,
      revisionId: revision.revisionId,
      title: chapter.title,
      content,
      wordCount,
      acceptTimestamp: snapshotTime,
      novelId: chapter.novelId
    });
  } catch (mongoErr: any) {
    console.error(
      `[DUAL_WRITE_RECONCILIATION_REQUIRED] MongoDB sync failed in snapshot for revision ${revision.revisionId}:`,
      mongoErr?.message || mongoErr
    );
    try {
      await insertOutboxEvent(undefined, {
        eventType: 'MONGO_DRAFT_SYNC',
        novelId: chapter.novelId,
        chapterId,
        revisionId: revision.revisionId,
        contentHash,
        createdBy: auth.userId,
        payload: {
          novelId: chapter.novelId,
          authorId: auth.userId,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          content,
          wordCount,
          acceptTimestamp: snapshotTime.toISOString()
        }
      });
    } catch (outboxErr) {
      console.error('[Outbox] Failed to queue MONGO_DRAFT_SYNC fallback:', outboxErr);
    }

  }

  triggerImmediateProcessing();

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

  // 0. Idempotency fast-path: If this generation was already accepted, return existing revision immediately
  const existingAccepted = await findRevisionBySourceGenerationId(undefined, chapterId, input.generationId);
  if (existingAccepted) {
    return { revision: existingAccepted, chapterId };
  }

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

  // Accept-Time Brain Freshness Policy: Ensure Story Brain has not advanced since draft was generated (strictly fail-closed)
  if (generation.brain_version_used) {
    // 1b. Fail-closed Story Brain freshness verification (best-effort freshness semantics):
    // If AI service is unreachable, we fail closed with 503 AI_SERVICE_UNAVAILABLE.
    // If Story Brain version advanced past brain_version_used, fail closed with 409 BRAIN_VERSION_CONFLICT.
    // Note on consistency guarantee: fail-closed availability + best-effort freshness. Cross-service
    // atomic distributed transactions between Platform Postgres and AI Story Brain are out of scope for MVP.
    try {
      const brainUrl = `${env.AI_SERVICE_URL}/v1/story-brains/by-novel/${chapter.novelId}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
        'X-Request-Id': crypto.randomUUID()
      };
      if (env.PLATFORM_SERVICE_TOKEN) {
        headers['Authorization'] = `Bearer ${env.PLATFORM_SERVICE_TOKEN}`;
        headers['X-Service-Token'] = env.PLATFORM_SERVICE_TOKEN;
      }
      const brainRes = await fetch(brainUrl, { headers });
      if (!brainRes.ok) {
        throw new AppError(
          503,
          'AI_SERVICE_UNAVAILABLE',
          `Could not verify Story Brain version freshness: AI Service returned HTTP ${brainRes.status}`
        );
      }
      const brainBody = (await brainRes.json()) as any;
      const currentVersion = brainBody?.data?.brain_version;
      if (typeof currentVersion !== 'number') {
        throw new AppError(
          502,
          'AI_SERVICE_INVALID_RESPONSE',
          'Could not parse current Story Brain version from AI Service'
        );
      }
      if (currentVersion > generation.brain_version_used) {
        throw new AppError(
          409,
          'BRAIN_VERSION_CONFLICT',
          `Story Brain has advanced to version ${currentVersion} since draft was generated (version ${generation.brain_version_used}). Please review or regenerate.`
        );
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        503,
        'AI_SERVICE_UNAVAILABLE',
        `Could not verify Story Brain version freshness: ${err?.message || 'Network error'}`
      );
    }
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

    // Transactional Outbox: guarantee incremental analysis is persisted with the revision
    await insertOutboxEvent(client, {
      eventType: 'INCREMENTAL_ANALYSIS',
      novelId: chapter.novelId,
      chapterId,
      revisionId: record.revisionId,
      contentHash: newContentHash,
      createdBy: auth.userId,
      payload: {
        operation: 'incremental_story_analysis'
      }
    });

    return record;
  });

  // 3. Dual-write to MongoDB draft storage with conditional reconciliation
  const acceptTime = new Date();
  try {
    const syncRes = await syncDraftFromRevisionConditional({
      chapterId,
      revisionId: newRevision.revisionId,
      title: chapter.title,
      content: newRevision.content,
      wordCount: newRevision.wordCount,
      acceptTimestamp: acceptTime,
      novelId: chapter.novelId,
      authorId: auth.userId,
    });
    if (syncRes.status === 'skipped_newer_draft') {
      console.log(
        `[MongoDB Reconciliation] Skipped draft sync for revision ${newRevision.revisionId}: newer manual draft in progress.`
      );
    }
  } catch (mongoErr: any) {
    console.error(
      `[DUAL_WRITE_RECONCILIATION_REQUIRED] MongoDB sync failed for revision ${newRevision.revisionId}, queuing outbox event:`,
      mongoErr?.message || mongoErr
    );
    try {
      await insertOutboxEvent(undefined, {
        eventType: 'MONGO_DRAFT_SYNC',
        novelId: chapter.novelId,
        chapterId,
        revisionId: newRevision.revisionId,
        contentHash: newRevision.contentHash,
        createdBy: auth.userId,
        payload: {
          novelId: chapter.novelId,
          authorId: auth.userId,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          content: newRevision.content,
          wordCount: newRevision.wordCount,
          acceptTimestamp: acceptTime.toISOString()
        }
      });
    } catch (outboxErr) {
      console.error('[Outbox] Failed to queue MONGO_DRAFT_SYNC fallback:', outboxErr);
    }
  }


  // 4. Trigger immediate durable outbox processing
  triggerImmediateProcessing();

  return { revision: newRevision, chapterId };
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

  const chapter = await findChapterById(revision.chapterId);

  return {
    revision_id: revision.revisionId,
    novel_id: revision.novelId,
    chapter_id: revision.chapterId,
    chapter_number: chapter ? chapter.chapterNumber : undefined,
    content: revision.content,
    content_hash: revision.contentHash
  };
}
