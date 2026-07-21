import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listLibrary, removeFromLibrary } from '../api/reader-api';
import type { ReaderNovel } from '../api/types';
import { Card, EmptyState, ErrorState, GhostButton, LoadingState, Screen, Section, styles } from '../components/Screen';

export function LibraryScreen({ onOpenNovel }: { onOpenNovel: (novelId: string) => void }) {
  const [novels, setNovels] = useState<ReaderNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setNovels(await listLibrary());
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading library..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Library" subtitle="Saved novels for quick access.">
        {!novels.length ? <EmptyState label="Your library is empty." /> : null}
        {novels.map((novel) => (
          <Card key={novel.novelId}>
            <Text style={styles.sectionTitle}>{novel.title}</Text>
            <Text style={styles.muted}>{novel.synopsis ?? 'No synopsis.'}</Text>
            <GhostButton label="Open novel" onPress={() => onOpenNovel(novel.novelId)} />
            <GhostButton
              label="Remove"
              onPress={async () => {
                await removeFromLibrary(novel.novelId);
                await load();
              }}
            />
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
