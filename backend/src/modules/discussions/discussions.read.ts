import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type {
  Category, Comment, CommentListInput, CommentLocation, CursorPage, DiscussionTargetKind, Topic, TopicListInput, TopicSort
} from './discussions.types.js';

const topicVisible = "t.status = 'VISIBLE' and cat.is_active";
const visibleComment = "(c.status = 'VISIBLE' and (c.root_id is null or root.status <> 'HIDDEN'))";
const listedComment = "("+visibleComment+" or (c.status = 'DELETED' and c.root_id is null and replies.total > 0))";
const author = (u: string, p: string) => "case when "+u+".user_id is not null then jsonb_build_object("+
  "'userId', "+u+".user_id, 'displayName', coalesce("+p+".display_name, "+u+".username), 'avatarUrl', "+p+".avatar_url, 'role', "+u+".role) end";
const authorJoin = (u: string, p: string, id: string) =>
  "left join users "+u+" on "+u+".user_id = "+id+" and "+u+".status = 'ACTIVE' and "+u+".deleted_at is null "+
  "left join user_profiles "+p+" on "+p+".user_id = "+u+".user_id";
const categoryDto = "jsonb_build_object('categoryId', cat.category_id, 'slug', cat.slug, 'name', cat.name, "+
  "'sortOrder', cat.sort_order, 'postAdminOnly', cat.post_admin_only)";
const topicDto = `jsonb_build_object(
  'topicId', t.topic_id, 'category', ${categoryDto},
  'author', ${author('u', 'p')},
  'isPinned', t.is_pinned, 'isLocked', t.is_locked,
  'status', case when cat.is_active or t.status = 'DELETED' then t.status::text else 'HIDDEN' end,
  'title', t.title, 'body', case when ${topicVisible} then t.body else '' end,
  'viewCount', t.view_count, 'replyCount', t.reply_count, 'likeCount', likes.total,
  'viewerLiked', likes.viewer_liked, 'lastActivityAt', t.last_activity_at,
  'lastActivityUser', ${author('lu', 'lp')}, 'createdAt', t.created_at, 'editedAt', t.edited_at
)`;
const topicFrom = `from discussion_topics t join discussion_categories cat using (category_id)
  ${authorJoin('u','p','t.author_id')}
  ${authorJoin('lu','lp','t.last_activity_user_id')}
  cross join lateral (
    select count(*)::int as total, coalesce(bool_or(user_id = $1::uuid), false) as viewer_liked
    from discussion_topic_likes where topic_id = t.topic_id
  ) likes`;

const commentDto = `jsonb_build_object(
  'commentId', c.comment_id, 'rootId', c.root_id, 'replyToId', c.reply_to_id,
  'author', case when c.status = 'VISIBLE' then ${author('u','p')} end,
  'body', case when c.status = 'VISIBLE' then c.body else '' end,
  'createdAt', c.created_at, 'editedAt', c.edited_at, 'status', c.status,
  'likeCount', case when c.status = 'VISIBLE' then likes.total else 0 end,
  'viewerLiked', c.status = 'VISIBLE' and likes.viewer_liked, 'replyCount', replies.total
)`;
const commentFrom = `from discussion_comments c
  join discussion_topics t using (topic_id) join discussion_categories cat using (category_id)
  left join discussion_comments root on root.comment_id = c.root_id
  ${authorJoin('u','p','c.author_id')}
  cross join lateral (
    select count(*)::int as total, coalesce(bool_or(user_id = $1::uuid), false) as viewer_liked
    from discussion_comment_likes where comment_id = c.comment_id
  ) likes
  cross join lateral (
    select count(*)::int as total from discussion_comments
    where root_id = c.comment_id and status = 'VISIBLE'
  ) replies`;

type Cursor = { scope: string; order: string; id: string; pinned: boolean };
type PageRow<T> = { item: T; order_key: string; id: string; pinned: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCursor(value: string | undefined, scope: string, numberKey = false): Cursor | null {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    const validOrder = typeof cursor.order === 'string' && (numberKey
      ? /^\d{1,10}$/.test(cursor.order) && Number(cursor.order) <= 2147483647
      : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-]\d{2}(?::\d{2})?$/.test(cursor.order)
        && Number.isFinite(Date.parse(cursor.order)));
    if (cursor.scope === scope && validOrder && typeof cursor.id === 'string' && UUID.test(cursor.id) &&
        typeof cursor.pinned === 'boolean') return cursor;
  } catch {
    // Incomplete or malformed cursors are invalid filters.
  }
  throw new AppError(400, 'DISCUSSION_CURSOR_INVALID', 'Invalid discussion cursor');
}

function page<T>(rows: PageRow<T>[], limit: number, scope: string): CursorPage<T> {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  const cursor = rows.length > limit && last
    ? Buffer.from(JSON.stringify({ scope, order: last.order_key, id: last.id, pinned: last.pinned })).toString('base64url')
    : null;
  return { items: data.map(row => row.item), nextCursor: cursor };
}

function notFound() {
  return new AppError(404, 'DISCUSSION_NOT_FOUND', 'Discussion content not found');
}

