import { ReaderCatalog } from './ReaderCatalog';
import { ChapterToc, ReadingSettings } from '../../shared/components/ReaderTools';
import { ReadingProgress } from '../../shared/components/ReadingProgress';
import { AnimatedSaveButton } from '../../shared/components/SaveFeedback';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { CommentsSection } from './CommentsSection';
import { NovelOverview } from './ReaderNovelOverview';
import { NovelChapterCatalog } from './NovelChapterCatalog';
import { NovelReadAction } from './NovelReadAction';
import { NovelReportDialog } from './NovelReportDialog';
import { useReadChapterIds } from './useReadChapterIds';
import { NovelReviews } from './NovelReviews';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel } from '../novels/novel-statistics-api';
import { NumberInput, Select } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { Breadcrumbs, type BreadcrumbItem } from '../../shared/components/Breadcrumbs';
import { navigationLabels, readerHomeCrumb } from '../../shared/components/navigation';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useToast } from '../../shared/components/ToastProvider';
import {
  getHistoryForNovel,
  getReadingPreferences,
  getReaderChapter,
  getReaderNovel,
  listHistory,
  listLibrary,
  removeFromLibrary,
  reportContent,
  saveReadingPreferences,
  syncHistory,
  unlockVipChapter,
  type ReadingPreferences,
  type ReaderChapter,
  type ReaderNovel
} from './reader-api';

// Reader screens reuse the StoryCraft author vocabulary: sc-navbar/sc-shell-content for layout,
// sc-novel-card/sc-novel-overview/sc-novel-metrics for novels and sc-button for actions.

const card = 'bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs';
const serialLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
  PUBLISHED: 'Đã xuất bản'
};

// ─── Discovery ──────────────────────────────────────────────────────────────

export function ReaderPage() {
  return <ReaderCatalog />;
}

export function PublicReaderPage() {
  return <PublicLayout><ReaderCatalog publicMode /></PublicLayout>;
}

// ─── Novel detail ───────────────────────────────────────────────────────────

export function ReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const userId = useAuthStore(state => state.user?.userId);
  const novelQuery = useQuery({
    queryKey: ['reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });
  const continueQuery = useQuery({
    queryKey: ['reader-history-novel', novelId, userId],
    queryFn: () => getHistoryForNovel(novelId),
    enabled: Boolean(novelId && userId),
    retry: false
  });
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);

  if (novelQuery.isLoading) return <LoadingState label="Đang tải thông tin truyện..." />;
  if (novelQuery.isError) return <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} />;

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];
  const firstChapter = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)[0];
  const readChapterIds = continueQuery.data?.readChapterIds ?? [];
  const currentChapter = chapters.find(chapter => chapter.chapterId === continueQuery.data?.chapterId && readChapterIds.includes(chapter.chapterId));
  const continueChapterId = currentChapter?.chapterId ?? firstChapter?.chapterId;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb back={readerHomeCrumb} current={novel?.title ?? 'Chi tiết truyện'}>
        <NovelReportDialog key={novelId} novelId={novelId} onSuccess={() => setInteractionNotice('Đã gửi báo cáo truyện tới quản trị viên.')} />
      </Breadcrumb>

      {novel ? (
        <NovelOverview
          novel={novel}
          chapters={chapters}
          authorLink={novel.authorId ? `/authors/${novel.authorId}` : undefined}
          notice={interactionNotice}
          actions={
            <>
              {continueChapterId ? (
                <NovelReadAction to={`/reader/chapters/${continueChapterId}`} label={currentChapter ? `Đọc tiếp · Chương ${currentChapter.chapterNumber}` : 'Bắt đầu đọc'} />
              ) : null}

            </>
          }
        />
      ) : null}

      <section id="reader-reviews" className="sc-reader-detail-section" aria-label="Đánh giá độc giả"><NovelReviews novelId={novelId} compact /></section>
      <NovelChapterCatalog
        chapters={chapters}
        readChapterIds={readChapterIds}
        onReadFirst={firstChapter ? () => navigate(`/reader/chapters/${firstChapter.chapterId}`) : undefined}
      />
      <section id="reader-comments" aria-label="Bình luận truyện"><CommentsSection kind="novel" id={novelId} /></section>
    </div>
  );
}

