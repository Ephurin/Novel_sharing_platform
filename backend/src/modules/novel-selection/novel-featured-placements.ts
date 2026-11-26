import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertIndependentActor, placementsEnabled } from '../../core/security/moderation-policy.js';
import { assertAdminPermission, audit } from '../admin/admin-access.js';
import { assertModeratorOperational } from '../moderator/moderator-access.js';
import { mapNovelSummary } from '../reading/reading.repository.js';
import { lockActor, lockCase, lockNovel } from './novel-selection.service.js';

const day = 86_400_000;
const reason = z.string().trim().min(1).max(1000);
const priority = z.number().int().min(0).max(100);
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value));
export const createPlacementBody = z.object({
  caseId: z.string().uuid(), startsAt: instant, endsAt: instant.optional(), priority, reason
});
export const updatePlacementBody = z.object({ priority, expectedVersion: z.number().int().positive(), reason });
export const cancelPlacementBody = z.object({ reason, expectedVersion: z.number().int().positive().optional() });

type Placement = {
  placement_id: string; novel_id: string; case_id: string; starts_at: Date; ends_at: Date;
  priority: number; version: number; cancelled_at: Date | null;
};
const fields = 'placement_id,novel_id,case_id,starts_at,ends_at,priority,version,cancelled_at';

function conflict(code: string, message: string) {
  return new AppError(409, code, message);
}

export async function assertPlacementAccess(auth: AuthContext, client?: PoolClient) {
  if (!placementsEnabled()) throw new AppError(404, 'PLACEMENTS_DISABLED', 'Tính năng giới thiệu truyện chưa mở.');
  if (auth.role === 'ADMIN') await assertAdminPermission(auth, 'placement.manage', client);
  else assertModeratorOperational(auth, 'placement.manage');
}

async function target(client: PoolClient, auth: AuthContext, caseId: string) {
  const { rows: [row] } = await client.query<{ novel_id: string }>(
    'select novel_id from novel_selection_cases where case_id=$1', [caseId]
  );
  if (!row) throw new AppError(404, 'SELECTION_NOT_FOUND', 'Không tìm thấy hồ sơ tuyển chọn.');
  const novel = await lockNovel(client, row.novel_id);
  const selection = await lockCase(client, row.novel_id, caseId);
  const nominated = (await client.query('select 1 from novel_nominations where case_id=$1 and nominator_id=$2',
    [caseId, auth.userId])).rowCount;
  assertIndependentActor(auth.userId, [novel.author_id, nominated ? auth.userId : null]);
  return { novel, selection };
}

async function assertEligible(client: PoolClient, selection: Awaited<ReturnType<typeof lockCase>>) {
  const { rows: [row] } = await client.query<{ eligible: boolean }>(
    'select coalesce($2 = any(novel_selection_branches($1)),false) as eligible',
    [selection.novel_id, selection.reviewed_branch]
  );
  if (selection.status !== 'SELECTED' || !row.eligible)
    throw conflict('PLACEMENT_INELIGIBLE', 'Tác phẩm chưa được tuyển chọn hoặc đã mất điều kiện công khai.');
}

export async function createPlacement(auth: AuthContext, input: z.infer<typeof createPlacementBody>, key: string) {
  const ends = input.endsAt ?? new Date(input.startsAt.getTime() + 7 * day);
  const duration = ends.getTime() - input.startsAt.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 14 * day)
    throw new AppError(422, 'PLACEMENT_WINDOW', 'Lịch giới thiệu phải dài hơn 0 và tối đa 14 ngày.');
  const payload = JSON.stringify({ caseId: input.caseId, startsAt: input.startsAt, endsAt: ends,
    priority: input.priority, reason: input.reason });
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth);
    await assertPlacementAccess(auth, client);
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,210))', [`${auth.userId}:${key}`]);
    const { novel, selection } = await target(client, auth, input.caseId);
    const { rows: [previous] } = await client.query<Placement & { same: boolean }>(
      `select ${fields},create_payload=$3::jsonb as same from novel_featured_placements
       where created_by=$1 and idempotency_key=$2`, [auth.userId, key, payload]);
    if (previous) {
      const { same, ...placement } = previous;
      if (!same) throw conflict('PLACEMENT_IDEMPOTENCY', 'Mã gửi đã được dùng cho một lịch khác.');
      return { placement, created: false };
    }
    await assertEligible(client, selection);
    const { rows: [window] } = await client.query<{ ended: boolean; overlaps: boolean }>(
      `select $3::timestamptz<=clock_timestamp() as ended,exists (
        select 1 from novel_featured_placements where novel_id=$1 and cancelled_at is null
          and starts_at<$3 and ends_at>$2) as overlaps`, [novel.novel_id, input.startsAt, ends]);
    if (window.ended) throw new AppError(422, 'PLACEMENT_WINDOW', 'Lịch giới thiệu đã hết hạn.');
    if (window.overlaps) throw conflict('PLACEMENT_OVERLAP', 'Tác phẩm đã có lịch trùng khoảng thời gian này.');
    const { rows: [placement] } = await client.query<Placement>(
      `insert into novel_featured_placements(case_id,novel_id,starts_at,ends_at,priority,created_by,idempotency_key,create_payload)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning ${fields}`,
      [input.caseId, novel.novel_id, input.startsAt, ends, input.priority, auth.userId, key, payload]);
    await audit(client, auth, { action: 'PLACEMENT_CREATE', targetType: 'FEATURED_PLACEMENT',
      targetId: placement.placement_id, reason: input.reason, after: placement });
    return { placement, created: true };
  });
}

