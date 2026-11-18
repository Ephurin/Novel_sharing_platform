import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type AppNotification = {
  notificationId: string;
  type: string;
  status: 'UNREAD' | 'READ';
  title: string;
  content: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export function notificationHref(item: AppNotification, reader = false) {
  const href = item.payload.href;
  if (typeof href !== 'string' || !(/^\/(author|reader|public)\//.test(href) || href === '/wallet')) return null;
  if (!['COMMENT_REPLY', 'AUTHOR_REPLY'].includes(item.type) || typeof item.payload.commentId !== 'string') return href;
  const target = new URL(href, 'https://storycraft.invalid');
  if (!/^\/(reader|public)\/(novels|chapters)\//.test(target.pathname)) return href;
  if (reader) target.pathname = target.pathname.replace(/^\/public\//, '/reader/');
  target.searchParams.set('commentId', item.payload.commentId);
  target.hash = 'reader-comments';
  return target.pathname + target.search + target.hash;
}

export async function listNotifications(status?: 'UNREAD' | 'READ', page = 1) {
  const response = await apiClient.get<ApiEnvelope<AppNotification[]>>('/notifications', {
    params: { status, page, limit: 20 }
  });
  return { ...response.data, meta: { ...response.data.meta, totalPages: Number(response.data.meta.totalPages ?? 0) } };
}

export async function markNotificationRead(notificationId: string) {
  const response = await apiClient.patch<ApiEnvelope<AppNotification>>(`/notifications/${notificationId}/read`);
  return response.data.data;
}

export async function registerWebPushToken(deviceToken: string) {
  const response = await apiClient.post<ApiEnvelope<{ provider: string; platform: string; registered: boolean }>>(
    '/notifications/device-token',
    {
      provider: 'WEB_PUSH',
      platform: 'WEB',
      deviceToken
    }
  );
  return response.data.data;
}

export async function getUnreadNotificationCount() {
  const response = await apiClient.get<ApiEnvelope<AppNotification[]>>('/notifications', {
    params: { status: 'UNREAD', page: 1, limit: 1 }
  });
  return Number(response.data.meta.totalItems);
}
