import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { slugify } from '../../core/utils/slug.js';
import {
  adminAccess,
  assertAdminPermission,
  audit,
  protectAccount,
  requireAdminPermission
} from './admin-access.js';
import { applySanction, restoreSanction } from './admin-sanctions.js';
import { drainAdminJobs, queueAdminNotification, retryAdminJob } from './admin-jobs.js';

export const adminOperationsRoutes = Router();
const uuid = (value: unknown) => z.string().uuid().parse(value);
const reasonSchema = z.string().trim().min(1).max(1000);
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
  status: z.string().optional(),
  action: z.string().optional(),
  targetId: z.string().optional()
});
const page = (items: unknown[], total: number, p: number, limit: number) => ({
  pageResult: true,
  data: items,
  meta: { page: p, limit, totalItems: total, totalPages: Math.ceil(total / limit) }
});
const http =
  (handler: (request: Request) => Promise<any>): RequestHandler =>
  async (req, res, next) => {
    try {
      const result = await handler(req);
      res.json(
        result?.pageResult ? successResponse(result.data, result.meta) : successResponse(result)
      );
    } catch (error: any) {
      if (error?.code === '23505')
        next(new AppError(409, 'ADMIN_CONFLICT', 'Tên, mã giao dịch hoặc yêu cầu đã tồn tại.'));
      else if (error?.code === '23503')
        next(new AppError(409, 'ADMIN_IN_USE', 'Dữ liệu đang được sử dụng.'));
      else next(error);
    }
  };

adminOperationsRoutes.get(
  '/access',
  http((req) => adminAccess(req.auth!))
);
adminOperationsRoutes.get(
  '/audit',
  http(async (req) => {
    const access = await adminAccess(req.auth!);
    const f = pagination.parse(req.query);
    const values = [
      access.permissions.includes('audit') ? null : req.auth!.userId,
      f.action || null,
      f.targetId || null,
      f.q ? `%${f.q}%` : null
    ];
    const where = `where ($1::uuid is null or a.actor_id=$1) and ($2::text is null or a.action=$2) and ($3::text is null or a.target_id=$3) and ($4::text is null or a.reason ilike $4 or u.username ilike $4 or a.target_id ilike $4)`;
    const count = (
      await getPostgresPool().query(
        `select count(*)::int as total from admin_audit a left join users u on u.user_id=a.actor_id ${where}`,
        values
      )
    ).rows[0].total;
    const rows = await getPostgresPool().query(
      `select a.*,u.username as actor_username from admin_audit a left join users u on u.user_id=a.actor_id ${where} order by a.created_at desc,a.audit_id limit $5 offset $6`,
      [...values, f.limit, (f.page - 1) * f.limit]
    );
    return page(rows.rows, count, f.page, f.limit);
  })
);
adminOperationsRoutes.get(
  '/jobs',
  requireAdminPermission('audit'),
  http(
    async () =>
      (
        await getPostgresPool().query(
          "select job_id,kind,status,attempts,error,created_at,next_attempt_at,last_attempt_at,failed_at,retry_count from admin_jobs where status in ('PENDING','FAILED') order by (status='FAILED') desc,job_order limit 100"
        )
      ).rows
  )
);
adminOperationsRoutes.post(
  '/jobs/:jobId/retry',
  requireAdminPermission('audit'),
  http(async (req) => {
    const result = await retryAdminJob(req.auth!, uuid(req.params.jobId));
    return { jobId: result.job_id, status: result.status };
  })
);
adminOperationsRoutes.post(
  '/jobs/retry',
  requireAdminPermission('audit'),
  http(async () => {
    await drainAdminJobs();
    return {
      pending: Number(
        (
          await getPostgresPool().query(
            "select count(*) as count from admin_jobs where status='PENDING'"
          )
        ).rows[0].count
      )
    };
  })
);

