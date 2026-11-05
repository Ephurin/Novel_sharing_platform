import { ResponsiveFilters, ReactionIcon } from '../../shared/components/InteractionWidgets';
import { ChapterToc, ReadingSettings } from '../../shared/components/ReaderTools';
import { ReadingProgress } from '../../shared/components/ReadingProgress';
import { AnimatedSaveButton } from '../../shared/components/SaveFeedback';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { CommentsSection } from './CommentsSection';
import { NovelEngagement } from './NovelEngagement';
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
import {
  addToLibrary,
  followAuthor,
  getHistoryForNovel,
  getReadingPreferences,
  getReaderChapter,
  getReaderNovel,
  likeNovel,
  listHistory,
  listLibrary,
  removeFromLibrary,
  reportContent,
  saveReadingPreferences,
  searchPublishedNovels,
  syncHistory,
  unlikeNovel,
  unlockVipChapter,
  unfollowAuthor,
  type ReadingPreferences,
  type ReaderChapter,
  type ReaderNovel
} from './reader-api';

// Reader screens reuse the StoryCraft author vocabulary: sc-navbar/sc-shell-content for layout,
// sc-novel-card/sc-novel-overview/sc-novel-metrics for novels and sc-button for actions.

type StoryStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | '';
type SortKey = 'updatedAt' | 'views' | 'likes' | 'relevance';

const card = 'bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs';
const statusTabs: Array<{ value: StoryStatus; label: string }> = [
  { value: '', label: 'Tất cả' },
  { value: 'ONGOING', label: 'Đang ra' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'HIATUS', label: 'Tạm ngưng' }
];
const serialLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
  PUBLISHED: 'Đã xuất bản'
};

// ─── Discovery ──────────────────────────────────────────────────────────────

export function ReaderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StoryStatus>('');
  const [sortFilter, setSortFilter] = useState<SortKey>('updatedAt');
  const [orderFilter, setOrderFilter] = useState<'desc' | 'asc'>('desc');
  const novelsQuery = useQuery({
    queryKey: ['reader-search', searchQuery, genreFilter, tagFilter, statusFilter, sortFilter, orderFilter],
    queryFn: () =>
      searchPublishedNovels({
        q: searchQuery,
        genre: genreFilter,
        tag: tagFilter,
        status: statusFilter,
        sort: sortFilter,
        order: orderFilter
      })
  });
  const novels = novelsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={navigationLabels.readerHome} />

      <section className="flex flex-col gap-4">
        <ResponsiveFilters className="flex flex-col gap-4">
          <SectionHeading title="Truyện đã xuất bản" count={novelsQuery.isSuccess ? `${novels.length} truyện` : undefined}>
            <label htmlFor="reader-sort" className="text-form-label text-stone-500">Sắp xếp</label>
            <select
              id="reader-sort"
              value={sortFilter}
              onChange={(event) => setSortFilter(event.target.value as SortKey)}
              className="bg-surface-container-lowest border border-stone-200 rounded-lg px-3 py-2 text-body text-stone-700"
            >
              <option value="updatedAt">Mới cập nhật</option>
              <option value="views">Lượt đọc</option>
              <option value="likes">Lượt thích</option>
              <option value="relevance">Liên quan nhất</option>
            </select>
            <select
              aria-label="Thứ tự sắp xếp"
              value={orderFilter}
              onChange={(event) => setOrderFilter(event.target.value as 'desc' | 'asc')}
              className="bg-surface-container-lowest border border-stone-200 rounded-lg px-3 py-2 text-body text-stone-700"
            >
              <option value="desc">Giảm dần</option>
              <option value="asc">Tăng dần</option>
            </select>
          </SectionHeading>

          <div className={`${card} px-3 py-2.5 flex flex-col gap-2.5`}>
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Tìm theo tên truyện, giới thiệu, thể loại..."
                testId="reader-search-input"
              />
              <div className="sc-filter-tabs flex items-center bg-stone-100 p-0.5 rounded-lg text-meta font-medium">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.value || 'all'}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    aria-pressed={statusFilter === tab.value}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      statusFilter === tab.value ? 'bg-primary-600 text-white shadow-xs font-semibold' : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <FilterInput value={genreFilter} onChange={setGenreFilter} placeholder="Lọc theo thể loại" icon="category" />
              <FilterInput value={tagFilter} onChange={setTagFilter} placeholder="Lọc theo thẻ" icon="sell" />
            </div>
          </div>

        </ResponsiveFilters>
        <QueryStates
          loading={novelsQuery.isLoading}
          error={novelsQuery.isError ? novelsQuery.error : null}
          onRetry={() => void novelsQuery.refetch()}
          empty={novelsQuery.isSuccess && !novels.length}
          loadingLabel="Đang tải danh sách truyện..."
          emptyTitle="Không tìm thấy truyện"
          emptyDescription="Không có truyện nào khớp với bộ lọc hiện tại."
        />

        <NovelGrid>
          {novels.map((novel) => (
            <NovelCard key={novel.novelId} novel={novel} />
          ))}
        </NovelGrid>
      </section>
    </div>
  );
}

