import type { RequestHandler } from 'express';
import { z } from 'zod';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';
import { successResponse } from '../../core/response/response.js';
import { findDraftChapterByChapterId } from './draft-chapters.repository.js';
import { submitChapterPublish } from './chapters.service.js';
import { enqueueNotification } from '../interactions/notification-events.js';

const scheduleBody = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
  expectedVersion: z.number().int().nonnegative()
});

export const chapterScheduleController: RequestHandler = async (request, response, next) => {
  try {
    const chapterId = z.string().uuid().parse(request.params.chapterId);
    const auth = request.auth!;
    const result = await withPostgresTransaction(async client => {
      const chapter = (await client.query(`select c.*,n.author_id,n.status as novel_status from chapters c
        join novels n on n.novel_id=c.novel_id where c.chapter_id=$1 and c.deleted_at is null and n.deleted_at is null for update of c`, [chapterId])).rows[0];
      if (!chapter) throw new AppError(404, 'CONTENT_001', 'Không tìm thấy chương');
      if (auth.role !== 'ADMIN' && auth.userId !== chapter.author_id) throw new AppError(403, 'CONTENT_005', 'Chỉ tác giả của tác phẩm được đặt lịch');
      if (request.method === 'DELETE') {
        const cancelled = await client.query(`update chapter_publication_schedules set status='CANCELLED',error=null,updated_at=now()
          where chapter_id=$1 and status='PENDING' returning scheduled_at`, [chapterId]);
        if (!cancelled.rowCount) throw new AppError(409, 'SCHEDULE_STATE', 'Lịch không còn chờ đăng');
        return { chapterId, status: 'CANCELLED' };
      }
      const input = scheduleBody.parse(request.body);
      if (Date.parse(input.scheduledAt) <= Date.now()) throw new AppError(400, 'SCHEDULE_DATE', 'Chọn thời gian trong tương lai');
      if (chapter.novel_status !== 'PUBLISHED') throw new AppError(409, 'SCHEDULE_NOVEL', 'Phát hành tác phẩm trước khi lên lịch chương');
      if (!['DRAFT','REJECTED'].includes(chapter.status)) throw new AppError(409, 'SCHEDULE_STATE', 'Chỉ đặt lịch cho chương nháp hoặc bị từ chối');
      const draft = await findDraftChapterByChapterId(chapterId);
      if (!draft || draft.version !== input.expectedVersion) throw new AppError(409, 'DRAFT_CONFLICT', 'Bản nháp đã thay đổi, hãy tải lại');
      if (!draft.content.trim()) throw new AppError(400, 'SCHEDULE_EMPTY', 'Chương chưa có nội dung');
      await client.query(`insert into chapter_publication_schedules(chapter_id,scheduled_at,draft_version,status)
        values($1,$2,$3,'PENDING') on conflict(chapter_id) do update set schedule_id=gen_random_uuid(),
        scheduled_at=excluded.scheduled_at,draft_version=excluded.draft_version,status='PENDING',error=null,
        moderation_review_id=null,created_at=now(),updated_at=now()`, [chapterId,input.scheduledAt,draft.version]);
      return { chapterId, status: 'PENDING', scheduledAt: input.scheduledAt };
    });
    response.json(successResponse(result));
  } catch (error) { next(error); }
};

let processing = false;
export async function publishDueChapters() {
  if (processing) return;
  processing = true;
  try {
    // Separate transactions let multiple instances cooperate without publishing the same job twice.
    for (let index = 0; index < 20; index++) {
      const processed = await withPostgresTransaction(async client => {
        const schedule = (await client.query(`select s.*,c.novel_id,c.status as chapter_status,c.deleted_at,
          n.author_id,n.status as novel_status,n.deleted_at as novel_deleted,u.role,u.status as user_status
          from chapter_publication_schedules s join chapters c on c.chapter_id=s.chapter_id
          join novels n on n.novel_id=c.novel_id join users u on u.user_id=n.author_id
          where s.status='PENDING' and s.scheduled_at<=now() order by s.scheduled_at
          limit 1 for update of c,s skip locked`)).rows[0];
        if (!schedule) return false;
        let status: string, error: string | null = null, reviewId: string | null = null;
        try {
          if (schedule.deleted_at || schedule.novel_deleted || schedule.user_status !== 'ACTIVE' || !['AUTHOR','ADMIN'].includes(schedule.role)) throw new AppError(409, 'SCHEDULE_ACCOUNT', 'Tác giả hoặc nội dung không còn hoạt động');
          if (schedule.novel_status !== 'PUBLISHED' || !['DRAFT','REJECTED'].includes(schedule.chapter_status)) throw new AppError(409, 'SCHEDULE_STATE', 'Trạng thái tác phẩm hoặc chương đã thay đổi');
          const draft = await findDraftChapterByChapterId(schedule.chapter_id);
          if (!draft || draft.version !== schedule.draft_version) throw new AppError(409, 'DRAFT_CONFLICT', 'Bản thảo đã thay đổi; hãy đặt lịch lại');
          const published = await submitChapterPublish({ userId: schedule.author_id, role: schedule.role }, schedule.chapter_id, client);
          status = published.moderationRequired ? 'PENDING_MODERATION' : 'PUBLISHED';
          reviewId = published.moderationReviewId;
        } catch (cause) {
          if (!(cause instanceof AppError)) throw cause;
          status = 'FAILED'; error = cause.message;
        }
        await client.query(`update chapter_publication_schedules set status=$2,error=$3,moderation_review_id=$4,updated_at=now() where chapter_id=$1`, [schedule.chapter_id,status,error,reviewId]);
        await enqueueNotification(client, {
          eventKey: 'schedule:' + schedule.schedule_id, userId: schedule.author_id, type: 'CHAPTER_SCHEDULE',
          title: status === 'PUBLISHED' ? 'Chương đã đăng theo lịch' : status === 'PENDING_MODERATION' ? 'Chương theo lịch đang chờ duyệt' : 'Chương chưa thể đăng theo lịch',
          content: error ?? 'Mở tác phẩm để xem trạng thái chương.', payload: { href: '/author/novels/' + schedule.novel_id }
        });
        return true;
      });
      if (!processed) break;
    }
  } catch (error) { logger.error({ err: error }, 'Scheduled publication will retry'); }
  finally { processing = false; }
}
