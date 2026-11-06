import { before, after, beforeEach, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { assertTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { env } from '../../core/config/env.js';
import { errorMiddleware } from '../../core/middleware/error.middleware.js';
import { aiGatewayService } from '../ai/ai-gateway.service.js';
import { applyApprovedMemoryToBible, type BibleMemory } from './story-brain-bible.js';
import { listCharactersByNovelId, listTimelineEventsByNovelId, listRelationshipsByNovelId,
  updateCharacterProfile, softDeleteCharacterProfile, updateTimelineEvent, softDeleteTimelineEvent } from './story-context.repository.js';
import { listCharacters } from './story-context.service.js';
import { storyContextRoutes } from './story-context.routes.js';
import type { UpdateCharacterInput, UpdateTimelineEventInput } from './story-context.schemas.js';

describe('Story Brain approved memory -> editable Story Bible', { concurrency: false }, () => {
  const pool = getPostgresPool();
  let user: string, novel: string, chapter: string;
  const memory = (): BibleMemory => {
    const a = randomUUID(), b = randomUUID();
    return { story_id: novel, brain_version: 2,
      entities: [{ entity_id: a, name: 'Amane', entity_type: 'PER' },
        { entity_id: b, name: 'Mahiru', entity_type: 'PER' },
        { entity_id: randomUUID(), name: 'Hà Nội', entity_type: 'LOC' }],
      events: [{ event_id: randomUUID(), summary: 'Amane meets Mahiru.', chapter: 1, event_type: 'interaction' }],
      aliases: [], relations: [{ subject: 'Amane', object: 'Mahiru', relation: 'friend',
        metadata: { subject_entity_id: a, object_entity_id: b } }] };
  };
  before(async () => {
    const name = (await pool.query('select current_database() as name')).rows[0].name;
    assertTestDatabaseIsolation({ pgDatabase: name, mongoDatabase: name });
  });
  beforeEach(async () => {
    user = randomUUID(); novel = randomUUID(); chapter = randomUUID();
    await pool.query(`insert into users(user_id,email,username,role) values($1,$2,$3,'AUTHOR')`, [user, `${user}@test.local`, user]);
    await pool.query(`insert into novels(novel_id,author_id,title,slug,synopsis) values($1::uuid,$2,'Test',$1::text,'Test')`, [novel, user]);
    await pool.query(`insert into chapters(chapter_id,novel_id,title,chapter_number) values($1,$2,'Chapter 1',1)`, [chapter, novel]);
  });
  afterEach(async () => {
    await pool.query('delete from novels where novel_id=$1', [novel]);
    await pool.query('delete from users where user_id=$1', [user]);
  });
  after(disconnectPostgres);

  test('imports only approved characters, events and relations, preserving manual enrichment and IDs', async () => {
    const manual = (await pool.query(`insert into character_profiles(novel_id,name,role,personality,description,notes,created_by,updated_by)
      values($1,'Amane','PROTAGONIST','Kind','My biography','My notes',$2,$2) returning character_id`, [novel, user])).rows[0].character_id;
    const data = memory();
    await Promise.all([applyApprovedMemoryToBible(novel, user, data), applyApprovedMemoryToBible(novel, user, data)]);
    let characters = await listCharactersByNovelId(novel);
    assert.equal(characters.length, 2);
    const amane = characters.find(c => c.name === 'Amane')!;
    assert.equal(amane.characterId, manual);
    assert.equal(amane.role, 'PROTAGONIST');
    assert.equal(amane.personality, 'Kind');
    assert.equal(amane.description, 'My biography');
    assert.equal(amane.notes, 'My notes');
    const mahiru = characters.find(c => c.name === 'Mahiru')!;
    await updateCharacterProfile(mahiru.characterId, user, { role: 'SUPPORTING', description: 'My description', notes: 'Keep' });
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3 });
    characters = await listCharactersByNovelId(novel);
    assert.equal(characters.find(c => c.name === 'Mahiru')?.description, 'My description');
    assert.equal(characters.find(c => c.name === 'Mahiru')?.role, 'SUPPORTING');
    assert.equal((await listTimelineEventsByNovelId(novel))[0].chapterId, chapter);
    assert.equal((await listTimelineEventsByNovelId(novel)).length, 1);
    const relationships = await listRelationshipsByNovelId(novel);
    assert.equal(relationships.length, 1);
    assert.equal(relationships[0].sourceCharacterId, manual);
    assert.equal(relationships[0].targetCharacterId, mahiru.characterId);
  });

  test('does not resurrect deleted profiles; corrected/retired Canon events disappear without deleting manual events', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const character = (await listCharactersByNovelId(novel))[0];
    await softDeleteCharacterProfile(character.characterId, user);
    await pool.query(`insert into story_timeline_events(novel_id,title,event_order,summary,created_by,updated_by)
      values($1,'Manual',9,'An author planned event',$2,$2)`, [novel, user]);
    const next = { ...data, brain_version: 3, relations: [],
      events: [{ ...data.events[0], event_id: randomUUID(), summary: 'Corrected event' }] };
    await applyApprovedMemoryToBible(novel, user, next);
    assert.equal((await listCharactersByNovelId(novel)).length, 1);
    assert.deepEqual((await listTimelineEventsByNovelId(novel)).map(e => e.summary), ['Corrected event', 'An author planned event']);
    assert.equal((await listRelationshipsByNovelId(novel)).length, 0);
    await applyApprovedMemoryToBible(novel, user, data); // stale response cannot undo correction
    assert.deepEqual((await listTimelineEventsByNovelId(novel)).map(e => e.summary), ['Corrected event', 'An author planned event']);
  });

  test('untouched projected characters and events retract and reappear under their original Bible IDs', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const characters = await listCharactersByNovelId(novel);
    const events = await listTimelineEventsByNovelId(novel);
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3, entities: [], events: [], relations: [] });
    assert.deepEqual(await listCharactersByNovelId(novel), []);
    assert.deepEqual(await listTimelineEventsByNovelId(novel), []);
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 4 });
    assert.deepEqual((await listCharactersByNovelId(novel)).map(c => c.characterId), characters.map(c => c.characterId));
    assert.equal((await listTimelineEventsByNovelId(novel))[0].eventId, events[0].eventId);
  });

  for (const [field, patch] of Object.entries({ name: { name: 'Author name' }, role: { role: 'SUPPORTING' },
    personality: { personality: 'Author personality' }, description: { description: 'Author biography' },
    notes: { notes: 'Private plot notes' } } satisfies Record<string, UpdateCharacterInput>)) {
    test(`author-edited character ${field} survives Canon correction, retirement and reappearance`, async () => {
      const data = memory();
      await applyApprovedMemoryToBible(novel, user, data);
      const id = (await listCharactersByNovelId(novel))[0].characterId;
      const edited = await updateCharacterProfile(id, user, patch);
      const renamed = { ...data, entities: data.entities.map(e => ({ ...e, name: `Corrected ${e.name}` })) };
      await applyApprovedMemoryToBible(novel, user, { ...renamed, brain_version: 3 });
      await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 4, entities: [], events: [], relations: [] });
      assert.deepEqual(await listCharactersByNovelId(novel), [edited]);
      await applyApprovedMemoryToBible(novel, user, { ...renamed, brain_version: 5 });
      const kept = (await listCharactersByNovelId(novel)).filter(c => c.characterId === id);
      assert.deepEqual(kept, [edited]);
      assert.equal((await listCharactersByNovelId(novel)).length, 2);
      await softDeleteCharacterProfile(id, user);
      await applyApprovedMemoryToBible(novel, user, { ...renamed, brain_version: 6 });
      assert.ok(!(await listCharactersByNovelId(novel)).some(c => c.characterId === id));
    });
  }

  for (const [field, patch] of Object.entries({ title: { title: 'Author title' }, summary: { summary: 'Author summary' },
    chapterId: { chapterId: null }, eventOrder: { eventOrder: 99 } } satisfies Record<string, UpdateTimelineEventInput>)) {
    test(`author-edited event ${field} survives Canon correction, retirement and reappearance`, async () => {
      const data = memory();
      await applyApprovedMemoryToBible(novel, user, data);
      const id = (await listTimelineEventsByNovelId(novel))[0].eventId;
      const edited = await updateTimelineEvent(id, user, patch);
      const corrected = { ...data, events: [{ ...data.events[0], summary: 'Corrected Canon event', chapter: 2 }] };
      await applyApprovedMemoryToBible(novel, user, { ...corrected, brain_version: 3 });
      await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 4, entities: [], events: [], relations: [] });
      assert.deepEqual(await listTimelineEventsByNovelId(novel), [edited]);
      await applyApprovedMemoryToBible(novel, user, { ...corrected, brain_version: 5 });
      assert.deepEqual(await listTimelineEventsByNovelId(novel), [edited]);
      await softDeleteTimelineEvent(id, user);
      await applyApprovedMemoryToBible(novel, user, { ...corrected, brain_version: 6 });
      assert.deepEqual(await listTimelineEventsByNovelId(novel), []);
    });
  }

  test('author PATCH and GET routes retain enriched rows after Canon withdrawal', async t => {
    let upstream = memory();
    t.mock.method(aiGatewayService, 'forwardRequest', async () => upstream);
    const app = express();
    app.use(express.json(), storyContextRoutes, errorMiddleware);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const token = jwt.sign({ sub: user, role: 'AUTHOR' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
    const request = async <T = unknown>(path: string, patch?: object) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: patch ? 'PATCH' : 'GET',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(patch ? { body: JSON.stringify(patch) } : {})
      });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json() as { data: T }).data;
    };
    try {
      const characters = await request<Array<{ characterId: string }>>(`/novels/${novel}/characters`);
      const events = await request<Array<{ eventId: string }>>(`/novels/${novel}/timeline-events`);
      const character = await request(`/characters/${characters[0].characterId}`, {
        role: 'SUPPORTING', personality: 'Author personality', description: 'Author biography', notes: 'Private plot notes'
      });
      const event = await request(`/timeline-events/${events[0].eventId}`, {
        title: 'Author title', summary: 'Author event', chapterId: null, eventOrder: 9
      });
      upstream = { ...upstream, brain_version: 3, entities: [], events: [], relations: [] };
      assert.deepEqual(await request(`/novels/${novel}/characters`), [character]);
      assert.deepEqual(await request(`/novels/${novel}/timeline-events`), [event]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  test('concurrent author edits and Canon retirement keep the author content visible', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const character = (await listCharactersByNovelId(novel))[0];
    const event = (await listTimelineEventsByNovelId(novel))[0];
    await Promise.all([
      applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3, entities: [], events: [], relations: [] }),
      updateCharacterProfile(character.characterId, user, { notes: 'Concurrent note' }),
      updateTimelineEvent(event.eventId, user, { summary: 'Concurrent event' })
    ]);
    assert.equal((await listCharactersByNovelId(novel))[0].notes, 'Concurrent note');
    assert.equal((await listTimelineEventsByNovelId(novel))[0].summary, 'Concurrent event');
  });

  test('failed author edits do not promote untouched projections', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const character = (await listCharactersByNovelId(novel))[0];
    await assert.rejects(updateCharacterProfile(character.characterId, user, { name: 'x'.repeat(256) }));
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3, entities: [], events: [], relations: [] });
    assert.deepEqual(await listCharactersByNovelId(novel), []);
  });

  test('upgrade repairs previously hidden author edits while keeping untouched projections and tombstones', async () => {
    const data = memory();
    data.events.push({ ...data.events[0], event_id: randomUUID(), summary: 'Untouched event' });
    data.events.push({ ...data.events[0], event_id: randomUUID(), summary: 'Deleted event' });
    await applyApprovedMemoryToBible(novel, user, data);
    const characters = await listCharactersByNovelId(novel);
    const events = await listTimelineEventsByNovelId(novel);
    // Simulate the old PATCH implementation: author fields changed, link ownership unchanged.
    await pool.query(`update character_profiles set notes='Legacy private note' where character_id=$1`, [characters[0].characterId]);
    await pool.query(`update story_timeline_events set event_order=99,updated_at=created_at+interval '1 second' where event_id=$1`, [events[0].eventId]);
    await softDeleteTimelineEvent(events[2].eventId, user);
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3, entities: [], events: [], relations: [] });
    assert.deepEqual(await listCharactersByNovelId(novel), []);
    assert.deepEqual(await listTimelineEventsByNovelId(novel), []);
    const migration = await readFile(new URL('../../core/database/migrations/021_story_bible_author_ownership.sql', import.meta.url), 'utf8');
    await pool.query(migration);
    await pool.query(migration); // Repair remains idempotent.
    assert.equal((await listCharactersByNovelId(novel))[0].notes, 'Legacy private note');
    assert.equal((await listCharactersByNovelId(novel)).length, 1);
    const visible = await listTimelineEventsByNovelId(novel);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].eventId, events[0].eventId);
    assert.equal(visible[0].eventOrder, 99);
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 4 });
    assert.ok(!(await listTimelineEventsByNovelId(novel)).some(e => e.eventId === events[2].eventId));
  });

  test('rejects mismatched novel snapshots and unauthorized reads before synchronization', async () => {
    await assert.rejects(applyApprovedMemoryToBible(novel, user, { ...memory(), story_id: randomUUID() }), /another novel/);
    await assert.rejects(listCharacters({ userId: randomUUID(), role: 'AUTHOR' }, novel), /ownership/);
    assert.equal((await listCharactersByNovelId(novel)).length, 0);
  });

  test('bad imports roll back all rows and the sync checkpoint', async () => {
    await assert.rejects(applyApprovedMemoryToBible(novel, randomUUID(), memory()));
    assert.equal((await listCharactersByNovelId(novel)).length, 0);
    assert.equal((await pool.query('select * from story_brain_bible_sync where novel_id=$1', [novel])).rowCount, 0);
  });

  test('explicit identity merge keeps both author biographies and moves manual relationships', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const chars = await listCharactersByNovelId(novel);
    const source = chars.find(c => c.name === 'Amane')!;
    const target = chars.find(c => c.name === 'Mahiru')!;
    await updateCharacterProfile(source.characterId, user, { description: 'Source biography', notes: 'Source notes', role: 'PROTAGONIST' });
    await updateCharacterProfile(target.characterId, user, { description: 'Target biography', notes: 'Target notes' });
    const third = (await pool.query(`insert into character_profiles(novel_id,name,role,created_by,updated_by)
      values($1,'Itsuki','SUPPORTING',$2,$2) returning character_id`, [novel, user])).rows[0].character_id;
    await pool.query(`insert into character_relationships(novel_id,source_character_id,target_character_id,relationship_type,description)
      values($1,$2,$3,'friend','Author relationship')`, [novel, source.characterId, third]);
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3,
      entities: data.entities.filter(e => e.name !== 'Amane'), relations: [],
      aliases: [{ entity_id: data.entities[1].entity_id, alias: 'Amane' }] });
    const remaining = await listCharactersByNovelId(novel);
    assert.equal(remaining.length, 2);
    const kept = remaining.find(c => c.characterId === target.characterId)!;
    assert.equal(kept.description, 'Target biography');
    assert.equal(kept.role, 'PROTAGONIST');
    assert.ok(kept.notes.includes('Source biography'));
    assert.ok(kept.notes.includes('Source notes'));
    assert.ok(kept.notes.includes('Target notes'));
    const relationships = await listRelationshipsByNovelId(novel);
    assert.equal(relationships.length, 1);
    assert.equal(relationships[0].sourceCharacterId, target.characterId);
    assert.equal(relationships[0].description, 'Author relationship');
    await applyApprovedMemoryToBible(novel, user, { ...data, brain_version: 3 });
    assert.equal((await listCharactersByNovelId(novel)).length, 2);
  });

  test('explicit merge transfers author ownership to an untouched target without leaving a duplicate', async () => {
    const data = memory();
    await applyApprovedMemoryToBible(novel, user, data);
    const chars = await listCharactersByNovelId(novel);
    const source = chars.find(c => c.name === 'Amane')!;
    const target = chars.find(c => c.name === 'Mahiru')!;
    await updateCharacterProfile(source.characterId, user, { notes: 'Source author note' });
    const merged = { ...data, brain_version: 3,
      entities: [data.entities[1]], events: [], relations: [],
      aliases: [{ entity_id: data.entities[1].entity_id, alias: 'Amane' }] };
    await applyApprovedMemoryToBible(novel, user, merged);
    await applyApprovedMemoryToBible(novel, user, { ...merged, brain_version: 4, entities: [], aliases: [] });
    const remaining = await listCharactersByNovelId(novel);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].characterId, target.characterId);
    assert.ok(remaining[0].notes.includes('Source author note'));
    await applyApprovedMemoryToBible(novel, user, { ...merged, brain_version: 5 });
    assert.equal((await listCharactersByNovelId(novel)).length, 1);
  });
});
