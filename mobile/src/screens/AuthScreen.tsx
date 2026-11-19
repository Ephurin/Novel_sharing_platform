import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import { login, register, verifyRegistration, type PendingRegistration } from '../api/auth-api';
import type { CurrentUser } from '../api/types';
import { Field } from '../components/Form';
import { AppIcon } from '../components/Icons';
import { Card, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { persistSession } from '../state/session';
import { resolveStoryCraftFontFamily, useStoryCraftTheme } from '../theme/ThemeProvider';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: CurrentUser) => void }) {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registration, setRegistration] = useState<PendingRegistration | null>(null);
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !loading && (registration ? code.length === 8
    : identifier.trim().length > 0 && password.length > 0 && (mode === 'login' || username.trim().length > 0));
  const submitLabel = registration ? 'Xác nhận email' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';

  const switchMode = (value: typeof mode) => {
    if (loading) return;
    setMode(value);
    setRegistration(null);
    setCode('');
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'register' && !registration) {
        const pending = await register({ email: identifier.trim(), username: username.trim(), password });
        setRegistration(pending);
        setPassword('');
        return;
      }
      const session = registration
        ? await verifyRegistration(registration.registrationId, code)
        : await login({ identifier: identifier.trim(), password });
      await persistSession(session.accessToken);
      onAuthenticated(session.user);
    } catch (caughtError) {
      setError(caughtError instanceof ApiClientError && /^(AUTH_EMAIL_|USER_00[45]$)/.test(caughtError.code)
        ? caughtError.message : getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Section subtitle="Đọc truyện và đồng bộ tủ sách cá nhân trên mọi thiết bị.">
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
                  accessibilityState={{ selected: active, disabled: loading }}
                  onPress={() => switchMode(value)}
                  style={[
                    authStyles.tab,
                    active ? { backgroundColor: palette.surfaceElevated, borderColor: palette.border } : null
                  ]}
                >
                  <Text
                    style={[
                      authStyles.tabLabel,
                      {
                        color: active ? palette.primaryMuted : palette.textMuted,
                        fontFamily: resolveStoryCraftFontFamily(active ? '600' : '500', fontsLoaded)
                      }
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {registration ? (
            <>
              <Text accessibilityLiveRegion="polite" style={themed.body}>
                Mã xác nhận đã được gửi đến {registration.email}. Mã gồm 8 chữ số và có hiệu lực trong 15 phút.
              </Text>
              <Field label="Mã xác nhận" value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode"
                maxLength={8} editable={!loading} />
            </>
          ) : (
            <>
              <Field
                label={mode === 'login' ? 'Email hoặc tên đăng nhập' : 'Email'}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={mode === 'login' ? 'ten_ban hoặc email@domain.vn' : 'email@domain.vn'}
                autoCapitalize="none"
                keyboardType={mode === 'register' ? 'email-address' : 'default'}
                autoComplete={mode === 'login' ? 'username' : 'email'}
                textContentType={mode === 'login' ? 'username' : 'emailAddress'}
                returnKeyType="next"
                editable={!loading}
              />
              {mode === 'register' ? (
                <Field
                  label="Tên người dùng"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="ten_doc_gia"
                  autoCapitalize="none"
                  autoComplete="username-new"
                  textContentType="username"
                  returnKeyType="next"
                  editable={!loading}
                />
              ) : null}
              <Field
                label="Mật khẩu"
                value={password}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                returnKeyType="done"
                onSubmitEditing={() => {
                  void submit();
                }}
                editable={!loading}
                rightAccessory={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onPress={() => setShowPassword((prev) => !prev)}
                    style={({ pressed }) => [
                      authStyles.passwordToggle,
                      pressed ? { opacity: 0.75 } : null
                    ]}
                  >
                    <AppIcon
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={16}
                      color={palette.primaryMuted}
                    />
                    <Text
                      style={{
                        color: palette.primaryMuted,
                        fontSize: 12,
                        fontWeight: '600',
                        fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
                      }}
                    >
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </Text>
                  </Pressable>
                }
              />
            </>
          )}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={themed.error}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label={loading ? 'Đang xử lý...' : submitLabel}
            accessibilityLabel={submitLabel}
            loading={loading}
            onPress={() => void submit()}
            disabled={!canSubmit}
          />
          {registration && (
            <Pressable accessibilityRole="button" disabled={loading} onPress={() => switchMode('register')} style={authStyles.tab}>
              <Text style={[themed.body, { color: palette.primaryMuted }]}>Quay lại đăng ký</Text>
            </Pressable>
          )}
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
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  tabLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600'
  },
  passwordToggle: {
    minHeight: 44,
    minWidth: 56,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  }
});