adminOperationsRoutes.get(
  '/users/:userId',
  requireAdminPermission('users'),
  http(async (req) => {
    const userId = uuid(req.params.userId);
    const user = (
      await getPostgresPool().query(
        `select u.user_id,u.username,u.email,u.role,u.status,u.created_at,u.last_login_at,p.display_name,p.bio,p.avatar_url,case when u.role='ADMIN' then a.scope end as admin_scope from users u left join user_profiles p using(user_id) left join admin_access a using(user_id) where u.user_id=$1 and u.deleted_at is null`,
        [userId]
      )
    ).rows[0];
    if (!user) throw new AppError(404, 'USER_001', 'Không tìm thấy tài khoản.');
    const novels = (
      await getPostgresPool().query(
        'select novel_id,title,status,deleted_at,chapters_count from novels where author_id=$1 order by updated_at desc limit 50',
        [userId]
      )
    ).rows;
    const sanctions = (
      await getPostgresPool().query(
        'select s.*,a.reason from admin_sanctions s join admin_audit a using(audit_id) where owner_id=$1 order by s.created_at desc limit 100',
        [userId]
      )
    ).rows;
    const history = (
      await getPostgresPool().query(
        'select a.*,u.username as actor_username from admin_audit a left join users u on a.actor_id=u.user_id where a.affected_user_id=$1 order by a.created_at desc limit 50',
        [userId]
      )
    ).rows;
    return { user, novels, sanctions, history };
  })
);
adminOperationsRoutes.patch(
  '/users/:userId/access',
  requireAdminPermission('access'),
  http(async (req) => {
    const userId = uuid(req.params.userId);
    const input = z
      .object({
        role: z.enum(['ADMIN', 'AUTHOR', 'READER']),
        scope: z.enum(['SUPER_ADMIN', 'MODERATOR', 'USER_MANAGER', 'FINANCE']).optional(),
        reason: reasonSchema
      })
      .parse(req.body);
    if (input.role === 'ADMIN' && !input.scope)
      throw new AppError(422, 'ADMIN_SCOPE', 'Chọn nhóm quyền admin.');
    return withPostgresTransaction(async (client) => {
      const before = await protectAccount(client, req.auth!, userId, 'access');
      await client.query('update users set role=$2,updated_at=now() where user_id=$1', [
        userId,
        input.role
      ]);
      if (input.role === 'ADMIN')
        await client.query(
          'insert into admin_access(user_id,scope,updated_by) values($1,$2,$3) on conflict(user_id) do update set scope=excluded.scope,updated_by=excluded.updated_by,updated_at=now()',
          [userId, input.scope, req.auth!.userId]
        );
      else await client.query('delete from admin_access where user_id=$1', [userId]);
      await client.query(
        'update refresh_tokens set revoked_at=now() where user_id=$1 and revoked_at is null',
        [userId]
      );
      await audit(client, req.auth!, {
        action: 'USER_ACCESS_CHANGED',
        targetType: 'USER',
        targetId: userId,
        affectedUserId: userId,
        reason: input.reason,
        before: { role: before.role, scope: before.admin_scope },
        after: input
      });
      return { userId, ...input };
    });
  })
);
adminOperationsRoutes.post(
  '/users/:userId/warn',
  requireAdminPermission('users'),
  http(async (req) => {
    const userId = uuid(req.params.userId);
    const input = z.object({ reason: reasonSchema }).parse(req.body);
    const result = await withPostgresTransaction((client) =>
      applySanction(client, req.auth!, {
        targetType: 'USER',
        targetId: userId,
        action: 'WARN',
        reason: input.reason
      })
    );
    await drainAdminJobs();
    return result;
  })
);

