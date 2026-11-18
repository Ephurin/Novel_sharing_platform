import { useMemo, type PropsWithChildren } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightColors, type StoryCraftPalette } from '../theme/colors';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function createScreenStyles(palette: StoryCraftPalette) {
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
    sectionTitle: {
      color: palette.text,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '700',
      letterSpacing: -0.2
    },
    cardTitle: {
      color: palette.text,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700'
    },
    sectionSubtitle: {
      color: palette.textMuted,
      fontSize: 14,
      lineHeight: 20
    },
    card: {
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: palette.surface
    },
    button: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: palette.primary
    },
    buttonPressed: {
      backgroundColor: palette.primaryHover
    },
    buttonDisabled: {
      opacity: 0.5
    },
    buttonText: {
      color: palette.onPrimary,
      fontSize: 14,
      fontWeight: '700'
    },
    ghostButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: palette.controlBorder,
      borderRadius: 10,
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
      fontWeight: '600'
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: palette.neutralBg
    },
    badgeText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '600'
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
      lineHeight: 21
    },
    muted: {
      color: palette.textMuted,
      fontSize: 13,
      lineHeight: 19
    },
    notice: {
      color: palette.primaryMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600'
    },
    error: {
      color: palette.danger,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600'
    }
  });
}

/** Static light fallback kept for backwards compatibility; prefer `useScreenStyles()`. */
export const styles = createScreenStyles(lightColors);

export function useScreenStyles() {
  const { palette } = useStoryCraftTheme();
  return useMemo(() => createScreenStyles(palette), [palette]);
}

export function Screen({ children }: PropsWithChildren) {
  const themed = useScreenStyles();
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={themed.safeArea}
      >
        <ScrollView
          contentContainerStyle={themed.screen}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Section({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const themed = useScreenStyles();
  return (
    <View style={themed.section}>
      <Text accessibilityRole="header" style={themed.sectionTitle}>
        {title}
      </Text>
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
  onPress,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const themed = useScreenStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        themed.button,
        pressed && !disabled ? themed.buttonPressed : null,
        disabled ? themed.buttonDisabled : null
      ]}
      onPress={onPress}
      disabled={disabled}
    >
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
  flex
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  flex?: number;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      style={({ pressed }) => [
        themed.ghostButton,
        flex ? { flex } : null,
        active ? themed.ghostButtonActive : null,
        danger ? { borderColor: palette.danger, backgroundColor: palette.dangerBg } : null,
        pressed && !disabled ? themed.ghostButtonPressed : null,
        disabled ? themed.buttonDisabled : null
      ]}
      onPress={onPress}
    >
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

export function EmptyState({ label }: { label: string }) {
  const themed = useScreenStyles();
  return <Text style={themed.muted}>{label}</Text>;
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
