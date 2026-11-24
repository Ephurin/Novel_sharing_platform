import type { PoolClient, QueryResult } from 'pg';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { audit, requiredReason } from '../admin/admin-access.js';
import { drainAdminJobs } from '../admin/admin-jobs.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { assertFreshIdentityUnderLock } from '../content-control/review-authorization.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { refreshTopicActivity } from './discussions.write.js';
import { discussionInvolvedUserIds } from './discussions.admin.js';
import { moderateDiscussionHide, restoreDiscussionSanction } from './discussions.sanctions.js';
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
};

async function lockModeratorTopic(client: PoolClient, topicId: string): Promise<ModeratorTopicRow> {
  const result: QueryResult<ModeratorTopicRow> = await client.query(
    `select topic_id,category_id,author_id,title,status,is_pinned,is_locked
       from discussion_topics where topic_id=$1 for update`,
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
      'select role, status, access_version from users where user_id=$1 and deleted_at is null for share',
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
  const { data, jobsQueued } = await withPostgresTransaction(async (client) => {
    await assertOperationalModerator(auth, client);
    if (input.patch.field === 'status') {
      // HIDE and RESTORE run through the one reversible sanction workflow.
      let jobsQueued = false;
      if (input.patch.value === 'HIDDEN') {
        const outcome = await moderateDiscussionHide(auth, client, {
          kind: 'DISCUSSION',
          id: input.topicId,
          reason: input.reason,
          permission: 'discussion.operate',
          expectedStatus: input.patch.expected
        });
        jobsQueued = outcome.skipped === null;
      } else {
        await restoreDiscussionSanction(auth, client, {
          kind: 'DISCUSSION',
          id: input.topicId,
          reason: input.reason,
          permission: 'discussion.operate',
          expectedStatus: input.patch.expected
        });
      }
      const row = await client.query<ModeratorTopicRow>(
        `select topic_id,category_id,author_id,title,status,is_pinned,is_locked
           from discussion_topics where topic_id=$1`,
        [input.topicId]
      );
      return { data: topicState(row.rows[0]), jobsQueued };
    }
    const before = await lockModeratorTopic(client, input.topicId);
    assertIndependentActor(
      auth.userId,
      await discussionInvolvedUserIds('DISCUSSION', input.topicId, client)
    );
    const reason = requiredReason(input.reason);
    if (input.patch.field === 'destinationCategoryId') {
      const destinationId = input.patch.value;
      if (before.category_id === destinationId) return { data: topicState(before), jobsQueued: false };
      assertExpected(before.category_id, input.patch.expected);
      const { rows: categories } = await client.query<{
        category_id: string;
        slug: string;
        is_active: boolean;
        post_admin_only: boolean;
      }>(
        `select category_id,slug,is_active,post_admin_only from discussion_categories
          where category_id in ($1, $2) order by category_id for share`,
        [before.category_id, destinationId]
      );
      const source = categories.find((category) => category.category_id === before.category_id);
      const destination = categories.find((category) => category.category_id === destinationId);
      if (!source || !destination)
        throw new AppError(404, 'DISCUSSION_CATEGORY_001', 'Không tìm thấy danh mục.');
      if (!source.is_active || !destination.is_active)
        throw new AppError(422, 'DISCUSSION_CATEGORY_INACTIVE', 'Cả hai chuyên mục phải đang hoạt động.');
      if (source.post_admin_only || destination.post_admin_only)
        throw new AppError(
          422,
          'DISCUSSION_CATEGORY_OFFICIAL',
          'Không thể chuyển chủ đề vào hoặc ra khỏi chuyên mục chính thức.'
        );
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
        before: { categoryId: source.category_id, slug: source.slug },
        after: { categoryId: destination.category_id, slug: destination.slug }
      });
      return { data: topicState({ ...before, category_id: destination.category_id }), jobsQueued: false };
    }
    const column = input.patch.field === 'isPinned' ? 'is_pinned' : 'is_locked';
    const current = input.patch.field === 'isPinned' ? before.is_pinned : before.is_locked;
    if (current === input.patch.value) return { data: topicState(before), jobsQueued: false };
    assertExpected(current, input.patch.expected);
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
    return {
      data: topicState({
        ...before,
        is_pinned: input.patch.field === 'isPinned' ? input.patch.value : before.is_pinned,
        is_locked: input.patch.field === 'isLocked' ? input.patch.value : before.is_locked
      }),
      jobsQueued: false
    };
 });
  // The notification job commits with the sanction; workers retry safely alone.
  if (jobsQueued) await drainAdminJobs();
  return data;
}

export async function moderateDiscussionCommentOperational(
  auth: AuthContext,
  input: { topicId: string; commentId: string; status: ModeratorOperationalStatus; reason: string }
) {
  const { data, jobsQueued } = await withPostgresTransaction(async (client) => {
    await assertOperationalModerator(auth, client);
    let jobsQueued = false;
    if (input.status === 'HIDDEN') {
      const outcome = await moderateDiscussionHide(auth, client, {
        kind: 'DISCUSSION_COMMENT',
        id: input.commentId,
        reason: input.reason,
        permission: 'discussion.operate',
        expectedTopicId: input.topicId,
        expectedStatus: undefined
      });
      jobsQueued = outcome.skipped === null;
    } else {
      await restoreDiscussionSanction(auth, client, {
        kind: 'DISCUSSION_COMMENT',
        id: input.commentId,
        reason: input.reason,
        permission: 'discussion.operate',
        expectedTopicId: input.topicId,
        expectedStatus: undefined
      });
    }
    const comment = await client.query<{ comment_id: string; topic_id: string; status: DiscussionStatus }>(
      'select comment_id,topic_id,status from discussion_comments where comment_id=$1',
      [input.commentId]
    );
    const row = comment.rows[0];
    return {
      data: { commentId: row.comment_id, topicId: row.topic_id, status: row.status },
      jobsQueued
    };
  });
  if (jobsQueued) await drainAdminJobs();
  return data;
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
