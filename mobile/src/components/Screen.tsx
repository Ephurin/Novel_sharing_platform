import type { PropsWithChildren } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

export function Screen({ children }: PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>;
}

export function Section({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
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
  return (
    <TouchableOpacity style={[styles.button, disabled ? styles.buttonDisabled : null]} onPress={onPress} disabled={disabled}>
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.ghostButton} onPress={onPress}>
      <Text style={styles.ghostButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneStyle =
    tone === 'success' ? styles.badgeSuccess : tone === 'warning' ? styles.badgeWarning : tone === 'danger' ? styles.badgeDanger : null;

  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primaryMuted} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <Text style={styles.muted}>{label}</Text>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <Text style={styles.error}>{message}</Text>
      {onRetry ? <GhostButton label="Retry" onPress={onRetry} /> : null}
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: {
    minHeight: '100%',
    padding: 18,
    gap: 14,
    backgroundColor: colors.background
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  sectionSubtitle: {
    color: colors.textMuted,
    lineHeight: 20
  },
  card: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface
  },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.primary
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: colors.text,
    fontWeight: '800'
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12
  },
  ghostButtonText: {
    color: colors.primaryMuted,
    fontWeight: '700'
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted
  },
  badgeSuccess: {
    backgroundColor: '#14532d'
  },
  badgeWarning: {
    backgroundColor: '#713f12'
  },
  badgeDanger: {
    backgroundColor: '#7f1d1d'
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  state: {
    alignItems: 'center',
    gap: 10,
    padding: 20
  },
  muted: {
    color: colors.textMuted
  },
  error: {
    color: colors.danger
  }
});
