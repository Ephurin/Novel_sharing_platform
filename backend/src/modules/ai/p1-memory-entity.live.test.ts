import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { disconnectChapterWriter } from '../novels/chapter-writer.js';
import { TestFixtureLifecycle } from '../novels/test-fixture-lifecycle.js';

test('live Gateway -> AI -> PostgreSQL: approved memory and revision-bound entity HITL', {
  skip: process.env.TEST_HITL_LIVE !== '1', timeout: 120_000,
}, async () => {
  const pool = getPostgresPool();
  const mongo = getMongoDatabase();
  const lifecycle = new TestFixtureLifecycle();
  await lifecycle.authorize(pool, mongo);
  const [owner, foreign, novel, chapter, revision] = Array.from({ length: 5 }, () => randomUUID());
  const content = 'Minh gặp Minh. lan.';
  const hash = createHash('sha256').update(content).digest('hex');
  const server = createApp().listen(Number(process.env.HITL_PLATFORM_PORT), '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${process.env.HITL_PLATFORM_PORT}/api/v1/ai/story-brains/${novel}`;
  const ownerToken = jwt.sign({ sub: owner, role: 'AUTHOR' }, env.JWT_ACCESS_SECRET);
  const foreignToken = jwt.sign({ sub: foreign, role: 'AUTHOR' }, env.JWT_ACCESS_SECRET);
  const requests: unknown[] = [];
  const readbacks: unknown[] = [];
  async function http(path: string, method = 'GET', body?: unknown, token: string | null = ownerToken, expected = 200, extra = {}) {
    const response = await fetch(`${base}${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json() as any;
    requests.push({ method, path, actor: token === ownerToken ? 'owner' : token === foreignToken ? 'foreign' : token ? 'invalid' : 'anonymous', body, status: response.status, response: result });
    assert.equal(response.status, expected, JSON.stringify(result));
    return result.data;
  }
  async function durable(stage: string, observedRevision = revision) {
    const brain = (await pool.query('SELECT id,novel_id,brain_version,entity_guidance FROM narrative.story_brains WHERE novel_id=$1', [novel])).rows;
    const runs = (await pool.query('SELECT id,status,entity_candidate_audit FROM narrative.analysis_runs WHERE novel_id=$1', [novel])).rows;
    const proposals = (await pool.query('SELECT id,proposal_type,status,payload,evidence FROM narrative.proposals WHERE novel_id=$1 ORDER BY materialization_order', [novel])).rows;
    const relationships = (await pool.query('SELECT * FROM narrative.relationships WHERE novel_id=$1', [novel])).rows;
    const facts = (await pool.query('SELECT id,fact_key,source_revision_id,chapter_number FROM narrative.facts WHERE novel_id=$1', [novel])).rows;
    const revisionRows = (await pool.query('SELECT revision_id,content_hash,content FROM chapter_revisions WHERE revision_id=$1', [observedRevision])).rows;
    const value = { stage, brain, runs, proposals, facts, relationships, revisions: revisionRows,
      mongo: await mongo.collection('draft_chapters').find({ chapterId: chapter }).toArray() };
    readbacks.push(value);
    return value;
  }
  try {
    for (const id of [owner, foreign]) {
      lifecycle.registerUser(id);
      await pool.query("INSERT INTO users(user_id,email,username,password_hash,role,status) VALUES($1,$2,$3,'test-only','AUTHOR','ACTIVE')", [id, `${id}@example.test`, `hitl_${id}`]);
    }
    lifecycle.registerNovel(novel);
    await pool.query("INSERT INTO novels(novel_id,author_id,title,slug,synopsis) VALUES($1,$2,'HITL fixture',$3,'test-owned')", [novel, owner, `hitl-${novel}`]);
    lifecycle.registerChapter(chapter);
    await pool.query("INSERT INTO chapters(chapter_id,novel_id,chapter_number,title,content,word_count) VALUES($1,$2,1,'Source',$3,6)", [chapter, novel, content]);
    lifecycle.registerRevision(revision);
    await pool.query("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES($1,$2,$3,$4,$5,6,'AUTHOR_MANUAL',$6)", [revision, novel, chapter, hash, content, owner]);
    await pool.query('UPDATE chapters SET latest_revision_id=$1 WHERE chapter_id=$2', [revision, chapter]);
    await http('/memory', 'GET', undefined, null, 401);
    await http('/memory', 'GET', undefined, 'invalid-token', 401);
    await http('/memory', 'GET', undefined, foreignToken, 403);
    await http('/memory', 'GET', undefined, ownerToken, 404);
    assert.equal((await durable('missing-read-no-mutation')).brain.length, 0);
    await http('/entity-guidance', 'POST', { expected_version: 0, entries: [{ name: 'Absent Hint', kind: 'hint' }] });
    const empty = await http('/memory');
    assert.equal(empty.brain_version, 1);
    const analysis = await http('/reanalyse', 'POST', { revision_id: revision }, ownerToken, 200, { 'Idempotency-Key': 'live-p1-request' });
    assert.equal(analysis.status, 'waiting_entity_review');
    const run = analysis.analysis_run_id;
    const audit = await http(`/entity-candidate-audits/${run}`);
    assert.equal(audit.revision_id, revision);
    assert.equal(audit.source_hash, hash);
    assert.ok(audit.candidates.every((c: any) => c.surface !== 'Absent Hint'));
    const waiting = await durable('waiting-review');
    assert.equal(waiting.proposals.length, 0);
    assert.equal(waiting.brain[0].brain_version, '1');
    for (const action of ['review', 'continue']) {
      await http(`/entity-reviews/${run}/${action}`, 'POST', {}, foreignToken, 403);
    }
    await http(`/entity-reviews/${run}/continue`, 'POST', {}, ownerToken, 409);
    await http(`/entity-reviews/${run}/review`, 'POST', { expected_version: 1, decisions: [] }, ownerToken, 422);
    await http(`/entity-reviews/${run}/review`, 'POST', { expected_version: 99, decisions: audit.decisions }, ownerToken, 409);
    const humanChoices = (a: any) => a.decisions.map((d: any) => d.verdict === 'entity' && !d.canonical_entity_id
      ? { ...d, provisional_identity_key: `${a.provisional_identity_scope}/${d.candidate_id}` } : d);
    const reviewBody = { expected_version: 1, decisions: humanChoices(audit) };
    // Empty Canon: same display name is explicitly separated by the author, never guessed by the LLM.
    await http(`/entity-reviews/${run}/review`, 'POST', { expected_version: 1, decisions: audit.decisions }, ownerToken, 422);
    await http(`/entity-reviews/${run}/review`, 'POST', reviewBody);
    await http(`/entity-reviews/${run}/review`, 'POST', reviewBody);
    const frozen = await durable('frozen-review');
    assert.equal(frozen.runs[0].entity_candidate_audit.status, 'entities_reviewed');
    assert.equal(frozen.proposals.length, 0);
    await http('/entity-guidance', 'POST', { expected_version: 1,
      entries: [{ name: 'Absent Hint', kind: 'hint' }, { name: 'lan', kind: 'hint' }] });
    const refreshBody = { expected_version: frozen.runs[0].entity_candidate_audit.review_version };
    await http(`/entity-reviews/${run}/refresh`, 'POST', refreshBody, foreignToken, 403);
    await http(`/entity-reviews/${run}/refresh`, 'POST', refreshBody, null, 401);
    await http(`/entity-reviews/${run}/refresh`, 'POST', { expected_version: 999 }, ownerToken, 409);
    const refreshed = await http(`/entity-reviews/${run}/refresh`, 'POST', refreshBody);
    assert.deepEqual(refreshed.preserved_decisions, frozen.runs[0].entity_candidate_audit.reviewed_decisions);
    assert.equal(refreshed.status, 'waiting_entity_review');
    const pendingDecisions = humanChoices(refreshed).filter((d: any) => refreshed.pending_candidate_ids.includes(d.candidate_id));
    assert.equal(pendingDecisions.length, 1);
    assert.ok(refreshed.candidates.filter((c: any) => refreshed.pending_candidate_ids.includes(c.candidate_id)).every((c: any) => c.surface === 'lan'));
    assert.deepEqual(await http(`/entity-reviews/${run}/refresh`, 'POST', refreshBody), refreshed);
    await http(`/entity-reviews/${run}/continue`, 'POST', {}, ownerToken, 409);
    const refreshReadback = await durable('refreshed-entity-only');
    assert.equal(refreshReadback.proposals.length, 0);
    assert.equal(refreshReadback.brain[0].brain_version, '1');
    await http(`/entity-reviews/${run}/review`, 'POST', { expected_version: refreshed.review_version, decisions: pendingDecisions });
    await http(`/entity-reviews/${run}/continue`, 'POST', {});
    await http(`/entity-reviews/${run}/continue`, 'POST', {});
    const pending = await durable('completed-pending-canon');
    assert.equal(pending.runs[0].entity_candidate_audit.status, 'completed');
    assert.ok(pending.proposals.some(p => p.proposal_type === 'event'));
    assert.ok(pending.proposals.some(p => p.proposal_type === 'fact'));
    assert.ok(pending.proposals.every(p => p.status === 'pending'));
    assert.equal(pending.facts.length, 0);
    assert.deepEqual(await http('/memory'), empty);
    // Gateway discards browser-supplied tenant headers; its trusted service scope wins.
    assert.deepEqual(await http('/memory', 'GET', undefined, ownerToken, 200, { 'X-Tenant-Id': randomUUID() }), empty);
    const queue = await http('/review-queue');
    const group = queue[0].dependency_group_id;
    const acceptUrl = `${base.slice(0, base.indexOf('/story-brains'))}/proposal-groups/${group}/accept`;
    const beforeUnauthorized = await durable('canon-authorization-before');
    for (const [token, expected] of [[null,401],[foreignToken,403]] as const) {
      const denied = await fetch(acceptUrl, {method:'POST', headers:{'Content-Type':'application/json',
        ...(token ? {Authorization:`Bearer ${token}`} : {})},
        body:JSON.stringify({proposal_ids:queue.map((p:any)=>p.proposal_id),expected_brain_version:1})});
      const deniedBody = await denied.json();
      requests.push({method:'POST',path:`/proposal-groups/${group}/accept`,actor:token?'foreign':'anonymous',status:denied.status,response:deniedBody});
      assert.equal(denied.status,expected,JSON.stringify(deniedBody));
      const after = await durable('canon-authorization-after-'+expected);
      assert.deepEqual({...after,stage:''},{...beforeUnauthorized,stage:''});
    }
    const accepted = await fetch(acceptUrl, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_ids: queue.map((p: any) => p.proposal_id), expected_brain_version: 1 }) });
    const acceptedBody = await accepted.json();
    requests.push({ method: 'POST', path: `/proposal-groups/${group}/accept`, status: accepted.status, response: acceptedBody });
    assert.equal(accepted.status, 200, JSON.stringify(acceptedBody));
    const memory = await http('/memory');
    assert.equal(memory.brain_version, 2);
    assert.ok(memory.entities.length && memory.events.length && memory.facts.length);
    const final = await durable('approved-memory');
    assert.ok(final.proposals.every(p => p.status === 'accepted'));
    assert.equal(final.facts[0].source_revision_id, revision);
    assert.deepEqual(final.revisions, pending.revisions);
    assert.deepEqual(final.mongo, pending.mongo);
    assert.deepEqual(await http('/memory'), memory);
    // Both homonyms originated in this empty-Canon human review, without seeding Canon rows.
    const minhIds = memory.entities.filter((e: any) => e.name === 'Minh').map((e: any) => e.entity_id);
    assert.equal(new Set(minhIds).size, 2);
    const [firstId, secondId] = minhIds;
    const locked = await fetch(`${env.AI_SERVICE_URL}/v1/enhanced/relation/override`, { method:'POST',
      headers:{'Content-Type':'application/json', 'X-Service-Token':env.PLATFORM_SERVICE_TOKEN!},
      body:JSON.stringify({story_id:novel, subject:secondId, relation:'ally', object:secondId}) });
    const lockBody = await locked.json();
    requests.push({method:'POST', path:'/v1/enhanced/relation/override', actor:'trusted-author-service', status:locked.status, response:lockBody});
    assert.equal(locked.status,200,JSON.stringify(lockBody));
    const semanticRevision = randomUUID();
    const semanticContent = 'Minh bên trái gặp Minh bên phải.';
    const semanticHash = createHash('sha256').update(semanticContent).digest('hex');
    lifecycle.registerRevision(semanticRevision);
    await pool.query("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES($1,$2,$3,$4,$5,10,'AUTHOR_MANUAL',$6)", [semanticRevision, novel, chapter, semanticHash, semanticContent, owner]);
    await pool.query('UPDATE chapters SET latest_revision_id=$1 WHERE chapter_id=$2', [semanticRevision, chapter]);
    const semanticRun = await http('/reanalyse', 'POST', { revision_id: semanticRevision }, ownerToken, 200,
      { 'Idempotency-Key': 'live-homonym-ids' });
    const semanticAudit = await http(`/entity-candidate-audits/${semanticRun.analysis_run_id}`);
    const occurrences = semanticAudit.candidates.filter((c: any) => c.surface === 'Minh').sort((a: any, b: any) => a.start - b.start);
    assert.equal(occurrences.length, 2);
    const chosen = new Map([[occurrences[0].candidate_id, firstId], [occurrences[1].candidate_id, secondId]]);
    const choices = semanticAudit.decisions.map((d: any) => chosen.has(d.candidate_id)
      ? { ...d, verdict: 'entity', canonical_name: 'Minh', canonical_entity_id: chosen.get(d.candidate_id), entity_type: 'PER' }
      : { ...d, verdict: 'not_entity', canonical_name: '', canonical_entity_id: '', entity_type: null,
        identity_quote: '', initial_status: 'Unknown', status_quote: '', reason: 'Author rejects component duplicate' });
    const semanticFrozen = await http(`/entity-reviews/${semanticRun.analysis_run_id}/review`, 'POST',
      { expected_version: 1, decisions: choices });
    assert.deepEqual(new Set(semanticFrozen.entities.map((e: any) => e.entity_id)), new Set([firstId, secondId]));
    await http(`/entity-reviews/${semanticRun.analysis_run_id}/continue`, 'POST', {});
    const semanticPending = await durable('homonyms-pending-exact-ids', semanticRevision);
    const queuedEvent = (await pool.query("SELECT payload FROM narrative.proposals WHERE analysis_run_id=$1 AND proposal_type='event'", [semanticRun.analysis_run_id])).rows[0].payload;
    assert.deepEqual(new Set(queuedEvent.participants), new Set([firstId, secondId]));
    assert.equal(semanticPending.brain[0].brain_version, '2');
    const semanticQueue = await http('/review-queue');
    const semanticAccept = await fetch(`${base.slice(0, base.indexOf('/story-brains'))}/proposal-groups/${semanticQueue[0].dependency_group_id}/accept`, {
      method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_ids: semanticQueue.map((p: any) => p.proposal_id), expected_brain_version: 2 }) });
    const semanticAcceptedBody = await semanticAccept.json();
    requests.push({ method: 'POST', path: `/proposal-groups/${semanticQueue[0].dependency_group_id}/accept`, status: semanticAccept.status, response: semanticAcceptedBody });
    assert.equal(semanticAccept.status, 200, JSON.stringify(semanticAcceptedBody));
    const semanticMemory = await http('/memory');
    assert.equal(semanticMemory.brain_version, 3);
    assert.deepEqual(new Set(semanticMemory.entities.filter((e: any) => e.name === 'Minh').map((e: any) => e.entity_id)), new Set([firstId, secondId]));
    assert.deepEqual(new Set(semanticMemory.events.find((e: any) => e.metadata.evidence[0].revision_id === semanticRevision).participants), new Set([firstId, secondId]));
    const lockRows = (await pool.query('SELECT * FROM narrative.relationships WHERE novel_id=$1', [novel])).rows;
    assert.ok(lockRows.some(r => r.is_locked && r.relation_metadata.subject_entity_id === secondId && r.relation_metadata.object_entity_id === secondId));
    assert.ok(lockRows.some(r => !r.is_locked && r.relation_metadata.subject_entity_id !== secondId && r.relation_metadata.object_entity_id === secondId));
    await durable('homonyms-approved-exact-ids', semanticRevision);
    assert.deepEqual(await http('/memory'), semanticMemory);
    // A newer saved revision invalidates the former human checkpoint at Gateway.
    const nextRevision = randomUUID();
    lifecycle.registerRevision(nextRevision);
    await pool.query("INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) VALUES($1,$2,$3,$4,$5,6,'AUTHOR_MANUAL',$6)", [nextRevision, novel, chapter, hash, content, owner]);
    await pool.query('UPDATE chapters SET latest_revision_id=$1 WHERE chapter_id=$2', [nextRevision, chapter]);
    await http(`/entity-reviews/${run}/continue`, 'POST', {}, ownerToken, 409);
  } finally {
    const diagnostic = (value: unknown) => JSON.stringify(value).replace(/[\u007f-\uffff]/g,
      c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    console.log('P1_HTTP_EVIDENCE ' + diagnostic(requests));
    console.log('P1_DURABLE_EVIDENCE ' + diagnostic(readbacks));
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    try {
      await pool.query('DELETE FROM narrative.event_participants WHERE event_id IN (SELECT id FROM narrative.events WHERE novel_id=$1)', [novel]);
      await pool.query('DELETE FROM narrative.state_transitions WHERE novel_id=$1', [novel]);
      await pool.query('DELETE FROM narrative.current_entity_states WHERE novel_id=$1', [novel]);
      await pool.query('DELETE FROM narrative.story_brains WHERE novel_id=$1', [novel]);
      const cleaned = await lifecycle.cleanup(pool, mongo);
      assert.equal(cleaned.cleaned, true, JSON.stringify(cleaned.errors));
    } finally {
      await disconnectChapterWriter();
      await disconnectMongo();
      await disconnectPostgres();
    }
  }
});
