import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import { getReaderChapter, getReadingPreferences, reportContent, saveReadingPreferences, syncHistory } from '../api/reader-api';
import { unlockVipChapter } from '../api/wallet-api';
import type { ReaderChapter, ReadingPreferences } from '../api/types';
import { Badge, Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';
import { colors } from '../theme/colors';

const defaultPreferences: ReadingPreferences = {
  fontFamily: 'Georgia',
  fontSize: 18,
  background: 'DARK',
  lineHeight: 1.8
};

export function ReaderScreen({
  chapterId,
  authenticated,
  onLoginRequired,
  onOpenComments,
  onOpenWallet
}: {
  chapterId: string;
  authenticated: boolean;
  onLoginRequired: () => void;
  onOpenComments: (chapterId: string) => void;
  onOpenWallet: () => void;
}) {
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [preferences, setPreferences] = useState<ReadingPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setLocked(false);

    try {
      const [chapterData, preferenceData] = await Promise.all([
        getReaderChapter(chapterId),
        authenticated ? getReadingPreferences().catch(() => defaultPreferences) : Promise.resolve(defaultPreferences)
      ]);
      setChapter(chapterData);
      setPreferences(preferenceData);

      if (authenticated) {
        await syncHistory({ novelId: chapterData.novelId, chapterId });
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.code === 'PAYMENT_002') {
        setLocked(true);
      } else {
        setError(getApiErrorMessage(caughtError));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [chapterId, authenticated]);

  const readerStyle = useMemo(() => {
    const backgroundColor =
      preferences.background === 'LIGHT' ? colors.lightBackground : preferences.background === 'SEPIA' ? colors.sepiaBackground : colors.surface;
    const color = preferences.background === 'LIGHT' ? colors.lightText : preferences.background === 'SEPIA' ? colors.sepiaText : colors.text;

    return {
      backgroundColor,
      color,
      fontSize: preferences.fontSize,
      lineHeight: preferences.fontSize * preferences.lineHeight
    };
  }, [preferences]);

  const adjustPreference = async (next: ReadingPreferences) => {
    setPreferences(next);
    if (!authenticated) {
      setNotice('Login to save reading preferences.');
      return;
    }

    try {
      await saveReadingPreferences(next);
      setNotice('Reading settings saved.');
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  const unlock = async () => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }

    try {
      await unlockVipChapter(chapterId);
      setNotice('Chapter unlocked.');
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
      onOpenWallet();
    }
  };

  if (loading) return <LoadingState label="Loading chapter..." />;

  if (locked) {
    return (
      <Screen>
        <Section title="VIP Chapter Locked" subtitle="Unlock this chapter with mock Coins to continue reading.">
          {notice ? <Text style={styles.error}>{notice}</Text> : null}
          <PrimaryButton label="Unlock chapter" onPress={unlock} />
          <GhostButton label="Open wallet" onPress={onOpenWallet} />
        </Section>
      </Screen>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title={chapter ? `Ch. ${chapter.chapterNumber}` : 'Reader'} subtitle={chapter?.title}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge label={chapter?.isVip ? `VIP ${chapter.priceCoins}` : 'Free'} tone={chapter?.isVip ? 'warning' : 'success'} />
          <Badge label={`${chapter?.wordCount ?? 0} words`} />
        </View>
      </Section>

      <Card>
        <Text style={styles.sectionTitle}>Reading Settings</Text>
        {notice ? <Text style={styles.ghostButtonText}>{notice}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <GhostButton label="A-" onPress={() => adjustPreference({ ...preferences, fontSize: Math.max(12, preferences.fontSize - 1) })} />
          <GhostButton label="A+" onPress={() => adjustPreference({ ...preferences, fontSize: Math.min(34, preferences.fontSize + 1) })} />
          <GhostButton label="Dark" onPress={() => adjustPreference({ ...preferences, background: 'DARK' })} />
          <GhostButton label="Sepia" onPress={() => adjustPreference({ ...preferences, background: 'SEPIA' })} />
          <GhostButton label="Light" onPress={() => adjustPreference({ ...preferences, background: 'LIGHT' })} />
        </View>
      </Card>

      <Card>
        <View style={{ padding: 10, borderRadius: 12, backgroundColor: readerStyle.backgroundColor }}>
          <Text style={{ color: readerStyle.color, fontSize: readerStyle.fontSize, lineHeight: readerStyle.lineHeight }}>
            {chapter?.content ?? 'No content.'}
          </Text>
        </View>
      </Card>

      <Card>
        <PrimaryButton label="Open comments" onPress={() => onOpenComments(chapterId)} />
        <GhostButton
          label="Report chapter"
          onPress={async () => {
            if (!authenticated) {
              onLoginRequired();
              return;
            }

            try {
              await reportContent({ targetType: 'CHAPTER', targetId: chapterId, reason: 'Mobile report' });
              setNotice('Report submitted.');
            } catch (caughtError) {
              setNotice(getApiErrorMessage(caughtError));
            }
          }}
        />
      </Card>
    </Screen>
  );
}
