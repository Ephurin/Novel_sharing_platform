import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { getMyProfile, updateMyProfile } from '../api/profile-api';
import { clearSession } from '../state/session';
import { Field } from '../components/Form';
import { Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';

export function ProfileScreen({ onLogout }: { onLogout: () => void }) {
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
      setNotice('Profile saved.');
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Loading profile..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Profile">
        <Card>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Field label="Avatar URL" value={avatarUrl} onChangeText={setAvatarUrl} />
          <Field label="Bio" value={bio} onChangeText={setBio} multiline />
          {notice ? <Text style={styles.ghostButtonText}>{notice}</Text> : null}
          <PrimaryButton label="Save profile" onPress={save} />
          <GhostButton
            label="Logout"
            onPress={async () => {
              await clearSession();
              onLogout();
            }}
          />
        </Card>
      </Section>
    </Screen>
  );
}
