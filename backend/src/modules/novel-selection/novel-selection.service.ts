import type { PoolClient } from 'pg';
import { env } from '../../core/config/env.js';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertIndependentActor } from '../../core/security/moderation-policy.js';
import { hasAuthorCapability, hasReaderCapability, type UserRole } from '../../shared/constants/roles.js';
import { enqueueNotification } from '../interactions/notification-events.js';
import type { SelectionDecision, SelectionPage, SelectionStatus } from './novel-selection.schemas.js';

type Eligibility = 'STANDARD' | 'SHORT_STORY';
type Novel = { novel_id: string; author_id: string; title: string; synopsis: string };
type SnapshotChapter = { number: number; title: string; hash: string; revisionId: string | null; content?: string | null };
type Snapshot = { title: string; synopsis: string; displayTitle: string; displaySynopsis: string; chapters: Record<string, SnapshotChapter> };
type SelectionCase = {
  case_id: string; novel_id: string; status: SelectionStatus; version: number;
  reviewed_branch: Eligibility | null; reviewed_snapshot: Snapshot | null; classified_snapshot: Snapshot | null;
  needs_comparison: boolean; criteria: SelectionDecision['criteria'] | null;
  author_notes: string | null; last_reason: string | null; updated_at: Date;
};
type CaseSummary = Pick<SelectionCase, 'case_id' | 'novel_id' | 'status' | 'version' | 'reviewed_branch' |
  'needs_comparison' | 'criteria' | 'author_notes' | 'last_reason' | 'updated_at'>;
const active = "status in ('PENDING','NEEDS_INFO','SELECTED','RECHECK')";
const caseSummary = `s.case_id,s.novel_id,s.status,s.version,s.reviewed_branch,s.needs_comparison,
  s.criteria,s.author_notes,s.last_reason,s.updated_at`;

export function requireSelectionEnabled() {
  if (!env.NOVEL_SELECTION_ENABLED) throw new AppError(404, 'SELECTION_DISABLED', 'Tính năng tuyển chọn chưa mở.');
}

function notFound() {
  return new AppError(404, 'SELECTION_NOT_FOUND', 'Không tìm thấy hồ sơ tuyển chọn.');
}

export async function lockActor(client: PoolClient, auth: AuthContext, mode: 'share' | 'update' = 'share') {
  const { rows: [actor] } = await client.query<{ role: UserRole; access_version: number }>(
    `select role,access_version from users where user_id=$1 and status='ACTIVE' and deleted_at is null for ${mode}`, [auth.userId]
  );
  if (!actor || actor.access_version !== (auth.accessVersion ?? 0) || actor.role !== auth.role) {
    throw new AppError(403, 'SELECTION_ACTOR_INACTIVE', 'Phiên đăng nhập hoặc quyền truy cập đã thay đổi.');
  }
}

export async function lockNovel(client: PoolClient, novelId: string) {
  const { rows: [novel] } = await client.query<Novel>(
    'select novel_id,author_id,title,synopsis from novels where novel_id=$1 for update', [novelId]
  );
  if (!novel) throw notFound();
  return novel;
}

export async function lockCase(client: PoolClient, novelId: string, caseId: string) {
  const { rows: [item] } = await client.query<SelectionCase>(
    'select * from novel_selection_cases where novel_id=$1 and case_id=$2 for update', [novelId, caseId]
  );
  if (!item) throw notFound();
  return item;
}

export async function eligibility(novelId: string, db: Pick<PoolClient, 'query'> = getPostgresPool()) {
  const { rows: [row] } = await db.query<{ branches: Eligibility[] }>(
    'select novel_selection_branches($1) as branches', [novelId]
  );
  return row.branches[0] ?? null;
}

function checkVersion(item: SelectionCase, expectedVersion: number) {
  if (item.version !== expectedVersion) {
    throw new AppError(409, 'SELECTION_STALE', 'Hồ sơ hoặc bản công khai đã thay đổi. Hãy tải lại.', { version: item.version });
  }
}

async function publicSnapshot(client: Pick<PoolClient, 'query'>, novel: Novel): Promise<Snapshot> {
  const { rows: [snapshot] } = await client.query<Pick<Snapshot, 'title' | 'synopsis' | 'chapters'>>(
    `select novel_selection_text($2) as title,novel_selection_text($3) as synopsis,
       coalesce(jsonb_object_agg(c.chapter_id, jsonb_build_object(
         'number',c.chapter_number,'title',c.title,'hash',novel_selection_chapter_hash(c.title,c.content),
         'revisionId',matched.revision_id) || case when matched.revision_id is null
           then jsonb_build_object('content',c.content) else '{}'::jsonb end), '{}'::jsonb) as chapters
     from chapters c left join lateral (
       select r.revision_id from chapter_revisions r where r.chapter_id=c.chapter_id
         and r.content_hash=encode(sha256(convert_to(coalesce(c.content,''),'UTF8')),'hex')
         and r.content=c.content order by r.created_at desc,r.revision_id desc limit 1
     ) matched on true where c.novel_id=$1 and c.status='PUBLISHED' and c.deleted_at is null`,
    [novel.novel_id, novel.title, novel.synopsis]
  );
  return { ...snapshot, displayTitle: novel.title, displaySynopsis: novel.synopsis };
}

