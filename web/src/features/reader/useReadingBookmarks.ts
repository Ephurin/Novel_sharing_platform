import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/useAuthStore';
import { useToast } from '../../shared/components/ToastProvider';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { listReadingBookmarkEntries, removeReadingBookmarkEntry, saveReadingBookmarkEntry, type ReadingBookmarkDraft, type ReadingBookmarkEntry } from './reader-api';

const storageKey = 'storycraft-guest-reading-bookmarks';
const changed = 'storycraft-reading-bookmarks-changed';
function snapshot() { try { return localStorage.getItem(storageKey) ?? '[]'; } catch { return '[]'; } }
function parse(value: string): ReadingBookmarkEntry[] {
  try {
    const items: unknown = JSON.parse(value);
    return Array.isArray(items) ? items.filter((item): item is ReadingBookmarkEntry => item &&
      typeof item.bookmarkId === 'string' && typeof item.chapterId === 'string' && typeof item.novelId === 'string' &&
      Number.isInteger(item.paragraphIndex) && item.paragraphIndex >= 0 && item.paragraphIndex <= 1000000 &&
      Number.isFinite(item.pageOffset) && item.pageOffset >= 0 && item.pageOffset <= 1 &&
      (item.startOffset === undefined || (Number.isInteger(item.startOffset) && item.startOffset >= 0 && item.startOffset <= 10000000)) &&
      (item.endOffset == null || (Number.isInteger(item.endOffset) && item.endOffset > (item.startOffset ?? 0) && item.endOffset <= 10000000)) &&
      typeof item.excerpt === 'string' && item.excerpt.length <= 500 && typeof item.novelTitle === 'string' &&
      typeof item.chapterTitle === 'string' && typeof item.updatedAt === 'string') : [];
  } catch { return []; }
}
function write(items: ReadingBookmarkEntry[]) {
  localStorage.setItem(storageKey, JSON.stringify(items));
  window.dispatchEvent(new Event(changed));
}
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener); };
}
function migrateGuestBookmarks() {
  try {
    const items = parse(snapshot());
    let added = false;
    const migrated: string[] = [];
    for (const key of Object.keys(localStorage).filter(key => key.startsWith('storycraft-workspace:guest:reading-bookmark:'))) {
      const old = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!old) continue;
      if (items.some(item => item.chapterId === old.chapterId && item.paragraphIndex === old.paragraphIndex)) { migrated.push(key); continue; }
      const entry = { ...old, bookmarkId: `legacy-${old.novelId}`, excerpt: '', novelTitle: 'Truyện đã lưu bookmark', chapterTitle: 'Chương đã lưu', chapterNumber: 0, coverImageUrl: null };
      if (parse(JSON.stringify([entry])).length) { items.push(entry); migrated.push(key); added = true; }
    }
    if (added) write(items);
    for (const key of migrated) localStorage.removeItem(key);
  } catch { /* Reading still works when browser storage is unavailable. */ }
}

type Operation = { type: 'save'; input: ReadingBookmarkDraft } | { type: 'remove'; bookmarkId: string };
export function useReadingBookmarks(novelId?: string, { loadAll = false } = {}) {
  const userId = useAuthStore(state => state.user?.userId);
  const client = useQueryClient();
  const { showToast } = useToast();
  const local = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => { if (!userId) migrateGuestBookmarks(); }, [userId]);
  const query = useInfiniteQuery({ queryKey: ['reader-bookmarks', userId, novelId], initialPageParam: 1,
    queryFn: ({ pageParam }) => listReadingBookmarkEntries(novelId, pageParam), enabled: Boolean(userId),
    getNextPageParam: (last, pages) => pages.length < last.totalPages ? pages.length + 1 : undefined, retry: false });
  // A line action needs the complete novel collection to distinguish save from remove.
  // The standalone library keeps its explicit pagination.
  const needsMore = Boolean(userId && loadAll && query.hasNextPage);
  useEffect(() => {
    if (needsMore && !query.isFetching && !query.isError) void query.fetchNextPage();
  }, [needsMore, query.isFetching, query.isError, query.fetchNextPage]);
  const success = (operation: Operation) => showToast(operation.type === 'save' ? 'Đã lưu bookmark.' : 'Đã xóa bookmark.', 'success');
  const mutation = useMutation({
    scope: { id: `reading-bookmarks:${userId}` },
    mutationFn: async ({ account, operation }: { account: string; operation: Operation }) => {
      if (useAuthStore.getState().user?.userId !== account) throw new Error('Phiên đăng nhập đã thay đổi.');
      if (operation.type === 'save') await saveReadingBookmarkEntry(operation.input);
      else await removeReadingBookmarkEntry(operation.bookmarkId);
    },
    onSuccess: async (_, variables) => {
      await client.invalidateQueries({ queryKey: ['reader-bookmarks', variables.account] });
      if (useAuthStore.getState().user?.userId === variables.account) success(variables.operation);
    },
    onError: (error, variables) => { if (useAuthStore.getState().user?.userId === variables.account) showToast(getApiErrorMessage(error), 'error'); }
  });
  const update = (operation: Operation) => {
    if (userId) { mutation.mutate({ account: userId, operation }); return; }
    try {
      const items = parse(snapshot());
      if (operation.type === 'remove') write(items.filter(item => item.bookmarkId !== operation.bookmarkId));
      else {
        const input = operation.input;
        const existing = items.find(item => item.chapterId === input.chapterId && item.paragraphIndex === input.paragraphIndex && (item.startOffset ?? 0) === (input.startOffset ?? 0));
        write([{ ...input, bookmarkId: existing?.bookmarkId ?? crypto.randomUUID(), updatedAt: new Date().toISOString() },
          ...items.filter(item => item.bookmarkId !== existing?.bookmarkId)]);
      }
      success(operation);
    } catch { showToast('Không lưu được bookmark trên thiết bị. Hãy kiểm tra bộ nhớ trình duyệt.', 'error'); }
  };
  const guest = useMemo(() => parse(local).filter(item => !novelId || item.novelId === novelId), [local, novelId]);
  const items = useMemo(() => userId ? query.data?.pages.flatMap(page => page.items) ?? [] : guest, [userId, query.data, guest]);
  return { items,
    totalItems: userId ? query.data?.pages[0]?.totalItems ?? 0 : guest.length,
    pending: Boolean(userId && (query.isPending || (needsMore && !query.isError))), saving: mutation.isPending, error: userId ? query.error : null,
    retry: () => void query.refetch(), more: Boolean(userId && query.hasNextPage), loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(), save: (input: ReadingBookmarkDraft) => update({ type: 'save', input }),
    remove: (bookmarkId: string) => update({ type: 'remove', bookmarkId }) };
}
