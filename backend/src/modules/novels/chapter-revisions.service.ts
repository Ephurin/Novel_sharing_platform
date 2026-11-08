import crypto from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { env } from '../../core/config/env.js';
import { findChapterById } from './chapters.repository.js';
import { findDraftChapterByChapterId, syncDraftFromRevisionConditional } from './draft-chapters.repository.js';
import { getNovel } from './novels.service.js';
import { insertOutboxEvent } from './outbox.repository.js';
import { triggerImmediateProcessing } from '../../jobs/outbox-processor.js';
import { assertControllerIntent } from './controller-intent.js';
import { withChapterWriter, type ChapterWriterLease } from './chapter-writer.js';
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

async function checkStoryBrainActive(novelId: string, actorId: string): Promise<boolean> {
  const pool = getPostgresPool();
  try {
    const res = await pool.query(
      `SELECT b.status, b.baseline_revision_id,
        (EXISTS (SELECT 1 FROM chapter_revisions r
          WHERE r.revision_id=b.baseline_revision_id AND r.novel_id=b.novel_id)
        OR (b.baseline_revision_id IS NULL AND EXISTS (
          SELECT 1 FROM narrative.bootstrap_jobs j JOIN novels n ON n.novel_id=j.novel_id
          WHERE j.tenant_id=b.tenant_id AND j.novel_id=b.novel_id AND j.story_brain_id=b.id
            AND n.author_id=$3::uuid AND j.status='completed' AND j.stage='m0_active'
            AND j.result->>'contract_version'='setup-v1'
            AND j.result->>'author_id'=$3::text
            AND j.result#>>'{setup_activation,contract_version}'='setup-m0-v1'
            AND j.result#>>'{setup_activation,response,contract_version}'='setup-m0-v1'
            AND j.result#>>'{setup_activation,response,baseline_kind}'='M0'
            AND j.result#>>'{setup_activation,response,brain_id}'=b.id::text
            AND j.result#>>'{setup_activation,response,snapshot_id}'=j.id::text
            AND j.result#>>'{setup_activation,response,activated_by}'=$3::text
            AND j.result#>>'{setup_activation,response,setup_hash}'=j.result->>'setup_hash'
            AND j.result#>'{setup_activation,response,setup_version}'=j.result->'setup_version'
            AND j.result#>'{setup_activation,response,review_version}'=j.result->'review_version'
            AND j.result#>>'{setup_activation,response,status}'='active'
            AND j.result#>'{setup_activation,response,baseline_revision_id}'='null'::jsonb
            AND CASE WHEN jsonb_typeof(j.result#>'{setup_activation,response,canonical_artifact_ids}')='array'
              THEN jsonb_array_length(j.result#>'{setup_activation,response,canonical_artifact_ids}') ELSE 0 END>0
        ))) AS active_baseline
        FROM narrative.story_brains b
        WHERE b.novel_id=$1 AND b.tenant_id IN ($2::uuid,$3::uuid)`,
      [novelId,'00000000-0000-0000-0000-000000000001',actorId]
    );
    if (res.rows.length === 0) {
      return false;
    }
    return res.rows.some(row=>row.status==='active' && row.active_baseline===true);
  } catch (err: any) {
    if (err?.code === '42P01') {
      return false;
    }
    throw err;
  }
}

export async function createSnapshot(
  auth: AuthContext,
  chapterId: string,
  input?: { content?: string; purpose?: 'AUTHOR_SNAPSHOT' | 'MANUSCRIPT_BOOTSTRAP' },
  parent?: ChapterWriterLease
): Promise<ChapterRevisionRecord> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }
  const novel = await getNovel(chapter.novelId);
  assertOwner(novel, auth);

  return withChapterWriter(chapterId, lease => createSnapshotUnderLease(auth, chapterId, input, lease), parent);
}

