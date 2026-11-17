import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listHistory, searchPublishedNovels } from '../api/reader-api';
import type { ReaderNovel, ReadingHistoryItem } from '../api/types';
import { Field } from '../components/Form';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function HomeScreen({
  authenticated,
  onOpenNovel,
  onOpenChapter
}: {
  authenticated: boolean;
  onOpenNovel: (novelId: string) => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const themed = useScreenStyles();
  const [query, setQuery] = useState('');
  const [novels, setNovels] = useState<ReaderNovel[]>([]);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [novelItems, historyItems] = await Promise.all([
      searchPublishedNovels({ q: query.trim() || undefined }),
      authenticated ? listHistory().catch(() => []) : Promise.resolve([])
    ]);
    setNovels(novelItems);
    setHistory(historyItems);
  }, [authenticated, query]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((caughtError) => setError(getApiErrorMessage(caughtError)))
      .finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setLoading(true);
    await load().catch((caughtError) => setError(getApiErrorMessage(caughtError)));
    setLoading(false);
  };

  if (loading && !novels.length) return <LoadingState label="Đang tải kho truyện..." />;

  return (
    <Screen>
      <Section title="Kho truyện">
        <Field
          label="Tìm kiếm tác phẩm"
          value={query}
          onChangeText={setQuery}
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
        {!novels.length ? <EmptyState label="Chưa tìm thấy tác phẩm phù hợp." /> : null}
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
