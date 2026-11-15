import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';
import { aiGatewayService } from '../ai/ai-gateway.service.js';

const approvedMemorySchema = z.object({
  story_id: z.string().uuid(),
  brain_version: z.number().int().nonnegative(),
  entities: z.array(z.object({ entity_id: z.string().uuid(), name: z.string().min(1).max(255), entity_type: z.string() })),
  events: z.array(z.object({ event_id: z.string().uuid(), summary: z.string(), chapter: z.number().int(),
    event_type: z.string(), metadata: z.record(z.unknown()).optional() })),
  aliases: z.array(z.object({ entity_id: z.string().uuid(), alias: z.string() })).default([]),
  relations: z.array(z.object({ subject: z.string(), object: z.string(), relation: z.string(),
    metadata: z.object({ subject_entity_id: z.string().uuid().optional(), object_entity_id: z.string().uuid().optional() }).passthrough().optional() })).default([])
});
export type BibleMemory = z.infer<typeof approvedMemorySchema>;

/** Idempotent projection; author edits and deletion tombstones always survive. */
export async function applyApprovedMemoryToBible(novelId: string, userId: string, input: unknown, pool: Pool = getPostgresPool()) {
  const memory = approvedMemorySchema.parse(input);
  if (memory.story_id !== novelId) throw new AppError(502, 'BIBLE_SCOPE_MISMATCH', 'Story Brain belongs to another novel');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`bible:${novelId}`]);
    const previous = await client.query('select brain_version from story_brain_bible_sync where novel_id=$1', [novelId]);
    if (previous.rows[0] && Number(previous.rows[0].brain_version) >= memory.brain_version) {
      await client.query('commit');
      return { brainVersion: Number(previous.rows[0].brain_version) };
    }
    const links = (await client.query('select * from story_brain_bible_links where novel_id=$1', [novelId])).rows;
    const linked = (kind: string, id: string) => links.find(l => l.artifact_kind === kind && l.artifact_id === id);
    await client.query('update story_brain_bible_links set is_active=false where novel_id=$1', [novelId]);
    const saveLink = async (kind: string, id: string, bibleId: string, snapshot: object, owns: boolean) => {
      await client.query(`insert into story_brain_bible_links(novel_id,artifact_kind,artifact_id,bible_id,source_snapshot,owns_bible_row)
        values($1,$2,$3,$4,$5,$6) on conflict(novel_id,artifact_kind,artifact_id) do update
        set is_active=true,source_snapshot=excluded.source_snapshot`, [novelId, kind, id, bibleId, snapshot, owns]);
    };
    const entityProfiles = new Map<string, string>();
    for (const entity of memory.entities.filter(e => ['PER', 'CHARACTER', 'PERSON'].includes(e.entity_type.toUpperCase()))) {
      const link = linked('entity', entity.entity_id);
      let id = link?.bible_id as string | undefined;
      let owns = Boolean(link?.owns_bible_row);
      if (!id) {
        // Exact, unambiguous names only; never infer that two different names are aliases.
        const matches = await client.query(`select character_id from character_profiles p where novel_id=$1
          and lower(trim(name))=lower(trim($2)) and not exists(select 1 from story_brain_bible_links l
          where l.novel_id=$1 and l.artifact_kind='entity' and l.bible_id=p.character_id)`, [novelId, entity.name]);
        if (matches.rows.length === 1) id = matches.rows[0].character_id;
        else {
          id = (await client.query(`insert into character_profiles(novel_id,name,role,source,created_by,updated_by)
            values($1,$2,'MINOR','AICOPILOT_SUGGESTION',$3,$3) returning character_id`, [novelId, entity.name, userId])).rows[0].character_id;
          owns = true;
        }
      } else if (owns) {
        await client.query(`update character_profiles set name=$3,updated_at=now() where character_id=$1
          and novel_id=$2 and name=$4 and deleted_at is null and name is distinct from $3`,
          [id, novelId, entity.name, link.source_snapshot.name]);
      }
      await saveLink('entity', entity.entity_id, id!, { name: entity.name }, owns);
      entityProfiles.set(entity.entity_id, id!);
    }
    // A removed identity whose name is now an explicit alias was author-merged.
    // Move its author enrichment and manual relationship endpoints before hiding it.
    for (const old of links.filter(l => l.artifact_kind === 'entity' && !entityProfiles.has(l.artifact_id))) {
      const targets = [...new Set(memory.aliases.filter(a =>
        a.alias.trim().toLowerCase() === String(old.source_snapshot.name).trim().toLowerCase()
        && entityProfiles.has(a.entity_id)).map(a => entityProfiles.get(a.entity_id)!))];
      if (targets.length !== 1 || targets[0] === old.bible_id) continue;
      const targetId = targets[0];
      const rows = (await client.query('select * from character_profiles where novel_id=$1 and character_id=any($2::uuid[]) order by character_id for update',
        [novelId, [old.bible_id, targetId]])).rows;
      const source = rows.find(r => r.character_id === old.bible_id);
      const target = rows.find(r => r.character_id === targetId);
      if (!source || !target || source.deleted_at || target.deleted_at) continue;
      const extra = [];
      if (source.notes && source.notes !== target.notes) extra.push(source.notes);
      if (source.description && target.description && source.description !== target.description) extra.push(`Mô tả: ${source.description}`);
      if (source.personality && target.personality && source.personality !== target.personality) extra.push(`Tính cách: ${source.personality}`);
      if (source.role !== 'MINOR' && target.role !== 'MINOR' && source.role !== target.role) extra.push(`Vai trò: ${source.role}`);
      const notes = [target.notes, extra.length ? `[Thông tin từ ${source.name}]\n${extra.join('\n')}` : null].filter(Boolean).join('\n\n') || null;
      await client.query(`update character_profiles set role=$3,personality=$4,description=$5,notes=$6,updated_by=$7,updated_at=now()
        where novel_id=$1 and character_id=$2`, [novelId, targetId,
        target.role === 'MINOR' ? source.role : target.role, target.personality || source.personality,
        target.description || source.description, notes, userId]);
      if (!old.owns_bible_row) {
        // An explicit merge transfers author ownership along with the source's enrichment.
        await client.query(`update story_brain_bible_links set owns_bible_row=false
          where novel_id=$1 and artifact_kind='entity' and bible_id=$2`, [novelId, targetId]);
      }
      const relationships = (await client.query(`select * from character_relationships where novel_id=$1
        and (source_character_id=$2 or target_character_id=$2) for update`, [novelId, old.bible_id])).rows;
      for (const relation of relationships) {
        const from = relation.source_character_id === old.bible_id ? targetId : relation.source_character_id;
        const to = relation.target_character_id === old.bible_id ? targetId : relation.target_character_id;
        const duplicate = (await client.query(`select * from character_relationships where novel_id=$1
          and source_character_id=$2 and target_character_id=$3 and relationship_type=$4 and relationship_id<>$5`,
          [novelId, from, to, relation.relationship_type, relation.relationship_id])).rows[0];
        if (from === to || duplicate) {
          if (duplicate && relation.description && relation.description !== duplicate.description)
            await client.query('update character_relationships set description=$2 where relationship_id=$1',
              [duplicate.relationship_id, [duplicate.description, relation.description].filter(Boolean).join('\n\n')]);
          await client.query('delete from character_relationships where relationship_id=$1', [relation.relationship_id]);
        } else await client.query('update character_relationships set source_character_id=$2,target_character_id=$3 where relationship_id=$1',
          [relation.relationship_id, from, to]);
      }
      await client.query('update character_profiles set deleted_at=now(),updated_by=$3,updated_at=now() where novel_id=$1 and character_id=$2',
        [novelId, old.bible_id, userId]);
    }
    for (const event of memory.events) {
      const link = linked('event', event.event_id);
      let id = link?.bible_id as string | undefined;
      let owns = Boolean(link?.owns_bible_row);
      const chapter = (await client.query('select chapter_id from chapters where novel_id=$1 and chapter_number=$2 and deleted_at is null', [novelId, event.chapter])).rows[0]?.chapter_id ?? null;
      const title = event.summary.slice(0, 180) || event.event_type;
      if (!id) {
        const matches = await client.query(`select event_id from story_timeline_events e where novel_id=$1 and summary=$2
          and chapter_id is not distinct from $3::uuid and not exists(select 1 from story_brain_bible_links l
          where l.novel_id=$1 and l.artifact_kind='event' and l.bible_id=e.event_id)`, [novelId, event.summary, chapter]);
        if (matches.rows.length === 1) id = matches.rows[0].event_id;
        else {
          id = (await client.query(`insert into story_timeline_events(novel_id,chapter_id,title,event_order,summary,source,created_by,updated_by)
            values($1,$2,$3,$4,$5,'AICOPILOT_SUGGESTION',$6,$6) returning event_id`,
            [novelId, chapter, title, event.chapter, event.summary, userId])).rows[0].event_id;
          owns = true;
        }
      } else if (owns) {
        const old = link.source_snapshot;
        await client.query(`update story_timeline_events set
          title=case when title=$4 then $5 else title end, summary=case when summary=$6 then $7 else summary end,
          chapter_id=case when chapter_id is not distinct from $8::uuid then $3 else chapter_id end
          where event_id=$1 and novel_id=$2 and deleted_at is null`,
          [id, novelId, chapter, old.title, title, old.summary, event.summary, old.chapterId]);
      }
      await saveLink('event', event.event_id, id!, { title, summary: event.summary, chapterId: chapter }, owns);
    }
    for (const relation of memory.relations) {
      const resolve = (id: string | undefined, name: string) => id ? entityProfiles.get(id) : (() => {
        const matches = memory.entities.filter(e => e.name === name && entityProfiles.has(e.entity_id));
        return matches.length === 1 ? entityProfiles.get(matches[0].entity_id) : undefined;
      })();
      const source = resolve(relation.metadata?.subject_entity_id, relation.subject);
      const target = resolve(relation.metadata?.object_entity_id, relation.object);
      if (!source || !target || source === target) continue;
      const key = createHash('sha256').update(JSON.stringify([source, relation.relation, target])).digest('hex');
      const link = linked('relation', key);
      let id = link?.bible_id as string | undefined;
      let owns = Boolean(link?.owns_bible_row);
      if (!id) {
        const matches = await client.query(`select relationship_id from character_relationships where novel_id=$1
          and source_character_id=$2 and target_character_id=$3 and relationship_type=$4`, [novelId, source, target, relation.relation]);
        if (matches.rows.length) id = matches.rows[0].relationship_id;
        else {
          id = (await client.query(`insert into character_relationships(novel_id,source_character_id,target_character_id,relationship_type)
            values($1,$2,$3,$4) returning relationship_id`, [novelId, source, target, relation.relation])).rows[0].relationship_id;
          owns = true;
        }
      }
      await saveLink('relation', key, id!, {}, owns);
    }
    await client.query(`insert into story_brain_bible_sync(novel_id,brain_version) values($1,$2)
      on conflict(novel_id) do update set brain_version=excluded.brain_version,synced_at=now()`, [novelId, memory.brain_version]);
    await client.query('commit');
    return { brainVersion: memory.brain_version };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

const inFlight = new Map<string, Promise<unknown>>();
export async function synchronizeStoryBible(novelId: string, userId: string) {
  const key = `${novelId}:${userId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    try {
      const memory = await aiGatewayService.forwardRequest({ method: 'GET', path: `/v1/story-brains/${novelId}/memory`, userId });
      return await applyApprovedMemoryToBible(novelId, userId, memory);
    } catch (error) {
      if (error instanceof AppError && error.httpStatus === 404) return { brainVersion: null };
      throw error;
    }
  })();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}

export async function refreshStoryBibleSafely(novelId: string, userId: string) {
  try { await synchronizeStoryBible(novelId, userId); }
  catch (error) { logger.warn({ novelId, error: error instanceof Error ? error.message : 'Sync failed' }, 'Story Bible refresh deferred'); }
}
