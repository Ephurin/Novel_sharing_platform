import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingPreferences, saveReadingPreferences, type ReadingPreferences } from './reader-api';

export const readerBackgrounds = [
  { value: 'LIGHT', label: 'Sáng' }, { value: 'SEPIA', label: 'Giấy ngà' },
  { value: 'MINT', label: 'Xanh lá nhạt' }, { value: 'BLUE', label: 'Xanh dịu' },
  { value: 'ROSE', label: 'Hồng nhạt' }, { value: 'DARK', label: 'Tối' },
  { value: 'BLACK', label: 'Đen' }
] as const;

export const defaultChapterPreferences: ReadingPreferences = {
  fontFamily: 'Be Vietnam Pro', fontSize: 18, background: 'LIGHT', lineHeight: 1.8, margin: 24, textAlign: 'LEFT'
};

function validPreferences(value: unknown): value is ReadingPreferences | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const item = value as ReadingPreferences;
  return typeof item.fontFamily === 'string' && item.fontFamily.length <= 80 &&
    Number.isInteger(item.fontSize) && item.fontSize >= 10 && item.fontSize <= 40 &&
    readerBackgrounds.some(background => background.value === item.background) &&
    Number.isFinite(item.lineHeight) && item.lineHeight >= 1 && item.lineHeight <= 3 &&
    Number.isInteger(item.margin) && item.margin! >= 0 && item.margin! <= 80 &&
    ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'].includes(item.textAlign ?? '');
}

function normalize(preferences?: ReadingPreferences | null): ReadingPreferences {
  return {
    fontFamily: preferences?.fontFamily || defaultChapterPreferences.fontFamily,
    fontSize: preferences?.fontSize ?? 18,
    background: preferences?.background ?? 'LIGHT',
    lineHeight: preferences?.lineHeight ?? 1.8,
    margin: preferences?.margin ?? 24, textAlign: preferences?.textAlign ?? 'LEFT' };
}

export function useChapterReadingPreferences() {
  const userId = useAuthStore(state => state.user?.userId);
  const client = useQueryClient();
  const [local, setLocal] = useWorkspacePreference<ReadingPreferences | null>('chapter-reading-preferences', null, validPreferences);
  const query = useQuery({ queryKey: ['reading-preferences', userId], queryFn: getReadingPreferences, enabled: Boolean(userId), retry: false });
  const save = useMutation({
    scope: { id: `reading-preferences:${userId}` },
    mutationFn: ({ account, preferences }: { account: string; preferences: ReadingPreferences }) => {
      if (useAuthStore.getState().user?.userId !== account) throw new Error('Session changed');
      return saveReadingPreferences(preferences);
    },
    onSuccess: async (preferences, variables) => {
      const queryKey = ['reading-preferences', variables.account];
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, preferences);
    }
  });
  const preferences = normalize(local ?? query.data);
  const signature = JSON.stringify(preferences);
  const serverSignature = JSON.stringify(normalize(query.data));
  const failedSignature = save.isError ? JSON.stringify(save.variables?.preferences) : undefined;
  useEffect(() => {
    if (userId && local && query.isSuccess && signature === serverSignature) setLocal(null);
  }, [userId, local, query.isSuccess, signature, serverSignature]);
  useEffect(() => {
    if (!userId || !local || !query.isSuccess || save.isPending || signature === serverSignature || signature === failedSignature) return;
    const timeout = window.setTimeout(() => save.mutate({ account: userId, preferences }), 350);
    return () => window.clearTimeout(timeout);
  }, [userId, signature, serverSignature, query.isSuccess, save.isPending, failedSignature]);
  const failed = query.isError || (save.isError && signature === failedSignature);
  const pending = Boolean(userId && (query.isPending || save.isPending || (local && signature !== serverSignature && !failed)));
  const retry = () => { if (query.isError) void query.refetch(); else save.reset(); };
  return { preferences, update: (patch: Partial<ReadingPreferences>) => setLocal({ ...preferences, ...patch }),
    status: failed ? 'error' : pending ? 'saving' : userId ? 'saved' : 'local', retry } as const;
}
