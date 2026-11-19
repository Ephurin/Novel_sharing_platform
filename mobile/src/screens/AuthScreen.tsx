import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import {
  cancelRegistration, getPendingRegistration, login, register, resendRegistration,
  verifyRegistration, type PendingRegistration
} from '../api/auth-api';
import type { CurrentUser } from '../api/types';
import { Field } from '../components/Form';
import { AppIcon } from '../components/Icons';
import { Card, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { persistSession } from '../state/session';
import { clearPendingRegistration, readPendingRegistration, savePendingRegistration } from '../state/pending-registration';
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
  const [action, setAction] = useState<'submit' | 'resend' | 'cancel' | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);

  const loading = restoring || action !== null;
  const canSubmit = !loading && (registration ? code.length === 8
    : identifier.trim().length > 0 && password.length > 0 && (mode === 'login' || username.trim().length > 0));
  const submitLabel = registration ? 'Xác nhận email' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const context = await readPendingRegistration();
        if (!active || !context) return;
        const pending = await getPendingRegistration(context);
        if (!active) return;
        if (!pending) {
          await clearPendingRegistration();
          return;
        }
        setMode('register');
        setIdentifier(pending.email);
        setRegistration({ ...pending, resendToken: context.resendToken });
        setResendSeconds(pending.resendAfterSeconds);
        setResendAt(Date.now() + pending.resendAfterSeconds * 1000);
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiClientError && caught.code === 'AUTH_EMAIL_REGISTRATION_EXPIRED') {
          await clearPendingRegistration().catch(() => {});
        } else {
          setRestoreFailed(true);
        }
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => { active = false; };
  }, [restoreAttempt]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const startResendCooldown = (seconds: number) => {
    setResendSeconds(seconds);
    setResendAt(Date.now() + 1000 * seconds);
  };

  const switchMode = (value: typeof mode) => {
    if (loading) return;
    setMode(value);
    setRegistration(null);
    setCode('');
    setError(null);
    setResent(false);
    setCancelPrompt(false);
    setResendAt(0);
    setResendSeconds(0);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setAction('submit');
    setError(null);

    try {
      if (mode === 'register' && !registration) {
        const pending = await register({ email: identifier.trim(), username: username.trim(), password });
        setRegistration(pending);
        setPassword('');
        startResendCooldown(pending.resendAfterSeconds);
        await savePendingRegistration(pending).catch(() => {
          setError('Không lưu được phiên trên thiết bị. Nếu thoát ứng dụng, hãy dùng link khôi phục trong email.');
        });
        return;
      }
      const session = registration
        ? await verifyRegistration(registration.registrationId, code)
        : await login({ identifier: identifier.trim(), password });
      await persistSession(session.accessToken);
      if (registration) await clearPendingRegistration().catch(() => {});
      onAuthenticated(session.user);
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setAction(null);
    }
  };

  const resend = async () => {
    if (!registration || loading || resendSeconds > 0) return;
    setAction('resend');
    setError(null);
    setResent(false);
    try {
      const pending = await resendRegistration(registration);
      setRegistration(pending);
      setCode('');
      setResent(true);
      startResendCooldown(pending.resendAfterSeconds);
      await savePendingRegistration(pending).catch(() => {});
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
      if (caughtError instanceof ApiClientError && caughtError.status === 429) {
        const retry = (caughtError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (typeof retry === 'number') startResendCooldown(retry);
      }
    } finally {
      setAction(null);
    }
  };

  const cancel = async () => {
    if (!registration || loading) return;
    setAction('cancel');
    setError(null);
    try {
      await cancelRegistration(registration);
      await clearPendingRegistration().catch(() => {});
      switchMode('register');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'AUTH_EMAIL_REGISTRATION_EXPIRED') {
        await clearPendingRegistration().catch(() => {});
        switchMode('register');
      } else {
        setError(getAuthErrorMessage(caught));
      }
    } finally {
      setAction(null);
    }
  };

  return (
    <Screen>
      <Section subtitle="Đọc truyện và đồng bộ tủ sách cá nhân trên mọi thiết bị.">
        <Card>
          {!registration && <View
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
          </View>}

          {restoreFailed && <Pressable accessibilityRole="button" disabled={loading || Boolean(registration)} style={authStyles.tab}
            onPress={() => {
              setRestoring(true);
              setRestoreFailed(false);
              setRestoreAttempt(value => value + 1);
            }}>
            <Text style={[themed.body, { color: palette.primaryMuted }]}>Thử khôi phục phiên đăng ký</Text>
          </Pressable>}

          {registration ? (
            <>
              <Text accessibilityLiveRegion="polite" style={themed.body}>
                {resent ? 'Đã gửi mã mới đến ' : 'Đã gửi mã xác nhận đến '}{registration.email}. Mã gồm 8 chữ số và có hiệu lực trong 15 phút.
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
                placeholder={mode === 'login' ? 'ten_ban hoặc email@domain.vn' : 'ban@gmail.com'}
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
            label={action === 'submit' ? 'Đang xử lý...' : submitLabel}
            accessibilityLabel={submitLabel}
            loading={action === 'submit'}
            onPress={() => void submit()}
            disabled={!canSubmit}
          />
          {registration && (
            <>
              <Pressable accessibilityRole="button" disabled={loading || resendSeconds > 0 || registration.resendsRemaining === 0}
                accessibilityState={{ disabled: loading || resendSeconds > 0 || registration.resendsRemaining === 0, busy: action === 'resend' }}
                onPress={() => void resend()} style={authStyles.tab}>
                <Text style={[themed.body, { color: loading || resendSeconds > 0 ? palette.textMuted : palette.primaryMuted }]}>
                  {action === 'resend' ? 'Đang gửi...' : registration.resendsRemaining === 0 ? 'Đã hết lượt gửi lại'
                    : resendSeconds > 0 ? `Gửi lại mã (${resendSeconds} giây)` : 'Gửi lại mã'}
                </Text>
              </Pressable>
              {cancelPrompt ? (
                <>
                  <Pressable accessibilityRole="button" disabled={loading} onPress={() => setCancelPrompt(false)} style={authStyles.tab}>
                    <Text style={[themed.body, { color: palette.primaryMuted }]}>Giữ phiên đăng ký</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={loading} onPress={() => void cancel()} style={authStyles.tab}>
                    <Text style={themed.error}>Xác nhận hủy phiên</Text>
                  </Pressable>
                </>
              ) : <Pressable accessibilityRole="button" disabled={loading} onPress={() => setCancelPrompt(true)} style={authStyles.tab}>
                <Text style={[themed.body, { color: palette.primaryMuted }]}>Hủy để đăng ký lại</Text>
              </Pressable>}
            </>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

function getAuthErrorMessage(error: unknown) {
  return error instanceof ApiClientError && /^(AUTH_EMAIL_|USER_00[45]$)/.test(error.code)
    ? error.message : getApiErrorMessage(error);
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
