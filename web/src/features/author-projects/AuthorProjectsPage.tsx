import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { createChapter, createNovel, listMyNovels } from '../novels/novel-api';
import type { Novel, NovelStatus } from '../novels/novel-types';

const GENRE_LIST = [
  'Hiện đại / Lãng mạn',
  'Hiện đại / Đô thị',
  'Trinh thám / Kịch tính',
  'Huyền ảo / Tiên hiệp',
  'Lịch sử / Cổ phong',
  'Huyền bí / Kỳ ảo',
  'Võng du / Khoa huyễn',
  'Đời thường / Gia đình',
  'Thanh xuân / Vườn trường'
];

const DEFAULT_COVERS = [
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1476275466078-4007374efbbe?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1516979187457-637abb4f9353?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1532012164546-f432f2e3edd4?q=80&w=600&auto=format&fit=crop'
];

function formatTimeAgo(dateStr?: string) {
  if (!dateStr) return 'Mới cập nhật';
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diffMs)) return 'Mới cập nhật';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Vừa xong';
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return new Date(dateStr).toLocaleDateString('vi-VN');
  } catch {
    return 'Mới cập nhật';
  }
}

export function AuthorProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state: any) => state.user);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<'ALL' | 'ONGOING' | 'COMPLETED' | 'DRAFT'>('ALL');
  const [selectedGenre, setSelectedGenre] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeMenuNovelId, setActiveMenuNovelId] = useState<string | null>(null);

  // Modal State for New Project
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('Hiện đại / Lãng mạn');
  const [newSynopsis, setNewSynopsis] = useState('');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isCoverDragging, setIsCoverDragging] = useState(false);

  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    };
    if (isGenreDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isGenreDropdownOpen]);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Queries
  const projectsQuery = useQuery({
    queryKey: ['author-projects'],
    queryFn: () => listMyNovels()
  });

  const projects: Novel[] = projectsQuery.data ?? [];

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = project.title.toLowerCase().includes(q);
        const matchSynopsis = (project.synopsis || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSynopsis) return false;
      }

      // 2. Status Tab Filter
      if (selectedStatusTab === 'DRAFT') {
        if (project.status !== 'DRAFT') return false;
      } else if (selectedStatusTab === 'COMPLETED') {
        if (project.serialStatus !== 'COMPLETED') return false;
      } else if (selectedStatusTab === 'ONGOING') {
        if (project.status === 'DRAFT' || project.serialStatus === 'COMPLETED') return false;
      }

      // 3. Genre Filter
      if (selectedGenre !== 'ALL') {
        // Genre checking if present or default
        const pGenre = (project as any).genre || 'Hiện đại / Đô thị';
        if (pGenre !== selectedGenre) return false;
      }

      return true;
    });
  }, [projects, searchQuery, selectedStatusTab, selectedGenre]);

  // Status Counts for Pills
  const counts = useMemo(() => {
    let writing = 0;
    let completed = 0;
    let draft = 0;

    for (const p of projects) {
      if (p.status === 'DRAFT') {
        draft++;
      } else if (p.serialStatus === 'COMPLETED') {
        completed++;
      } else {
        writing++;
      }
    }

    return {
      all: projects.length,
      writing,
      completed,
      draft
    };
  }, [projects]);

  // Statistics across all projects
  const totalReads = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.viewsCount || (p.likesCount || 0) * 15 + 120), 0);
  }, [projects]);

  const totalChapters = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.chaptersCount || 0), 0);
  }, [projects]);

  // Create Project Mutation
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle || trimmedTitle.length < 2) {
        throw new Error('Vui lòng nhập tên tác phẩm (tối thiểu 2 ký tự).');
      }

      const novel = await createNovel({
        title: trimmedTitle,
        synopsis: newSynopsis.trim() || 'Một tác phẩm văn học mới tại StoryCraft Văn Hoa Studio.',
        genre: newGenre,
        tags: [],
        coverImageUrl: newCoverUrl.trim() || null
      });

      // Create starter chapter
      const starterChapter = await createChapter(novel.novelId, {
        title: 'Chương 1: Mở đầu',
        content: 'Bắt đầu hành trình sáng tác chương đầu tiên tại đây...',
        isVip: false,
        priceCoins: 0
      });

      return { novel, starterChapter };
    },
    onSuccess: async ({ novel, starterChapter }: { novel: Novel; starterChapter: any }) => {
      localStorage.setItem('ephurin_author_novel_id', novel.novelId);
      localStorage.setItem('ephurin_author_chapter_id', starterChapter.chapterId);
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      setCreateModalOpen(false);
      setNewTitle('');
      setNewGenre('Hiện đại / Lãng mạn');
      setNewSynopsis('');
      setNewCoverUrl('');
      setIsGenreDropdownOpen(false);
      showToast('Đã tạo tác phẩm mới thành công!');
      navigate(`/author/novels/${novel.novelId}`);
    },
    onError: (err: any) => {
      showToast('Lỗi tạo tác phẩm: ' + (err?.message || 'Không thể tạo tác phẩm'));
    }
  });

  const openIde = (novelId: string) => {
    navigate(`/author/ide?novelId=${novelId}`);
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2] font-body-md text-stone-800 antialiased selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      {/* ──────────────────────────────────────────
          1. Fixed Top Header Navigation Bar
         ────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 bg-[#faf9f6]/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-stone-200/80">
        <div className="h-14 max-w-7xl mx-auto px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link to="/author" className="flex items-center gap-1.5" data-path="tong-quan">
              <span className="material-symbols-outlined text-primary-600 text-[26px]">menu_book</span>
              <span className="font-headline-sm text-[17px] text-primary-600 tracking-tight font-bold">StoryCraft</span>
              <span className="font-label-sm text-[11px] uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded font-semibold">
                Văn Hoa Studio
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 ml-2">
              <Link
                to="/author"
                className="px-3 py-1.5 rounded-lg font-label-md text-label-md text-primary-600 font-semibold bg-stone-100/90 border border-stone-200/60 transition-colors"
                data-path="tong-quan"
              >
                Tổng quan
              </Link>
              <Link
                to="/author"
                className="px-3 py-1.5 rounded-lg font-label-md text-label-md text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                data-path="tac-pham"
              >
                Tác phẩm
              </Link>
              <Link
                to="/wallet"
                className="px-3 py-1.5 rounded-lg font-label-md text-label-md text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                data-path="vi-va-doanh-thu"
              >
                Ví &amp; doanh thu
              </Link>
              <Link
                to="/profile/me"
                className="px-3 py-1.5 rounded-lg font-label-md text-label-md text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                data-path="trang-tac-gia"
              >
                Trang tác giả
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (projects.length > 0) {
                  openIde(projects[0].novelId);
                } else {
                  setCreateModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary-600 text-white font-label-md text-label-md hover:bg-primary-700 shadow-2xs transition-all active:scale-95 font-medium cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">edit_square</span>
              <span>Viết chương mới</span>
            </button>
            <Link
              to="/notifications"
              aria-label="Thông báo"
              className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors relative"
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </Link>
            <div className="flex items-center gap-2 pl-1 border-l border-stone-200">
              <div className="w-7 h-7 rounded-full bg-primary-600/10 text-primary-700 flex items-center justify-center font-bold text-xs uppercase">
                {user?.displayName?.charAt(0) || user?.username?.charAt(0) || 'A'}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="font-label-md text-[13px] text-stone-900 font-semibold leading-none">
                  {user?.displayName || user?.username || 'Mai Linh'}
                </span>
                <span className="font-label-sm text-[11px] text-stone-500 leading-tight">
                  @{user?.username || 'moclan'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────
          2. Main Body Container
         ────────────────────────────────────────── */}
      <main className="w-full flex-1 pt-14 pb-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
          {/* Page Header & Main Title */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1 text-[11px] text-stone-500 tracking-wider uppercase font-medium"
              >
                <span>Trang chủ</span>
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                <span className="text-primary-600 font-semibold">Bảng làm việc</span>
              </nav>
              <h1 className="font-headline-sm text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                Bảng làm việc
              </h1>
              <p className="text-xs text-stone-500">
                Quản lý tác phẩm và tiếp tục hành trình sáng tác văn học của bạn.
              </p>
            </div>

            {/* Quick Action Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-label-md text-xs font-semibold shadow-2xs transition-all transform active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span>Tạo tác phẩm mới</span>
              </button>
            </div>
          </header>

          {/* Compact Overview Statistics (3 Cards, Single Row) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Tổng tác phẩm */}
            <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">
                  Tổng tác phẩm
                </span>
                <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                  {counts.all}
                </span>
                <span className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 inline-block"></span>
                  Tất cả dự án sáng tác
                </span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-primary-600/10 flex items-center justify-center text-primary-600 shrink-0">
                <span className="material-symbols-outlined text-[24px]">auto_stories</span>
              </div>
            </div>

            {/* Card 2: Tổng lượt đọc */}
            <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">
                  Tổng lượt đọc
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                    {totalReads >= 1000 ? `${(totalReads / 1000).toFixed(1)}K` : totalReads}
                  </span>
                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                    +12.4% tuần này
                  </span>
                </div>
                <span className="text-[11px] text-stone-500 mt-0.5">Tương tác độc giả tích lũy</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <span className="material-symbols-outlined text-[24px]">visibility</span>
              </div>
            </div>

            {/* Card 3: Chương đã xuất bản */}
            <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">
                  Chương đã xuất bản
                </span>
                <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                  {totalChapters}
                </span>
                <span className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  Trên {counts.all} bộ truyện đang chạy
                </span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700 shrink-0">
                <span className="material-symbols-outlined text-[24px]">history_edu</span>
              </div>
            </div>
          </section>

          {/* Main Section: Tác phẩm của tôi */}
          <section className="flex flex-col gap-4">
            {/* Section Header with Count Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-stone-900">Tác phẩm của tôi</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-200/80 text-stone-700 text-xs font-semibold">
                  {filteredProjects.length} tác phẩm
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <span>Sắp xếp: Mới cập nhật</span>
                <span className="material-symbols-outlined text-[16px]">swap_vert</span>
              </div>
            </div>

            {/* Filter Toolbar Row */}
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-2xs border border-stone-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[220px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm tác phẩm theo tên..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-stone-50/80 text-xs text-stone-900 placeholder:text-stone-400 border border-stone-200/80 focus:outline-none focus:bg-white focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
                />
              </div>

              {/* Filters & View Mode */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Status Segmented Buttons */}
                <div className="flex items-center bg-stone-100 p-0.5 rounded-lg text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedStatusTab('ALL')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      selectedStatusTab === 'ALL'
                        ? 'bg-primary-600 text-white shadow-xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Tất cả ({counts.all})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStatusTab('ONGOING')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      selectedStatusTab === 'ONGOING'
                        ? 'bg-primary-600 text-white shadow-xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Đang sáng tác ({counts.writing})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStatusTab('COMPLETED')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      selectedStatusTab === 'COMPLETED'
                        ? 'bg-primary-600 text-white shadow-xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Hoàn thành ({counts.completed})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStatusTab('DRAFT')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      selectedStatusTab === 'DRAFT'
                        ? 'bg-primary-600 text-white shadow-xs font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Bản nháp ({counts.draft})
                  </button>
                </div>

                {/* Genre Dropdown */}
                <div className="relative">
                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="appearance-none bg-stone-50/80 hover:bg-stone-50 border border-stone-200/80 text-stone-700 text-xs py-1.5 pl-3 pr-7 rounded-lg focus:outline-none focus:border-primary-600 cursor-pointer transition-colors"
                  >
                    <option value="ALL">Tất cả thể loại</option>
                    {GENRE_LIST.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400 text-[16px]">
                    expand_more
                  </span>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-stone-100 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1 rounded-md cursor-pointer transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-white text-primary-600 shadow-xs'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                    title="Lưới"
                  >
                    <span className="material-symbols-outlined text-[18px]">grid_view</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-1 rounded-md cursor-pointer transition-colors ${
                      viewMode === 'list'
                        ? 'bg-white text-primary-600 shadow-xs'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                    title="Danh sách"
                  >
                    <span className="material-symbols-outlined text-[18px]">view_list</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Loading / Error States */}
            {projectsQuery.isLoading && (
              <div className="p-12 bg-white rounded-xl border border-stone-200/80 flex flex-col items-center justify-center gap-3">
                <div className="w-7 h-7 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-stone-500">Đang tải danh sách tác phẩm...</p>
              </div>
            )}

            {projectsQuery.isError && (
              <div className="p-8 bg-white rounded-xl border border-rose-200 flex flex-col items-center justify-center gap-2 text-center">
                <span className="material-symbols-outlined text-rose-500 text-3xl">error</span>
                <p className="text-xs font-semibold text-stone-800">Không thể tải danh sách tác phẩm</p>
                <button
                  type="button"
                  onClick={() => projectsQuery.refetch()}
                  className="mt-2 px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-medium text-stone-700"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Empty State */}
            {!projectsQuery.isLoading && !projectsQuery.isError && filteredProjects.length === 0 && (
              <div className="p-12 bg-white rounded-xl border border-stone-200/80 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                  <span className="material-symbols-outlined text-[28px]">menu_book</span>
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <h3 className="text-sm font-bold text-stone-900">Chưa có tác phẩm phù hợp</h3>
                  <p className="text-xs text-stone-500">
                    {searchQuery.trim()
                      ? 'Không tìm thấy tác phẩm nào khớp với từ khóa tìm kiếm.'
                      : 'Hãy bắt đầu sáng tác tác phẩm đầu tiên của bạn tại StoryCraft Văn Hoa Studio.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  Tạo tác phẩm đầu tiên
                </button>
              </div>
            )}

            {/* Novel Cards: Grid View (Strict 3 columns on desktop) */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-4.5">
                {filteredProjects.map((project, idx) => {
                  const cover = project.coverImageUrl || DEFAULT_COVERS[idx % DEFAULT_COVERS.length];
                  const statusLabel =
                    project.status === 'DRAFT'
                      ? 'Bản nháp'
                      : project.status === 'PENDING_MODERATION'
                      ? 'Chờ duyệt'
                      : project.serialStatus === 'COMPLETED'
                      ? 'Hoàn thành'
                      : 'Đang sáng tác';

                  const isMenuOpen = activeMenuNovelId === project.novelId;

                  const readsFormatted = project.viewsCount
                    ? project.viewsCount >= 1000
                      ? `${(project.viewsCount / 1000).toFixed(1)}K`
                      : project.viewsCount
                    : `${(project.likesCount || 0) * 12 + 10}K`;

                  return (
                    <article
                      key={project.novelId}
                      className="bg-white rounded-xl p-3.5 shadow-2xs hover:shadow-sm border border-stone-200/90 transition-all flex flex-col justify-between h-full group"
                    >
                      <div className="flex gap-3.5 items-start">
                        {/* Left: Compact vertical novel cover (approx 96px wide, fixed 2:3 aspect ratio) */}
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="relative w-[96px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-stone-100 border border-stone-200/70 block group-hover:opacity-95 transition-opacity"
                        >
                          <img
                            src={cover}
                            alt={project.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </Link>

                        {/* Right: Novel Info (Title, Status, Genre, Stats, Updated time) */}
                        <div className="flex flex-col flex-1 min-w-0 justify-between self-stretch py-0.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[11px] font-medium text-stone-500 truncate">
                                {(project as any).genre || 'Hiện đại / Đô thị'}
                              </span>
                              <span
                                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                                  project.status === 'DRAFT'
                                    ? 'bg-stone-100 text-stone-600 border border-stone-200/60'
                                    : project.serialStatus === 'COMPLETED'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                    : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>

                            {/* Novel Title: Prominently, up to 2 lines */}
                            <Link
                              to={`/author/novels/${project.novelId}`}
                              className="text-[14px] font-bold text-stone-900 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors"
                              title={project.title}
                            >
                              {project.title}
                            </Link>

                            {/* Most recently edited chapter line */}
                            <p className="text-[11.5px] text-stone-500 font-normal mt-1.5 flex items-center gap-1 truncate">
                              <span className="material-symbols-outlined text-[14px] text-stone-400 shrink-0">edit_note</span>
                              <span className="truncate">
                                {project.chaptersCount && project.chaptersCount > 0
                                  ? (project as any).latestEditedChapterTitle
                                    ? `Chỉnh sửa gần nhất: ${(project as any).latestEditedChapterTitle}`
                                    : (project as any).latestEditedChapterNumber
                                    ? `Chỉnh sửa gần nhất: Chương ${(project as any).latestEditedChapterNumber}`
                                    : `Chỉnh sửa gần nhất: Chương ${project.chaptersCount}`
                                  : 'Chưa có chương được chỉnh sửa'}
                              </span>
                            </p>
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1.5 text-xs text-stone-600 whitespace-nowrap">
                              <span className="material-symbols-outlined text-[15px] text-primary-600">menu_book</span>
                              <span><strong>{project.chaptersCount || 0}</strong> chương</span>
                              <span className="text-stone-300">•</span>
                              <span className="material-symbols-outlined text-[15px] text-stone-400">visibility</span>
                              <span><strong>{readsFormatted}</strong> đọc</span>
                            </div>

                            <div className="flex items-center gap-1 text-[11px] text-stone-400">
                              <span className="material-symbols-outlined text-[13px]">update</span>
                              <span className="truncate">Cập nhật: {formatTimeAgo((project as any).updatedAt || (project as any).createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Footer */}
                      <div className="mt-3.5 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-1.5 relative">
                        <div className="flex items-center gap-1.5 flex-1">
                          <Link
                            to={`/author/novels/${project.novelId}`}
                            className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-xs font-medium text-stone-700 border border-stone-200/80 shadow-2xs transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">settings</span>
                            <span>Quản lý</span>
                          </Link>

                          {project.serialStatus === 'COMPLETED' ? (
                            <Link
                              to={`/public/novels/${project.novelId}`}
                              className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold shadow-2xs transition-colors"
                            >
                              <span className="material-symbols-outlined text-[15px]">visibility</span>
                              <span>Xem tác phẩm</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openIde(project.novelId)}
                              className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">draw</span>
                              <span>Viết tiếp</span>
                            </button>
                          )}
                        </div>

                        {/* Three-dot overflow menu */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveMenuNovelId(isMenuOpen ? null : project.novelId)
                            }
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                            title="Thêm thao tác"
                          >
                            <span className="material-symbols-outlined text-[18px]">more_vert</span>
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 bottom-full mb-1.5 w-44 bg-white rounded-lg shadow-lg border border-stone-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              <Link
                                to={`/author/context/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px] text-indigo-500">
                                  menu_book
                                </span>
                                <span>Cẩm nang bối cảnh</span>
                              </Link>
                              <Link
                                to={`/author/import/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                  file_upload
                                </span>
                                <span>Nhập bản thảo</span>
                              </Link>
                              <Link
                                to={`/public/novels/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px] text-stone-400">
                                  visibility
                                </span>
                                <span>Xem trang độc giả</span>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Novel Cards: List View */}
            {viewMode === 'list' && (
              <div className="bg-white rounded-xl shadow-2xs border border-stone-200/80 overflow-hidden divide-y divide-stone-100">
                {filteredProjects.map((project, idx) => {
                  const cover = project.coverImageUrl || DEFAULT_COVERS[idx % DEFAULT_COVERS.length];
                  const statusLabel =
                    project.status === 'DRAFT'
                      ? 'Bản nháp'
                      : project.status === 'PENDING_MODERATION'
                      ? 'Chờ duyệt'
                      : project.serialStatus === 'COMPLETED'
                      ? 'Hoàn thành'
                      : 'Đang sáng tác';

                  return (
                    <div
                      key={project.novelId}
                      className="p-3.5 hover:bg-stone-50/70 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="relative w-12 aspect-[2/3] shrink-0 rounded overflow-hidden bg-stone-100 border border-stone-200/60 block"
                        >
                          <img
                            src={cover}
                            alt={project.title}
                            className="w-full h-full object-cover"
                          />
                        </Link>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/author/novels/${project.novelId}`}
                              className="text-xs font-bold text-stone-900 hover:text-primary-600 truncate transition-colors"
                            >
                              {project.title}
                            </Link>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                                project.status === 'DRAFT'
                                  ? 'bg-stone-100 text-stone-600 border border-stone-200/60'
                                  : project.serialStatus === 'COMPLETED'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                  : 'bg-primary-50 text-primary-700 border border-primary-200/60'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 font-normal mt-0.5 truncate">
                            {(project as any).genre || 'Hiện đại / Đô thị'}
                          </p>
                          <div className="flex items-center gap-2 text-[10.5px] text-stone-400 mt-0.5">
                            <span>
                              {project.chaptersCount || 0} chương •{' '}
                              {project.viewsCount
                                ? project.viewsCount >= 1000
                                  ? `${(project.viewsCount / 1000).toFixed(1)}K`
                                  : project.viewsCount
                                : `${(project.likesCount || 0) * 12 + 10}K`}{' '}
                              lượt đọc
                            </span>
                            <span>•</span>
                            <span>
                              Cập nhật: {formatTimeAgo((project as any).updatedAt || (project as any).createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="px-2.5 py-1 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200/80 text-xs font-medium text-stone-700 shadow-2xs transition-colors"
                        >
                          Quản lý
                        </Link>
                        {project.serialStatus === 'COMPLETED' ? (
                          <Link
                            to={`/public/novels/${project.novelId}`}
                            className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold shadow-2xs transition-colors"
                          >
                            Xem tác phẩm
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openIde(project.novelId)}
                            className="px-3 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          >
                            Viết tiếp
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </main>

      {/* ──────────────────────────────────────────
          3. Create Novel Modal Dialog
         ────────────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#f3f5fe] border-b border-indigo-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#3525cd] text-[22px]">menu_book</span>
                <h3 className="text-sm font-bold text-stone-900">Tạo tác phẩm mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-full hover:bg-stone-200/60 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[19px]">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProjectMutation.mutate();
              }}
              className="p-5 flex flex-col gap-4"
            >
              {/* Field 1: Tên tác phẩm */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-stone-900">
                  Tên tác phẩm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Hoàng Hôn Trên Dòng Sông Đáy"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#f0f2fa] text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#3525cd] focus:bg-white border-0 transition-colors"
                />
                <p className="text-[11px] text-stone-500">
                  Vui lòng nhập tên tác phẩm (tối thiểu 2 ký tự)
                </p>
              </div>

              {/* Field 2: Thể loại chính (dropdown menu) */}
              <div className="flex flex-col gap-1.5 relative" ref={genreDropdownRef}>
                <label className="text-xs font-bold text-stone-900">
                  Thể loại chính <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#f0f2fa] text-xs text-stone-900 font-medium flex items-center justify-between hover:bg-[#e9edf8] focus:outline-none focus:ring-1 focus:ring-[#3525cd] transition-colors cursor-pointer text-left"
                >
                  <span>{newGenre}</span>
                  <span
                    className={`material-symbols-outlined text-stone-500 text-[20px] transition-transform duration-200 ${
                      isGenreDropdownOpen ? 'rotate-180 text-[#3525cd]' : ''
                    }`}
                  >
                    expand_more
                  </span>
                </button>

                {isGenreDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-stone-200/90 py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    {GENRE_LIST.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          setNewGenre(genre);
                          setIsGenreDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          newGenre === genre
                            ? 'bg-[#eef2ff] text-[#3525cd] font-semibold'
                            : 'text-stone-700 hover:bg-[#f4f6fe]'
                        }`}
                      >
                        <span>{genre}</span>
                        {newGenre === genre && (
                          <span className="material-symbols-outlined text-[16px] text-[#3525cd]">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Field 3: Giới thiệu ngắn */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-900">Giới thiệu ngắn</label>
                  <span className="text-xs text-stone-400 font-normal">Tùy chọn</span>
                </div>
                <textarea
                  rows={3}
                  value={newSynopsis}
                  onChange={(e) => setNewSynopsis(e.target.value)}
                  placeholder="Một câu chuyện giàu chất thơ về những mảnh đời trầm lặng bên bến sông xưa, nơi quá khứ và hiện tại giao hòa qua từng con sóng dạt dào cảm xúc."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#f0f2fa] text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#3525cd] focus:bg-white border-0 resize-none transition-colors leading-relaxed"
                />
              </div>

              {/* Field 4: Ảnh bìa tác phẩm */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-900">Ảnh bìa tác phẩm</label>
                  <span className="text-xs text-stone-400 font-normal">Tùy chọn</span>
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsCoverDragging(true);
                  }}
                  onDragLeave={() => setIsCoverDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsCoverDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setNewCoverUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`rounded-xl p-3 flex items-center justify-between gap-3 transition-colors ${
                    isCoverDragging
                      ? 'bg-[#e0e7ff] border-2 border-dashed border-[#3525cd]'
                      : 'bg-[#f0f2fa] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-12 h-12 rounded-lg bg-[#dee6fd] text-[#3525cd] flex items-center justify-center shrink-0 overflow-hidden">
                      {newCoverUrl ? (
                        <img src={newCoverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[24px]">photo_library</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-800 truncate">
                        {newCoverUrl ? 'Đã chọn ảnh bìa' : 'Kéo thả ảnh hoặc tải lên'}
                      </p>
                      <p className="text-[10.5px] text-stone-500 truncate">
                        Hỗ trợ: JPG, PNG, WEBP (Tỷ lệ gợi ý 2:3)
                      </p>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={coverInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') {
                            setNewCoverUrl(reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {newCoverUrl && (
                      <button
                        type="button"
                        onClick={() => setNewCoverUrl('')}
                        title="Xóa ảnh"
                        className="p-1 rounded text-stone-400 hover:text-rose-500 hover:bg-stone-200/50 transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-stone-50 border border-stone-200/80 text-stone-700 text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      Chọn ảnh
                    </button>
                  </div>
                </div>
              </div>

              {/* Info Notice Box */}
              <div className="rounded-xl bg-[#eef2ff] p-2.5 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#3525cd] text-[18px] shrink-0 mt-0.5">
                  info
                </span>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Tác phẩm mới sẽ được lưu dưới dạng bản nháp riêng tư. Bạn có thể thay đổi trạng thái sau.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#e6ebf8] hover:bg-[#d9e1f5] text-stone-700 font-semibold text-xs cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending || newTitle.trim().length < 2}
                  className="px-5 py-2 rounded-lg bg-[#3525cd] hover:bg-[#2b1fba] disabled:opacity-50 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {createProjectMutation.isPending && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <span>Tạo tác phẩm</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          Toast Notification
         ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-stone-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl animate-in slide-in-from-bottom-2 duration-200">
          <span className="material-symbols-outlined text-[17px] text-emerald-400">check_circle</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
