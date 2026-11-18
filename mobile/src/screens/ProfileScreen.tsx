import type { CurrentUser } from '../api/types';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { getMyProfile, updateMyProfile } from '../api/profile-api';
import { AvatarBadge } from '../components/BookCover';
import { Field } from '../components/Form';
import {
  Card,
  ErrorState,
  GhostButton,
  LoadingState,
  PrimaryButton,
  Screen,
  Section,
  useScreenStyles
} from '../components/Screen';
import { clearSession } from '../state/session';
import { ThemeSegmentedPicker } from '../theme/ThemeProvider';

export function ProfileScreen({ user, onLogout, onConnections, onFeedback }: { user?: CurrentUser; onLogout: () => void; onConnections?: () => void; onFeedback?: (box: 'sent' | 'received') => void }) {
  const themed = useScreenStyles();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarFieldError, setAvatarFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const profile = await getMyProfile();
      setDisplayName(profile.displayName ?? '');
      setAvatarUrl(profile.avatarUrl ?? '');
      setBio(profile.bio ?? '');
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const save = async () => {
    if (saving) return;
    const trimmedName = displayName.trim();
    const trimmedAvatar = avatarUrl.trim();
    const trimmedBio = bio.trim();

    setNotice(null);
    setSaveError(null);

    if (trimmedAvatar && !/^https?:\/\//i.test(trimmedAvatar)) {
      const msg = 'Ảnh đại diện (URL) phải bắt đầu bằng http:// hoặc https://.';
      setAvatarFieldError(msg);
      return;
    }
    setAvatarFieldError(null);

    setSaving(true);
    try {
      await updateMyProfile({
        ...(trimmedName ? { displayName: trimmedName } : {}),
        avatarUrl: trimmedAvatar ? trimmedAvatar : null,
        bio: trimmedBio ? trimmedBio : null
      });
      setNotice('Đã lưu thông tin hồ sơ.');
    } catch (caughtError) {
      setSaveError(getApiErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    const message = 'Bạn có chắc muốn đăng xuất khỏi tài khoản trên thiết bị này?';
    const performLogout = () => {
      void clearSession().finally(onLogout);
    };

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (globalThis.confirm(message)) {
        performLogout();
      }
      return;
    }

    Alert.alert('Đăng xuất', message, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: performLogout
      }
    ]);
  };

  if (loading) return <LoadingState label="Đang tải hồ sơ cá nhân..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  const previewName = displayName.trim() || 'Độc giả StoryCraft';
  const previewAvatar = /^https?:\/\//i.test(avatarUrl.trim()) ? avatarUrl.trim() : null;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      {user && onConnections && onFeedback && <Card>
        <GhostButton label="Bạn bè" onPress={onConnections} />
        <GhostButton label="Góp ý đã gửi" onPress={() => onFeedback('sent')} />
        {(user.role === 'AUTHOR' || user.role === 'ADMIN') && <GhostButton label="Góp ý gửi tôi" onPress={() => onFeedback('received')} />}
      </Card>}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <AvatarBadge size="lg" uri={previewAvatar} name={previewName} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={themed.cardTitle} numberOfLines={2}>
              {previewName}
            </Text>
            <Text style={themed.muted} numberOfLines={2}>
              {bio.trim() ? bio.trim() : 'Độc giả StoryCraft Văn Hoa'}
            </Text>
          </View>
        </View>

        <Field
          label="Tên hiển thị"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Tên bút danh hoặc độc giả"
          editable={!saving}
        />
        <Field
          label="Ảnh đại diện (URL)"
          value={avatarUrl}
          onChangeText={(next) => {
            setAvatarUrl(next);
            if (avatarFieldError) setAvatarFieldError(null);
          }}
          placeholder="https://..."
          autoCapitalize="none"
          keyboardType="url"
          editable={!saving}
          error={avatarFieldError}
        />
        <Field
          label="Giới thiệu bản thân"
          value={bio}
          onChangeText={setBio}
          placeholder="Vài dòng giới thiệu..."
          multiline
          editable={!saving}
        />
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        {saveError ? (
          <Text accessibilityLiveRegion="polite" style={themed.error}>
            {saveError}
          </Text>
        ) : null}
        <PrimaryButton
          label={saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
          accessibilityLabel="Lưu hồ sơ"
          loading={saving}
          disabled={saving}
          onPress={() => void save()}
        />
        <GhostButton
          label="Đăng xuất"
          danger
          disabled={saving}
          onPress={confirmLogout}
        />
      </Card>

      <Section title="Giao diện đọc truyện">
        <Card>
          <Text style={themed.muted}>Chọn chế độ màu hiển thị trên thiết bị này.</Text>
          <ThemeSegmentedPicker />
        </Card>
      </Section>
    </Screen>
  );
}
