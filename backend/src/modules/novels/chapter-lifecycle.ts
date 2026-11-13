import type { RequestHandler } from 'express';
import { z } from 'zod';
import { boundedArray } from '../../core/validation/bounded-array.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import { getNovel } from './novels.service.js';
import { findChapterById } from './chapters.repository.js';
import type { AuthContext } from '../../core/security/auth-context.js';
const orderSchema = z.object({ chapterIds: boundedArray(z.string().uuid(), 10000, { min: 1 }) });
function owner(novel: { authorId: string }, auth?: AuthContext) { if (!auth || (auth.role !== 'ADMIN' && novel.authorId !== auth.userId)) throw new AppError(403, 'CONTENT_005', 'Content ownership required'); }
export const chapterLifecycleController: RequestHandler = async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.chapterId);
    const chapter = await findChapterById(id); if (!chapter) throw new AppError(404, 'CONTENT_001', 'Chapter not found');
    owner(await getNovel(chapter.novelId), req.auth);
    const action = req.method === 'DELETE' ? 'delete' : String(req.params.action);
    if (!['archive', 'restore', 'delete'].includes(action)) throw new AppError(400, 'VALIDATION_001', 'Invalid action');
    await withPostgresTransaction(async client => {
      await client.query('select novel_id from novels where novel_id = $1 for update', [chapter.novelId]);
      const current = (await client.query('select status from chapters where chapter_id = $1 and deleted_at is null for update', [id])).rows[0];
      if (!current) throw new AppError(404, 'CONTENT_001', 'Chapter not found');
      if (action === 'archive' && current.status === 'PENDING_MODERATION') throw new AppError(409, 'CONTENT_REVIEW_PENDING', 'Chương đang chờ kiểm duyệt; hãy chờ kết quả trước khi lưu trữ');
      if (action === 'restore' && current.status !== 'ARCHIVED') throw new AppError(409, 'CONTENT_004', 'Chỉ khôi phục chương đã lưu trữ');
      if (action !== 'restore') {
        const paid = await client.query('select 1 from chapter_unlocks where chapter_id = $1 limit 1', [id]);
        if (paid.rowCount) throw new AppError(409, 'CHAPTER_HAS_READERS', 'Chương đã có độc giả mở khóa, không thể gỡ quyền đọc');
      }
      await client.query("update chapter_publication_schedules set status='CANCELLED', error='Chương đã được lưu trữ hoặc xóa.', updated_at=now() where chapter_id=$1 and status='PENDING'", [id]);
      if (action === 'delete') {
        if (current.status !== 'ARCHIVED') throw new AppError(409, 'CONTENT_004', 'Lưu trữ chương trước khi xóa');
        await client.query('update chapters set deleted_at = now(), updated_at = now() where chapter_id = $1', [id]);
        await client.query('update novels set chapters_count = (select count(*) from chapters where novel_id = $1 and deleted_at is null), updated_at = now() where novel_id = $1', [chapter.novelId]);
      } else await client.query('update chapters set status = $2, updated_at = now() where chapter_id = $1', [id, action === 'restore' ? 'DRAFT' : 'ARCHIVED']);
    });
    res.json(successResponse({ chapterId: id, action }));
  } catch (error) { next(error); }
};
export const reorderChaptersController: RequestHandler = async (req, res, next) => {
  try {
    const novelId = z.string().uuid().parse(req.params.novelId); owner(await getNovel(novelId), req.auth);
    const { chapterIds } = orderSchema.parse(req.body);
    if (new Set(chapterIds).size !== chapterIds.length) throw new AppError(400, 'VALIDATION_001', 'Danh sách bị trùng chương');
    await withPostgresTransaction(async client => {
      await client.query('select novel_id from novels where novel_id = $1 for update', [novelId]);
      const rows = await client.query('select chapter_id, chapter_number, deleted_at, status, published_at, content from chapters where novel_id = $1 order by chapter_number for update', [novelId]);
      const active = rows.rows.filter(row => !row.deleted_at);
      if (active.length !== chapterIds.length || active.some(row => !chapterIds.includes(row.chapter_id))) throw new AppError(409, 'CHAPTER_ORDER_CONFLICT', 'Danh sách chương đã thay đổi, hãy tải lại');
      if (active.every((row, index) => row.chapter_id === chapterIds[index])) return;
      // Until canonical references can be migrated, only an unpublished, unanalysed
      // manuscript can be reordered. Include archived/deleted publication history.
      const dependencies = (await client.query(`select
        exists(select 1 from plot_summaries where novel_id=$1) or
        exists(select 1 from story_timeline_events where novel_id=$1) or
        exists(select 1 from chapter_revisions where novel_id=$1) or
        exists(select 1 from revision_outbox_events where novel_id=$1) as present`, [novelId])).rows[0].present;
      const brainTable = (await client.query("select to_regclass('narrative.story_brains') as name")).rows[0].name;
      const brain = brainTable && (await client.query('select 1 from narrative.story_brains where novel_id=$1 limit 1', [novelId])).rowCount;
      if (dependencies || brain || rows.rows.some(row => row.published_at || row.content !== null || (!row.deleted_at && !['DRAFT', 'REJECTED'].includes(row.status)))) {
        throw new AppError(409, 'CHAPTER_ORDER_CANONICAL', 'Chỉ đổi thứ tự bản thảo chưa phát hành, chưa lưu mốc và chưa có dữ liệu cốt truyện hoặc phân tích.');
      }
      // Deleted rows permanently reserve their number. Permute existing active
      // numbers instead of compacting gaps or increasing tombstones on each reorder.
      const numbers = active.map(row => row.chapter_number);
      const offset = Math.max(...rows.rows.map(row => row.chapter_number), 0) + 1;
      await client.query('update chapters set chapter_number = chapter_number + $2 where novel_id = $1 and deleted_at is null', [novelId, offset]);
      for (let index = 0; index < chapterIds.length; index++) await client.query('update chapters set chapter_number = $2, updated_at = now() where chapter_id = $1', [chapterIds[index], numbers[index]]);
    });
    res.json(successResponse({ chapterIds }));
  } catch (error) { next(error); }
};
