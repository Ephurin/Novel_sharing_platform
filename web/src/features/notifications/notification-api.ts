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

export async function listNotifications(status?: 'UNREAD' | 'READ') {
  const response = await apiClient.get<ApiEnvelope<AppNotification[]>>('/notifications', {
    params: { status, page: 1, limit: 20 }
  });
  return response.data.data;
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
