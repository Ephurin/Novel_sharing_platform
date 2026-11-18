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

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  NOVEL_CHAPTER_PUBLISHED: 'Chương mới',
  NEW_CHAPTER: 'Chương mới',
  COMMENT_REPLY: 'Trả lời bình luận',
  AUTHOR_REPLY: 'Phản hồi từ tác giả',
  READER_COMMENT: 'Bình luận mới',
  PUBLICATION_REVIEW: 'Kiểm duyệt xuất bản',
  MODERATION_APPROVED: 'Đã duyệt nội dung',
  MODERATION_REJECTED: 'Từ chối nội dung',
  MODERATION_REVISION_REQUIRED: 'Cần chỉnh sửa',
  WITHDRAW_APPROVED: 'Duyệt rút Xu',
  WITHDRAW_REJECTED: 'Từ chối rút Xu',
  ADMIN_DECISION: 'Quyết định quản trị',
  APPEAL_RESOLVED: 'Kết quả khiếu nại',
  REPORT_RESOLVED: 'Kết quả báo cáo',
  COMMENT_REMOVED_BY_REPORT: 'Gỡ bình luận vi phạm',
  COMMENT_WARNING_BY_REPORT: 'Cảnh báo bình luận',
  COMMENT_REPORT_REJECTED_OWNER: 'Báo cáo bình luận đã bác',
  COMMENT_REPORT_APPROVED: 'Đã xử lý báo cáo',
  COMMENT_REPORT_REJECTED: 'Từ chối báo cáo',
  DONATION_RECEIVED: 'Nhận ủng hộ',
  AUTHOR_DONATION: 'Nhận ủng hộ',
  NEW_FOLLOWER: 'Người theo dõi mới',
  AUTHOR_FOLLOWED: 'Người theo dõi mới',
  SYSTEM: 'Hệ thống',
  SYSTEM_ANNOUNCEMENT: 'Thông báo hệ thống'
};

export function notificationTypeLabel(type: string): string {
  if (!type) return 'Thông báo hệ thống';
  const mapped = NOTIFICATION_TYPE_LABELS[type];
  if (mapped) return mapped;
  const upper = type.toUpperCase();
  if (upper.includes('WITHDRAW')) return 'Rút Xu';
  if (upper.includes('APPEAL')) return 'Khiếu nại';
  if (upper.includes('MODERATION') || upper.includes('REVIEW')) return 'Kiểm duyệt';
  if (upper.includes('COMMENT')) return 'Bình luận';
  if (upper.includes('REPORT')) return 'Báo cáo';
  if (upper.includes('CHAPTER')) return 'Chương mới';
  if (upper.includes('SYSTEM')) return 'Hệ thống';
  if (/^[A-Z0-9_]+$/.test(type)) return 'Thông báo hệ thống';
  return type;
}

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

export async function markAllNotificationsRead(currentItems: AppNotification[] = []) {
  const unreadIds = new Set<string>(
    currentItems.filter((item) => item.status === 'UNREAD').map((item) => item.notificationId)
  );
  let page = 1;
  while (page <= 5) {
    const response = await listNotifications('UNREAD', page);
    for (const item of response.data) {
      if (item.status === 'UNREAD') unreadIds.add(item.notificationId);
    }
    if (!response.meta.totalPages || page >= response.meta.totalPages || response.data.length === 0) {
      break;
    }
    page += 1;
  }
  await Promise.all([...unreadIds].map((id) => markNotificationRead(id)));
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