function snapshotSummary(snapshot: Snapshot | null) {
  if (!snapshot) return null;
  return {
    title: snapshot.displayTitle,
    synopsis: snapshot.displaySynopsis,
    chapters: Object.entries(snapshot.chapters).map(([chapterId, { number, title, hash, revisionId }]) =>
      ({ chapterId, number, title, hash, revisionId })).sort((a, b) => a.number - b.number)
  };
}

export async function appendEvent(client: PoolClient, input: {
  caseId: string; version: number; actorId: string; action: string; reason: string; evidence?: unknown;
}) {
  await client.query(
    'insert into novel_selection_events(case_id,version,actor_id,action,reason,evidence) values($1,$2,$3,$4,$5,$6)',
    [input.caseId, input.version, input.actorId, input.action, input.reason, input.evidence ?? null]
  );
}

export async function nominate(auth: AuthContext, novelId: string, reason: string, key: string) {
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth);
    // The key is scoped to an actor, including requests for different novels.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 208))', [`${auth.userId}:${key}`]);
    const novel = await lockNovel(client, novelId);
    const kind = novel.author_id === auth.userId ? 'AUTHOR' : 'READER';
    if ((kind === 'AUTHOR' && (auth.role === 'MODERATOR' || !hasAuthorCapability(auth.role))) ||
        (kind === 'READER' && !hasReaderCapability(auth.role))) {
      throw new AppError(403, 'SELECTION_NOMINATOR', 'Tài khoản này không thể đề cử tác phẩm này.');
    }
    const { rows: [prior] } = await client.query<{ case_id: string; nomination_id: string; submitted_status: SelectionStatus;
      novel_id: string; kind: string; reason: string }>(
      `select n.case_id,n.nomination_id,n.submitted_status,s.novel_id,n.kind,n.reason
       from novel_nominations n join novel_selection_cases s using(case_id)
       where n.nominator_id=$1 and n.idempotency_key=$2`, [auth.userId, key]
    );
    if (prior) {
      if (prior.novel_id !== novelId || prior.kind !== kind || prior.reason !== reason) {
        throw new AppError(409, 'SELECTION_IDEMPOTENCY', 'Mã gửi đã được dùng cho một đề cử khác.');
      }
      return { caseId: prior.case_id, nominationId: prior.nomination_id, status: prior.submitted_status, created: false };
    }
    if (!(await eligibility(novelId, client))) {
      throw new AppError(422, 'SELECTION_INELIGIBLE', 'Tác phẩm chưa đủ điều kiện tuyển chọn.');
    }
    let { rows: [item] } = await client.query<Pick<SelectionCase, 'case_id' | 'status'>>(
      `select case_id,status from novel_selection_cases where novel_id=$1 and ${active} for update`, [novelId]
    );
    if (!item) {
      const openReconsideration = await client.query(`select 1 from novel_selection_cases s
        join novel_selection_reconsiderations r using(case_id) where s.novel_id=$1 and r.status='OPEN' limit 1`, [novelId]);
      if (openReconsideration.rowCount) {
        throw new AppError(409, 'RECONSIDERATION_OPEN', 'Tác phẩm đang có yêu cầu xét lại.');
      }
      const { rowCount } = await client.query(`select 1 from novel_selection_cases where novel_id=$1
        and status in ('REJECTED','REVOKED') and terminal_at > now() - interval '30 days' limit 1`, [novelId]);
      if (rowCount) throw new AppError(422, 'SELECTION_COOLDOWN', 'Tác phẩm có thể được đề cử lại sau 30 ngày.');
      ({ rows: [item] } = await client.query<Pick<SelectionCase, 'case_id' | 'status'>>(
        'insert into novel_selection_cases(novel_id) values ($1) returning case_id,status', [novelId]
      ));
    }
    const { rows: [nomination] } = await client.query<{ nomination_id: string }>(
      `insert into novel_nominations(case_id,nominator_id,kind,reason,idempotency_key,submitted_status)
       values($1,$2,$3,$4,$5,$6) on conflict(case_id,nominator_id) do nothing returning nomination_id`,
      [item.case_id, auth.userId, kind, reason, key, item.status]
    );
    if (!nomination) throw new AppError(409, 'SELECTION_DUPLICATE', 'Bạn đã đề cử tác phẩm trong hồ sơ này.');
    return { caseId: item.case_id, nominationId: nomination.nomination_id, status: item.status, created: true };
  });
}

