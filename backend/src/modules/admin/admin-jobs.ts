import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
import { getMongoDatabase } from '../../core/database/mongo.js';
import { createNotification } from '../interactions/notifications.repository.js';

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
        "select * from admin_jobs where status='PENDING' order by job_order limit 100"
      )
    ).rows;
    for (const job of jobs) {
      try {
        if (job.kind === 'NOTIFY')
          await createNotification({ ...job.payload, eventKey: `admin-job:${job.job_id}` });
        else {
          const sanction = (
            await client.query('select * from admin_sanctions where sanction_id=$1', [
              job.payload.sanctionId
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
          "update admin_jobs set status='DONE',error=null,completed_at=now(),attempts=attempts+1 where job_id=$1",
          [job.job_id]
        );
      } catch (error) {
        await client.query('update admin_jobs set attempts=attempts+1,error=$2 where job_id=$1', [
          job.job_id,
          error instanceof Error ? error.message : 'Failed'
        ]);
        break;
      }
    }
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtext('storycraft-admin-jobs'))");
    client.release();
  }
}