export function PublicReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const readChapterIds = useReadChapterIds(novelId);
  const novelQuery = useQuery({
    queryKey: ['public-reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];
  const firstChapter = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)[0];

  return (
    <PublicLayout>
      {novelQuery.isLoading ? <LoadingState label="Đang tải thông tin truyện..." /> : null}
      {novelQuery.isError ? <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} /> : null}
      {novel ? (
        <>
          <Breadcrumb back={{ to: '/public', label: 'Thư viện công khai' }} current={novel.title} />
          <NovelOverview
            novel={novel}
            chapters={chapters}
            authorLink={novel.authorId ? `/authors/${novel.authorId}` : undefined}
            notice="Đăng nhập để theo dõi truyện, đánh giá và bình luận."
            actions={
              <>
                {firstChapter ? (
                  <NovelReadAction to={`/public/chapters/${firstChapter.chapterId}`} label="Đọc chương đầu" />
                ) : null}
              </>
            }
          />
          <section id="reader-reviews" className="sc-reader-detail-section" aria-label="Đánh giá độc giả"><NovelReviews novelId={novelId} compact /></section>
          <NovelChapterCatalog chapters={chapters} publicMode readChapterIds={readChapterIds} />
          <section id="reader-comments" aria-label="Bình luận truyện"><CommentsSection kind="novel" id={novelId} /></section>
        </>
      ) : null}
    </PublicLayout>
  );
}

// ─── Chapter reading ────────────────────────────────────────────────────────

