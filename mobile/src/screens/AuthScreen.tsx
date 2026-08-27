import { useState } from 'react';
import { Text } from 'react-native';
import { login, register } from '../api/auth-api';
import { getApiErrorMessage } from '../api/api-client';
import { Field } from '../components/Form';
import { GhostButton, PrimaryButton, Screen, Section, styles } from '../components/Screen';
import { persistSession } from '../state/session';
import type { CurrentUser } from '../api/types';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('StrongPassword123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const session =
        mode === 'login'
          ? await login({ identifier, password })
          : await register({ email: identifier, username, password });
      await persistSession(session.accessToken);
      onAuthenticated(session.user);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Section title="Ephurin Reader" subtitle="Login for library, comments, wallet, notifications, and reading history.">
        <Field label={mode === 'login' ? 'Email or username' : 'Email'} value={identifier} onChangeText={setIdentifier} />
        {mode === 'register' ? <Field label="Username" value={username} onChangeText={setUsername} /> : null}
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label={loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'} onPress={submit} disabled={loading} />
        <GhostButton label={`Switch to ${mode === 'login' ? 'register' : 'login'}`} onPress={() => setMode(mode === 'login' ? 'register' : 'login')} />
      </Section>
    </Screen>
  );
}
