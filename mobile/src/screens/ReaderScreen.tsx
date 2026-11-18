import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import { getReaderChapter, getReadingPreferences, reportContent, saveReadingPreferences, syncHistory } from '../api/reader-api';
import { unlockVipChapter } from '../api/wallet-api';
import type { ReaderChapter, ReadingPreferences } from '../api/types';
import { Badge, Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';
import { colors } from '../theme/colors';
import type { AnchorInput } from '../api/social-api';
import { paragraphCounts } from '../api/social-api';
import { useFocusedResource } from '../state/useFocusedResource';

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
  onOpenComments: (chapterId: string, anchor?: AnchorInput) => void;
  onOpenWallet: () => void;
}) {
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [preferences, setPreferences] = useState<ReadingPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focused = useIsFocused();
  const markers = useFocusedResource(`markers:${chapterId}:${authenticated}`, () => authenticated ? paragraphCounts(chapterId) : Promise.resolve({} as Record<string, number>));

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
    if (focused) void load();
    const listener = AppState.addEventListener('change', state => { if (focused && state === 'active') void load(); });
    return () => listener.remove();
  }, [chapterId, authenticated, focused]);

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
          {(chapter?.content ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map((block, index) => {
            const paragraph = chapter?.paragraphs?.find(p => p.paragraphIndex === index && p.text === block.trim());
            const discuss = paragraph && chapter?.contentVersion ? () => { if (!authenticated) onLoginRequired(); else onOpenComments(chapterId, { contentVersion: chapter.contentVersion!, paragraphId: paragraph.paragraphId }); } : undefined;
            return <Pressable key={paragraph?.paragraphId ?? index} accessibilityRole={discuss ? 'button' : undefined} accessibilityHint={discuss ? 'Nhấn giữ để trao đổi về đoạn này' : undefined} onLongPress={discuss} onAccessibilityTap={discuss} delayLongPress={500}>
              <Text style={{ color: readerStyle.color, fontSize: readerStyle.fontSize, lineHeight: readerStyle.lineHeight, marginBottom: 16 }}>{block}{paragraph && markers.data?.[paragraph.paragraphId] ? `  · ${markers.data[paragraph.paragraphId]} trao đổi riêng` : ''}</Text>
            </Pressable>;
          })}
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
