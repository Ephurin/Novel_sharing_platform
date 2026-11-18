import { useState } from 'react';
import { Text } from 'react-native';
import { markNotificationRead } from '../api/notification-api';
import { listPage } from '../api/social-api';
import type { NotificationItem } from '../api/types';
import { getApiErrorMessage } from '../api/api-client';
import { Card, ErrorState, GhostButton, LoadingState, Screen, Section, styles } from '../components/Screen';
import { Pages } from '../components/Social';
import { useFocusedResource } from '../state/useFocusedResource';

export function NotificationsScreen({ onOpenThread, onOpenNovel, onOpenChapter }: { onOpenThread: (id: string) => void; onOpenNovel: (id: string) => void; onOpenChapter: (id: string) => void }) {
  const [page, setPage] = useState(1); const [notice, setNotice] = useState('');
  const query = useFocusedResource(`notifications:${page}`, () => listPage<NotificationItem>('/notifications', { page }));
  return <Screen><Section title="Thông báo">{query.loading && <LoadingState />}{query.error && <ErrorState message={query.error} onRetry={query.reload} />}
    {query.data?.items.map(item => <Card key={item.notificationId}><Text style={styles.sectionTitle}>{item.title}</Text><Text style={styles.muted}>{item.content ?? item.body ?? item.type}</Text>
      <GhostButton label="Mở thông báo" onPress={async () => {
        setNotice(''); try { if (item.status === 'UNREAD') await markNotificationRead(item.notificationId);
          if (typeof item.payload?.commentId === 'string') onOpenThread(item.payload.commentId);
          else if (typeof item.payload?.chapterId === 'string') onOpenChapter(item.payload.chapterId);
          else if (typeof item.payload?.novelId === 'string') onOpenNovel(item.payload.novelId);
          else query.reload();
        } catch (error) { setNotice(getApiErrorMessage(error)); }
      }} /></Card>)}
    {query.data?.items.length === 0 && <Text style={styles.muted}>Chưa có thông báo.</Text>}{query.data && <Pages page={page} pages={query.data.pages} onChange={setPage} />}{notice ? <Text style={styles.error}>{notice}</Text> : null}
  </Section></Screen>;
}
