import { apiClient, getApiErrorMessage, type ApiEnvelope } from '../../shared/api/api-client';
import { formatNumber } from '../../shared/lib/format-vi';

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
  DISCUSSION_REPLY: 'Phản hồi thảo luận',
  AUTHOR_REPLY: 'Phản hồi từ tác giả',
  READER_COMMENT: 'Bình luận mới',
  PUBLICATION_REVIEW: 'Kiểm duyệt xuất bản',
  MODERATION_APPROVED: 'Đã duyệt nội dung',
  MODERATION_REJECTED: 'Từ chối nội dung',
  MODERATION_REVISION_REQUIRED: 'Cần chỉnh sửa',
  WITHDRAW_APPROVED: 'Duyệt rút xu',
  WITHDRAW_REJECTED: 'Từ chối rút xu',
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
  if (upper.includes('WITHDRAW')) return 'Rút xu';
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
  if (item.type === 'DISCUSSION_REPLY') {
    const { topicId, commentId } = item.payload;
    const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
    if (typeof topicId !== 'string' || !uuid.test(topicId) ||
        typeof commentId !== 'string' || !uuid.test(commentId)) return null;
    return `/discussions/${topicId}?commentId=${commentId}#comment-${commentId}`;
  }
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
  return {
    ...response.data,
    data: response.data.data.map((item) => {
      const amount = item.type === 'AUTHOR_INCOME' ? /^([0-9]+) xu$/i.exec(item.content) : null;
      return amount ? { ...item, content: `${formatNumber(Number(amount[1]))} xu` } : item;
    }),
    meta: {
      ...response.data.meta,
      totalItems: Number(response.data.meta.totalItems ?? response.data.data.length),
      totalPages: Number(response.data.meta.totalPages ?? 0)
    }
  };
}

export async function markNotificationRead(notificationId: string) {
  const response = await apiClient.patch<ApiEnvelope<AppNotification>>(`/notifications/${notificationId}/read`);
  return response.data.data;
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const workers = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        try {
          results[index] = { status: 'fulfilled', value: await worker(items[index]) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    })
  );
  return results;
}

function resolveNotificationTotalPages(meta: { totalPages?: number; totalItems?: number }, limit: number) {
  const totalPages = Number(meta.totalPages ?? 0);
  if (Number.isFinite(totalPages) && totalPages > 0) return totalPages;
  const totalItems = Number(meta.totalItems ?? 0);
  if (Number.isFinite(totalItems) && totalItems > 0 && limit > 0) {
    return Math.ceil(totalItems / limit);
  }
  return 0;
}

export async function markAllNotificationsRead(currentItems: AppNotification[] = []) {
  const PAGE_LIMIT = 20;
  const unreadIds = new Set<string>(
    currentItems.filter((item) => item.status === 'UNREAD').map((item) => item.notificationId)
  );
  const firstPage = await listNotifications('UNREAD', 1);
  for (const item of firstPage.data) {
    if (item.status === 'UNREAD') unreadIds.add(item.notificationId);
  }

  let knownTotalPages = resolveNotificationTotalPages(firstPage.meta, PAGE_LIMIT);
  if (knownTotalPages > 1) {
    let nextPage = 2;
    while (nextPage <= knownTotalPages) {
      const pageBatch: number[] = [];
      for (let i = 0; i < 4 && nextPage <= knownTotalPages; i += 1, nextPage += 1) {
        pageBatch.push(nextPage);
      }
      const pages = await Promise.all(pageBatch.map((pageNum) => listNotifications('UNREAD', pageNum)));
      let sawEmpty = false;
      for (const pageResult of pages) {
        const nextTotal = resolveNotificationTotalPages(pageResult.meta, PAGE_LIMIT);
        if (nextTotal > knownTotalPages) knownTotalPages = nextTotal;
        if (pageResult.data.length === 0) sawEmpty = true;
        for (const item of pageResult.data) {
          if (item.status === 'UNREAD') unreadIds.add(item.notificationId);
        }
      }
      if (sawEmpty) break;
    }
  } else if (knownTotalPages === 0 && firstPage.data.length >= PAGE_LIMIT) {
    let page = 2;
    while (true) {
      const pageResult = await listNotifications('UNREAD', page);
      let addedOnPage = false;
      for (const item of pageResult.data) {
        if (item.status === 'UNREAD' && !unreadIds.has(item.notificationId)) {
          unreadIds.add(item.notificationId);
          addedOnPage = true;
        }
      }
      if (!addedOnPage || pageResult.data.length < PAGE_LIMIT) break;
      page += 1;
    }
  }

  const targetIds = [...unreadIds];
  if (targetIds.length === 0) return;
  const settled = await runWithConcurrency(targetIds, 6, (id) => markNotificationRead(id));
  const failed = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed.length > 0) {
    const firstMessage = getApiErrorMessage(failed[0].reason);
    throw new Error(
      `Không thể đánh dấu đã đọc ${failed.length}/${targetIds.length} thông báo${firstMessage ? `: ${firstMessage}` : '.'}`
    );
  }
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
  const totalItems = response.data.meta?.totalItems;
  if (typeof totalItems === 'number' && Number.isFinite(totalItems)) return totalItems;
  if (typeof totalItems === 'string' && totalItems.trim() !== '' && Number.isFinite(Number(totalItems))) {
    return Number(totalItems);
  }
  return (response.data.data ?? []).filter((item) => item.status === 'UNREAD').length;
}
