import { useEffect } from 'react';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { useAuthStore } from '../auth/useAuthStore';

const chapterIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20000 && value.every(id => typeof id === 'string' && id.length <= 100);

/** Guests keep local visit markers; authenticated readers use verified server reads. */
export function useReadChapterIds(novelId: string, openedChapterId?: string) {
  const userId = useAuthStore(state => state.user?.userId ?? 'guest');
  const [ids, setIds] = useWorkspacePreference<string[]>(`read-chapters:${novelId}`, [], chapterIds);
  useEffect(() => {
    if (userId === 'guest' && novelId && openedChapterId) setIds(previous => previous.includes(openedChapterId) ? previous : [...previous, openedChapterId].slice(-20000));
  }, [novelId, openedChapterId, userId]);
  return userId === 'guest' ? ids : [];
}
