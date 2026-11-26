import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResourceId } from '../../app/ResourceRoute';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useToast } from '../../shared/components/ToastProvider';
import { useAuthStore } from '../auth/useAuthStore';
import { CommentsSection } from './CommentsSection';
import { AuthorPrivateFeedback, type AuthorFeedbackRequest } from './PrivateComments';
import { ChapterReadingWorkspace } from './ChapterReadingWorkspace';
import { getReaderChapter, getReaderNovel, reportContent, syncHistory, unlockVipChapter } from './reader-api';
import { getWallet } from '../wallet/wallet-api';
import { useReadChapterIds } from './useReadChapterIds';
import { ReaderNotFound, isReaderNotFound } from './ReaderNotFound';

export function ChapterReader({ publicMode = false }: { publicMode?: boolean }) {
  const chapterId = useResourceId('chapterId') ?? '';
  const userId = useAuthStore(state => state.user?.userId);
  const [feedbackRequest, setFeedbackRequest] = useState<AuthorFeedbackRequest>();
  const client = useQueryClient();
  const { showToast } = useToast();
  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', chapterId, userId ?? 'guest'],
    queryFn: () => getReaderChapter(chapterId), enabled: Boolean(chapterId), retry: false
  });
  const chapter = chapterQuery.data;
  const novelQuery = useQuery({
    queryKey: ['reader-novel', chapter?.novelId],
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
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['reader-chapter', chapterId] }),
      client.invalidateQueries({ queryKey: ['wallet'] }),
      client.invalidateQueries({ queryKey: ['wallet-transactions'] })
    ]),
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });
  // UAT 2026-11-20 (BUG-001): show the price and the balance before the reader spends coins.
  const locked = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';
  const lockDetails = locked ? (chapterQuery.error as ApiClientError).details as { priceCoins?: number | null } | undefined : undefined;
  const price = typeof lockDetails?.priceCoins === 'number' ? lockDetails.priceCoins : null;
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: getWallet, enabled: locked && Boolean(userId), retry: false });
  const balance = walletQuery.data?.coinsBalance;
  const notEnough = price !== null && typeof balance === 'number' && balance < price;
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
      <p>{publicMode && !userId ? 'Đăng nhập để mở khóa chương VIP.' : price !== null
        ? `Mở khóa chương này với ${price} xu. Sau khi mở khóa, bạn đọc lại được bất cứ lúc nào.`
        : getApiErrorMessage(chapterQuery.error)}</p>
      {userId && typeof balance === 'number' && <p className="text-meta" data-testid="unlock-balance">
        Số dư hiện tại: {balance} xu{notEnough ? ' — chưa đủ để mở khóa chương này.' : ''}
      </p>}
      <div>{userId ? <>
        <button type="button" className="sc-button sc-button-primary" disabled={unlock.isPending || notEnough} data-testid="btn-unlock-chapter"
          onClick={() => unlock.mutate()}>{unlock.isPending ? 'Đang mở khóa…' : price !== null ? `Mở khóa · ${price} xu` : 'Mở khóa chương'}</button>
        <Link to="/wallet" className={notEnough ? 'sc-button sc-button-primary' : 'sc-button'}>{notEnough ? 'Nạp thêm xu' : 'Đến ví xu'}</Link>
      </> : <Link to="/login" className="sc-button sc-button-primary">Đăng nhập để mở khóa</Link>}
        <Link to={publicMode ? '/public' : '/reader'} className="sc-button">Danh sách truyện</Link></div>
      {unlock.isError && <p role="alert">{getApiErrorMessage(unlock.error)}</p>}
    </section>;
  }
  if (chapterQuery.isError && isReaderNotFound(chapterQuery.error)) return <ReaderNotFound publicMode={publicMode} />;
  if (chapterQuery.isError) return <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />;
  if (!chapter) return null;
  const requestedFeedback = feedbackRequest?.chapterId === chapterId && feedbackRequest.userId === userId ? feedbackRequest : undefined;
  return <>
    <ChapterReadingWorkspace key={chapterId} chapter={chapter} novel={novelQuery.data} chapters={chapters} publicMode={publicMode}
      tocPending={novelQuery.isPending} tocFailed={novelQuery.isError} onRetryToc={() => void novelQuery.refetch()}
      onReport={userId ? () => report.mutate() : undefined} reporting={report.isPending}
      onOpenAuthorFeedback={userId ? () => setFeedbackRequest({ chapterId, userId }) : undefined}>
      <section className="sc-reader-comments" aria-label="Bình luận chương"><CommentsSection kind="chapter" id={chapterId}
        authorFeedback={<AuthorPrivateFeedback target={{ kind: 'chapter', id: chapterId }} requestedFeedback={requestedFeedback} />} /></section>
    </ChapterReadingWorkspace>
  </>;
}
