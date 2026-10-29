import { FilterPresets, useUrlFilters, useListScroll, WorkspaceTable } from '../../shared/components/WorkspacePreferences';
import { WorkspacePreview } from '../../shared/components/WorkspacePreview';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { labels as filterLabels } from './AdminShared';
import { ResponsiveFilters, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Select, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getAdminList, type AdminNovel } from './admin-api';
import { AdminHeader, AdminPagination, AdminPanel, number, options, Status } from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminIcon } from './AdminShell';

export function AdminNovelsPage() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const urlFilters = useUrlFilters({ q: '', status: '', serialStatus: '', includeDeleted: false as boolean, page: 1 }, { status: ['', 'DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED'], serialStatus: ['', 'ONGOING', 'COMPLETED', 'HIATUS'] });
  const [q, setQ] = urlFilters.field('q');
  const [status, setStatus] = urlFilters.field('status');
  const [serialStatus, setSerialStatus] = urlFilters.field('serialStatus');
  const [includeDeleted, setIncludeDeleted] = urlFilters.field('includeDeleted');
  const [page, setPage] = urlFilters.field('page');
  const query = useQuery({
    queryKey: ['admin-novels', q, status, serialStatus, includeDeleted, page],
    queryFn: () =>
      getAdminList<AdminNovel>('/admin/novels', {
        q,
        status,
        serialStatus,
        includeDeleted,
        page,
        limit: 8
      })
  });
  const updated = useUpdatedItems(query.data?.items.map(item => ({ id: item.novelId, version: JSON.stringify(item) })), [q, status, includeDeleted, page].join('|'));
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title="Danh sách truyện"
        description="Quản lý tác phẩm và nội dung xuất bản trên StoryCraft."
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          Tổng số: {number(query.data?.meta.totalItems ?? 0)} tác phẩm
        </span>
      </AdminHeader>
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <TextInput
            className="admin-search"
            label="Tìm kiếm"
            placeholder="Tên truyện, giới thiệu hoặc tác giả..."
            leftSection={<AdminIcon name="search" />}
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}             label="Xuất bản"
            data={options(
              ['DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED'],
              'Tất cả trạng thái'
            )}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}             label="Tiến độ sáng tác"
            data={options(['ONGOING', 'COMPLETED', 'HIATUS'])}
            value={serialStatus}
            onChange={(v) => {
              setSerialStatus(v ?? '');
              setPage(1);
            }}
          />
          <Checkbox
            label="Hiện truyện đã gỡ"
            checked={includeDeleted}
            onChange={(e) => {
              setIncludeDeleted(e.currentTarget.checked);
              setPage(1);
            }}
          />
          <Button
            variant="subtle"
            onClick={() => {
              setQ('');
              setStatus('');
              setSerialStatus('');
              setIncludeDeleted(false);
              setPage(1);
            }}
          >
            Đặt lại
          </Button>
        </ResponsiveFilters>
        <FilterPresets name={'AdminNovelsPage'} fields={["q", "status", "serialStatus", "includeDeleted"]} />
        <ActiveFilterChips items={[
          ...(q.trim() ? [{ id: 'q', label: `Tìm: ${q.trim()}`, onRemove: () => { setQ(''); setPage(1); } }] : []),
          ...(status ? [{ id: 'status', label: filterLabels[status] || status, onRemove: () => { setStatus(''); setPage(1); } }] : []),
          ...(serialStatus ? [{ id: 'serial', label: filterLabels[serialStatus] || serialStatus, onRemove: () => { setSerialStatus(''); setPage(1); } }] : []),
          ...(includeDeleted ? [{ id: 'deleted', label: 'Hiện truyện đã gỡ', onRemove: () => { setIncludeDeleted(false); setPage(1); } }] : [])
        ]} />
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(q.trim() || status || serialStatus || includeDeleted)}>{query.isLoading && <LoadingState variant="table" label="Đang tải truyện..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không tìm thấy truyện phù hợp." />
        )}
        {!!query.data?.items.length && (
          <WorkspaceTable name="adminnovelspage" columns={['Tác phẩm', 'Tác giả', 'Xuất bản', 'Tiến độ', 'Số chương', 'Tình trạng gỡ', 'Thao tác']}>
            <table>
              <thead>
                <tr>
                  <th>Tác phẩm</th>
                  <th>Tác giả</th>
                  <th>Xuất bản</th>
                  <th>Tiến độ</th>
                  <th>Số chương</th>
                  <th>Tình trạng gỡ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((novel) => (
                  <tr key={novel.novelId} className={updated.has(novel.novelId) ? 'sc-item-updated' : undefined}>
                    <td className="admin-table-title">
                      <Link
                        className="admin-novel-title"
                        title={novel.title}
                        to={`/admin/novels/${novel.novelId}`}
                      >
                        {novel.title}
                      </Link>
                    </td>
                    <td>@{novel.authorUsername}</td>
                    <td>
                      <Status value={novel.status} />
                    </td>
                    <td>{options([novel.serialStatus])[1].label}</td>
                    <td>{number(novel.chaptersCount)}</td>
                    <td>{novel.deletedAt ? <Status value="DELETED" label="Đã gỡ" /> : 'Bình thường'}</td>
                    <td>
                      <Button variant="subtle" size="xs" onClick={() => setPreviewId(novel.novelId)}>Xem nhanh</Button>
                      <Button
                        component={Link}
                        to={`/admin/novels/${novel.novelId}`}
                        size="xs"
                        variant="light"
                      >
                        Chi tiết →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspaceTable>
        )}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </ResultsSurface>
      </AdminPanel>
      <WorkspacePreview selected={previewId} onSelect={setPreviewId} records={(query.data?.items ?? []).map(novel => ({ id: novel.novelId, title: novel.title, to: `/admin/novels/${novel.novelId}`, fields: [['Tác giả', `@${novel.authorUsername}`], ['Xuất bản', filterLabels[novel.status] || novel.status], ['Tiến độ', filterLabels[novel.serialStatus] || novel.serialStatus], ['Số chương', number(novel.chaptersCount)], ['Giới thiệu', novel.synopsis || '—']] }))} />
    </>
  );
}
