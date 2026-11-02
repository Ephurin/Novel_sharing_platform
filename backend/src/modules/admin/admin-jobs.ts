import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { createNotification } from '../interactions/notifications.repository.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { assertAdminPermission, audit } from './admin-access.js';
import { AppError } from '../../core/errors/app-error.js';
import { z } from 'zod';

const maxAttempts = 6;
const retryBaseSeconds = 5;
const retryMaxSeconds = 300;
const notificationPayload = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  payload: z.record(z.unknown()).optional()
});
const commentPayload = z.object({ sanctionId: z.string().uuid() });

export async function queueAdminNotification(
  client: PoolClient,
  input: {
    userId: string;
    type: string;
    title: string;
    content: string;
    payload?: Record<string, unknown>;
  }
) {
  await client.query("insert into admin_jobs(kind,payload) values('NOTIFY',$1)", [input]);
}
// Advisory lock serializes job draining across API workers; updates are idempotent.
export async function drainAdminJobs() {
  const client = await getPostgresPool().connect();
  let locked = false;
  try {
    locked = (
      await client.query("select pg_try_advisory_lock(hashtext('storycraft-admin-jobs')) as locked")
    ).rows[0].locked;
    if (!locked) return;
    const jobs = (
      await client.query(
        "select * from admin_jobs where status='PENDING' and next_attempt_at<=now() order by next_attempt_at,job_order limit 100"
      )
    ).rows;
    for (const job of jobs) {
      try {
        if (job.kind === 'NOTIFY')
          await createNotification({
            ...notificationPayload.parse(job.payload),
            eventKey: `admin-job:${job.job_id}`
          });
        else {
          const sanction = (
            await client.query('select * from admin_sanctions where sanction_id=$1', [
              commentPayload.parse(job.payload).sanctionId
            ])
          ).rows[0];
          if (sanction) {
            const collection = getMongoDatabase().collection('comments');
            const comments = await collection
              .find({
                $or: [{ commentId: sanction.target_id }, { parentCommentId: sanction.target_id }]
              })
              .toArray();
            for (const comment of comments) {
              const active = (
                await client.query(
                  "select sanction_id from admin_sanctions where target_type='COMMENT' and target_id=any($1::text[]) and action='HIDE' and active order by created_at desc limit 1",
                  [[comment.commentId, comment.parentCommentId].filter(Boolean)]
                )
              ).rows[0];
              if (active)
                await collection.updateOne(
                  {
                    commentId: comment.commentId,
                    $or: [{ deletedAt: null }, { adminSanctionId: { $exists: true } }]
                  },
                  [
                    {
                      $set: {
                        adminPriorStatus: { $ifNull: ['$adminPriorStatus', '$status'] },
                        adminPriorDeletedAt: { $ifNull: ['$adminPriorDeletedAt', '$deletedAt'] },
                        adminSanctionId: active.sanction_id,
                        status: 'DELETED',
                        deletedAt: { $ifNull: ['$deletedAt', new Date()] },
                        updatedAt: new Date()
                      }
                    }
                  ]
                );
              else
                await collection.updateOne(
                  {
                    commentId: comment.commentId,
                    adminSanctionId: { $exists: true },
                    status: 'DELETED'
                  },
                  [
                    {
                      $set: {
                        status: { $ifNull: ['$adminPriorStatus', 'APPROVED'] },
                        deletedAt: { $ifNull: ['$adminPriorDeletedAt', null] },
                        updatedAt: new Date()
                      }
                    },
                    { $unset: ['adminPriorStatus', 'adminPriorDeletedAt', 'adminSanctionId'] }
                  ]
                );
            }
          }
        }
        await client.query(
          "update admin_jobs set status='DONE',error=null,completed_at=now(),last_attempt_at=now(),failed_at=null,attempts=attempts+1 where job_id=$1",
          [job.job_id]
        );
      } catch (error) {
        await client.query(
          `update admin_jobs set
          attempts=attempts+1,error=$2,last_attempt_at=now(),
          status=case when attempts+1 >= $3 then 'FAILED' else 'PENDING' end,
          failed_at=case when attempts+1 >= $3 then now() else null end,
          next_attempt_at=now()+make_interval(secs=>least($5::double precision,$4::double precision*power(2,least(attempts,10))))
          where job_id=$1`,
          [
            job.job_id,
            (error instanceof Error ? error.message : 'Failed').slice(0, 4000),
            maxAttempts,
            retryBaseSeconds,
            retryMaxSeconds
          ]
        );
        // Each effect is idempotent. A poison record must not block unrelated jobs.
      }
    }
  } finally {
    try {
      if (locked)
        await client.query("select pg_advisory_unlock(hashtext('storycraft-admin-jobs'))");
    } finally {
      client.release();
    }
  }
}

export async function retryAdminJob(auth: AuthContext, jobId: string) {
  return withPostgresTransaction(async (client) => {
    await assertAdminPermission(auth, 'audit', client);
    // Same lock/order as draining; never reset a job while another worker executes it.
    await client.query("select pg_advisory_xact_lock(hashtext('storycraft-admin-jobs'))");
    const before = (
      await client.query('select * from admin_jobs where job_id=$1 for update', [jobId])
    ).rows[0];
    if (!before) throw new AppError(404, 'ADMIN_JOB_NOT_FOUND', 'Không tìm thấy tác vụ.');
    if (before.status !== 'FAILED')
      throw new AppError(409, 'ADMIN_JOB_RETRY', 'Chỉ thử lại tác vụ đã dừng sau nhiều lần lỗi.');
    const after = (
      await client.query(
        "update admin_jobs set status='PENDING',attempts=0,retry_count=retry_count+1,next_attempt_at=now(),failed_at=null,completed_at=null where job_id=$1 returning *",
        [jobId]
      )
    ).rows[0];
    await audit(client, auth, {
      action: 'ADMIN_JOB_RETRIED',
      targetType: 'ADMIN_JOB',
      targetId: jobId,
      reason: 'Quản trị viên lên lịch thử lại tác vụ đã dừng.',
      before,
      after
    });
    return after;
  });
}
