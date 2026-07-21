import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { listNotifications, markNotificationRead } from '../api/notification-api';
import type { NotificationItem } from '../api/types';
import { Badge, Card, EmptyState, ErrorState, GhostButton, LoadingState, Screen, Section, styles } from '../components/Screen';

export function NotificationsScreen() {
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

  if (loading) return <LoadingState label="Loading notifications..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Notifications">
        {!notifications.length ? <EmptyState label="No notifications yet." /> : null}
        {notifications.map((notification) => (
          <Card key={notification.notificationId}>
            <Badge label={notification.status} tone={notification.status === 'UNREAD' ? 'warning' : 'default'} />
            <Text style={styles.sectionTitle}>{notification.title}</Text>
            <Text style={styles.muted}>{notification.body ?? notification.type}</Text>
            {notification.status === 'UNREAD' ? (
              <GhostButton
                label="Mark read"
                onPress={async () => {
                  await markNotificationRead(notification.notificationId);
                  await load();
                }}
              />
            ) : null}
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