async function createSnapshotUnderLease(
  auth: AuthContext,
  chapterId: string,
  input: { content?: string; purpose?: 'AUTHOR_SNAPSHOT' | 'MANUSCRIPT_BOOTSTRAP' } | undefined,
  lease: ChapterWriterLease
): Promise<ChapterRevisionRecord> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }

  const purpose = input?.purpose ?? 'AUTHOR_SNAPSHOT';

  if (purpose === 'MANUSCRIPT_BOOTSTRAP') {
    const isBrainActive = await checkStoryBrainActive(chapter.novelId,auth.userId);
    if (isBrainActive) {
      throw new AppError(
        409,
        'CANNOT_BOOTSTRAP_ACTIVE_STORY_BRAIN',
        'Cannot create bootstrap snapshot for a novel with an active Story Brain baseline'
      );
    }
  }

  // Content priority: explicit input > draft content in MongoDB > published content in SQL > empty
  let content = input?.content;
  if (content === undefined) {
    const draft = await findDraftChapterByChapterId(chapterId);
    content = draft?.content ?? chapter.content ?? '';
  }

  const contentHash = sha256(content);
  const wordCount = countWords(content);
  const sourceType = purpose === 'MANUSCRIPT_BOOTSTRAP' ? 'BOOTSTRAP' : 'AUTHOR_MANUAL';

  const revision = await withPostgresTransaction(async (client) => {
    await lockChapterForUpdate(client, chapterId);

    const latest = await findLatestRevisionByChapterId(client, chapterId);

    // Repeated saves of the same body must not create duplicate analysis work.
    if (latest?.contentHash === contentHash && latest.sourceType === sourceType) {
      return latest;
    }

    const record = await insertRevision(client, {
      novelId: chapter.novelId,
      chapterId,
      parentRevisionId: latest?.revisionId ?? null,
      contentHash,
      content,
      wordCount,
      sourceType,
      createdBy: auth.userId
    });

    await updateChapterLatestRevision(client, chapterId, record.revisionId, wordCount);

    // Only enqueue INCREMENTAL_ANALYSIS for ordinary author snapshots (NOT bootstrap-owned pre-baseline revisions)
    if (purpose === 'AUTHOR_SNAPSHOT') {
      await insertOutboxEvent(client, {
        eventType: 'INCREMENTAL_ANALYSIS',
        novelId: chapter.novelId,
        chapterId,
        revisionId: record.revisionId,
        contentHash,
        createdBy: auth.userId,
        payload: { operation: 'incremental_story_analysis' }
      });
    }

    return record;
  });

  // A checkpoint must not overwrite an actively edited MongoDB draft.
  if (purpose === 'AUTHOR_SNAPSHOT') {
    triggerImmediateProcessing();
  }

  return revision;
}

// Before the initial author-triggered extraction, saves remain ordinary drafts.
// Once the baseline is active, every changed body creates a durable revision and
// analysis outbox event.
export async function snapshotSavedChapter(auth: AuthContext, chapterId: string, content: string, lease?: ChapterWriterLease) {
  const chapter = await findChapterById(chapterId);
  if (!chapter || !(await checkStoryBrainActive(chapter.novelId,auth.userId))) return null;
  if (!content.trim() && !await findLatestRevisionByChapterId(undefined,chapterId)) return null;
  return createSnapshot(auth, chapterId, { content, purpose: 'AUTHOR_SNAPSHOT' }, lease);
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

  return withChapterWriter(chapterId, lease => acceptDraftUnderLease(auth, chapterId, input, lease));
}

