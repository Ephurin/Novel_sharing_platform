import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listHistory, searchPublishedNovels } from '../api/reader-api';
import type { ReaderNovel, ReadingHistoryItem } from '../api/types';
import { Field } from '../components/Form';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

const SEARCH_DEBOUNCE_MS = 250;

export function HomeScreen({
  authenticated,
  onOpenNovel,
  onOpenChapter
}: {
  authenticated: boolean;
  onOpenNovel: (novelId: string) => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [query, setQuery] = useState('');
  const [novels, setNovels] = useState<ReaderNovel[]>([]);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const requestSeqRef = useRef(0);
  const hasSettledOnceRef = useRef(false);
  const hasLoadedHistoryRef = useRef(false);
  const prevAuthRef = useRef(authenticated);
  const prevRefreshNonceRef = useRef(refreshNonce);

  const trimmedQuery = query.trim();

  useEffect(() => {
    const reqId = ++requestSeqRef.current;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let cancelled = false;
    let settled = false;

    const isInitial = !hasSettledOnceRef.current;
    const isAuthChange = prevAuthRef.current !== authenticated;
    const isManualRefresh = prevRefreshNonceRef.current !== refreshNonce;

    prevAuthRef.current = authenticated;
    prevRefreshNonceRef.current = refreshNonce;

    const isCurrent = () => !cancelled && reqId === requestSeqRef.current;
    const shouldFetchHistory = !hasLoadedHistoryRef.current || isAuthChange || isManualRefresh;

    setLoading(true);
    setError(null);

    const runFetch = async () => {
      try {
        const [novelItems, historyItems] = await Promise.all([
          searchPublishedNovels({ q: trimmedQuery || undefined }, controller?.signal),
          shouldFetchHistory
            ? (authenticated ? listHistory(controller?.signal).catch(() => []) : Promise.resolve([]))
            : Promise.resolve(null)
        ]);

        if (!isCurrent()) return;
        setNovels(novelItems);
        if (historyItems !== null) {
          setHistory(historyItems);
          hasLoadedHistoryRef.current = true;
        }
      } catch (caughtError) {
        if (!isCurrent()) return;
        setError(getApiErrorMessage(caughtError));
      } finally {
        settled = true;
        if (isCurrent()) {
          hasSettledOnceRef.current = true;
          setLoading(false);
          setInitialLoading(false);
        }
      }
    };

    const shouldDebounce = !isInitial && !isAuthChange && !isManualRefresh;
    if (!shouldDebounce) {
      void runFetch();
      return () => {
        cancelled = true;
        if (!settled) {
          controller?.abort();
        }
      };
    }

    const timer = setTimeout(() => {
      if (isCurrent()) {
        void runFetch();
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!settled) {
        controller?.abort();
      }
    };
  }, [authenticated, trimmedQuery, refreshNonce]);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    if (nextQuery.trim() !== trimmedQuery) {
      setLoading(true);
      setError(null);
    }
  };

  const refresh = () => {
    setLoading(true);
    setError(null);
    setRefreshNonce((prev) => prev + 1);
  };

  if (initialLoading) return <LoadingState label="Đang tải kho truyện..." />;

  const inlineLoadingLabel = trimmedQuery ? 'Đang tìm kiếm tác phẩm...' : 'Đang cập nhật danh sách...';

  return (
    <Screen>
      <Section title="Kho truyện">
        <Field
          label="Tìm kiếm tác phẩm"
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Tên truyện, lời giới thiệu..."
        />
        <GhostButton label="Làm mới danh sách" onPress={refresh} />
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      </Section>

      {authenticated && history[0] ? (
        <Section title="Đọc tiếp">
          <Card>
            <Text style={themed.cardTitle}>{history[0].novel.title}</Text>
            <Text style={themed.muted}>
              Chương {history[0].chapter.chapterNumber}: {history[0].chapter.title}
            </Text>
            <PrimaryButton
              label="Tiếp tục đọc"
              onPress={() => onOpenChapter(history[0].chapterId)}
            />
          </Card>
        </Section>
      ) : null}

      <Section title="Tác phẩm mới cập nhật">
        {loading ? (
          <View
            accessibilityRole="progressbar"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
          >
            <ActivityIndicator size="small" color={palette.primaryMuted} />
            <Text accessibilityLiveRegion="polite" style={themed.muted}>
              {inlineLoadingLabel}
            </Text>
          </View>
        ) : null}
        {!loading && !novels.length ? <EmptyState label="Chưa tìm thấy tác phẩm phù hợp." /> : null}
        {novels.map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} onPress={() => onOpenNovel(novel.novelId)} />
        ))}
      </Section>
    </Screen>
  );
}

export function NovelCard({ novel, onPress }: { novel: ReaderNovel; onPress: () => void }) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở tác phẩm ${novel.title}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      <Card>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text style={[themed.muted, { flex: 1 }]} numberOfLines={1}>
              {novel.authorName ? novel.authorName : 'Tác giả StoryCraft'}
            </Text>
            {novel.genre ? <Badge label={novel.genre} tone="primary" /> : null}
          </View>
          <Text style={[themed.cardTitle, { color: palette.text }]} numberOfLines={2}>
            {novel.title}
          </Text>
        </View>
        {novel.synopsis ? (
          <Text style={themed.muted} numberOfLines={2}>
            {novel.synopsis}
          </Text>
        ) : null}
        <Text style={themed.muted}>
          {(novel.chaptersCount ?? 0).toLocaleString('vi-VN')} chương · {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc · {(novel.likesCount ?? 0).toLocaleString('vi-VN')} thích
        </Text>
      </Card>
    </Pressable>
  );
}
