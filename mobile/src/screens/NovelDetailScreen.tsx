import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../api/api-client';
import {
  addToLibrary,
  followAuthor,
  getReaderNovel,
  likeNovel,
  listHistory,
  reportContent
} from '../api/reader-api';
import type { ReaderChapter, ReaderNovel } from '../api/types';
import { BookCover } from '../components/BookCover';
import { AppIcon } from '../components/Icons';
import { ReportReasonModal } from '../components/ReportSheet';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
  PrimaryButton,
  useScreenStyles
} from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';
import { formatChapterLabel } from '../utils/format';

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
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [novel, setNovel] = useState<(ReaderNovel & { chapters?: ReaderChapter[] }) | null>(null);
  const [resumeChapter, setResumeChapter] = useState<{ chapterId: string; chapterNumber: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'like' | 'follow' | 'report' | null>(null);

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [novelData, historyData] = await Promise.all([
        getReaderNovel(novelId),
        authenticated ? listHistory().catch(() => []) : Promise.resolve([])
      ]);
      setNovel(novelData);
      const match = historyData.find((item) => item.novelId === novelId);
      setResumeChapter(
        match
          ? { chapterId: match.chapterId, chapterNumber: match.chapter.chapterNumber }
          : null
      );
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setReportModalOpen(false);
    setReportError(null);
  }, [novelId]);

  useEffect(() => {
    void load(false);
  }, [novelId, authenticated]);

  const chapters = novel?.chapters ?? [];

  const ascendingChapters = useMemo(
    () => [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber),
    [chapters]
  );

  const displayedChapters = useMemo(
    () => (sortOrder === 'asc' ? ascendingChapters : [...ascendingChapters].reverse()),
    [ascendingChapters, sortOrder]
  );

  const runProtectedAction = async (
    key: 'save' | 'like' | 'follow',
    action: () => Promise<void>,
    successMessage: string
  ) => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }
    if (pendingAction) return;

    setPendingAction(key);
    setNotice(null);
    setActionError(null);
    try {
      await action();
      setNotice(successMessage);
    } catch (caughtError) {
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      setPendingAction(null);
    }
  };

  const handleOpenReport = () => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }
    setReportError(null);
    setReportModalOpen(true);
  };

  const handleSubmitReport = async (payload: { reason: string; description?: string }) => {
    setPendingAction('report');
    setReportError(null);
    try {
      await reportContent({
        targetType: 'NOVEL',
        targetId: novelId,
        reason: payload.reason,
        ...(payload.description ? { description: payload.description } : {})
      });
      setReportModalOpen(false);
      setNotice('Đã gửi báo cáo tác phẩm.');
    } catch (caughtError) {
      setReportError(getApiErrorMessage(caughtError));
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) return <LoadingState label="Đang tải thông tin tác phẩm..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  const rawStatus = novel?.serialStatus ?? novel?.status ?? 'ONGOING';
  const statusLabel = SERIAL_STATUS_LABELS[rawStatus] ?? rawStatus;

  const genrePills = novel?.genres?.length
    ? novel.genres.slice(0, 2)
    : novel?.genre
    ? [novel.genre]
    : ['Chưa phân loại'];
  const tagPills = (novel?.tags ?? []).slice(0, 2);

  const synopsis = (novel?.synopsis ?? '').trim();
  const canCollapseSynopsis = synopsis.length > 180;

  const primaryTargetChapterId = resumeChapter?.chapterId ?? ascendingChapters[0]?.chapterId;
  const primaryCtaLabel = resumeChapter
    ? `Đọc tiếp · Chương ${resumeChapter.chapterNumber}`
    : 'Đọc ngay';

  const ratingMetric =
    typeof novel?.ratingAverage === 'number'
      ? `${novel.ratingAverage.toFixed(1)} ★`
      : `${(novel?.likesCount ?? 0).toLocaleString('vi-VN')} yêu thích`;

  const listHeader = (
    <View style={{ gap: 16, paddingBottom: 10 }}>
      <Card>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
          <BookCover size="lg" uri={novel?.coverImageUrl} title={novel?.title ?? 'Tác phẩm'} />
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={themed.pageTitle} numberOfLines={3}>
              {novel?.title ?? 'Tác phẩm'}
            </Text>
            <Text style={themed.muted} numberOfLines={1}>
              {novel?.authorName ? `Tác giả: ${novel.authorName}` : 'Tác giả StoryCraft'}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Badge
                label={statusLabel}
                tone={rawStatus === 'COMPLETED' ? 'success' : 'default'}
              />
              {genrePills.map((g) => (
                <Badge key={g} label={g} tone="primary" />
              ))}
              {tagPills.map((t) => (
                <Badge key={t} label={`#${t}`} />
              ))}
            </View>

            <Text style={themed.muted}>
              {chapters.length.toLocaleString('vi-VN')} chương ·{' '}
              {(novel?.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc · {ratingMetric}
            </Text>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text
            style={themed.body}
            numberOfLines={canCollapseSynopsis && !synopsisExpanded ? 3 : undefined}
          >
            {synopsis || 'Chưa có lời giới thiệu.'}
          </Text>
          {canCollapseSynopsis ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={synopsisExpanded ? 'Thu gọn giới thiệu' : 'Xem thêm giới thiệu'}
              onPress={() => setSynopsisExpanded((prev) => !prev)}
              style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Text style={themed.notice}>{synopsisExpanded ? 'Thu gọn' : 'Xem thêm'}</Text>
            </Pressable>
          ) : null}
        </View>

        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        {actionError ? (
          <Text accessibilityLiveRegion="polite" style={themed.error}>
            {actionError}
          </Text>
        ) : null}

        <PrimaryButton
          label={primaryCtaLabel}
          onPress={() => {
            if (primaryTargetChapterId) {
              onOpenChapter(primaryTargetChapterId);
            }
          }}
          disabled={!primaryTargetChapterId}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <GhostButton
            flex={1}
            label={saved ? 'Đã lưu' : 'Lưu tủ sách'}
            accessibilityLabel="Lưu tủ sách"
            active={saved}
            loading={pendingAction === 'save'}
            disabled={pendingAction !== null}
            icon={<AppIcon name="bookmark" size={16} color={palette.primaryMuted} filled={saved} />}
            onPress={() =>
              void runProtectedAction(
                'save',
                async () => {
                  await addToLibrary(novelId);
                  setSaved(true);
                },
                'Đã lưu vào tủ sách.'
              )
            }
          />
          <GhostButton
            flex={1}
            label={liked ? 'Đã thích' : 'Yêu thích'}
            accessibilityLabel="Yêu thích"
            active={liked}
            loading={pendingAction === 'like'}
            disabled={pendingAction !== null}
            icon={<AppIcon name="heart" size={16} color={palette.primaryMuted} filled={liked} />}
            onPress={() =>
              void runProtectedAction(
                'like',
                async () => {
                  const res = await likeNovel(novelId);
                  setLiked(res.liked ?? true);
                  if (typeof res.likesCount === 'number') {
                    setNovel((prev) => (prev ? { ...prev, likesCount: res.likesCount } : prev));
                  }
                },
                'Đã cập nhật yêu thích tác phẩm.'
              )
            }
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <GhostButton
            flex={1}
            label={following ? 'Đang theo dõi' : 'Theo dõi'}
            accessibilityLabel="Theo dõi tác giả"
            active={following}
            loading={pendingAction === 'follow'}
            disabled={!novel?.authorId || pendingAction !== null}
            icon={<AppIcon name="user-plus" size={16} color={palette.primaryMuted} />}
            onPress={() => {
              if (!novel?.authorId) return;
              void runProtectedAction(
                'follow',
                async () => {
                  const res = await followAuthor(novel.authorId!);
                  setFollowing(res.followed ?? true);
                },
                'Đã cập nhật theo dõi tác giả.'
              );
            }}
          />
          <GhostButton
            label="Báo cáo"
            accessibilityLabel="Báo cáo tác phẩm"
            disabled={pendingAction !== null}
            icon={<AppIcon name="flag" size={16} color={palette.primaryMuted} />}
            onPress={handleOpenReport}
          />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={themed.sectionTitle}>
          Danh sách chương ({chapters.length.toLocaleString('vi-VN')})
        </Text>
        {chapters.length > 1 ? (
          <GhostButton
            label={sortOrder === 'asc' ? 'Cũ → Mới' : 'Mới → Cũ'}
            accessibilityLabel={
              sortOrder === 'asc'
                ? 'Đang sắp xếp cũ đến mới, chạm để đổi mới đến cũ'
                : 'Đang sắp xếp mới đến cũ, chạm để đổi cũ đến mới'
            }
            icon={<AppIcon name="arrow-up-down" size={15} color={palette.primaryMuted} />}
            onPress={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={themed.safeArea}>
      <FlatList
        data={displayedChapters}
        keyExtractor={(item) => item.chapterId}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyState label="Chưa có chương nào được xuất bản." />}
        renderItem={({ item: chapter }) => {
          const label = formatChapterLabel(chapter.chapterNumber, chapter.title);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onOpenChapter(chapter.chapterId)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={themed.cardTitle} numberOfLines={2}>
                      {label}
                    </Text>
                    <Text style={themed.muted}>
                      {(chapter.wordCount ?? 0).toLocaleString('vi-VN')} từ
                    </Text>
                  </View>
                  <Badge
                    label={chapter.isVip ? `VIP · ${chapter.priceCoins} Xu` : 'Miễn phí'}
                    tone={chapter.isVip ? 'warning' : 'success'}
                  />
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
        initialNumToRender={16}
        maxToRenderPerBatch={20}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={palette.primaryMuted}
            colors={[palette.primary]}
          />
        }
      />

      <ReportReasonModal
        visible={reportModalOpen}
        title="Báo cáo tác phẩm"
        targetKey={novelId}
        submitting={pendingAction === 'report'}
        error={reportError}
        onClose={() => setReportModalOpen(false)}
        onSubmit={(payload) => void handleSubmitReport(payload)}
      />
    </SafeAreaView>
  );
}
