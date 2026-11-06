import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel, getNovelStatistics } from '../novels/novel-statistics-api';
import { AnimatedProgress } from '../../shared/components/AnimatedProgress';
import { useToast } from '../../shared/components/ToastProvider';
import { getReaderNovel, listHistory } from './reader-api';

export function PreviewLibraryAction({ novelId, authorId }: { novelId: string; authorId: string }) {
  const user = useAuthStore(state => state.user);
  const client = useQueryClient();
  const { showToast } = useToast();
  const canSave = user?.role === 'READER' && user.status === 'ACTIVE' && user.userId !== authorId;
  const key = ['novel-statistics', novelId, user?.userId ?? 'guest'];
  const mutationKey = ['home-library-toggle', novelId, user?.userId ?? 'guest'];
  const statistics = useQuery({ queryKey: key, queryFn: () => getNovelStatistics(novelId), enabled: canSave, staleTime: 15_000, retry: false });
  const busy = useIsMutating({ mutationKey }) > 0;
  const save = useMutation({ mutationKey,
    mutationFn: ({ userId, following }: { userId: string; following: boolean }) => {
      if (useAuthStore.getState().user?.userId !== userId) throw new Error('Session changed');
      return followNovel(novelId, following);
    },
    onSuccess: (data, variables) => {
      if (useAuthStore.getState().user?.userId !== variables.userId) return;
      client.setQueryData(['novel-statistics', novelId, variables.userId], data);
      void client.invalidateQueries({ queryKey: ['reader-library'] });
      showToast(data.isFollowing ? 'Đã theo dõi truyện.' : 'Đã bỏ theo dõi truyện.', 'success');
    },
    onError: (_error, variables) => {
      if (useAuthStore.getState().user?.userId === variables.userId) showToast('Chưa cập nhật được trạng thái theo dõi. Hãy thử lại.', 'error');
    }
  });
  if (!user) return <Link className="sc-home-library-action" to="/login">Đăng nhập để theo dõi truyện</Link>;
  if (!canSave) return null;
  if (statistics.isError) return <button className="sc-home-library-action" type="button" onClick={() => void statistics.refetch()}>Tải lại trạng thái theo dõi</button>;
  const saved = statistics.data?.isFollowing ?? false;
  return <button className="sc-home-library-action" type="button" aria-pressed={saved} aria-busy={busy}
    disabled={busy || !statistics.isSuccess} onClick={() => save.mutate({ userId: user.userId, following: !saved })}>
    {busy ? 'Đang cập nhật…' : statistics.isPending ? 'Đang tải trạng thái…' : saved ? 'Bỏ theo dõi truyện' : 'Theo dõi truyện'}
  </button>;
}

export function ContinueReading() {
  const user = useAuthStore(state => state.user);
  const enabled = user?.role === 'READER' && user.status === 'ACTIVE';
  const history = useQuery({ queryKey: ['reader-home-history', user?.userId], queryFn: listHistory, enabled, retry: false });
  const item = enabled ? history.data?.filter(entry => entry.novel && entry.chapter).slice().sort((a, b) => Date.parse(b.readAt) - Date.parse(a.readAt))[0] : undefined;
  const detail = useQuery({ queryKey: ['reader-home-resume', user?.userId, item?.novelId],
    queryFn: ({ signal }) => getReaderNovel(item!.novelId, signal), enabled: Boolean(enabled && item), retry: false });
  if (!enabled) return null;
  if (history.isError) return <div className="sc-home-resume-error"><span>Chưa tải được lịch sử đọc.</span><button type="button" onClick={() => void history.refetch()}>Thử lại lịch sử đọc</button></div>;
  if (!item) return null;
  const chapters = detail.data?.chapters ?? [];
  const publishedIndex = chapters.findIndex(chapter => chapter.chapterId === item.chapterId);
  const index = item.readChapterIds?.includes(item.chapterId) ? publishedIndex : -1;
  const position = index >= 0 ? (index + 1) / chapters.length * 100 : null;
  return <section className="sc-home-resume" aria-label="Đọc tiếp">
    <div><h2>Đọc tiếp</h2><Link className="sc-home-novel-title" to={`/reader/novels/${item.novelId}`}>{item.novel.title}</Link>
      <p>{/^\s*(?:chương|chapter)\s*\d+/iu.test(item.chapter.title) ? item.chapter.title : `Chương ${item.chapter.chapterNumber}: ${item.chapter.title}`}</p>
      {position !== null && <AnimatedProgress value={position} label={`Vị trí chương ${index + 1} / ${chapters.length}`} />}
      {detail.isError && <button type="button" className="sc-home-resume-retry" onClick={() => void detail.refetch()}>Tải lại thông tin chương</button>}
      {detail.isSuccess && publishedIndex < 0 && <p>Chương đọc gần đây không còn khả dụng.</p>}
    </div>
    <Link className="sc-home-preview-link" to={index >= 0 ? `/reader/chapters/${item.chapterId}` : `/reader/novels/${item.novelId}`}>
      {index >= 0 ? 'Đọc tiếp' : 'Xem truyện'}
    </Link>
  </section>;
}
