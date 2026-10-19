/** Real PostgreSQL/Mongo regression. Requires disposable DBs and explicit opt-in. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../backend/src/core/database/postgres.js';
import { connectMongo, getMongoDatabase, disconnectMongo } from '../../backend/src/core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../backend/src/core/database/test-db-guard.js';
import { createChapter, updateChapter, getChapter } from '../../backend/src/modules/novels/chapters.service.js';
import { createSnapshot } from '../../backend/src/modules/novels/chapter-revisions.service.js';
import { processOutboxOnce } from '../../backend/src/jobs/outbox-processor.js';
import { assertCurrentProposalEvidence } from '../../backend/src/modules/ai/proposal-evidence.service.js';
import { AutonomousControllerService } from '../../backend/src/modules/ai/autonomous-controller.service.js';
import { listLatestChapterAnalysis } from '../../backend/src/modules/novels/outbox.repository.js';
import { withAutonomousRunLock, listRunningAutonomousRuns } from '../../backend/src/modules/ai/autonomous-run.repository.js';

const pool = getPostgresPool();
const fetchOriginal = globalThis.fetch;
const prefix = `workflow_${Date.now()}`;
let queuedRevision: string | undefined;
const calls: string[] = [];
globalThis.fetch = async (url) => {
  const path = String(url); calls.push(path);
  if (path.includes('/review-queue')) return new Response(JSON.stringify({ data: [
    { proposal_id: 'pending-source', dependency_group_id: 'group', evidence: [{ revision_id: queuedRevision }] }
  ] }));
  if (path.includes('/analyses')) return new Response(JSON.stringify({ data: { status: 'completed' } }));
  throw new Error(`Unexpected remote operation: ${path}`);
};
try {
  await connectMongo();
  await validateTestDatabaseIsolation(pool, getMongoDatabase());
  const user = await pool.query("insert into users(email,username,password_hash,role) values($1,$2,'test-only','AUTHOR') returning user_id", [`${prefix}@example.test`, prefix]);
  const userId = user.rows[0].user_id;
  const novel = await pool.query("insert into novels(author_id,title,slug,synopsis) values($1,'Workflow regression',$2,'Synthetic local test') returning novel_id", [userId, prefix]);
  const novelId = novel.rows[0].novel_id;
  const auth = { userId, role: 'AUTHOR' as const };
  const chapter = await createChapter(auth, novelId, { title: 'Opening', content: 'Linh enters the harbor.', isVip: false, priceCoins: 0 });
  await updateChapter(auth, chapter.chapterId, { content: 'Linh sees the harbor.', autosave: true });
  assert.equal((await pool.query('select count(*)::int as n from chapter_revisions where chapter_id=$1', [chapter.chapterId])).rows[0].n, 0);
  const baseline = await createSnapshot(auth, chapter.chapterId, { purpose: 'MANUSCRIPT_BOOTSTRAP' });
  assert.equal((await pool.query('select count(*)::int as n from revision_outbox_events where novel_id=$1', [novelId])).rows[0].n, 0);
  await pool.query("insert into narrative.story_brains(id,tenant_id,novel_id,status,baseline_revision_id,brain_version,schema_version) values($1,$2,$3,'active',$4,1,1)",
    [crypto.randomUUID(), '00000000-0000-0000-0000-000000000001', novelId, baseline.revisionId]);
  const first = await updateChapter(auth, chapter.chapterId, { content: 'Linh gives the key to Duy.', autosave: true });
  queuedRevision = first.analysisRevisionId!;
  assert.ok(queuedRevision);
  await updateChapter(auth, chapter.chapterId, { content: 'Linh gives the key to Duy.', autosave: true });
  assert.equal((await pool.query('select count(*)::int as n from chapter_revisions where chapter_id=$1', [chapter.chapterId])).rows[0].n, 2);
  await assertCurrentProposalEvidence(novelId, ['pending-source'], userId);
  await updateChapter(auth, chapter.chapterId, { content: 'Linh keeps the key.', autosave: true });
  await assert.rejects(assertCurrentProposalEvidence(novelId, ['pending-source'], userId), /Source chapter changed/);
  const readback = await getChapter(chapter.chapterId);
  assert.equal(readback.draft?.content, 'Linh keeps the key.');
  await new Promise(resolve => setTimeout(resolve, 100));
  await processOutboxOnce(100);
  assert.ok(calls.some(p => p.includes('/analyses')));
  assert.ok(calls.every(p => !p.includes('/accept')));
  assert.equal((await pool.query('select brain_version from narrative.story_brains where novel_id=$1', [novelId])).rows[0].brain_version, '1');
  // Exercise the actual controller with real revision/outbox persistence and a local AI stub.
  const run = { run_id: crypto.randomUUID(), novel_id: novelId, plan_id: 'test-plan', plan_version: 1,
    status: 'running', current_iteration: 0, max_iterations: 10, current_retries: 0,
    max_retries_per_objective: 3, last_brain_version: 1, last_accepted_revision_id: null };
  const objective = { objective_id: 'ending', order_index: 1, title: 'Resolve the mystery', description: 'Resolve conflict and consequences',
    target_chapter: 1, status: 'pending', objective_type: 'ending', metadata: { min_words: 5 } };
  const jobs = new Map<string, object>();
  let extractionRevision = '';
  let approvedRevision = '';
  let version = 1;
  let denyApproval = true;
  let achieved = false;
  let objectiveCompletions = 0;
  let generationCount = 0;
  const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === `/v1/autonomous/runs/${run.run_id}`) { Object.assign(run, body); return response(run); }
    if (path === '/v1/story-plans/test-plan') return response({ plan_version: 1, objectives: [objective] });
    if (path.includes('/objectives/')) {
      if (body.status === 'completed') objectiveCompletions++;
      Object.assign(objective, body); return response(objective);
    }
    if (path === '/v1/writing/generations') {
      const id = crypto.randomUUID(); generationCount++;
      jobs.set(id, { ...body, job_id: id, status: 'completed', validation_status: 'passed', validations: [],
        brain_version_used: version, patch: { start: body.selection.start, end: body.selection.end,
          replacement: ' The mystery ends with a public confession and lasting consequences.' } });
      return response({ job_id: id });
    }
    if (path.startsWith('/internal/v1/writing/generations/')) return response(jobs.get(path.split('/').at(-1)!));
    if (path.endsWith('/analyses')) { extractionRevision = body.revision_id; return response({ status: 'completed' }); }
    if (path.includes('/story-brains/by-novel/')) return response({ brain_version: version });
    if (path.endsWith('/review-queue')) return response(extractionRevision && approvedRevision !== extractionRevision ? [
      { proposal_id: 'auto-proposal', dependency_group_id: 'auto-group', evidence: [{ revision_id: extractionRevision }] }
    ] : []);
    if (path.endsWith('/proposal-groups/auto-group/accept')) {
      if (denyApproval) return new Response(JSON.stringify({ detail: { code: 'TEST_CONFLICT' } }), { status: 409 });
      approvedRevision = extractionRevision; version++; return response({ brain_version: version });
    }
    if (path.endsWith('/author-operation')) return response({ achieved, ending_resolved: achieved });
    throw new Error(`Unexpected controller request: ${path}`);
  };
  const controller = new AutonomousControllerService();
  await controller.stepRun(auth, run.run_id);
  await new Promise(resolve => setTimeout(resolve, 100)); await processOutboxOnce(100);
  if (!run.current_retries) await controller.stepRun(auth, run.run_id);
  assert.equal(objectiveCompletions, 0, 'Memory failure must not advance objective');
  assert.equal(run.status, 'running');
  denyApproval = false;
  await controller.stepRun(auth, run.run_id);
  assert.equal(generationCount, 1, 'Resume memory update without writing duplicate prose');
  assert.equal(objectiveCompletions, 0, 'Unachieved story objective must not complete');
  assert.equal(run.current_iteration, 1);
  achieved = true;
  await controller.stepRun(auth, run.run_id);
  await new Promise(resolve => setTimeout(resolve, 100)); await processOutboxOnce(100);
  if (run.status === 'running') await controller.stepRun(auth, run.run_id);
  assert.equal(run.status, 'completed'); assert.equal(objectiveCompletions, 1);
  assert.equal((await getChapter(chapter.chapterId)).status, 'DRAFT', 'Full auto must never publish');
  const analysisStatus = await listLatestChapterAnalysis(novelId);
  assert.equal(analysisStatus[0].status, 'COMPLETED');
  assert.ok(Array.isArray(await listRunningAutonomousRuns()));
  await withAutonomousRunLock(run.run_id, async () => {
    await assert.rejects(withAutonomousRunLock(run.run_id, async () => {}), /already processing/);
  });
  await withAutonomousRunLock(run.run_id, async () => {}); // lock is released after the step
  console.log(JSON.stringify({ check: 'SAVED_CHAPTER_REAL_PG_MONGO', passed: true,
    cases: ['prebaseline_save_no_extraction', 'bootstrap_snapshot_no_incremental_job', 'active_save_enqueues',
      'identical_save_deduplicates', 'stale_proposal_blocked', 'mongo_readback_matches', 'worker_never_approves',
      'auto_memory_failure_blocks_progress', 'auto_resume_does_not_duplicate_prose',
      'auto_unachieved_objective_continues', 'auto_resolved_ending_completes', 'auto_never_publishes',
      'extraction_status_readback', 'worker_scan_query', 'concurrent_step_lock_released'], novel_id: novelId }));
} finally {
  globalThis.fetch = fetchOriginal;
  await disconnectMongo(); await disconnectPostgres();
}