export function PublicReaderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const novelsQuery = useQuery({
    queryKey: ['public-reader-search', searchQuery, genreFilter, tagFilter],
    queryFn: () =>
      searchPublishedNovels({
        q: searchQuery,
        genre: genreFilter,
        tag: tagFilter,
        sort: 'updatedAt',
        order: 'desc'
      })
  });
  const novels = novelsQuery.data ?? [];

  return (
    <PublicLayout>
      <PageHeader
        title={navigationLabels.publicHome}
        description="Đọc thử truyện đã xuất bản. Đăng nhập để lưu truyện, bình luận, mở khóa chương VIP hoặc báo cáo."
      />
      <ResponsiveFilters>
        <div className={`${card} px-3 py-2.5 flex flex-col md:flex-row gap-2.5`}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo tên truyện, giới thiệu..." />
          <FilterInput value={genreFilter} onChange={setGenreFilter} placeholder="Thể loại" icon="category" />
          <FilterInput value={tagFilter} onChange={setTagFilter} placeholder="Thẻ" icon="sell" />
        </div>
      </ResponsiveFilters>
      <QueryStates
        loading={novelsQuery.isLoading}
        error={novelsQuery.isError ? novelsQuery.error : null}
        onRetry={() => void novelsQuery.refetch()}
        empty={novelsQuery.isSuccess && !novels.length}
        loadingLabel="Đang tải truyện công khai..."
        emptyTitle="Không tìm thấy truyện"
        emptyDescription="Không có truyện công khai nào khớp với tìm kiếm."
      />
      <NovelGrid>
        {novels.map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} publicMode />
        ))}
      </NovelGrid>
    </PublicLayout>
  );
}

// ─── Novel detail ───────────────────────────────────────────────────────────

