import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import { isContentAdmin, type AuthContext } from '../../core/security/auth-context.js';
import { enqueueNotification } from '../interactions/notification-events.js';

const TITLE_MAX = 255;
const BODY_MAX = 50000;
const COMMENT_BODY_MAX = 20000;

type TopicStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';
type CommentStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';

type CategoryRow = {
  category_id: string;
  slug: string;
  is_active: boolean;
  post_admin_only: boolean;
};

type LockedTopicRow = {
  topic_id: string;
  author_id: string;
  category_id: string;
  status: TopicStatus;
  is_locked: boolean;
};

type LockedCommentRow = {
  comment_id: string;
  topic_id: string;
  author_id: string;
  root_id: string | null;
  reply_to_id: string | null;
  status: CommentStatus;
};

type ReplyTargetRow = {
  comment_id: string;
  root_id: string | null;
  author_id: string;
  status: CommentStatus;
};

type InsertedRow = {
  topic_id?: string;
  comment_id?: string;
};

export type CreateTopicInput = {
  categoryId: string;
  title: string;
  body: string;
};

export type UpdateTopicInput = {
  categoryId?: string;
  title?: string;
  body?: string;
};

function invalid(message: string, code = 'DISCUSSION_INVALID_INPUT'): AppError {
  return new AppError(400, code, message);
}

function notFound(message = 'Discussion not found'): AppError {
  return new AppError(404, 'DISCUSSION_NOT_FOUND', message);
}

function forbidden(message = 'You are not allowed to perform this action'): AppError {
  return new AppError(403, 'DISCUSSION_FORBIDDEN', message);
}

function conflict(message: string): AppError {
  return new AppError(409, 'DISCUSSION_CONFLICT', message);
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > TITLE_MAX) {
    throw invalid(`Title must be between 1 and ${TITLE_MAX} characters`);
  }
  return trimmed;
}

function normalizeBody(body: string, max: number): string {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw invalid(`Body must be between 1 and ${max} characters`);
  }
  return trimmed;
}

// search_document is written by the application because f_unaccent is STABLE and therefore
// cannot back a generated column or index expression.
async function computeSearchDocument(
  client: Pick<PoolClient, 'query'>,
  title: string,
  body: string
): Promise<string> {
  const { rows } = await client.query<{ search_document: string }>(
    `select lower(f_unaccent($1 || ' ' || $2)) as search_document`,
    [title, body]
  );
  return rows[0]?.search_document ?? '';
}

async function loadCategory(client: PoolClient, categoryId: string): Promise<CategoryRow> {
  const { rows } = await client.query<CategoryRow>(
    `select category_id, slug, is_active, post_admin_only
       from discussion_categories
      where category_id = $1
        for share`,
    [categoryId]
  );
  const category = rows[0];
  if (!category || !category.is_active) {
    throw notFound('Discussion category not found');
  }
  return category;
}

function assertCategoryPostable(category: CategoryRow, auth: AuthContext): void {
  if (category.post_admin_only && !isContentAdmin(auth)) {
    throw forbidden('Only content administrators may post in this category');
  }
}

function assertTopicWritable(auth: AuthContext, topic: LockedTopicRow): void {
  if (topic.author_id !== auth.userId) {
    throw forbidden('Only the topic owner can modify this topic');
  }
}

async function assertTopicInteractive(client: PoolClient, topic: LockedTopicRow): Promise<void> {
  if (topic.status !== 'VISIBLE') throw notFound();
  await loadCategory(client, topic.category_id);
}



async function lockTopic(client: PoolClient, topicId: string): Promise<LockedTopicRow> {
  const { rows } = await client.query<LockedTopicRow>(
    `select topic_id, author_id, category_id, status, is_locked
       from discussion_topics
      where topic_id = $1
        for update`,
    [topicId]
  );
  const topic = rows[0];
  if (!topic || topic.status === 'DELETED') {
    throw notFound('Discussion topic not found');
  }
  return topic;
}

