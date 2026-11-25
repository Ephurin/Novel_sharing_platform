import { Alert, Button, Group, PasswordInput, Stack, Text, useComputedColorScheme } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../shared/api/api-client';
import { getGoogleChallenge, loginWithGoogle } from './auth-api';
import type { AuthSession } from './auth-types';

type GoogleIdentity = {
  initialize(options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: {
    theme: 'outline' | 'filled_black'; size: 'large'; text: 'continue_with'; width: number; locale: string;
  }): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

let googleScript: Promise<GoogleIdentity> | undefined;

export function loadGoogleIdentity() {
  const identity = window.google?.accounts?.id;
  if (identity) return Promise.resolve(identity);
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=vi';
    script.async = true;
    const fail = () => {
      script.remove();
      googleScript = undefined;
      reject(new Error('Không tải được nút đăng nhập Google.'));
    };
    script.onload = () => {
      const loaded = window.google?.accounts?.id;
      if (loaded) resolve(loaded);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return googleScript;
}

export function GoogleSignIn({ blocked, mode = 'login', onBusyChange, onSession }: {
  blocked: boolean;
  mode?: 'login' | 'register';
  onBusyChange: (busy: boolean) => void;
  onSession: (session: AuthSession) => void;
}) {
  const theme = useComputedColorScheme('light');
  const button = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const onCredential = useRef<(credential: string) => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scriptFailed, setScriptFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [linkCredential, setLinkCredential] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const { data: challenge, refetch } = useQuery({
    queryKey: ['auth', 'google-challenge'],
    queryFn: getGoogleChallenge,
    retry: false,
    staleTime: Infinity,
    gcTime: 0
  });

  const submit = async (credential: string, proof?: string) => {
    if (sending.current || blocked) return;
    sending.current = true;
    onBusyChange(true);
    setBusy(true);
    setError('');
    try {
      const session = await loginWithGoogle(credential, proof);
      setLinkCredential(null);
      setPassword('');
      onSession(session);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'AUTH_GOOGLE_LINK_REQUIRED') {
        setLinkCredential(credential);
      } else if (caught instanceof ApiClientError && caught.code.startsWith('AUTH_GOOGLE_')) {
        setError(caught.message);
        if (caught.code === 'AUTH_GOOGLE_CHALLENGE' || caught.code === 'AUTH_GOOGLE_CREDENTIAL') {
          setLinkCredential(null);
          setPassword('');
          if (caught.code === 'AUTH_GOOGLE_CHALLENGE') void refetch();
        }
      } else {
        setError('Không thể đăng nhập bằng Google lúc này. Hãy thử lại.');
      }
    } finally {
      sending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  onCredential.current = (credential) => void submit(credential);

  useEffect(() => {
    const mount = button.current;
    if (!challenge || !mount) return;
    let active = true;
    let observer: ResizeObserver | undefined;
    let lastWidth = 0;
    void loadGoogleIdentity().then((identity) => {
      if (!active) return;
      identity.initialize({
        client_id: challenge.clientId,
        nonce: challenge.nonce,
        callback: ({ credential }) => {
          if (active && credential) onCredential.current(credential);
        }
      });
      const render = () => {
        const width = Math.min(400, Math.floor(mount.clientWidth));
        if (!width || width === lastWidth) return;
        lastWidth = width;
        mount.replaceChildren();
        identity.renderButton(mount, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large', text: 'continue_with', width, locale: 'vi'
        });
      };
      render();
      observer = new ResizeObserver(render);
      observer.observe(mount);
    }).catch(() => {
      if (active) setScriptFailed(true);
    });
    return () => {
      active = false;
      observer?.disconnect();
      mount.replaceChildren();
    };
  }, [challenge, theme, attempt]);

  const [notConfiguredNotice, setNotConfiguredNotice] = useState(false);

  const googleLabel = 'Đăng nhập / Đăng ký với Google';

  if (!challenge) {
    return (
      <div className="sc-auth-google-section">
        <div className="sc-auth-divider"><span>hoặc</span></div>
        <button
          type="button"
          className="sc-auth-google-btn"
          disabled={blocked}
          onClick={() => setNotConfiguredNotice(true)}
        >
          <span className="sc-auth-google-g" aria-hidden="true">G</span>
          <span>{googleLabel}</span>
        </button>
        {notConfiguredNotice && (
          <Text size="xs" c="dimmed" ta="center" mt={6} role="status">
            Đăng nhập Google chưa được cấu hình trên môi trường này (thiếu GOOGLE_OAUTH_CLIENT_ID).
          </Text>
        )}
      </div>
    );
  }
  return (
    <Stack gap={6} mt={12} className="sc-auth-google-section">
      <div className="sc-auth-divider"><span>hoặc</span></div>
      {!linkCredential && !scriptFailed && (
        <div className="sc-auth-google-wrap" data-busy={busy || blocked ? 'true' : undefined}>
          <div className="sc-auth-google-btn sc-auth-google-visual" aria-hidden="true">
            <span className="sc-auth-google-g">G</span>
            <span>{googleLabel}</span>
          </div>
          <div ref={button} className="sc-auth-google-gis-overlay" inert={busy || blocked} />
        </div>
      )}
      {scriptFailed && (
        <Button variant="default" onClick={() => { setScriptFailed(false); setAttempt(attempt + 1); }}>
          Thử tải lại nút Google
        </Button>
      )}
      {busy && <Text role="status" size="sm">Đang xác thực với Google…</Text>}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {linkCredential && (
        <Stack component="form" gap="xs" onSubmit={(event) => {
          event.preventDefault();
          if (password) void submit(linkCredential, password);
        }}>
          <Text size="sm">Email này đã có tài khoản. Nhập mật khẩu StoryCraft để liên kết với Google.</Text>
          <PasswordInput label="Mật khẩu StoryCraft" autoComplete="current-password"
            value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button type="button" variant="subtle" disabled={busy} onClick={() => {
              setLinkCredential(null);
              setPassword('');
              setError('');
            }}>Hủy</Button>
            <Button type="submit" loading={busy} disabled={!password || blocked}>Liên kết Google</Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
