import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useToast } from '../../shared/components/ToastProvider';
import { useAuthStore } from '../auth/useAuthStore';
import { CommentsSection } from './CommentsSection';
import { ChapterReadingWorkspace } from './ChapterReadingWorkspace';
import { getReaderChapter, getReaderNovel, reportContent, syncHistory, unlockVipChapter } from './reader-api';
import { useReadChapterIds } from './useReadChapterIds';

export function ChapterReader({ publicMode = false }: { publicMode?: boolean }) {
  const { chapterId = '' } = useParams();
  const userId = useAuthStore(state => state.user?.userId);
  const client = useQueryClient();
  const { showToast } = useToast();
  const chapterQuery = useQuery({
    queryKey: [publicMode ? 'public-reader-chapter' : 'reader-chapter', chapterId, userId ?? 'guest'],
    queryFn: () => getReaderChapter(chapterId), enabled: Boolean(chapterId), retry: false
  });
  const chapter = chapterQuery.data;
  const novelQuery = useQuery({
    queryKey: [publicMode ? 'public-reader-novel' : 'reader-novel', chapter?.novelId],
    queryFn: () => getReaderNovel(chapter!.novelId), enabled: Boolean(chapter?.novelId), retry: false
  });
  const chapters = useMemo(() => [...(novelQuery.data?.chapters ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber), [novelQuery.data?.chapters]);
  const history = useMutation({
    mutationFn: syncHistory,
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['reader-history'] }),
      client.invalidateQueries({ queryKey: ['reader-history-novel'] }),
      client.invalidateQueries({ queryKey: ['reader-home-history'] })
    ])
  });
  const unlock = useMutation({
    mutationFn: () => unlockVipChapter(chapterId),
    onSuccess: () => client.invalidateQueries({ queryKey: [publicMode ? 'public-reader-chapter' : 'reader-chapter', chapterId] })
  });
  const report = useMutation({
    mutationFn: () => reportContent({ targetType: 'CHAPTER', targetId: chapterId, reason: 'Reader report' }),
    onSuccess: () => showToast('Đã gửi báo cáo chương.', 'success'),
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });
  useReadChapterIds(chapter?.novelId ?? '', chapterQuery.isSuccess ? chapter?.chapterId : undefined);
  useEffect(() => {
    if (userId && chapter?.novelId && chapterQuery.isSuccess) history.mutate({ novelId: chapter.novelId, chapterId });
  }, [userId, chapter?.novelId, chapterId, chapterQuery.isSuccess]);

  if (chapterQuery.isPending) return <LoadingState label="Đang tải chương…" />;
  if (chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002') {
    return <section className="sc-reader-locked-chapter sc-reader-detail-section">
      <span className="material-symbols-outlined" aria-hidden="true">lock</span>
      <h1 className="text-section-title">Chương VIP đang khóa</h1>
      <p>{publicMode && !userId ? 'Đăng nhập để mở khóa chương VIP.' : getApiErrorMessage(chapterQuery.error)}</p>
      <div>{userId ? <>
        <button type="button" className="sc-button sc-button-primary" disabled={unlock.isPending} onClick={() => unlock.mutate()}>{unlock.isPending ? 'Đang mở khóa…' : 'Mở khóa chương'}</button>
        <Link to="/wallet" className="sc-button">Đến ví xu</Link>
      </> : <Link to="/login" className="sc-button sc-button-primary">Đăng nhập để mở khóa</Link>}
        <Link to={publicMode ? '/public' : '/reader'} className="sc-button">Danh sách truyện</Link></div>
      {unlock.isError && <p role="alert">{getApiErrorMessage(unlock.error)}</p>}
    </section>;
  }
  if (chapterQuery.isError) return <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />;
  if (!chapter) return null;
  return <>
    <ChapterReadingWorkspace key={chapterId} chapter={chapter} novel={novelQuery.data} chapters={chapters} publicMode={publicMode}
      tocPending={novelQuery.isPending} tocFailed={novelQuery.isError} onRetryToc={() => void novelQuery.refetch()}
      onReport={userId ? () => report.mutate() : undefined} reporting={report.isPending} />
    <section className="sc-reader-comments" aria-label="Bình luận chương"><CommentsSection kind="chapter" id={chapterId} /></section>
  </>;
}
