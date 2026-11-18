import { apiClient, type ApiEnvelope } from './api-client';
import type { NotificationItem } from './types';

export type NotificationListPage = {
  data: NotificationItem[];
  meta: {
    page: number;
    limit: number;
    totalItems?: number;
    totalPages?: number;
  };
};

export type BulkMarkReadResult = {
  targetIds: string[];
  updatedById: Record<string, NotificationItem>;
  failedCount: number;
  firstError: unknown;
};

function toFiniteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveNotificationTotalPages(meta: { limit: number; totalItems?: number; totalPages?: number }) {
  if (typeof meta.totalPages === 'number' && meta.totalPages > 0) return meta.totalPages;
  if (typeof meta.totalItems === 'number' && meta.totalItems > 0 && meta.limit > 0) {
    return Math.ceil(meta.totalItems / meta.limit);
  }
  return 0;
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
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

export async function listNotificationsPage({
  status,
  page = 1,
  limit = 30
}: {
  status?: 'UNREAD' | 'READ';
  page?: number;
  limit?: number;
} = {}): Promise<NotificationListPage> {
  const response = await apiClient.get<ApiEnvelope<NotificationItem[]>>('/notifications', {
    params: { ...(status ? { status } : {}), page, limit }
  });
  const rawMeta = response.data.meta ?? {};
  const resolvedLimit = toFiniteNumber(rawMeta.limit) ?? limit;
  const totalItems = toFiniteNumber(rawMeta.totalItems);
  const totalPages = toFiniteNumber(rawMeta.totalPages);
  return {
    data: response.data.data ?? [],
    meta: {
      page: toFiniteNumber(rawMeta.page) ?? page,
      limit: resolvedLimit,
      totalItems,
      totalPages
    }
  };
}

export async function listNotifications() {
  const pageResult = await listNotificationsPage({ page: 1, limit: 30 });
  return pageResult.data;
}

export async function fetchUnreadNotificationCount(): Promise<{ total: number; fromMeta: boolean }> {
  const page = await listNotificationsPage({ status: 'UNREAD', page: 1, limit: 1 });
  if (typeof page.meta.totalItems === 'number') {
    return { total: Math.max(0, page.meta.totalItems), fromMeta: true };
  }
  return {
    total: page.data.filter((item) => item.status === 'UNREAD').length,
    fromMeta: false
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await fetchUnreadNotificationCount();
  return result.total;
}

export async function markNotificationRead(notificationId: string) {
  const response = await apiClient.patch<ApiEnvelope<NotificationItem>>(`/notifications/${notificationId}/read`);
  return response.data.data;
}

export async function markAllNotificationsRead(seedItems: NotificationItem[] = []): Promise<BulkMarkReadResult> {
  const PAGE_LIMIT = 30;
  const unreadIds = new Set<string>(
    seedItems.filter((item) => item.status === 'UNREAD').map((item) => item.notificationId)
  );
  const firstPage = await listNotificationsPage({ status: 'UNREAD', page: 1, limit: PAGE_LIMIT });
  for (const item of firstPage.data) {
    if (item.status === 'UNREAD') unreadIds.add(item.notificationId);
  }

  let knownTotalPages = resolveNotificationTotalPages(firstPage.meta);
  if (knownTotalPages > 1) {
    let nextPage = 2;
    while (nextPage <= knownTotalPages) {
      const pageBatch: number[] = [];
      for (let i = 0; i < 4 && nextPage <= knownTotalPages; i += 1, nextPage += 1) {
        pageBatch.push(nextPage);
      }
      const pages = await Promise.all(
        pageBatch.map((p) => listNotificationsPage({ status: 'UNREAD', page: p, limit: PAGE_LIMIT }))
      );
      let sawEmpty = false;
      for (const pageResult of pages) {
        const nextTotal = resolveNotificationTotalPages(pageResult.meta);
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
      const pageResult = await listNotificationsPage({ status: 'UNREAD', page, limit: PAGE_LIMIT });
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
  if (targetIds.length === 0) {
    return { targetIds: [], updatedById: {}, failedCount: 0, firstError: null };
  }

  const settled = await runWithConcurrency(targetIds, 6, (id) => markNotificationRead(id));
  const updatedById: Record<string, NotificationItem> = {};
  const fallbackReadAt = new Date().toISOString();
  let failedCount = 0;
  let firstError: unknown = null;

  settled.forEach((result, index) => {
    const id = targetIds[index];
    if (result.status === 'fulfilled') {
      updatedById[id] = result.value ?? {
        notificationId: id,
        type: 'SYSTEM',
        title: '',
        status: 'READ',
        createdAt: fallbackReadAt,
        readAt: fallbackReadAt
      };
    } else {
      failedCount += 1;
      if (firstError === null) firstError = result.reason;
    }
  });

  return { targetIds, updatedById, failedCount, firstError };
}
