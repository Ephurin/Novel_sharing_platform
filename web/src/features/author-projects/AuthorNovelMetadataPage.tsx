import { ImageUpload } from '../../shared/components/ImageUpload';
import { ChapterActions, ChapterOrder, ChapterHistoryPanel } from './ChapterActions';
import { TagsInput } from '@mantine/core';
import { getNovelStatistics } from '../novels/novel-statistics-api';
import { AuthorDialog, AuthorNavbar } from '../../shared/components/AuthorTheme';
import React, { useState, useMemo, useEffect } from 'react';
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
  createChapter
} from '../novels/novel-api';
import type { Chapter, ChapterStatus } from '../novels/novel-types';

export function AuthorNovelMetadataPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  // Queries
  const novelQuery = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => getNovel(novelId),
    enabled: Boolean(novelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', novelId],
    queryFn: () => listChapters(novelId),
    refetchInterval: query => query.state.data?.some(ch => ['PENDING','PENDING_MODERATION'].includes(ch.publicationSchedule?.status ?? '')) ? 10000 : false,
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
  const [genresInput, setGenresInput] = useState<string[]>([]);

  const [newChapterModalOpen, setNewChapterModalOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterVip, setNewChapterVip] = useState(false);
  const [newChapterPrice, setNewChapterPrice] = useState(15);

  // State: Tabs, Search & Filters
  const [activeTab, setActiveTab] = useState<'all' | 'monetization' | 'history'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [accessFilter, setAccessFilter] = useState<'ALL' | 'FREE' | 'VIP'>('ALL');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Populate edit fields
  useEffect(() => {
    if (novelQuery.data && !editModalOpen) {
      setTitleInput(novelQuery.data.title || '');
      setSynopsisInput(novelQuery.data.synopsis || '');
      setCoverInput(novelQuery.data.coverImageUrl || '');
      setAuthorNoteInput(novelQuery.data.authorNote ?? '');
      setGenresInput(novelQuery.data.genres ?? (novelQuery.data.genre ? [novelQuery.data.genre] : []));
    }
  }, [novelQuery.data, editModalOpen]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: () =>
      updateNovel(novelId, {
        title: titleInput,
        synopsis: synopsisInput,
        authorNote: authorNoteInput.trim() || null,
        genres: genresInput,
        coverImageUrl: coverInput.trim() || null
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
      showToast('Đã gửi tác phẩm lên hàng đợi kiểm duyệt!');
    },
    onError: (err: any) => {
      showToast('Lỗi gửi duyệt: ' + (err?.message || 'Không thể gửi duyệt'));
    }
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

  // Filtered chapters
  const filteredChapters = useMemo(() => {
    return chapters.filter((ch) => {


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
    });
  }, [chapters, activeTab, searchQuery, statusFilter, accessFilter]);

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

  const vipChaptersCount = chapters.filter((c) => c.isVip).length;

  const renderStatusBadge = (status: ChapterStatus) => {
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
          to="/author"
          className="mt-4 px-4 py-2 rounded-lg bg-primary-600 text-white text-meta font-semibold hover:bg-primary-700 transition-colors"
        >
          Quay lại Bàn làm việc
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
              <div className="flex items-center gap-1.5 text-meta text-stone-500 min-w-0">
                <Link
                  to="/author"
                  className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium shrink-0 transition-colors py-0.5 px-1.5 rounded hover:bg-stone-100"
                >
                  <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                  <span>Bàn làm việc</span>
                </Link>
                <span className="text-stone-300">/</span>
                <Link to="/author" className="hover:text-stone-900 cursor-pointer truncate max-w-[120px] sm:max-w-none text-stone-500">
                  Tác phẩm của tôi
                </Link>
                <span className="text-stone-300">/</span>
                <span className="text-stone-900 font-semibold truncate max-w-[160px] sm:max-w-[280px] md:max-w-md">{novel.title}</span>
              </div>
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
                <button type="button" className="sc-novel-cover" onClick={() => setEditModalOpen(true)} aria-label="Đổi ảnh bìa" title="Đổi ảnh bìa">
                  {coverImage ? <img src={coverImage} alt={novel.title} /> : <span>{novel.title}</span>}
                </button>
                <div className="sc-novel-description">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`sc-novel-status ${novel.status === 'PUBLISHED' ? 'sc-novel-status-public' : ''}`}>{novel.status === 'PUBLISHED' ? serialStatusLabel : novel.status === 'PENDING_MODERATION' ? 'Chờ duyệt' : novel.status === 'REJECTED' ? 'Từ chối' : 'Bản nháp'}</span>
                    <span className="text-meta text-stone-500">{ageRatingLabel}</span>
                  </div>
                  <h1 className="text-page-title text-stone-900 mb-2">{novel.title}</h1>
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-body">
                    <span className="text-stone-500">Thể loại:</span>
                    {(novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : []).map(genre => <span key={genre} className="sc-genre-tag">{genre}</span>)}
                    {!novel.genres?.length && !novel.genre && <span className="text-stone-500">Chưa phân loại</span>}
                  </div>
                  <p className="text-body text-stone-500 mb-2">Tác giả: <Link className="text-stone-800 font-medium hover:underline" to={`/authors/${novel.authorId}`}>{user?.displayName || user?.username || 'Tác giả'}</Link></p>
                  <p className="sc-novel-synopsis text-body text-stone-600">{novel.synopsis}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button type="button" onClick={() => setEditModalOpen(true)} className="sc-button sc-button-soft"><span className="material-symbols-outlined" aria-hidden="true">edit</span>Chỉnh sửa thông tin</button>
                    <Link className="sc-button sc-button-soft" to={`/author/context/${novelId}`}><span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>Cẩm nang</Link>
                  </div>
                  <p className="text-meta text-stone-500 mt-2">Khởi tạo: {new Date(novel.createdAt).toLocaleDateString('vi-VN')} · Cập nhật: {new Date(novel.updatedAt).toLocaleString('vi-VN')}</p>
                </div>
              </div>
              <dl className="sc-novel-metrics">
                <div><dt>Tổng chương</dt><dd>{chaptersQuery.isPending ? '…' : chaptersQuery.isError ? '—' : chapters.length}</dd></div>
                <div><dt>Lượt đọc</dt><dd>{novel.viewsCount.toLocaleString('vi-VN')}</dd></div>
                <div><dt>Doanh thu</dt><dd>{earningsQuery.isPending ? '…' : earningsQuery.isError ? '—' : earningsQuery.data.unlockCoins.toLocaleString('vi-VN')} <span className="text-meta font-normal">Xu</span></dd></div>
                <div><dt>Đánh giá</dt><dd><Link className="sc-rating-metric" to={`/author/novels/${novelId}/reviews`} title="Xem đánh giá độc giả" aria-label="Xem đánh giá độc giả">{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : statisticsQuery.data.ratingAverage === null ? 'Chưa có' : statisticsQuery.data.ratingAverage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link></dd></div>
                <div><dt>Theo dõi</dt><dd>{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : statisticsQuery.data.followersCount.toLocaleString('vi-VN')}</dd></div>
                <div><dt>Tổng số từ</dt><dd>{statisticsQuery.isPending ? '…' : statisticsQuery.isError ? '—' : statisticsQuery.data.totalWords.toLocaleString('vi-VN')}</dd></div>
              </dl>
              {statisticsQuery.isError && <button type="button" onClick={() => void statisticsQuery.refetch()} className="text-meta text-red-700">Không tải được thống kê · Thử lại</button>}
              {earningsQuery.isError && <button type="button" onClick={() => void earningsQuery.refetch()} className="text-meta text-red-700">Không tải được doanh thu · Thử lại</button>}
              <div className="sc-author-note">
                <h2 className="text-section-title mb-2">Lời tác giả</h2>
                {novel.authorNote ? <p className="text-body text-stone-600 whitespace-pre-wrap break-words">{novel.authorNote}</p> : <button type="button" onClick={() => setEditModalOpen(true)} className="text-body text-stone-500 hover:text-stone-800">Thêm lời nhắn dành cho độc giả</button>}
              </div>
            </section>

            {/* Chapter Management Workstation Section */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-2xs border border-stone-200/80 overflow-hidden flex flex-col">
              {/* Clean Tabs Navigation */}
              <div className="flex items-center px-6 bg-surface-container-lowest border-b border-stone-200/80">
                <button
                  onClick={() => {
                    setActiveTab('all');
                    setCurrentPage(1);
                  }}
                  className={`py-3 px-3.5 font-label-md text-label-md relative transition-colors flex items-center gap-2 cursor-pointer ${
                    activeTab === 'all'
                      ? 'text-primary-600 font-semibold border-b-2 border-primary-600'
                      : 'text-stone-500 hover:text-stone-900 font-medium'
                  }`}
                  type="button"
                >
                  <span>Danh sách chương</span>
                  <span className="font-label-sm text-meta bg-primary-600 text-white px-2 py-0.5 rounded-full font-bold">
                    {chapters.length}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('monetization');
                    setCurrentPage(1);
                  }}
                  className={`py-3 px-3.5 font-label-md text-label-md relative transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'monetization'
                      ? 'text-primary-600 font-semibold border-b-2 border-primary-600'
                      : 'text-stone-500 hover:text-stone-900 font-medium'
                  }`}
                  type="button"
                >
                  <span>Phát hành &amp; Thu phí</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('history');
                    setCurrentPage(1);
                  }}
                  className={`py-3 px-3.5 font-label-md text-label-md relative transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'history'
                      ? 'text-primary-600 font-semibold border-b-2 border-primary-600'
                      : 'text-stone-500 hover:text-stone-900 font-medium'
                  }`}
                  type="button"
                >
                  <span>Lịch sử bản thảo</span>
                </button>
              </div>

              {orderOpen && <ChapterOrder novelId={novelId} chapters={chapters} onClose={() => setOrderOpen(false)} />}
              {activeTab === 'history' ? <ChapterHistoryPanel chapters={chapters} /> : <>
              <div className="flex justify-end px-4 pt-3"><button type="button" className="sc-button sc-button-ghost" onClick={() => setOrderOpen(true)} disabled={!chapters.length}>Sắp xếp chương</button></div>
              {/* Streamlined Chapter Toolbar */}
              <div className="p-3.5 bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-2.5 border-b border-stone-200/80">
                <div className="flex items-center gap-2 flex-1 w-full sm:w-auto flex-wrap">
                  {/* Search Box */}
                  <div className="relative min-w-[240px] flex-1 sm:flex-initial">
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
                      type="text"
                    />
                  </div>

                  {/* Status Dropdown */}
                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-surface-subtle text-stone-800 font-label-md text-meta py-1.5 pl-3 pr-7 rounded-lg focus:outline-none cursor-pointer border border-stone-200 hover:border-stone-300 transition-colors"
                    >
                      <option value="ALL">Tất cả trạng thái ({chapters.length})</option>
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
                      value={accessFilter}
                      onChange={(e) => {
                        setAccessFilter(e.target.value as any);
                        setCurrentPage(1);
                      }}
                      className="appearance-none bg-surface-subtle text-stone-800 font-label-md text-meta py-1.5 pl-3 pr-7 rounded-lg focus:outline-none cursor-pointer border border-stone-200 hover:border-stone-300 transition-colors"
                    >
                      <option value="ALL">Tất cả quyền đọc</option>
                      <option value="FREE">Miễn phí</option>
                      <option value="VIP">VIP</option>
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-2 text-[16px] text-stone-400">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Right Toolbar Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
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


              {/* Decluttered 8-Column Chapter Table */}
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[950px] sc-chapter-table">
                  <thead>
                    <tr className="bg-surface-subtle text-stone-500 font-label-sm text-meta uppercase tracking-wider border-b border-stone-200">
                      <th className="py-2.5 px-3.5 w-10 text-center">
                        <input
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
                  <tbody className="divide-y divide-stone-100 font-body-md text-meta">
                    {paginatedChapters.map((chapter) => (
                      <tr
                        key={chapter.chapterId}
                        className={`hover:bg-surface-subtle/60 transition-colors ${
                          chapter.status === 'ARCHIVED' ? 'opacity-65 bg-stone-50/50' : 'bg-surface-container-lowest'
                        }`}
                      >
                        <td className="py-3 px-3.5 text-center">
                          <input
                            checked={selectedChapters.includes(chapter.chapterId)}
                            onChange={() => handleSelectOne(chapter.chapterId)}
                            className="rounded accent-primary-600 w-3.5 h-3.5 cursor-pointer"
                            type="checkbox"
                          />
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => chapter.status !== 'ARCHIVED' && openIde(chapter.chapterId)}
                              className="font-medium text-stone-900 hover:text-primary-600 cursor-pointer transition-colors"
                            >
                              {/^(?:Chương|Chapter)\s+\d+/i.test(chapter.title) ? chapter.title : `Chương ${chapter.chapterNumber}: ${chapter.title}`}
                            </span>
                            {chapter.chapterNumber === chapters.length && (
                              <span className="text-meta font-semibold text-primary-700 bg-primary-50 border border-primary-200/70 px-1.5 py-0.2 rounded">
                                Đang mở
                              </span>
                            )}
                          </div>
                          <div className="text-stone-400 text-meta mt-0.5">
                            {chapter.publicationSchedule?.status === 'PENDING' ? 'Đăng lúc ' + new Date(chapter.publicationSchedule.scheduledAt).toLocaleString('vi-VN') : chapter.publicationSchedule?.status === 'PENDING_MODERATION' ? 'Lịch đăng đang chờ duyệt' : chapter.publicationSchedule?.error ?? (chapter.draft?.autosave && 'Đang soạn trong Studio')}
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
                        <td className="py-3 px-3.5 text-center">{renderStatusBadge(chapter.status)}</td>
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
                        <td colSpan={7} className="py-3 text-center text-stone-400 italic">
                          Không tìm thấy chương truyện nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    )}
                    {Array.from({ length: Math.max(0, pageSize - Math.max(1, paginatedChapters.length)) }, (_, index) => (
                      <tr key={`empty-${index}`} aria-hidden="true"><td colSpan={7}>&nbsp;</td></tr>
                    ))}
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Trang trước"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed border border-stone-200"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-lg font-label-md text-meta transition-colors cursor-pointer ${
                        currentPage === page
                          ? 'bg-primary-600 text-white font-bold shadow-2xs'
                          : 'text-stone-700 hover:bg-stone-100 border border-stone-200'
                      }`}
                      type="button"
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Trang sau"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed border border-stone-200"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </div>
              </div>
              </>}
            </div>
          </div>
        </div>
      </main>

      {/* ──────────────────────────────────────────
          BEGIN: Footer (Preserved HTML Structure, IDE Warm Colors)
         ────────────────────────────────────────── */}
      <footer className="w-full bg-surface-container-lowest border-t border-stone-200/80 shadow-none mt-auto">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-meta">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary-600 text-[18px]">auto_stories</span>
            <span className="font-headline-sm text-stone-900 font-semibold">StoryCraft Văn Hoa</span>
            <span className="font-label-sm text-stone-400 ml-2">© 2025 Nền tảng Sáng tác Văn học Số.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to="/author"
              className="font-label-md text-stone-500 hover:text-stone-900 transition-colors"
              data-path="trang-tac-gia"
            >
              Quy chuẩn bản quyền
            </Link>
            <Link
              to="/author"
              className="font-label-md text-stone-500 hover:text-stone-900 transition-colors"
              data-path="tong-quan"
            >
              Trung tâm trợ giúp
            </Link>
            <Link
              to="/wallet"
              className="font-label-md text-stone-500 hover:text-stone-900 transition-colors"
              data-path="vi-va-doanh-thu"
            >
              Chính sách chia sẻ doanh thu
            </Link>
          </div>
        </div>
      </footer>

      {/* ──────────────────────────────────────────
          BEGIN: Modal Chỉnh Sửa Thông Tin Tác Phẩm
         ────────────────────────────────────────── */}
      {editModalOpen && (
        <AuthorDialog onClose={() => setEditModalOpen(false)}><div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="sc-novel-edit-dialog bg-surface-container-lowest rounded-xl shadow-sm border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="sc-novel-edit-header flex items-center justify-between border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">edit_square</span>
                </div>
                <div>
                  <h3 className="text-body font-bold text-stone-900">Chỉnh sửa thông tin tác phẩm</h3>
                  <p className="text-meta text-stone-400">Cập nhật thông tin, thể loại và lời tác giả</p>
                </div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Form */}
            <div className="sc-novel-edit-fields text-body">
              <div>
                <label className="block font-semibold text-stone-800 mb-1">Tiêu đề tác phẩm</label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Nhập tên tiểu thuyết..."
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-800 mb-1">Ảnh bìa</label>
                <ImageUpload onUpload={setCoverInput} label="Tải ảnh bìa" />
                <div className="flex gap-2.5">
                  <input
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
                      className="w-9 h-13 object-cover rounded shadow-2xs shrink-0 border border-stone-200"
                    />
                  )}
                </div>
              </div>

              <TagsInput className="sc-novel-edit-genres" label="Thể loại" description="Chọn hoặc nhập tối đa 5 thể loại." placeholder="Chọn hoặc nhập thể loại" data={genresQuery.data ?? []} value={genresInput} onChange={setGenresInput} maxTags={5} maxLength={100} clearable comboboxProps={{ withinPortal: false }} />
              <div>
                <label htmlFor="novel-author-note" className="block font-semibold text-stone-800 mb-1">Lời tác giả</label>
                <textarea id="novel-author-note" rows={8} maxLength={5000} value={authorNoteInput} onChange={event => setAuthorNoteInput(event.target.value)} placeholder="Lời nhắn dành cho độc giả…" className="w-full px-3 py-2 rounded-lg bg-stone-50 border border-stone-200 text-body" />
                <p className="text-meta text-stone-500">Tối đa 5.000 ký tự.</p>
              </div>

              <div>
                <label className="block font-semibold text-stone-800 mb-1">Lời giới thiệu (Synopsis)</label>
                <textarea
                  rows={4}
                  value={synopsisInput}
                  onChange={(e) => setSynopsisInput(e.target.value)}
                  placeholder="Tóm tắt nội dung hấp dẫn để thu hút độc giả..."
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta leading-relaxed"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="sc-novel-edit-footer border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => submitPublishMutation.mutate()}
                disabled={
                  submitPublishMutation.isPending ||
                  novel.status === 'PUBLISHED' ||
                  novel.status === 'PENDING_MODERATION'
                }
                className="px-3 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-meta font-semibold hover:bg-primary-100 transition-colors disabled:opacity-40 cursor-pointer"
                type="button"
              >
                {submitPublishMutation.isPending ? 'Đang gửi...' : 'Gửi duyệt toàn truyện'}
              </button>
              <div className="flex gap-2">
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
            </div>
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          BEGIN: Modal Thêm Chương Mới
         ────────────────────────────────────────── */}
      {newChapterModalOpen && (
        <AuthorDialog onClose={() => setNewChapterModalOpen(false)}><div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-stone-200 w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[17px]">add_circle</span>
                </div>
                <div>
                  <h3 className="text-meta font-bold text-stone-900">Thêm chương mới</h3>
                  <p className="text-meta text-stone-400">Khởi tạo và mở Studio viết truyện</p>
                </div>
              </div>
              <button
                onClick={() => setNewChapterModalOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-meta">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Tiêu đề chương</label>
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder={`Ví dụ: Chương ${chapters.length + 1}: Khởi đầu mới`}
                  className="w-full px-3 py-1.5 rounded-lg bg-stone-50 text-stone-900 border border-stone-200 focus:ring-1 focus:ring-primary-500 focus:outline-none text-meta"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                <div>
                  <span className="font-semibold text-stone-800 block text-meta">Chế độ chương VIP</span>
                  <span className="text-meta text-stone-500">Độc giả trả Xu để mở khóa</span>
                </div>
                <input
                  type="checkbox"
                  checked={newChapterVip}
                  onChange={(e) => setNewChapterVip(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary-600 rounded cursor-pointer"
                />
              </div>

              {newChapterVip && (
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Giá mở khóa (Xu)</label>
                  <input
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
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          BEGIN: Toast Notification
         ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in  duration-300">
          <div className="flex items-center gap-2 bg-cover-fallback text-white px-3.5 py-2 rounded-xl shadow-sm text-meta font-medium border border-stone-800">
            <span className="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
