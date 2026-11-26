import type { PoolClient } from 'pg';
import { env } from '../../core/config/env.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { hasAuthorCapability } from '../../shared/constants/roles.js';
import { assertAdminPermission, audit } from '../admin/admin-access.js';
import { enqueueNotification } from '../interactions/notification-events.js';
import { appendEvent, eligibility, lockActor, lockCase, lockNovel } from './novel-selection.service.js';

type TerminalStatus = 'REJECTED' | 'REVOKED';
export type ReconsiderationOutcome = 'ACCEPTED' | 'REJECTED';
type Reconsideration = {
  reconsideration_id: string; case_id: string; decision_version: number; decision_status: TerminalStatus;
  effective_at: Date; requester_id: string; reason: string; status: 'OPEN' | ReconsiderationOutcome;
  version: number; created_at: Date; reviewer_id: string | null; resolution: string | null; resolved_at: Date | null;
};

const latestDecision = `not exists (select 1 from novel_selection_cases newer
  where newer.novel_id=s.novel_id and (newer.created_at,newer.case_id)>(s.created_at,s.case_id))`;

function stale() {
  return new AppError(409, 'RECONSIDERATION_STALE', 'Quyết định đã thay đổi. Hãy tải lại hồ sơ.');
}

async function originalDecision(client: PoolClient, caseId: string, version: number) {
  const { rows: [original] } = await client.query<{ actor_id: string | null; status: TerminalStatus }>(
    `select e.actor_id,s.status from novel_selection_cases s join novel_selection_events e
       on e.case_id=s.case_id and e.version=s.version
     where s.case_id=$1 and s.version=$2 and s.terminal_at is not null and ${latestDecision}
       and ((s.status='REJECTED' and e.action='REJECT') or (s.status='REVOKED' and e.action='REVOKE'))`, [caseId, version]
  );
  if (!original?.actor_id) throw stale();
  return original;
}

export async function authorReconsiderations(authorId: string, novelId: string, item: { case_id: string; version: number } | null) {
  const pool = getPostgresPool();
  const { rows: [decision] } = item ? await pool.query<{ caseId: string; decisionVersion: number; deadline: Date; inWindow: boolean }>(
    `select s.case_id as "caseId",s.version as "decisionVersion",
       selection_reconsideration_deadline(s.terminal_at) as deadline,
       selection_reconsideration_in_window(s.terminal_at,clock_timestamp()) as "inWindow"
     from novel_selection_cases s join novel_selection_events e on e.case_id=s.case_id and e.version=s.version
     where s.case_id=$1 and s.version=$2 and s.terminal_at is not null and e.actor_id is not null
       and ((s.status='REJECTED' and e.action='REJECT') or (s.status='REVOKED' and e.action='REVOKE'))`, [item.case_id, item.version]
  ) : { rows: [] };
  const { rows: history } = await pool.query<Pick<Reconsideration, 'reconsideration_id' | 'case_id' | 'decision_version' |
    'decision_status' | 'reason' | 'status' | 'resolution' | 'created_at' | 'resolved_at'>>(
    `select r.reconsideration_id,r.case_id,r.decision_version,r.decision_status,r.reason,r.status,r.resolution,r.created_at,r.resolved_at
    from novel_selection_reconsiderations r
    join novel_selection_cases s using(case_id) where s.novel_id=$1 and r.requester_id=$2
    order by r.created_at desc,r.reconsideration_id desc limit 10`, [novelId, authorId]);
  const submitted = history.some((entry) => entry.case_id === decision?.caseId && entry.decision_version === decision.decisionVersion);
  return { reconsiderations: history, reconsiderationWindow: decision ? {
    ...decision, canSubmit: env.NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED && decision.inWindow && !submitted, submitted
  } : null };
}

export async function submitReconsideration(auth: AuthContext, input: {
  novelId: string; caseId: string; decisionVersion: number; reason: string;
}) {
  if (!env.NOVEL_SELECTION_RECONSIDERATION_WRITES_ENABLED) {
    throw new AppError(503, 'RECONSIDERATION_PAUSED', 'Tạm dừng nhận yêu cầu xét lại mới.');
  }
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth, 'update');
    const novel = await lockNovel(client, input.novelId);
    if (novel.author_id !== auth.userId || !hasAuthorCapability(auth.role)) {
      throw new AppError(403, 'RECONSIDERATION_OWNER', 'Chỉ chủ tác phẩm được gửi yêu cầu xét lại.');
    }
    await lockCase(client, input.novelId, input.caseId);
    const original = await originalDecision(client, input.caseId, input.decisionVersion);
    if ((await client.query('select 1 from novel_selection_reconsiderations where case_id=$1 and decision_version=$2',
      [input.caseId, input.decisionVersion])).rowCount) {
      throw new AppError(409, 'RECONSIDERATION_DUPLICATE', 'Quyết định này đã có một yêu cầu xét lại.');
    }

    // PostgreSQL keeps microsecond precision for both windows and starts both checks after lock acquisition.
    const { rows: [result] } = await client.query<{ reconsideration_id: string | null; in_window: boolean; attempts: number }>(
      `with utc_clock as materialized (select clock_timestamp() as instant),
       policy as materialized (
         select s.terminal_at,t.instant,selection_reconsideration_in_window(s.terminal_at,t.instant) as in_window,
           (select count(*)::integer from (select 1 from novel_selection_reconsiderations
             where requester_id=$3 and created_at>t.instant-interval '24 hours' and created_at<=t.instant limit 3) recent) as attempts
         from novel_selection_cases s cross join utc_clock t where s.case_id=$1
       ), inserted as (
         insert into novel_selection_reconsiderations(case_id,decision_version,decision_status,effective_at,requester_id,reason,created_at)
         select $1,$2,$5,terminal_at,$3,$4,instant from policy where in_window and attempts<3
         returning reconsideration_id
       ) select p.in_window,p.attempts,(select reconsideration_id from inserted) as reconsideration_id from policy p`,
      [input.caseId, input.decisionVersion, auth.userId, input.reason, original.status]
    );
    if (!result.in_window) throw new AppError(422, 'RECONSIDERATION_EXPIRED', 'Đã hết hạn 14 ngày để gửi yêu cầu xét lại.');
    if (!result.reconsideration_id) throw new AppError(429, 'RECONSIDERATION_RATE', 'Bạn đã gửi đủ ba yêu cầu trong 24 giờ gần nhất.');
    await audit(client, auth, { action: 'SELECTION_RECONSIDERATION_SUBMIT', targetType: 'SELECTION_RECONSIDERATION',
      targetId: result.reconsideration_id, affectedUserId: auth.userId, reason: input.reason,
      after: { caseId: input.caseId, decisionVersion: input.decisionVersion, status: 'OPEN' } });
    return { reconsiderationId: result.reconsideration_id, status: 'OPEN', version: 1 };
  });
}

