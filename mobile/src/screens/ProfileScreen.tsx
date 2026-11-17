import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { getMyProfile, updateMyProfile } from '../api/profile-api';
import { Field } from '../components/Form';
import { Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { clearSession } from '../state/session';
import { ThemeSegmentedPicker } from '../theme/ThemeProvider';

export function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const themed = useScreenStyles();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
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
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    try {
      await updateMyProfile({ displayName, avatarUrl, bio });
      setNotice('Đã lưu thông tin hồ sơ.');
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  const confirmLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất khỏi tài khoản trên thiết bị này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => {
          void clearSession().finally(onLogout);
        }
      }
    ]);
  };

  if (loading) return <LoadingState label="Đang tải hồ sơ cá nhân..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Giao diện đọc truyện">
        <Card>
          <Text style={themed.muted}>Chọn chế độ màu hiển thị trên thiết bị này.</Text>
          <ThemeSegmentedPicker />
        </Card>
      </Section>

      <Section title="Hồ sơ cá nhân">
        <Card>
          <Field label="Tên hiển thị" value={displayName} onChangeText={setDisplayName} placeholder="Tên bút danh hoặc độc giả" />
          <Field
            label="Ảnh đại diện (URL)"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://..."
            autoCapitalize="none"
          />
          <Field
            label="Giới thiệu bản thân"
            value={bio}
            onChangeText={setBio}
            placeholder="Vài dòng giới thiệu..."
            multiline
          />
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={themed.notice}>
              {notice}
            </Text>
          ) : null}
          <PrimaryButton label="Lưu hồ sơ" onPress={save} />
          <GhostButton label="Đăng xuất" danger onPress={confirmLogout} />
        </Card>
      </Section>
    </Screen>
  );
}