adminOperationsRoutes.get(
  '/appeals',
  http(async (req) => {
    const access = await adminAccess(req.auth!);
    const canContent = access.permissions.includes('content'),
      canUsers = access.permissions.includes('users');
    if (!canContent && !canUsers)
      throw new AppError(403, 'ADMIN_PERMISSION', 'Không có quyền xem khiếu nại.');
    const f = pagination.parse(req.query);
    const where = `where ($1::text is null or p.status=$1) and (($2::boolean and s.target_type<>'USER') or ($3::boolean and s.target_type='USER'))`;
    const args = [f.status || null, canContent, canUsers];
    const count = (
      await getPostgresPool().query(
        `select count(*)::int as total from admin_appeals p join admin_sanctions s using(audit_id) ${where}`,
        args
      )
    ).rows[0].total;
    const result = await getPostgresPool().query(
      `select p.*,u.username,s.target_type,s.target_id,s.review_id,s.action,a.reason as decision_reason,s.active from admin_appeals p join users u using(user_id) join admin_sanctions s using(audit_id) join admin_audit a using(audit_id) ${where} order by p.created_at desc,p.appeal_id limit $4 offset $5`,
      [...args, f.limit, (f.page - 1) * f.limit]
    );
    return page(result.rows, count, f.page, f.limit);
  })
);
adminOperationsRoutes.post(
  '/appeals/:appealId/resolve',
  http(async (req) => {
    const appealId = uuid(req.params.appealId);
    const input = z
      .object({ decision: z.enum(['ACCEPTED', 'REJECTED']), reason: reasonSchema })
      .parse(req.body);
    const result = await withPostgresTransaction(async (client) => {
      const row = (
        await client.query('select * from admin_appeals where appeal_id=$1 for update', [appealId])
      ).rows[0];
      if (!row) throw new AppError(404, 'APPEAL_NOT_FOUND', 'Không tìm thấy khiếu nại.');
      if (row.status !== 'OPEN')
        throw new AppError(409, 'APPEAL_RESOLVED', 'Khiếu nại đã được xử lý.');
      const sanction = (
        await client.query('select * from admin_sanctions where audit_id=$1', [row.audit_id])
      ).rows[0];
      await assertAdminPermission(
        req.auth!,
        sanction.target_type === 'USER' ? 'users' : 'content',
        client
      );
      if (input.decision === 'ACCEPTED') {
        if (sanction.target_type === 'USER')
          await protectAccount(client, req.auth!, sanction.target_id, 'users');
        await restoreSanction(client, req.auth!, sanction, input.reason);
      }
      await client.query(
        'update admin_appeals set status=$2,resolution=$3,reviewed_by=$4,reviewed_at=now() where appeal_id=$1',
        [appealId, input.decision, input.reason, req.auth!.userId]
      );
      await audit(client, req.auth!, {
        action: `APPEAL_${input.decision}`,
        targetType: 'APPEAL',
        targetId: appealId,
        affectedUserId: row.user_id,
        reason: input.reason,
        before: row,
        after: { status: input.decision }
      });
      await queueAdminNotification(client, {
        userId: row.user_id,
        type: 'APPEAL_RESOLVED',
        title: 'Khiếu nại đã được xử lý',
        content: input.reason,
        payload: { appealId, decision: input.decision }
      });
      return { appealId, status: input.decision };
    });
    await drainAdminJobs();
    return result;
  })
);

