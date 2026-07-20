import { Alert, Box, Button, Group, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { IconBrain } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { login, register } from '../../features/auth/auth-api';
import { useAuthStore } from '../../features/auth/useAuthStore';

export function AuthLanding() {
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
    },
    onError: (caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed');
    }
  });

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
        </Stack>
      </Paper>
    </Box>
  );
}
