import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Select, Alert } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminGet,
  adminSend,
  useAdminAccess,
  scopeLabels,
  type AuditEntry
} from './admin-operations-api';
import {
  AdminHeader,
  AdminPanel,
  AdminId,
  AdminConfirm,
  Status,
  dateTime,
  labels
} from './AdminShared';
import { AuditRows } from './AdminAuditPage';
import { LoadingState, ErrorState } from '../../shared/components/PageStates';

type UserDetail = {
  user: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    bio: string;
    role: string;
    status: string;
    admin_scope: string;
    created_at: string;
    last_login_at: string;
  };
  novels: Array<{
    novel_id: string;
    title: string;
    status: string;
    deleted_at: string;
    chapters_count: number;
  }>;
  sanctions: Array<{
    sanction_id: string;
    action: string;
    active: boolean;
    reason: string;
    target_type: string;
    created_at: string;
  }>;
  history: AuditEntry[];
};
export function AdminUserDetailPage() {
  const { userId = '' } = useParams();
  const cache = useQueryClient();
  const access = useAdminAccess();
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [role, setRole] = useState('READER');
  const [scope, setScope] = useState('MODERATOR');
  const query = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminGet<UserDetail>(`/admin/users/${userId}`)
  });
  const mutation = useMutation({
    mutationFn: () =>
      action === 'access'
        ? adminSend('patch', `/admin/users/${userId}/access`, {
            role,
            scope: role === 'ADMIN' ? scope : undefined,
            reason
          })
        : adminSend(action === 'warn' ? 'post' : 'patch', `/admin/users/${userId}/${action}`, {
            reason
          }),
    onSuccess: async () => {
      setAction('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-user', userId] }),
        cache.invalidateQueries({ queryKey: ['admin-users'] })
      ]);
    }
  });
  if (query.isLoading) return <LoadingState label="Đang tải hồ sơ..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const { user, novels, sanctions, history } = query.data;
  const open = (a: string) => {
    setReason('');
    mutation.reset();
    setRole(user.role);
    setScope(user.admin_scope || 'MODERATOR');
    setAction(a);
  };
  return (
    <>
      <Link className="admin-link" to="/admin/users">
        ← Người dùng
      </Link>
      <AdminHeader
        title={user.display_name || user.username}
        description={`@${user.username} · ${user.email}`}
        refresh={() => void query.refetch()}
      >
        <Status value={user.status} />
      </AdminHeader>
      {mutation.isSuccess && (
        <Alert color="green" mb="md" role="status">
          Đã lưu thay đổi.
        </Alert>
      )}
      <div className="admin-grid-two">
        <AdminPanel>
          <h2>Tài khoản</h2>
          <dl className="admin-definition">
            <dt>Vai trò</dt>
            <dd>
              {user.role}
              {user.admin_scope && ` · ${scopeLabels[user.admin_scope]}`}
            </dd>
            <dt>Ngày tạo</dt>
            <dd>{dateTime(user.created_at)}</dd>
            <dt>Đăng nhập gần nhất</dt>
            <dd>{dateTime(user.last_login_at)}</dd>
          </dl>
          {user.bio && <p className="admin-prose">{user.bio}</p>}
          <AdminId value={user.user_id} label="mã người dùng" />
          <div className="admin-actions">
            <Button variant="default" onClick={() => open('warn')}>
              Cảnh báo
            </Button>
            <Button
              variant="light"
              onClick={() => open(user.status === 'LOCKED' ? 'unlock' : 'lock')}
            >
              {user.status === 'LOCKED' ? 'Mở khóa' : 'Khóa tài khoản'}
            </Button>
            {access.data?.permissions.includes('access') && (
              <Button variant="default" onClick={() => open('access')}>
                Vai trò & quyền
              </Button>
            )}
          </div>
        </AdminPanel>
        <AdminPanel>
          <h2>Lịch sử vi phạm / quyết định</h2>
          {!sanctions.length && <p className="admin-muted">Chưa có quyết định quản trị.</p>}
          {sanctions.map((s) => (
            <div className="admin-case" key={s.sanction_id}>
              <strong>
                {labels[s.action] || s.action} · {labels[s.target_type] || s.target_type}
              </strong>
              <small className="admin-block">
                {dateTime(s.created_at)} · {s.active ? 'Còn hiệu lực' : 'Đã thu hồi'}
              </small>
              <p>{s.reason}</p>
            </div>
          ))}
        </AdminPanel>
      </div>
      <AdminPanel>
        <h2>Truyện của người dùng</h2>
        {!novels.length && <p className="admin-muted">Chưa có truyện.</p>}
        {novels.length >= 50 && <p className="admin-muted">50 truyện cập nhật gần nhất.</p>}
        {novels.map((n) => (
          <div className="admin-task" key={n.novel_id}>
            {access.data?.permissions.includes('content') ? (
              <Link className="admin-link" to={`/admin/novels/${n.novel_id}`}>
                {n.title}
              </Link>
            ) : (
              <strong>{n.title}</strong>
            )}
            <span>
              <Status value={n.status} /> · {n.chapters_count} chương
              {n.deleted_at ? ' · Đã ẩn' : ''}
            </span>
          </div>
        ))}
      </AdminPanel>
      <AdminPanel>
        <h2>Thao tác liên quan gần đây</h2>
        {history.length ? (
          <AuditRows items={history} />
        ) : (
          <p className="admin-muted">Chưa có nhật ký.</p>
        )}
      </AdminPanel>
      <AdminConfirm
        opened={!!action}
        title={action === 'access' ? 'Thay đổi vai trò & quyền' : 'Xác nhận xử lý tài khoản'}
        confirmLabel="Lưu thay đổi"
        reason={reason}
        setReason={setReason}
        required
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setAction('')}
        onConfirm={() => mutation.mutate()}
      >
        {action === 'access' ? (
          <>
            <Select
              label="Vai trò"
              data={['READER', 'AUTHOR', 'ADMIN']}
              value={role}
              onChange={(v) => setRole(v || 'READER')}
            />
            {role === 'ADMIN' && (
              <Select
                mt="sm"
                label="Nhóm quyền"
                data={Object.entries(scopeLabels).map(([value, label]) => ({ value, label }))}
                value={scope}
                onChange={(v) => setScope(v || 'MODERATOR')}
              />
            )}
            <p>Thay đổi áp dụng cho các yêu cầu API tiếp theo. Phiên làm mới cũ sẽ bị thu hồi.</p>
          </>
        ) : (
          <p>
            {action === 'warn'
              ? 'Gửi cảnh báo và ghi nhận lịch sử.'
              : action === 'lock'
                ? 'Hạn chế quyền truy cập cho đến khi được mở khóa.'
                : 'Khôi phục quyền truy cập theo vai trò hiện tại.'}
          </p>
        )}
      </AdminConfirm>
    </>
  );
}
