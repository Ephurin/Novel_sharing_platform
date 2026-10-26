import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Select, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getAdminList, type AdminNovel } from './admin-api';
import { AdminHeader, AdminPagination, AdminPanel, number, options, Status } from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminIcon } from './AdminShell';

export function AdminNovelsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [serialStatus, setSerialStatus] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
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
        <div className="admin-toolbar">
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
          <Select
            label="Xuất bản"
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
          <Select
            label="Tiến độ sáng tác"
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
        </div>
        {query.isLoading && <LoadingState label="Đang tải truyện..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không tìm thấy truyện phù hợp." />
        )}
        {!!query.data?.items.length && (
          <div className="admin-table-scroll">
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
                  <tr key={novel.novelId}>
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
                    <td>{novel.deletedAt ? <Status value="DELETED" /> : 'Bình thường'}</td>
                    <td>
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
          </div>
        )}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </AdminPanel>
    </>
  );
}
