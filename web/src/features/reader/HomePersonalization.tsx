import { chapterHref, navigationHref } from '../../shared/routes';
import { hasReaderCapability } from '../auth/auth-types';
import { useIsMutating, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel, getNovelStatistics } from '../novels/novel-statistics-api';
import { useToast } from '../../shared/components/ToastProvider';
import { getReaderNovel, listHistoryPage, type ReaderNovel } from './reader-api';
import { HomeNovelCover } from './HomeNovelCover';

export function PreviewLibraryAction({ novelId, authorId }: { novelId: string; authorId: string }) {
  const user = useAuthStore(state => state.user);
  const client = useQueryClient();
  const { showToast } = useToast();
  const canSave = hasReaderCapability(user) && user?.status === 'ACTIVE' && user?.userId !== authorId;
  const key = ['novel-statistics', novelId, user?.userId ?? 'guest'];
  const mutationKey = ['home-library-toggle', novelId, user?.userId ?? 'guest'];
  const statistics = useQuery({ queryKey: key, queryFn: () => getNovelStatistics(novelId), enabled: canSave, staleTime: 15_000, retry: false });
  const busy = useIsMutating({ mutationKey }) > 0;
  const save = useMutation({
    mutationKey,
    mutationFn: ({ userId, following }: { userId: string; following: boolean }) => {
      if (useAuthStore.getState().user?.userId !== userId) throw new Error('Session changed');
      return followNovel(novelId, following);
    },
    onSuccess: (data, variables) => {
      if (useAuthStore.getState().user?.userId !== variables.userId) return;
      client.setQueryData(['novel-statistics', novelId, variables.userId], data);
      void client.invalidateQueries({ queryKey: ['reader-library'] });
      void client.invalidateQueries({ queryKey: ['reader-home-sidebar-library'] });
      showToast(data.isFollowing ? 'Đã theo dõi truyện.' : 'Đã bỏ theo dõi truyện.', 'success');
    },
    onError: (_error, variables) => {
      if (useAuthStore.getState().user?.userId === variables.userId) showToast('Chưa cập nhật được trạng thái theo dõi. Hãy thử lại.', 'error');
    }
  });
  if (!user) return <Link className="sc-home-library-action" to={navigationHref("/login")}>Đăng nhập để theo dõi truyện</Link>;
  if (!canSave) return null;
  if (statistics.isError) return <button className="sc-home-library-action" type="button" onClick={() => void statistics.refetch()}>Tải lại trạng thái theo dõi</button>;
  const saved = statistics.data?.isFollowing ?? false;
  return <button className="sc-home-library-action" type="button" aria-pressed={saved} aria-busy={busy}
    disabled={busy || !statistics.isSuccess} onClick={() => save.mutate({ userId: user.userId, following: !saved })}>
    {busy ? 'Đang cập nhật…' : statistics.isPending ? 'Đang tải trạng thái…' : saved ? 'Bỏ theo dõi truyện' : 'Theo dõi truyện'}
  </button>;
}

function formatChapterLabel(chapterNumber: number, title: string) {
  if (/^\s*(?:chương|chapter)\s*\d+/iu.test(title)) return title;
  return `Chương ${chapterNumber}: ${title}`;
}

