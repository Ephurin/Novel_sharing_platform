import { FilterPresets, useUrlFilters, useListScroll, WorkspaceTable } from '../../shared/components/WorkspacePreferences';
import { WorkspacePreview } from '../../shared/components/WorkspacePreview';
import { ActiveFilterChips, AnimatedEmptyState as EmptyState, ResultsSurface } from '../../shared/components/AuthorAdminMotion';
import { labels as filterLabels } from './AdminShared';
import { ResponsiveFilters, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { useState } from 'react';
import { Button, Select, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminList, lockUser, unlockUser, type AdminUser } from './admin-api';
import {
  AdminConfirm,
  AdminHeader,
  AdminPagination,
  AdminPanel,
  number,
  options,
  Status
} from './AdminShared';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminIcon } from './AdminShell';

export function AdminUsersPage() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const cache = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [reason, setReason] = useState('');
  const urlFilters = useUrlFilters({ q: '', role: '', status: '', page: 1 }, { role: ['', 'ADMIN', 'AUTHOR', 'READER'], status: ['', 'ACTIVE', 'LOCKED'] });
  const [q, setQ] = urlFilters.field('q');
  const [role, setRole] = urlFilters.field('role');
  const [status, setStatus] = urlFilters.field('status');
  const [page, setPage] = urlFilters.field('page');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const query = useQuery({
    queryKey: ['admin-users', q, role, status, page],
    queryFn: () =>
      getAdminList<AdminUser>('/admin/users', {
        q,
        role,
        status,
        page,
        limit: 8
      })
  });
  const mutation = useMutation({
    mutationFn: (user: AdminUser) =>
      user.status === 'LOCKED' ? unlockUser(user.userId, reason) : lockUser(user.userId, reason),
    onSuccess: async () => {
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });
  const reset = () => {
    setQ('');
    setRole('');
    setStatus('');
    setPage(1);
  };
  const updated = useUpdatedItems(query.data?.items.map(item => ({ id: item.userId, version: JSON.stringify(item) })), [q, role, status, page].join('|'));
  useListScroll(!query.isPending);
  return (
    <>
      <AdminHeader
        title="Quản lý người dùng"
        description="Quản lý tài khoản và trạng thái người dùng trong hệ thống StoryCraft"
        refresh={() => void query.refetch()}
      >
        <span className="admin-muted">
          Tổng số: {number(query.data?.meta.totalItems ?? 0)} tài khoản
        </span>
      </AdminHeader>
      <AdminPanel>
        <ResponsiveFilters className="admin-toolbar">
          <TextInput
            className="admin-search"
            label="Tìm kiếm"
            placeholder="Username, tên hiển thị hoặc email..."
            leftSection={<AdminIcon name="search" />}
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}             label="Trạng thái"
            data={options(['ACTIVE', 'LOCKED'], 'Tất cả trạng thái')}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          <Select comboboxProps={{ withinPortal: false }}             label="Vai trò"
            data={options(['ADMIN', 'AUTHOR', 'READER'], 'Tất cả vai trò')}
            value={role}
            onChange={(v) => {
              setRole(v ?? '');
              setPage(1);
            }}
          />
          <Button variant="subtle" onClick={reset}>
            Đặt lại
          </Button>
        </ResponsiveFilters>
        <FilterPresets name={'AdminUsersPage'} fields={["q", "role", "status"]} />
        <ActiveFilterChips items={[
          ...(q.trim() ? [{ id: 'q', label: `Tìm: ${q.trim()}`, onRemove: () => { setQ(''); setPage(1); } }] : []),
          ...(role ? [{ id: 'role', label: role === 'ADMIN' ? 'Quản trị viên' : role === 'AUTHOR' ? 'Tác giả' : 'Độc giả', onRemove: () => { setRole(''); setPage(1); } }] : []),
          ...(status ? [{ id: 'status', label: filterLabels[status] || status, onRemove: () => { setStatus(''); setPage(1); } }] : [])
        ]} />
        <ResultsSurface identity={String(query.dataUpdatedAt)} busy={query.isFetching} retain={Boolean(q.trim() || role || status)}>{query.isLoading && <LoadingState variant="table" label="Đang tải người dùng..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không tìm thấy người dùng phù hợp." />
        )}
        {!!query.data?.items.length && (
          <WorkspaceTable name="adminuserspage" columns={['Người dùng', 'Vai trò', 'Trạng thái', 'Thao tác']}>
            <table>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((user) => (
                  <tr key={user.userId} className={updated.has(user.userId) ? 'sc-item-updated' : undefined}>
                    <td>
                      <div className="admin-person">
                        <span className="admin-avatar">
                          {(user.displayName || user.username)
                            .split(' ')
                            .slice(-2)
                            .map((word) => word[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                        <div>
                          <Link className="admin-link" to={`/admin/users/${user.userId}`}>
                            <strong>{user.displayName || user.username}</strong>
                          </Link>
                          <small>@{user.username}</small>
                        </div>
                      </div>
                    </td>
                    <td>{user.role}</td>
                    <td>
                      <Status value={user.status} />
                    </td>
                    <td>
                      <Button variant="subtle" size="xs" onClick={() => setPreviewId(user.userId)}>Xem nhanh</Button>
                      <Button
                        disabled={user.userId === currentUser?.userId || user.status === 'DELETED'}
                        variant="light"
                        color={user.status === 'LOCKED' ? undefined : 'red'}
                        className={user.status === 'LOCKED' ? undefined : 'admin-danger'}
                        size="xs"
                        leftSection={
                          <AdminIcon name={user.status === 'LOCKED' ? 'lock_open' : 'lock'} />
                        }
                        onClick={() => {
                          mutation.reset();
                          setReason('');
                          setSelected(user);
                        }}
                      >
                        {user.status === 'LOCKED' ? 'Mở khóa' : 'Khóa tài khoản'}
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
      <WorkspacePreview selected={previewId} onSelect={setPreviewId} records={(query.data?.items ?? []).map(user => ({ id: user.userId, title: user.displayName || user.username, to: `/admin/users/${user.userId}`, fields: [['Tài khoản', `@${user.username}`], ['Email', user.email], ['Vai trò', user.role === 'ADMIN' ? 'Quản trị viên' : user.role === 'AUTHOR' ? 'Tác giả' : 'Độc giả'], ['Trạng thái', filterLabels[user.status] || user.status]] }))} />
      <AdminConfirm
        reason={reason}
        setReason={setReason}
        required
        destructive={selected?.status !== 'LOCKED'}
        opened={!!selected}
        title={selected?.status === 'LOCKED' ? 'Xác nhận mở khóa' : 'Xác nhận khóa tài khoản'}
        confirmLabel={selected?.status === 'LOCKED' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setSelected(null)}
        onConfirm={() => selected && mutation.mutate(selected)}
      >
        <strong>@{selected?.username}</strong>
        <p>
          {selected?.status === 'LOCKED'
            ? 'Khôi phục quyền truy cập theo vai trò đã cấp.'
            : 'Tài khoản sẽ bị hạn chế truy cập các chức năng được bảo vệ cho đến khi được mở khóa.'}
        </p>
      </AdminConfirm>
    </>
  );
}