async function acceptDraftUnderLease(
  auth: AuthContext,
  chapterId: string,
  input: { generationId: string },
  lease: ChapterWriterLease
): Promise<{ revision: ChapterRevisionRecord; chapterId: string }> {
  const chapter = await findChapterById(chapterId);
  if (!chapter) {
    throw new AppError(404, 'CHAPTER_001', 'Chapter not found');
  }

  // 0. Idempotency fast-path: If this generation was already accepted, return existing revision immediately
  const existingAccepted = await findRevisionBySourceGenerationId(undefined, chapterId, input.generationId);
  if (existingAccepted) {
    return { revision: existingAccepted, chapterId };
  }

  // 1. Server-Side Trust Contract: fetch validated generation job from AI service
  let generation: {
    job_id: string;
    novel_id: string;
    chapter_id: string;
    revision_id: string;
    content_hash: string;
    tenant_id?: string;
    actor_id?: string | null;
    status: string;
    validation_status: string;
    patch: { start: number; end: number; replacement: string } | null;
    brain_version_used?: number | null;
    idempotency_key?: string | null;
  };

  try {
    const aiRes = await fetch(
      `${env.AI_SERVICE_URL}/internal/v1/writing/generations/${input.generationId}`,
      {
        headers: {
          'Authorization': `Bearer ${env.PLATFORM_SERVICE_TOKEN ?? ''}`,
          'x-service-token': env.PLATFORM_SERVICE_TOKEN ?? '',
          'x-user-id': auth.userId,
          'x-tenant-id': auth.userId
        }
      }
    );

    if (aiRes.status === 404) {
      throw new AppError(404, 'GENERATION_NOT_FOUND', 'AI generation record not found');
    }
    if (!aiRes.ok) {
      throw new AppError(
        502,
        'AI_SERVICE_ERROR',
        `AI service returned status ${aiRes.status} while fetching generation details`
      );
    }

    const payload: any = await aiRes.json();
    generation = payload.data ?? payload;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      503,
      'AI_SERVICE_UNAVAILABLE',
      `Could not communicate with AI service to verify generation: ${err?.message || 'Network error'}`
    );
  }

  // 1a. Contract validation: verify ownership, tenant/actor bounds, completion and patch integrity
  if (generation.job_id !== input.generationId) {
    throw new AppError(400, 'GENERATION_MISMATCH', 'Generation ID mismatch between response and request');
  }
  if (generation.novel_id !== chapter.novelId) {
    throw new AppError(400, 'NOVEL_MISMATCH', 'Generation belongs to a different novel');
  }
  if (generation.chapter_id !== chapterId) {
    throw new AppError(400, 'CHAPTER_MISMATCH', 'Generation belongs to a different chapter');
  }
  const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  if (
    generation.tenant_id &&
    generation.tenant_id !== auth.userId &&
    generation.tenant_id !== SYSTEM_TENANT_ID
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Generation tenant does not match authenticated user or platform tenant');
  }
  if (generation.actor_id && generation.actor_id !== auth.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Generation actor does not match authenticated user');
  }
  if (generation.status !== 'completed') {
    throw new AppError(409, 'GENERATION_NOT_COMPLETED', `AI generation is not completed (status: ${generation.status})`);
  }
  if (generation.validation_status !== 'passed') {
    throw new AppError(
      422,
      'GENERATION_VALIDATION_FAILED',
      `AI generation validation status is '${generation.validation_status}', cannot accept unvalidated draft`
    );
  }
  if (
    !generation.patch ||
    typeof generation.patch.start !== 'number' ||
    typeof generation.patch.end !== 'number' ||
    typeof generation.patch.replacement !== 'string' ||
    generation.patch.start < 0 ||
    generation.patch.end < generation.patch.start
  ) {
    throw new AppError(422, 'INVALID_PATCH', 'AI generation contains an invalid or missing patch');
  }
  const patch = generation.patch;

  // Guard: Story Brain version drift
  if (generation.brain_version_used !== undefined && generation.brain_version_used !== null) {
    try {
      const brainRes = await fetch(
        `${env.AI_SERVICE_URL}/v1/story-brains/by-novel/${chapter.novelId}`,
        {
          headers: {
            'Authorization': `Bearer ${env.PLATFORM_SERVICE_TOKEN ?? ''}`,
            'x-service-token': env.PLATFORM_SERVICE_TOKEN ?? '',
            'x-user-id': auth.userId,
            'x-tenant-id': auth.userId
          }
        }
      );
      if (brainRes.status === 404) {
        throw new AppError(404, 'STORY_BRAIN_NOT_FOUND', `Story Brain not found for novel ${chapter.novelId}`);
      }
      if (!brainRes.ok) {
        throw new AppError(
          502,
          'AI_SERVICE_ERROR',
          `AI service returned status ${brainRes.status} while fetching story brain summary`
        );
      }
      const brainPayload: any = await brainRes.json();
      const brainData = brainPayload.data ?? brainPayload;
      const currentVersion = Number(brainData.brain_version ?? brainData.current_version ?? 1);
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
    await assertControllerIntent(client, {
      key: generation.idempotency_key ?? '',
      jobId: generation.job_id,
      novelId: chapter.novelId,
      chapterId,
      authorId: auth.userId
    });
    const lockedChapter = await lockChapterForUpdate(client, chapterId);

    // 2a. Idempotency guard: If this generation was already accepted, return existing revision
    const existingAccepted = await findRevisionBySourceGenerationId(client, chapterId, input.generationId);
    if (existingAccepted) {
      return existingAccepted;
    }

    // 2b. Get base revision
    const baseRevision = generation.revision_id
      ? await findRevisionById(client, generation.revision_id)
      : await findLatestRevisionByChapterId(client, chapterId);

    if (!baseRevision || baseRevision.chapterId !== chapterId) {
      throw new AppError(404, 'BASE_REVISION_NOT_FOUND', 'Base revision for generation not found or does not belong to chapter');
    }

    if (lockedChapter?.latest_revision_id !== baseRevision.revisionId) {
      throw new AppError(409, 'STALE_BASE_REVISION', 'Authoritative chapter revision has changed since generation');
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

    const newContent = applyPatchToContent(baseRevision.content, patch);
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
    }, lease);
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

  triggerImmediateProcessing();

  return { revision: newRevision, chapterId };
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

export interface InternalRevisionDto {
  revision_id: string;
  novel_id: string;
  chapter_id: string;
  chapter_number: number | undefined;
  content: string;
  content_hash: string;
}

// Service-to-service contract consumed by ai-service PlatformRevisionClient
// (infrastructure/revision_content_provider.py). Keys MUST stay snake_case.
export async function getInternalRevision(revisionId: string): Promise<InternalRevisionDto> {
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
    throw new AppError(404, 'REVISION_NOT_FOUND', 'Revision not found');
  }

  return revision;
}
