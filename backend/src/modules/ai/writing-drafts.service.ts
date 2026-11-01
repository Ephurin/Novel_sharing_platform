import { createHash } from 'node:crypto';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { withChapterWriter } from '../novels/chapter-writer.js';
import { findDraftChapterByChapterId } from '../novels/draft-chapters.repository.js';

type Scope = { userId: string; novelId: string; chapterId: string };
const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000001';

// The shared SQL job store is authoritative. Never return instructions, style,
// context_summary, private notes or jobs created by a different actor.
export async function recoverWritingDraft(scope: Scope) {
  const result = await getPostgresPool().query(`
    SELECT w.job_id, w.novel_id, w.chapter_id, w.revision_id,
      w.base_content_hash, w.operation, w.status, w.stage, w.draft, w.patch,
      w.validation_status, w.brain_version,
      w.context_summary->>'brain_version_used' AS used_brain_version,
      r.content_hash AS revision_hash, latest.revision_id AS latest_revision_id,
      b.brain_version AS current_brain_version,
      EXISTS (SELECT 1 FROM chapter_revisions accepted
        WHERE accepted.chapter_id = w.chapter_id AND accepted.source_generation_id = w.job_id::text) AS accepted
    FROM narrative.writing_generations w
    LEFT JOIN chapter_revisions r ON r.revision_id = w.revision_id AND r.chapter_id = w.chapter_id
    LEFT JOIN LATERAL (SELECT revision_id FROM chapter_revisions
      WHERE chapter_id = w.chapter_id ORDER BY created_at DESC LIMIT 1) latest ON true
    LEFT JOIN narrative.story_brains b ON b.novel_id = w.novel_id AND b.tenant_id = w.tenant_id
    WHERE w.novel_id = $1 AND w.chapter_id = $2 AND w.actor_id = $3
      AND w.tenant_id IN ($3::uuid, $4::uuid)
    ORDER BY w.created_at DESC, w.id DESC LIMIT 1
  `, [scope.novelId, scope.chapterId, scope.userId, SYSTEM_TENANT]);
  const row = result.rows[0];
  // Do not resurrect an older job after the newest job was accepted/dismissed.
  if (!row || row.accepted || row.status === 'dismissed') return { job: null };
  let staleReason: string | null = null;
  const usedVersion = Number(row.used_brain_version ?? row.brain_version);
  if (row.latest_revision_id !== row.revision_id) staleReason = 'STALE_BASE_REVISION';
  else if (row.revision_hash !== row.base_content_hash) staleReason = 'CONTENT_HASH_MISMATCH';
  else if (!row.current_brain_version || !Number.isSafeInteger(usedVersion) ||
      Number(row.current_brain_version) > usedVersion) staleReason = 'BRAIN_VERSION_CONFLICT';
  const draft = await findDraftChapterByChapterId(scope.chapterId);
  if (draft && createHash('sha256').update(draft.content).digest('hex') !== row.base_content_hash) {
    staleReason = 'CONTENT_HASH_MISMATCH';
  }
  const completed = row.status === 'completed' && row.validation_status === 'passed';
  return { job: {
    job_id: row.job_id, novel_id: row.novel_id, chapter_id: row.chapter_id,
    revision_id: row.revision_id, content_hash: row.base_content_hash,
    operation: row.operation, status: row.status, stage: row.stage,
    draft: completed ? row.draft : null, patch: completed ? row.patch : null,
    validation_status: row.validation_status, validations: [], context_summary: {},
    stale_reason: staleReason,
  } };
}

export async function dismissWritingDraft(scope: Scope, jobId: string) {
  // Accept already holds this same lease BEFORE its trusted job read. Therefore
  // accept and discard cannot both commit for one pending job.
  return withChapterWriter(scope.chapterId, async () => {
    const pool = getPostgresPool();
    const result = await pool.query(`SELECT w.status,
      EXISTS (SELECT 1 FROM chapter_revisions r WHERE r.chapter_id = w.chapter_id
        AND r.source_generation_id = w.job_id::text) AS accepted
      FROM narrative.writing_generations w WHERE w.job_id = $1 AND w.novel_id = $2
        AND w.chapter_id = $3 AND w.actor_id = $4 AND w.tenant_id IN ($4::uuid, $5::uuid)`,
    [jobId, scope.novelId, scope.chapterId, scope.userId, SYSTEM_TENANT]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Writing draft not found');
    if (row.accepted) throw new AppError(409, 'GENERATION_ALREADY_ACCEPTED', 'Draft already accepted');
    if (row.status === 'dismissed') return { status: 'dismissed' };
    if (row.status !== 'completed') throw new AppError(409, 'GENERATION_NOT_COMPLETED', 'Only a completed draft can be dismissed');
    await pool.query(`UPDATE narrative.writing_generations SET status = 'dismissed',
      stage = 'dismissed', updated_at = now() WHERE job_id = $1 AND novel_id = $2
        AND chapter_id = $3 AND actor_id = $4`, [jobId, scope.novelId, scope.chapterId, scope.userId]);
    return { status: 'dismissed' };
  });
}