export function ReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const userId = useAuthStore(state => state.user?.userId);
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({ queryKey: ['reading-preferences'], queryFn: getReadingPreferences });
  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', chapterId, userId],
    queryFn: () => getReaderChapter(chapterId),
    enabled: Boolean(chapterId),
    retry: false
  });
  const chapterNovelQuery = useQuery({
    queryKey: ['reader-novel', chapterQuery.data?.novelId],
    queryFn: () => getReaderNovel(chapterQuery.data?.novelId ?? ''),
    enabled: Boolean(chapterQuery.data?.novelId)
  });
  const syncHistoryMutation = useMutation({
    mutationFn: (input: { novelId: string; chapterId: string }) => syncHistory(input),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reader-history'] }),
      queryClient.invalidateQueries({ queryKey: ['reader-history-novel'] })
    ])
  });
  const unlockMutation = useMutation({
    mutationFn: () => unlockVipChapter(chapterId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reader-chapter', chapterId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: () => reportContent({ targetType: 'CHAPTER', targetId: chapterId, reason: 'Reader report' })
  });
  const preferencesMutation = useMutation({
    mutationFn: saveReadingPreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reading-preferences'] });
    }
  });

  const isLockedVip = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';
  const chapter = chapterQuery.data;
  useReadChapterIds(chapter?.novelId ?? '', chapter?.chapterId);

  useEffect(() => {
    if (chapter?.novelId) {
      syncHistoryMutation.mutate({ novelId: chapter.novelId, chapterId });
    }
  }, [chapter?.novelId, chapterId]);

  if (chapterQuery.isLoading) return <LoadingState label="Đang tải chương..." />;

  if (isLockedVip) {
    return (
      <LockedChapter message={getApiErrorMessage(chapterQuery.error)}>
        <button type="button" onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending} className="sc-button sc-button-primary">
          <span className="material-symbols-outlined" aria-hidden="true">lock_open</span>
          {unlockMutation.isPending ? 'Đang mở khóa...' : 'Mở khóa chương'}
        </button>
        <Link to="/wallet" className="sc-button">
          <span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
          Đến ví xu
        </Link>
        {unlockMutation.isError ? <p className="w-full text-meta text-red-700 mt-1">{getApiErrorMessage(unlockMutation.error)}</p> : null}
      </LockedChapter>
    );
  }

  if (chapterQuery.isError) return <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />;

  const novel = chapterNovelQuery.data;
  const chapterList = novel?.chapters ?? [];
  const currentChapterIndex = chapterList.findIndex((item) => item.chapterId === chapterId);
  const previousChapter = currentChapterIndex > 0 ? chapterList[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 ? chapterList[currentChapterIndex + 1] ?? null : null;
  const preferences = preferencesQuery.data;
  const novelPath = `/reader/novels/${chapter?.novelId ?? ''}`;
  const navigation = (
    <ChapterNavigation
      previousTo={previousChapter ? `/reader/chapters/${previousChapter.chapterId}` : undefined}
      nextTo={nextChapter ? `/reader/chapters/${nextChapter.chapterId}` : undefined}
      indexTo={chapter?.novelId ? novelPath : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb back={{ to: chapter?.novelId ? novelPath : '/reader', label: novel?.title ?? 'Truyện' }} current={chapter ? `Chương ${chapter.chapterNumber}` : 'Chương'}>
        <button
          type="button"
          onClick={() => chapter?.novelId && syncHistoryMutation.mutate({ novelId: chapter.novelId, chapterId })}
          disabled={!chapter || syncHistoryMutation.isPending}
          className="sc-button"
          aria-label={syncHistoryMutation.isPending ? 'Đang lưu tiến độ đọc' : 'Lưu tiến độ đọc'}
          title="Lưu tiến độ đọc"
        >
          <span className="material-symbols-outlined" aria-hidden="true">sync</span>
          <span className="hidden sm:inline" aria-hidden="true">{syncHistoryMutation.isPending ? 'Đang lưu...' : 'Lưu tiến độ'}</span>
        </button>
        <button
          type="button"
          onClick={() => reportMutation.mutate()}
          disabled={reportMutation.isPending}
          className="sc-button text-red-700"
          aria-label={reportMutation.isSuccess ? 'Đã báo cáo chương' : 'Báo cáo chương'}
          title="Báo cáo chương"
        >
          <span className="material-symbols-outlined" aria-hidden="true">flag</span>
          <span className="hidden sm:inline" aria-hidden="true">{reportMutation.isSuccess ? 'Đã báo cáo' : 'Báo cáo'}</span>
        </button>
      </Breadcrumb>

      <ChapterHeader chapter={chapter} navigation={<div className="flex flex-wrap items-center gap-2">
        {navigation}
        <ChapterToc chapters={chapterList} currentId={chapterId} />
        {preferences && <ReadingSettings><ReadingPreferencesPanel preferences={preferences} onSave={next => preferencesMutation.mutate(next)} saving={preferencesMutation.isPending} saved={preferencesMutation.isSuccess} /></ReadingSettings>}
      </div>} />

      <ChapterProse key={chapterId} content={chapter?.content ?? ''} style={buildReaderStyle(preferences)} />
      <div className="flex justify-center">{navigation}</div>
      <CommentsSection kind="chapter" id={chapterId} />
    </div>
  );
}

export function PublicReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const userId = useAuthStore(state => state.user?.userId ?? 'guest');
  const chapterQuery = useQuery({
    queryKey: ['public-reader-chapter', chapterId, userId],
    queryFn: () => getReaderChapter(chapterId),
    enabled: Boolean(chapterId),
    retry: false
  });
  const tocQuery = useQuery({
    queryKey: ['public-reader-novel', chapterQuery.data?.novelId],
    queryFn: () => getReaderNovel(chapterQuery.data?.novelId ?? ''),
    enabled: Boolean(chapterQuery.data?.novelId)
  });
  const isLockedVip = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';
  const chapter = chapterQuery.data;
  useReadChapterIds(chapter?.novelId ?? '', chapter?.chapterId);
  const novelPath = `/public/novels/${chapter?.novelId ?? ''}`;

  return (
    <PublicLayout>
      {chapterQuery.isLoading ? <LoadingState label="Đang tải chương..." /> : null}
      {isLockedVip ? (
        <LockedChapter message="Khách có thể xem thông tin truyện, nhưng cần đăng nhập để mở khóa chương VIP.">
          <Link to="/login" className="sc-button sc-button-primary">
            <span className="material-symbols-outlined" aria-hidden="true">login</span>
            Đăng nhập để mở khóa
          </Link>
          <Link to="/public" className="sc-button">Thư viện công khai</Link>
        </LockedChapter>
      ) : null}
      {chapterQuery.isError && !isLockedVip ? <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} /> : null}
      {chapter ? (
        <>
          <Breadcrumb back={{ to: novelPath, label: 'Chi tiết truyện' }} current={`Chương ${chapter.chapterNumber}`} />
          <ChapterHeader chapter={chapter} navigation={<div className="flex flex-wrap items-center gap-2"><ChapterNavigation indexTo={novelPath} /><ChapterToc chapters={tocQuery.data?.chapters ?? []} currentId={chapterId} publicMode /></div>} />
          <ChapterProse key={chapterId} content={chapter.content ?? ''} style={buildReaderStyle()} />
          <CommentsSection kind="chapter" id={chapterId} />
        </>
      ) : null}
    </PublicLayout>
  );
}

