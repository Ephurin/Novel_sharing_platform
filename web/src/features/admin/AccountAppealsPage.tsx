import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, PasswordInput, TextInput, Textarea } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthorTheme } from '../../shared/components/AuthorTheme';
import { ThemeControl } from '../../shared/components/ThemeControl';
import { apiClient } from '../../shared/api/api-client';
import {
  AdminHeader,
  AdminPanel,
  AdminConfirm,
  AdminError,
  AdminId,
  Status,
  dateTime,
  labels
} from './AdminShared';
import { EmptyState, LoadingState, ErrorState } from '../../shared/components/PageStates';
import './admin.css';

type Decision = {
  audit_id: string;
  target_type: string;
  target_id: string;
  action: string;
  active: boolean;
  reason: string;
  created_at: string;
  appeal_id?: string;
  appeal_status?: string;
  message?: string;
  resolution?: string;
};
async function accountApi<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiClient.defaults.baseURL}/account${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Không thể thực hiện yêu cầu.');
  return result.data;
}
export function AccountAppealsPage() {
  const [token, setToken] = useState(
    () =>
      sessionStorage.getItem('storycraft_appeal_token') ||
      localStorage.getItem('ephurin_access_token') ||
      ''
  );
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<Decision | null>(null);
  const [message, setMessage] = useState('');
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['account-decisions', token],
    queryFn: () => accountApi<Decision[]>('/decisions', token),
    enabled: !!token,
    retry: false
  });
  const login = useMutation({
    mutationFn: () =>
      accountApi<{ token: string }>('/appeal-session', '', { identifier, password }),
    onSuccess: (session) => {
      sessionStorage.setItem('storycraft_appeal_token', session.token);
      setToken(session.token);
      setPassword('');
    }
  });
  const appeal = useMutation({
    mutationFn: () => accountApi('/appeals', token, { auditId: selected!.audit_id, message }),
    onSuccess: async () => {
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ['account-decisions'] });
    }
  });
  return (
    <AuthorTheme>
      <div className="admin-shell admin-appeal-portal">
        <div className="admin-actions">
          <Button component={Link} to="/" variant="subtle">
            ← StoryCraft
          </Button>
          <ThemeControl />
          {token && (
            <Button
              variant="default"
              onClick={() => {
                sessionStorage.removeItem('storycraft_appeal_token');
                setToken('');
                cache.removeQueries({ queryKey: ['account-decisions'] });
              }}
            >
              Đổi tài khoản
            </Button>
          )}
        </div>
        <AdminHeader
          title="Quyết định & khiếu nại"
          description="Xem lý do xử lý và gửi đề nghị xem xét lại. Tài khoản bị khóa vẫn có thể truy cập trang này."
        />
        {!token ? (
          <AdminPanel>
            <form
              className="admin-form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate();
              }}
            >
              <TextInput
                label="Email hoặc tên đăng nhập"
                value={identifier}
                required
                onChange={(e) => setIdentifier(e.currentTarget.value)}
              />
              <PasswordInput
                label="Mật khẩu"
                required
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
              <AdminError error={login.error} />
              <Button type="submit" loading={login.isPending}>
                Đăng nhập để khiếu nại
              </Button>
            </form>
            <p className="admin-muted">
              Phiên này chỉ dùng để xem quyết định và khiếu nại, hết hạn sau 15 phút.
            </p>
          </AdminPanel>
        ) : (
          <>
            {query.isLoading && <LoadingState label="Đang tải quyết định..." />}
            {query.isError && (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            )}
            {appeal.isSuccess && (
              <Alert color="green" role="status" mb="md">
                Đã gửi khiếu nại để Admin xem xét.
              </Alert>
            )}
            {query.data && !query.data.length && (
              <EmptyState description="Bạn chưa có quyết định quản trị." />
            )}
            {query.data?.map((item) => (
              <AdminPanel key={item.audit_id}>
                <div className="admin-page-header">
                  <h2>
                    {labels[item.action] || item.action} ·{' '}
                    {labels[item.target_type] || item.target_type}
                  </h2>
                  <span>{item.active ? 'Còn hiệu lực' : 'Đã thu hồi'}</span>
                </div>
                <p className="admin-muted">{dateTime(item.created_at)}</p>
                <p className="admin-prose">{item.reason}</p>
                <AdminId value={item.target_id} label="mã đối tượng" />
                {item.appeal_id ? (
                  <>
                    <p>
                      Khiếu nại: <Status value={item.appeal_status || 'OPEN'} />
                    </p>
                    <p className="admin-prose">{item.message}</p>
                    {item.resolution && <p>Kết quả: {item.resolution}</p>}
                  </>
                ) : (
                  item.active && (
                    <Button
                      mt="md"
                      variant="default"
                      onClick={() => {
                        appeal.reset();
                        setMessage('');
                        setSelected(item);
                      }}
                    >
                      Gửi khiếu nại
                    </Button>
                  )
                )}
              </AdminPanel>
            ))}
          </>
        )}
        <AdminConfirm
          opened={!!selected}
          title="Gửi khiếu nại"
          confirmLabel="Gửi để xem xét"
          disabled={message.trim().length < 10}
          pending={appeal.isPending}
          error={appeal.error}
          onClose={() => setSelected(null)}
          onConfirm={() => {
            if (message.trim().length >= 10) appeal.mutate();
          }}
        >
          <p>{selected?.reason}</p>
          <Textarea
            label="Nội dung khiếu nại"
            description="Tối thiểu 10 ký tự. Trình bày lý do và bằng chứng liên quan."
            minRows={5}
            minLength={10}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
          />
          {message.length > 0 && message.trim().length < 10 && (
            <p role="status">Vui lòng nhập ít nhất 10 ký tự.</p>
          )}
        </AdminConfirm>
      </div>
    </AuthorTheme>
  );
}
