import { NumberInput, Select, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';
import { AppSelect } from '../../shared/components/AppSelect';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { PageTitle } from '../../shared/components/PageTitle';
import {
  card,
  dangerButton,
  fallbackCover,
  primaryButton,
  secondaryButton,
  textButton,
  textInput
} from '../../shared/components/ui-classes';
import {
  addToLibrary,
  createComment,
  deleteComment,
  followAuthor,
  getHistoryForNovel,
  getReadingPreferences,
  getReaderChapter,
  getReaderNovel,
  likeNovel,
  listComments,
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
  updateComment,
  type ReadingPreferences,
  type ReaderChapter,
  type ReaderComment,
  type ReaderNovel
} from './reader-api';

type StoryStatusFilter = 'ONGOING' | 'COMPLETED' | 'HIATUS' | '';
type SortFilter = 'updatedAt' | 'views' | 'likes' | 'relevance';
type OrderFilter = 'desc' | 'asc';

const storyStatusOptions: Array<{ value: StoryStatusFilter; label: string }> = [
  { value: '', label: 'Mọi tình trạng' },
  { value: 'ONGOING', label: 'Đang ra' },
  { value: 'COMPLETED', label: 'Đã hoàn thành' },
  { value: 'HIATUS', label: 'Tạm ngưng' }
];

const sortOptions: Array<{ value: SortFilter; label: string }> = [
  { value: 'updatedAt', label: 'Mới cập nhật' },
  { value: 'views', label: 'Lượt đọc' },
  { value: 'likes', label: 'Lượt thích' },
  { value: 'relevance', label: 'Liên quan nhất' }
];

const orderOptions: Array<{ value: OrderFilter; label: string }> = [
  { value: 'desc', label: 'Giảm dần' },
  { value: 'asc', label: 'Tăng dần' }
];

const serialStatusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Đã hoàn thành',
  HIATUS: 'Tạm ngưng',
  PUBLISHED: 'Đã xuất bản'
};

const commentStatusLabels: Record<string, string> = {
  APPROVED: 'Đã duyệt',
  PENDING: 'Chờ duyệt',
  PENDING_MODERATION: 'Chờ duyệt',
  REJECTED: 'Bị từ chối',
  HIDDEN: 'Đã ẩn'
};

// ─── Reader home ────────────────────────────────────────────────────────────

