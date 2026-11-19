import { Alert, Button, Group, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { login, register, verifyRegistration, type PendingRegistration } from '../../features/auth/auth-api';
import type { AuthSession } from '../../features/auth/auth-types';
import { GoogleSignIn } from '../../features/auth/GoogleSignIn';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
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
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPasswordMismatch, setShowPasswordMismatch] = useState(false);
  const [registration, setRegistration] = useState<PendingRegistration | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const reduce = useReducedMotion();
  const tabGroupId = useId();
  const fieldsRef = useStoryCraftAutoAnimate<HTMLDivElement>();
  const confirmationRef = useRef<HTMLInputElement>(null);
  const passwordMismatch = showPasswordMismatch && password !== passwordConfirmation;

  const handleSession = (session: AuthSession) => {
    setError(null);
    setSession(session);
    queryClient.setQueryData(['auth', 'me'], session.user);
    navigate(getRoleHome(session.user.role), { replace: true });
  };

  const authMutation = useMutation({
    mutationFn: (): Promise<AuthSession | PendingRegistration> => {
      if (registration) return verifyRegistration(registration.registrationId, code);
      if (mode === 'login') return login({ identifier: email, password });
      return register({ email, username, password });
    },
    onSuccess: (result) => {
      if ('registrationId' in result) {
        setRegistration(result);
        setPassword('');
        setPasswordConfirmation('');
        setShowPasswordMismatch(false);
        setError(null);
      } else {
        handleSession(result);
      }
    },
    onError: (caughtError) => {
      setError(caughtError instanceof ApiClientError && /^(AUTH_EMAIL_|USER_00[45]$)/.test(caughtError.code)
        ? caughtError.message : getApiErrorMessage(caughtError));
    }
  });

  if (accessToken && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  const switchMode = (nextMode: 'login' | 'register') => {
    if (authMutation.isPending || googleBusy) return;
    setMode(nextMode);
    setRegistration(null);
    setCode('');
    setPasswordConfirmation('');
    setShowPasswordMismatch(false);
    setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMutation.isPending || googleBusy || (registration && code.length !== 8)) return;
    if (!registration && mode === 'register' && password !== passwordConfirmation) {
      setError(null);
      setShowPasswordMismatch(true);
      confirmationRef.current?.focus();
      return;
    }
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
            {registration ? 'Xác nhận email' : mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}
          </h1>
          {!registration && <Text size="xs" c="dimmed" mt={2}>
            Không gian đọc truyện và sáng tác tiểu thuyết Việt
          </Text>}
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
            {registration ? (
              <>
                <Text size="sm" role="status" style={{ overflowWrap: 'anywhere' }}>
                  Mã xác nhận đã được gửi đến <strong>{registration.email}</strong>.
                </Text>
                <TextInput
                  label="Mã xác nhận"
                  description="Mã gồm 8 chữ số, có hiệu lực trong 15 phút."
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, ''))}
                />
              </>
            ) : (
              <>
                {mode === 'register' ? (
                  <TextInput
                    label="Username"
                    placeholder="Ví dụ: tacgia_vanhoa"
                    autoComplete="username"
                    required
                    withAsterisk={false}
                    value={username}
                    onChange={(event) => setUsername(event.currentTarget.value)}
                  />
                ) : (
                  <TextInput
                    label="Email hoặc tên đăng nhập"
                    placeholder="Nhập email hoặc tên đăng nhập"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                )}
                <PasswordInput
                  label="Mật khẩu"
                  placeholder="Nhập mật khẩu của bạn"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required={mode === 'register'}
                  withAsterisk={false}
                  visibilityToggleButtonProps={{ 'aria-label': 'Hiện hoặc ẩn mật khẩu' }}
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
                {mode === 'register' && (
                  <>
                    <PasswordInput
                      ref={confirmationRef}
                      label="Nhập lại mật khẩu"
                      placeholder="Nhập lại mật khẩu của bạn"
                      autoComplete="new-password"
                      required
                      withAsterisk={false}
                      aria-invalid={passwordMismatch || undefined}
                      visibilityToggleButtonProps={{ 'aria-label': 'Hiện hoặc ẩn mật khẩu nhập lại' }}
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.currentTarget.value)}
                      error={passwordMismatch ? 'Hai mật khẩu chưa khớp.' : undefined}
                    />
                    <TextInput
                      label="Email"
                      placeholder="ban@vidu.vn"
                      type="email"
                      autoComplete="email"
                      required
                      withAsterisk={false}
                      value={email}
                      onChange={(event) => setEmail(event.currentTarget.value)}
                    />
                  </>
                )}
              </>
            )}
            {error ? <Alert color="red" role="alert">{error}</Alert> : null}
            <Button type="submit" loading={authMutation.isPending} disabled={googleBusy || Boolean(registration && code.length !== 8)} fullWidth mt={4}>
              {registration ? 'Xác nhận email' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </Button>
            {registration && <Button type="button" variant="subtle" disabled={authMutation.isPending} onClick={() => switchMode('register')}>
              Quay lại đăng ký
            </Button>}
          </Stack>
        </form>

        {!registration && <GoogleSignIn blocked={authMutation.isPending} onBusyChange={setGoogleBusy} onSession={handleSession} />}
      </Paper>
    </AuthorTheme>
  );
}

function getRoleHome(role: 'READER' | 'AUTHOR' | 'ADMIN') {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/';
}