export async function createTopic(auth: AuthContext, data: CreateTopicInput): Promise<string> {
  const title = normalizeTitle(data.title);
  const body = normalizeBody(data.body, BODY_MAX);

  return withPostgresTransaction(async (client) => {
    const category = await loadCategory(client, data.categoryId);
    assertCategoryPostable(category, auth);

    const searchDocument = await computeSearchDocument(client, title, body);

    const { rows } = await client.query<InsertedRow>(
      `insert into discussion_topics(
         category_id, author_id, title, body, search_document, last_activity_at, last_activity_user_id
       )
       values ($1, $2, $3, $4, $5, now(), $2)
       returning topic_id`,
      [category.category_id, auth.userId, title, body, searchDocument]
    );
    const topicId = rows[0]?.topic_id;
    if (!topicId) {
      throw new AppError(500, 'DISCUSSION_CREATE_FAILED', 'Could not create the topic');
    }
    return topicId;
  });
}

export async function updateTopic(
  auth: AuthContext,
  topicId: string,
  data: UpdateTopicInput
): Promise<void> {
  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);
    assertTopicWritable(auth, topic);
    await assertTopicInteractive(client, topic);
    if (topic.is_locked) throw conflict('Topic is locked');

    const title = data.title === undefined ? null : normalizeTitle(data.title);
    const body = data.body === undefined ? null : normalizeBody(data.body, BODY_MAX);
    const category = await loadCategory(client, data.categoryId ?? topic.category_id);
    assertCategoryPostable(category, auth);

    await client.query(
      `update discussion_topics
          set category_id = $2,
              title = coalesce($3, title),
              body = coalesce($4, body),
              search_document = case when $3::text is null and $4::text is null then search_document
                else lower(f_unaccent(coalesce($3, title) || ' ' || coalesce($4, body))) end,
              updated_at = now(),
              edited_at = now()
        where topic_id = $1`,
      [topicId, category.category_id, title, body]
    );
  });
}

export async function deleteTopic(auth: AuthContext, topicId: string): Promise<void> {
  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);
    assertTopicWritable(auth, topic);

    await client.query(
      `update discussion_topics
          set status = 'DELETED',
              updated_at = now()
        where topic_id = $1`,
      [topicId]
    );

    await refreshTopicActivity(client, topicId);
  });
}

export async function createComment(
  auth: AuthContext,
  topicId: string,
  data: { body: string; replyToId?: string }
): Promise<string> {
  const body = normalizeBody(data.body, COMMENT_BODY_MAX);

  return withPostgresTransaction(async (client) => {
    // The topic row lock serializes comment creation with deletions and moderation.
    const topic = await lockTopic(client, topicId);
    await assertTopicInteractive(client, topic);
    if (topic.is_locked) {
      throw conflict('Topic is locked');
    }

    let rootId: string | null = null;
    let replyToId: string | null = null;
    let notificationUserId: string | null = null;

    const targetId = data.replyToId ?? null;
    if (targetId !== null) {
      const { rows } = await client.query<ReplyTargetRow>(
        `select comment_id, root_id, author_id, status
           from discussion_comments
          where comment_id = $1
            and topic_id = $2
            for share`,
        [targetId, topicId]
      );
      const target = rows[0];
      if (!target) {
        throw notFound('Reply target not found');
      }
      if (target.status === 'DELETED') {
        throw conflict('Reply target is deleted');
      }
      if (target.status !== 'VISIBLE') {
        throw conflict('Reply target is not visible');
      }
      rootId = target.root_id ?? target.comment_id;
      replyToId = target.comment_id;

      const { rowCount } = await client.query(
        `select 1 from discussion_comments where comment_id = $1 and root_id is null and status = 'VISIBLE'`,
        [rootId]
      );
      if (!rowCount) throw notFound('Reply target not found');
      notificationUserId = target.author_id;
    } else {
      notificationUserId = topic.author_id;
    }

    const { rows } = await client.query<InsertedRow>(
      `insert into discussion_comments(topic_id, author_id, root_id, reply_to_id, body)
       values ($1, $2, $3, $4, $5)
       returning comment_id`,
      [topicId, auth.userId, rootId, replyToId, body]
    );
    const commentId = rows[0]?.comment_id;
    if (!commentId) {
      throw new AppError(500, 'DISCUSSION_CREATE_FAILED', 'Could not create the comment');
    }

    await refreshTopicActivity(client, topicId);

    if (notificationUserId !== null && notificationUserId !== auth.userId) {
      // UI-14: say who replied and in which topic, so the reader can tell notices apart.
      const { rows: context } = await client.query<{ actor_name: string; topic_title: string }>(
        `select coalesce(nullif(p.display_name, ''), u.username, 'Một thành viên') as actor_name,
                t.title as topic_title
           from discussion_topics t
           left join users u on u.user_id = $2
           left join user_profiles p on p.user_id = u.user_id
          where t.topic_id = $1`,
        [topicId, auth.userId]
      );
      const actorName = context[0]?.actor_name ?? 'Một thành viên';
      const topicTitle = context[0]?.topic_title ?? '';
      const what = replyToId ? 'bình luận của bạn' : 'chủ đề của bạn';
      await enqueueNotification(client, {
        eventKey: `discussion-comment:${commentId}`,
        userId: notificationUserId,
        type: 'DISCUSSION_REPLY',
        title: topicTitle ? `Phản hồi mới trong "${topicTitle}"` : 'Có phản hồi mới trong thảo luận',
        content: `${actorName} đã trả lời ${what}${topicTitle ? ` trong "${topicTitle}"` : ''}.`,
        payload: {
          topicId,
          commentId,
          actorName,
          topicTitle,
          replyKind: replyToId ? 'COMMENT' : 'TOPIC',
          href: `/discussions/${topicId}?commentId=${commentId}#comment-${commentId}`,
        },
      });
    }

    return commentId;
  });
}

