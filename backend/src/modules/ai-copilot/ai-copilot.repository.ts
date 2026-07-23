import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';

function mapCharacter(row: QueryResultRow) {
  return {
    characterId: row.character_id,
    name: row.name,
    role: row.role,
    personality: row.personality,
    description: row.description,
    notes: row.notes
  };
}

function mapTimelineEvent(row: QueryResultRow) {
  return {
    eventId: row.event_id,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    title: row.title,
    eventOrder: row.event_order,
    summary: row.summary
  };
}

export async function listCopilotCharacters(novelId: string) {
  const result = await getPostgresPool().query(
    `
      select character_id, name, role, personality, description, notes
      from character_profiles
      where novel_id = $1 and deleted_at is null
      order by
        case role
          when 'PROTAGONIST' then 1
          when 'ANTAGONIST' then 2
          when 'SUPPORTING' then 3
          else 4
        end,
        name asc
    `,
    [novelId]
  );

  return result.rows.map(mapCharacter);
}

export async function listRecentCopilotTimelineEvents(novelId: string, chapterId: string | null | undefined) {
  const result = await getPostgresPool().query(
    `
      with current_chapter as (
        select chapter_number
        from chapters
        where chapter_id = $2 and novel_id = $1 and deleted_at is null
        limit 1
      )
      select *
      from (
        select
          ste.event_id,
          ste.chapter_id,
          c.chapter_number,
          c.title as chapter_title,
          ste.title,
          ste.event_order,
          ste.summary
        from story_timeline_events ste
        left join chapters c on c.chapter_id = ste.chapter_id
        where ste.novel_id = $1
          and ste.deleted_at is null
          and (
            $2::uuid is null
            or c.chapter_number is null
            or c.chapter_number <= coalesce((select chapter_number from current_chapter), c.chapter_number)
          )
        order by ste.event_order desc, c.chapter_number desc nulls last, ste.created_at desc
        limit 5
      ) recent_events
      order by event_order asc, chapter_number asc nulls last
    `,
    [novelId, chapterId ?? null]
  );

  return result.rows.map(mapTimelineEvent);
}
