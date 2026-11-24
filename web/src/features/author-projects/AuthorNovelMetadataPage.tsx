import { LoadedImage } from '../../shared/components/AuthorAdminMotion';
import { useWorkspacePreference, stringArray } from '../../shared/components/WorkspacePreferences';
import { ResponsiveFilters, SelectionToolbar, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { useToast } from '../../shared/components/ToastProvider';
import { ImageUpload } from '../../shared/components/ImageUpload';
import { ChapterActions, ChapterOrder, ChapterHistoryPanel } from './ChapterActions';
import { Pagination, TagsInput } from '@mantine/core';
import { AnimatedMenu as Menu } from '../../shared/components/AnimatedMenu';
import { chapterSortOptions, sortChapters, type ChapterSort } from './chapter-sorting';
import { getNovelStatistics } from '../novels/novel-statistics-api';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import NumberFlow from '@number-flow/react';
import { Breadcrumbs } from '../../shared/components/Breadcrumbs';
import { useStoryCraftAutoAnimate } from '../../shared/hooks/useStoryCraftAutoAnimate';
import { authorHomeCrumb, navigationLabels } from '../../shared/components/navigation';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import React, { useState, useMemo, useEffect, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import {
  getNovel,
  getNovelEarnings,
  listGenres,
  listChapters,
  updateNovel,
  submitNovelPublish,
  createChapter,
  CHAPTER_TITLE_MAX,
  NOVEL_SYNOPSIS_MIN,
  NOVEL_TITLE_MAX
} from '../novels/novel-api';
import type { Chapter, ChapterStatus, PublicationReview } from '../novels/novel-types';
import { chapterPublicationDecision, publicationDecisionLabel } from '../novels/publication-review';

type AgeRating = 'EVERYONE' | 'TEEN' | 'MATURE';
// UAT 2026-11-21 (BUG-010): the server only reorders a manuscript with nothing released
// (CHAPTER_ORDER_CANONICAL), so the button says so up front instead of failing on save.
const ORDER_LOCKED_HINT = 'Chỉ sắp xếp được khi truyện chưa có chương nào phát hành hoặc đang chờ duyệt.';

export function AuthorNovelMetadataPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // Queries
  const novelQuery = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => getNovel(novelId),
    refetchInterval: query => query.state.data?.status === 'PENDING_MODERATION' ? 10000 : false,
    enabled: Boolean(novelId)
  });
  const [, setRecentProjects] = useWorkspacePreference<string[]>('recent-projects', [], stringArray);
  useEffect(() => {
    if (novelQuery.data?.novelId && user?.userId) setRecentProjects(old => [novelId, ...old.filter(id => id !== novelId)].slice(0, 8));
  }, [novelQuery.data?.novelId, user?.userId]);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', novelId],
    queryFn: () => listChapters(novelId),
    refetchInterval: query => query.state.data?.some(chapter =>
      chapter.status === 'PENDING_MODERATION' || chapter.pendingPublicationRevision ||
      chapter.publicationSchedule?.status === 'PENDING') ? 10000 : false,
    enabled: Boolean(novelId)
  });
  const earningsQuery = useQuery({
    queryKey: ['novel-earnings', novelId],
    queryFn: () => getNovelEarnings(novelId),
    enabled: Boolean(novelId)
  });

  const statisticsQuery = useQuery({
    queryKey: ['novel-statistics', novelId, user?.userId ?? 'guest'],
    queryFn: () => getNovelStatistics(novelId),
    enabled: Boolean(novelId)
  });

  const genresQuery = useQuery({ queryKey: ['novel-genres'], queryFn: listGenres });

  // State: Modals
  const [orderOpen, setOrderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [synopsisInput, setSynopsisInput] = useState('');
  const [coverInput, setCoverInput] = useState('');
  const [authorNoteInput, setAuthorNoteInput] = useState('');
  // UAT 2026-11-20 (BUG-003): the edit dialog had no age rating field.
  const [ageRatingInput, setAgeRatingInput] = useState<AgeRating>('TEEN');
  const [genresInput, setGenresInput] = useState<string[]>([]);

  const [newChapterModalOpen, setNewChapterModalOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterVip, setNewChapterVip] = useState(false);
  const [newChapterPrice, setNewChapterPrice] = useState(15);

  // State: Tabs, Search & Filters
  const [activeTab, setActiveTab] = useState<'all' | 'monetization' | 'history'>('all');
  const [monetizationScope, setMonetizationScope] = useState<'auto' | 'vip' | 'all'>('auto');
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [authorNoteExpanded, setAuthorNoteExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [accessFilter, setAccessFilter] = useState<'ALL' | 'FREE' | 'VIP'>('ALL');
  const [chapterSort, setChapterSort] = useState<ChapterSort>('number-asc');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    setMonetizationScope('auto');
    setSynopsisExpanded(false);
    setAuthorNoteExpanded(false);
  }, [novelId]);

  // Feedback Toast

  const { showToast } = useToast();
  const chaptersBodyRef = useStoryCraftAutoAnimate<HTMLTableSectionElement>();
  const reduce = useReducedMotion();
  const tabsGroupId = useId();

  // Populate edit fields
  useEffect(() => {
    if (novelQuery.data && !editModalOpen) {
      setTitleInput(novelQuery.data.title || '');
      setSynopsisInput(novelQuery.data.synopsis || '');
      setCoverInput(novelQuery.data.coverImageUrl || '');
      setAuthorNoteInput(novelQuery.data.authorNote ?? '');
      setAgeRatingInput(novelQuery.data.ageRating ?? 'TEEN');
      setGenresInput(novelQuery.data.genres ?? (novelQuery.data.genre ? [novelQuery.data.genre] : []));
    }
  }, [novelQuery.data, editModalOpen]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: () =>
      updateNovel(novelId, {
        // Unchanged fields are left out so a legacy title or short synopsis does not block other edits.
        ...(titleInput !== (novelQuery.data?.title ?? '') ? { title: titleInput } : {}),
        ...(synopsisInput !== (novelQuery.data?.synopsis ?? '') ? { synopsis: synopsisInput } : {}),
        authorNote: authorNoteInput.trim() || null,
        genres: genresInput,
        coverImageUrl: coverInput.trim() || null,
        ...(ageRatingInput !== novelQuery.data?.ageRating ? { ageRating: ageRatingInput } : {})
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      setEditModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['novel-genres'] });
      await queryClient.invalidateQueries({ queryKey: ['author-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['reader-novel', novelId] });
      showToast('Đã lưu cập nhật thông tin tác phẩm thành công!');
    },
    onError: (err: any) => {
      showToast('Lỗi khi lưu: ' + (err?.message || 'Không thể lưu thông tin'));
    }
  });

  const submitPublishMutation = useMutation({
    mutationFn: () => submitNovelPublish(novelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['novel', novelId] });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      setEditModalOpen(false);
      showToast('Đã gửi tác phẩm cho admin duyệt xuất bản.');
    },
    onError: (error) => showToast('Lỗi gửi duyệt: ' + getApiErrorMessage(error))
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createChapter(novelId, {
        title: newChapterTitle.trim() || `Chương ${(chaptersQuery.data?.length ?? 0) + 1}`,
        content: '',
        isVip: newChapterVip,
        priceCoins: newChapterVip ? newChapterPrice : 0
      }),
    onSuccess: async (created: Chapter) => {
      await queryClient.invalidateQueries({ queryKey: ['chapters', novelId] });
      setNewChapterModalOpen(false);
      setNewChapterTitle('');
      showToast('Đã tạo chương mới! Đang chuyển đến Studio...');
      navigate(`/author/ide?novelId=${novelId}&chapterId=${created.chapterId}`);
    },
    onError: (err: any) => {
      showToast('Lỗi tạo chương: ' + (err?.message || 'Không thể tạo chương'));
    }
  });

  const chapters: Chapter[] = chaptersQuery.data ?? [];
  const orderLocked = chapters.some(chapter => chapter.content !== null || !['DRAFT', 'REJECTED'].includes(chapter.status));
  const updated = useUpdatedItems(chaptersQuery.data?.map(chapter => ({ id: chapter.chapterId, version: [chapter.updatedAt, chapter.draftVersion, chapter.status, chapter.title, chapter.chapterNumber, chapter.isVip, chapter.priceCoins].join('|') })), novelId);

  const vipChaptersCount = chapters.filter((c) => c.isVip).length;
  const scheduledChaptersCount = chapters.filter((c) =>
    ['PENDING', 'PENDING_MODERATION'].includes(c.publicationSchedule?.status ?? '')
  ).length;
  const freePublishedCount = chapters.filter((c) => c.status === 'PUBLISHED' && !c.isVip).length;
  const hasMonetizedOrScheduled = vipChaptersCount > 0 || scheduledChaptersCount > 0;
  const effectiveMonetizationOnly =
    monetizationScope === 'auto' ? hasMonetizedOrScheduled : monetizationScope === 'vip';

  // Filtered chapters
  const filteredChapters = useMemo(() => {
    return sortChapters(chapters.filter((ch) => {
      if (activeTab === 'monetization' && effectiveMonetizationOnly) {
        const isScheduled = ['PENDING', 'PENDING_MODERATION'].includes(ch.publicationSchedule?.status ?? '');
        if (!ch.isVip && !isScheduled) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ch.title.toLowerCase().includes(q);
        const matchNum = `chương ${ch.chapterNumber}`.toLowerCase().includes(q) || `${ch.chapterNumber}` === q;
        if (!matchTitle && !matchNum) return false;
      }

      if (statusFilter !== 'ALL' && ch.status !== statusFilter) return false;

      if (accessFilter === 'FREE' && ch.isVip) return false;
      if (accessFilter === 'VIP' && !ch.isVip) return false;

      return true;
    }), chapterSort);
  }, [chapters, activeTab, effectiveMonetizationOnly, searchQuery, statusFilter, accessFilter, chapterSort]);

  // Paginated chapters
  const totalPages = Math.ceil(filteredChapters.length / pageSize) || 1;
  useEffect(() => setCurrentPage(page => Math.min(page, totalPages)), [totalPages]);
  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredChapters.slice(start, start + pageSize);
  }, [filteredChapters, currentPage, pageSize]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedChapters(paginatedChapters.map((c) => c.chapterId));
    } else {
      setSelectedChapters([]);
    }
  };

  const handleSelectOne = (chapterId: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId]
    );
  };

  const openIde = (chapterId?: string) => {
    const params = new URLSearchParams({ novelId });
    if (chapterId) params.set('chapterId', chapterId);
    navigate(`/author/ide?${params.toString()}`);
  };

  const novel = novelQuery.data;
  const coverImage = novel?.coverImageUrl;

  const renderStatusBadge = (status: ChapterStatus, review?: PublicationReview | null) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <span className="material-symbols-outlined text-table">check_circle</span>
            <span>Đã xuất bản</span>
          </span>
        );
      case 'PENDING_MODERATION':
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-full">
            <span className="material-symbols-outlined text-table">schedule</span>
            <span>Chờ duyệt</span>
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full">
            <span className="material-symbols-outlined text-table">archive</span>
            <span>Đã lưu trữ</span>
          </span>
        );
      case 'REJECTED':
        if (review?.status === 'REVISION_REQUIRED') {
          return (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium"
              style={{ color: 'var(--sc-warning)', background: 'var(--sc-warning-bg)' }}>
              {publicationDecisionLabel(review)}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded-full">
            <span className="material-symbols-outlined text-table">cancel</span>
            <span>Từ chối</span>
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
            <span>Bản nháp</span>
          </span>
        );
    }
  };

  const renderChapterFeedback = (chapter: Chapter) => {
    const decision = chapterPublicationDecision(chapter);
    if (!decision || (chapter.status !== 'PUBLISHED' && !decision.reason)) return null;
    return (
      <div className="mx-auto mt-1 max-w-[14rem] break-words text-meta" style={{ color: 'var(--sc-text-muted)' }}>
        {chapter.status === 'PUBLISHED' && <p>Bản gửi mới: {decision.label}</p>}
        {decision.reason && <p>Lý do: {decision.reason}</p>}
      </div>
    );
  };

  const serialStatusLabel =
    novel?.serialStatus === 'COMPLETED'
      ? 'Đã hoàn thành'
      : novel?.serialStatus === 'HIATUS'
      ? 'Tạm ngưng'
      : 'Đang ra';

  const ageRatingLabel =
    novel?.ageRating === 'MATURE' ? '18+' : novel?.ageRating === 'TEEN' ? '16+' : 'Mọi lứa tuổi';

  if (novelQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-body font-medium text-stone-500">Đang tải thông tin tác phẩm...</p>
      </div>
    );
  }

  if (novelQuery.isError || !novel) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-rose-500 text-5xl mb-2">error</span>
        <h2 className="text-lg font-bold text-stone-900">Không tìm thấy tác phẩm</h2>
        <p className="text-body text-stone-500 mt-1 max-w-md">
          Có thể tác phẩm không tồn tại hoặc bạn không có quyền tác giả đối với dự án này.
        </p>
        <Link
          to={authorHomeCrumb.to}
          className="mt-4 px-4 py-2 rounded-lg bg-primary-600 text-white text-meta font-semibold hover:bg-primary-700 transition-colors"
        >
          Quay lại {navigationLabels.authorHome}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-body-md text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900 flex flex-col">
      {/* ──────────────────────────────────────────
          BEGIN: Fixed Top Header Navigation Bar (Preserved Layout & Texts, IDE Color & Compact Scale)
         ────────────────────────────────────────── */}
      <AuthorNavbar />

      {/* ──────────────────────────────────────────
          BEGIN: Main Content Workstation
         ────────────────────────────────────────── */}
      <main className="w-full pt-0 bg-surface flex-1">
        <div className="flex flex-col w-full pb-14">
          {/* Top Breadcrumb & Quick Action Bar (Compact Scale) */}
          <div className="w-full bg-surface-container-lowest border-b border-stone-200/80 shadow-2xs">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-1.5 flex items-center justify-between gap-3">
              <Breadcrumbs items={[authorHomeCrumb, { label: novel.title }]} />
              <div className="flex items-center gap-1.5 shrink-0">
                <Link to={`/author/novels/${novelId}/comments`} className="sc-button sc-button-soft" title="Bình luận độc giả"><span className="material-symbols-outlined" aria-hidden="true">forum</span><span className="hidden sm:inline">Bình luận</span></Link>
                <Link
                  to={`/public/novels/${novelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 hover:bg-stone-200/80 text-stone-600 hover:text-stone-900 border border-stone-200/80 text-meta font-medium transition-colors"
                  title="Xem trang độc giả"
                >
                  <span className="material-symbols-outlined text-body text-stone-500">open_in_new</span>
                  <span className="hidden sm:inline">Xem trang độc giả</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Main Workstation Layout */}
          <div className="max-w-7xl mx-auto px-4 lg:px-8 w-full mt-4 flex flex-col gap-4">
            <section className="sc-novel-overview" aria-label="Thông tin tác phẩm">
              <div className="sc-novel-identity">
                <button type="button" className="sc-novel-cover sc-cover-hover" onClick={() => setEditModalOpen(true)} aria-label="Đổi ảnh bìa" title="Đổi ảnh bìa">
                  {coverImage ? <LoadedImage src={coverImage} alt={novel.title} /> : <span>{novel.title}</span>}
                </button>
                <div className="sc-novel-description">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`sc-novel-status ${novel.status === 'PUBLISHED' ? 'sc-novel-status-public' : ''}`}>{novel.status === 'PUBLISHED' ? serialStatusLabel : novel.status === 'PENDING_MODERATION' ? 'Chờ duyệt' : novel.status === 'REJECTED' ? (publicationDecisionLabel(novel.publicationReview) ?? 'Từ chối') : 'Bản nháp'}</span>
                    <span className="text-meta text-stone-500">{ageRatingLabel}</span>
                  </div>
                  {novel.status === 'REJECTED' && publicationDecisionLabel(novel.publicationReview) && novel.publicationReview?.reason && (
                    <p className="mb-2 break-words text-meta" style={{ color: 'var(--sc-text-muted)' }}>Lý do: {novel.publicationReview.reason}</p>
                  )}
                  <h1 className="text-page-title text-stone-900 mb-2">{novel.title}</h1>
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-body">
                    <span className="text-stone-500">Thể loại:</span>
                    {(novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : []).map(genre => <span key={genre} className="sc-genre-tag">{genre}</span>)}
                    {!novel.genres?.length && !novel.genre && <span className="text-stone-500">Chưa phân loại</span>}
                  </div>
                  <p className="text-meta text-stone-500 mb-2">
                    Tác giả: <Link className="text-stone-800 font-medium hover:underline" to={`/authors/${novel.authorId}`}>{user?.displayName || user?.username || 'Tác giả'}</Link>
                    {' · '}Cập nhật {new Date(novel.updatedAt).toLocaleString('vi-VN')}
                  </p>
                  <p className="sc-novel-synopsis text-body text-stone-600">
                    {novel.synopsis && novel.synopsis.length > 260 && !synopsisExpanded
                      ? `${novel.synopsis.slice(0, 260).trimEnd()}…`
                      : novel.synopsis}
                  </p>
                  {Boolean(novel.synopsis && novel.synopsis.length > 260) && (
                    <button
                      type="button"
                      aria-expanded={synopsisExpanded}
                      onClick={() => setSynopsisExpanded((prev) => !prev)}
                      className="mt-1 text-meta font-semibold text-primary-600 hover:underline cursor-pointer"
                    >
                      {synopsisExpanded ? 'Thu gọn' : 'Xem thêm'}
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button type="button" onClick={() => setEditModalOpen(true)} className="sc-button sc-button-soft"><span className="material-symbols-outlined" aria-hidden="true">edit</span>Chỉnh sửa thông tin</button>
                    <Link className="sc-button sc-button-soft" to={`/author/context/${novelId}`}><span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>Cẩm nang</Link>
                    <button
                      type="button"
                      onClick={() => submitPublishMutation.mutate()}
                      disabled={submitPublishMutation.isPending || novel.status === 'PUBLISHED' || novel.status === 'PENDING_MODERATION'}
                      className="sc-button sc-button-primary disabled:opacity-40"
                      data-testid="submit-publish-btn"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">publish</span>
                      {submitPublishMutation.isPending ? 'Đang gửi...' : 'Gửi duyệt'}
                    </button>
                  </div>
                </div>
              </div>
              <dl className="sc-novel-metrics">
                <div><dt>Tổng chương</dt><dd>{chaptersQuery.isPending ? '…' : chaptersQuery.isError ? '—' : <NumberFlow value={chapters.length} locales="vi-VN" animated={!reduce} />}</dd></div>
                <div><dt>Lượt đọc</dt><dd><NumberFlow value={novel.viewsCount} locales="vi-VN" animated={!reduce} /></dd></div>
                <div><dt>Doanh thu</dt><dd>{earningsQuery.isPending ? '…' : earningsQuery.isError ? '—' : <NumberFlow value={earningsQuery.data.unlockCoins} locales="vi-VN" animated={!reduce} />} <span className="text-meta font-normal">Xu</span></dd></div>
                <div><dt>Đánh giá</dt><dd><Link className="sc-rating-metric" to={`/author/novels/${novelId}/reviews`} title="Xem đánh giá độc giả" aria-label="Xem đánh giá độc giả">{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : statisticsQuery.data.ratingAverage === null ? 'Chưa có' : statisticsQuery.data.ratingAverage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link></dd></div>
                <div><dt>Theo dõi</dt><dd>{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : <NumberFlow value={statisticsQuery.data.followersCount} locales="vi-VN" animated={!reduce} />}</dd></div>
                <div><dt>Tổng số từ</dt><dd>{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : <NumberFlow value={statisticsQuery.data.totalWords} locales="vi-VN" animated={!reduce} />}</dd></div>
              </dl>
              {statisticsQuery.isError && <button type="button" onClick={() => void statisticsQuery.refetch()} className="text-meta text-red-700">Không tải được thống kê · Thử lại</button>}
              {earningsQuery.isError && <button type="button" onClick={() => void earningsQuery.refetch()} className="text-meta text-red-700">Không tải được doanh thu · Thử lại</button>}
              <div className="sc-author-note">
                <h2 className="text-section-title mb-2">Lời tác giả</h2>
                {novel.authorNote ? (
                  <>
                    <p className="text-body text-stone-600 whitespace-pre-wrap break-words">
                      {novel.authorNote.length > 220 && !authorNoteExpanded
                        ? `${novel.authorNote.slice(0, 220).trimEnd()}…`
                        : novel.authorNote}
                    </p>
                    {novel.authorNote.length > 220 && (
                      <button
                        type="button"
                        aria-expanded={authorNoteExpanded}
                        onClick={() => setAuthorNoteExpanded((prev) => !prev)}
                        className="mt-1 text-meta font-semibold text-primary-600 hover:underline cursor-pointer"
                      >
                        {authorNoteExpanded ? 'Thu gọn' : 'Xem thêm'}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" onClick={() => setEditModalOpen(true)} className="text-body text-stone-500 hover:text-stone-800">Thêm lời nhắn dành cho độc giả</button>
                )}
              </div>
            </section>

            {/* Chapter Management Workstation Section */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-2xs border border-stone-200/80 overflow-hidden flex flex-col">
              {/* Clean Tabs Navigation */}
              <LayoutGroup id={tabsGroupId}>
                <div role="tablist" aria-label="Quản lý chương tác phẩm" className="flex items-center px-6 bg-surface-container-lowest border-b border-stone-200/80">
                  {([
                    ['all', 'Danh sách chương', chapters.length],
                    ['monetization', 'Phát hành & Thu phí', null],
                    ['history', 'Lịch sử bản thảo', null],
                  ] as const).map(([key, label, badge], index, list) => {
                    const active = activeTab === key;
                    return (
                      <button
                        key={key}
                        id={`${tabsGroupId}-tab-${key}`}
                        role="tab"
                        aria-selected={active}
                        aria-controls={`${tabsGroupId}-panel-${key}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => {
                          setActiveTab(key);
                          setCurrentPage(1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
                          e.preventDefault();
                          const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
                          const nextKey = list[nextIndex][0];
                          setActiveTab(nextKey);
                          setCurrentPage(1);
                          const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                          buttons?.[nextIndex]?.focus();
                        }}
                        className={`py-3 px-3.5 font-label-md text-label-md relative transition-colors flex items-center gap-2 cursor-pointer ${
                          active
                            ? 'text-primary-600 font-semibold'
                            : 'text-stone-500 hover:text-stone-900 font-medium'
                        }`}
                        type="button"
                      >
                        <span>{label}</span>
                        {badge !== null && (
                          <span className="font-label-sm text-meta bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">
                            {badge}
                          </span>
                        )}
                        {active && (
                          <motion.span
                            layoutId="novel-metadata-tab-indicator"
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-600"
                            transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>

              {orderOpen && <ChapterOrder novelId={novelId} chapters={chapters} onClose={() => setOrderOpen(false)} />}
              <div
                id={`${tabsGroupId}-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`${tabsGroupId}-tab-${activeTab}`}
                className="flex flex-col"
              >
              {activeTab === 'history' ? <ChapterHistoryPanel chapters={chapters} /> : <>
              {activeTab === 'monetization' && (
                <div className="px-4 py-2.5 bg-surface-subtle border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-meta">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-stone-700">
                    <span><strong className="text-stone-900 font-semibold">{vipChaptersCount}</strong> chương VIP</span>
                    <span aria-hidden="true" className="text-stone-300">·</span>
                    <span><strong className="text-stone-900 font-semibold">{scheduledChaptersCount}</strong> hẹn giờ đăng</span>
                    <span aria-hidden="true" className="text-stone-300">·</span>
                    <span><strong className="text-stone-900 font-semibold">{freePublishedCount}</strong> miễn phí đã xuất bản</span>
                    {!hasMonetizedOrScheduled && (
                      <span className="text-stone-500">· Chưa có chương VIP hoặc lịch hẹn giờ; dùng menu thao tác từng chương để thiết lập.</span>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-surface-container-lowest p-0.5" role="group" aria-label="Phạm vi hiển thị phát hành và thu phí">
                    <button
                      type="button"
                      aria-pressed={effectiveMonetizationOnly}
                      onClick={() => {
                        setMonetizationScope('vip');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-md text-meta font-medium transition-colors cursor-pointer ${
                        effectiveMonetizationOnly
                          ? 'bg-primary-600 text-on-primary font-semibold'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Chỉ hiện chương VIP & hẹn giờ
                    </button>
                    <button
                      type="button"
                      aria-pressed={!effectiveMonetizationOnly}
                      onClick={() => {
                        setMonetizationScope('all');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-md text-meta font-medium transition-colors cursor-pointer ${
                        !effectiveMonetizationOnly
                          ? 'bg-primary-600 text-on-primary font-semibold'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Hiện tất cả chương
                    </button>
                  </div>
                </div>
              )}
              {/* Streamlined Chapter Toolbar */}
              <div className="sc-chapter-toolbar" role="group" aria-label="Bộ lọc và thao tác chương">
                <ResponsiveFilters className="sc-chapter-filters">
                  {/* Search Box */}
                  <div className="relative sc-chapter-search">
                    <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-stone-400 pointer-events-none">
                      search
                    </span>
                    <input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-subtle text-stone-900 placeholder:text-stone-400 font-body-md text-meta focus:outline-none focus:ring-1 focus:ring-primary-500 border border-stone-200"
                      placeholder="Tìm kiếm số chương, tên chương..."
                      aria-label="Tìm kiếm chương"
                      type="text"
                    />
                  </div>

                  {/* Status Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Trạng thái chương"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-surface-subtle text-stone-800 font-label-md text-meta py-1.5 pl-3 pr-7 rounded-lg focus:outline-none cursor-pointer border border-stone-200 hover:border-stone-300 transition-colors"
                    >
                      <option value="ALL">Trạng thái ({chapters.length})</option>
                      <option value="PUBLISHED">
                        Đã xuất bản ({chapters.filter((c) => c.status === 'PUBLISHED').length})
                      </option>
                      <option value="DRAFT">
                        Bản nháp ({chapters.filter((c) => c.status === 'DRAFT').length})
                      </option>
                      <option value="PENDING_MODERATION">
                        Chờ duyệt ({chapters.filter((c) => c.status === 'PENDING_MODERATION').length})
                      </option>
                      <option value="ARCHIVED">
                        Đã lưu trữ ({chapters.filter((c) => c.status === 'ARCHIVED').length})
                      </option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-2 text-[16px] text-stone-400">
                      expand_more
                    </span>
                  </div>

                  {/* Access Dropdown */}
                  <div className="relative">
                    <select
                      aria-label="Quyền đọc chương"
                      value={accessFilter}
                      onChange={(e) => {
                        setAccessFilter(e.target.value as any);
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-surface-subtle text-stone-800 font-label-md text-meta py-1.5 pl-3 pr-7 rounded-lg focus:outline-none cursor-pointer border border-stone-200 hover:border-stone-300 transition-colors"
                    >
                      <option value="ALL">Quyền đọc</option>
                      <option value="FREE">Miễn phí</option>
                      <option value="VIP">VIP</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-2 text-[16px] text-stone-400">
                      expand_more
                    </span>
                  </div>
                </ResponsiveFilters>

                {/* Right Toolbar Actions */}
                <div className="sc-chapter-toolbar-actions">
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <button type="button" className="sc-button" aria-label="Sắp xếp hiển thị chương" title={chapterSortOptions.find(option => option.value === chapterSort)?.label}>
                        <span className="material-symbols-outlined" aria-hidden="true">sort</span>
                        <span>Hiển thị</span>
                      </button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Thứ tự hiển thị</Menu.Label>
                      {chapterSortOptions.map(option => (
                        <Menu.Item key={option.value}
                          leftSection={chapterSort === option.value ? <span className="material-symbols-outlined" aria-hidden="true">check</span> : undefined}
                          onClick={() => { setChapterSort(option.value); setCurrentPage(1); }}>
                          {option.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                  <button type="button" className="sc-button" onClick={() => setOrderOpen(true)} disabled={!chapters.length || orderLocked}
                    data-testid="chapter-order-open" title={orderLocked ? ORDER_LOCKED_HINT : undefined} aria-describedby={orderLocked ? 'chapter-order-locked' : undefined}>Sắp xếp chương</button>
                  {orderLocked && <span id="chapter-order-locked" className="sr-only">{ORDER_LOCKED_HINT}</span>}
                  <Link
                    to={`/author/import/${novelId}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200/80 text-stone-700 border border-stone-200/70 font-label-md text-meta transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px] text-stone-500">file_upload</span>
                    <span>Nhập bản thảo</span>
                  </Link>
                  <button
                    onClick={() => setNewChapterModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-600 text-white font-label-md text-meta hover:bg-primary-700 shadow-2xs transition-all font-semibold cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    <span>Thêm chương</span>
                  </button>
                </div>
              </div>


              <SelectionToolbar count={chapters.filter(chapter => selectedChapters.includes(chapter.chapterId)).length} onClear={() => setSelectedChapters([])}>
                <button type="button" className="sc-button sc-button-ghost" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(chapters.filter(chapter => selectedChapters.includes(chapter.chapterId)).map(chapter => `${chapter.chapterNumber}. ${chapter.title}`).join('\n'));
                    showToast('Đã sao chép danh sách chương', 'success');
                  } catch { showToast('Không sao chép được danh sách chương', 'error'); }
                }}>Sao chép danh sách</button>
              </SelectionToolbar>
              {/* Decluttered 8-Column Chapter Table */}
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[950px] sc-chapter-table">
                  <thead>
                    <tr className="bg-surface-subtle text-stone-500 font-label-sm text-meta border-b border-stone-200">
                      <th className="py-2.5 px-3.5 w-10 text-center">
                        <input
                          aria-label="Chọn tất cả chương trên trang này"
                          checked={
                            paginatedChapters.length > 0 &&
                            paginatedChapters.every((c) => selectedChapters.includes(c.chapterId))
                          }
                          onChange={handleSelectAll}
                          className="rounded accent-primary-600 w-3.5 h-3.5 cursor-pointer"
                          type="checkbox"
                        />
                      </th>
                      <th className="py-2.5 px-3.5 font-semibold min-w-[260px]">Chương / Tiêu đề</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Số từ</th>
                      <th className="py-2.5 px-3.5 font-semibold text-center">Quyền đọc</th>
                      <th className="py-2.5 px-3.5 font-semibold text-center">Trạng thái</th>
                      <th className="py-2.5 px-3.5 font-semibold">Cập nhật lần cuối</th>
                      <th className="py-2.5 px-3.5 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody ref={chaptersBodyRef} className="divide-y divide-stone-100 font-body-md text-meta">
                    {paginatedChapters.map((chapter) => (
                      <tr
                        key={chapter.chapterId}
                        className={`${updated.has(chapter.chapterId) ? 'sc-item-updated' : ''} hover:bg-surface-subtle/60 transition-colors ${
                          chapter.status === 'ARCHIVED' ? 'opacity-65 bg-stone-50/50' : 'bg-surface-container-lowest'
                        }`}
                      >
                        <td className="py-3 px-3.5 text-center">
                          <input
                            aria-label={`Chọn chương ${chapter.chapterNumber}: ${chapter.title}`}
                            checked={selectedChapters.includes(chapter.chapterId)}
                            onChange={() => handleSelectOne(chapter.chapterId)}
                            className="rounded accent-primary-600 w-3.5 h-3.5 cursor-pointer"
                            type="checkbox"
                          />
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={chapter.status === 'ARCHIVED'}
                              onClick={() => openIde(chapter.chapterId)}
                              className="text-left font-medium text-stone-900 hover:text-primary-600 cursor-pointer transition-colors bg-transparent border-0 p-0 min-h-0 disabled:cursor-default disabled:hover:text-stone-900"
                            >
                              {/^(?:Chương|Chapter)\s+\d+/i.test(chapter.title) ? chapter.title : `Chương ${chapter.chapterNumber}: ${chapter.title}`}
                            </button>
                            {chapter.chapterNumber === chapters.length && (
                              <span className="text-meta font-semibold text-primary-700 bg-primary-50 border border-primary-200/70 px-1.5 py-0.5 rounded">
                                Mới nhất
                              </span>
                            )}
                          </div>
                          <div className="text-stone-400 text-meta mt-0.5">
                            {chapter.publicationSchedule?.status === 'PENDING' ? 'Gửi duyệt lúc ' + new Date(chapter.publicationSchedule.scheduledAt).toLocaleString('vi-VN') : chapter.publicationSchedule?.status === 'PENDING_MODERATION' ? 'Lịch đăng đang chờ duyệt' : chapter.pendingPublicationRevision ? 'Phiên bản mới đang chờ duyệt' : chapter.publicationSchedule?.error ?? (chapter.draft?.autosave && 'Đang soạn trong Studio')}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono text-stone-800">
                          {chapter.wordCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {chapter.isVip ? (
                            <span className="inline-flex items-center gap-1 text-meta font-medium text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full">
                              VIP • {chapter.priceCoins} Xu
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-meta text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                              Miễn phí
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {renderStatusBadge(chapter.status, chapter.publicationReview)}
                          {renderChapterFeedback(chapter)}
                        </td>
                        <td className="py-3 px-3.5 text-stone-500 text-meta">
                          {new Date(chapter.draft?.updatedAt ?? chapter.updatedAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => openIde(chapter.chapterId)}
                              disabled={chapter.status === 'ARCHIVED'}
                              className="px-2.5 py-1 rounded bg-primary-600 text-white font-label-sm text-meta hover:bg-primary-700 transition-colors font-medium cursor-pointer shadow-2xs"
                              type="button"
                            >
                              Mở Studio
                            </button>
                            <ChapterActions chapter={chapter} />

                          </div>
                        </td>
                      </tr>
                    ))}

                    {paginatedChapters.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-stone-400 italic">
                          Không tìm thấy chương truyện nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Clean Minimal Pagination Footer */}
              <div className="p-3.5 bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200/80">
                <span className="text-stone-500 font-label-sm text-meta">
                  Hiển thị{' '}
                  <strong className="text-stone-900 font-semibold">
                    {filteredChapters.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{' '}
                    {Math.min(currentPage * pageSize, filteredChapters.length)}
                  </strong>{' '}
                  trên tổng số <strong className="text-stone-900 font-semibold">{filteredChapters.length} chương</strong>
                </span>
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={setCurrentPage}
                  siblings={1}
                  boundaries={1}
                  size="sm"
                />
              </div>
              </>}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ──────────────────────────────────────────
          BEGIN: Modal Chỉnh Sửa Thông Tin Tác Phẩm
         ────────────────────────────────────────── */}
      <AnimatedModal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Chỉnh sửa thông tin tác phẩm"
        size="xl"
        centered
        className="sc-novel-edit-dialog"
      >
            {/* Form */}
            <div className="sc-novel-edit-fields text-body">
              <div>
                <label htmlFor="novel-edit-title" className="block font-semibold text-stone-800 mb-1">Tiêu đề tác phẩm</label>
                <input
                  id="novel-edit-title"
                  type="text"
                  value={titleInput}
                  maxLength={NOVEL_TITLE_MAX}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Nhập tên tiểu thuyết..."
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta"
                />
              </div>

              <div>
                <label htmlFor="novel-edit-cover-url" className="block font-semibold text-stone-800 mb-1">Ảnh bìa</label>
                <ImageUpload cropCover onUpload={setCoverInput} label="Tải ảnh bìa" />
                <div className="flex gap-2.5">
                  <input
                    id="novel-edit-cover-url"
                    type="text"
                    value={coverInput}
                    onChange={(e) => setCoverInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta"
                  />
                  {coverInput && (
                    <img
                      src={coverInput}
                      alt="Preview"
                      className="w-9 h-12 object-cover rounded shadow-2xs shrink-0 border border-stone-200"
                    />
                  )}
                </div>
              </div>

              <TagsInput className="sc-novel-edit-genres" label="Thể loại" description="Chọn hoặc nhập tối đa 5 thể loại." placeholder="Chọn hoặc nhập thể loại" data={genresQuery.data ?? []} value={genresInput} onChange={setGenresInput} maxTags={5} maxLength={100} clearable comboboxProps={{ withinPortal: false }} />
              <div>
                <label htmlFor="novel-age-rating" className="block font-semibold text-stone-800 mb-1">Độ tuổi</label>
                <select id="novel-age-rating" value={ageRatingInput} onChange={event => setAgeRatingInput(event.target.value as AgeRating)}
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 border border-stone-200 text-body">
                  <option value="EVERYONE">Mọi lứa tuổi</option>
                  <option value="TEEN">16+</option>
                  <option value="MATURE">18+</option>
                </select>
              </div>
              <div>
                <label htmlFor="novel-author-note" className="block font-semibold text-stone-800 mb-1">Lời tác giả</label>
                <textarea id="novel-author-note" rows={8} maxLength={5000} value={authorNoteInput} onChange={event => setAuthorNoteInput(event.target.value)} placeholder="Lời nhắn dành cho độc giả…" className="w-full px-3 py-2 rounded-lg bg-stone-50 border border-stone-200 text-body" />
                <p className="text-meta text-stone-500">Tối đa 5.000 ký tự.</p>
              </div>

              <div>
                <label htmlFor="novel-edit-synopsis" className="block font-semibold text-stone-800 mb-1">Lời giới thiệu (Synopsis)</label>
                <textarea
                  id="novel-edit-synopsis"
                  rows={4}
                  value={synopsisInput}
                  onChange={(e) => setSynopsisInput(e.target.value)}
                  placeholder="Tóm tắt nội dung hấp dẫn để thu hút độc giả..."
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta leading-relaxed"
                />
                <p className="text-meta text-stone-500">Tối thiểu {NOVEL_SYNOPSIS_MIN} ký tự · hiện có {synopsisInput.trim().length}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="sc-novel-edit-footer border-t border-stone-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-meta font-medium hover:bg-stone-100 transition-colors cursor-pointer"
                type="button"
              >
                Hủy
              </button>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !titleInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-primary-600 text-white text-meta font-semibold hover:bg-primary-700 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                type="button"
              >
                {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
      </AnimatedModal>

      {/* ──────────────────────────────────────────
          BEGIN: Modal Thêm Chương Mới
         ────────────────────────────────────────── */}
      <AnimatedModal
        opened={newChapterModalOpen}
        onClose={() => setNewChapterModalOpen(false)}
        title="Thêm chương mới"
        size="sm"
        centered
      >
            <div className="space-y-3 text-meta">
              <div>
                <label htmlFor="new-chapter-title" className="block font-semibold text-stone-700 mb-1">Tiêu đề chương</label>
                <input
                  id="new-chapter-title"
                  type="text"
                  value={newChapterTitle}
                  maxLength={CHAPTER_TITLE_MAX}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder={`Ví dụ: Chương ${chapters.length + 1}: Khởi đầu mới`}
                  className="w-full px-3 py-1.5 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                <label htmlFor="new-chapter-vip" className="cursor-pointer">
                  <span className="font-semibold text-stone-800 block text-meta">Chế độ chương VIP</span>
                  <span className="text-meta text-stone-500">Độc giả trả Xu để mở khóa</span>
                </label>
                <input
                  id="new-chapter-vip"
                  type="checkbox"
                  checked={newChapterVip}
                  onChange={(e) => setNewChapterVip(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary-600 rounded cursor-pointer"
                />
              </div>

              {newChapterVip && (
                <div>
                  <label htmlFor="new-chapter-price" className="block font-semibold text-stone-700 mb-1">Giá mở khóa (Xu)</label>
                  <input
                    id="new-chapter-price"
                    type="number"
                    min={1}
                    max={999}
                    value={newChapterPrice}
                    onChange={(e) => setNewChapterPrice(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-1.5 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta font-mono"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setNewChapterModalOpen(false)}
                className="px-3 py-1 rounded-lg border border-stone-200 text-stone-600 text-meta font-medium hover:bg-stone-100 transition-colors"
                type="button"
              >
                Hủy
              </button>
              <button
                onClick={() => createChapterMutation.mutate()}
                disabled={createChapterMutation.isPending}
                className="px-3.5 py-1 rounded-lg bg-primary-600 text-white text-meta font-semibold hover:bg-primary-700 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                type="button"
              >
                {createChapterMutation.isPending ? 'Đang tạo...' : 'Tạo & Viết ngay'}
              </button>
            </div>
      </AnimatedModal>

      {/* ──────────────────────────────────────────
          BEGIN: Toast Notification
         ────────────────────────────────────────── */}
    </div>
  );
}
