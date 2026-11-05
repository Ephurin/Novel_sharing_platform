import { before, after, beforeEach, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { assertTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { applyApprovedMemoryToBible, type BibleMemory } from './story-brain-bible.js';
import { listCharactersByNovelId, listTimelineEventsByNovelId, listRelationshipsByNovelId,
  updateCharacterProfile, softDeleteCharacterProfile } from './story-context.repository.js';
import { listCharacters } from './story-context.service.js';

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
});