export function ContinueReading({
  catalogNovelsMap,
  catalogPath,
}: {
  catalogNovelsMap: Map<string, ReaderNovel>;
  catalogPath: string;
}) {
  const user = useAuthStore(state => state.user);
  const enabled = Boolean(user && user.role !== 'ADMIN' && user.status === 'ACTIVE');

  const history = useQuery({
    queryKey: ['reader-home-history', user?.userId],
    queryFn: () => listHistoryPage(1, 10),
    enabled,
    retry: false,
  });

  const recentItems = enabled
    ? (history.data?.items ?? [])
        .filter(entry => entry.novel && entry.chapter)
        .slice()
        .sort((a, b) => Date.parse(b.readAt) - Date.parse(a.readAt))
        .slice(0, 3)
    : [];

  const detailQueries = useQueries({
    queries: recentItems.map(entry => {
      const cached = catalogNovelsMap.get(entry.novelId);
      const needsFetch = enabled && (!cached || typeof cached.chaptersCount !== 'number');
      return {
        queryKey: ['reader-home-resume-novel', entry.novelId],
        queryFn: ({ signal }: { signal: AbortSignal }) => getReaderNovel(entry.novelId, signal),
        enabled: needsFetch,
        staleTime: 60_000,
        retry: false,
      };
    }),
  });

  if (!enabled) return null;

  return (
    <section className="sc-home-panel sc-home-section" id="continue-reading" aria-label="Đọc tiếp">
      <div className="sc-home-sec-head">
        <div className="sc-home-sec-left">
          <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">menu_book</span>
          <h2>Đọc tiếp</h2>
        </div>
        <Link className="sc-home-sec-link" to={navigationHref("/reader/history")}>Xem lịch sử đọc →</Link>
      </div>

      {history.isPending ? (
        <div className="sc-home-read-grid" aria-busy="true" aria-label="Đang tải lịch sử đọc">
          {Array.from({ length: 3 }, (_, idx) => (
            <div key={idx} className="sc-home-read-card is-skeleton" aria-hidden="true">
              <span className="sc-skeleton-block sc-home-read-thumb" />
              <div className="sc-home-read-body">
                <span className="sc-skeleton-block" style={{ width: '82%', height: 13 }} />
                <span className="sc-skeleton-block" style={{ width: '64%', height: 11 }} />
                <span className="sc-skeleton-block" style={{ width: '100%', height: 6, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      ) : history.isError ? (
        <div className="sc-home-inline-notice" role="alert">
          <span>Chưa tải được lịch sử đọc.</span>
          <button type="button" onClick={() => void history.refetch()}>Thử lại</button>
        </div>
      ) : recentItems.length === 0 ? (
        <div className="sc-home-empty-inline">
          <span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>
          <p>Bạn chưa có lịch sử đọc nào. Hãy chọn một truyện để lưu tiến độ đọc tại đây.</p>
          <Link className="sc-home-sec-link" to={catalogPath}>Khám phá truyện →</Link>
        </div>
      ) : (
        <div className="sc-home-read-grid" data-count={recentItems.length}>
          {recentItems.map((entry, idx) => {
            const cachedNovel = catalogNovelsMap.get(entry.novelId);
            const fetchedNovel = detailQueries[idx]?.data;
            const totalChapters =
              fetchedNovel?.chapters?.length ??
              cachedNovel?.chaptersCount ??
              fetchedNovel?.chaptersCount ??
              0;

            let progressPercent: number | null = null;
            if (totalChapters > 0) {
              const verifiedCount = entry.readChapterIds?.length ?? 0;
              const chapterIdx = fetchedNovel?.chapters
                ? fetchedNovel.chapters.findIndex(c => c.chapterId === entry.chapterId) + 1
                : 0;
              const bestStep = Math.max(chapterIdx, entry.chapter.chapterNumber || 0, verifiedCount);
              if (bestStep > 0) {
                progressPercent = Math.min(100, Math.max(1, Math.round((bestStep / totalChapters) * 100)));
              }
            }

            const chapterLabel = formatChapterLabel(entry.chapter.chapterNumber, entry.chapter.title);
            const coverNovel = {
              novelId: entry.novelId,
              title: entry.novel.title,
              coverImageUrl: entry.novel.coverImageUrl,
              genre: cachedNovel?.genre ?? null,
              genres: cachedNovel?.genres,
            };

            return (
              <Link
                key={entry.novelId}
                className="sc-home-read-card"
                to={chapterHref(entry)}
                title={`${entry.novel.title} — ${chapterLabel}`}
              >
                <span className="sc-home-read-thumb">
                  <HomeNovelCover novel={coverNovel} size="thumb" />
                </span>
                <div className="sc-home-read-body">
                  <strong className="sc-home-read-title">{entry.novel.title}</strong>
                  <span className="sc-home-read-chapter">{chapterLabel}</span>
                  {progressPercent !== null ? (
                    <div className="sc-home-progress-line" aria-label={`Tiến độ đọc ${progressPercent}%`}>
                      <span className="sc-home-progress-track">
                        <span className="sc-home-progress-fill" style={{ width: `${progressPercent}%` }} />
                      </span>
                      <span className="sc-home-progress-pct">{progressPercent}%</span>
                    </div>
                  ) : (
                    <span className="sc-home-read-resume-hint">Đọc tiếp →</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
