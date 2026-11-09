import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { useToast } from '../../shared/components/ToastProvider';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingBookmark, removeReadingBookmark, saveReadingBookmark, type ReadingBookmark } from './reader-api';

function validBookmark(value: unknown): value is ReadingBookmark | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const bookmark = value as ReadingBookmark;
  return typeof bookmark.chapterId === 'string' && bookmark.chapterId.length <= 100 &&
    typeof bookmark.novelId === 'string' && bookmark.novelId.length <= 100 &&
    Number.isInteger(bookmark.paragraphIndex) && bookmark.paragraphIndex >= 0 && bookmark.paragraphIndex <= 1000000 &&
    Number.isFinite(bookmark.pageOffset) && bookmark.pageOffset >= 0 && bookmark.pageOffset <= 1;
}

export function useReadingBookmark(novelId: string) {
  const userId = useAuthStore(state => state.user?.userId);
  const client = useQueryClient();
  const { showToast } = useToast();
  const [local, setLocal] = useWorkspacePreference<ReadingBookmark | null>(`reading-bookmark:${novelId}`, null, validBookmark);
  const key = ['reader-position-bookmark', userId, novelId];
  const query = useQuery({ queryKey: key, queryFn: () => getReadingBookmark(novelId), enabled: Boolean(userId), retry: false });
  const mutation = useMutation({
    scope: { id: `reader-position-bookmark:${userId}:${novelId}` },
    mutationFn: async ({ account, bookmark }: { account: string; bookmark: ReadingBookmark | null }) => {
      if (useAuthStore.getState().user?.userId !== account) throw new Error('Session changed');
      if (bookmark) return saveReadingBookmark(bookmark);
      await removeReadingBookmark(novelId);
      return null;
    },
    onSuccess: async (bookmark, variables) => {
      const queryKey = ['reader-position-bookmark', variables.account, novelId];
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, bookmark);
      if (useAuthStore.getState().user?.userId === variables.account) showToast(bookmark ? 'Đã đánh dấu vị trí đọc.' : 'Đã bỏ dấu trang.', 'success');
    },
    onError: (error, variables) => {
      if (useAuthStore.getState().user?.userId === variables.account) showToast(getApiErrorMessage(error), 'error');
    }
  });
  const update = (bookmark: ReadingBookmark | null) => {
    if (userId) mutation.mutate({ account: userId, bookmark });
    else { setLocal(bookmark); showToast(bookmark ? 'Đã đánh dấu vị trí đọc trên thiết bị.' : 'Đã bỏ dấu trang.', 'success'); }
  };
  return { bookmark: userId ? query.data ?? null : local, update,
    pending: mutation.isPending || Boolean(userId && query.isPending),
    failed: Boolean(userId && query.isError), retry: () => void query.refetch() };
}