adminOperationsRoutes.get(
  '/withdraw-requests/:requestId/reconciliation',
  requireAdminPermission('finance'),
  http(async (req) => {
    const requestId = uuid(req.params.requestId);
    const request = (
      await getPostgresPool().query(
        'select wr.*,u.username from withdraw_requests wr join wallets w using(wallet_id) join users u using(user_id) where withdraw_request_id=$1',
        [requestId]
      )
    ).rows[0];
    if (!request) throw new AppError(404, 'WITHDRAW_NOT_FOUND', 'Không tìm thấy yêu cầu.');
    const state = (
      await getPostgresPool().query(
        'select * from withdraw_reconciliation where withdraw_request_id=$1',
        [requestId]
      )
    ).rows[0] ?? { withdraw_request_id: requestId, status: 'UNCONFIRMED', version: 0 };
    const history = (
      await getPostgresPool().query(
        'select h.*,u.username as actor_username from withdraw_reconciliation_history h join users u on u.user_id=h.actor_id where withdraw_request_id=$1 order by created_at desc',
        [requestId]
      )
    ).rows;
    return { request, state, history };
  })
);
adminOperationsRoutes.post(
  '/withdraw-requests/:requestId/reconciliation',
  requireAdminPermission('finance'),
  http(async (req) => {
    const requestId = uuid(req.params.requestId);
    const input = z
      .object({
        status: z.enum(['PROCESSING', 'PAID', 'FAILED']),
        version: z.number().int().nonnegative(),
        reference: z.string().trim().max(200).optional(),
        evidenceUrl: z
          .string()
          .url()
          .max(2000)
          .refine((v) => /^https?:\/\//i.test(v))
          .optional(),
        note: reasonSchema
      })
      .parse(req.body);
    if (input.status === 'PAID' && !input.reference)
      throw new AppError(
        422,
        'PAYOUT_REFERENCE',
        'Cần mã giao dịch ngân hàng để xác nhận đã thanh toán.'
      );
    return withPostgresTransaction(async (client) => {
      await assertAdminPermission(req.auth!, 'finance', client);
      const request = (
        await client.query(
          'select * from withdraw_requests where withdraw_request_id=$1 for update',
          [requestId]
        )
      ).rows[0];
      if (!request) throw new AppError(404, 'WITHDRAW_NOT_FOUND', 'Không tìm thấy yêu cầu.');
      if (request.status !== 'SUCCESS')
        throw new AppError(409, 'PAYOUT_NOT_APPROVED', 'Chỉ đối soát yêu cầu đã được duyệt.');
      const before = (
        await client.query(
          'select * from withdraw_reconciliation where withdraw_request_id=$1 for update',
          [requestId]
        )
      ).rows[0] ?? { status: 'UNCONFIRMED', version: 0 };
      if (before.version !== input.version)
        throw new AppError(
          409,
          'PAYOUT_STALE',
          'Dữ liệu đã thay đổi. Hãy tải lại trước khi đối soát.'
        );
      const allowed: Record<string, string[]> = {
        UNCONFIRMED: ['PROCESSING', 'PAID'],
        PROCESSING: ['PAID', 'FAILED'],
        FAILED: ['PROCESSING'],
        PAID: []
      };
      if (!allowed[before.status].includes(input.status))
        throw new AppError(409, 'PAYOUT_TRANSITION', 'Không thể chuyển trạng thái đối soát này.');
      const after = (
        await client.query(
          `insert into withdraw_reconciliation(withdraw_request_id,status,reference,evidence_url,note,version,updated_by) values($1,$2,$3,$4,$5,$6,$7) on conflict(withdraw_request_id) do update set status=excluded.status,reference=excluded.reference,evidence_url=excluded.evidence_url,note=excluded.note,version=excluded.version,updated_by=excluded.updated_by,updated_at=now() returning *`,
          [
            requestId,
            input.status,
            input.reference ?? null,
            input.evidenceUrl ?? null,
            input.note,
            input.version + 1,
            req.auth!.userId
          ]
        )
      ).rows[0];
      await client.query(
        'insert into withdraw_reconciliation_history(withdraw_request_id,actor_id,before_state,after_state) values($1,$2,$3,$4)',
        [requestId, req.auth!.userId, before, after]
      );
      await audit(client, req.auth!, {
        action: 'WITHDRAW_RECONCILED',
        targetType: 'WITHDRAW',
        targetId: requestId,
        reason: input.note,
        before,
        after
      });
      return after;
    });
  })
);

const taxonomyParams = z.object({ kind: z.enum(['genres', 'tags']), itemId: z.string().uuid() });
adminOperationsRoutes.patch(
  '/taxonomy/:kind/:itemId',
  requireAdminPermission('content'),
  http(async (req) => {
    const { kind, itemId } = taxonomyParams.parse(req.params);
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(1000).optional(),
        reason: reasonSchema
      })
      .parse(req.body);
    const slug = slugify(input.name);
    if (!slug) throw new AppError(422, 'TAXONOMY_NAME', 'Tên phải chứa chữ hoặc số.');
    return withPostgresTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('admin-taxonomy'))");
      const key = kind === 'genres' ? 'genre_id' : 'tag_id';
      const before = (
        await client.query(`select * from ${kind} where ${key}=$1 for update`, [itemId])
      ).rows[0];
      if (!before) throw new AppError(404, 'TAXONOMY_NOT_FOUND', 'Không tìm thấy danh mục.');
      const after = (
        await client.query(
          `update ${kind} set name=$2,slug=$3 ${kind === 'genres' ? ',description=$4' : ''} where ${key}=$1 returning *`,
          kind === 'genres'
            ? [itemId, input.name, slug, input.description ?? null]
            : [itemId, input.name, slug]
        )
      ).rows[0];
      await audit(client, req.auth!, {
        action: 'TAXONOMY_UPDATED',
        targetType: kind,
        targetId: itemId,
        reason: input.reason,
        before,
        after
      });
      return after;
    });
  })
);
adminOperationsRoutes.post(
  '/taxonomy/:kind/:itemId/merge',
  requireAdminPermission('content'),
  http(async (req) => {
    const { kind, itemId } = taxonomyParams.parse(req.params);
    const input = z
      .object({ targetId: z.string().uuid(), confirm: z.literal(true), reason: reasonSchema })
      .parse(req.body);
    if (itemId === input.targetId)
      throw new AppError(422, 'TAXONOMY_SAME', 'Chọn danh mục đích khác danh mục nguồn.');
    return withPostgresTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('admin-taxonomy'))");
      const key = kind === 'genres' ? 'genre_id' : 'tag_id';
      const rows = (
        await client.query(
          `select * from ${kind} where ${key}=any($1::uuid[]) order by ${key} for update`,
          [[itemId, input.targetId]]
        )
      ).rows;
      if (rows.length !== 2)
        throw new AppError(404, 'TAXONOMY_NOT_FOUND', 'Không tìm thấy danh mục nguồn hoặc đích.');
      const join = kind === 'genres' ? 'novel_genres' : 'novel_tags';
      await client.query(
        `insert into ${join}(novel_id,${key}) select novel_id,$2 from ${join} where ${key}=$1 on conflict do nothing`,
        [itemId, input.targetId]
      );
      await client.query(`delete from ${join} where ${key}=$1`, [itemId]);
      if (kind === 'genres') {
        await client.query(
          'insert into novel_genres(novel_id,genre_id) select novel_id,$2 from novels where genre_id=$1 on conflict do nothing',
          [itemId, input.targetId]
        );
        await client.query('update novels set genre_id=$2,updated_at=now() where genre_id=$1', [
          itemId,
          input.targetId
        ]);
      }
      const used =
        kind === 'genres'
          ? (
              await client.query(
                'select 1 from novels where genre_id=$1 union select 1 from novel_genres where genre_id=$1 limit 1',
                [itemId]
              )
            ).rowCount
          : (await client.query('select 1 from novel_tags where tag_id=$1 limit 1', [itemId]))
              .rowCount;
      if (used) throw new AppError(409, 'ADMIN_IN_USE', 'Taxonomy is in use. Merge it instead.');
      await client.query(`delete from ${kind} where ${key}=$1`, [itemId]);
      await audit(client, req.auth!, {
        action: 'TAXONOMY_MERGED',
        targetType: kind,
        targetId: itemId,
        reason: input.reason,
        before: rows,
        after: { targetId: input.targetId }
      });
      return { targetId: input.targetId };
    });
  })
);
adminOperationsRoutes.delete(
  '/taxonomy/:kind/:itemId',
  requireAdminPermission('content'),
  http(async (req) => {
    const { kind, itemId } = taxonomyParams.parse(req.params);
    const input = z.object({ confirm: z.literal(true), reason: reasonSchema }).parse(req.body);
    return withPostgresTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('admin-taxonomy'))");
      const key = kind === 'genres' ? 'genre_id' : 'tag_id';
      const before = (
        await client.query(`select * from ${kind} where ${key}=$1 for update`, [itemId])
      ).rows[0];
      if (!before) throw new AppError(404, 'TAXONOMY_NOT_FOUND', 'Không tìm thấy danh mục.');
      const used =
        kind === 'genres'
          ? (
              await client.query(
                'select 1 from novels where genre_id=$1 union select 1 from novel_genres where genre_id=$1 limit 1',
                [itemId]
              )
            ).rowCount
          : (await client.query('select 1 from novel_tags where tag_id=$1 limit 1', [itemId]))
              .rowCount;
      if (used) throw new AppError(409, 'ADMIN_IN_USE', 'Taxonomy is in use. Merge it instead.');
      await client.query(`delete from ${kind} where ${key}=$1`, [itemId]);
      await audit(client, req.auth!, {
        action: 'TAXONOMY_DELETED',
        targetType: kind,
        targetId: itemId,
        reason: input.reason,
        before
      });
      return { deleted: true };
    });
  })
);
