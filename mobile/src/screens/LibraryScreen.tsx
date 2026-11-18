import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../api/api-client';
import { listLibrary, removeFromLibrary } from '../api/reader-api';
import type { ReaderNovel } from '../api/types';
import { BookCover } from '../components/BookCover';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
  useScreenStyles
} from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function LibraryScreen({
  onOpenNovel,
  onBrowse
}: {
  onOpenNovel: (novelId: string) => void;
  onBrowse?: () => void;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [novels, setNovels] = useState<ReaderNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setNovels(await listLibrary());
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const confirmRemove = (novel: ReaderNovel) => {
    if (removingId) return;
    const message = `Bạn muốn bỏ "${novel.title}" khỏi tủ sách cá nhân?`;
    const performRemove = async () => {
      setRemovingId(novel.novelId);
      setError(null);
      try {
        await removeFromLibrary(novel.novelId);
        setNovels((prev) => prev.filter((item) => item.novelId !== novel.novelId));
      } catch (caughtError) {
        setError(getApiErrorMessage(caughtError));
      } finally {
        setRemovingId(null);
      }
    };

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      if (globalThis.confirm(message)) {
        void performRemove();
      }
      return;
    }

    Alert.alert('Bỏ khỏi tủ sách', message, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Bỏ lưu',
        style: 'destructive',
        onPress: () => {
          void performRemove();
        }
      }
    ]);
  };

  if (loading) return <LoadingState label="Đang tải tủ sách..." />;
  if (error && !novels.length) return <ErrorState message={error} onRetry={() => void load(false)} />;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed.safeArea}>
      <FlatList
        data={novels}
        keyExtractor={(item) => item.novelId}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          error ? (
            <View style={{ paddingBottom: 10 }}>
              <ErrorState message={error} onRetry={() => void load(true)} />
            </View>
          ) : novels.length > 0 ? (
            <View style={{ paddingBottom: 10 }}>
              <Text style={themed.muted}>
                {novels.length.toLocaleString('vi-VN')} tác phẩm đang theo dõi
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Card>
            <EmptyState
              label="Tủ sách của bạn hiện đang trống."
              actionLabel={onBrowse ? 'Khám phá truyện' : undefined}
              onAction={onBrowse}
            />
          </Card>
        }
        renderItem={({ item: novel }) => {
          const isRemoving = removingId === novel.novelId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mở tác phẩm ${novel.title}`}
              onPress={() => onOpenNovel(novel.novelId)}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <Card>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <BookCover size="md" uri={novel.coverImageUrl} title={novel.title} />
                  <View style={{ flex: 1, gap: 6, minHeight: 102, justifyContent: 'space-between' }}>
                    <View style={{ gap: 4 }}>
                      <Text style={themed.cardTitle} numberOfLines={2}>
                        {novel.title}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        {novel.genre ? <Badge label={novel.genre} tone="primary" /> : null}
                        <Text style={themed.muted} numberOfLines={1}>
                          {novel.authorName ? novel.authorName : 'Tác giả StoryCraft'}
                        </Text>
                      </View>
                      <Text style={themed.muted}>
                        {(novel.chaptersCount ?? 0).toLocaleString('vi-VN')} chương ·{' '}
                        {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <GhostButton
                        label="Bỏ lưu"
                        accessibilityLabel={`Bỏ lưu ${novel.title}`}
                        danger
                        loading={isRemoving}
                        disabled={Boolean(removingId)}
                        onPress={() => confirmRemove(novel)}
                      />
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 28,
          backgroundColor: palette.background
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={palette.primaryMuted}
            colors={[palette.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}
