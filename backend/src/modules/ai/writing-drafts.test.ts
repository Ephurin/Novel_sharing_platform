import { after, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoClient, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from '../novels/chapter-writer.js';
import { recoverWritingDraft, dismissWritingDraft } from './writing-drafts.service.js';
import { writingDraftReviewController } from './ai-gateway.controller.js';

const ids = Array.from({ length: 6 }, (_, i) => `${i + 1}`.repeat(8) + '-' + `${i + 1}`.repeat(4) + '-4111-8111-' + `${i + 1}`.repeat(12));
const [user, other, novel, chapter, job, revision] = ids;
const scope = { userId: user, novelId: novel, chapterId: chapter };
let row: any, manuscript: any, writes = 0, leases = 0;
let params: unknown[] = [];
mock.method(getPostgresPool(), 'query', async (sql: string, args: unknown[]) => {
  params = args;
  if (sql.includes('from chapters')) return { rows: [{ chapter_id: chapter, novel_id: novel }] };
  if (sql.includes('from novels')) return { rows: [{ novel_id: novel, author_id: user }] };
  if (sql.startsWith('UPDATE')) { writes++; row.status = 'dismissed'; return { rows: [], rowCount: 1 }; }
  return { rows: row ? [row] : [] };
});
mock.method(getMongoClient(), 'db', () => ({ collection: () => ({ findOne: async () => manuscript }) }) as any);
mock.method(pg.Pool.prototype, 'connect', async () => ({ query: async (sql: string) => {
  if (sql.includes('pg_try_advisory_lock')) leases++;
  return { rows: [{ acquired: true }] };
}, release: () => {} }) as any);
const upstream = mock.method(globalThis, 'fetch', async () => { throw Error('Recovery/discard must not call upstream'); });
beforeEach(() => {
  writes = 0; leases = 0; manuscript = null;
  row = { job_id: job, novel_id: novel, chapter_id: chapter, revision_id: revision,
    base_content_hash: 'base', revision_hash: 'base', latest_revision_id: revision,
    current_brain_version: 2, brain_version: 2, used_brain_version: '2', operation: 'continue',
    status: 'completed', stage: 'completed', draft: 'Saved fictional draft',
    patch: { start: 0, end: 0, replacement: 'Saved fictional draft' }, validation_status: 'passed', accepted: false,
    instruction: 'PRIVATE', style: { private_notes: 'PRIVATE' }, context_summary: { private_notes: 'PRIVATE' } };
});
after(async () => { mock.restoreAll(); await disconnectChapterWriter(); await disconnectPostgres(); await disconnectMongo(); });
test('recovery is bounded, actor/tenant scoped and omits prompt/private context', async () => {
  const result = await recoverWritingDraft(scope);
  assert.equal(result.job?.draft, 'Saved fictional draft'); assert.equal(result.job?.stale_reason, null);
  assert.deepEqual(params.slice(0, 3), [novel, chapter, user]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false); assert.equal(upstream.mock.callCount(), 0);
});
test('newest accepted/dismissed jobs do not resurrect older drafts', async () => {
  row.accepted = true; assert.deepEqual(await recoverWritingDraft(scope), { job: null });
  row.accepted = false; row.status = 'dismissed'; assert.deepEqual(await recoverWritingDraft(scope), { job: null });
});
test('failed/in-progress/unvalidated jobs are not usable completed drafts', async () => {
  for (const status of ['failed', 'queued', 'generating']) {
    row.status = status; const r = await recoverWritingDraft(scope);
    assert.equal(r.job?.status, status); assert.equal(r.job?.draft, null); assert.equal(r.job?.patch, null);
  }
  row.status = 'completed'; row.validation_status = 'failed'; assert.equal((await recoverWritingDraft(scope)).job?.draft, null);
});
test('revision, hash, Canon and unsnapshotted manuscript drift are stale', async () => {
  row.latest_revision_id = other; assert.equal((await recoverWritingDraft(scope)).job?.stale_reason, 'STALE_BASE_REVISION');
  row.latest_revision_id = revision; row.revision_hash = 'changed'; assert.equal((await recoverWritingDraft(scope)).job?.stale_reason, 'CONTENT_HASH_MISMATCH');
  row.revision_hash = 'base'; row.current_brain_version = 3; assert.equal((await recoverWritingDraft(scope)).job?.stale_reason, 'BRAIN_VERSION_CONFLICT');
  row.current_brain_version = 2; manuscript = { content: 'New manual text' }; assert.equal((await recoverWritingDraft(scope)).job?.stale_reason, 'CONTENT_HASH_MISMATCH');
});
test('dismiss is durable/idempotent and uses chapter writer admission', async () => {
  await dismissWritingDraft(scope, job); assert.equal(writes, 1); assert.equal(leases, 1);
  assert.deepEqual(await recoverWritingDraft(scope), { job: null });
  await dismissWritingDraft(scope, job); assert.equal(writes, 1);
});
test('accepted and in-progress jobs cannot be dismissed', async () => {
  row.accepted = true; await assert.rejects(dismissWritingDraft(scope, job), (e: any) => e.code === 'GENERATION_ALREADY_ACCEPTED');
  row.accepted = false; row.status = 'generating'; await assert.rejects(dismissWritingDraft(scope, job), (e: any) => e.code === 'GENERATION_NOT_COMPLETED'); assert.equal(writes, 0);
});
async function request(asUser: string, query: any, method = 'GET') {
  let result: any, error: any, cache: any;
  await writingDraftReviewController({ method, query, body: query, params: { jobId: job }, auth: { userId: asUser, role: 'AUTHOR' } } as any,
    { set: (_k: string, v: string) => { cache = v; }, json: (v: any) => { result = v.data; } } as any, (e: any) => { error = e; });
  return { result, error, cache };
}
test('cross-user read/discard fail ownership before disclosure or mutation', async () => {
  for (const method of ['GET', 'POST']) {
    const r = await request(other, { novel_id: novel, chapter_id: chapter }, method);
    assert.equal(r.error?.httpStatus, 403); assert.equal(r.result, undefined);
  }
  assert.equal(writes, 0);
});
test('controller validates chapter/novel scope and returns no-store for owner', async () => {
  assert.equal((await request(user, { novel_id: other, chapter_id: chapter })).error?.code, 'CHAPTER_MISMATCH');
  assert.equal((await request(user, { novel_id: novel })).error?.code, 'INVALID_REQUEST');
  const r = await request(user, { novel_id: novel, chapter_id: chapter });
  assert.equal(r.error, undefined); assert.equal(r.cache, 'no-store'); assert.equal(r.result.job.job_id, job); assert.equal(upstream.mock.callCount(), 0);
});