export async function updateComment(
  auth: AuthContext,
  topicId: string,
  commentId: string,
  body: string
): Promise<void> {
  const normalized = normalizeBody(body, COMMENT_BODY_MAX);

  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);
    await assertTopicInteractive(client, topic);
    if (topic.is_locked) {
      throw conflict('Topic is locked');
    }

    const { rows } = await client.query<LockedCommentRow>(
      `select comment_id, topic_id, author_id, root_id, reply_to_id, status
         from discussion_comments
        where comment_id = $1
          and topic_id = $2
          for update`,
      [commentId, topicId]
    );
    const comment = rows[0];
    if (!comment || comment.status !== 'VISIBLE') throw notFound('Comment not found');
    if (comment.root_id) {
      const { rowCount } = await client.query(
        `select 1 from discussion_comments where comment_id = $1 and status <> 'HIDDEN'`,
        [comment.root_id]
      );
      if (!rowCount) throw notFound('Comment not found');
    }
    if (comment.author_id !== auth.userId) {
      throw forbidden('Only the comment owner can edit this comment');
    }

    await client.query(
      `update discussion_comments
          set body = $3,
              updated_at = now(),
              edited_at = now()
        where topic_id = $1
          and comment_id = $2`,
      [topicId, commentId, normalized]
    );

    await refreshTopicActivity(client, topicId);
  });
}

export async function deleteComment(
  auth: AuthContext,
  topicId: string,
  commentId: string
): Promise<void> {
  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);

    const { rows } = await client.query<LockedCommentRow>(
      `select comment_id, topic_id, author_id, root_id, reply_to_id, status
         from discussion_comments
        where comment_id = $1
          and topic_id = $2
          for update`,
      [commentId, topicId]
    );
    const comment = rows[0];
    if (!comment || comment.status === 'DELETED') {
      throw notFound('Comment not found');
    }
    // Owners may delete their own content even when the topic is locked.
    if (comment.author_id !== auth.userId) {
      throw forbidden('Only the comment owner can delete this comment');
    }

    await client.query(
      `update discussion_comments
          set status = 'DELETED',
              updated_at = now()
        where topic_id = $1
          and comment_id = $2`,
      [topicId, commentId]
    );

    await refreshTopicActivity(client, topicId);
  });
}

