import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { addToLibrary, followAuthor, getReaderNovel, likeNovel, reportContent } from '../api/reader-api';
import { getApiErrorMessage } from '../api/api-client';
import type { ReaderChapter, ReaderNovel } from '../api/types';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';

export function NovelDetailScreen({
  novelId,
  authenticated,
  onLoginRequired,
  onOpenChapter
}: {
  novelId: string;
  authenticated: boolean;
  onLoginRequired: () => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const [novel, setNovel] = useState<(ReaderNovel & { chapters?: ReaderChapter[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setNovel(await getReaderNovel(novelId));
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [novelId]);

  const protectedAction = async (action: () => Promise<unknown>, success: string) => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }

    try {
      await action();
      setNotice(success);
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Loading novel..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const chapters = novel?.chapters ?? [];

  return (
    <Screen>
      <Section title={novel?.title ?? 'Novel'} subtitle={novel?.authorName ? `By ${novel.authorName}` : 'Published novel'}>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={novel?.genre ?? 'No genre'} />
            <Badge label={novel?.status ?? novel?.serialStatus ?? 'PUBLISHED'} />
            <Badge label={`${chapters.length} chapters`} />
          </View>
          <Text style={styles.muted}>{novel?.synopsis ?? 'No synopsis.'}</Text>
          {notice ? <Text style={styles.ghostButtonText}>{notice}</Text> : null}
          <PrimaryButton label="Read first chapter" onPress={() => chapters[0] && onOpenChapter(chapters[0].chapterId)} disabled={!chapters.length} />
          <GhostButton label="Add library" onPress={() => protectedAction(() => addToLibrary(novelId), 'Added to library.')} />
          <GhostButton label="Like" onPress={() => protectedAction(() => likeNovel(novelId), 'Liked novel.')} />
          <GhostButton label="Follow author" onPress={() => protectedAction(() => followAuthor(novel?.authorId ?? ''), 'Following author.')} />
          <GhostButton label="Report novel" onPress={() => protectedAction(() => reportContent({ targetType: 'NOVEL', targetId: novelId, reason: 'Mobile report' }), 'Report submitted.')} />
        </Card>
      </Section>

      <Section title="Chapters">
        {!chapters.length ? <EmptyState label="No published chapters yet." /> : null}
        {chapters.map((chapter) => (
          <TouchableOpacity key={chapter.chapterId} onPress={() => onOpenChapter(chapter.chapterId)}>
            <Card>
              <Text style={styles.sectionTitle}>
                Ch. {chapter.chapterNumber}: {chapter.title}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Badge label={chapter.isVip ? `VIP ${chapter.priceCoins}` : 'Free'} tone={chapter.isVip ? 'warning' : 'success'} />
                <Badge label={`${chapter.wordCount ?? 0} words`} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </Section>
    </Screen>
  );
}
