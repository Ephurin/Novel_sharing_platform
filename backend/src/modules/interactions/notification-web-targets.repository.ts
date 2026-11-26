
import { getPostgresPool } from '../../core/database/postgres.js';

type NotificationReference = { kind: 'novel' | 'chapter' | 'topic'; id: string };
type WebTarget =
  | { kind: 'novel'; novelId: string; novelSlug: string }
  | { kind: 'chapter'; novelId: string; novelSlug: string; chapterId: string; chapterSlug: string }
  | { kind: 'topic'; topicId: string; topicSlug: string };

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function getReference(type: string, payload: unknown): NotificationReference | null {
  if (!payload || typeof payload !== 'object') return null;
  if (type === 'DISCUSSION_REPLY' && 'topicId' in payload && typeof payload.topicId === 'string' && uuid.test(payload.topicId)) {
    return { kind: 'topic', id: payload.topicId.toLowerCase() };
  }
  if (!('href' in payload) || typeof payload.href !== 'string') return null;
  const match = /^\/(?:reader|public)\/(novels|chapters)\/([^/?#]+)(?:[/?#]|$)/.exec(payload.href);
  if (!match || !uuid.test(match[2])) return null;
  return { kind: match[1] === 'novels' ? 'novel' : 'chapter', id: match[2].toLowerCase() };
}

export async function appendNotificationWebTargets<T extends { type: string; payload: unknown }>(items: readonly T[]) {
  const references = items.map(item => getReference(item.type, item.payload));
  const ids = { novel: new Set<string>(), chapter: new Set<string>(), topic: new Set<string>() };
  for (const reference of references) {
    if (reference) ids[reference.kind].add(reference.id);
  }
  if (!ids.novel.size && !ids.chapter.size && !ids.topic.size) return items;

  const { rows } = await getPostgresPool().query<{ id: string; target: WebTarget }>(
    `select n.novel_id as id, jsonb_build_object('kind','novel','novelId',n.novel_id,'novelSlug',n.slug) as target
       from novels n where n.novel_id = any($1::uuid[]) and n.status = 'PUBLISHED' and n.deleted_at is null
     union all
     select c.chapter_id, jsonb_build_object('kind','chapter','novelId',n.novel_id,'novelSlug',n.slug,'chapterId',c.chapter_id,'chapterSlug',c.slug)
       from chapters c join novels n using(novel_id)
       where c.chapter_id = any($2::uuid[]) and c.status = 'PUBLISHED' and c.deleted_at is null
         and n.status = 'PUBLISHED' and n.deleted_at is null
     union all
     select t.topic_id, jsonb_build_object('kind','topic','topicId',t.topic_id,'topicSlug',t.slug)
       from discussion_topics t join discussion_categories cat using(category_id)
       where t.topic_id = any($3::uuid[]) and t.status = 'VISIBLE' and cat.is_active`,
    [[...ids.novel], [...ids.chapter], [...ids.topic]]
  );
  const targets = new Map(rows.map(row => [row.target.kind + ':' + row.id, row.target]));
  return items.map((item, index) => {
    const reference = references[index];
    const webTarget = reference && targets.get(reference.kind + ':' + reference.id);
    return webTarget ? { ...item, webTarget } : item;
  });
}
