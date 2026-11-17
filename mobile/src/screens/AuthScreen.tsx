import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { login, register } from '../api/auth-api';
import type { CurrentUser } from '../api/types';
import { Field } from '../components/Form';
import { Card, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { persistSession } from '../state/session';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const session =
        mode === 'login'
          ? await login({ identifier: identifier.trim(), password })
          : await register({ email: identifier.trim(), username: username.trim(), password });
      await persistSession(session.accessToken);
      onAuthenticated(session.user);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    !loading &&
    identifier.trim().length > 0 &&
    password.length > 0 &&
    (mode === 'login' || username.trim().length > 0);

  return (
    <Screen>
      <Section title="StoryCraft Văn Hoa" subtitle="Đọc truyện và đồng bộ tủ sách cá nhân.">
        <Card>
          <View
            accessibilityRole="tablist"
            style={[
              authStyles.tabBar,
              { backgroundColor: palette.neutralBg, borderColor: palette.border }
            ]}
          >
            {(
              [
                ['login', 'Đăng nhập'],
                ['register', 'Tạo tài khoản']
              ] as const
            ).map(([value, label]) => {
              const active = mode === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setMode(value);
                    setError(null);
                  }}
                  style={[
                    authStyles.tab,
                    active ? { backgroundColor: palette.surface, borderColor: palette.border } : null
                  ]}
                >
                  <Text
                    style={[
                      authStyles.tabLabel,
                      { color: active ? palette.primaryMuted : palette.textMuted }
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label={mode === 'login' ? 'Email hoặc tên đăng nhập' : 'Email'}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={mode === 'login' ? 'ten_ban hoặc email@domain.vn' : 'email@domain.vn'}
            autoCapitalize="none"
            keyboardType={mode === 'register' ? 'email-address' : 'default'}
          />
          {mode === 'register' ? (
            <Field
              label="Tên người dùng"
              value={username}
              onChangeText={setUsername}
              placeholder="ten_doc_gia"
              autoCapitalize="none"
            />
          ) : null}
          <Field
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            placeholder="Nhập mật khẩu"
            secureTextEntry
            autoCapitalize="none"
          />
          {error ? (
            <Text accessibilityLiveRegion="polite" style={themed.error}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label={
              loading
                ? 'Đang xử lý...'
                : mode === 'login'
                ? 'Đăng nhập'
                : 'Tạo tài khoản'
            }
            onPress={submit}
            disabled={!canSubmit}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const authStyles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700'
  }
});