export function ReaderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StoryStatusFilter>('');
  const [sortFilter, setSortFilter] = useState<SortFilter>('updatedAt');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('desc');
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

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle title="Khám phá truyện" description="Tìm truyện đã xuất bản, xem chi tiết hoặc đọc tiếp nơi bạn dừng lại." />

      <div className={`${card} p-3.5 flex flex-col gap-2.5`}>
        <div className="flex flex-col md:flex-row gap-2.5">
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Tìm theo tên truyện, giới thiệu, thể loại..."
            testId="reader-search-input"
          />
          <input
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.currentTarget.value)}
            className={`${textInput} md:max-w-[200px]`}
            placeholder="Thể loại (fantasy...)"
            aria-label="Thể loại"
          />
          <input
            value={tagFilter}
            onChange={(event) => setTagFilter(event.currentTarget.value)}
            className={`${textInput} md:max-w-[200px]`}
            placeholder="Thẻ (slow-burn...)"
            aria-label="Thẻ"
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <AppSelect value={statusFilter} options={storyStatusOptions} onChange={setStatusFilter} ariaLabel="Tình trạng truyện" icon="filter_list" />
          <AppSelect value={sortFilter} options={sortOptions} onChange={setSortFilter} ariaLabel="Sắp xếp" icon="sort" />
          <AppSelect value={orderFilter} options={orderOptions} onChange={setOrderFilter} ariaLabel="Thứ tự" icon="swap_vert" />
        </div>
      </div>

      {novelsQuery.isLoading ? <LoadingState label="Đang tải danh sách truyện..." /> : null}
      {novelsQuery.isError ? <ErrorState error={novelsQuery.error} onRetry={() => void novelsQuery.refetch()} /> : null}
      {!novelsQuery.isLoading && !novelsQuery.isError && !novelsQuery.data?.length ? (
        <EmptyState title="Không tìm thấy truyện" description="Không có truyện nào khớp với bộ lọc hiện tại." />
      ) : null}

      <NovelGrid>
        {(novelsQuery.data ?? []).map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} />
        ))}
      </NovelGrid>
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

  return (
    <PublicShell>
      <PageTitle
        title="Thư viện công khai"
        description="Đọc thử truyện đã xuất bản. Đăng nhập để lưu truyện, bình luận, mở khóa chương VIP hoặc báo cáo."
        actions={
          <>
            <Link to="/reader" className={secondaryButton}>
              Trang đọc của tôi
            </Link>
            <Link to="/login" className={primaryButton}>
              Đăng nhập
            </Link>
          </>
        }
      />

      <div className={`${card} p-3.5 flex flex-col md:flex-row gap-2.5`}>
        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Tìm theo tên truyện, giới thiệu..." />
        <input
          value={genreFilter}
          onChange={(event) => setGenreFilter(event.currentTarget.value)}
          className={`${textInput} md:max-w-[200px]`}
          placeholder="Thể loại"
          aria-label="Thể loại"
        />
        <input
          value={tagFilter}
          onChange={(event) => setTagFilter(event.currentTarget.value)}
          className={`${textInput} md:max-w-[200px]`}
          placeholder="Thẻ"
          aria-label="Thẻ"
        />
      </div>

      {novelsQuery.isLoading ? <LoadingState label="Đang tải truyện công khai..." /> : null}
      {novelsQuery.isError ? <ErrorState error={novelsQuery.error} onRetry={() => void novelsQuery.refetch()} /> : null}
      {!novelsQuery.isLoading && !novelsQuery.isError && !novelsQuery.data?.length ? (
        <EmptyState title="Không tìm thấy truyện" description="Không có truyện công khai nào khớp với tìm kiếm." />
      ) : null}

      <NovelGrid>
        {(novelsQuery.data ?? []).map((novel) => (
          <NovelCard key={novel.novelId} novel={novel} publicMode />
        ))}
      </NovelGrid>
    </PublicShell>
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
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <Breadcrumb items={[{ label: 'Khám phá', to: '/reader' }, { label: novel?.title ?? 'Chi tiết truyện' }]} />

      <NovelHeaderCard
        novel={novel}
        chapterCount={novel?.chaptersCount ?? chapters.length}
        authorLink={novel?.authorId ? `/authors/${novel.authorId}` : undefined}
        notice={interactionNotice}
        primaryAction={
          continueChapterId ? (
            <button onClick={() => navigate(`/reader/chapters/${continueChapterId}`)} className={`${primaryButton} w-full`} type="button">
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              <span>{continueQuery.data ? `Đọc tiếp · Chương ${continueQuery.data.chapter.chapterNumber}` : 'Bắt đầu đọc'}</span>
            </button>
          ) : null
        }
        actions={
          <>
            <button
              onClick={() => addLibraryMutation.mutate()}
              disabled={addLibraryMutation.isPending}
              className={secondaryButton}
              type="button"
              data-testid="reader-add-library-btn"
            >
              <span className="material-symbols-outlined text-[16px] text-primary-600">bookmark_add</span>
              <span>Thêm vào thư viện</span>
            </button>
            <ButtonPair>
              <button
                onClick={() => likeMutation.mutate()}
                disabled={likeMutation.isPending}
                className={pairButton}
                type="button"
                data-testid="reader-like-btn"
              >
                <span className="material-symbols-outlined text-[16px] text-rose-500">favorite</span>
                <span>Thích</span>
              </button>
              <button
                onClick={() => unlikeMutation.mutate()}
                disabled={unlikeMutation.isPending}
                className={pairButton}
                type="button"
                data-testid="reader-unlike-btn"
              >
                Bỏ thích
              </button>
            </ButtonPair>
            <ButtonPair>
              <button
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending || !novel?.authorId}
                className={pairButton}
                type="button"
                data-testid="reader-follow-btn"
              >
                <span className="material-symbols-outlined text-[16px] text-stone-400">person_add</span>
                <span>Theo dõi</span>
              </button>
              <button
                onClick={() => unfollowMutation.mutate()}
                disabled={unfollowMutation.isPending || !novel?.authorId}
                className={pairButton}
                type="button"
                data-testid="reader-unfollow-btn"
              >
                Bỏ theo dõi
              </button>
            </ButtonPair>
            <button onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending} className={dangerButton} type="button">
              <span className="material-symbols-outlined text-[16px]">flag</span>
              <span>Báo cáo</span>
            </button>
          </>
        }
      />

      <ChapterListCard
        chapters={chapters}
        onReadFirst={chapters.length ? () => navigate(`/reader/chapters/${chapters[0].chapterId}`) : undefined}
        readFirstLabel="Đọc từ đầu"
      />
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
    <PublicShell>
      {novelQuery.isLoading ? <LoadingState label="Đang tải thông tin truyện..." /> : null}
      {novelQuery.isError ? <ErrorState error={novelQuery.error} onRetry={() => void novelQuery.refetch()} /> : null}
      {novel ? (
        <>
          <Breadcrumb items={[{ label: 'Thư viện công khai', to: '/public' }, { label: novel.title }]} />
          <NovelHeaderCard
            novel={novel}
            chapterCount={novel.chaptersCount ?? chapters.length}
            notice="Thêm vào thư viện, thích, theo dõi, bình luận, báo cáo, lưu tiến độ và mở khóa chương VIP cần đăng nhập."
            primaryAction={
              chapters.length ? (
                <button
                  onClick={() => navigate(`/public/chapters/${chapters[0].chapterId}`)}
                  className={`${primaryButton} w-full`}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  <span>Đọc chương đầu</span>
                </button>
              ) : null
            }
            actions={
              <Link to="/login" className={secondaryButton}>
                <span className="material-symbols-outlined text-[16px] text-stone-400">login</span>
                <span>Đăng nhập để tương tác</span>
              </Link>
            }
          />
          <ChapterListCard chapters={chapters} publicMode />
        </>
      ) : null}
    </PublicShell>
  );
}

// ─── Chapter reading ────────────────────────────────────────────────────────

