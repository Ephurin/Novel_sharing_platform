import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { env } from '../../core/config/env.js';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import type { UserRole } from '../../shared/constants/roles.js';

describe('PR-08 novel selection', () => {
  const db = getPostgresPool();
  const reason = 'Tác phẩm có cốt truyện nhất quán, nội dung có cấu trúc và phần công khai dễ đọc.';
  const criteria = { content: true, readability: true, consistency: true, completeness: true };
  let server: Server;
  let base: string;
  let author: string, reader: string, reader2: string, moderator: string, secondModerator: string;

  async function user(role: UserRole) {
    const id = randomUUID();
    await db.query("insert into users(user_id,email,username,role,status) values($1,$2,$3,$4,'ACTIVE')", [id, `${id}@example.test`, id, role]);
    return id;
  }

  async function novel(owner: string, chapterCount: number, short = false) {
    const { rows: [row] } = await db.query<{ novel_id: string }>(`insert into novels(author_id,title,synopsis,slug,status,story_format,serial_status)
      values($1,'Tác phẩm tuyển chọn',$2,$3,'PUBLISHED',$4,$5) returning novel_id`,
    [owner, reason, randomUUID(), short ? 'SHORT_STORY' : null, short ? 'COMPLETED' : 'ONGOING']);
    const chapters = await db.query<{ chapter_id: string }>(`insert into chapters(novel_id,chapter_number,title,content,status,published_at)
      select $1,n,'Chương '||n,'Đoạn văn số '||n,'PUBLISHED',now() from generate_series(1,$2) n returning chapter_id`, [row.novel_id, chapterCount]);
    return { id: row.novel_id, chapters: chapters.rows.map((chapter) => chapter.chapter_id) };
  }

  async function call(method: string, path: string, actor?: string, body?: object, key?: string) {
    const response = await fetch(base + path, {
      method, headers: {
        ...(actor ? { authorization: `Bearer ${jwt.sign({ sub: actor, role: 'READER', ver: 0 }, env.JWT_ACCESS_SECRET)}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {})
      }, body: body ? JSON.stringify(body) : undefined
    });
    const payload = JSON.parse(await response.text());
    return { status: response.status, data: payload.data, error: payload.error };
  }

  const nominate = (id: string, actor: string, key = randomUUID(), nominationReason = reason) =>
    call('POST', `/novels/${id}/nominations`, actor, { reason: nominationReason }, key);
  const detail = (id: string, mod = moderator) => call('GET', `/moderator/selections/${id}`, mod);
  const decision = (id: string, version: number, action: string, input: { actor?: string; short?: boolean; criteria?: typeof criteria } = {}) =>
    call('POST', `/moderator/selections/${id}/decisions`, input.actor ?? moderator, {
      decision: action, expectedVersion: version, reason, criteria: input.criteria ?? criteria, shortStoryVerified: input.short
    });
  const publicDetail = (id: string) => call('GET', `/reading/novels/${id}`);

  before(async () => {
    await validateTestDatabaseIsolation(db, getMongoDatabase());
    env.NOVEL_SELECTION_ENABLED = true;
    env.MODERATOR_ENABLED = true;
    [author, reader, reader2, moderator, secondModerator] = await Promise.all(
      (['AUTHOR','READER','READER','MODERATOR','MODERATOR'] as const).map(user));
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  });
  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('E10/E11: eligibility, one nomination per user, one active case and stable idempotency', async () => {
    const two = await novel(author, 2);
    assert.equal((await nominate(two.id, reader)).status, 422);
    const target = await novel(author, 3);
    const key = randomUUID();
    const [first, second, retry] = await Promise.all([
      nominate(target.id, reader, key), nominate(target.id, reader2), nominate(target.id, reader, key)
    ]);
    assert.deepEqual([first.status, retry.status].sort(), [200, 201]);
    assert.equal(second.status, 201);
    assert.equal(second.data.caseId, first.data.caseId);
    assert.deepEqual(retry.data, first.data);
    assert.equal((await nominate(target.id, reader, key, reason + ' Lý do khác.')).error.code, 'SELECTION_IDEMPOTENCY');
    assert.equal((await nominate(two.id, reader, key)).error.code, 'SELECTION_IDEMPOTENCY');
    assert.equal((await nominate(target.id, reader)).error.code, 'SELECTION_DUPLICATE');
    assert.equal((await nominate(target.id, author)).status, 201);
    assert.equal((await call('GET', '/account/nominations', reader)).data.items.length, 1);
    assert.equal((await call('GET', `/author/novels/${target.id}/selection`, reader)).status, 404);
  });

  test('E11/E12: owner and nominators cannot review, author alone supplements, competing reviewers resolve once', async () => {
    const target = await novel(moderator, 3);
    assert.equal((await nominate(target.id, moderator)).status, 403);
    const { data: { caseId } } = await nominate(target.id, reader);
    const [reviewer, reviewer2] = await Promise.all([user('MODERATOR'), user('MODERATOR')]);
    const initialVersion = (await detail(caseId, reviewer)).data.version;
    assert.equal((await nominate(target.id, secondModerator)).status, 201);
    assert.equal((await detail(caseId)).status, 403);
    assert.equal((await detail(caseId, secondModerator)).status, 403);
    const updated = (await detail(caseId, reviewer)).data;
    assert.equal(updated.version, initialVersion, 'additional nomination reasons are advisory');
    assert.equal(updated.nominations.length, 2);
    assert.equal((await decision(caseId, initialVersion, 'REQUEST_INFO', { actor: secondModerator })).status, 403);
    assert.equal((await decision(caseId, initialVersion, 'REQUEST_INFO', { actor: reviewer })).data.status, 'NEEDS_INFO');
    assert.equal((await call('POST', `/novels/${target.id}/selections/${caseId}/supplement`, reader, { notes: reason, expectedVersion: 2 })).status, 404);
    const supplement = await call('POST', `/novels/${target.id}/selections/${caseId}/supplement`, moderator, { notes: reason, expectedVersion: 2 });
    assert.equal(supplement.data.status, 'PENDING');
    assert.equal((await decision(caseId, 3, 'APPROVE', { actor: reviewer, criteria: { ...criteria, completeness: false } })).status, 422);
    const outcomes = await Promise.all([decision(caseId, 3, 'APPROVE', { actor: reviewer }), decision(caseId, 3, 'APPROVE', { actor: reviewer2 })]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [200, 409]);
    assert.ok((await publicDetail(target.id)).data.selectionLabel);
    assert.equal((await db.query("select 1 from novel_selection_events where case_id=$1 and action='APPROVE'", [caseId])).rowCount, 1);
    assert.equal((await db.query('select 1 from notification_events where event_key=$1', [`novel-selection:${caseId}:4`])).rowCount, 1);
  });

  test('E18: metadata ownership and public free short-story exception are checked at nomination and review', async () => {
    const target = await novel(author, 1);
    assert.equal((await call('PATCH', `/novels/${target.id}`, reader, { storyFormat: 'SHORT_STORY' })).status, 403);
    assert.equal((await call('PATCH', `/novels/${target.id}`, author, { storyFormat: 'NOVEL' })).status, 400);
    assert.equal((await call('PATCH', `/novels/${target.id}`, author, { storyFormat: 'SHORT_STORY' })).data.storyFormat, 'SHORT_STORY');
    assert.equal((await nominate(target.id, reader)).status, 422);
    assert.equal((await call('PATCH', `/novels/${target.id}`, author, { serialStatus: 'COMPLETED' })).data.storyFormat, 'SHORT_STORY');
    await db.query('update chapters set is_vip=true where chapter_id=$1', target.chapters);
    assert.equal((await nominate(target.id, reader)).status, 422);
    assert.equal((await publicDetail(target.id)).data.selectionEligible, false);
    await db.query('update chapters set is_vip=false where chapter_id=$1', target.chapters);
    assert.equal((await publicDetail(target.id)).data.selectionEligible, true);
    const { data: { caseId } } = await nominate(target.id, reader);
    assert.equal((await decision(caseId, 1, 'APPROVE')).error.code, 'SELECTION_SHORT_STORY');
    assert.equal((await decision(caseId, 1, 'APPROVE', { short: true })).status, 200);
    assert.ok((await publicDetail(target.id)).data.selectionLabel);
    await db.query('update chapters set is_vip=true where chapter_id=$1', target.chapters);
    assert.equal((await detail(caseId)).data.status, 'RECHECK');
    assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
    await db.query('update chapters set is_vip=false where chapter_id=$1', target.chapters);
    assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
    const updatedVersion = (await detail(caseId)).data.version;
    assert.equal((await decision(caseId, 2, 'APPROVE', { short: true })).status, 409);
    assert.equal((await decision(caseId, updatedVersion, 'APPROVE', { short: true })).status, 200);
  });

  test('E13/E14/E19: exact revision reuse, equivalent formatting, same baseline for successive edits, hide and restore', async () => {
    const target = await novel(author, 3);
    const chapterId = target.chapters[0];
    const initial = 'Đoạn văn số 1';
    const { rows: [revision] } = await db.query<{ revision_id: string }>(`insert into chapter_revisions(novel_id,chapter_id,content,content_hash,source_type)
      values($1,$2,$3,$4,'AI_DRAFT_ACCEPT') returning revision_id`,
    [target.id, chapterId, initial, createHash('sha256').update(initial).digest('hex')]);
    const { data: { caseId } } = await nominate(target.id, reader);
    assert.equal((await decision(caseId, 1, 'APPROVE')).status, 200);
    const original = (await detail(caseId)).data.baseline;
    assert.equal(original.chapters[0].revisionId, revision.revision_id);
    await db.query("update chapters set content='<p><strong>Đoạn văn số 1</strong></p>' where chapter_id=$1", [chapterId]);
    assert.equal((await detail(caseId)).data.needs_comparison, false);
    await db.query("insert into chapters(novel_id,chapter_number,title,content,status) values($1,4,'Thêm chương','Nội dung mới','PUBLISHED'),($1,5,'Nháp','Nháp','DRAFT')", [target.id]);
    assert.equal((await detail(caseId)).data.needs_comparison, false);
    for (const replacement of ['Đoạn văn số 1.', 'Đoạn văn số 1!']) {
      await db.query('update chapters set content=$2 where chapter_id=$1', [chapterId, replacement]);
      const { data: current } = await detail(caseId);
      assert.equal(current.needs_comparison, true);
      assert.deepEqual(current.baseline, original);
      assert.equal((await decision(caseId, current.version, 'CONFIRM_MINOR_CHANGE')).status, 200);
      const compare = await call('GET', `/moderator/selections/${caseId}/chapters/${chapterId}`, moderator);
      assert.equal(compare.data.baseline.content, initial);
      assert.equal(compare.data.current.content, replacement);
      assert.ok((await publicDetail(target.id)).data.selectionLabel);
    }
    await db.query("update chapters set content='Bản sửa của chương được thêm sau' where novel_id=$1 and chapter_number=4", [target.id]);
    assert.equal((await detail(caseId)).data.needs_comparison, false);
    await db.query("update chapters set content='Kết thúc đã thay đổi đáng kể.' where chapter_id=$1", [chapterId]);
    const current = (await detail(caseId)).data;
    assert.equal((await decision(caseId, current.version, 'REOPEN')).data.status, 'RECHECK');
    assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
    assert.equal((await decision(caseId, current.version + 1, 'APPROVE')).status, 200);
    await db.query('update novels set deleted_at=now() where novel_id=$1', [target.id]);
    assert.equal((await publicDetail(target.id)).status, 404);
    await db.query('update novels set deleted_at=null where novel_id=$1', [target.id]);
    assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
    assert.equal((await detail(caseId)).data.status, 'RECHECK');
  });

  test('E19: rubric and eligibility are identical with and without AI revision history', async () => {
    const manual = await novel(author, 3);
    const assisted = await novel(author, 3);
    await db.query(`insert into chapter_revisions(novel_id,chapter_id,content,content_hash,source_type)
      select novel_id,chapter_id,content,encode(sha256(convert_to(content,'UTF8')),'hex'),'AI_DRAFT_ACCEPT'
      from chapters where chapter_id=$1`, [assisted.chapters[0]]);
    for (const target of [manual, assisted]) {
      const { data: { caseId } } = await nominate(target.id, reader);
      assert.equal((await detail(caseId)).data.eligibility, 'STANDARD');
      assert.equal((await decision(caseId, 1, 'APPROVE', { criteria: { ...criteria, consistency: false } })).status, 422);
      assert.equal((await decision(caseId, 1, 'APPROVE')).status, 200);
      assert.ok((await publicDetail(target.id)).data.selectionLabel);
    }
  });

  test('rejection and revocation enforce the cooldown, while disabling the flag preserves records', async () => {
    const target = await novel(author, 3);
    const key = randomUUID();
    const { data: { caseId } } = await nominate(target.id, reader, key);
    assert.equal((await decision(caseId, 1, 'REJECT')).data.status, 'REJECTED');
    assert.equal((await nominate(target.id, reader, key)).data.status, 'PENDING');
    assert.equal((await nominate(target.id, reader2)).error.code, 'SELECTION_COOLDOWN');
    await db.query("update novel_selection_cases set terminal_at=now()-interval '31 days' where case_id=$1", [caseId]);
    const reopened = await nominate(target.id, reader2);
    assert.equal(reopened.status, 201);
    assert.notEqual(reopened.data.caseId, caseId);
    assert.equal((await decision(reopened.data.caseId, 1, 'APPROVE')).status, 200);
    env.NOVEL_SELECTION_ENABLED = false;
    try {
      assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
      assert.equal((await detail(reopened.data.caseId)).status, 404);
      assert.equal((await nominate(target.id, reader)).status, 404);
    } finally {
      env.NOVEL_SELECTION_ENABLED = true;
    }
    assert.ok((await publicDetail(target.id)).data.selectionLabel);
    assert.equal((await decision(reopened.data.caseId, 2, 'REVOKE')).data.status, 'REVOKED');
    assert.equal((await publicDetail(target.id)).data.selectionLabel, undefined);
    assert.equal((await nominate(target.id, reader)).error.code, 'SELECTION_COOLDOWN');
  });
});
