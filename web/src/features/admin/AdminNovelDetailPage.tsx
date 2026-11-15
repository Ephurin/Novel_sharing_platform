import { useState } from 'react';
import { AnimatedDisclosure } from '../../shared/components/AnimatedDisclosure';
import { Link, useParams } from 'react-router-dom';
import { Button, Select, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminNovel, removeAdminNovel, restoreAdminNovel } from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminId,
  AdminPagination,
  AdminPanel,
  dateTime,
  number,
  options,
  Status
} from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminChapterPreview } from './AdminChapterPreview';
import { AdminIcon } from './AdminShell';

export function AdminNovelDetailPage() {
  const { novelId = '' } = useParams();
  const cache = useQueryClient();
  const [action, setAction] = useState<'remove' | 'restore' | null>(null);
  const [reason, setReason] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [access, setAccess] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-novel-detail', novelId],
    queryFn: () => getAdminNovel(novelId)
  });
  const mutation = useMutation({
    mutationFn: () =>
      action === 'remove'
        ? removeAdminNovel(novelId, { reason: reason.trim() })
        : restoreAdminNovel(novelId, { reason: reason.trim() }),
    onSuccess: async () => {
      setAction(null);
      setReason('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-novel-detail', novelId] }),
        cache.invalidateQueries({ queryKey: ['admin-novels'] }),
        cache.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải chi tiết truyện..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const novel = query.data;
  if (!novel) return <EmptyState description="Không tìm thấy truyện." />;
  const chapters = novel.chapters.filter(
    (ch) =>
      (!q ||
        `${ch.chapterNumber} ${ch.title}`
          .toLocaleLowerCase('vi')
          .includes(q.toLocaleLowerCase('vi'))) &&
      (!status || ch.status === status) &&
      (!access || ch.isVip === (access === 'vip'))
  );
  const visible = chapters.slice((page - 1) * 8, page * 8);
  return (
    <>
      <Button component={Link} to="/admin/novels" variant="subtle" mb="md">
        ← Quay lại danh sách
      </Button>
      <AdminHeader
        title="Chi tiết truyện"
        description={`Cập nhật lần cuối: ${dateTime(novel.updatedAt)}`}
      />
      <AdminPanel>
        <div className="admin-novel-overview">
          <div className="admin-novel-cover">
            {novel.coverImageUrl && failedCover !== novel.coverImageUrl ? (
              <img
                src={novel.coverImageUrl}
                alt={`Ảnh bìa ${novel.title}`}
                onError={() => setFailedCover(novel.coverImageUrl!)}
              />
            ) : (
              <div>
                <AdminIcon name="menu_book" />
                <span>{novel.coverImageUrl ? 'Không tải được ảnh bìa' : 'Chưa có ảnh bìa'}</span>
              </div>
            )}
          </div>
          <div className="admin-novel-summary">
            <h2>{novel.title}</h2>
            <p className="admin-muted">@{novel.authorUsername}</p>
            <div className="admin-actions">
              <Status value={novel.status} />
              <span>{options([novel.serialStatus])[1].label}</span>
              {novel.deletedAt && <Status value="DELETED" label="Đã gỡ" />}
            </div>
            <div className="admin-novel-stats">
              <strong>{number(novel.chapters.length)} chương</strong>
              <span>{number(novel.viewsCount)} lượt đọc</span>
            </div>
            {novel.genres?.length ? (
              <p>Thể loại: {novel.genres.map((g) => g.name).join(' · ')}</p>
            ) : null}
          </div>
          <Button
            color={novel.deletedAt ? undefined : 'red'}
            className={novel.deletedAt ? undefined : 'admin-danger'}
            variant="light"
            onClick={() => {
              mutation.reset();
              setReason('');
              setAction(novel.deletedAt ? 'restore' : 'remove');
            }}
          >
            {novel.deletedAt ? 'Khôi phục truyện' : 'Gỡ truyện'}
          </Button>
        </div>
        <p className="admin-prose" id="admin-novel-synopsis">
          {expanded || novel.synopsis.length <= 320
            ? novel.synopsis
            : `${novel.synopsis.slice(0, 320)}…`}
        </p>
        {novel.synopsis.length > 320 && (
          <Button
            variant="subtle"
            aria-expanded={expanded}
            aria-controls="admin-novel-synopsis"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Thu gọn' : 'Xem thêm'}
          </Button>
        )}
        <AnimatedDisclosure className="admin-metadata" summary="Thông tin bổ sung">
          <dl>
            <dt>Mã truyện</dt>
            <dd>
              <AdminId value={novel.novelId} label="mã truyện" compact={false} />
            </dd>
            <dt>Email tác giả</dt>
            <dd>{novel.authorEmail}</dd>
          </dl>
        </AnimatedDisclosure>
      </AdminPanel>
      <AdminPanel>
        <h2>Danh sách chương</h2>
        <div className="admin-toolbar">
          <TextInput
            className="admin-search"
            label="Tìm chương"
            placeholder="Số hoặc tên chương..."
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select
            label="Trạng thái"
            data={options(['DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'ARCHIVED'])}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          <Select
            label="Quyền đọc"
            data={[
              { value: '', label: 'Tất cả' },
              { value: 'free', label: 'Miễn phí' },
              { value: 'vip', label: 'VIP' }
            ]}
            value={access}
            onChange={(v) => {
              setAccess(v ?? '');
              setPage(1);
            }}
          />
        </div>
        {!visible.length ? (
          <EmptyState description="Không có chương phù hợp." />
        ) : (
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Chương / Tiêu đề</th>
                  <th>Trạng thái</th>
                  <th>Quyền đọc</th>
                  <th>Tình trạng gỡ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ch) => (
                  <tr key={ch.chapterId}>
                    <td>
                      <strong>
                        Chương {ch.chapterNumber}: {ch.title.replace(/^Chương\s+\d+\s*:\s*/iu, '')}
                      </strong>
                      <small>{number(ch.wordCount)} từ</small>
                    </td>
                    <td>
                      <Status value={ch.status} />
                    </td>
                    <td>{ch.isVip ? `VIP · ${number(ch.priceCoins)} coin` : 'Miễn phí'}</td>
                    <td>{ch.deletedAt ? 'Đã gỡ' : 'Bình thường'}</td>
                    <td>
                      <Button variant="light" size="xs" onClick={() => setChapterId(ch.chapterId)}>
                        Xem nội dung
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          meta={{
            page,
            limit: 8,
            totalItems: chapters.length,
            totalPages: Math.ceil(chapters.length / 8)
          }}
          onChange={setPage}
        />
      </AdminPanel>
      <AdminChapterPreview chapterId={chapterId} onClose={() => setChapterId(null)} />
      <AdminConfirm
        required
        destructive={action === 'remove'}
        opened={!!action}
        title={action === 'remove' ? 'Xác nhận gỡ truyện' : 'Khôi phục truyện'}
        confirmLabel={action === 'remove' ? 'Xác nhận gỡ truyện' : 'Khôi phục'}
        reason={reason}
        setReason={setReason}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setAction(null)}
        onConfirm={() => mutation.mutate()}
      >
        <strong>{novel.title}</strong>
        <p>
          {action === 'remove'
            ? 'Ẩn truyện và quyền đọc các chương của truyện. Dữ liệu được giữ để xem xét lại; trạng thái xuất bản không đổi.'
            : 'Thu hồi hạn chế đối với truyện. Các hạn chế riêng trên chương được giữ nguyên.'}
        </p>
      </AdminConfirm>
    </>
  );
}
