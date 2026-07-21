import { Alert, Box, Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconBrain } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login, register } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { getApiErrorMessage } from '../api/api-client';

export function AuthLanding() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('StrongPassword123!');
  const [error, setError] = useState<string | null>(null);

  const authMutation = useMutation({
    mutationFn: () => (mode === 'login' ? login({ identifier: email, password }) : register({ email, username, password })),
    onSuccess: (session) => {
      setError(null);
      setSession(session);
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
          <IconBrain size={22} />
          <Title order={3}>Ephurin Web</Title>
        </Group>

        <Stack>
          <TextInput
            label={mode === 'login' ? 'Email or username' : 'Email'}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          {mode === 'register' ? (
            <TextInput label="Username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
          ) : null}
          <PasswordInput label="Password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          {error ? <Alert color="red">{error}</Alert> : null}
          <Button loading={authMutation.isPending} onClick={() => authMutation.mutate()}>
            {mode === 'login' ? 'Login' : 'Register'}
          </Button>
          <Button variant="subtle" onClick={() => setMode((currentMode) => (currentMode === 'login' ? 'register' : 'login'))}>
            Switch to {mode === 'login' ? 'register' : 'login'}
          </Button>
          <Button variant="light" onClick={() => navigate('/public')}>
            Browse public library as guest
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            OAuth callback is intentionally not wired in this MVP phase.
          </Text>
        </Stack>
      </Paper>
    </Box>
  );
}

function getRoleHome(role: 'READER' | 'AUTHOR' | 'ADMIN') {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/reader';
}
