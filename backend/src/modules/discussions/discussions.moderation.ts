import type { PoolClient, QueryResult } from 'pg';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { audit, requiredReason } from '../admin/admin-access.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { assertFreshIdentityUnderLock } from '../content-control/review-authorization.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { refreshTopicActivity } from './discussions.write.js';
import { discussionInvolvedUserIds } from './discussions.admin.js';
import type { DiscussionStatus } from './discussions.types.js';

export type ModeratorOperationalStatus = 'VISIBLE' | 'HIDDEN';

export type TopicOperationalPatch =
  | { field: 'status'; value: ModeratorOperationalStatus; expected: string }
  | { field: 'isPinned' | 'isLocked'; value: boolean; expected: boolean }
  | { field: 'destinationCategoryId'; value: string; expected: string };

type ModeratorTopicRow = {
  topic_id: string;
  category_id: string;
  author_id: string;
  title: string;
  status: DiscussionStatus;
  is_pinned: boolean;
  is_locked: boolean;
  category_slug: string | null;
};

async function lockModeratorTopic(client: PoolClient, topicId: string): Promise<ModeratorTopicRow> {
  const result: QueryResult<ModeratorTopicRow> = await client.query(
    `select t.topic_id,t.category_id,t.author_id,t.title,t.status,t.is_pinned,t.is_locked,c.slug as category_slug
       from discussion_topics t
       left join discussion_categories c on c.category_id=t.category_id
      where t.topic_id=$1 for update of t`,
    [topicId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'DISCUSSION_TOPIC_001', 'Không tìm thấy chủ đề.');
  return row;
}

async function assertOperationalModerator(auth: AuthContext, client: PoolClient) {
  assertModeratorOperational(auth, 'discussion.operate');
  const identity = (
    await client.query<{ role: string; status: string; access_version: number }>(
      'select role, status, access_version from users where user_id=$1 and deleted_at is null',
      [auth.userId]
    )
  ).rows[0];
  assertFreshIdentityUnderLock(auth, identity);
}

function assertExpected(current: unknown, expected: unknown) {
  if (current !== expected) {
    throw new AppError(
      409,
      'DISCUSSION_STATE_CONFLICT',
      'Trạng thái chủ đề đã thay đổi so với giá trị bạn đang xem. Hãy tải lại.'
    );
  }
}

export async function moderateDiscussionTopicOperational(
  auth: AuthContext,
  input: { topicId: string; patch: TopicOperationalPatch; reason: string }
) {
  return withPostgresTransaction(async (client) => {
    await assertOperationalModerator(auth, client);
    const before = await lockModeratorTopic(client, input.topicId);
    assertIndependentActor(
      auth.userId,
      await discussionInvolvedUserIds('DISCUSSION', input.topicId, client)
    );
    const reason = requiredReason(input.reason);
    if (input.patch.field === 'destinationCategoryId') {
      const destination = (
        await client.query<{
          category_id: string;
          slug: string;
          is_active: boolean;
          post_admin_only: boolean;
        }>(
          `select category_id,slug,is_active,post_admin_only
             from discussion_categories where category_id=$1 for update`,
          [input.patch.value]
        )
      ).rows[0];
      if (!destination) throw new AppError(404, 'DISCUSSION_CATEGORY_001', 'Không tìm thấy danh mục.');
      if (!destination.is_active)
        throw new AppError(422, 'DISCUSSION_CATEGORY_INACTIVE', 'Chuyên mục đích không còn hoạt động.');
      if (destination.post_admin_only)
        throw new AppError(
          422,
          'DISCUSSION_CATEGORY_OFFICIAL',
          'Không thể chuyển chủ đề vào chuyên mục chính thức.'
        );
      assertExpected(before.category_id, input.patch.expected);
      if (destination.category_id === before.category_id) {
        return topicState(before);
      }
      await client.query('update discussion_topics set category_id=$2 where topic_id=$1', [
        input.topicId,
        destination.category_id
      ]);
      await audit(client, auth, {
        action: 'DISCUSSION_TOPIC_MOVE',
        targetType: 'DISCUSSION',
        targetId: input.topicId,
        affectedUserId: before.author_id,
        reason,
        before: { categoryId: before.category_id, slug: before.category_slug },
        after: { categoryId: destination.category_id, slug: destination.slug }
      });
      return topicState({ ...before, category_id: destination.category_id });
    }
    if (input.patch.field === 'status') {
      assertExpected(before.status, input.patch.expected);
      if (before.status === 'DELETED')
        throw new AppError(
          409,
          'DISCUSSION_TOPIC_DELETED',
          'Không thể khôi phục chủ đề đã bị xóa.'
        );
      if (before.status === input.patch.value) return topicState(before);
      const updated = await client.query(
        'update discussion_topics set status=$2 where topic_id=$1 returning status',
        [input.topicId, input.patch.value]
      );
      await refreshTopicActivity(client, input.topicId);
      await audit(client, auth, {
        action: 'DISCUSSION_TOPIC_MODERATE',
        targetType: 'DISCUSSION',
        targetId: input.topicId,
        affectedUserId: before.author_id,
        reason,
        before: { status: before.status, isPinned: before.is_pinned, isLocked: before.is_locked },
        after: {
          status: updated.rows[0].status,
          isPinned: before.is_pinned,
          isLocked: before.is_locked
        }
      });
      return topicState({ ...before, status: updated.rows[0].status });
    }
    const column = input.patch.field === 'isPinned' ? 'is_pinned' : 'is_locked';
    const current = input.patch.field === 'isPinned' ? before.is_pinned : before.is_locked;
    assertExpected(current, input.patch.expected);
    if (current === input.patch.value) return topicState(before);
    await client.query(`update discussion_topics set ${column}=$2 where topic_id=$1`, [
      input.topicId,
      input.patch.value
    ]);
    await audit(client, auth, {
      action: 'DISCUSSION_TOPIC_MODERATE',
      targetType: 'DISCUSSION',
      targetId: input.topicId,
      affectedUserId: before.author_id,
      reason,
      before: { status: before.status, isPinned: before.is_pinned, isLocked: before.is_locked },
      after: {
        status: before.status,
        isPinned: input.patch.field === 'isPinned' ? input.patch.value : before.is_pinned,
        isLocked: input.patch.field === 'isLocked' ? input.patch.value : before.is_locked
      }
    });
    return topicState({
      ...before,
      is_pinned: input.patch.field === 'isPinned' ? input.patch.value : before.is_pinned,
      is_locked: input.patch.field === 'isLocked' ? input.patch.value : before.is_locked
    });
  });
}

export async function moderateDiscussionCommentOperational(
  auth: AuthContext,
  input: { topicId: string; commentId: string; status: ModeratorOperationalStatus; reason: string }
) {
  return withPostgresTransaction(async (client) => {
    await assertOperationalModerator(auth, client);
    const before = await lockModeratorTopic(client, input.topicId);
    const locked = await client.query<{
      comment_id: string;
      topic_id: string;
      author_id: string;
      body: string;
      status: DiscussionStatus;
    }>(
      `select comment_id,topic_id,author_id,body,status
         from discussion_comments where comment_id=$1 and topic_id=$2 for update`,
      [input.commentId, input.topicId]
    );
    const comment = locked.rows[0];
    if (!comment) throw new AppError(404, 'DISCUSSION_COMMENT_001', 'Không tìm thấy bình luận.');
    assertIndependentActor(
      auth.userId,
      await discussionInvolvedUserIds('DISCUSSION_COMMENT', input.commentId, client)
    );
    if (comment.status === 'DELETED')
      throw new AppError(409, 'DISCUSSION_COMMENT_DELETED', 'Không thể khôi phục bình luận đã bị xóa.');
    if (comment.status === input.status) {
      return { commentId: comment.comment_id, topicId: before.topic_id, status: comment.status };
    }
    const updated = await client.query(
      'update discussion_comments set status=$2, updated_at=now() where comment_id=$1 returning status',
      [input.commentId, input.status]
    );
    await refreshTopicActivity(client, before.topic_id);
    await audit(client, auth, {
      action: 'DISCUSSION_COMMENT_MODERATE',
      targetType: 'DISCUSSION_COMMENT',
      targetId: input.commentId,
      affectedUserId: comment.author_id,
      reason: requiredReason(input.reason),
      before: { status: comment.status, topicId: before.topic_id },
      after: { status: updated.rows[0].status, topicId: before.topic_id }
    });
    return { commentId: comment.comment_id, topicId: before.topic_id, status: updated.rows[0].status };
  });
}

function topicState(row: ModeratorTopicRow) {
  return {
    topicId: row.topic_id,
    status: row.status,
    isPinned: row.is_pinned,
    isLocked: row.is_locked,
    categoryId: row.category_id
  };
}
