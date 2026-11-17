import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listLibrary, removeFromLibrary } from '../api/reader-api';
import type { ReaderNovel } from '../api/types';
import { Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';

export function LibraryScreen({ onOpenNovel }: { onOpenNovel: (novelId: string) => void }) {
  const themed = useScreenStyles();
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

  const confirmRemove = (novel: ReaderNovel) => {
    Alert.alert(
      'Bỏ khỏi tủ sách',
      `Bạn muốn bỏ "${novel.title}" khỏi tủ sách cá nhân?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Bỏ lưu',
          style: 'destructive',
          onPress: () => {
            void removeFromLibrary(novel.novelId)
              .then(() => load())
              .catch((caughtError) => setError(getApiErrorMessage(caughtError)));
          }
        }
      ]
    );
  };

  if (loading) return <LoadingState label="Đang tải tủ sách..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Tủ sách đã lưu">
        {!novels.length ? <EmptyState label="Tủ sách của bạn hiện đang trống." /> : null}
        {novels.map((novel) => (
          <Card key={novel.novelId}>
            <Text style={themed.cardTitle}>{novel.title}</Text>
            {novel.synopsis ? (
              <Text style={themed.muted} numberOfLines={2}>
                {novel.synopsis}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Xem tác phẩm" onPress={() => onOpenNovel(novel.novelId)} />
              </View>
              <GhostButton label="Bỏ lưu" danger onPress={() => confirmRemove(novel)} />
            </View>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
