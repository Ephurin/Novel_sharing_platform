import { Alert, Button, Checkbox, Group, Modal, PasswordInput, Stack, Text, TextInput, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconArrowRight, IconLock, IconMail, IconMoon, IconSun, IconUser } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  cancelRegistration, getPendingRegistration, login, recoverRegistration, register,
  resendRegistrationEmail, verifyRegistration, verifyRegistrationLink, type PendingRegistration
} from '../../features/auth/auth-api';
import type { AuthSession } from '../../features/auth/auth-types';
import { GoogleSignIn } from '../../features/auth/GoogleSignIn';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import { useStoryCraftAutoAnimate } from '../hooks/useStoryCraftAutoAnimate';
import { AuthorTheme } from './AuthorTheme';
import './AuthLanding.css';

const REMEMBER_IDENTIFIER_KEY = 'storycraft_remember_identifier';

function readRememberedIdentifier() {
  try {
    return localStorage.getItem(REMEMBER_IDENTIFIER_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeRememberedIdentifier(value: string) {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(REMEMBER_IDENTIFIER_KEY, trimmed);
    else localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}

function clearRememberedIdentifier() {
  try {
    localStorage.removeItem(REMEMBER_IDENTIFIER_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}

export function AuthLanding({ confirmEmailFromLink = false }: { confirmEmailFromLink?: boolean }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(() => readRememberedIdentifier());
  const [remember, setRemember] = useState(() => Boolean(readRememberedIdentifier()));
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPasswordMismatch, setShowPasswordMismatch] = useState(false);
  const [registration, setRegistration] = useState<PendingRegistration | null>(null);
  const [restoring, setRestoring] = useState(!confirmEmailFromLink);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [emailResent, setEmailResent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');
  const [googleBusy, setGoogleBusy] = useState(false);
  const reduce = useReducedMotion();
  const tabGroupId = useId();
  const fieldsRef = useStoryCraftAutoAnimate<HTMLDivElement>();
  const confirmationRef = useRef<HTMLInputElement>(null);
  const passwordMismatch = showPasswordMismatch && password !== passwordConfirmation;
  const linkParams = new URLSearchParams(confirmEmailFromLink ? hash.slice(1) : '');
  const recoveryToken = linkParams.get('recovery');
  const recovering = recoveryToken !== null;
  const linkToken = linkParams.get('token') ?? '';
  const invalidLink = confirmEmailFromLink && (recovering
    ? !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(recoveryToken)
    : !/^[A-Za-z0-9_-]{43}$/.test(linkToken));
  const registering = mode === 'register' || recovering;

  useEffect(() => {
    if (confirmEmailFromLink || accessToken) return;
    let active = true;
    void getPendingRegistration().then(pending => {
      if (!active || !pending?.registrationId) return;
      setMode('register');
      setEmail(pending.email);
      setRegistration(pending);
      setResendRemaining(pending.resendAfterSeconds);
      setResendAt(Date.now() + pending.resendAfterSeconds * 1000);
    }).catch(() => {
      // The email link can still recover the signup if the status request is unavailable.
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [confirmEmailFromLink, accessToken]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendRemaining(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const setResendCooldown = (seconds: number) => {
    setResendRemaining(seconds);
    setResendAt(Date.now() + seconds * 1000);
  };

  const handleSession = (session: AuthSession) => {
    setError(null);
    const persistSession = mode === 'login' && !recovering ? remember : true;
    if (mode === 'login' && !recovering) {
      if (remember) writeRememberedIdentifier(email);
      else clearRememberedIdentifier();
    }
    setSession(session, persistSession);
    queryClient.setQueryData(['auth', 'me'], session.user);
    navigate(getRoleHome(session.user.role), { replace: true });
  };

  const authMutation = useMutation({
    mutationFn: (): Promise<AuthSession | PendingRegistration> => {
      if (recovering) return recoverRegistration({ token: recoveryToken, username, password });
      if (confirmEmailFromLink) return verifyRegistrationLink(linkToken);
      if (registration) return verifyRegistration(registration.registrationId, code);
      if (mode === 'login') return login({ identifier: email, password });
      return register({ email, username, password });
    },
    onSuccess: (result) => {
      if ('registrationId' in result) {
        setRegistration(result);
        setResendCooldown(result.resendAfterSeconds);
        setPassword('');
        setPasswordConfirmation('');
        setShowPasswordMismatch(false);
        setError(null);
      } else {
        handleSession(result);
      }
    },
    onError: (caughtError) => setError(getAuthErrorMessage(caughtError))
  });

  const resendMutation = useMutation({
    mutationFn: resendRegistrationEmail,
    onMutate: () => {
      setError(null);
      setEmailResent(false);
    },
    onSuccess: (result) => {
      setRegistration(result);
      setCode('');
      setEmailResent(true);
      setResendCooldown(result.resendAfterSeconds);
    },
    onError: (caughtError) => {
      setError(getAuthErrorMessage(caughtError));
      if (caughtError instanceof ApiClientError && caughtError.status === 429) {
        const details = caughtError.details as { retryAfterSeconds?: number } | undefined;
        if (typeof details?.retryAfterSeconds === 'number') setResendCooldown(details.retryAfterSeconds);
      }
    }
  });

  const cancelMutation = useMutation({
    mutationFn: cancelRegistration,
    onSuccess: () => {
      resetRegistration('register');
    },
    onError: (caughtError) => setError(getAuthErrorMessage(caughtError))
  });

  const isBusy = restoring || authMutation.isPending || resendMutation.isPending || cancelMutation.isPending || googleBusy;
  const registerMailFailed = !registration && mode === 'register' && authMutation.error instanceof ApiClientError
    && authMutation.error.code === 'AUTH_EMAIL_UNAVAILABLE';

  if (accessToken && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  const resetRegistration = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setRegistration(null);
    setCancelPrompt(false);
    setCode('');
    setShowCode(false);
    setEmailResent(false);
    setResendAt(0);
    setResendRemaining(0);
    setPasswordConfirmation('');
    setShowPasswordMismatch(false);
    setError(null);
    authMutation.reset();
  };

  const switchMode = (nextMode: 'login' | 'register') => {
    if (!isBusy) resetRegistration(nextMode);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy || invalidLink || (registration && (!showCode || code.length !== 8))) return;
    if (!registration && registering && password !== passwordConfirmation) {
      setError(null);
      setShowPasswordMismatch(true);
      confirmationRef.current?.focus();
      return;
    }
    authMutation.mutate();
  };

  const iconUser = <IconUser size={17} stroke={1.75} aria-hidden="true" />;
  const iconLock = <IconLock size={17} stroke={1.75} aria-hidden="true" />;
  const iconMail = <IconMail size={17} stroke={1.75} aria-hidden="true" />;

  return (
    <AuthorTheme className="auth-shell sc-auth-shell">
      <div className="sc-auth-photo-stage">
        <div
          className="sc-auth-photo"
          role="img"
          aria-label="Góc bàn đọc sách bên cửa sổ với cây xanh, tách trà và sổ tay dưới nắng nhẹ"
        />
        <div className="sc-auth-photo-caption">
          <p className="sc-auth-quote">“Mỗi câu chuyện đều bắt đầu từ một trang giấy trắng.”</p>
          <p className="sc-auth-tagline">StoryCraft · Đọc · Viết · Sẻ chia</p>
        </div>
      </div>

      <svg className="sc-auth-seam" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1672 941">
        <defs>
          <linearGradient id="sc-seam-edge-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--auth-paper)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--auth-paper)" stopOpacity="0.32" />
          </linearGradient>
        </defs>
        <path
          className="sc-auth-seam-fill"
          d="M902 0 C852 108 830 228 844 362 C858 492 868 622 824 756 C798 836 766 896 742 941 L1672 941 L1672 0 Z"
        />
        <path
          className="sc-auth-seam-detail"
          d="M902 0 C852 108 830 228 844 362 C858 492 868 622 824 756 C798 836 766 896 742 941"
        />
      </svg>

      <section className="sc-auth-panel" aria-labelledby="sc-auth-title">
        <div className="sc-auth-inner">
          <header className="sc-auth-brand-row">
            <Link to="/" className="sc-auth-brand" aria-label="StoryCraft — Trang chủ">
              <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
              <span className="sc-auth-brand-name">StoryCraft</span>
            </Link>
            <div className="sc-auth-theme-switch" role="group" aria-label="Chế độ hiển thị">
              <button
                type="button"
                className={`sc-auth-theme-btn${computedColorScheme === 'light' ? ' is-active' : ''}`}
                aria-label="Giao diện sáng"
                aria-pressed={computedColorScheme === 'light'}
                onClick={() => setColorScheme('light')}
              >
                <IconSun size={16} stroke={1.9} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`sc-auth-theme-btn${computedColorScheme === 'dark' ? ' is-active' : ''}`}
                aria-label="Giao diện tối"
                aria-pressed={computedColorScheme === 'dark'}
                onClick={() => setColorScheme('dark')}
              >
                <IconMoon size={16} stroke={1.9} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="sc-auth-header">
            <h1 id="sc-auth-title" className="sc-auth-headline">
              {recovering ? 'Khôi phục đăng ký' : confirmEmailFromLink || registration ? 'Xác nhận email'
                : mode === 'login' ? 'Chào mừng trở lại!' : 'Bắt đầu câu chuyện mới!'}
              {!confirmEmailFromLink && !registration && <span className="sc-auth-flair" aria-hidden="true" />}
            </h1>
            {!confirmEmailFromLink && !registration && (
              <p className="sc-auth-subhead">
                {mode === 'login'
                  ? 'Tiếp tục hành trình đọc và viết cùng StoryCraft.'
                  : 'Tạo tài khoản để đọc, viết và chia sẻ câu chuyện.'}
              </p>
            )}
          </div>

          {!confirmEmailFromLink && !registration && !restoring && <LayoutGroup id={tabGroupId}>
            <div
              role="tablist"
              aria-label="Chế độ xác thực"
              className="sc-auth-tabs"
            >
              {([
                { id: 'login', label: 'Đăng nhập' },
                { id: 'register', label: 'Đăng ký' }
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
                    className="sc-auth-tab"
                  >
                    {active && (
                      <motion.span
                        layoutId="sc-auth-mode-pill"
                        aria-hidden="true"
                        className="sc-auth-tab-pill"
                        transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>}

          {restoring ? <Text size="sm" role="status">Đang kiểm tra phiên đăng ký…</Text> : <form
            id={confirmEmailFromLink || registration ? undefined : `${tabGroupId}-panel`}
            role={confirmEmailFromLink || registration ? undefined : 'tabpanel'}
            aria-labelledby={confirmEmailFromLink || registration ? undefined : `${tabGroupId}-tab-${mode}`}
            onSubmit={handleSubmit}
          >
            <Stack gap={12} ref={fieldsRef}>
            {confirmEmailFromLink && (!recovering || invalidLink) ? (
              <Text size="sm">
                {invalidLink
                  ? 'Link xác nhận không hợp lệ. Hãy mở lại email hoặc dùng mã 8 số ở tab đăng ký.'
                  : 'Bấm xác nhận để hoàn tất tạo tài khoản StoryCraft.'}
              </Text>
            ) : registration ? (
              <>
                <Text size="sm" role="status" style={{ overflowWrap: 'anywhere' }}>
                  {emailResent ? 'Đã gửi lại email xác nhận đến ' : 'Đã gửi email xác nhận đến '}
                  <strong>{registration.email}</strong>.
                </Text>
                <Text size="sm">Mở link xác nhận trong email bằng trình duyệt này. Nếu chưa thấy email, hãy kiểm tra thư rác.</Text>
                <Button component="a" href="https://mail.google.com/" target="_blank" rel="noopener noreferrer"
                  variant={showCode ? 'default' : 'filled'} fullWidth>
                  Mở Gmail
                </Button>
                <Group gap="xs" justify="space-between">
                  <Button type="button" variant="subtle" disabled={isBusy || resendRemaining > 0 || registration.resendsRemaining === 0}
                    loading={resendMutation.isPending} onClick={() => resendMutation.mutate(registration.registrationId)}>
                    {registration.resendsRemaining === 0 ? 'Đã hết lượt gửi lại' : `Gửi lại email${resendRemaining > 0 ? ` (${resendRemaining} giây)` : ''}`}
                  </Button>
                  <Button type="button" variant="subtle" disabled={isBusy} aria-expanded={showCode}
                    onClick={() => setShowCode(!showCode)}>
                    {showCode ? 'Ẩn mã dự phòng' : 'Dùng mã 8 số'}
                  </Button>
                </Group>
                {showCode && (
                  <TextInput
                    label="Mã xác nhận"
                    description="Nhập mã 8 số trong email mới nhất."
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={resendMutation.isPending}
                    maxLength={8}
                    value={code}
                    onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, ''))}
                  />
                )}
              </>
            ) : (
              <>
                {recovering && <Text size="sm">Chọn tên đăng nhập và mật khẩu để hoàn tất đăng ký bằng email đã xác nhận.</Text>}
                {registering ? (
                  <TextInput
                    label="Tên đăng nhập"
                    placeholder="Ví dụ: tacgia_vanhoa"
                    leftSection={iconUser}
                    leftSectionPointerEvents="none"
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
                    leftSection={iconUser}
                    leftSectionPointerEvents="none"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                )}
                <PasswordInput
                  label="Mật khẩu"
                  placeholder="Nhập mật khẩu của bạn"
                  leftSection={iconLock}
                  leftSectionPointerEvents="none"
                  autoComplete={registering ? 'new-password' : 'current-password'}
                  required={registering}
                  withAsterisk={false}
                  visibilityToggleButtonProps={{ 'aria-label': 'Hiện hoặc ẩn mật khẩu' }}
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
                {registering && (
                  <>
                    <PasswordInput
                      ref={confirmationRef}
                      label="Nhập lại mật khẩu"
                      placeholder="Nhập lại mật khẩu của bạn"
                      leftSection={iconLock}
                      leftSectionPointerEvents="none"
                      autoComplete="new-password"
                      required
                      withAsterisk={false}
                      aria-invalid={passwordMismatch || undefined}
                      visibilityToggleButtonProps={{ 'aria-label': 'Hiện hoặc ẩn mật khẩu nhập lại' }}
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.currentTarget.value)}
                      error={passwordMismatch ? 'Hai mật khẩu chưa khớp.' : undefined}
                    />
                    {!recovering && <TextInput
                      label="Email"
                      placeholder="ban@gmail.com"
                      leftSection={iconMail}
                      leftSectionPointerEvents="none"
                      type="email"
                      autoComplete="email"
                      required
                      withAsterisk={false}
                      value={email}
                      onChange={(event) => setEmail(event.currentTarget.value)}
                    />}
                  </>
                )}
              </>
            )}
            {error ? <Alert color="red" role="alert">{error}</Alert> : null}
          </Stack>
          {!confirmEmailFromLink && !registration && !registering && (
            <div className="sc-auth-options-row">
              <Checkbox
                label="Ghi nhớ đăng nhập"
                size="sm"
                checked={remember}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRemember(checked);
                  if (!checked) clearRememberedIdentifier();
                }}
                className="sc-auth-remember"
              />
              <button
                type="button"
                className="sc-auth-forgot-btn"
                onClick={() => setForgotModalOpen(true)}
              >
                Quên mật khẩu?
              </button>
            </div>
          )}
          <Stack gap={10} mt={!confirmEmailFromLink && !registration && !registering ? 12 : 10}>
            {!invalidLink && (!registration || showCode) && (
              <Button
                type="submit"
                className="sc-auth-submit"
                rightSection={<IconArrowRight size={17} stroke={2} aria-hidden="true" />}
                loading={authMutation.isPending}
                disabled={resendMutation.isPending || cancelMutation.isPending || googleBusy || Boolean(registration && code.length !== 8)}
                fullWidth
                mt={2}
              >
                {recovering ? 'Hoàn tất đăng ký' : confirmEmailFromLink ? 'Xác nhận tài khoản' : registration ? 'Xác nhận bằng mã' : mode === 'login'
                  ? 'Đăng nhập' : registerMailFailed ? 'Thử gửi lại email' : 'Tạo tài khoản'}
              </Button>
            )}
            {confirmEmailFromLink && (
              <Button component={Link} to="/login" variant="subtle">Về trang đăng nhập</Button>
            )}
            {registration && (cancelPrompt ? (
              <Group justify="space-between">
                <Button type="button" variant="subtle" disabled={isBusy} onClick={() => setCancelPrompt(false)}>Giữ phiên đăng ký</Button>
                <Button type="button" variant="outline" color="red" loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(registration.registrationId)}>Xác nhận hủy phiên</Button>
              </Group>
            ) : <Button type="button" variant="subtle" disabled={isBusy} onClick={() => setCancelPrompt(true)}>
              Hủy để đăng ký lại
            </Button>)}
          </Stack>
        </form>}

        {!confirmEmailFromLink && !registration && !restoring && <GoogleSignIn blocked={authMutation.isPending}
          mode={mode} onBusyChange={setGoogleBusy} onSession={handleSession} />}
        </div>

        <svg className="sc-auth-wave" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 77C110 31 199 33 312 70C410 109 468 96 552 70C664 35 718 29 819 42C892 51 957 68 1000 81V100H0Z" />
        </svg>
        <svg className="sc-auth-doodle" viewBox="0 -14 126 92" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M56 57C43 47 27 45 9 48V11C28 7 46 12 56 23C70 12 87 9 106 13V49C87 46 68 48 56 57ZM56 57V23" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M20 20C34 19 45 22 50 27M20 28C35 28 43 30 50 34M66 27C77 21 88 21 97 22M66 34C78 30 87 30 97 31" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M87 2L90 -9M104 9L114 0M108 25L120 23" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </section>

      <Modal
        opened={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
        title="Quên mật khẩu"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Chức năng đặt lại mật khẩu qua email hiện chưa được máy chủ hỗ trợ. Nếu tài khoản của bạn đã liên kết Google, bạn có thể dùng nút <strong>Đăng nhập bằng Google</strong> bên dưới, hoặc liên hệ quản trị viên StoryCraft để được hỗ trợ.
          </Text>
          <Button type="button" onClick={() => setForgotModalOpen(false)} fullWidth>
            Đã hiểu
          </Button>
        </Stack>
      </Modal>
    </AuthorTheme>
  );
}

function getAuthErrorMessage(error: unknown) {
  return error instanceof ApiClientError && /^(AUTH_EMAIL_|USER_00[45]$)/.test(error.code)
    ? error.message : getApiErrorMessage(error);
}

function getRoleHome(role: AuthSession['user']['role']) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/';
}
