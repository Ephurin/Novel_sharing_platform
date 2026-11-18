import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listNotifications, markNotificationRead } from '../api/notification-api';
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
  onUnreadCountChange
}: {
  onUnreadCountChange?: (count: number) => void;
} = {}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setActionError(null);
    try {
      setNotifications(await listNotifications());
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

  const unreadItems = useMemo(
    () => notifications.filter((item) => item.status === 'UNREAD'),
    [notifications]
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadItems.length);
  }, [unreadItems.length, onUnreadCountChange]);

  const handleMarkOneRead = async (notificationId: string) => {
    if (markingIds[notificationId] || markingAll) return;
    setMarkingIds((prev) => ({ ...prev, [notificationId]: true }));
    setActionError(null);
    try {
      const updated = await markNotificationRead(notificationId);
      const readTimestamp = updated?.readAt ?? new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) =>
          item.notificationId === notificationId
            ? { ...item, status: 'READ', readAt: readTimestamp }
            : item
        )
      );
    } catch (caughtError) {
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      setMarkingIds((prev) => {
        const next = { ...prev };
        delete next[notificationId];
        return next;
      });
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || unreadItems.length === 0) return;
    setMarkingAll(true);
    setActionError(null);
    try {
      await Promise.all(unreadItems.map((item) => markNotificationRead(item.notificationId)));
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) =>
          item.status === 'UNREAD' ? { ...item, status: 'READ', readAt: nowIso } : item
        )
      );
    } catch (caughtError) {
      setActionError(getApiErrorMessage(caughtError));
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return <LoadingState label="Đang tải thông báo..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      {unreadItems.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={themed.muted}>
            {unreadItems.length.toLocaleString('vi-VN')} thông báo chưa đọc
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
    </Screen>
  );
}