type Change = { kind: 'priority' } & z.infer<typeof updatePlacementBody> | { kind: 'cancel' } & z.infer<typeof cancelPlacementBody>;

export async function changePlacement(auth: AuthContext, id: string, change: Change) {
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth);
    await assertPlacementAccess(auth, client);
    const { rows: [reference] } = await client.query<{ case_id: string }>(
      'select case_id from novel_featured_placements where placement_id=$1', [id]);
    if (!reference) throw new AppError(404, 'PLACEMENT_NOT_FOUND', 'Không tìm thấy lịch giới thiệu.');
    const { selection } = await target(client, auth, reference.case_id);
    const { rows: [row] } = await client.query<Placement & { ended: boolean }>(
      `select ${fields},ends_at<=clock_timestamp() as ended from novel_featured_placements where placement_id=$1 for update`, [id]);
    const { ended, ...before } = row;
    if (change.expectedVersion !== undefined && change.expectedVersion !== before.version)
      throw conflict('PLACEMENT_STALE', 'Lịch đã thay đổi. Hãy tải lại.');
    if (change.kind === 'cancel' && before.cancelled_at) return before;
    if (ended || before.cancelled_at) throw conflict('PLACEMENT_CLOSED', 'Lịch đã kết thúc hoặc đã hủy.');
    if (change.kind === 'priority') {
      await assertEligible(client, selection);
      if (before.priority === change.priority) return before;
    }
    const { rows: [after] } = await client.query<Placement>(
      `update novel_featured_placements set version=version+1,${change.kind === 'priority' ? 'priority=$2' : 'cancelled_at=clock_timestamp()'}
       where placement_id=$1 and ends_at>clock_timestamp() returning ${fields}`,
      change.kind === 'priority' ? [id, change.priority] : [id]);
    if (!after) throw conflict('PLACEMENT_CLOSED', 'Lịch đã kết thúc.');
    await audit(client, auth, { action: change.kind === 'priority' ? 'PLACEMENT_PRIORITY' : 'PLACEMENT_CANCEL',
      targetType: 'FEATURED_PLACEMENT', targetId: id, reason: change.reason, before, after });
    return after;
  });
}

export async function listPlacements(actorId: string, page: number, limit: number) {
  const { rows } = await getPostgresPool().query<Placement & { title: string; manageable: boolean; ended: boolean }>(
    `select p.placement_id,p.case_id,p.novel_id,p.starts_at,p.ends_at,p.priority,p.version,p.cancelled_at,
      n.title,p.ends_at<=statement_timestamp() as ended,
      (n.author_id<>$1 and not exists(select 1 from novel_nominations d where d.case_id=p.case_id and d.nominator_id=$1)) as manageable
     from novel_featured_placements p join novels n using(novel_id)
     order by p.starts_at desc,p.placement_id desc limit $2 offset $3`, [actorId, limit + 1, (page - 1) * limit]);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function placementCandidates(actorId: string, search: string) {
  const { rows } = await getPostgresPool().query<{ caseId: string; title: string }>(
    `select s.case_id as "caseId",n.title from novel_selection_cases s join novels n using(novel_id)
     where s.status='SELECTED' and n.author_id<>$1 and ($2='' or strpos(lower(n.title),lower($2))>0)
       and s.reviewed_branch=any(novel_selection_branches(n.novel_id))
       and not exists(select 1 from novel_nominations d where d.case_id=s.case_id and d.nominator_id=$1)
     order by s.updated_at desc,s.case_id desc limit 20`, [actorId, search]);
  return rows;
}

export async function featuredSelections() {
  if (!placementsEnabled()) return { items: [], refreshInMs: null };
  const { rows } = await getPostgresPool().query(
    `with visible as materialized (
      select p.placement_id,p.novel_id,p.starts_at,p.ends_at,p.priority from novel_featured_placements p
      join novel_selection_cases s on s.case_id=p.case_id and s.novel_id=p.novel_id and s.status='SELECTED'
      where p.cancelled_at is null and p.ends_at>statement_timestamp()
        and p.starts_at<=statement_timestamp()
        and s.reviewed_branch=any(novel_selection_branches(p.novel_id))
      order by p.priority desc,p.starts_at,p.placement_id limit 6
    ), boundary as (
      select case when min(instant) is not null then
        greatest(1,least(2147483647,ceil(extract(epoch from min(instant)-statement_timestamp())*1000)))::integer end as refresh_ms
      from (select min(starts_at) as instant from novel_featured_placements
              where cancelled_at is null and starts_at>statement_timestamp()
            union all select min(ends_at) from visible) boundaries where instant is not null
    )
    select n.*,v.placement_id,v.ends_at,v.priority,v.starts_at,b.refresh_ms,
           -- UI-07: readers only see published chapters (novels.chapters_count includes drafts).
           (select count(*)::int from chapters pc where pc.novel_id=n.novel_id and pc.deleted_at is null and pc.status='PUBLISHED') as published_chapters_count,
           coalesce(up.display_name,u.username) as author_name,g.name as genre_name
    from boundary b left join visible v on true left join novels n on n.novel_id=v.novel_id
    left join users u on u.user_id=n.author_id left join user_profiles up on up.user_id=u.user_id
    left join genres g on g.genre_id=n.genre_id
    order by v.priority desc,v.starts_at,v.placement_id`);
  return { items: rows.filter(row => row.placement_id).map(row => ({
    ...mapNovelSummary(row), placementId: row.placement_id, endsAt: row.ends_at, selectionLabel: 'Tác phẩm được tuyển chọn'
  })), refreshInMs: rows[0]?.refresh_ms ?? null };
}