export async function listOwnNominations(userId: string, input: SelectionPage) {
  const { rows } = await getPostgresPool().query(`select n.nomination_id,n.kind,n.reason,n.created_at,s.case_id,s.status,
    s.novel_id,v.title from novel_nominations n join novel_selection_cases s using(case_id) join novels v using(novel_id)
    where n.nominator_id=$1 order by n.created_at desc,n.nomination_id desc limit $2 offset $3`,
  [userId, input.limit + 1, (input.page - 1) * input.limit]);
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

export async function getAuthorSelection(auth: AuthContext, novelId: string) {
  const { rows: [owned] } = await getPostgresPool().query('select 1 from novels where novel_id=$1 and author_id=$2', [novelId, auth.userId]);
  if (!owned || !hasAuthorCapability(auth.role)) throw notFound();
  const { rows: [item] } = await getPostgresPool().query<CaseSummary>(
    `select ${caseSummary} from novel_selection_cases s where s.novel_id=$1 order by s.created_at desc,s.case_id desc limit 1`, [novelId]
  );
  return { item: item ?? null, eligibility: await eligibility(novelId) };
}

export async function supplement(auth: AuthContext, novelId: string, caseId: string, notes: string, version: number) {
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth);
    const novel = await lockNovel(client, novelId);
    if (novel.author_id !== auth.userId || !hasAuthorCapability(auth.role)) throw notFound();
    const item = await lockCase(client, novelId, caseId);
    checkVersion(item, version);
    if (item.status !== 'NEEDS_INFO') throw new AppError(409, 'SELECTION_STATE', 'Hồ sơ hiện không cần bổ sung.');
    await client.query(`update novel_selection_cases set status='PENDING',author_notes=$2,version=version+1,updated_at=now()
      where case_id=$1`, [caseId, notes]);
    await appendEvent(client, { caseId, version: version + 1, actorId: auth.userId, action: 'SUPPLEMENT', reason: notes });
    return { caseId, status: 'PENDING', version: version + 1 };
  });
}

