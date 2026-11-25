import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { audit, requiredReason } from '../admin/admin-access.js';
import { drainAdminJobsSafely, queueAdminNotification } from '../admin/admin-jobs.js';
import { executeUserReportResolution } from './report-resolution.js';
import {
  assertFreshIdentityUnderLock,
  assertResolverAccess,
  reviewInvolvedUserIds
} from './review-authorization.js';
import type {
  ListEscalationsInput,
  ProposeEscalationInput,
  ResolveEscalationInput
} from './content-control.schemas.js';

export type ModerationEscalationSummary = {
  escalationId: string;
  reviewId: string;
  status: 'OPEN' | 'EXECUTED' | 'DISMISSED';
  proposedAction: 'WARN' | 'LOCK';
  reason: string;
  proposedBy: string;
  proposedByUsername?: string | null;
  createdAt: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export function escalationSummary(row: {
  escalation_id: string;
  review_id: string;
  status: 'OPEN' | 'EXECUTED' | 'DISMISSED';
  proposed_action: 'WARN' | 'LOCK';
  reason: string;
  proposed_by: string;
  proposed_by_username?: string | null;
  created_at: Date | string;
  resolution?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | string | null;
}): ModerationEscalationSummary {
  return {
    escalationId: row.escalation_id,
    reviewId: row.review_id,
    status: row.status,
    proposedAction: row.proposed_action,
    reason: row.reason,
    proposedBy: row.proposed_by,
    proposedByUsername: row.proposed_by_username ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    resolution: row.resolution ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null
  };
}

async function waitForOpenEscalation(client: PoolClient, reviewId: string) {
  return (
    await client.query(
      "select e.*, u.username as proposed_by_username from moderation_escalations e left join users u on u.user_id=e.proposed_by where e.review_id=$1 and e.status='OPEN'",
      [reviewId]
    )
  ).rows[0];
}

// Repeating the exact same proposal returns the existing open escalation so a
// retry after a network hiccup converges; different content must not hijack it.
function repeatsExisting(
  row: { proposed_by: string; reason: string; proposed_action: 'WARN' | 'LOCK' },
  auth: AuthContext,
  input: ProposeEscalationInput
) {
  return (
    row.proposed_by === auth.userId &&
    row.reason === input.reason &&
    row.proposed_action === input.proposedAction
  );
}

export async function proposeModerationEscalation(
  auth: AuthContext,
  reviewId: string,
  input: ProposeEscalationInput
) {
  const created = await withPostgresTransaction(async (client) => {
    const review = (
      await client.query('select * from moderation_reviews where review_id=$1 for update', [
        reviewId
      ])
    ).rows[0];
    if (!review || review.source !== 'USER_REPORT')
      throw new AppError(404, 'ADMIN_001', 'Không tìm thấy báo cáo.');
    await assertResolverAccess(auth, review, client);
    const identity = (
      await client.query(
        'select role, status, access_version from users where user_id=$1 and deleted_at is null',
        [auth.userId]
      )
    ).rows[0];
    assertFreshIdentityUnderLock(auth, identity);
    if (review.status !== 'PENDING')
      throw new AppError(409, 'ADMIN_002', 'Báo cáo đã được xử lý.');
    // Escalations carry account sanctions for Admin; other report variants stay
    // within moderator authority.
    if (review.target_type !== 'USER')
      throw new AppError(
        422,
        'ESCALATION_TARGET',
        'Chỉ chuyển cấp hồ sơ báo cáo tài khoản người dùng.'
      );
    const reports = (
      await client.query('select * from reports where review_id=$1 order by created_at', [reviewId])
    ).rows;
    // The recommending moderator must be independent of the target and of the
    // reporters, and may not escalate a report about themselves.
    assertIndependentActor(auth.userId, await reviewInvolvedUserIds(review, client));
    assertIndependentActor(auth.userId, reports.map((report) => report.reporter_id));
    const existing = await waitForOpenEscalation(client, reviewId);
    if (existing) {
      if (repeatsExisting(existing, auth, input))
        return { row: existing, created: false, review };
      throw new AppError(
        409,
        'ESCALATION_CONFLICT',
        'Hồ sơ đã có một đề nghị chuyển cấp khác đang chờ.'
      );
    }
    let row;
    try {
      row = (
        await client.query(
          'insert into moderation_escalations(review_id,proposed_by,proposed_action,reason) values($1,$2,$3,$4) returning *',
          [reviewId, auth.userId, input.proposedAction, input.reason]
        )
      ).rows[0];
    } catch (error: any) {
      // The partial unique index is the hard one-open-per-review guard; the
      // review lock serializes normal traffic, the re-select is the belt.
      if (error?.code === '23505') {
        const winner = await waitForOpenEscalation(client, reviewId);
        if (winner) {
          if (repeatsExisting(winner, auth, input))
            return { row: winner, created: false, review };
          throw new AppError(
            409,
            'ESCALATION_CONFLICT',
            'Hồ sơ đã có một đề nghị chuyển cấp khác đang chờ.'
          );
        }
      }
      throw error;
    }
    await audit(client, auth, {
      action: 'ESCALATION_PROPOSED',
      targetType: review.target_type,
      targetId: review.target_id,
      affectedUserId: review.target_id,
      reason: input.reason,
      before: { reviewId, reviewStatus: review.status },
      after: { escalationId: row.escalation_id, proposedAction: input.proposedAction }
    });
    return { row, created: true, review };
  });
  return {
    created: created.created,
    escalation: {
      ...escalationSummary(created.row),
      reviewStatus: created.review.status as string
    }
  };
}

export async function listModerationEscalations(input: ListEscalationsInput) {
  const offset = (input.page - 1) * input.limit;
  const result = await getPostgresPool().query(
    `select e.*, u.username as proposed_by_username, ru.username as resolver_username,
            r.target_type as review_target_type, r.target_id as review_target_id,
            r.status as review_status, r.created_at as review_created_at, r.reason as review_reason,
            tu.username as target_username, tu.status as target_status, tu.role as target_role,
            (select count(*)::int from reports rp where rp.review_id=e.review_id) as report_count
       from moderation_escalations e
       join moderation_reviews r on r.review_id=e.review_id
       join users u on u.user_id=e.proposed_by
       left join users ru on ru.user_id=e.resolved_by
       left join users tu on tu.user_id::text=r.target_id and r.target_type='USER'
      where ($1::text is null or e.status=$1)
      order by e.created_at desc, e.escalation_id
      limit $2 offset $3`,
    [input.status ?? null, input.limit, offset]
  );
  const countResult = await getPostgresPool().query(
    'select count(*)::int as total from moderation_escalations where ($1::text is null or status=$1)',
    [input.status ?? null]
  );
  return {
    data: result.rows.map((row) => ({
      ...escalationSummary(row),
      resolvedByUsername: row.resolver_username ?? null,
      review: {
        reviewId: row.review_id,
        targetType: row.review_target_type,
        targetId: row.review_target_id,
        status: row.review_status,
        createdAt: row.review_created_at.toISOString(),
        reason: row.review_reason ?? null,
        reportCount: row.report_count,
        targetUsername: row.target_username ?? null,
        targetStatus: row.target_status ?? null,
        targetRole: row.target_role ?? null
      }
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: countResult.rows[0]?.total ?? 0,
      totalPages: Math.ceil((countResult.rows[0]?.total ?? 0) / input.limit)
    }
  };
}

export async function findModerationReviewEscalation(reviewId: string) {
  const row = (
    await getPostgresPool().query(
      `select e.*, u.username as proposed_by_username
         from moderation_escalations e
         left join users u on u.user_id=e.proposed_by
        where e.review_id=$1
        order by e.created_at desc, e.escalation_id desc
        limit 1`,
      [reviewId]
    )
  ).rows[0];
  return row ? escalationSummary(row) : null;
}

export async function resolveModerationEscalation(
  auth: AuthContext,
  escalationId: string,
  input: ResolveEscalationInput
) {
  const result = await withPostgresTransaction(async (client) => {
    const found = (
      await client.query('select * from moderation_escalations where escalation_id=$1', [
        escalationId
      ])
    ).rows[0];
    if (!found)
      throw new AppError(404, 'ESCALATION_NOT_FOUND', 'Không tìm thấy đề nghị chuyển cấp.');
    // Review first, escalation second: this is the shared order with propose,
    // matching ROLE_PERMISSION_DESIGN's lock discipline.
    const review = (
      await client.query('select * from moderation_reviews where review_id=$1 for update', [
        found.review_id
      ])
    ).rows[0];
    if (!review || review.source !== 'USER_REPORT')
      throw new AppError(404, 'ADMIN_001', 'Không tìm thấy báo cáo.');
    const escalation = (
      await client.query('select * from moderation_escalations where escalation_id=$1 for update', [
        escalationId
      ])
    ).rows[0];
    if (!escalation || escalation.status !== 'OPEN')
      throw new AppError(409, 'ESCALATION_RESOLVED', 'Đề nghị chuyển cấp đã được giải quyết.');
    await assertResolverAccess(auth, review, client);
    if (review.status !== 'PENDING')
      throw new AppError(
        409,
        'ADMIN_002',
        'Báo cáo đã được xử lý trước đó. Hãy đối soát hồ sơ.'
      );
    const reason = requiredReason(input.reason);
    const reports = (
      await client.query('select * from reports where review_id=$1 order by created_at', [
        review.review_id
      ])
    ).rows;
    // The deciding Admin must be independent of the proposing moderator, the
    // reporters and the reported account — including themselves.
    const involved = await reviewInvolvedUserIds(review, client);
    assertIndependentActor(auth.userId, [
      escalation.proposed_by,
      ...reports.map((report) => report.reporter_id),
      ...involved
    ]);
    const accepted = input.decision === 'ACCEPTED';
    // Acceptance executes through the shared report-resolution core, so the
    // proposal, the sanction, the review verdict and the audit stay in one
    // outcome. Rejection returns the report to the suitable queue untouched.
    const executed = accepted
      ? await executeUserReportResolution(auth, client, review, {
          decision: 'APPROVED',
          reason,
          action: escalation.proposed_action
        })
      : null;
    const status = accepted ? 'EXECUTED' : 'DISMISSED';
    const updated = (
      await client.query(
        "update moderation_escalations set status=$2,resolution=$3,resolved_by=$4,resolved_at=now() where escalation_id=$1 and status='OPEN' returning *",
        [escalationId, status, reason, auth.userId]
      )
    ).rows[0];
    await audit(client, auth, {
      action: accepted ? 'ESCALATION_EXECUTED' : 'ESCALATION_DISMISSED',
      targetType: review.target_type,
      targetId: review.target_id,
      affectedUserId: review.target_id,
      reason,
      before: {
        escalationId,
        status: 'OPEN',
        proposedAction: escalation.proposed_action,
        proposedBy: escalation.proposed_by
      },
      after: { status, decision: input.decision, action: escalation.proposed_action }
    });
    await queueAdminNotification(client, {
      userId: escalation.proposed_by,
      type: accepted ? 'ESCALATION_APPROVED' : 'ESCALATION_REJECTED',
      title: accepted
        ? 'Đề nghị chuyển cấp đã được chấp nhận'
        : 'Đề nghị chuyển cấp đã bị bác',
      content: reason,
      payload: {
        escalationId,
        reviewId: review.review_id,
        decision: input.decision,
        action: escalation.proposed_action,
        adminId: auth.userId,
        reason
      }
    });
    return {
      escalation: escalationSummary(updated),
      reviewStatus: accepted ? executed!.status : review.status,
      targetId: review.target_id,
      action: executed?.action ?? null
    };
  });
  // Notifications commit with the decision rows; the worker delivers exactly
  // once per job even under contention or delivery retries.
  await drainAdminJobsSafely();
  return result;
}
