import { Alert, Button, Group, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { login, register } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { getApiErrorMessage } from '../api/api-client';
import { useStoryCraftAutoAnimate } from '../hooks/useStoryCraftAutoAnimate';
import { AuthorTheme } from './AuthorTheme';
import { ThemeControl } from './ThemeControl';

export function AuthLanding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const tabGroupId = useId();
  const fieldsRef = useStoryCraftAutoAnimate<HTMLDivElement>();

  const authMutation = useMutation({
    mutationFn: () => (mode === 'login' ? login({ identifier: email, password }) : register({ email, username, password })),
    onSuccess: (session) => {
      setError(null);
      setSession(session);
      queryClient.setQueryData(['auth', 'me'], session.user);
      navigate(getRoleHome(session.user.role), { replace: true });
    },
    onError: (caughtError) => {
      setError(getApiErrorMessage(caughtError));
    }
  });

  if (accessToken && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    authMutation.mutate();
  };

  return (
    <AuthorTheme className="auth-shell">
      <Paper p="xl" withBorder className="auth-card">
        <Group justify="space-between" align="center" mb="md">
          <Link to="/" className="sc-brand" aria-label="StoryCraft — Trang chủ">
            <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
            <span>StoryCraft</span>
            <span className="sc-brand-edition">Văn Hoa</span>
          </Link>
          <ThemeControl />
        </Group>

        <div className="mb-4">
          <h1 className="text-section-title m-0">
            {mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}
          </h1>
          <Text size="xs" c="dimmed" mt={2}>
            Không gian đọc truyện và sáng tác tiểu thuyết Việt
          </Text>
        </div>

        <LayoutGroup id={tabGroupId}>
          <div
            role="tablist"
            aria-label="Chế độ xác thực"
            className="grid grid-cols-2 p-1 mb-4 rounded-lg border border-stone-200 bg-surface-subtle"
          >
            {([
              { id: 'login', label: 'Đăng nhập' },
              { id: 'register', label: 'Tạo tài khoản' }
            ] as const).map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${tabGroupId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${tabGroupId}-panel`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => switchMode(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
                      e.preventDefault();
                      const next = e.key === 'Home' ? 'login' : e.key === 'End' ? 'register' : mode === 'login' ? 'register' : 'login';
                      switchMode(next);
                      const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                      buttons?.[next === 'login' ? 0 : 1]?.focus();
                    }
                  }}
                  className={`relative z-10 py-1.5 px-3 rounded-md text-meta font-semibold transition-colors ${
                    active ? 'text-primary-800' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sc-auth-mode-pill"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-md bg-surface-container-lowest border border-stone-200/80 shadow-2xs"
                      transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        <form
          id={`${tabGroupId}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabGroupId}-tab-${mode}`}
          onSubmit={handleSubmit}
        >
          <Stack gap="sm" ref={fieldsRef}>
            <TextInput
              label={mode === 'login' ? 'Email hoặc tên đăng nhập' : 'Email'}
              placeholder={mode === 'login' ? 'Nhập email hoặc tên đăng nhập' : 'ban@vidu.vn'}
              type={mode === 'register' ? 'email' : 'text'}
              autoComplete={mode === 'login' ? 'username' : 'email'}
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            {mode === 'register' ? (
              <TextInput
                label="Tên người dùng"
                placeholder="Ví dụ: tacgia_vanhoa"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
            ) : null}
            <PasswordInput
              label="Mật khẩu"
              placeholder="Nhập mật khẩu của bạn"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              visibilityToggleButtonProps={{ 'aria-label': 'Hiện hoặc ẩn mật khẩu' }}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            {error ? <Alert color="red" role="alert">{error}</Alert> : null}
            <Button type="submit" loading={authMutation.isPending} fullWidth mt={4}>
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </Button>
          </Stack>
        </form>

        <Stack gap="xs" mt="md" pt="md" className="border-t border-stone-200/80">
          <Button variant="light" fullWidth onClick={() => navigate('/public')}>
            Khám phá kho truyện công khai
          </Button>
          <Button variant="subtle" fullWidth onClick={() => navigate('/appeals')}>
            Tra cứu &amp; khiếu nại tài khoản
          </Button>
        </Stack>
      </Paper>
    </AuthorTheme>
  );
}

function getRoleHome(role: 'READER' | 'AUTHOR' | 'ADMIN') {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/';
}
