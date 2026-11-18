import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import {
  fetchUnreadNotificationCount,
  listNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead
} from '../api/notification-api';
import type { NotificationItem } from '../api/types';
import { AppIcon } from '../components/Icons';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GhostButton,
  LoadingState,
  Screen,
  useScreenStyles
} from '../components/Screen';
import { useStoryCraftTheme } from '../theme/ThemeProvider';
import { formatRelativeOrDate } from '../utils/format';

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  NOVEL_CHAPTER_PUBLISHED: 'Chương mới vừa xuất bản',
  COMMENT_REPLY: 'Phản hồi bình luận mới',
  AUTHOR_REPLY: 'Tác giả đã phản hồi bình luận của bạn',
  NOVEL_FOLLOW: 'Cập nhật từ tác phẩm đang theo dõi',
  AUTHOR_FOLLOW: 'Cập nhật từ tác giả đang theo dõi',
  MODERATION_UPDATE: 'Cập nhật kiểm duyệt nội dung',
  WALLET_TRANSACTION: 'Biến động số dư Ví Xu'
};

export function NotificationsScreen({
  onUnreadCountChange,
  onOpenThread
}: {
  onOpenThread?: (id: string) => void;
  onUnreadCountChange?: (count: number) => void;
} = {}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const hasAuthoritativeTotalRef = useRef(false);
  const unreadCountRef = useRef<number | null>(null);
  unreadCountRef.current = unreadCount;
  const onUnreadCountChangeRef = useRef(onUnreadCountChange);
  onUnreadCountChangeRef.current = onUnreadCountChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reportUnreadCount = useCallback((nextCount: number) => {
    const safeCount = Math.max(0, nextCount);
    unreadCountRef.current = safeCount;
    setUnreadCount(safeCount);
    onUnreadCountChangeRef.current?.(safeCount);
  }, []);

  const syncUnreadFromServer = useCallback(
    async (fallbackUnreadCount?: number) => {
      try {
        const res = await fetchUnreadNotificationCount();
        if (!mountedRef.current) return;
        if (res.fromMeta) {
          hasAuthoritativeTotalRef.current = true;
          reportUnreadCount(res.total);
          return;
        }
        if (hasAuthoritativeTotalRef.current) {
          reportUnreadCount(res.total);
          return;
        }
      } catch {
        // Fall through to local fallback if authoritative count request fails.
      }
      if (mountedRef.current && typeof fallbackUnreadCount === 'number') {
        reportUnreadCount(fallbackUnreadCount);
      }
    },
    [reportUnreadCount]
  );

  const load = async (isRefresh = false) => {
    const reqSeq = ++loadSeqRef.current;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setActionError(null);
    try {
      const [pageResult, countResult] = await Promise.all([
        listNotificationsPage({ page: 1, limit: 30 }),
        fetchUnreadNotificationCount().catch(() => null)
      ]);
      if (!mountedRef.current || reqSeq !== loadSeqRef.current) return;
      const items = pageResult.data;
      setNotifications(items);
      setCurrentPage(pageResult.meta.page || 1);
      const nextTotalPages =
        typeof pageResult.meta.totalPages === 'number' && pageResult.meta.totalPages > 0
          ? pageResult.meta.totalPages
          : 1;
      setTotalPages(nextTotalPages);

      const pageLocalUnread = items.filter((item) => item.status === 'UNREAD').length;
      if (countResult?.fromMeta) {
        hasAuthoritativeTotalRef.current = true;
        reportUnreadCount(countResult.total);
      } else {
        hasAuthoritativeTotalRef.current = false;
        reportUnreadCount(countResult ? countResult.total : pageLocalUnread);
      }
    } catch (caughtError) {
      if (!mountedRef.current || reqSeq !== loadSeqRef.current) return;
      setError(getApiErrorMessage(caughtError));
    } finally {
      if (mountedRef.current && reqSeq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void load(false);
  }, []);

  const handleLoadMore = async () => {
    if (loading || loadingMore || refreshing || markingAll || currentPage >= totalPages) return;
    const reqSeq = loadSeqRef.current;
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    setActionError(null);
    try {
      const pageResult = await listNotificationsPage({ page: nextPage, limit: 30 });
      if (!mountedRef.current || reqSeq !== loadSeqRef.current) return;
      setNotifications((prev) => {
        const seen = new Set(prev.map((item) => item.notificationId));
        return [...prev, ...pageResult.data.filter((item) => !seen.has(item.notificationId))];
      });
      setCurrentPage(pageResult.meta.page || nextPage);
      if (typeof pageResult.meta.totalPages === 'number' && pageResult.meta.totalPages > 0) {
        setTotalPages(pageResult.meta.totalPages);
      }
    } catch (caughtError) {
      if (!mountedRef.current || reqSeq !== loadSeqRef.current) return;
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      if (mountedRef.current) {
        setLoadingMore(false);
      }
    }
  };

  const pageUnreadItems = useMemo(
    () => notifications.filter((item) => item.status === 'UNREAD'),
    [notifications]
  );
  const displayUnreadCount = unreadCount ?? pageUnreadItems.length;

  const handleMarkOneRead = async (notificationId: string) => {
    if (markingIds[notificationId] || markingAll) return;
    const targetItem = notifications.find((item) => item.notificationId === notificationId);
    const wasUnread = targetItem?.status === 'UNREAD';
    setMarkingIds((prev) => ({ ...prev, [notificationId]: true }));
    setActionError(null);
    try {
      const updated = await markNotificationRead(notificationId);
      if (!mountedRef.current) return;
      const readTimestamp = updated?.readAt ?? new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) =>
          item.notificationId === notificationId
            ? { ...item, status: 'READ', readAt: readTimestamp }
            : item
        )
      );
      const fallbackNext = wasUnread
        ? Math.max(0, (unreadCountRef.current ?? pageUnreadItems.length) - 1)
        : unreadCountRef.current ?? pageUnreadItems.length;
      await syncUnreadFromServer(fallbackNext);
    } catch (caughtError) {
      if (!mountedRef.current) return;
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      if (mountedRef.current) {
        setMarkingIds((prev) => {
          const next = { ...prev };
          delete next[notificationId];
          return next;
        });
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || displayUnreadCount === 0) return;
    setMarkingAll(true);
    setActionError(null);
    let succeededCount = 0;
    try {
      const result = await markAllNotificationsRead(notifications);
      if (!mountedRef.current) return;
      const updatedById = result.updatedById;
      const succeededIds = Object.keys(updatedById);
      succeededCount = succeededIds.length;
      if (succeededCount > 0) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((item) => {
            const updated = updatedById[item.notificationId];
            return updated
              ? { ...item, status: 'READ', readAt: updated.readAt ?? nowIso }
              : item;
          })
        );
      }
      if (result.failedCount > 0) {
        const prefix =
          succeededCount > 0 ? `Đã đánh dấu ${succeededCount} thông báo, nhưng ` : '';
        const detail = result.firstError ? `: ${getApiErrorMessage(result.firstError)}` : '';
        setActionError(
          `${prefix}không thể cập nhật ${result.failedCount}/${result.targetIds.length} thông báo${detail}`
        );
      }
    } catch (caughtError) {
      if (!mountedRef.current) return;
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      if (mountedRef.current) {
        const fallbackRemaining = Math.max(
          0,
          (unreadCountRef.current ?? pageUnreadItems.length) - succeededCount
        );
        await syncUnreadFromServer(fallbackRemaining);
        setMarkingAll(false);
      }
    }
  };

  if (loading) return <LoadingState label="Đang tải thông báo..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      {displayUnreadCount > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={themed.muted}>
            {displayUnreadCount.toLocaleString('vi-VN')} thông báo chưa đọc
          </Text>
          <GhostButton
            label="Đánh dấu tất cả đã đọc"
            loading={markingAll}
            disabled={markingAll}
            icon={<AppIcon name="check-check" size={16} color={palette.primaryMuted} />}
            onPress={() => void handleMarkAllRead()}
          />
        </View>
      ) : null}

      {actionError ? (
        <Text accessibilityLiveRegion="polite" style={themed.error}>
          {actionError}
        </Text>
      ) : null}

      {!notifications.length ? <EmptyState label="Chưa có thông báo mới." /> : null}

      {notifications.map((notification) => {
        const unread = notification.status === 'UNREAD';
        const commentId = notification.payload?.commentId;
        const isMarking = Boolean(markingIds[notification.notificationId]);
        const detailText =
          notification.content?.trim() ||
          notification.body?.trim() ||
          NOTIFICATION_TYPE_LABELS[notification.type] ||
          notification.type;
        const formattedDate = formatRelativeOrDate(notification.createdAt);

        return (
          <Card key={notification.notificationId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Badge
                label={unread ? 'Chưa đọc' : 'Đã đọc'}
                tone={unread ? 'warning' : 'default'}
              />
              {formattedDate ? <Text style={themed.muted}>{formattedDate}</Text> : null}
            </View>
            <Text style={themed.cardTitle}>{notification.title}</Text>
            <Text style={themed.body}>{detailText}</Text>
            {onOpenThread && typeof commentId === 'string' && <GhostButton label="Mở thông báo"
              disabled={isMarking || markingAll} onPress={() => {
                if (unread) void handleMarkOneRead(notification.notificationId);
                onOpenThread(commentId);
              }} />}
            {unread ? (
              <GhostButton
                label="Đánh dấu đã đọc"
                loading={isMarking}
                disabled={isMarking || markingAll}
                onPress={() => void handleMarkOneRead(notification.notificationId)}
              />
            ) : null}
          </Card>
        );
      })}

      {currentPage < totalPages ? (
        <GhostButton
          label={loadingMore ? 'Đang tải...' : 'Xem thêm thông báo'}
          loading={loadingMore}
          disabled={loadingMore || markingAll}
          onPress={() => void handleLoadMore()}
        />
      ) : null}
    </Screen>
  );
}
