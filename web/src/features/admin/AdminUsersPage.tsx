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
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { AdminIcon } from './AdminShell';

export function AdminUsersPage() {
  const cache = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
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
      user.status === 'LOCKED' ? unlockUser(user.userId) : lockUser(user.userId),
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
        <div className="admin-toolbar">
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
          <Select
            label="Trạng thái"
            data={options(['ACTIVE', 'LOCKED'], 'Tất cả trạng thái')}
            value={status}
            onChange={(v) => {
              setStatus(v ?? '');
              setPage(1);
            }}
          />
          <Select
            label="Vai trò"
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
        </div>
        {query.isLoading && <LoadingState label="Đang tải người dùng..." />}
        {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && !query.data.items.length && (
          <EmptyState description="Không tìm thấy người dùng phù hợp." />
        )}
        {!!query.data?.items.length && (
          <div className="admin-table-scroll">
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
                  <tr key={user.userId}>
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
                          <strong>{user.displayName || user.username}</strong>
                          <small>@{user.username}</small>
                        </div>
                      </div>
                    </td>
                    <td>{user.role}</td>
                    <td>
                      <Status value={user.status} />
                    </td>
                    <td>
                      <Button
                        variant="light"
                        color={user.status === 'LOCKED' ? undefined : 'red'}
                        className={user.status === 'LOCKED' ? undefined : 'admin-danger'}
                        size="xs"
                        leftSection={
                          <AdminIcon name={user.status === 'LOCKED' ? 'lock_open' : 'lock'} />
                        }
                        onClick={() => {
                          mutation.reset();
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
          </div>
        )}
        <AdminPagination meta={query.data?.meta} onChange={setPage} />
      </AdminPanel>
      <AdminConfirm
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