export async function listSelectionReviews(actorId: string, input: SelectionPage) {
  const where = input.view === 'selected' ? "s.status='SELECTED'" :
    "(s.status in ('PENDING','NEEDS_INFO','RECHECK') or (s.status='SELECTED' and s.needs_comparison))";
  const { rows } = await getPostgresPool().query<CaseSummary & { title: string }>(
    `select ${caseSummary},v.title from novel_selection_cases s join novels v using(novel_id)
     where ${where} and v.author_id<>$1 and not exists (
       select 1 from novel_nominations n where n.case_id=s.case_id and n.nominator_id=$1)
     order by s.updated_at desc,s.case_id desc limit $2 offset $3`, [actorId, input.limit + 1, (input.page - 1) * input.limit]
  );
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

async function reviewContext(client: PoolClient, auth: AuthContext, caseId: string) {
  const { rows: [target] } = await client.query<Pick<SelectionCase, 'novel_id'>>(
    'select novel_id from novel_selection_cases where case_id=$1', [caseId]
  );
  if (!target) throw notFound();
  const novel = await lockNovel(client, target.novel_id);
  const item = await lockCase(client, novel.novel_id, caseId);
  const { rows } = await client.query<{ nominator_id: string; kind: string; reason: string }>(
    'select nominator_id,kind,reason from novel_nominations where case_id=$1 order by created_at,nomination_id', [caseId]
  );
  assertIndependentActor(auth.userId, [novel.author_id, ...rows.map((row) => row.nominator_id)]);
  return { novel, item, nominations: rows };
}

export async function getReview(auth: AuthContext, caseId: string) {
  return withPostgresTransaction(async (client) => {
    const { novel, item, nominations } = await reviewContext(client, auth, caseId);
    const { reviewed_snapshot, classified_snapshot, ...summary } = item;
    return { ...summary, title: novel.title, authorId: novel.author_id, nominations,
      allowedDecisions: Object.entries(transitions).filter(([decision, action]) =>
        (action.from as SelectionStatus[]).includes(item.status) && (decision !== 'CONFIRM_MINOR_CHANGE' || item.needs_comparison)
      ).map(([decision]) => decision),
      eligibility: await eligibility(novel.novel_id, client), baseline: snapshotSummary(reviewed_snapshot),
      classified: snapshotSummary(classified_snapshot), current: snapshotSummary(await publicSnapshot(client, novel)) };
  });
}

export async function getReviewChapter(auth: AuthContext, caseId: string, chapterId: string) {
  return withPostgresTransaction(async (client) => {
    const { novel, item } = await reviewContext(client, auth, caseId);
    const baseline = item.reviewed_snapshot?.chapters[chapterId];
    const { rows: [current] } = await client.query<{ title: string; content: string | null }>(
      `select title,content from chapters where chapter_id=$1 and novel_id=$2 and status='PUBLISHED' and deleted_at is null`,
      [chapterId, novel.novel_id]
    );
    if (!baseline && !current) throw notFound();
    const revision = baseline?.revisionId ? (await client.query<{ content: string }>(
      'select content from chapter_revisions where revision_id=$1 and chapter_id=$2', [baseline.revisionId, chapterId]
    )).rows[0] : null;
    return { baseline: baseline ? { title: baseline.title, content: revision?.content ?? baseline.content ?? null } : null,
      current: current ?? null };
  });
}

const transitions = {
  APPROVE: { from: ['PENDING', 'RECHECK'], to: 'SELECTED' },
  REQUEST_INFO: { from: ['PENDING', 'RECHECK'], to: 'NEEDS_INFO' },
  REJECT: { from: ['PENDING', 'NEEDS_INFO'], to: 'REJECTED' },
  CONFIRM_MINOR_CHANGE: { from: ['SELECTED'], to: 'SELECTED' },
  REOPEN: { from: ['SELECTED'], to: 'RECHECK' },
  REVOKE: { from: ['SELECTED', 'RECHECK'], to: 'REVOKED' }
} satisfies Record<SelectionDecision['decision'], { from: SelectionStatus[]; to: SelectionStatus }>;

export async function decide(auth: AuthContext, caseId: string, input: SelectionDecision) {
  return withPostgresTransaction(async (client) => {
    await lockActor(client, auth);
    const { novel, item } = await reviewContext(client, auth, caseId);
    checkVersion(item, input.expectedVersion);
    const { decision, reason, criteria } = input;
    const transition: { from: SelectionStatus[]; to: SelectionStatus } = transitions[decision];
    if (!transition.from.includes(item.status) || (decision === 'CONFIRM_MINOR_CHANGE' && !item.needs_comparison)) {
      throw new AppError(409, 'SELECTION_STATE', 'Quyết định này không áp dụng cho trạng thái hiện tại.');
    }
    const branch = await eligibility(novel.novel_id, client);
    if (decision === 'APPROVE') {
      if (!branch) throw new AppError(422, 'SELECTION_INELIGIBLE', 'Tác phẩm không còn đủ điều kiện tuyển chọn.');
      if (!criteria || !Object.values(criteria).every(Boolean)) {
        throw new AppError(422, 'SELECTION_CRITERIA', 'Cả bốn tiêu chí phải đạt trước khi công nhận.');
      }
      if (branch === 'SHORT_STORY' && !input.shortStoryVerified) {
        throw new AppError(422, 'SELECTION_SHORT_STORY', 'Cần xác nhận đây là truyện ngắn hoàn chỉnh.');
      }
    }
    const snapshot = await publicSnapshot(client, novel);
    const version = item.version + 1;
    const status = transition.to;
    const approving = decision === 'APPROVE';
    await client.query(`update novel_selection_cases set status=$2,version=$3,last_reason=$4,updated_at=now(),
      needs_comparison=false, terminal_at=case when $2 in ('REJECTED','REVOKED') then clock_timestamp() else null end,
      reviewed_branch=case when $5 then $6 else reviewed_branch end,
      reviewed_snapshot=case when $5 then $7::jsonb else reviewed_snapshot end,
      classified_snapshot=case when $5 or $8 then $7::jsonb else classified_snapshot end,
      criteria=coalesce($9::jsonb,criteria) where case_id=$1`,
    [caseId, status, version, reason, approving, branch, snapshot, decision === 'CONFIRM_MINOR_CHANGE', criteria ?? null]);
    await appendEvent(client, { caseId, version, actorId: auth.userId, action: decision, reason,
      evidence: { previousStatus: item.status, status, branch, shortStoryVerified: input.shortStoryVerified ?? false,
        criteria: criteria ?? null, snapshot } });
    await enqueueNotification(client, { eventKey: `novel-selection:${caseId}:${version}`, userId: novel.author_id,
      type: 'NOVEL_SELECTION', title: 'Cập nhật hồ sơ tuyển chọn', content: `${novel.title} · ${reason}`,
      payload: { href: `/author/novels/${novel.novel_id}`, caseId } });
    return { caseId, status, version };
  });
}
