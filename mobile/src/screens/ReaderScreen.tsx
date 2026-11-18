import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { ApiClientError, getApiErrorMessage } from '../api/api-client';
import {
  getReaderChapter,
  getReaderNovel,
  getReadingPreferences,
  reportContent,
  saveReadingPreferences,
  syncHistory
} from '../api/reader-api';
import type { ReaderChapter, ReadingBackground, ReadingPreferences } from '../api/types';
import { unlockVipChapter } from '../api/wallet-api';
import { AppIcon } from '../components/Icons';
import { ReportReasonModal } from '../components/ReportSheet';
import {
  Badge,
  Card,
  ErrorState,
  GhostButton,
  LoadingState,
  PrimaryButton,
  Screen,
  Section,
  useScreenStyles
} from '../components/Screen';
import { getReadingBackgroundColors, READING_BACKGROUND_OPTIONS } from '../theme/colors';
import { useStoryCraftTheme } from '../theme/ThemeProvider';
import { stripDuplicateChapterPrefix } from '../utils/format';

export function resolveMobileReaderFontFamily(
  fontFamily: string | null | undefined,
  os: string = Platform.OS,
  fontsLoaded = false
): string | undefined {
  const trimmed = fontFamily?.trim() ?? '';
  if (os === 'web') {
    return trimmed || 'Georgia, serif';
  }
  const prefersSans = trimmed.length > 0 && /sans|vietnam|jakarta|inter|system/i.test(trimmed);
  if (prefersSans && fontsLoaded) {
    return 'BeVietnamPro_400Regular';
  }
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

function isInsufficientCoinsError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return (
      error.code === 'PAYMENT_002' ||
      error.code === 'PAYMENT_003' ||
      error.status === 402 ||
      /insufficient|không đủ/i.test(error.message)
    );
  }
  if (error instanceof Error) {
    return /PAYMENT_002|PAYMENT_003|insufficient|không đủ/i.test(error.message);
  }
  return false;
}

