import { FilterPresets, useUrlFilters, useWorkspacePreference, stringArray, useListScroll } from '../../shared/components/WorkspacePreferences';
import { ActiveFilterChips, AnimatedCollection, AnimatedNumber, LoadedImage, ProjectLayout, ProjectMotionCard, ResultsSurface, SuggestionReveal } from '../../shared/components/AuthorAdminMotion';
import { ImageLightbox, useUpdatedItems } from '../../shared/components/InteractionWidgets';
import { useToast } from '../../shared/components/ToastProvider';
import { LoadingState } from '../../shared/components/PageStates';
import { uploadImage } from '../../shared/components/ImageUpload';
import { CoverCropEditor } from '../../shared/components/CoverCropEditor';
import { WorkspacePreview } from '../../shared/components/WorkspacePreview';
import { ReactionIcon } from '../../shared/components/InteractionWidgets';
import { AuthorDialog, AuthorNavbar } from '../../shared/components/AuthorTheme';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { writeAuthorContext } from '../author-ide/author-context';
import { createNovel, listGenres, listMyNovels } from '../novels/novel-api';
import { sortProjects, type ProjectSort } from './project-sorting';
import type { Novel, NovelStatus } from '../novels/novel-types';

function ProjectPin({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  return <button type="button" className="sc-project-pin" aria-pressed={active} aria-label={`${active ? 'Bỏ ghim' : 'Ghim'} ${title}`} title={active ? 'Bỏ ghim' : 'Ghim lên đầu'} onClick={onClick}><ReactionIcon icon="push_pin" active={active} /></button>;
}

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
  const filters = useUrlFilters({ q: '', status: 'ALL' as 'ALL' | 'ONGOING' | 'COMPLETED' | 'DRAFT', sort: 'updated' as ProjectSort, genre: 'ALL', pinned: false as boolean }, { status: ['ALL','ONGOING','COMPLETED','DRAFT'], sort: ['updated','created-desc','created-asc','title-asc','title-desc','views','chapters'] });
  const [searchQuery, setSearchQuery] = filters.field('q');
  const [selectedStatusTab, setSelectedStatusTab] = filters.field('status');
  const [sortOrder, setSortOrder] = filters.field('sort');
  const [selectedGenre, setSelectedGenre] = filters.field('genre');
  const [onlyPinned, setOnlyPinned] = filters.field('pinned');
  const [viewMode, setViewMode] = useWorkspacePreference<'grid' | 'list'>('project-view', 'grid', (v): v is 'grid' | 'list' => v === 'grid' || v === 'list');
  const [pinnedIds, setPinnedIds] = useWorkspacePreference<string[]>('pinned-projects', [], stringArray);
  const [recentIds] = useWorkspacePreference<string[]>('recent-projects', [], stringArray);
  const togglePin = (id: string) => setPinnedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [id, ...ids].slice(0, 200));
  const [activeMenuNovelId, setActiveMenuNovelId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Modal State for New Project
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [newSynopsis, setNewSynopsis] = useState('');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [coverToCrop, setCoverToCrop] = useState<File | null>(null);
  useEffect(() => { if (!createModalOpen) setCoverToCrop(null); }, [createModalOpen]);
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
  const { showToast } = useToast();

  // Queries
  const projectsQuery = useQuery({
    queryKey: ['author-projects', user?.userId],
    queryFn: () => listMyNovels()
  });
  useListScroll(!projectsQuery.isPending);
  const genresQuery = useQuery({ queryKey: ['novel-genres'], queryFn: listGenres });
  const genres = genresQuery.data ?? [];

  const projects: Novel[] = projectsQuery.data ?? [];
  const updated = useUpdatedItems(projectsQuery.data?.map(project => ({ id: project.novelId, version: [project.updatedAt, project.status, project.title, project.chaptersCount, project.coverImageUrl, project.serialStatus].join('|') })));

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return sortProjects(projects.filter((project) => {
      if (onlyPinned && !pinnedIds.includes(project.novelId)) return false;
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
        if (project.genre !== selectedGenre && !project.genres?.includes(selectedGenre)) return false;
      }

      return true;
    }), sortOrder).sort((a, b) => Number(pinnedIds.includes(b.novelId)) - Number(pinnedIds.includes(a.novelId)));
  }, [projects, searchQuery, selectedStatusTab, selectedGenre, sortOrder, pinnedIds, onlyPinned]);

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
    return projects.reduce((sum, p) => sum + (p.viewsCount ?? 0), 0);
  }, [projects]);

  const totalChapters = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.chaptersCount || 0), 0);
  }, [projects]);

  // Create Project Mutation
  const coverUpload = useMutation({ mutationFn: uploadImage, onSuccess: setNewCoverUrl, onError: (error: Error) => showToast(error.message) });
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle || trimmedTitle.length < 2) {
        throw new Error('Vui lòng nhập tên tác phẩm (tối thiểu 2 ký tự).');
      }
      if (newSynopsis.trim().length < 10) throw new Error('Giới thiệu cần tối thiểu 10 ký tự.');

      const novel = await createNovel({
        title: trimmedTitle,
        synopsis: newSynopsis.trim(),
        genre: newGenre.trim() || undefined,
        tags: [],
        coverImageUrl: newCoverUrl.trim() || null
      });

      return novel;
    },
    onSuccess: async (novel: Novel) => {
      writeAuthorContext(user?.userId ?? '', { novelId: novel.novelId, chapterId: '' });
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      setCreateModalOpen(false);
      setNewTitle('');
      setNewGenre('');
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
    <div className="min-h-screen bg-surface font-body-md text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-900 flex flex-col">
      {/* ──────────────────────────────────────────
          1. Fixed Top Header Navigation Bar
         ────────────────────────────────────────── */}
      <AuthorNavbar />

      {/* ──────────────────────────────────────────
          2. Main Body Container
         ────────────────────────────────────────── */}
      <main className="w-full flex-1 pt-0 pb-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
          {/* Page Header & Main Title */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1 text-meta text-stone-500 tracking-wider uppercase font-medium"
              >
                <span>Trang chủ</span>
                <span className="material-symbols-outlined text-body">chevron_right</span>
                <span className="text-primary-600 font-semibold">Bảng làm việc</span>
              </nav>
              <h1 className="font-headline-sm text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                Bảng làm việc
              </h1>
            </div>

            {/* Quick Action Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-workspace-create onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-label-md text-meta font-semibold shadow-2xs transition-all transform  cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span>Tạo tác phẩm mới</span>
              </button>
            </div>
          </header>

          {/* Compact Overview Statistics (3 Cards, Single Row) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Tổng tác phẩm */}
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-meta text-stone-500 uppercase tracking-wider font-semibold">
                  Tổng tác phẩm
                </span>
                <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                  <AnimatedNumber value={counts.all} ready={Boolean(projectsQuery.data)} />
                </span>
                <span className="text-meta text-stone-500 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600 inline-block"></span>
                  Tất cả dự án sáng tác
                </span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-primary-600/10 flex items-center justify-center text-primary-600 shrink-0">
                <span className="material-symbols-outlined text-[24px]">auto_stories</span>
              </div>
            </div>

            {/* Card 2: Tổng lượt đọc */}
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-meta text-stone-500 uppercase tracking-wider font-semibold">
                  Tổng lượt đọc
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                    <AnimatedNumber value={totalReads} ready={Boolean(projectsQuery.data)} format={value => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value)} />
                  </span>
                </div>
                <span className="text-meta text-stone-500 mt-0.5">Lượt đọc tích lũy từ các tác phẩm</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
                <span className="material-symbols-outlined text-[24px]">visibility</span>
              </div>
            </div>

            {/* Card 3: Chương đã xuất bản */}
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-2xs border border-stone-200/80 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-meta text-stone-500 uppercase tracking-wider font-semibold">
                  Chương đã xuất bản
                </span>
                <span className="font-headline-sm text-2xl font-bold text-stone-900 leading-none">
                  <AnimatedNumber value={totalChapters} ready={Boolean(projectsQuery.data)} />
                </span>
                <span className="text-meta text-stone-500 flex items-center gap-1 mt-0.5">
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
                <span className="px-2.5 py-0.5 rounded-full bg-stone-200/80 text-stone-700 text-meta font-semibold">
                  {filteredProjects.length} tác phẩm
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="project-sort" className="text-form-label text-stone-500">Sắp xếp</label>
                <select id="project-sort" value={sortOrder} onChange={event => setSortOrder(event.target.value as ProjectSort)} className="bg-surface-container-lowest border border-stone-200 rounded-lg px-3 py-2 text-body text-stone-700">
                  <option value="updated">Mới cập nhật</option>
                  <option value="created-desc">Mới tạo</option>
                  <option value="created-asc">Tạo lâu nhất</option>
                  <option value="title-asc">Tên A–Z</option>
                  <option value="title-desc">Tên Z–A</option>
                  <option value="views">Lượt đọc nhiều nhất</option>
                  <option value="chapters">Số chương nhiều nhất</option>
                </select>
              </div>
            </div>

            {/* Filter Toolbar Row */}
            <div className="bg-surface-container-lowest rounded-xl px-3 py-2.5 shadow-2xs border border-stone-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[220px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-workspace-search placeholder="Tìm kiếm tác phẩm theo tên..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-stone-50/80 text-meta text-stone-900 placeholder:text-stone-400 border border-stone-200/80 focus:outline-none focus:bg-surface-container-lowest focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
                />
              </div>

              {/* Filters & View Mode */}
              <div className="flex flex-wrap items-center gap-2.5 min-w-0 max-w-full">
                {/* Status Segmented Buttons */}
                <div className="sc-filter-tabs flex items-center bg-stone-100 p-0.5 rounded-lg text-meta font-medium">
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
                    className="appearance-none bg-stone-50/80 hover:bg-stone-50 border border-stone-200/80 text-stone-700 text-meta py-1.5 pl-3 pr-7 rounded-lg focus:outline-none focus:border-primary-600 cursor-pointer transition-colors"
                  >
                    <option value="ALL">Tất cả thể loại</option>
                    {genres.map((genre) => (
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
                        ? 'bg-surface-container-lowest text-primary-600 shadow-xs'
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
                        ? 'bg-surface-container-lowest text-primary-600 shadow-xs'
                        : 'text-stone-400 hover:text-stone-700'
                    }`}
                    title="Danh sách"
                  >
                    <span className="material-symbols-outlined text-[18px]">view_list</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="sc-workspace-row">
              <label className="text-meta"><input type="checkbox" checked={onlyPinned} onChange={e => setOnlyPinned(e.target.checked)} /> Chỉ tác phẩm đã ghim</label>
              <FilterPresets name="author-projects" fields={['q', 'status', 'sort', 'genre', 'pinned']} />
            </div>
            {recentIds.some(id => projects.some(p => p.novelId === id)) && <details className="sc-filter-presets"><summary>Vừa làm việc</summary><div className="sc-workspace-row">{recentIds.map(id => projects.find(p => p.novelId === id)).filter((p): p is Novel => Boolean(p)).slice(0, 5).map(project => <Link className="sc-workspace-button" key={project.novelId} to={`/author/novels/${project.novelId}`}>{project.title}</Link>)}</div></details>}
            <ActiveFilterChips items={[
              ...(onlyPinned ? [{ id: 'pinned', label: 'Đã ghim', onRemove: () => setOnlyPinned(false) }] : []),
              ...(searchQuery.trim() ? [{ id: 'q', label: `Tìm: ${searchQuery.trim()}`, onRemove: () => setSearchQuery('') }] : []),
              ...(selectedStatusTab !== 'ALL' ? [{ id: 'status', label: selectedStatusTab === 'DRAFT' ? 'Bản nháp' : selectedStatusTab === 'COMPLETED' ? 'Hoàn thành' : 'Đang sáng tác', onRemove: () => setSelectedStatusTab('ALL') }] : []),
              ...(selectedGenre !== 'ALL' ? [{ id: 'genre', label: `Thể loại: ${selectedGenre}`, onRemove: () => setSelectedGenre('ALL') }] : [])
            ]} />
            {/* Loading / Error States */}
            {projectsQuery.isLoading && (
              <LoadingState label="Đang tải danh sách tác phẩm…" variant="cards" />
            )}

            {projectsQuery.isError && (
              <div className="p-8 bg-surface-container-lowest rounded-xl border border-rose-200 flex flex-col items-center justify-center gap-2 text-center">
                <span className="material-symbols-outlined text-rose-500 text-3xl">error</span>
                <p className="text-meta font-semibold text-stone-800">Không thể tải danh sách tác phẩm</p>
                <button
                  type="button"
                  onClick={() => projectsQuery.refetch()}
                  className="mt-2 px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-meta font-medium text-stone-700"
                >
                  Thử lại
                </button>
              </div>
            )}

            <ResultsSurface identity={[searchQuery, selectedStatusTab, selectedGenre, sortOrder, projectsQuery.dataUpdatedAt].join('|')} retain={Boolean(searchQuery.trim() || selectedStatusTab !== 'ALL' || selectedGenre !== 'ALL')} busy={projectsQuery.isFetching}>
            {/* Empty State */}
            {!projectsQuery.isLoading && !projectsQuery.isError && filteredProjects.length === 0 && (
              <SuggestionReveal><div className="p-12 bg-surface-container-lowest rounded-xl border border-stone-200/80 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                  <span className="material-symbols-outlined text-[28px]">menu_book</span>
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <h3 className="text-body font-bold text-stone-900">Chưa có tác phẩm phù hợp</h3>
                  <p className="text-meta text-stone-500">
                    {searchQuery.trim()
                      ? 'Không tìm thấy tác phẩm nào khớp với từ khóa tìm kiếm.'
                      : 'Tạo tác phẩm đầu tiên.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  Tạo tác phẩm đầu tiên
                </button>
              </div></SuggestionReveal>
            )}

            {/* Novel Cards: Grid View (Strict 3 columns on desktop) */}
            <ProjectLayout>
            {viewMode === 'grid' && (
              <AnimatedCollection key="grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-4.5">
                {filteredProjects.map((project) => {
                  const cover = project.coverImageUrl;
                  const statusLabel =
                    project.status === 'DRAFT'
                      ? 'Bản nháp'
                      : project.status === 'PENDING_MODERATION'
                      ? 'Chờ duyệt'
                      : project.serialStatus === 'COMPLETED'
                      ? 'Hoàn thành'
                      : 'Đang sáng tác';

                  const isMenuOpen = activeMenuNovelId === project.novelId;

                  const readsFormatted = (project.viewsCount ?? 0).toLocaleString('vi-VN');

                  return (
                    <ProjectMotionCard id={project.novelId}
                      key={project.novelId}
                      className={`sc-novel-card bg-surface-container-lowest rounded-xl p-3.5 shadow-2xs hover:shadow-sm border border-stone-200/90 transition-all flex flex-col justify-between h-full group ${updated.has(project.novelId) ? 'sc-item-updated' : ''}`}
                    >
                      <div className="flex gap-3.5 items-start">
                        {/* Left: Compact vertical novel cover (approx 96px wide, fixed 2:3 aspect ratio) */}
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="sc-cover-hover relative w-[96px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-stone-100 border border-stone-200/70 block group-hover:opacity-95 transition-opacity"
                        >
                          {cover ? <LoadedImage src={cover} alt={project.title} className="w-full h-full object-cover  transition-transform duration-300" /> : <span className="flex h-full items-center justify-center p-2 text-center text-meta text-stone-500">{project.title}</span>}
                        </Link>

                        {/* Right: Novel Info (Title, Status, Genre, Stats, Updated time) */}
                        <div className="flex flex-col flex-1 min-w-0 justify-between self-stretch py-0.5">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-meta font-medium text-stone-500 truncate">
                                {project.genre || 'Chưa phân loại'}
                              </span>
                              <span
                                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap ${
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
                              className="text-body font-bold text-stone-900 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors"
                              title={project.title}
                            >
                              {project.title}
                            </Link>

                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1.5 text-meta text-stone-600 whitespace-nowrap">
                              <span className="material-symbols-outlined text-[15px] text-primary-600">menu_book</span>
                              <span><strong>{project.chaptersCount || 0}</strong> chương</span>
                              <span className="text-stone-300">•</span>
                              <span className="material-symbols-outlined text-[15px] text-stone-400">visibility</span>
                              <span><strong>{readsFormatted}</strong> đọc</span>
                            </div>

                            <div className="flex items-center gap-1 text-meta text-stone-400">
                              <span className="material-symbols-outlined text-table">update</span>
                              <span className="truncate">{project.latestChapter ? `Ch. ${project.latestChapter.chapterNumber}: ${project.latestChapter.title} · Sửa` : 'Cập nhật:'} {formatTimeAgo(project.latestChapter?.updatedAt ?? project.updatedAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Footer */}
                      <div className="mt-3.5 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-1.5 relative">
                        <ProjectPin title={project.title} active={pinnedIds.includes(project.novelId)} onClick={() => togglePin(project.novelId)} />
                        <button type="button" className="sc-project-pin" aria-label={`Xem nhanh ${project.title}`} title="Xem nhanh tác phẩm" onClick={() => setPreviewId(project.novelId)}><span className="material-symbols-outlined" aria-hidden="true">visibility</span></button>
                        <div className="flex items-center gap-1.5 flex-1">
                          <Link
                            to={`/author/novels/${project.novelId}`}
                            className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-meta font-medium text-stone-700 border border-stone-200/80 shadow-2xs transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">settings</span>
                            <span>Quản lý</span>
                          </Link>

                          {project.serialStatus === 'COMPLETED' ? (
                            <Link
                              to={`/public/novels/${project.novelId}`}
                              className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-meta font-semibold shadow-2xs transition-colors"
                            >
                              <span className="material-symbols-outlined text-[15px]">visibility</span>
                              <span>Xem tác phẩm</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openIde(project.novelId)}
                              className="inline-flex items-center justify-center gap-1 flex-1 py-1 px-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-colors cursor-pointer"
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
                            <div className="absolute right-0 bottom-full mb-1.5 w-44 bg-surface-container-lowest rounded-lg shadow-sm border border-stone-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                              <Link
                                to={`/author/context/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-meta text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px] text-primary-500">
                                  menu_book
                                </span>
                                <span>Cẩm nang bối cảnh</span>
                              </Link>
                              <Link
                                to={`/author/import/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-meta text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                  file_upload
                                </span>
                                <span>Nhập bản thảo</span>
                              </Link>
                              <Link
                                to={`/public/novels/${project.novelId}`}
                                className="w-full px-3 py-1.5 text-left text-meta text-stone-700 hover:bg-stone-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
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
                    </ProjectMotionCard>
                  );
                })}
              </AnimatedCollection>
            )}

            {/* Novel Cards: List View */}
            {viewMode === 'list' && (
              <AnimatedCollection key="list" className="bg-surface-container-lowest rounded-xl shadow-2xs border border-stone-200/80 overflow-hidden divide-y divide-stone-100">
                {filteredProjects.map((project) => {
                  const cover = project.coverImageUrl;
                  const statusLabel =
                    project.status === 'DRAFT'
                      ? 'Bản nháp'
                      : project.status === 'PENDING_MODERATION'
                      ? 'Chờ duyệt'
                      : project.serialStatus === 'COMPLETED'
                      ? 'Hoàn thành'
                      : 'Đang sáng tác';

                  return (
                    <ProjectMotionCard id={project.novelId} as="div"
                      key={project.novelId}
                      className="p-3.5 hover:bg-stone-50/70 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="sc-cover-hover relative w-12 aspect-[2/3] shrink-0 rounded overflow-hidden bg-stone-100 border border-stone-200/60 block"
                        >
                          {cover ? <LoadedImage src={cover} alt={project.title} className="w-full h-full object-cover" /> : <span className="flex h-full items-center justify-center text-meta text-stone-500">{project.title.slice(0, 1)}</span>}
                        </Link>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/author/novels/${project.novelId}`}
                              className="text-meta font-bold text-stone-900 hover:text-primary-600 truncate transition-colors"
                            >
                              {project.title}
                            </Link>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap ${
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
                          <p className="text-meta text-stone-500 font-normal mt-0.5 truncate">
                            {project.genre || 'Chưa phân loại'}
                          </p>
                          <div className="flex items-center gap-2 text-meta text-stone-400 mt-0.5">
                            <span>
                              {project.chaptersCount || 0} chương •{' '}
                              {(project.viewsCount ?? 0).toLocaleString('vi-VN')}{' '}
                              lượt đọc
                            </span>
                            <span>•</span>
                            <span>
                              {project.latestChapter ? `Ch. ${project.latestChapter.chapterNumber}: ${project.latestChapter.title} · Sửa` : 'Cập nhật:'} {formatTimeAgo(project.latestChapter?.updatedAt ?? project.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <ProjectPin title={project.title} active={pinnedIds.includes(project.novelId)} onClick={() => togglePin(project.novelId)} />
                        <button type="button" className="sc-project-pin" aria-label={`Xem nhanh ${project.title}`} title="Xem nhanh tác phẩm" onClick={() => setPreviewId(project.novelId)}><span className="material-symbols-outlined" aria-hidden="true">visibility</span></button>
                        <Link
                          to={`/author/novels/${project.novelId}`}
                          className="px-2.5 py-1 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200/80 text-meta font-medium text-stone-700 shadow-2xs transition-colors"
                        >
                          Quản lý
                        </Link>
                        {project.serialStatus === 'COMPLETED' ? (
                          <Link
                            to={`/public/novels/${project.novelId}`}
                            className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-meta font-semibold shadow-2xs transition-colors"
                          >
                            Xem tác phẩm
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openIde(project.novelId)}
                            className="px-3 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-meta font-semibold shadow-2xs transition-colors cursor-pointer"
                          >
                            Viết tiếp
                          </button>
                        )}
                      </div>
                    </ProjectMotionCard>
                  );
                })}
              </AnimatedCollection>
            )}
            </ProjectLayout>
            </ResultsSurface>
          </section>

        </div>
      </main>
      <WorkspacePreview selected={previewId} onSelect={setPreviewId} records={filteredProjects.map(project => ({ id: project.novelId, title: project.title, to: `/author/novels/${project.novelId}`, fields: [['Giới thiệu', project.synopsis || 'Chưa có giới thiệu'], ['Thể loại', project.genres?.join(', ') || project.genre || 'Chưa phân loại'], ['Chương', String(project.chaptersCount ?? 0)], ['Lượt đọc', (project.viewsCount ?? 0).toLocaleString('vi-VN')], ['Cập nhật', formatTimeAgo(project.latestChapter?.updatedAt ?? project.updatedAt)]] }))} />

      {/* ──────────────────────────────────────────
          3. Create Novel Modal Dialog
         ────────────────────────────────────────── */}
      {createModalOpen && (
        <AuthorDialog onClose={() => setCreateModalOpen(false)}><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-sm border border-stone-200/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-surface-subtle border-b border-primary-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-600 text-[22px]">menu_book</span>
                <h3 className="text-body font-bold text-stone-900">Tạo tác phẩm mới</h3>
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
                if (!coverUpload.isPending && !coverToCrop) createProjectMutation.mutate();
              }}
              className="p-5 flex flex-col gap-4"
            >
              {/* Field 1: Tên tác phẩm */}
              <div className="flex flex-col gap-1.5">
                <label className="text-meta font-bold text-stone-900">
                  Tên tác phẩm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Tên tác phẩm"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low text-meta text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-primary-600 focus:bg-surface-container-lowest border-0 transition-colors"
                />
                <p className="text-meta text-stone-500">
                  Vui lòng nhập tên tác phẩm (tối thiểu 2 ký tự)
                </p>
              </div>

              {/* Field 2: Thể loại chính (dropdown menu) */}
              <div className="flex flex-col gap-1.5 relative" ref={genreDropdownRef}>
                <label className="text-meta font-bold text-stone-900">
                  Thể loại chính
                </label>
                <button
                  type="button"
                  onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low text-meta text-stone-900 font-medium flex items-center justify-between hover:bg-surface-container focus:outline-none focus:ring-1 focus:ring-primary-600 transition-colors cursor-pointer text-left"
                >
                  <span>{newGenre || 'Chọn thể loại'}</span>
                  <span
                    className={`material-symbols-outlined text-stone-500 text-[20px] transition-transform duration-200 ${
                      isGenreDropdownOpen ? 'rotate-180 text-primary-600' : ''
                    }`}
                  >
                    expand_more
                  </span>
                </button>

                {isGenreDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface-container-lowest rounded-xl shadow-sm border border-stone-200/90 py-1.5 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    {genres.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          setNewGenre(genre);
                          setIsGenreDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-meta flex items-center justify-between transition-colors cursor-pointer ${
                          newGenre === genre
                            ? 'bg-primary-50 text-primary-600 font-semibold'
                            : 'text-stone-700 hover:bg-surface-subtle'
                        }`}
                      >
                        <span>{genre}</span>
                        {newGenre === genre && (
                          <span className="material-symbols-outlined text-[16px] text-primary-600">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <input type="text" value={newGenre} onChange={(e) => setNewGenre(e.target.value)} maxLength={100} placeholder="Hoặc nhập thể loại mới" className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low text-meta text-stone-900" />
                {genresQuery.isError && <span className="text-meta text-red-600">Không tải được danh sách thể loại; bạn vẫn có thể nhập thể loại mới.</span>}
              </div>

              {/* Field 3: Giới thiệu ngắn */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-meta font-bold text-stone-900">Giới thiệu ngắn</label>
                  <span className="text-meta text-stone-400 font-normal">Tối thiểu 10 ký tự</span>
                </div>
                <textarea
                  rows={3}
                  value={newSynopsis}
                  onChange={(e) => setNewSynopsis(e.target.value)}
                  placeholder="Giới thiệu tác phẩm"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low text-meta text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-primary-600 focus:bg-surface-container-lowest border-0 resize-none transition-colors leading-relaxed"
                />
              </div>

              {/* Field 4: Ảnh bìa tác phẩm */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-meta font-bold text-stone-900">Ảnh bìa tác phẩm</label>
                  <span className="text-meta text-stone-400 font-normal">Tùy chọn</span>
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
                      setCoverToCrop(file);
                    }
                  }}
                  className={`rounded-xl p-3 flex items-center justify-between gap-3 transition-colors ${
                    isCoverDragging
                      ? 'bg-primary-100 border-2 border-dashed border-primary-600'
                      : 'bg-surface-container-low border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-12 h-12 rounded-lg bg-surface-container text-primary-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {newCoverUrl ? (
                        <ImageLightbox src={newCoverUrl} alt="Ảnh bìa tác phẩm" className="sc-image-preview-fill"><LoadedImage src={newCoverUrl} alt="Cover Preview" className="w-full h-full object-cover" /></ImageLightbox>
                      ) : (
                        <span className="material-symbols-outlined text-[24px]">photo_library</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-meta font-semibold text-stone-800 truncate">
                        {coverUpload.isPending ? 'Đang tải ảnh…' : newCoverUrl ? 'Đã chọn ảnh bìa' : 'Kéo thả ảnh hoặc tải lên'}
                      </p>
                      <p className="text-meta text-stone-500 truncate">
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
                        setCoverToCrop(file);
                      }
                      e.target.value = '';
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
                      className="px-3.5 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-stone-50 border border-stone-200/80 text-stone-700 text-meta font-medium shadow-2xs transition-colors cursor-pointer"
                    >
                      Chọn ảnh
                    </button>
                  </div>
                </div>
              </div>

              {coverToCrop && <CoverCropEditor file={coverToCrop} onCancel={() => setCoverToCrop(null)} onConfirm={async file => { await coverUpload.mutateAsync(file); setCoverToCrop(null); }} />}
              {/* Info Notice Box */}
              <div className="rounded-xl bg-primary-50 p-2.5 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary-600 text-[18px] shrink-0 mt-0.5">
                  info
                </span>
                <p className="text-meta text-stone-600 leading-relaxed">
                  Tác phẩm mới sẽ được lưu dưới dạng bản nháp riêng tư. Bạn có thể thay đổi trạng thái sau.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-stone-700 font-semibold text-meta cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending || coverUpload.isPending || !!coverToCrop || newTitle.trim().length < 2}
                  className="px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold text-meta shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {createProjectMutation.isPending && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <span>Tạo tác phẩm</span>
                </button>
              </div>
            </form>
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          Toast Notification
         ────────────────────────────────────────── */}
    </div>
  );
}
