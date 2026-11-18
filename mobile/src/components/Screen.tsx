import { useEffect, useRef } from 'react';
import { useMemo, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightColors, type StoryCraftPalette } from '../theme/colors';
import { resolveStoryCraftFontFamily, useStoryCraftTheme } from '../theme/ThemeProvider';

export function createScreenStyles(palette: StoryCraftPalette, fontsLoaded = false) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: palette.background
    },
    screen: {
      minHeight: '100%',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 28,
      gap: 16,
      backgroundColor: palette.background
    },
    section: {
      gap: 10
    },
    pageTitle: {
      color: palette.text,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '700',
      fontFamily: resolveStoryCraftFontFamily('700', fontsLoaded),
      letterSpacing: -0.2
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 18,
      lineHeight: 26,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    },
    cardTitle: {
      color: palette.text,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    },
    sectionSubtitle: {
      color: palette.textMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '400',
      fontFamily: resolveStoryCraftFontFamily('400', fontsLoaded)
    },
    card: {
      gap: 10,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: palette.surface
    },
    button: {
      minHeight: 44,
      minWidth: 44,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: palette.primary
    },
    buttonPressed: {
      backgroundColor: palette.primaryHover
    },
    buttonDisabled: {
      opacity: 0.55
    },
    buttonText: {
      color: palette.onPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    },
    ghostButton: {
      minHeight: 44,
      minWidth: 44,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: palette.controlBorder,
      borderRadius: 8,
      backgroundColor: palette.surface
    },
    ghostButtonActive: {
      borderColor: palette.primaryMuted,
      backgroundColor: palette.primarySoft
    },
    ghostButtonPressed: {
      backgroundColor: palette.neutralBg
    },
    ghostButtonText: {
      color: palette.primaryMuted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    },
    badge: {
      alignSelf: 'flex-start',
      minHeight: 22,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: palette.neutralBg
    },
    badgeText: {
      color: palette.text,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      fontFamily: resolveStoryCraftFontFamily('500', fontsLoaded)
    },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 24,
      backgroundColor: palette.background
    },
    body: {
      color: palette.text,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '400',
      fontFamily: resolveStoryCraftFontFamily('400', fontsLoaded)
    },
    muted: {
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
      fontFamily: resolveStoryCraftFontFamily('400', fontsLoaded)
    },
    notice: {
      color: palette.primaryMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    },
    error: {
      color: palette.danger,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      fontFamily: resolveStoryCraftFontFamily('600', fontsLoaded)
    }
  });
}

/** Static light fallback kept for backwards compatibility; prefer `useScreenStyles()`. */
export const styles = createScreenStyles(lightColors);

export function useScreenStyles() {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  return useMemo(() => createScreenStyles(palette, fontsLoaded), [palette, fontsLoaded]);
}

export function Screen({
  children,
  refreshing = false,
  onRefresh,
  focusY
}: PropsWithChildren<{
  refreshing?: boolean;
  onRefresh?: () => void;
  focusY?: number;
}>) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (focusY === undefined) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, focusY - 20), animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [focusY]);
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={themed.safeArea}
      >
        <ScrollView ref={scroll}
          contentContainerStyle={themed.screen}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={palette.primaryMuted}
                colors={[palette.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Section({
  title,
  subtitle,
  rightAction,
  children
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  rightAction?: ReactNode;
}>) {
  const themed = useScreenStyles();
  return (
    <View style={themed.section}>
      {title || rightAction ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {title ? (
            <Text accessibilityRole="header" style={[themed.sectionTitle, { flex: 1 }]}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {rightAction}
        </View>
      ) : null}
      {subtitle ? <Text style={themed.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  const themed = useScreenStyles();
  return <View style={themed.card}>{children}</View>;
}

export function PrimaryButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  icon,
  flex
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  flex?: number;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        themed.button,
        flex ? { flex } : null,
        pressed && !isDisabled ? themed.buttonPressed : null,
        isDisabled ? themed.buttonDisabled : null
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? <ActivityIndicator size="small" color={palette.onPrimary} /> : icon}
      <Text style={themed.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  accessibilityLabel,
  onPress,
  active = false,
  danger = false,
  disabled = false,
  loading = false,
  expanded,
  icon,
  flex
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  expanded?: boolean;
  icon?: ReactNode;
  flex?: number;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
        selected: active,
        ...(expanded !== undefined ? { expanded } : {})
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        themed.ghostButton,
        flex ? { flex } : null,
        active ? themed.ghostButtonActive : null,
        danger ? { borderColor: palette.danger, backgroundColor: palette.dangerBg } : null,
        pressed && !isDisabled ? themed.ghostButtonPressed : null,
        isDisabled ? themed.buttonDisabled : null
      ]}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={danger ? palette.danger : palette.primaryMuted} />
      ) : (
        icon
      )}
      <Text
        style={[
          themed.ghostButtonText,
          danger ? { color: palette.danger } : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'default'
}: {
  label: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();

  const colorsByTone =
    tone === 'primary'
      ? { bg: palette.primarySoft, fg: palette.primaryMuted }
      : tone === 'success'
      ? { bg: palette.successBg, fg: palette.success }
      : tone === 'warning'
      ? { bg: palette.warningBg, fg: palette.warning }
      : tone === 'danger'
      ? { bg: palette.dangerBg, fg: palette.danger }
      : { bg: palette.neutralBg, fg: palette.text };

  return (
    <View style={[themed.badge, { backgroundColor: colorsByTone.bg }]}>
      <Text style={[themed.badgeText, { color: colorsByTone.fg }]}>{label}</Text>
    </View>
  );
}

export function LoadingState({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  return (
    <View accessibilityRole="progressbar" style={themed.state}>
      <ActivityIndicator color={palette.primaryMuted} />
      <Text style={themed.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  label,
  actionLabel,
  onAction
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const themed = useScreenStyles();
  return (
    <View style={{ gap: 10, paddingVertical: 8 }}>
      <Text style={themed.muted}>{label}</Text>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const themed = useScreenStyles();
  return (
    <Card>
      <Text accessibilityLiveRegion="polite" style={themed.error}>
        {message}
      </Text>
      {onRetry ? <GhostButton label="Thử lại" onPress={onRetry} /> : null}
    </Card>
  );
}