export async function listCategories(): Promise<Category[]> {
  const { rows } = await getPostgresPool().query<{ item: Category }>(
    `select ${categoryDto} as item from discussion_categories cat
     where cat.is_active order by cat.sort_order, cat.category_id`
  );
  return rows.map(row => row.item);
}

const topicOrder: Record<TopicSort, string> = {
  activity: 't.last_activity_at',
  newest: 't.created_at',
  replies: 't.reply_count'
};

export async function listTopics(input: TopicListInput, viewerId?: string): Promise<CursorPage<Topic>> {
  const scope = JSON.stringify(['topics', input.sort, input.category, null, input.q]);
  const cursor = parseCursor(input.cursor, scope, input.sort === 'replies');
  const column = topicOrder[input.sort];
  const type = input.sort === 'replies' ? 'integer' : 'timestamptz';
  const { rows } = await getPostgresPool().query<PageRow<Topic>>(
    `select ${topicDto} as item, ${column}::text as order_key, t.topic_id as id, t.is_pinned as pinned
     ${topicFrom}
     where ${topicVisible} and ($2::text is null or cat.slug = $2)
       and ($3::text is null or to_tsvector('simple', t.search_document) @@ plainto_tsquery('simple', f_unaccent($3)))
       and ($4::boolean is null or (t.is_pinned, ${column}, t.topic_id) < ($4, $5::${type}, $6::uuid))
     order by t.is_pinned desc, ${column} desc, t.topic_id desc limit $7`,
    [viewerId ?? null, input.category ?? null, input.q ?? null,
      cursor?.pinned ?? null, cursor?.order ?? null, cursor?.id ?? null, input.limit + 1]
  );
  return page(rows, input.limit, scope);
}

export async function getTopic(topicId: string, viewerId?: string): Promise<Topic> {
  const { rows } = await getPostgresPool().query<{ item: Topic }>(
    `select ${topicDto} as item ${topicFrom} where ${topicVisible} and t.topic_id = $2`, [viewerId ?? null, topicId]
  );
  if (!rows[0]) throw notFound();
  return rows[0].item;
}

export async function listOwnTopics(authorId: string, value?: string, limit = 20): Promise<CursorPage<Topic>> {
  const scope = 'own:' + authorId;
  const cursor = parseCursor(value, scope);
  const { rows } = await getPostgresPool().query<PageRow<Topic>>(
    `select ${topicDto} as item, t.created_at::text as order_key, t.topic_id as id, false as pinned
     ${topicFrom} where t.author_id = $1
       and ($2::timestamptz is null or (t.created_at, t.topic_id) < ($2, $3::uuid))
     order by t.created_at desc, t.topic_id desc limit $4`, [authorId, cursor?.order ?? null, cursor?.id ?? null, limit + 1]
  );
  return page(rows, limit, scope);
}

export async function listComments(topicId: string, input: CommentListInput, viewerId?: string): Promise<CursorPage<Comment>> {
  await getTopic(topicId, viewerId);
  const scope = 'comments:' + topicId + ':' + (input.rootId ?? '');
  const cursor = parseCursor(input.cursor, scope);
  const { rows } = await getPostgresPool().query<PageRow<Comment>>(
    `select ${commentDto} as item, c.created_at::text as order_key, c.comment_id as id, false as pinned
     ${commentFrom} where ${topicVisible} and ${listedComment} and t.topic_id = $2
       and c.root_id is not distinct from $3::uuid
       and ($4::timestamptz is null or (c.created_at, c.comment_id) > ($4, $5::uuid))
     order by c.created_at, c.comment_id limit $6`,
    [viewerId ?? null, topicId, input.rootId ?? null, cursor?.order ?? null, cursor?.id ?? null, input.limit + 1]
  );
  return page(rows, input.limit, scope);
}

export async function locateComment(topicId: string, commentId: string, viewerId?: string): Promise<CommentLocation> {
  const { rows } = await getPostgresPool().query<{item: Comment}>(
    `select ${commentDto} as item ${commentFrom}
     where ${topicVisible} and ${listedComment} and t.topic_id = $2 and c.comment_id in
       ($3, (select root_id from discussion_comments where comment_id = $3 and topic_id = $2))`,
    [viewerId ?? null, topicId, commentId]
  );
  const comment = rows.find(({item}) => item.commentId === commentId)?.item;
  const root = rows.find(({item}) => item.rootId === null)?.item;
  if (!comment || !root) throw notFound();
  return { root, comment, rootCursor: null, commentCursor: null };
}

export async function isPublicDiscussionTarget(kind: DiscussionTargetKind, id: string, client?: PoolClient): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const sql = kind === 'DISCUSSION'
    ? `select 1 from discussion_topics t join discussion_categories cat using (category_id)
       where t.topic_id = $1 and ${topicVisible}`
    : `select 1 from discussion_comments c join discussion_topics t using (topic_id)
       join discussion_categories cat using (category_id)
       left join discussion_comments root on root.comment_id = c.root_id
       where c.comment_id = $1 and ${topicVisible} and ${visibleComment}`;
  const { rowCount } = await (client ?? getPostgresPool()).query(sql, [id]);
  return Boolean(rowCount);
}
