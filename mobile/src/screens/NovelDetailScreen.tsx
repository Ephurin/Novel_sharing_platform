import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { addToLibrary, followAuthor, getReaderNovel, likeNovel, reportContent } from '../api/reader-api';
import type { ReaderChapter, ReaderNovel } from '../api/types';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';

const SERIAL_STATUS_LABELS: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
  PUBLISHED: 'Đã xuất bản'
};

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
  const themed = useScreenStyles();
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

  if (loading) return <LoadingState label="Đang tải thông tin tác phẩm..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const chapters = novel?.chapters ?? [];
  const rawStatus = novel?.serialStatus ?? novel?.status ?? 'ONGOING';
  const statusLabel = SERIAL_STATUS_LABELS[rawStatus] ?? rawStatus;

  return (
    <Screen>
      <Section
        title={novel?.title ?? 'Tác phẩm'}
        subtitle={novel?.authorName ? `Tác giả: ${novel.authorName}` : undefined}
      >
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={novel?.genre ?? 'Chưa phân loại'} tone="primary" />
            <Badge
              label={statusLabel}
              tone={rawStatus === 'COMPLETED' ? 'success' : 'default'}
            />
            <Badge label={`${chapters.length.toLocaleString('vi-VN')} chương`} />
          </View>
          <Text style={themed.body}>{novel?.synopsis ?? 'Chưa có lời giới thiệu.'}</Text>
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={themed.notice}>
              {notice}
            </Text>
          ) : null}
          <PrimaryButton
            label="Đọc từ chương đầu"
            onPress={() => chapters[0] && onOpenChapter(chapters[0].chapterId)}
            disabled={!chapters.length}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GhostButton
              flex={1}
              label="Lưu tủ sách"
              onPress={() => protectedAction(() => addToLibrary(novelId), 'Đã lưu vào tủ sách.')}
            />
            <GhostButton
              flex={1}
              label="Yêu thích"
              onPress={() => protectedAction(() => likeNovel(novelId), 'Đã thích tác phẩm.')}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GhostButton
              flex={1}
              label="Theo dõi tác giả"
              onPress={() =>
                protectedAction(
                  () => followAuthor(novel?.authorId ?? ''),
                  'Đã theo dõi tác giả.'
                )
              }
            />
            <GhostButton
              flex={1}
              label="Báo cáo"
              onPress={() =>
                protectedAction(
                  () => reportContent({ targetType: 'NOVEL', targetId: novelId, reason: 'Báo cáo từ ứng dụng di động' }),
                  'Đã gửi báo cáo.'
                )
              }
            />
          </View>
        </Card>
      </Section>

      <Section title="Danh sách chương">
        {!chapters.length ? <EmptyState label="Chưa có chương nào được xuất bản." /> : null}
        {chapters.map((chapter) => (
          <Pressable
            key={chapter.chapterId}
            accessibilityRole="button"
            accessibilityLabel={`Chương ${chapter.chapterNumber}: ${chapter.title}`}
            onPress={() => onOpenChapter(chapter.chapterId)}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card>
              <Text style={themed.cardTitle}>
                Chương {chapter.chapterNumber}: {chapter.title}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge
                  label={chapter.isVip ? `VIP · ${chapter.priceCoins} Xu` : 'Miễn phí'}
                  tone={chapter.isVip ? 'warning' : 'success'}
                />
                <Badge label={`${(chapter.wordCount ?? 0).toLocaleString('vi-VN')} từ`} />
              </View>
            </Card>
          </Pressable>
        ))}
      </Section>
    </Screen>
  );
}