export function ReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const novelQuery = useQuery({
    queryKey: ['reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });
  const continueQuery = useQuery({
    queryKey: ['reader-history-novel', novelId],
    queryFn: () => getHistoryForNovel(novelId),
    enabled: Boolean(novelId),
    retry: false
  });
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const addLibraryMutation = useMutation({
    mutationFn: () => addToLibrary(novelId),
    onSuccess: async () => {
      setInteractionNotice('Đã thêm truyện vào thư viện của bạn.');
      await queryClient.invalidateQueries({ queryKey: ['reader-library'] });
    },
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'Truyện này đã có trong thư viện của bạn.'))
  });
  const likeMutation = useMutation({
    mutationFn: () => likeNovel(novelId),
    onSuccess: () => setInteractionNotice('Bạn đã thích truyện này.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'Bạn đã thích truyện này rồi.'))
  });
  const unlikeMutation = useMutation({
    mutationFn: () => unlikeNovel(novelId),
    onSuccess: () => setInteractionNotice('Đã bỏ thích truyện.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'Bạn chưa thích truyện này.'))
  });
  const followMutation = useMutation({
    mutationFn: () => followAuthor(novelQuery.data?.authorId ?? ''),
    onSuccess: () => setInteractionNotice('Bạn đang theo dõi tác giả này.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'Bạn đã theo dõi tác giả này rồi.'))
  });
  const unfollowMutation = useMutation({
    mutationFn: () => unfollowAuthor(novelQuery.data?.authorId ?? ''),
    onSuccess: () => setInteractionNotice('Đã bỏ theo dõi tác giả.'),
    onError: (error) => setInteractionNotice(formatInteractionError(error, 'Bạn chưa theo dõi tác giả này.'))
  });
  const reportMutation = useMutation({
    mutationFn: () => reportContent({ targetType: 'NOVEL', targetId: novelId, reason: 'Reader report' }),
    onSuccess: () => setInteractionNotice('Đã gửi báo cáo truyện tới quản trị viên.'),
    onError: (error) => setInteractionNotice(getApiErrorMessage(error))
  });

  if (novelQuery.isLoading) return <LoadingState label="Đang tải thông tin truyện..." />;
  if (novelQuery.isError) return <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} />;

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];
  const continueChapterId = continueQuery.data?.chapterId ?? chapters[0]?.chapterId;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb back={readerHomeCrumb} current={novel?.title ?? 'Chi tiết truyện'}>
        <button
          type="button"
          onClick={() => reportMutation.mutate()}
          disabled={reportMutation.isPending}
          className="sc-button text-red-700"
          aria-label="Báo cáo truyện"
          title="Báo cáo truyện"
        >
          <span className="material-symbols-outlined" aria-hidden="true">flag</span>
          <span className="hidden sm:inline" aria-hidden="true">Báo cáo</span>
        </button>
      </Breadcrumb>

      {novel ? (
        <NovelOverview
          novel={novel}
          chapterCount={novel.chaptersCount ?? chapters.length}
          authorLink={novel.authorId ? `/authors/${novel.authorId}` : undefined}
          notice={interactionNotice}
          actions={
            <>
              {continueChapterId ? (
                <button type="button" onClick={() => navigate(`/reader/chapters/${continueChapterId}`)} className="sc-button sc-button-primary">
                  <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                  {continueQuery.data ? `Đọc tiếp · Chương ${continueQuery.data.chapter.chapterNumber}` : 'Bắt đầu đọc'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => addLibraryMutation.mutate()}
                disabled={addLibraryMutation.isPending}
                className="sc-button sc-button-soft"
                data-testid="reader-add-library-btn"
              >
                <span className="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
                Thêm vào thư viện
              </button>
              <button type="button" onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending} className="sc-button" data-testid="reader-like-btn">
                <ReactionIcon icon="favorite" successVersion={likeMutation.isSuccess ? likeMutation.submittedAt : 0} />
                Thích
              </button>
              <button type="button" onClick={() => unlikeMutation.mutate()} disabled={unlikeMutation.isPending} className="sc-button" data-testid="reader-unlike-btn">
                Bỏ thích
              </button>
              <button
                type="button"
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending || !novel.authorId}
                className="sc-button"
                data-testid="reader-follow-btn"
              >
                <ReactionIcon icon="person_add" successVersion={followMutation.isSuccess ? followMutation.submittedAt : 0} />
                Theo dõi tác giả
              </button>
              <button
                type="button"
                onClick={() => unfollowMutation.mutate()}
                disabled={unfollowMutation.isPending || !novel.authorId}
                className="sc-button"
                data-testid="reader-unfollow-btn"
              >
                Bỏ theo dõi
              </button>
            </>
          }
        >
          <NovelEngagement novelId={novelId} authorId={novel.authorId} />
        </NovelOverview>
      ) : null}

      <ChapterTable
        chapters={chapters}
        onReadFirst={chapters.length ? () => navigate(`/reader/chapters/${chapters[0].chapterId}`) : undefined}
      />
      <CommentsSection kind="novel" id={novelId} />
    </div>
  );
}

export function PublicReaderNovelDetailPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const novelQuery = useQuery({
    queryKey: ['public-reader-novel', novelId],
    queryFn: () => getReaderNovel(novelId),
    enabled: Boolean(novelId)
  });

  const novel = novelQuery.data;
  const chapters = novel?.chapters ?? [];

  return (
    <PublicLayout>
      {novelQuery.isLoading ? <LoadingState label="Đang tải thông tin truyện..." /> : null}
      {novelQuery.isError ? <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} /> : null}
      {novel ? (
        <>
          <Breadcrumb back={{ to: '/public', label: 'Thư viện công khai' }} current={novel.title} />
          <NovelOverview
            novel={novel}
            chapterCount={novel.chaptersCount ?? chapters.length}
            authorLink={novel.authorId ? `/authors/${novel.authorId}` : undefined}
            notice="Thêm vào thư viện, thích, theo dõi, bình luận, báo cáo, lưu tiến độ và mở khóa chương VIP cần đăng nhập."
            actions={
              <>
                {chapters.length ? (
                  <button type="button" onClick={() => navigate(`/public/chapters/${chapters[0].chapterId}`)} className="sc-button sc-button-primary">
                    <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                    Đọc chương đầu
                  </button>
                ) : null}
                <Link to="/login" className="sc-button sc-button-soft">
                  <span className="material-symbols-outlined" aria-hidden="true">login</span>
                  Đăng nhập để tương tác
                </Link>
              </>
            }
          />
          <ChapterTable chapters={chapters} publicMode />
          <CommentsSection kind="novel" id={novelId} />
        </>
      ) : null}
    </PublicLayout>
  );
}

// ─── Chapter reading ────────────────────────────────────────────────────────

