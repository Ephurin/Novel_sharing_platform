import { ReaderCatalog } from './ReaderCatalog';
import { ChapterReader } from './ChapterReader';
import { CommentsSection } from './CommentsSection';
import { NovelOverview } from './ReaderNovelOverview';
import { NovelChapterCatalog } from './NovelChapterCatalog';
import { NovelReadAction } from './NovelReadAction';
import { NovelReportDialog } from './NovelReportDialog';
import { useReadChapterIds } from './useReadChapterIds';
import { NovelReviews } from './NovelReviews';
import { useAuthStore } from '../auth/useAuthStore';
import { followNovel } from '../novels/novel-statistics-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { Breadcrumbs, type BreadcrumbItem } from '../../shared/components/Breadcrumbs';
import { navigationLabels, readerHomeCrumb } from '../../shared/components/navigation';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useToast } from '../../shared/components/ToastProvider';
import {
  getHistoryForNovel,
  getReaderNovel,
  listHistory,
  listLibrary,
  removeFromLibrary,
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

function formatChapterTitle(chapterNumber: number, title: string) {
  const cleanTitle = title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return cleanTitle ? `Chương ${chapterNumber}: ${cleanTitle}` : `Chương ${chapterNumber}`;
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
  return <ChapterReader />;
}

export function PublicReaderChapterPage() {
  return <PublicLayout><ChapterReader publicMode /></PublicLayout>;
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
                  className="sc-button sc-button-soft sc-library-unfollow"
                  aria-busy={removeMutation.isPending && removeMutation.variables === novel.novelId}
                  data-testid={`reader-remove-library-${novel.novelId}`}
                >
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">favorite</span>
                  <span>{removeMutation.isPending && removeMutation.variables === novel.novelId ? 'Đang bỏ theo dõi…' : 'Bỏ theo dõi'}</span>
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
