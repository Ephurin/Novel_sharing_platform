import { ThemeControl } from './ThemeControl';
import { Alert, Box, Button, Group, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { IconBrain } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login, register } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { getApiErrorMessage } from '../api/api-client';

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

  return (
    <Box className="auth-shell">
      <Paper p="xl" withBorder className="auth-card">
        <Group gap="sm" mb="lg">
          <ThemeControl />
          <IconBrain size={22} />
          <Title order={3}>Ephurin Web</Title>
        </Group>

        <Stack>
          <TextInput
            label={mode === 'login' ? 'Email hoặc tên đăng nhập' : 'Email'}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          {mode === 'register' ? (
            <TextInput label="Tên đăng nhập" value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
          ) : null}
          <PasswordInput label="Mật khẩu" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          {error ? <Alert color="red">{error}</Alert> : null}
          <Button loading={authMutation.isPending} onClick={() => authMutation.mutate()}>
            {mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </Button>
          <Button variant="subtle" onClick={() => setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))}>
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </Button>
          <Button variant="light" onClick={() => navigate('/public')}>
            Đọc truyện với tư cách khách
          </Button>
          <Button variant="subtle" onClick={()=>navigate('/appeals')}>Quyết định & khiếu nại tài khoản</Button>
        </Stack>
      </Paper>
    </Box>
  );
}

function getRoleHome(role: 'READER' | 'AUTHOR' | 'ADMIN') {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/';
}