export async function listReconsiderations(actorId: string, input: { status: Reconsideration['status']; page: number; limit: number }) {
  const { rows } = await getPostgresPool().query(`select r.*,n.novel_id,n.title,e.reason as decision_reason,
    (r.status='OPEN' and $1<>n.author_id and $1<>r.requester_id and $1<>e.actor_id and not exists
      (select 1 from novel_nominations d where d.case_id=r.case_id and d.nominator_id=$1)) as can_resolve
    from novel_selection_reconsiderations r join novel_selection_cases s using(case_id) join novels n using(novel_id)
    join novel_selection_events e on e.case_id=r.case_id and e.version=r.decision_version
    where r.status=$2 order by r.created_at desc,r.reconsideration_id desc limit $3 offset $4`,
  [actorId, input.status, input.limit + 1, (input.page - 1) * input.limit]);
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

export async function resolveReconsideration(auth: AuthContext, reconsiderationId: string, input: {
  outcome: ReconsiderationOutcome; reason: string; expectedVersion: number;
}) {
  return withPostgresTransaction(async (client) => {
    const { rows: [target] } = await client.query<{ novel_id: string; case_id: string; requester_id: string }>(
      `select s.novel_id,r.case_id,r.requester_id from novel_selection_reconsiderations r
       join novel_selection_cases s using(case_id) where r.reconsideration_id=$1`, [reconsiderationId]
    );
    if (!target) throw new AppError(404, 'RECONSIDERATION_NOT_FOUND', 'Không tìm thấy yêu cầu xét lại.');
    await client.query('select user_id from users where user_id=any($1::uuid[]) order by user_id for share',
      [[auth.userId, target.requester_id]]);
    await lockActor(client, auth);
    await assertAdminPermission(auth, 'selection.reconsider', client);
    const novel = await lockNovel(client, target.novel_id);
    const item = await lockCase(client, target.novel_id, target.case_id);
    const { rows: [request] } = await client.query<Reconsideration>(
      'select * from novel_selection_reconsiderations where reconsideration_id=$1 for update', [reconsiderationId]
    );
    if (request.status !== 'OPEN' || request.version !== input.expectedVersion || novel.author_id !== request.requester_id) throw stale();
    const original = await originalDecision(client, item.case_id, request.decision_version);
    const nominated = (await client.query('select 1 from novel_nominations where case_id=$1 and nominator_id=$2',
      [item.case_id, auth.userId])).rowCount;
    assertIndependentActor(auth.userId, [novel.author_id, request.requester_id, original.actor_id, nominated ? auth.userId : null]);
    if (input.outcome === 'ACCEPTED') {
      const active = (await client.query(`select 1 from novel_selection_cases where novel_id=$1
        and status in ('PENDING','NEEDS_INFO','SELECTED','RECHECK') limit 1`, [novel.novel_id])).rowCount;
      if (active || !(await eligibility(novel.novel_id, client))) throw stale();
      await client.query(`update novel_selection_cases set status='RECHECK',version=version+1,
        terminal_at=null,needs_comparison=false,last_reason=$2,updated_at=clock_timestamp() where case_id=$1`,
      [item.case_id, input.reason]);
      await appendEvent(client, { caseId: item.case_id, version: item.version + 1, actorId: auth.userId,
        action: 'RECONSIDERATION_ACCEPTED', reason: input.reason,
        evidence: { reconsiderationId, originalDecisionVersion: request.decision_version, previousStatus: item.status } });
    }
    await client.query(`update novel_selection_reconsiderations set status=$2,version=version+1,
      reviewer_id=$3,resolution=$4,resolved_at=clock_timestamp() where reconsideration_id=$1`,
    [reconsiderationId, input.outcome, auth.userId, input.reason]);
    await audit(client, auth, { action: `SELECTION_RECONSIDERATION_${input.outcome}`, targetType: 'SELECTION_RECONSIDERATION',
      targetId: reconsiderationId, affectedUserId: request.requester_id, reason: input.reason,
      before: { status: request.status, caseId: item.case_id, originalDecisionVersion: request.decision_version },
      after: { status: input.outcome, selectionStatus: input.outcome === 'ACCEPTED' ? 'RECHECK' : item.status } });
    await enqueueNotification(client, { eventKey: `selection-reconsideration:${reconsiderationId}`, userId: request.requester_id,
      type: 'SELECTION_RECONSIDERATION', title: 'Kết quả yêu cầu xét lại tuyển chọn', content: input.reason,
      payload: { href: `/author/novels/${novel.novel_id}`, reconsiderationId } });
    return { reconsiderationId, status: input.outcome, version: request.version + 1 };
  });
}