// ─── Library & history ──────────────────────────────────────────────────────

export function ReaderLibraryPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const user = useAuthStore(state => state.user);
  const libraryQuery = useQuery({ queryKey: ['reader-library'], queryFn: listLibrary });
  const removeMutation = useMutation({
    mutationFn: async (novelId: string) => {
      if (user?.role === 'READER') await followNovel(novelId, false);
      else await removeFromLibrary(novelId);
    },
    onSuccess: async () => {
      showToast('Đã bỏ theo dõi truyện.', 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reader-library'] }),
        queryClient.invalidateQueries({ queryKey: ['novel-statistics'] })
      ]);
    },
    onError: error => showToast(getApiErrorMessage(error), 'error')
  });
  const novels = libraryQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[readerHomeCrumb, { label: 'Thư viện của tôi' }]} title="Thư viện của tôi" />
      <section className="flex flex-col gap-4">
        <SectionHeading title="Truyện đang theo dõi" count={libraryQuery.isSuccess ? `${novels.length} truyện` : undefined} />
        <QueryStates
          loading={libraryQuery.isLoading}
          error={libraryQuery.isError ? libraryQuery.error : null}
          onRetry={() => void libraryQuery.refetch()}
          empty={libraryQuery.isSuccess && !novels.length}
          loadingLabel="Đang tải thư viện..."
          emptyTitle="Thư viện đang trống"
          emptyDescription="Bấm biểu tượng trái tim ở trang chi tiết để theo dõi truyện tại đây."
          emptyAction={<Link to="/reader" className="sc-button sc-button-primary">Danh sách truyện</Link>}
        />
        <NovelGrid>
          {novels.map((novel) => (
            <NovelCard
              key={novel.novelId}
              novel={novel}
              extraAction={
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(novel.novelId)}
                  disabled={removeMutation.isPending}
                  className={`${cardButton} text-red-700`}
                  data-testid={`reader-remove-library-${novel.novelId}`}
                >
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">favorite</span>
                  <span>Bỏ theo dõi</span>
                </button>
              }
            />
          ))}
        </NovelGrid>
      </section>
    </div>
  );
}

