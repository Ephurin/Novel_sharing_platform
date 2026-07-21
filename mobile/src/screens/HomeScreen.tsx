import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listHistory, searchPublishedNovels } from '../api/reader-api';
import type { ReaderNovel, ReadingHistoryItem } from '../api/types';
import { Field } from '../components/Form';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, Screen, Section, styles } from '../components/Screen';

export function HomeScreen({
  authenticated,
  onOpenNovel,
  onOpenChapter
}: {
  authenticated: boolean;
  onOpenNovel: (novelId: string) => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [novels, setNovels] = useState<ReaderNovel[]>([]);
  const [history, setHistory] = useState<ReadingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [novelItems, historyItems] = await Promise.all([
      searchPublishedNovels({ q: query }),
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

  if (loading) return <LoadingState label="Loading mobile feed..." />;

  return (
    <Screen>
      <Section title="Home" subtitle={authenticated ? 'Continue reading or discover a new story.' : 'Browse as guest. Login for library and history.'}>
        <Field label="Search" value={query} onChangeText={setQuery} placeholder="Novel title, synopsis..." />
        <GhostButton label="Refresh" onPress={refresh} />
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      </Section>

      {authenticated && history[0] ? (
        <Section title="Continue Reading">
          <Card>
            <Text style={styles.sectionTitle}>{history[0].novel.title}</Text>
            <Text style={styles.muted}>
              Ch. {history[0].chapter.chapterNumber}: {history[0].chapter.title}
            </Text>
            <TouchableOpacity onPress={() => onOpenChapter(history[0].chapterId)}>
              <Text style={styles.ghostButtonText}>Continue</Text>
            </TouchableOpacity>
          </Card>
        </Section>
      ) : null}

      <Section title="Latest Novels">
        {!novels.length ? <EmptyState label="No published novels found." /> : null}
        {novels.map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} onPress={() => onOpenNovel(novel.novelId)} />
        ))}
      </Section>
    </Screen>
  );
}

export function NovelCard({ novel, onPress }: { novel: ReaderNovel; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Card>
        <View style={{ gap: 6 }}>
          <Text style={styles.sectionTitle}>{novel.title}</Text>
          <Text style={styles.muted}>{novel.authorName ? `By ${novel.authorName}` : novel.genre ?? 'Published novel'}</Text>
        </View>
        <Text style={styles.muted} numberOfLines={3}>
          {novel.synopsis ?? 'No synopsis.'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge label={`${novel.chaptersCount ?? 0} chapters`} />
          <Badge label={`${novel.likesCount ?? 0} likes`} />
          <Badge label={`${novel.viewsCount ?? 0} views`} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}
