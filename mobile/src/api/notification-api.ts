import { apiClient, type ApiEnvelope } from './api-client';
import type { NotificationItem } from './types';

export async function listNotifications() {
  const response = await apiClient.get<ApiEnvelope<NotificationItem[]>>('/notifications', {
    params: { page: 1, limit: 30 }
  });
  return response.data.data;
}

export async function markNotificationRead(notificationId: string) {
  const response = await apiClient.patch<ApiEnvelope<NotificationItem>>(`/notifications/${notificationId}/read`);
  return response.data.data;
}
