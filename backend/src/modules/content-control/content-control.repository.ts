import type { QueryResultRow } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import type {
  ListReviewsInput,
  CreateReportInput
} from './content-control.schemas.js';
import type {
  MatchedRule,
  ModerationSource,
  ModerationStatus,
  ModerationTargetType
} from './content-control.types.js';

function mapRule(row: QueryResultRow): MatchedRule {
  return {
    ruleId: row.rule_id,
    name: row.name,
    pattern: row.pattern,
    category: row.category,
    severity: row.severity
  };
}

export async function listActiveFilterRules() {
  const result = await getPostgresPool().query(
    `
      select *
      from content_filter_rules
      where status = 'ACTIVE'
      order by severity desc, created_at asc
    `
  );

  return result.rows.map(mapRule);
}

export async function createModerationReview(input: {
  targetType: ModerationTargetType;
  targetId: string;
  source: ModerationSource;
  evidenceId?: string | null;
}) {
  const result = await getPostgresPool().query(
    `
      insert into moderation_reviews (target_type, target_id, source, evidence_id)
      values ($1, $2, $3, $4)
      returning *
    `,
    [input.targetType, input.targetId, input.source, input.evidenceId ?? null]
  );

  return result.rows[0];
}

export async function findOpenReview(targetType: ModerationTargetType, targetId: string) {
  const result = await getPostgresPool().query(
    `
      select *
      from moderation_reviews
      where target_type = $1 and target_id = $2 and status = 'PENDING'
      order by created_at desc
      limit 1
    `,
    [targetType, targetId]
  );

  return result.rows[0] ?? null;
}

export async function createReport(input: CreateReportInput & {
  reporterId: string;
  reviewId: string;
}) {
  const result = await getPostgresPool().query(
    `
      insert into reports (reporter_id, target_type, target_id, review_id, reason, description)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [
      input.reporterId,
      input.targetType,
      input.targetId,
      input.reviewId,
      input.reason,
      input.description ?? null
    ]
  );

  return result.rows[0];
}

export async function listReviews(input: ListReviewsInput) {
  const offset = (input.page - 1) * input.limit;
  const result = await getPostgresPool().query(
    `
      select *
      from moderation_reviews
      where ($1::moderation_target_type is null or target_type = $1)
        and ($2::moderation_status is null or status = $2)
        and ($3::moderation_source is null or source = $3)
      order by created_at desc
      limit $4 offset $5
    `,
    [input.targetType ?? null, input.status ?? null, input.source ?? null, input.limit, offset]
  );

  const countResult = await getPostgresPool().query(
    `
      select count(*)::int as total
      from moderation_reviews
      where ($1::moderation_target_type is null or target_type = $1)
        and ($2::moderation_status is null or status = $2)
        and ($3::moderation_source is null or source = $3)
    `,
    [input.targetType ?? null, input.status ?? null, input.source ?? null]
  );

  return {
    items: result.rows,
    totalItems: countResult.rows[0]?.total ?? 0
  };
}

export async function findReviewById(reviewId: string) {
  const result = await getPostgresPool().query(
    'select * from moderation_reviews where review_id = $1 limit 1',
    [reviewId]
  );

  return result.rows[0] ?? null;
}

export async function countReportsForReview(reviewId: string) {
  const result = await getPostgresPool().query(
    'select count(*)::int as total from reports where review_id = $1',
    [reviewId]
  );

  return result.rows[0]?.total ?? 0;
}

export async function resolveReview(input: {
  reviewId: string;
  status: ModerationStatus;
  reviewedBy: string;
  reason?: string;
}) {
  const result = await getPostgresPool().query(
    `
      update moderation_reviews
      set status = $2,
          reviewed_by = $3,
          reviewed_at = now(),
          reason = $4,
          updated_at = now()
      where review_id = $1 and status = 'PENDING'
      returning *
    `,
    [input.reviewId, input.status, input.reviewedBy, input.reason ?? null]
  );

  return result.rows[0] ?? null;
}
