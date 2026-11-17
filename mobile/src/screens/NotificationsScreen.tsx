import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listNotifications, markNotificationRead } from '../api/notification-api';
import type { NotificationItem } from '../api/types';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, Screen, Section, useScreenStyles } from '../components/Screen';

export function NotificationsScreen() {
  const themed = useScreenStyles();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setNotifications(await listNotifications());
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Đang tải thông báo..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Thông báo">
        {!notifications.length ? <EmptyState label="Chưa có thông báo mới." /> : null}
        {notifications.map((notification) => {
          const unread = notification.status === 'UNREAD';
          return (
            <Card key={notification.notificationId}>
              <Badge
                label={unread ? 'Chưa đọc' : 'Đã đọc'}
                tone={unread ? 'warning' : 'default'}
              />
              <Text style={themed.cardTitle}>{notification.title}</Text>
              <Text style={themed.muted}>{notification.body ?? notification.type}</Text>
              {unread ? (
                <GhostButton
                  label="Đánh dấu đã đọc"
                  onPress={async () => {
                    try {
                      await markNotificationRead(notification.notificationId);
                      await load();
                    } catch (caughtError) {
                      setError(getApiErrorMessage(caughtError));
                    }
                  }}
                />
              ) : null}
            </Card>
          );
        })}
      </Section>
    </Screen>
  );
}