export function ReaderHistoryPage() {
  const historyQuery = useQuery({ queryKey: ['reader-history'], queryFn: listHistory });
  const items = historyQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[readerHomeCrumb, { label: 'Lịch sử đọc' }]} title="Lịch sử đọc" />
      <section className="flex flex-col gap-4">
        <SectionHeading title="Đọc gần đây" count={historyQuery.isSuccess ? `${items.length} truyện` : undefined} />
        <QueryStates
          loading={historyQuery.isLoading}
          error={historyQuery.isError ? historyQuery.error : null}
          onRetry={() => void historyQuery.refetch()}
          empty={historyQuery.isSuccess && !items.length}
          loadingLabel="Đang tải lịch sử đọc..."
          emptyTitle="Chưa có lịch sử đọc"
          emptyDescription="Các chương bạn đọc sẽ xuất hiện tại đây."
        />
        {items.length ? (
          <div className={`${card} overflow-hidden divide-y divide-stone-100`}>
            {items.map((item) => (
              <article key={item.novelId} className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 transition-colors">
                <Link
                  to={`/reader/novels/${item.novelId}`}
                  className="w-12 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-stone-100 border border-stone-200/70"
                >
                  <Cover url={item.novel.coverImageUrl} title={item.novel.title} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/reader/novels/${item.novelId}`}
                    className="py-0.5 text-body font-bold text-stone-900 hover:text-primary-600 line-clamp-1 transition-colors"
                  >
                    {item.novel.title}
                  </Link>
                  <p className="text-meta text-stone-600 truncate">
                    Đang đọc: {formatChapterTitle(item.chapter.chapterNumber, item.chapter.title)}
                  </p>
                  <p className="text-meta text-stone-400">Lần cuối: {new Date(item.readAt).toLocaleString('vi-VN')}</p>
                </div>
                <Link
                  to={`/reader/chapters/${item.chapterId}`}
                  className="sc-button sc-button-primary shrink-0"
                  data-testid={`reader-history-continue-${item.chapterId}`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                  <span>Đọc tiếp</span>
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

const cardButton =
  'inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-meta font-medium text-stone-700 border border-stone-200/80 shadow-2xs transition-colors';

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthorNavbar />
      <main className="sc-shell-content flex flex-col gap-4">{children}</main>
    </>
  );
}

function PageHeader({ crumbs = [], title, description, actions }: { crumbs?: BreadcrumbItem[]; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Breadcrumbs items={crumbs} />
        <h1 className="font-headline-sm text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">{title}</h1>
        {description ? <p className="text-body text-stone-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

function SectionHeading({ title, count, children }: { title: string; count?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-stone-900">{title}</h2>
        {count ? <span className="px-2.5 py-0.5 rounded-full bg-stone-200/80 text-stone-700 text-meta font-semibold">{count}</span> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

function Breadcrumb({ back, current, children }: { back: { to: string; label: string }; current: string; children?: ReactNode }) {
  return (
    <div className={`${card} px-3 py-1.5 flex items-center justify-between gap-3`}>
      <Breadcrumbs items={[back, { label: current }]} />
      {children ? <div className="flex items-center gap-1.5 shrink-0">{children}</div> : null}
    </div>
  );
}

function QueryStates({
  loading,
  error,
  onRetry,
  empty,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  emptyAction
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: boolean;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  if (loading) return <LoadingState label={loadingLabel} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return null;
}

function NovelGrid({ children }: { children: ReactNode }) {
  return <div className="sc-novel-grid">{children}</div>;
}

function Cover({ url, title }: { url?: string | null; title: string }) {
  return url ? (
    <img src={url} alt={title} className="w-full h-full object-cover" />
  ) : (
    <span className="sc-cover-placeholder flex h-full items-center justify-center p-2 text-center text-meta text-stone-500">{title}</span>
  );
}

function NovelCard({ novel, extraAction, publicMode = false }: { novel: ReaderNovel; extraAction?: ReactNode; publicMode?: boolean }) {
  const detailPath = `${publicMode ? '/public' : '/reader'}/novels/${novel.novelId}`;
  const statusLabel = serialLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đã xuất bản';

  return (
    <article className="sc-novel-card sc-reader-book">
        <Link
          to={detailPath}
          className="sc-cover-hover sc-book-cover"
          aria-label={`Đọc truyện: ${novel.title}`}
          data-testid={`novel-open-detail-${novel.novelId}`}
        >
          <Cover url={novel.coverImageUrl} title={novel.title} />
          <span className="sc-book-status" data-completed={(novel.serialStatus ?? novel.status) === 'COMPLETED'}>{statusLabel}</span>
        </Link>
        <div className="sc-book-info">
            <Link
              to={detailPath}
              className="sc-book-title"
              title={novel.title}
            >
              {novel.title}
            </Link>
          <div className="sc-book-metrics">
            <span><span className="material-symbols-outlined" aria-hidden="true">menu_book</span>{novel.chaptersCount ?? 0} chương</span>
            <span><span className="material-symbols-outlined" aria-hidden="true">visibility</span>{(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc</span>
          </div>
        </div>
        {extraAction ? <div className="mt-auto flex gap-2">{extraAction}</div> : null}
    </article>
  );
}

function ChapterHeader({ chapter, navigation }: { chapter: ReaderChapter | undefined; navigation: ReactNode }) {
  return (
    <section className={`${card} p-5 flex flex-col gap-4`}>
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`sc-novel-status ${chapter?.isVip ? '' : 'sc-novel-status-public'}`}>
            {chapter?.isVip ? `VIP • ${chapter.priceCoins} xu` : 'Miễn phí'}
          </span>
          {chapter?.wordCount ? <span className="text-meta text-stone-500">{chapter.wordCount.toLocaleString('vi-VN')} chữ</span> : null}
        </div>
        <h1 className="text-page-title text-stone-900">{chapter ? formatChapterTitle(chapter.chapterNumber, chapter.title) : 'Chương'}</h1>
      </div>
      {navigation}
    </section>
  );
}

function ChapterNavigation({ previousTo, nextTo, indexTo }: { previousTo?: string; nextTo?: string; indexTo?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {previousTo ? (
        <Link to={previousTo} className="sc-button"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>Chương trước</Link>
      ) : (
        <span className="sc-button opacity-50" aria-disabled="true"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>Chương trước</span>
      )}
      {indexTo ? (
        <Link to={indexTo} className="sc-button"><span className="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span>Mục lục</Link>
      ) : null}
      {nextTo ? (
        <Link to={nextTo} className="sc-button sc-button-primary">Chương sau<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link>
      ) : (
        <span className="sc-button opacity-50" aria-disabled="true">Chương sau<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></span>
      )}
    </div>
  );
}

function ChapterProse({ content, style }: { content: string; style: ReturnType<typeof buildReaderStyle> }) {
  return (
    <article className="sc-reading-surface rounded-xl border border-stone-200/80 shadow-2xs px-5 sm:px-12 py-8 sm:py-10" style={style}>
      <div className="max-w-[720px] mx-auto">
        <ReadingProgress><ManuscriptContent content={content} /></ReadingProgress>
      </div>
    </article>
  );
}

function LockedChapter({ message, children }: { message: string; children: ReactNode }) {
  return (
    <section className={`${card} p-8 flex flex-col items-center text-center`}>
      <span className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3">
        <span className="material-symbols-outlined text-[24px]" aria-hidden="true">lock</span>
      </span>
      <h1 className="text-section-title text-stone-900">Chương VIP đang khóa</h1>
      <p className="text-body text-stone-500 mt-1 max-w-md">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">{children}</div>
    </section>
  );
}

function ReadingPreferencesPanel({
  preferences,
  onSave,
  saving,
  saved
}: {
  preferences: ReadingPreferences;
  onSave: (preferences: ReadingPreferences) => void;
  saving: boolean;
  saved: boolean;
}) {
  const [draft, setDraft] = useState(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
      <Select comboboxProps={{ withinPortal: false }}
        label="Phông chữ"
        data={[
          { value: 'system-ui', label: 'Hệ thống' },
          { value: 'Georgia', label: 'Serif' },
          { value: 'Arial', label: 'Sans' }
        ]}
        value={draft.fontFamily ?? 'system-ui'}
        allowDeselect={false}
        onChange={(value) => setDraft((current) => ({ ...current, fontFamily: value }))}
        data-testid="reader-pref-font-family"
      />
      <NumberInput
        label="Cỡ chữ"
        min={10}
        max={40}
        value={draft.fontSize}
        onChange={(value) => setDraft((current) => ({ ...current, fontSize: Number(value) || current.fontSize }))}
        data-testid="reader-pref-font-size"
      />
      <Select comboboxProps={{ withinPortal: false }}
        label="Màu nền"
        data={[
          { value: 'LIGHT', label: 'Sáng' },
          { value: 'DARK', label: 'Tối' },
          { value: 'SEPIA', label: 'Sepia' }
        ]}
        value={draft.background}
        allowDeselect={false}
        onChange={(value) => setDraft((current) => ({ ...current, background: (value ?? 'DARK') as ReadingPreferences['background'] }))}
        data-testid="reader-pref-background"
      />
      <NumberInput
        label="Giãn dòng"
        min={1}
        max={3}
        step={0.1}
        value={draft.lineHeight}
        onChange={(value) => setDraft((current) => ({ ...current, lineHeight: Number(value) || current.lineHeight }))}
        data-testid="reader-pref-line-height"
      />
      <AnimatedSaveButton onClick={() => onSave(draft)} loading={saving} saved={saved} className="sc-button sc-button-primary" data-testid="reader-save-preferences-btn">
        Lưu tùy chỉnh
      </AnimatedSaveButton>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildReaderStyle(preferences?: ReadingPreferences) {
  const background =
    preferences?.background === 'LIGHT'
      ? '#f8fafc'
      : preferences?.background === 'SEPIA'
        ? '#2f261c'
        : preferences?.background === 'DARK' ? 'var(--sc-reader-dark-bg)' : 'var(--sc-surface)';
  const color = preferences?.background === 'LIGHT' ? '#111827' : preferences?.background === 'SEPIA' ? '#f5e6c8' : preferences?.background === 'DARK' ? 'var(--sc-reader-dark-text)' : 'var(--sc-text)';

  return {
    background,
    color,
    fontFamily: preferences?.fontFamily ?? 'system-ui',
    fontSize: preferences?.fontSize ?? 18,
    lineHeight: preferences?.lineHeight ?? 1.8
  };
}

function formatChapterTitle(chapterNumber: number, title: string) {
  const cleanTitle = title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return cleanTitle ? `Chương ${chapterNumber}: ${cleanTitle}` : `Chương ${chapterNumber}`;
}
