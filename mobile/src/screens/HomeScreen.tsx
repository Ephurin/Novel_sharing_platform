import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../api/api-client';
import { listHistory, searchPublishedNovels } from '../api/reader-api';
import type { ReaderNovel, ReadingHistoryItem } from '../api/types';
import { BookCover } from '../components/BookCover';
import { Field } from '../components/Form';
import { AppIcon } from '../components/Icons';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
  PrimaryButton,
  Section,
  useScreenStyles
} from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';
import { formatChapterLabel } from '../utils/format';

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
  const [refreshing, setRefreshing] = useState(false);
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
            ? authenticated
              ? listHistory(controller?.signal).catch(() => [])
              : Promise.resolve([])
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
          setRefreshing(false);
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
    setRefreshing(true);
    setError(null);
    setRefreshNonce((prev) => prev + 1);
  };

  if (initialLoading) return <LoadingState label="Đang tải kho truyện..." />;

  const inlineLoadingLabel = trimmedQuery ? 'Đang tìm kiếm tác phẩm...' : 'Đang cập nhật danh sách...';
  const latestHistory = authenticated ? history[0] : undefined;

  const listHeader = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <Section>
        <Field
          label="Tìm kiếm tác phẩm"
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Tên truyện, lời giới thiệu..."
          returnKeyType="search"
        />
        <GhostButton
          label="Làm mới danh sách"
          icon={<AppIcon name="refresh" size={16} color={palette.primaryMuted} />}
          onPress={refresh}
        />
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      </Section>

      {latestHistory ? (
        <Section title="Đọc tiếp">
          <Card>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <BookCover
                size="sm"
                uri={latestHistory.novel.coverImageUrl}
                title={latestHistory.novel.title}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={themed.cardTitle} numberOfLines={2}>
                  {latestHistory.novel.title}
                </Text>
                <Text style={themed.muted} numberOfLines={2}>
                  {formatChapterLabel(latestHistory.chapter.chapterNumber, latestHistory.chapter.title)}
                </Text>
              </View>
            </View>
            <PrimaryButton
              label="Tiếp tục đọc"
              onPress={() => onOpenChapter(latestHistory.chapterId)}
            />
          </Card>
        </Section>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={themed.sectionTitle}>
          Tác phẩm mới cập nhật
        </Text>
        {loading ? (
          <View
            accessibilityRole="progressbar"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
          >
            <ActivityIndicator size="small" color={palette.primaryMuted} />
            <Text accessibilityLiveRegion="polite" style={themed.muted}>
              {inlineLoadingLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={themed.safeArea}
      >
        <FlatList
          data={novels}
          keyExtractor={(item) => item.novelId}
          renderItem={({ item }) => (
            <NovelCard novel={item} onPress={() => onOpenNovel(item.novelId)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading ? <EmptyState label="Chưa tìm thấy tác phẩm phù hợp." /> : null
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 28,
            backgroundColor: palette.background
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.primaryMuted}
              colors={[palette.primary]}
            />
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
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
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <BookCover size="md" uri={novel.coverImageUrl} title={novel.title} />
          <View style={{ flex: 1, gap: 6, minHeight: 102, justifyContent: 'space-between' }}>
            <View style={{ gap: 4 }}>
              <Text style={[themed.cardTitle, { color: palette.text }]} numberOfLines={2}>
                {novel.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                {novel.genre ? <Badge label={novel.genre} tone="primary" /> : null}
                <Text style={themed.muted} numberOfLines={1}>
                  {novel.authorName ? novel.authorName : 'Tác giả StoryCraft'}
                </Text>
              </View>
            </View>
            <Text style={themed.muted}>
              {(novel.chaptersCount ?? 0).toLocaleString('vi-VN')} chương ·{' '}
              {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
