import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type {
  CreateCharacterInput,
  CreatePlotSummaryInput,
  CreateRelationshipInput,
  CreateTimelineEventInput,
  UpdateCharacterInput,
  UpdatePlotSummaryInput,
  UpdateRelationshipInput,
  UpdateTimelineEventInput
} from './story-context.schemas.js';

/** Author edits take ownership atomically, using the same novel lock as Canon sync. */
async function updateAuthorBibleRow(kind: 'entity' | 'event', id: string, sql: string, values: unknown[]) {
  const [table, key] = kind === 'entity'
    ? ['character_profiles', 'character_id'] : ['story_timeline_events', 'event_id'];
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    const row = (await client.query(`select novel_id from ${table} where ${key}=$1`, [id])).rows[0];
    if (row) {
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`bible:${row.novel_id}`]);
    }
    const result = await client.query(sql, values);
    if (row && result.rowCount) {
      // Keep the stable identity link and tombstone behavior, but relinquish projection ownership.
      await client.query(`update story_brain_bible_links set owns_bible_row=false
        where novel_id=$1 and artifact_kind=$2 and bible_id=$3`, [row.novel_id, kind, id]);
    }
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

function mapCharacter(row: QueryResultRow) {
  return {
    characterId: row.character_id,
    novelId: row.novel_id,
    name: row.name,
    role: row.role,
    personality: row.personality,
    description: row.description,
    notes: row.notes,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRelationship(row: QueryResultRow) {
  return {
    relationshipId: row.relationship_id,
    novelId: row.novel_id,
    sourceCharacterId: row.source_character_id,
    sourceCharacterName: row.source_character_name,
    targetCharacterId: row.target_character_id,
    targetCharacterName: row.target_character_name,
    relationshipType: row.relationship_type,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTimelineEvent(row: QueryResultRow) {
  return {
    eventId: row.event_id,
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    title: row.title,
    eventOrder: row.event_order,
    summary: row.summary,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPlotSummary(row: QueryResultRow) {
  return {
    summaryId: row.summary_id,
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    scope: row.scope,
    arcName: row.arc_name,
    startChapterNumber: row.start_chapter_number,
    endChapterNumber: row.end_chapter_number,
    summary: row.summary,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listCharactersByNovelId(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select *
      from character_profiles
      where novel_id = $1 and deleted_at is null
        and not exists(select 1 from story_brain_bible_links l where l.novel_id=$1
          and l.artifact_kind='entity' and l.bible_id=character_id and l.owns_bible_row and not l.is_active)
      order by name asc
    `,
    [novelId]
  );

  return result.rows.map(mapCharacter);
}

export async function findCharacterById(characterId: string) {
  const result = await getPostgresPool().query(
    `
      select *
      from character_profiles
      where character_id = $1 and deleted_at is null
      limit 1
    `,
    [characterId]
  );

  return result.rows[0] ? mapCharacter(result.rows[0]) : null;
}

export async function createCharacterProfile(
  novelId: string,
  userId: string,
  input: CreateCharacterInput
) {
  const result = await getPostgresPool().query(
    `
      insert into character_profiles (
        novel_id, name, role, personality, description, notes, source, created_by, updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      returning *
    `,
    [
      novelId,
      input.name,
      input.role,
      input.personality ?? null,
      input.description ?? null,
      input.notes ?? null,
      input.source,
      userId
    ]
  );

  return mapCharacter(result.rows[0]);
}

export async function updateCharacterProfile(characterId: string, userId: string, input: UpdateCharacterInput) {
  const result = await updateAuthorBibleRow('entity', characterId,
    `
      update character_profiles
      set
        name = case when $2 then $3 else name end,
        role = case when $4 then $5 else role end,
        personality = case when $6 then $7 else personality end,
        description = case when $8 then $9 else description end,
        notes = case when $10 then $11 else notes end,
        updated_by = $12,
        updated_at = now()
      where character_id = $1 and deleted_at is null
      returning *
    `,
    [
      characterId,
      'name' in input,
      input.name,
      'role' in input,
      input.role,
      'personality' in input,
      input.personality,
      'description' in input,
      input.description,
      'notes' in input,
      input.notes,
      userId
    ]
  );

  return result.rows[0] ? mapCharacter(result.rows[0]) : null;
}

export async function softDeleteCharacterProfile(characterId: string, userId: string) {
  await getPostgresPool().query(
    `
      update character_profiles
      set deleted_at = now(), updated_by = $2, updated_at = now()
      where character_id = $1 and deleted_at is null
    `,
    [characterId, userId]
  );
}

export async function listRelationshipsByNovelId(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select
        cr.*,
        source_character.name as source_character_name,
        target_character.name as target_character_name
      from character_relationships cr
      join character_profiles source_character on source_character.character_id = cr.source_character_id
      join character_profiles target_character on target_character.character_id = cr.target_character_id
      where cr.novel_id = $1
        and source_character.deleted_at is null and target_character.deleted_at is null
        and not exists(select 1 from story_brain_bible_links l where l.novel_id=$1
          and l.artifact_kind='relation' and l.bible_id=cr.relationship_id and l.owns_bible_row and not l.is_active
          and not exists(select 1 from story_brain_bible_links active where active.novel_id=$1
            and active.artifact_kind='relation' and active.bible_id=cr.relationship_id and active.is_active))
      order by source_character.name asc, target_character.name asc, cr.relationship_type asc
    `,
    [novelId]
  );

  return result.rows.map(mapRelationship);
}

export async function findRelationshipById(relationshipId: string) {
  const result = await getPostgresPool().query(
    `
      select
        cr.*,
        source_character.name as source_character_name,
        target_character.name as target_character_name
      from character_relationships cr
      join character_profiles source_character on source_character.character_id = cr.source_character_id
      join character_profiles target_character on target_character.character_id = cr.target_character_id
      where cr.relationship_id = $1
      limit 1
    `,
    [relationshipId]
  );

  return result.rows[0] ? mapRelationship(result.rows[0]) : null;
}

export async function createCharacterRelationship(novelId: string, input: CreateRelationshipInput) {
  const result = await getPostgresPool().query(
    `
      insert into character_relationships (
        novel_id, source_character_id, target_character_id, relationship_type, description
      )
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      novelId,
      input.sourceCharacterId,
      input.targetCharacterId,
      input.relationshipType,
      input.description ?? null
    ]
  );

  return findRelationshipById(result.rows[0].relationship_id);
}

export async function updateCharacterRelationship(relationshipId: string, input: UpdateRelationshipInput) {
  const result = await getPostgresPool().query(
    `
      update character_relationships
      set
        source_character_id = case when $2 then $3 else source_character_id end,
        target_character_id = case when $4 then $5 else target_character_id end,
        relationship_type = case when $6 then $7 else relationship_type end,
        description = case when $8 then $9 else description end,
        updated_at = now()
      where relationship_id = $1
      returning relationship_id
    `,
    [
      relationshipId,
      'sourceCharacterId' in input,
      input.sourceCharacterId,
      'targetCharacterId' in input,
      input.targetCharacterId,
      'relationshipType' in input,
      input.relationshipType,
      'description' in input,
      input.description
    ]
  );

  return result.rows[0] ? findRelationshipById(result.rows[0].relationship_id) : null;
}

export async function deleteCharacterRelationship(relationshipId: string) {
  await getPostgresPool().query('delete from character_relationships where relationship_id = $1', [relationshipId]);
}

export async function listTimelineEventsByNovelId(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select
        ste.*,
        c.chapter_number,
        c.title as chapter_title
      from story_timeline_events ste
      left join chapters c on c.chapter_id = ste.chapter_id
      where ste.novel_id = $1 and ste.deleted_at is null
        and not exists(select 1 from story_brain_bible_links l where l.novel_id=$1
          and l.artifact_kind='event' and l.bible_id=ste.event_id and l.owns_bible_row and not l.is_active)
      order by ste.event_order asc, c.chapter_number asc nulls last, ste.created_at asc
    `,
    [novelId]
  );

  return result.rows.map(mapTimelineEvent);
}

export async function findTimelineEventById(eventId: string) {
  const result = await getPostgresPool().query(
    `
      select
        ste.*,
        c.chapter_number,
        c.title as chapter_title
      from story_timeline_events ste
      left join chapters c on c.chapter_id = ste.chapter_id
      where ste.event_id = $1 and ste.deleted_at is null
      limit 1
    `,
    [eventId]
  );

  return result.rows[0] ? mapTimelineEvent(result.rows[0]) : null;
}

export async function createTimelineEvent(novelId: string, userId: string, input: CreateTimelineEventInput) {
  const result = await getPostgresPool().query(
    `
      insert into story_timeline_events (
        novel_id, chapter_id, title, event_order, summary, source, created_by, updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $7)
      returning event_id
    `,
    [novelId, input.chapterId ?? null, input.title, input.eventOrder, input.summary, input.source, userId]
  );

  return findTimelineEventById(result.rows[0].event_id);
}

export async function updateTimelineEvent(eventId: string, userId: string, input: UpdateTimelineEventInput) {
  const result = await updateAuthorBibleRow('event', eventId,
    `
      update story_timeline_events
      set
        chapter_id = case when $2 then $3 else chapter_id end,
        title = case when $4 then $5 else title end,
        event_order = case when $6 then $7 else event_order end,
        summary = case when $8 then $9 else summary end,
        updated_by = $10,
        updated_at = now()
      where event_id = $1 and deleted_at is null
      returning event_id
    `,
    [
      eventId,
      'chapterId' in input,
      input.chapterId,
      'title' in input,
      input.title,
      'eventOrder' in input,
      input.eventOrder,
      'summary' in input,
      input.summary,
      userId
    ]
  );

  return result.rows[0] ? findTimelineEventById(result.rows[0].event_id) : null;
}

export async function softDeleteTimelineEvent(eventId: string, userId: string) {
  await getPostgresPool().query(
    `
      update story_timeline_events
      set deleted_at = now(), updated_by = $2, updated_at = now()
      where event_id = $1 and deleted_at is null
    `,
    [eventId, userId]
  );
}

export async function listPlotSummariesByNovelId(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select
        ps.*,
        c.chapter_number,
        c.title as chapter_title
      from plot_summaries ps
      left join chapters c on c.chapter_id = ps.chapter_id
      where ps.novel_id = $1 and ps.deleted_at is null
      order by
        case ps.scope when 'NOVEL' then 1 when 'ARC' then 2 else 3 end,
        ps.start_chapter_number asc nulls last,
        c.chapter_number asc nulls last
    `,
    [novelId]
  );

  return result.rows.map(mapPlotSummary);
}

export async function findPlotSummaryById(summaryId: string) {
  const result = await getPostgresPool().query(
    `
      select
        ps.*,
        c.chapter_number,
        c.title as chapter_title
      from plot_summaries ps
      left join chapters c on c.chapter_id = ps.chapter_id
      where ps.summary_id = $1 and ps.deleted_at is null
      limit 1
    `,
    [summaryId]
  );

  return result.rows[0] ? mapPlotSummary(result.rows[0]) : null;
}

export async function createPlotSummary(novelId: string, userId: string, input: CreatePlotSummaryInput) {
  const result = await getPostgresPool().query(
    `
      insert into plot_summaries (
        novel_id, chapter_id, scope, arc_name, start_chapter_number, end_chapter_number, summary, source, created_by, updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      returning summary_id
    `,
    [
      novelId,
      input.chapterId ?? null,
      input.scope,
      input.arcName ?? null,
      input.startChapterNumber ?? null,
      input.endChapterNumber ?? null,
      input.summary,
      input.source,
      userId
    ]
  );

  return findPlotSummaryById(result.rows[0].summary_id);
}

export async function updatePlotSummary(summaryId: string, userId: string, input: UpdatePlotSummaryInput) {
  const result = await getPostgresPool().query(
    `
      update plot_summaries
      set
        chapter_id = case when $2 then $3 else chapter_id end,
        scope = case when $4 then $5 else scope end,
        arc_name = case when $6 then $7 else arc_name end,
        start_chapter_number = case when $8 then $9 else start_chapter_number end,
        end_chapter_number = case when $10 then $11 else end_chapter_number end,
        summary = case when $12 then $13 else summary end,
        updated_by = $14,
        updated_at = now()
      where summary_id = $1 and deleted_at is null
      returning summary_id
    `,
    [
      summaryId,
      'chapterId' in input,
      input.chapterId,
      'scope' in input,
      input.scope,
      'arcName' in input,
      input.arcName,
      'startChapterNumber' in input,
      input.startChapterNumber,
      'endChapterNumber' in input,
      input.endChapterNumber,
      'summary' in input,
      input.summary,
      userId
    ]
  );

  return result.rows[0] ? findPlotSummaryById(result.rows[0].summary_id) : null;
}

export async function softDeletePlotSummary(summaryId: string, userId: string) {
  await getPostgresPool().query(
    `
      update plot_summaries
      set deleted_at = now(), updated_by = $2, updated_at = now()
      where summary_id = $1 and deleted_at is null
    `,
    [summaryId, userId]
  );
}