export function ReaderChapterPage() {
  const { chapterId = '' } = useParams();
  const queryClient = useQueryClient();
  const [commentContent, setCommentContent] = useState('');
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
  const commentsQuery = useQuery({
    queryKey: ['reader-comments', chapterId],
    queryFn: () => listComments(chapterId),
    enabled: Boolean(chapterId)
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
  const commentMutation = useMutation({
    mutationFn: () => createComment(chapterId, commentContent),
    onSuccess: async () => {
      setCommentContent('');
      await queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] });
    }
  });
  const deleteCommentMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] })
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
      <LockedChapterCard message={getApiErrorMessage(chapterQuery.error)}>
        <button onClick={() => unlockMutation.mutate()} disabled={unlockMutation.isPending} className={primaryButton} type="button">
          <span className="material-symbols-outlined text-[16px]">lock_open</span>
          <span>{unlockMutation.isPending ? 'Đang mở khóa...' : 'Mở khóa chương'}</span>
        </button>
        <Link to="/wallet" className={secondaryButton}>
          <span className="material-symbols-outlined text-[16px] text-stone-400">account_balance_wallet</span>
          <span>Đến ví xu</span>
        </Link>
        {unlockMutation.isError ? (
          <p className="w-full text-[12px] text-rose-600 mt-1">{getApiErrorMessage(unlockMutation.error)}</p>
        ) : null}
      </LockedChapterCard>
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

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <Breadcrumb
        items={[
          { label: 'Khám phá', to: '/reader' },
          { label: novel?.title ?? 'Truyện', to: chapter?.novelId ? novelPath : undefined },
          { label: chapter ? `Chương ${chapter.chapterNumber}` : 'Chương' }
        ]}
      />

      <ChapterHeaderCard
        chapter={chapter}
        actions={
          <>
            <button
              onClick={() => chapter?.novelId && syncHistoryMutation.mutate({ novelId: chapter.novelId, chapterId })}
              disabled={!chapter || syncHistoryMutation.isPending}
              className={secondaryButton}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px] text-stone-400">sync</span>
              <span>{syncHistoryMutation.isPending ? 'Đang lưu...' : 'Lưu tiến độ'}</span>
            </button>
            <button onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending} className={dangerButton} type="button">
              <span className="material-symbols-outlined text-[16px]">flag</span>
              <span>{reportMutation.isSuccess ? 'Đã báo cáo' : 'Báo cáo'}</span>
            </button>
          </>
        }
        navigation={
          <ChapterNavigation
            previousTo={previousChapter ? `/reader/chapters/${previousChapter.chapterId}` : undefined}
            nextTo={nextChapter ? `/reader/chapters/${nextChapter.chapterId}` : undefined}
            indexTo={chapter?.novelId ? novelPath : undefined}
          />
        }
      />

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary-600">tune</span>
            <h2 className="text-[14px] font-semibold text-stone-900">Tùy chỉnh đọc</h2>
          </div>
          <span className="text-[11px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full">
            {preferencesQuery.isLoading ? 'Đang tải' : 'Đã đồng bộ'}
          </span>
        </div>
        {preferences ? (
          <ReadingPreferencesPanel
            preferences={preferences}
            onSave={(next) => preferencesMutation.mutate(next)}
            saving={preferencesMutation.isPending}
          />
        ) : null}
      </div>

      <ChapterProse content={chapter?.content} style={buildReaderStyle(preferences)} />

      <ChapterNavigation
        previousTo={previousChapter ? `/reader/chapters/${previousChapter.chapterId}` : undefined}
        nextTo={nextChapter ? `/reader/chapters/${nextChapter.chapterId}` : undefined}
        indexTo={chapter?.novelId ? novelPath : undefined}
        centered
      />

      <div className={`${card} p-5`}>
        <SectionTitle icon="forum" title="Bình luận" count={commentsQuery.data?.length} />
        <Textarea
          placeholder="Chia sẻ cảm nhận của bạn về chương này..."
          aria-label="Thêm bình luận"
          value={commentContent}
          onChange={(event) => setCommentContent(event.currentTarget.value)}
          minRows={3}
          autosize
          mb="sm"
          data-testid="reader-comment-input"
        />
        <div className="flex justify-end mb-4">
          <button
            onClick={() => commentMutation.mutate()}
            disabled={!commentContent.trim() || commentMutation.isPending}
            className={primaryButton}
            type="button"
            data-testid="reader-comment-submit-btn"
          >
            <span className="material-symbols-outlined text-[16px]">send</span>
            <span>{commentMutation.isPending ? 'Đang gửi...' : 'Gửi bình luận'}</span>
          </button>
        </div>

        {commentsQuery.isLoading ? <LoadingState label="Đang tải bình luận..." /> : null}
        {commentsQuery.isError ? <ErrorState error={commentsQuery.error} onRetry={() => void commentsQuery.refetch()} /> : null}
        {!commentsQuery.isLoading && !commentsQuery.isError && !commentsQuery.data?.length ? (
          <p className="text-[13px] text-stone-400 text-center py-6">Chưa có bình luận nào được duyệt.</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {(commentsQuery.data ?? []).map((comment) => (
            <CommentCard
              key={comment.commentId}
              comment={comment}
              chapterId={chapterId}
              deleting={deleteCommentMutation.isPending}
              onDelete={() => deleteCommentMutation.mutate(comment.commentId)}
            />
          ))}
        </ul>
      </div>
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
  const commentsQuery = useQuery({
    queryKey: ['public-reader-comments', chapterId],
    queryFn: () => listComments(chapterId),
    enabled: Boolean(chapterId)
  });
  const isLockedVip = chapterQuery.error instanceof ApiClientError && chapterQuery.error.code === 'PAYMENT_002';
  const chapter = chapterQuery.data;
  const novelPath = `/public/novels/${chapter?.novelId ?? ''}`;

  return (
    <PublicShell>
      {chapterQuery.isLoading ? <LoadingState label="Đang tải chương..." /> : null}
      {isLockedVip ? (
        <LockedChapterCard message="Khách có thể xem thông tin truyện, nhưng cần đăng nhập để mở khóa chương VIP.">
          <Link to="/login" className={primaryButton}>
            <span className="material-symbols-outlined text-[16px]">login</span>
            <span>Đăng nhập để mở khóa</span>
          </Link>
          <Link to="/public" className={secondaryButton}>
            Thư viện công khai
          </Link>
        </LockedChapterCard>
      ) : null}
      {chapterQuery.isError && !isLockedVip ? (
        <ErrorState error={chapterQuery.error} onRetry={() => void chapterQuery.refetch()} />
      ) : null}

      {chapter ? (
        <>
          <Breadcrumb
            items={[
              { label: 'Thư viện công khai', to: '/public' },
              { label: 'Truyện', to: novelPath },
              { label: `Chương ${chapter.chapterNumber}` }
            ]}
          />
          <ChapterHeaderCard
            chapter={chapter}
            actions={
              <Link to="/login" className={primaryButton}>
                <span className="material-symbols-outlined text-[16px]">login</span>
                <span>Đăng nhập</span>
              </Link>
            }
            navigation={<ChapterNavigation indexTo={novelPath} />}
          />
          <ChapterProse content={chapter.content} style={buildReaderStyle()} />

          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon="forum" title="Bình luận" count={commentsQuery.data?.length} />
              <Link to="/login" className={`${secondaryButton} mb-3`}>
                Đăng nhập để bình luận
              </Link>
            </div>
            {commentsQuery.isLoading ? <LoadingState label="Đang tải bình luận..." /> : null}
            {commentsQuery.isError ? <ErrorState error={commentsQuery.error} onRetry={() => void commentsQuery.refetch()} /> : null}
            {!commentsQuery.isLoading && !commentsQuery.isError && !commentsQuery.data?.length ? (
              <p className="text-[13px] text-stone-400 text-center py-6">Chưa có bình luận nào được duyệt.</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {(commentsQuery.data ?? []).map((comment) => (
                <li key={comment.commentId} className="p-3.5 rounded-lg border border-stone-200 bg-white">
                  <CommentMeta comment={comment} />
                  <p className="text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </PublicShell>
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

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle title="Thư viện của tôi" description="Những truyện bạn đã lưu để đọc sau." />
      {libraryQuery.isLoading ? <LoadingState label="Đang tải thư viện..." /> : null}
      {libraryQuery.isError ? <ErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} /> : null}
      {!libraryQuery.isLoading && !libraryQuery.isError && !libraryQuery.data?.length ? (
        <EmptyState
          title="Thư viện đang trống"
          description="Bấm “Thêm vào thư viện” ở trang chi tiết truyện để lưu truyện tại đây."
          action={
            <Link to="/reader" className={primaryButton}>
              Khám phá truyện
            </Link>
          }
        />
      ) : null}
      <NovelGrid>
        {(libraryQuery.data ?? []).map((novel) => (
          <NovelCard
            key={novel.novelId}
            novel={novel}
            extraAction={
              <button
                onClick={() => removeMutation.mutate(novel.novelId)}
                disabled={removeMutation.isPending}
                className={dangerButton}
                type="button"
                data-testid={`reader-remove-library-${novel.novelId}`}
              >
                <span className="material-symbols-outlined text-[16px]">bookmark_remove</span>
                <span>Bỏ khỏi thư viện</span>
              </button>
            }
          />
        ))}
      </NovelGrid>
    </div>
  );
}

export function ReaderHistoryPage() {
  const historyQuery = useQuery({ queryKey: ['reader-history'], queryFn: listHistory });

  return (
    <div className="flex flex-col gap-4 font-body-md text-stone-800">
      <PageTitle title="Lịch sử đọc" description="Tiếp tục từ chương bạn đọc gần nhất." />
      {historyQuery.isLoading ? <LoadingState label="Đang tải lịch sử đọc..." /> : null}
      {historyQuery.isError ? <ErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /> : null}
      {!historyQuery.isLoading && !historyQuery.isError && !historyQuery.data?.length ? (
        <EmptyState title="Chưa có lịch sử đọc" description="Các chương bạn đọc sẽ xuất hiện tại đây." />
      ) : null}
      <ul className={`${card} divide-y divide-stone-100 overflow-hidden`}>
        {(historyQuery.data ?? []).map((item) => (
          <li key={item.novelId} className="flex items-center gap-4 px-4 py-3 hover:bg-[#f9f8f4]/60 transition-colors">
            <Link
              to={`/reader/novels/${item.novelId}`}
              className="w-11 aspect-[2/3] rounded-md overflow-hidden bg-stone-900 shrink-0 border border-stone-200"
            >
              <img alt={item.novel.title} className="w-full h-full object-cover" src={item.novel.coverImageUrl || fallbackCover} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to={`/reader/novels/${item.novelId}`}
                className="block text-[14px] font-semibold text-stone-900 hover:text-primary-700 truncate transition-colors"
              >
                {item.novel.title}
              </Link>
              <p className="text-[13px] text-stone-600 truncate">
                Đang đọc: {formatChapterTitle(item.chapter.chapterNumber, item.chapter.title)}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Lần cuối: {new Date(item.readAt).toLocaleString('vi-VN')}</p>
            </div>
            <Link
              to={`/reader/chapters/${item.chapterId}`}
              className={primaryButton}
              data-testid={`reader-history-continue-${item.chapterId}`}
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              <span>Đọc tiếp</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

const pairButton =
  'inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 font-label-md text-label-md font-medium transition-colors cursor-pointer disabled:text-stone-400 disabled:cursor-not-allowed';

function ButtonPair({ children }: { children: ReactNode }) {
  return <div className="inline-flex rounded-md border border-stone-200 divide-x divide-stone-200 overflow-hidden">{children}</div>;
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f6f2] font-body-md text-stone-800 antialiased">
      <header className="fixed top-0 w-full z-50 bg-[#faf9f6]/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-stone-200/80">
        <div className="h-14 max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          <Link to="/public" className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-600 text-[26px]">menu_book</span>
            <span className="font-headline-sm text-[17px] text-primary-600 tracking-tight font-bold">Ephurin</span>
            <span className="font-label-sm text-[11px] uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded font-semibold">
              Reading
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/public" className="hidden sm:inline-flex px-3 py-1.5 rounded-lg text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors">
              Thư viện công khai
            </Link>
            <Link to="/login" className={primaryButton}>
              Đăng nhập
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-20 pb-12 flex flex-col gap-4">{children}</main>
    </div>
  );
}

function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-stone-500 min-w-0" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5 min-w-0">
          {index > 0 ? <span className="text-stone-300">/</span> : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-primary-700 transition-colors truncate max-w-[220px]">
              {index === 0 ? <span className="material-symbols-outlined text-[14px] mr-0.5 align-[-2px]">arrow_back</span> : null}
              {item.label}
            </Link>
          ) : (
            <span className="text-stone-900 font-semibold truncate max-w-[280px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  testId
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId?: string;
}) {
  return (
    <div className="relative flex-1">
      <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-stone-400 pointer-events-none">search</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`${textInput} pl-8`}
        placeholder={placeholder}
        aria-label="Tìm truyện"
        type="text"
        data-testid={testId}
      />
    </div>
  );
}

function SectionTitle({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="material-symbols-outlined text-[18px] text-primary-600">{icon}</span>
      <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
      {count ? (
        <span className="text-[11px] bg-primary-50 text-primary-700 border border-primary-200/70 px-1.5 py-px rounded-full font-semibold">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function GenreChip({ children }: { children: ReactNode }) {
  return (
    <span className="font-label-sm text-[11px] uppercase tracking-wider text-primary-700 font-bold bg-primary-50 border border-primary-200/70 px-2 py-0.5 rounded">
      {children}
    </span>
  );
}

function NovelGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}

function NovelCard({ novel, extraAction, publicMode = false }: { novel: ReaderNovel; extraAction?: ReactNode; publicMode?: boolean }) {
  const detailPath = `${publicMode ? '/public' : '/reader'}/novels/${novel.novelId}`;
  const serialLabel = formatSerialStatus(novel.serialStatus ?? novel.status);

  return (
    <div className={`${card} p-4 hover:border-stone-300 transition-colors flex flex-col gap-3.5`}>
      <div className="flex gap-3.5 min-w-0">
        <Link to={detailPath} className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-stone-200">
          <img alt={novel.title} className="w-full h-full object-cover" src={novel.coverImageUrl || fallbackCover} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {novel.genre ? <GenreChip>{novel.genre}</GenreChip> : null}
            {serialLabel ? <span className="text-[12px] text-stone-500">{serialLabel}</span> : null}
          </div>
          <Link
            to={detailPath}
            className="block font-headline-sm text-[16px] leading-snug text-stone-900 hover:text-primary-700 font-semibold truncate transition-colors"
          >
            {novel.title}
          </Link>
          <p className="text-[12px] text-stone-500 truncate">{novel.authorName ? `Tác giả: ${novel.authorName}` : 'Truyện đã xuất bản'}</p>
          <p className="text-[13px] text-stone-600 leading-relaxed line-clamp-2 mt-1">{novel.synopsis || 'Chưa có lời giới thiệu.'}</p>
        </div>
      </div>

      <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap text-[12px] text-stone-500">
        <StatInline icon="library_books" value={novel.chaptersCount ?? 0} label="chương" />
        <StatInline icon="visibility" value={novel.viewsCount ?? 0} label="lượt đọc" />
        <StatInline icon="favorite" value={novel.likesCount ?? 0} label="lượt thích" />
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-stone-100 flex-wrap">
        <Link to={detailPath} className={primaryButton} data-testid={`novel-open-detail-${novel.novelId}`}>
          <span className="material-symbols-outlined text-[16px]">menu_book</span>
          <span>Xem chi tiết</span>
        </Link>
        {extraAction}
      </div>
    </div>
  );
}

function StatInline({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="material-symbols-outlined text-[15px] text-stone-400">{icon}</span>
      <span>
        <strong className="text-stone-800 font-semibold">{formatCount(value)}</strong> {label}
      </span>
    </span>
  );
}

function NovelHeaderCard({
  novel,
  chapterCount,
  authorLink,
  notice,
  primaryAction,
  actions
}: {
  novel: ReaderNovel | undefined;
  chapterCount: number;
  authorLink?: string;
  notice?: string | null;
  primaryAction?: ReactNode;
  actions?: ReactNode;
}) {
  const serialLabel = formatSerialStatus(novel?.serialStatus ?? novel?.status);

  return (
    <div className={`${card} p-5 lg:p-6`}>
      <div className="flex flex-col lg:flex-row items-start gap-5 lg:gap-7 justify-between">
        <div className="flex flex-col sm:flex-row items-start gap-5 flex-1 min-w-0">
          <div className="relative w-32 sm:w-36 aspect-[2/3] rounded-xl overflow-hidden shadow-xs bg-stone-900 shrink-0 border border-stone-200">
            <img alt={novel?.title ?? ''} className="w-full h-full object-cover" src={novel?.coverImageUrl || fallbackCover} />
            {serialLabel ? (
              <div className="absolute bottom-2 left-2 right-2">
                <span className="inline-flex items-center justify-center gap-1.5 w-full bg-emerald-600/90 text-white text-[11px] px-2 py-0.5 rounded-full font-medium shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                  <span>{serialLabel}</span>
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col min-w-0 flex-1 py-0.5">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {novel?.genre ? <GenreChip>{novel.genre}</GenreChip> : null}
              {novel?.authorName ? (
                <>
                  {novel.genre ? <span className="text-stone-300">•</span> : null}
                  <span className="text-[13px] text-stone-500">
                    Tác giả:{' '}
                    {authorLink ? (
                      <Link to={authorLink} className="text-stone-900 font-semibold hover:text-primary-700 transition-colors">
                        {novel.authorName}
                      </Link>
                    ) : (
                      <strong className="text-stone-900 font-semibold">{novel.authorName}</strong>
                    )}
                  </span>
                </>
              ) : null}
            </div>
            <h1 className="font-headline-sm text-[24px] leading-snug text-stone-900 font-bold tracking-tight mb-1.5">{novel?.title}</h1>
            <p className="text-[13px] text-stone-600 leading-relaxed line-clamp-3 max-w-2xl mb-2.5">{novel?.synopsis || 'Chưa có lời giới thiệu.'}</p>
            {novel?.tags?.length ? (
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {novel.tags.map((tag) => (
                  <span key={tag} className="text-[11px] text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            {notice ? (
              <div
                className="mb-3 flex items-start gap-2 text-[12px] text-primary-800 bg-primary-50 border border-primary-200/70 rounded-lg px-3 py-2"
                data-testid="reader-interaction-notice"
              >
                <span className="material-symbols-outlined text-[16px] text-primary-600">info</span>
                <span>{notice}</span>
              </div>
            ) : null}
            {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full lg:w-auto shrink-0">
          <div className="grid grid-cols-3 gap-2.5 min-w-full sm:min-w-[320px]">
            <StatCard label="Số chương" value={formatCount(chapterCount)} />
            <StatCard label="Lượt đọc" value={formatCount(novel?.viewsCount ?? 0)} accent />
            <StatCard label="Lượt thích" value={formatCount(novel?.likesCount ?? 0)} accent />
          </div>
          {primaryAction}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="py-2.5 px-3.5 rounded-xl bg-[#f9f8f4] border border-stone-200/80 text-center flex flex-col justify-center">
      <div className="text-stone-500 text-[11px] mb-0.5 whitespace-nowrap">{label}</div>
      <div className={`text-[20px] font-bold leading-tight ${accent ? 'text-primary-600' : 'text-stone-900'}`}>{value}</div>
    </div>
  );
}

function ChapterListCard({
  chapters,
  publicMode = false,
  onReadFirst,
  readFirstLabel
}: {
  chapters: ReaderChapter[];
  publicMode?: boolean;
  onReadFirst?: () => void;
  readFirstLabel?: string;
}) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200/80">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-stone-900">Danh sách chương</h2>
          <span className="text-[11px] bg-primary-50 text-primary-700 border border-primary-200/70 px-1.5 py-px rounded-full font-semibold">
            {chapters.length}
          </span>
        </div>
        {onReadFirst ? (
          <button onClick={onReadFirst} className={secondaryButton} type="button">
            <span className="material-symbols-outlined text-[16px] text-stone-400">first_page</span>
            <span>{readFirstLabel}</span>
          </button>
        ) : null}
      </div>
      {!chapters.length ? <p className="text-[13px] text-stone-400 text-center py-10">Truyện chưa có chương nào được xuất bản.</p> : null}
      <ul className="divide-y divide-stone-100">
        {chapters.map((chapter) => {
          const chapterPath = `${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`;
          return (
            <li key={chapter.chapterId} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f9f8f4]/60 transition-colors">
              <div className="min-w-0 flex-1">
                <Link to={chapterPath} className="block text-[13px] font-medium text-stone-900 hover:text-primary-700 truncate transition-colors">
                  {formatChapterTitle(chapter.chapterNumber, chapter.title)}
                </Link>
                <p className="text-[11px] text-stone-400 mt-0.5">{(chapter.wordCount ?? 0).toLocaleString('vi-VN')} chữ</p>
              </div>
              {chapter.isVip ? (
                <span className="text-[11px] font-medium text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                  VIP • {chapter.priceCoins} xu
                </span>
              ) : (
                <span className="text-[11px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full whitespace-nowrap">Miễn phí</span>
              )}
              <Link
                to={chapterPath}
                className="px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 border border-primary-200/70 text-[12px] hover:bg-primary-100 hover:border-primary-300 transition-colors font-medium"
                data-testid={`read-chapter-${chapter.chapterId}`}
              >
                Đọc
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChapterHeaderCard({
  chapter,
  actions,
  navigation
}: {
  chapter: ReaderChapter | undefined;
  actions?: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <div className={`${card} p-5 flex flex-col gap-4`}>
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {chapter?.isVip ? (
              <span className="text-[11px] font-medium text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full">
                VIP • {chapter.priceCoins} xu
              </span>
            ) : (
              <span className="text-[11px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">Miễn phí</span>
            )}
            {chapter?.wordCount ? (
              <span className="text-[12px] text-stone-500">{chapter.wordCount.toLocaleString('vi-VN')} chữ</span>
            ) : null}
          </div>
          <h1 className="font-headline-sm text-[22px] leading-snug text-stone-900 font-bold tracking-tight">
            {chapter ? formatChapterTitle(chapter.chapterNumber, chapter.title) : 'Chương'}
          </h1>
        </div>
        {actions ? <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div> : null}
      </div>
      {navigation}
    </div>
  );
}

function ChapterNavigation({
  previousTo,
  nextTo,
  indexTo,
  centered = false
}: {
  previousTo?: string;
  nextTo?: string;
  indexTo?: string;
  centered?: boolean;
}) {
  const disabledClass = `${secondaryButton} opacity-50 pointer-events-none`;
  return (
    <div className={`flex items-center gap-2 flex-wrap ${centered ? 'justify-center' : ''}`}>
      {previousTo ? (
        <Link to={previousTo} className={secondaryButton}>
          <span className="material-symbols-outlined text-[16px] text-stone-400">chevron_left</span>
          <span>Chương trước</span>
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <span className="material-symbols-outlined text-[16px] text-stone-400">chevron_left</span>
          <span>Chương trước</span>
        </span>
      )}
      {indexTo ? (
        <Link to={indexTo} className={secondaryButton}>
          <span className="material-symbols-outlined text-[16px] text-stone-400">format_list_bulleted</span>
          <span>Mục lục</span>
        </Link>
      ) : null}
      {nextTo ? (
        <Link to={nextTo} className={primaryButton}>
          <span>Chương sau</span>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <span>Chương sau</span>
          <span className="material-symbols-outlined text-[16px] text-stone-400">chevron_right</span>
        </span>
      )}
    </div>
  );
}

function ChapterProse({ content, style }: { content: string | null | undefined; style: CSSProperties }) {
  return (
    <article className="rounded-xl border border-stone-200/80 shadow-2xs px-6 sm:px-12 py-10" style={style}>
      <div className="max-w-[720px] mx-auto whitespace-pre-wrap">{content ?? 'Chương chưa có nội dung.'}</div>
    </article>
  );
}

function LockedChapterCard({ message, children }: { message: string; children: ReactNode }) {
  return (
    <div className={`${card} p-8 flex flex-col items-center text-center font-body-md`}>
      <span className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-3">
        <span className="material-symbols-outlined text-[24px]">lock</span>
      </span>
      <h1 className="text-[18px] font-bold text-stone-900">Chương VIP đang khóa</h1>
      <p className="text-[13px] text-stone-500 mt-1 max-w-md">{message}</p>
      <div className="flex items-center justify-center gap-2 flex-wrap mt-5">{children}</div>
    </div>
  );
}

function ReadingPreferencesPanel({
  preferences,
  onSave,
  saving
}: {
  preferences: ReadingPreferences;
  onSave: (preferences: ReadingPreferences) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <Select
        label="Phông chữ"
        size="xs"
        data={[
          { value: 'system-ui', label: 'Hệ thống' },
          { value: 'Georgia', label: 'Serif' },
          { value: 'Arial', label: 'Sans' }
        ]}
        value={draft.fontFamily ?? 'system-ui'}
        onChange={(value) => setDraft((current) => ({ ...current, fontFamily: value }))}
        data-testid="reader-pref-font-family"
      />
      <NumberInput
        label="Cỡ chữ"
        size="xs"
        min={10}
        max={40}
        value={draft.fontSize}
        onChange={(value) => setDraft((current) => ({ ...current, fontSize: Number(value) || current.fontSize }))}
        data-testid="reader-pref-font-size"
      />
      <Select
        label="Màu nền"
        size="xs"
        data={[
          { value: 'LIGHT', label: 'Sáng' },
          { value: 'DARK', label: 'Tối' },
          { value: 'SEPIA', label: 'Sepia' }
        ]}
        value={draft.background}
        onChange={(value) => setDraft((current) => ({ ...current, background: (value ?? 'LIGHT') as ReadingPreferences['background'] }))}
        data-testid="reader-pref-background"
      />
      <NumberInput
        label="Giãn dòng"
        size="xs"
        min={1}
        max={3}
        step={0.1}
        value={draft.lineHeight}
        onChange={(value) => setDraft((current) => ({ ...current, lineHeight: Number(value) || current.lineHeight }))}
        data-testid="reader-pref-line-height"
      />
      <button onClick={() => onSave(draft)} disabled={saving} className={primaryButton} type="button" data-testid="reader-save-preferences-btn">
        <span className="material-symbols-outlined text-[16px]">save</span>
        <span>{saving ? 'Đang lưu...' : 'Lưu tùy chỉnh'}</span>
      </button>
    </div>
  );
}

function CommentMeta({ comment }: { comment: ReaderComment }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11px] font-medium text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-px rounded-full">
        {commentStatusLabels[comment.status] ?? comment.status}
      </span>
      <time className="text-[11px] text-stone-400">{new Date(comment.createdAt).toLocaleString('vi-VN')}</time>
    </div>
  );
}

function CommentCard({
  comment,
  chapterId,
  deleting,
  onDelete
}: {
  comment: ReaderComment;
  chapterId: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const updateMutation = useMutation({
    mutationFn: () => updateComment({ commentId: comment.commentId, content }),
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['reader-comments', chapterId] });
    }
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      reportContent({
        targetType: 'COMMENT',
        targetId: comment.commentId,
        reason: 'Reader report',
        description: 'Reader reported this comment from the chapter comment list.'
      })
  });

  return (
    <li className="p-3.5 rounded-lg border border-stone-200 bg-white" data-testid={`reader-comment-card-${comment.commentId}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <CommentMeta comment={comment} />
          {isEditing ? (
            <Textarea
              value={content}
              onChange={(event) => setContent(event.currentTarget.value)}
              minRows={2}
              autosize
              data-testid={`reader-comment-edit-input-${comment.commentId}`}
            />
          ) : (
            <p className="text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isEditing ? (
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!content.trim() || updateMutation.isPending}
              className={`${textButton} text-primary-700 hover:bg-primary-50`}
              type="button"
              data-testid={`reader-comment-save-btn-${comment.commentId}`}
            >
              Lưu
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className={`${textButton} text-stone-600 hover:bg-stone-100`}
              type="button"
              data-testid={`reader-comment-edit-btn-${comment.commentId}`}
            >
              Sửa
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={deleting}
            className={`${textButton} text-rose-600 hover:bg-rose-50`}
            type="button"
            data-testid={`reader-comment-delete-btn-${comment.commentId}`}
          >
            Xóa
          </button>
          <button
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
            className={`${textButton} text-amber-700 hover:bg-amber-50`}
            type="button"
            data-testid={`reader-comment-report-btn-${comment.commentId}`}
          >
            Báo cáo
          </button>
        </div>
      </div>
      {updateMutation.isError ? (
        <p className="mt-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1.5">
          {getApiErrorMessage(updateMutation.error)}
        </p>
      ) : null}
      {reportMutation.isSuccess ? (
        <p
          className="mt-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5"
          data-testid={`reader-comment-report-alert-${comment.commentId}`}
        >
          Đã gửi báo cáo bình luận.
        </p>
      ) : null}
      {reportMutation.isError ? (
        <p className="mt-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1.5">
          {getApiErrorMessage(reportMutation.error)}
        </p>
      ) : null}
    </li>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildReaderStyle(preferences?: ReadingPreferences): CSSProperties {
  const palette =
    preferences?.background === 'DARK'
      ? { background: '#1c1917', color: '#e7e5e4' }
      : preferences?.background === 'SEPIA'
        ? { background: '#f4ecd8', color: '#5b4636' }
        : { background: '#fffdf9', color: '#292524' };

  return {
    ...palette,
    fontFamily: preferences?.fontFamily ?? 'system-ui',
    fontSize: preferences?.fontSize ?? 18,
    lineHeight: preferences?.lineHeight ?? 1.8
  };
}

function formatChapterTitle(chapterNumber: number, title: string) {
  const cleanTitle = title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return cleanTitle ? `Chương ${chapterNumber}: ${cleanTitle}` : `Chương ${chapterNumber}`;
}

function formatSerialStatus(status: string | undefined) {
  if (!status) return null;
  return serialStatusLabels[status] ?? status;
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString('vi-VN');
}

function formatInteractionError(error: unknown, conflictMessage: string) {
  if (error instanceof ApiClientError && error.status === 409) {
    return conflictMessage;
  }

  return getApiErrorMessage(error);
}
