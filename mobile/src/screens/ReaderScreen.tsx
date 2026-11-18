import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import { getReaderChapter, getReadingPreferences, reportContent, saveReadingPreferences, syncHistory } from '../api/reader-api';
import type { ReaderChapter, ReadingBackground, ReadingPreferences } from '../api/types';
import { unlockVipChapter } from '../api/wallet-api';
import { Badge, Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function resolveMobileReaderFontFamily(
  fontFamily: string | null | undefined,
  os: string = Platform.OS
): string | undefined {
  const trimmed = fontFamily?.trim() ?? '';
  if (os === 'web') {
    return trimmed || 'Georgia, serif';
  }
  const prefersSans = trimmed.length > 0 && /sans|vietnam|jakarta|inter|system/i.test(trimmed);
  if (os === 'ios') {
    return prefersSans ? undefined : 'Georgia';
  }
  return prefersSans ? 'sans-serif' : 'serif';
}

export function resolveReaderPaperTone(background: ReadingBackground): 'light' | 'sepia' | 'dark' {
  if (background === 'SEPIA') return 'sepia';
  if (background === 'DARK' || background === 'BLACK') return 'dark';
  return 'light';
}

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
  const { palette, scheme } = useStoryCraftTheme();
  const themed = useScreenStyles();

  const fallbackPreferences = useMemo<ReadingPreferences>(
    () => ({
      fontFamily: null,
      fontSize: 18,
      background: scheme === 'dark' ? 'DARK' : 'LIGHT',
      lineHeight: 1.8
    }),
    [scheme]
  );

  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [preferences, setPreferences] = useState<ReadingPreferences>(fallbackPreferences);
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
        authenticated
          ? getReadingPreferences().catch(() => fallbackPreferences)
          : Promise.resolve(fallbackPreferences)
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

  const paperTone = resolveReaderPaperTone(preferences.background);

  const readerStyle = useMemo(() => {
    const backgroundColor =
      paperTone === 'light'
        ? palette.lightBackground
        : paperTone === 'sepia'
        ? palette.sepiaBackground
        : palette.darkBackground;
    const color =
      paperTone === 'light'
        ? palette.lightText
        : paperTone === 'sepia'
        ? palette.sepiaText
        : palette.darkText;

    return {
      backgroundColor,
      color,
      fontFamily: resolveMobileReaderFontFamily(preferences.fontFamily),
      fontSize: preferences.fontSize,
      lineHeight: Math.round(preferences.fontSize * preferences.lineHeight)
    };
  }, [palette, paperTone, preferences.fontFamily, preferences.fontSize, preferences.lineHeight]);

  const adjustPreference = async (next: ReadingPreferences) => {
    setPreferences(next);
    if (!authenticated) {
      setNotice('Đăng nhập để đồng bộ tùy chỉnh đọc truyện.');
      return;
    }

    try {
      await saveReadingPreferences(next);
      setNotice('Đã lưu tùy chỉnh đọc truyện.');
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
      setNotice('Đã mở khóa chương thành công.');
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
      onOpenWallet();
    }
  };

  if (loading) return <LoadingState label="Đang tải chương truyện..." />;

  if (locked) {
    return (
      <Screen>
        <Section
          title="Chương VIP đang khóa"
          subtitle="Mở khóa chương bằng Xu mô phỏng trong Ví Xu để tiếp tục đọc."
        >
          <Card>
            {notice ? <Text style={themed.error}>{notice}</Text> : null}
            <PrimaryButton label="Mở khóa chương" onPress={unlock} />
            <GhostButton label="Mở Ví Xu" onPress={onOpenWallet} />
          </Card>
        </Section>
      </Screen>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section
        title={chapter ? `Chương ${chapter.chapterNumber}` : 'Đọc chương'}
        subtitle={chapter?.title}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge
            label={chapter?.isVip ? `VIP · ${chapter.priceCoins} Xu` : 'Miễn phí'}
            tone={chapter?.isVip ? 'warning' : 'success'}
          />
          <Badge label={`${(chapter?.wordCount ?? 0).toLocaleString('vi-VN')} từ`} />
        </View>
      </Section>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={themed.cardTitle}>Tùy chỉnh đọc</Text>
          <Text style={themed.muted}>{preferences.fontSize}px</Text>
        </View>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <GhostButton
            label="A-"
            accessibilityLabel="Giảm cỡ chữ"
            onPress={() =>
              adjustPreference({
                ...preferences,
                fontSize: Math.max(14, preferences.fontSize - 1)
              })
            }
          />
          <GhostButton
            label="A+"
            accessibilityLabel="Tăng cỡ chữ"
            onPress={() =>
              adjustPreference({
                ...preferences,
                fontSize: Math.min(30, preferences.fontSize + 1)
              })
            }
          />
          <GhostButton
            label="Sáng"
            active={preferences.background === 'LIGHT'}
            onPress={() => adjustPreference({ ...preferences, background: 'LIGHT' })}
          />
          <GhostButton
            label="Sepia"
            active={preferences.background === 'SEPIA'}
            onPress={() => adjustPreference({ ...preferences, background: 'SEPIA' })}
          />
          <GhostButton
            label="Tối"
            active={preferences.background === 'DARK' || preferences.background === 'BLACK'}
            onPress={() => adjustPreference({ ...preferences, background: 'DARK' })}
          />
        </View>
      </Card>

      <View
        style={{
          padding: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: readerStyle.backgroundColor
        }}
      >
        <Text
          style={{
            color: readerStyle.color,
            fontFamily: readerStyle.fontFamily,
            fontSize: readerStyle.fontSize,
            lineHeight: readerStyle.lineHeight
          }}
        >
          {chapter?.content ?? 'Chương này chưa có nội dung.'}
        </Text>
      </View>

      <Card>
        <PrimaryButton label="Xem bình luận chương" onPress={() => onOpenComments(chapterId)} />
        <GhostButton
          label="Báo cáo chương"
          onPress={async () => {
            if (!authenticated) {
              onLoginRequired();
              return;
            }

            try {
              await reportContent({
                targetType: 'CHAPTER',
                targetId: chapterId,
                reason: 'Báo cáo chương từ ứng dụng di động'
              });
              setNotice('Đã gửi báo cáo chương.');
            } catch (caughtError) {
              setNotice(getApiErrorMessage(caughtError));
            }
          }}
        />
      </Card>
    </Screen>
  );
}