export async function setLike(
  auth: AuthContext,
  topicId: string,
  commentId: string | null,
  liked: boolean
): Promise<void> {
  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);
    await assertTopicInteractive(client, topic);

    if (commentId === null) {
      await assertTopicInteractive(client, topic);
      if (topic.is_locked) {
        if (liked) {
          throw conflict('Topic is locked');
        }
        await client.query(`delete from discussion_topic_likes where topic_id = $1 and user_id = $2`, [
          topicId,
          auth.userId,
        ]);
        return;
      }

      if (liked) {
        await client.query(
          `insert into discussion_topic_likes(topic_id, user_id)
           values ($1, $2)
           on conflict (topic_id, user_id) do nothing`,
          [topicId, auth.userId]
        );
      } else {
        await client.query(`delete from discussion_topic_likes where topic_id = $1 and user_id = $2`, [
          topicId,
          auth.userId,
        ]);
      }
      return;
    }

    const { rows } = await client.query<LockedCommentRow>(
      `select comment_id, topic_id, author_id, root_id, reply_to_id, status
         from discussion_comments
        where comment_id = $1
          and topic_id = $2
          for share`,
      [commentId, topicId]
    );
    const comment = rows[0];
    if (!comment || comment.status !== 'VISIBLE') throw notFound('Comment not found');
    if (comment.root_id) {
      const { rowCount } = await client.query(
        `select 1 from discussion_comments where comment_id = $1 and status <> 'HIDDEN'`,
        [comment.root_id]
      );
      if (!rowCount) throw notFound('Comment not found');
    }

    if (topic.is_locked) {
      if (liked) {
        throw conflict('Topic is locked');
      }
      await client.query(
        `delete from discussion_comment_likes where comment_id = $1 and user_id = $2`,
        [commentId, auth.userId]
      );
      return;
    }
    await assertTopicInteractive(client, topic);

    if (liked) {
      await client.query(
        `insert into discussion_comment_likes(comment_id, user_id)
         values ($1, $2)
         on conflict (comment_id, user_id) do nothing`,
        [commentId, auth.userId]
      );
    } else {
      await client.query(
        `delete from discussion_comment_likes where comment_id = $1 and user_id = $2`,
        [commentId, auth.userId]
      );
    }
  });
}

export async function recordView(topicId: string, viewerKey: string): Promise<void> {
  const key = viewerKey.trim();
  if (key.length < 1 || key.length > 128) {
    throw invalid('Invalid viewer key', 'DISCUSSION_INVALID_VIEWER');
  }

  await withPostgresTransaction(async (client) => {
    const topic = await lockTopic(client, topicId);
    await assertTopicInteractive(client, topic);

    // Count only when the daily dedupe row is actually inserted. Old view rows are pruned by a
    // separate periodic retention job, not here.
    const { rowCount } = await client.query(
      `insert into discussion_topic_views(topic_id, viewer_key)
       values ($1, $2)
       on conflict (topic_id, viewer_key, viewed_on) do nothing`,
      [topicId, key]
    );

    if (rowCount === 1) {
      await client.query(
        `update discussion_topics
            set view_count = view_count + 1
          where topic_id = $1`,
        [topicId]
      );
    }
  });
}

export async function pruneDiscussionViewKeys(): Promise<void> {
  await getPostgresPool().query(
    "delete from discussion_topic_views where viewed_on < current_date - 7"
  );
}

/**
 * Recomputes reply_count and last activity for a topic in a single statement. Deleted or hidden
 * roots suppress their replies, while a deleted root may keep its own visible children counted
 * only when the root itself is still public; a hidden root hides the whole branch.
 */
export async function refreshTopicActivity(client: PoolClient, topicId: string): Promise<void> {
  await client.query(
    `with valid_roots as (
       select c.comment_id
         from discussion_comments c
        where c.topic_id = $1
          and c.root_id is null
          and c.status <> 'HIDDEN'
     ),
     visible_comments as (
       select c.comment_id, c.author_id, c.created_at
         from discussion_comments c
        where c.topic_id = $1
          and c.status = 'VISIBLE'
          and (
            c.root_id is null
            or exists (select 1 from valid_roots r where r.comment_id = c.root_id)
          )
     ),
     totals as (
       select count(*)::int as reply_count,
              max(created_at) as last_comment_at
         from visible_comments
     ),
     last_comment_author as (
       select vc.author_id
         from visible_comments vc
        order by vc.created_at desc, vc.comment_id desc
        limit 1
     ),
     topic_state as (
       select t.topic_id, t.status, t.created_at, t.author_id
         from discussion_topics t
        where t.topic_id = $1
     )
     update discussion_topics t
        set reply_count = case
              when ts.status = 'VISIBLE' then coalesce(totals.reply_count, 0)
              else 0
            end,
            last_activity_at = case
              when ts.status = 'VISIBLE'
                then greatest(ts.created_at, coalesce(totals.last_comment_at, ts.created_at))
              else ts.created_at
            end,
            last_activity_user_id = case
              when ts.status = 'VISIBLE'
                then coalesce((select author_id from last_comment_author), ts.author_id)
              else ts.author_id
            end,
            updated_at = now()
       from topic_state ts
       cross join totals
      where t.topic_id = ts.topic_id`,
    [topicId]
  );
}