function extractNovelIdFromError(error: unknown): string | null {
  if (error instanceof ApiClientError && error.details && typeof error.details === 'object') {
    const candidate = (error.details as { novelId?: unknown }).novelId;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function ReaderScreen({
  chapterId,
  novelId,
  authenticated,
  onLoginRequired,
  onOpenComments,
  onOpenWallet,
  onOpenChapter
}: {
  chapterId: string;
  novelId?: string;
  authenticated: boolean;
  onLoginRequired: () => void;
  onOpenComments: (chapterId: string) => void;
  onOpenWallet: () => void;
  onOpenChapter?: (chapterId: string) => void;
}) {
  const { palette, scheme, fontsLoaded } = useStoryCraftTheme();
  const themed = useScreenStyles();

  const [prevPropChapterId, setPrevPropChapterId] = useState(chapterId);
  const [activeChapterId, setActiveChapterId] = useState(chapterId);
  if (prevPropChapterId !== chapterId) {
    setPrevPropChapterId(chapterId);
    setActiveChapterId(chapterId);
  }

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
  const [novelChapters, setNovelChapters] = useState<ReaderChapter[]>([]);
  const [preferences, setPreferences] = useState<ReadingPreferences>(fallbackPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const activeChapterIdRef = useRef(activeChapterId);
  activeChapterIdRef.current = activeChapterId;

  const requestSeqRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const novelFetchSeqRef = useRef(0);
  const inFlightNovelIdRef = useRef<string | null>(null);
  const knownNovelIdRef = useRef<string | null>(novelId ?? null);
  const novelChaptersNovelIdRef = useRef<string | null>(null);
  const novelChaptersRef = useRef<ReaderChapter[]>([]);
  novelChaptersRef.current = novelChapters;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      novelFetchSeqRef.current += 1;
      inFlightNovelIdRef.current = null;
      activeControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setReportModalOpen(false);
    setReportError(null);
  }, [activeChapterId]);

  const loadNovelChapters = (
    targetNovelId: string,
    expectedReqId: number,
    signal?: AbortSignal
  ) => {
    if (
      novelChaptersNovelIdRef.current === targetNovelId ||
      inFlightNovelIdRef.current === targetNovelId
    ) {
      return;
    }
    inFlightNovelIdRef.current = targetNovelId;
    const novelReqId = ++novelFetchSeqRef.current;

    void getReaderNovel(targetNovelId, signal)
      .then((novelData) => {
        if (novelReqId === novelFetchSeqRef.current) {
          inFlightNovelIdRef.current = null;
        }
        if (
          !mountedRef.current ||
          signal?.aborted ||
          expectedReqId !== requestSeqRef.current ||
          novelReqId !== novelFetchSeqRef.current
        ) {
          return;
        }
        const ordered = [...(novelData.chapters ?? [])].sort(
          (a, b) => a.chapterNumber - b.chapterNumber
        );
        novelChaptersNovelIdRef.current = targetNovelId;
        knownNovelIdRef.current = targetNovelId;
        setNovelChapters(ordered);
      })
      .catch(() => {
        if (novelReqId === novelFetchSeqRef.current) {
          inFlightNovelIdRef.current = null;
        }
      });
  };

  const load = async (targetChapterId = activeChapterId) => {
    activeControllerRef.current?.abort();
    inFlightNovelIdRef.current = null;
    novelFetchSeqRef.current += 1;

    const reqId = ++requestSeqRef.current;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeControllerRef.current = controller;
    const signal = controller?.signal;

    const isCurrent = () =>
      mountedRef.current && !signal?.aborted && reqId === requestSeqRef.current;

    setLoading(true);
    setError(null);
    setUnlockError(null);
    setPrefError(null);
    setLocked(false);

    try {
      const [chapterData, preferenceData] = await Promise.all([
        getReaderChapter(targetChapterId, signal),
        authenticated
          ? getReadingPreferences(signal).catch(() => fallbackPreferences)
          : Promise.resolve(fallbackPreferences)
      ]);
      if (!isCurrent()) return;

      setChapter(chapterData);
      setPreferences(preferenceData);
      knownNovelIdRef.current = chapterData.novelId;

      if (novelChaptersNovelIdRef.current !== chapterData.novelId) {
        if (novelChaptersNovelIdRef.current !== null) {
          novelChaptersNovelIdRef.current = null;
          setNovelChapters([]);
        }
        loadNovelChapters(chapterData.novelId, reqId, signal);
      }

      if (authenticated) {
        await syncHistory({ novelId: chapterData.novelId, chapterId: targetChapterId }, signal);
      }
    } catch (caughtError) {
      if (!isCurrent()) return;

      setChapter(null);
      if (caughtError instanceof ApiClientError && caughtError.code === 'PAYMENT_002') {
        setLocked(true);
        const chapterInCurrentList = novelChaptersRef.current.some(
          (item) => item.chapterId === targetChapterId
        );
        const resolvedNovelId =
          extractNovelIdFromError(caughtError) ??
          novelId ??
          (chapterInCurrentList || novelChaptersNovelIdRef.current === null
            ? knownNovelIdRef.current
            : null);

        if (resolvedNovelId) {
          knownNovelIdRef.current = resolvedNovelId;
          if (novelChaptersNovelIdRef.current !== resolvedNovelId) {
            if (novelChaptersNovelIdRef.current !== null) {
              novelChaptersNovelIdRef.current = null;
              setNovelChapters([]);
            }
            loadNovelChapters(resolvedNovelId, reqId, signal);
          }
        } else if (!chapterInCurrentList && novelChaptersNovelIdRef.current !== null) {
          novelChaptersNovelIdRef.current = null;
          setNovelChapters([]);
        }
      } else {
        setError(getApiErrorMessage(caughtError));
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!novelId) return;
    if (knownNovelIdRef.current && knownNovelIdRef.current !== novelId) {
      novelChaptersNovelIdRef.current = null;
      setNovelChapters([]);
    }
    knownNovelIdRef.current = novelId;
    if (locked && novelChaptersNovelIdRef.current !== novelId) {
      loadNovelChapters(novelId, requestSeqRef.current, activeControllerRef.current?.signal);
    }
  }, [novelId, locked]);

  useEffect(() => {
    void load(activeChapterId);
    return () => {
      requestSeqRef.current += 1;
      novelFetchSeqRef.current += 1;
      inFlightNovelIdRef.current = null;
      activeControllerRef.current?.abort();
    };
  }, [activeChapterId, authenticated]);

  const { prevChapter, nextChapter } = useMemo(() => {
    const idx = novelChapters.findIndex((c) => c.chapterId === activeChapterId);
    if (idx < 0) return { prevChapter: null, nextChapter: null };
    return {
      prevChapter: idx > 0 ? novelChapters[idx - 1] : null,
      nextChapter: idx + 1 < novelChapters.length ? novelChapters[idx + 1] : null
    };
  }, [novelChapters, activeChapterId]);

  const navigateToSibling = (nextId: string) => {
    setNotice(null);
    setActiveChapterId(nextId);
    onOpenChapter?.(nextId);
  };

  const readerStyle = useMemo(() => {
    const paper = getReadingBackgroundColors(palette, preferences.background);
    return {
      backgroundColor: paper.backgroundColor,
      color: paper.color,
      fontFamily: resolveMobileReaderFontFamily(preferences.fontFamily, Platform.OS, fontsLoaded),
      fontSize: preferences.fontSize,
      lineHeight: Math.round(preferences.fontSize * preferences.lineHeight)
    };
  }, [palette, fontsLoaded, preferences.background, preferences.fontFamily, preferences.fontSize, preferences.lineHeight]);

  const adjustPreference = async (next: ReadingPreferences) => {
    setPreferences(next);
    setPrefError(null);
    if (!authenticated) {
      setNotice('Đăng nhập để đồng bộ tùy chỉnh đọc truyện.');
      return;
    }

    try {
      await saveReadingPreferences(next);
      setNotice('Đã lưu tùy chỉnh đọc truyện.');
    } catch (caughtError) {
      setPrefError(getApiErrorMessage(caughtError));
    }
  };

  const unlock = async () => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }
    if (unlocking) return;

    const targetChapterId = activeChapterId;
    setUnlocking(true);
    setUnlockError(null);
    setNotice(null);
    try {
      await unlockVipChapter(targetChapterId);
      if (!mountedRef.current || activeChapterIdRef.current !== targetChapterId) return;
      setNotice('Đã mở khóa chương thành công.');
      await load(targetChapterId);
    } catch (caughtError) {
      if (!mountedRef.current || activeChapterIdRef.current !== targetChapterId) return;
      const message = getApiErrorMessage(caughtError);
      setUnlockError(message);
      if (isInsufficientCoinsError(caughtError)) {
        onOpenWallet();
      }
    } finally {
      if (mountedRef.current) {
        setUnlocking(false);
      }
    }
  };

  const handleSubmitReport = async (payload: { reason: string; description?: string }) => {
    const targetChapterId = activeChapterId;
    setReporting(true);
    setReportError(null);
    try {
      await reportContent({
        targetType: 'CHAPTER',
        targetId: targetChapterId,
        reason: payload.reason,
        ...(payload.description ? { description: payload.description } : {})
      });
      if (!mountedRef.current || activeChapterIdRef.current !== targetChapterId) return;
      setReportModalOpen(false);
      setNotice('Đã gửi báo cáo chương.');
    } catch (caughtError) {
      if (!mountedRef.current || activeChapterIdRef.current !== targetChapterId) return;
      setReportError(getApiErrorMessage(caughtError));
    } finally {
      if (mountedRef.current) {
        setReporting(false);
      }
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
            {unlockError ? (
              <Text accessibilityLiveRegion="polite" style={themed.error}>
                {unlockError}
              </Text>
            ) : null}
            <PrimaryButton
              label="Mở khóa chương"
              loading={unlocking}
              disabled={unlocking}
              onPress={() => void unlock()}
            />
            <GhostButton
              label="Mở Ví Xu"
              disabled={unlocking}
              onPress={onOpenWallet}
            />
          </Card>
        </Section>

        {prevChapter || nextChapter ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GhostButton
              flex={1}
              label="Chương trước"
              accessibilityLabel="Chương trước"
              disabled={!prevChapter || unlocking}
              icon={<AppIcon name="chevron-left" size={16} color={palette.primaryMuted} />}
              onPress={() => {
                if (prevChapter) navigateToSibling(prevChapter.chapterId);
              }}
            />
            <GhostButton
              flex={1}
              label="Chương tiếp"
              accessibilityLabel="Chương tiếp"
              disabled={!nextChapter || unlocking}
              icon={<AppIcon name="chevron-right" size={16} color={palette.primaryMuted} />}
              onPress={() => {
                if (nextChapter) navigateToSibling(nextChapter.chapterId);
              }}
            />
          </View>
        ) : null}
      </Screen>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => void load(activeChapterId)} />;

  const cleanedSubtitle = chapter
    ? stripDuplicateChapterPrefix(chapter.chapterNumber, chapter.title)
    : '';

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        {chapter ? (
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={themed.sectionTitle}>
              Chương {chapter.chapterNumber}
            </Text>
            {cleanedSubtitle ? <Text style={themed.sectionSubtitle}>{cleanedSubtitle}</Text> : null}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge
              label={chapter?.isVip ? `VIP · ${chapter.priceCoins} Xu` : 'Miễn phí'}
              tone={chapter?.isVip ? 'warning' : 'success'}
            />
            <Badge label={`${(chapter?.wordCount ?? 0).toLocaleString('vi-VN')} từ`} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <GhostButton
              label="A-"
              accessibilityLabel="Giảm cỡ chữ"
              onPress={() =>
                void adjustPreference({
                  ...preferences,
                  fontSize: Math.max(14, preferences.fontSize - 1)
                })
              }
            />
            <GhostButton
              label="A+"
              accessibilityLabel="Tăng cỡ chữ"
              onPress={() =>
                void adjustPreference({
                  ...preferences,
                  fontSize: Math.min(30, preferences.fontSize + 1)
                })
              }
            />
            <GhostButton
              label="Aa Tùy chỉnh"
              accessibilityLabel="Aa Tùy chỉnh"
              active={settingsOpen}
              expanded={settingsOpen}
              icon={<AppIcon name="sliders" size={16} color={palette.primaryMuted} />}
              onPress={() => setSettingsOpen((prev) => !prev)}
            />
          </View>
        </View>

        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        {prefError ? (
          <Text accessibilityLiveRegion="polite" style={themed.error}>
            {prefError}
          </Text>
        ) : null}
      </View>

      {settingsOpen ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={themed.cardTitle}>Tùy chỉnh đọc</Text>
            <Text style={themed.muted}>
              Cỡ chữ {preferences.fontSize}px · Giãn dòng {preferences.lineHeight.toFixed(1)}
            </Text>
          </View>

          <Text style={themed.muted}>Màu nền trang sách</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {READING_BACKGROUND_OPTIONS.map((option) => (
              <GhostButton
                key={option.value}
                label={option.label}
                accessibilityLabel={`Nền đọc ${option.label}`}
                active={preferences.background === option.value}
                onPress={() =>
                  void adjustPreference({ ...preferences, background: option.value })
                }
              />
            ))}
          </View>

          <Text style={themed.muted}>Độ giãn dòng</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1.6, 1.8, 2.0].map((lh) => (
              <GhostButton
                key={lh}
                flex={1}
                label={`${lh.toFixed(1)}x`}
                accessibilityLabel={`Giãn dòng ${lh.toFixed(1)}`}
                active={Math.abs(preferences.lineHeight - lh) < 0.05}
                onPress={() => void adjustPreference({ ...preferences, lineHeight: lh })}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <View
        style={{
          padding: 18,
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

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <GhostButton
          flex={1}
          label="Chương trước"
          accessibilityLabel="Chương trước"
          disabled={!prevChapter}
          icon={<AppIcon name="chevron-left" size={16} color={palette.primaryMuted} />}
          onPress={() => {
            if (prevChapter) navigateToSibling(prevChapter.chapterId);
          }}
        />
        <PrimaryButton
          flex={1}
          label="Chương tiếp"
          accessibilityLabel="Chương tiếp"
          disabled={!nextChapter}
          icon={<AppIcon name="chevron-right" size={16} color={palette.onPrimary} />}
          onPress={() => {
            if (nextChapter) navigateToSibling(nextChapter.chapterId);
          }}
        />
      </View>

      <Card>
        <PrimaryButton
          label="Xem bình luận chương"
          icon={<AppIcon name="message-square" size={16} color={palette.onPrimary} />}
          onPress={() => onOpenComments(activeChapterId)}
        />
        <GhostButton
          label="Báo cáo chương"
          icon={<AppIcon name="flag" size={16} color={palette.primaryMuted} />}
          onPress={() => {
            if (!authenticated) {
              onLoginRequired();
              return;
            }
            setReportError(null);
            setReportModalOpen(true);
          }}
        />
      </Card>

      <ReportReasonModal
        visible={reportModalOpen}
        title="Báo cáo chương"
        targetKey={activeChapterId}
        submitting={reporting}
        error={reportError}
        onClose={() => setReportModalOpen(false)}
        onSubmit={(payload) => void handleSubmitReport(payload)}
      />
    </Screen>
  );
}