export function ReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({ queryKey: ['reading-preferences'], queryFn: getReadingPreferences });
  const chapterQuery = useQuery({
    queryKey: ['reader-chapter', chapterId],
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-history'] })
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
  const chapterQuery = useQuery({
    queryKey: ['public-reader-chapter', chapterId],
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
  const libraryQuery = useQuery({ queryKey: ['reader-library'], queryFn: listLibrary });
  const removeMutation = useMutation({
    mutationFn: removeFromLibrary,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-library'] })
  });
  const novels = libraryQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[readerHomeCrumb, { label: 'Thư viện của tôi' }]} title="Thư viện của tôi" />
      <section className="flex flex-col gap-4">
        <SectionHeading title="Truyện đã lưu" count={libraryQuery.isSuccess ? `${novels.length} truyện` : undefined} />
        <QueryStates
          loading={libraryQuery.isLoading}
          error={libraryQuery.isError ? libraryQuery.error : null}
          onRetry={() => void libraryQuery.refetch()}
          empty={libraryQuery.isSuccess && !novels.length}
          loadingLabel="Đang tải thư viện..."
          emptyTitle="Thư viện đang trống"
          emptyDescription="Bấm “Thêm vào thư viện” ở trang chi tiết truyện để lưu truyện tại đây."
          emptyAction={<Link to="/reader" className="sc-button sc-button-primary">Khám phá truyện</Link>}
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
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">bookmark_remove</span>
                  <span>Bỏ lưu</span>
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

function SearchInput({ value, onChange, placeholder, testId }: { value: string; onChange: (value: string) => void; placeholder: string; testId?: string }) {
  return (
    <div className="relative flex-1 min-w-[220px]">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[18px]" aria-hidden="true">search</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Tìm truyện"
        data-testid={testId}
        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-stone-50/80 text-meta text-stone-900 placeholder:text-stone-400 border border-stone-200/80 focus:outline-none focus:bg-surface-container-lowest focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
      />
    </div>
  );
}

function FilterInput({ value, onChange, placeholder, icon }: { value: string; onChange: (value: string) => void; placeholder: string; icon: string }) {
  return (
    <div className="relative flex-1 sm:max-w-[240px]">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[16px]" aria-hidden="true">{icon}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-stone-50/80 text-meta text-stone-900 placeholder:text-stone-400 border border-stone-200/80 focus:outline-none focus:bg-surface-container-lowest focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
      />
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
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}

function Cover({ url, title }: { url?: string | null; title: string }) {
  return url ? (
    <img src={url} alt={title} className="w-full h-full object-cover" />
  ) : (
    <span className="flex h-full items-center justify-center p-2 text-center text-meta text-stone-500">{title}</span>
  );
}

function NovelCard({ novel, extraAction, publicMode = false }: { novel: ReaderNovel; extraAction?: ReactNode; publicMode?: boolean }) {
  const detailPath = `${publicMode ? '/public' : '/reader'}/novels/${novel.novelId}`;
  const statusLabel = serialLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đã xuất bản';

  return (
    <article className="sc-novel-card bg-surface-container-lowest rounded-xl p-3.5 shadow-2xs hover:shadow-sm border border-stone-200/90 transition-all flex flex-col justify-between h-full group">
      <div className="flex gap-3.5 items-start">
        <Link
          to={detailPath}
          className="sc-cover-hover relative w-[96px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-stone-100 border border-stone-200/70 block group-hover:opacity-95 transition-opacity"
        >
          <Cover url={novel.coverImageUrl} title={novel.title} />
        </Link>
        <div className="flex flex-col flex-1 min-w-0 justify-between self-stretch py-0.5">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-meta font-medium text-stone-500 truncate">{novel.genre || 'Chưa phân loại'}</span>
              <span
                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap ${
                  novel.serialStatus === 'COMPLETED'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <Link
              to={detailPath}
              className="text-body font-bold text-stone-900 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors"
              title={novel.title}
            >
              {novel.title}
            </Link>
            {novel.authorName ? <p className="text-meta text-stone-500 truncate mt-0.5">{novel.authorName}</p> : null}
            <p className="text-meta text-stone-600 line-clamp-2 mt-1">{novel.synopsis || 'Chưa có lời giới thiệu.'}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-stone-600">
            <span className="material-symbols-outlined text-[15px] text-primary-600" aria-hidden="true">menu_book</span>
            <span><strong>{novel.chaptersCount ?? 0}</strong> chương</span>
            <span className="text-stone-300">•</span>
            <span className="material-symbols-outlined text-[15px] text-stone-400" aria-hidden="true">visibility</span>
            <span><strong>{(novel.viewsCount ?? 0).toLocaleString('vi-VN')}</strong> đọc</span>
            <span className="text-stone-300">•</span>
            <span className="material-symbols-outlined text-[15px] text-stone-400" aria-hidden="true">favorite</span>
            <span><strong>{(novel.likesCount ?? 0).toLocaleString('vi-VN')}</strong></span>
          </div>
        </div>
      </div>
      <div className="mt-3.5 pt-2.5 border-t border-stone-100 flex items-center gap-1.5">
        <Link
          to={detailPath}
          className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-colors"
          data-testid={`novel-open-detail-${novel.novelId}`}
        >
          <span className="material-symbols-outlined text-[15px]" aria-hidden="true">auto_stories</span>
          <span>Xem truyện</span>
        </Link>
        {extraAction}
      </div>
    </article>
  );
}

function NovelOverview({
  novel,
  chapterCount,
  authorLink,
  notice,
  actions,
  children
}: {
  novel: ReaderNovel;
  chapterCount: number;
  authorLink?: string;
  notice?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const statusLabel = serialLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đã xuất bản';
  return (
    <section className="sc-novel-overview" aria-label="Thông tin truyện">
      <div className="sc-novel-identity">
        <div className="sc-novel-cover">
          {novel.coverImageUrl ? <img src={novel.coverImageUrl} alt={novel.title} /> : <span>{novel.title}</span>}
        </div>
        <div className="sc-novel-description">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`sc-novel-status ${novel.serialStatus === 'COMPLETED' ? '' : 'sc-novel-status-public'}`}>{statusLabel}</span>
          </div>
          <h1 className="text-page-title text-stone-900 mb-2">{novel.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-2 text-body">
            <span className="text-stone-500">Thể loại:</span>
            {novel.genre ? <span className="sc-genre-tag">{novel.genre}</span> : <span className="text-stone-500">Chưa phân loại</span>}
            {(novel.tags ?? []).map((tag) => (
              <span key={tag} className="sc-genre-tag">#{tag}</span>
            ))}
          </div>
          {novel.authorName ? (
            <p className="text-body text-stone-500 mb-2">
              Tác giả:{' '}
              {authorLink ? (
                <Link className="text-stone-800 font-medium hover:underline" to={authorLink}>{novel.authorName}</Link>
              ) : (
                <span className="text-stone-800 font-medium">{novel.authorName}</span>
              )}
            </p>
          ) : null}
          <p className="sc-novel-synopsis text-body text-stone-600">{novel.synopsis || 'Chưa có lời giới thiệu.'}</p>
          {actions ? <div className="flex flex-wrap items-center gap-2 mt-3">{actions}</div> : null}
          {notice ? (
            <p className="text-meta text-stone-600 mt-2 flex items-center gap-1" role="status" data-testid="reader-interaction-notice">
              <span className="material-symbols-outlined text-primary-600" aria-hidden="true">info</span>
              {notice}
            </p>
          ) : null}
        </div>
      </div>
      {/* sc-novel-metrics lays out six author metrics; readers see three, so spread them evenly. */}
      <dl className="sc-novel-metrics" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div><dt>Tổng chương</dt><dd>{chapterCount.toLocaleString('vi-VN')}</dd></div>
        <div><dt>Lượt đọc</dt><dd>{(novel.viewsCount ?? 0).toLocaleString('vi-VN')}</dd></div>
        <div><dt>Lượt thích</dt><dd>{(novel.likesCount ?? 0).toLocaleString('vi-VN')}</dd></div>
      </dl>
      {children ? (
        <div className="sc-author-note">
          <h2 className="text-section-title mb-2">Đánh giá &amp; theo dõi</h2>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ChapterTable({ chapters, publicMode = false, onReadFirst }: { chapters: ReaderChapter[]; publicMode?: boolean; onReadFirst?: () => void }) {
  return (
    <section className={`${card} overflow-hidden flex flex-col`} aria-label="Danh sách chương">
      <div className="flex items-center justify-between gap-3 px-6 border-b border-stone-200/80">
        <div className="py-3 flex items-center gap-2 text-primary-600 font-semibold border-b-2 border-primary-600">
          <span>Danh sách chương</span>
          <span className="text-meta bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">{chapters.length}</span>
        </div>
        {onReadFirst ? (
          <button type="button" onClick={onReadFirst} className="sc-button sc-button-soft" aria-label="Đọc từ chương đầu" title="Đọc từ chương đầu">
            <span className="material-symbols-outlined" aria-hidden="true">first_page</span>
            <span className="hidden sm:inline" aria-hidden="true">Đọc từ đầu</span>
          </button>
        ) : null}
      </div>
      {!chapters.length ? <p className="text-body text-stone-500 text-center py-10">Truyện chưa có chương nào được xuất bản.</p> : (
        <div className="w-full overflow-x-auto">
          <table className="sc-chapter-table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="px-4 py-2.5">Chương</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Số chữ</th>
                <th className="px-4 py-2.5">Quyền đọc</th>
                <th className="px-4 py-2.5 text-right"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {chapters.map((chapter) => {
                const chapterPath = `${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`;
                return (
                  <tr key={chapter.chapterId} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4">
                      <Link to={chapterPath} className="py-1 font-medium text-stone-900 hover:text-primary-600 transition-colors line-clamp-1">
                        {formatChapterTitle(chapter.chapterNumber, chapter.title)}
                      </Link>
                    </td>
                    <td className="px-4 text-right text-stone-600 hidden sm:table-cell">{(chapter.wordCount ?? 0).toLocaleString('vi-VN')}</td>
                    <td className="px-4">
                      {chapter.isVip ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700">VIP • {chapter.priceCoins} xu</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-stone-100 text-stone-600">Miễn phí</span>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <Link to={chapterPath} className="sc-button sc-button-soft" data-testid={`read-chapter-${chapter.chapterId}`}>
                        Đọc
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

function formatInteractionError(error: unknown, conflictMessage: string) {
  if (error instanceof ApiClientError && error.status === 409) {
    return conflictMessage;
  }

  return getApiErrorMessage(error);
}
