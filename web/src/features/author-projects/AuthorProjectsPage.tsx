import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { createChapter, createNovel, listChapters, listMyNovels } from '../novels/novel-api';
import type { ChapterStatus, Novel, NovelStatus } from '../novels/novel-types';
import { AppSelect } from '../../shared/components/AppSelect';
import { AppTopBar } from '../../shared/components/AppTopBar';
import { fallbackCover, primaryButton, secondaryButton } from '../../shared/components/ui-classes';

const statusOptions: Array<{ value: NovelStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'PENDING_MODERATION', label: 'Chờ duyệt' },
  { value: 'PUBLISHED', label: 'Đã xuất bản' },
  { value: 'REJECTED', label: 'Bị từ chối' }
];

const novelStatusStyles: Record<NovelStatus, { label: string; className: string }> = {
  PUBLISHED: { label: 'Đã xuất bản', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PENDING_MODERATION: { label: 'Chờ duyệt', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  REJECTED: { label: 'Bị từ chối', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  DRAFT: { label: 'Bản nháp', className: 'bg-stone-100 text-stone-700 border-stone-200' }
};

const chapterStatusLabels: Record<ChapterStatus, string> = {
  PUBLISHED: 'Đã xuất bản',
  DRAFT: 'Nháp',
  PENDING_MODERATION: 'Chờ duyệt',
  REJECTED: 'Bị từ chối',
  ARCHIVED: 'Lưu trữ'
};

const serialStatusLabels: Record<Novel['serialStatus'], string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Đã hoàn thành',
  HIATUS: 'Tạm ngưng'
};

const ageRatingLabels: Record<Novel['ageRating'], string> = {
  EVERYONE: 'Mọi lứa tuổi',
  TEEN: '16+',
  MATURE: '18+'
};

const starterContent = 'Start writing your chapter draft here.';

export function AuthorProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<NovelStatus | 'ALL'>('ALL');
  const projectsQuery = useQuery({
    queryKey: ['author-projects', searchQuery, status],
    queryFn: () => listMyNovels({ searchQuery, status })
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const novel = await createNovel({
        title: 'Untitled Novel',
        synopsis: 'A starter synopsis for a new author project.',
        genre: 'Fantasy',
        tags: []
      });
      const chapter = await createChapter(novel.novelId, {
        title: 'Chapter 1',
        content: starterContent,
        isVip: false,
        priceCoins: 0
      });
      return { novel, chapter };
    },
    onSuccess: async ({ novel, chapter }) => {
      localStorage.setItem('ephurin_author_novel_id', novel.novelId);
      localStorage.setItem('ephurin_author_chapter_id', chapter.chapterId);
      await queryClient.invalidateQueries({ queryKey: ['author-projects'] });
      openIdeTab({ novelId: novel.novelId, chapterId: chapter.chapterId });
    }
  });

  const continueWriting = () => {
    const novelId = localStorage.getItem('ephurin_author_novel_id');
    const chapterId = localStorage.getItem('ephurin_author_chapter_id');
    if (!novelId) {
      navigate('/author/ide');
      return;
    }
    openIdeTab({ novelId, chapterId: chapterId ?? undefined });
  };

  const projects = projectsQuery.data ?? [];
  const isEmpty = !projectsQuery.isLoading && !projectsQuery.isError && !projects.length;

  return (
    <div className="min-h-screen bg-[#f7f6f2] font-body-md text-stone-800 antialiased selection:bg-primary-100 selection:text-primary-800 flex flex-col">
      <AppTopBar active="works" onWrite={continueWriting} />

      <main className="w-full pt-14 flex-1">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 w-full py-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="font-headline-sm text-[24px] leading-snug text-stone-900 font-bold tracking-tight">
                Tác phẩm của tôi
              </h1>
              <p className="text-[13px] text-stone-500 mt-0.5">
                Quản lý các dự án truyện trước khi mở trong Studio viết.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/reader')} className={secondaryButton} type="button">
                <span className="material-symbols-outlined text-[16px] text-stone-400">auto_stories</span>
                <span>Chế độ độc giả</span>
              </button>
              <button
                onClick={() => createProjectMutation.mutate()}
                disabled={createProjectMutation.isPending}
                className={primaryButton}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>{createProjectMutation.isPending ? 'Đang tạo...' : 'Tạo tác phẩm mới'}</span>
              </button>
            </div>
          </div>

          <div className="w-full bg-white rounded-xl p-3.5 shadow-2xs border border-stone-200/80 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-stone-400 pointer-events-none">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#f9f8f4] text-stone-900 placeholder:text-stone-400 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 border border-stone-200"
                placeholder="Tìm theo tên tác phẩm..."
                type="text"
                aria-label="Tìm tác phẩm"
              />
            </div>
            <AppSelect
              value={status}
              options={statusOptions}
              onChange={setStatus}
              ariaLabel="Lọc theo trạng thái"
              icon="filter_list"
            />
          </div>

          {projectsQuery.isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-stone-500">Đang tải danh sách tác phẩm...</p>
            </div>
          ) : null}

          {projectsQuery.isError ? (
            <div className="py-12 flex flex-col items-center text-center bg-white rounded-xl border border-stone-200/80">
              <span className="material-symbols-outlined text-rose-500 text-[40px] mb-1">error</span>
              <p className="text-sm font-semibold text-stone-900">Không tải được danh sách tác phẩm</p>
              <p className="text-xs text-stone-500 mt-1 max-w-md">
                {projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Đã có lỗi xảy ra.'}
              </p>
              <button onClick={() => void projectsQuery.refetch()} className={`${secondaryButton} mt-4`} type="button">
                Thử lại
              </button>
            </div>
          ) : null}

          {isEmpty ? (
            <div className="py-14 flex flex-col items-center text-center bg-white rounded-xl border border-stone-200/80">
              <span className="material-symbols-outlined text-primary-600 text-[40px] mb-1">menu_book</span>
              <p className="text-sm font-semibold text-stone-900">Chưa có tác phẩm nào</p>
              <p className="text-xs text-stone-500 mt-1 max-w-md">
                Tạo tác phẩm đầu tiên, rồi mở trong Studio để bắt đầu viết chương.
              </p>
              <button
                onClick={() => createProjectMutation.mutate()}
                disabled={createProjectMutation.isPending}
                className={`${primaryButton} mt-4`}
                type="button"
              >
                Tạo tác phẩm đầu tiên
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.novelId} project={project} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ProjectCard({ project }: { project: Novel }) {
  const chaptersQuery = useQuery({
    queryKey: ['author-project-health', project.novelId],
    queryFn: () => listChapters(project.novelId)
  });
  const chapters = chaptersQuery.data ?? [];
  const statusCounts = chapters.reduce<Partial<Record<ChapterStatus, number>>>((counts, chapter) => {
    counts[chapter.status] = (counts[chapter.status] ?? 0) + 1;
    return counts;
  }, {});
  const novelStatus = novelStatusStyles[project.status];

  const openInIde = () => {
    localStorage.setItem('ephurin_author_novel_id', project.novelId);
    localStorage.removeItem('ephurin_author_chapter_id');
    openIdeTab({ novelId: project.novelId });
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-2xs border border-stone-200/80 hover:border-stone-300 transition-colors flex flex-col gap-3.5">
      <div className="flex gap-3.5 min-w-0">
        <Link
          to={`/author/novels/${project.novelId}`}
          className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-stone-200"
        >
          <img alt={project.title} className="w-full h-full object-cover" src={project.coverImageUrl || fallbackCover} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`font-label-sm text-[11px] font-semibold px-2 py-0.5 rounded-full border ${novelStatus.className}`}>
              {novelStatus.label}
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-[12px] text-stone-500">{serialStatusLabels[project.serialStatus]}</span>
            <span className="text-stone-300">•</span>
            <span className="text-[12px] text-stone-500">{ageRatingLabels[project.ageRating]}</span>
          </div>
          <Link
            to={`/author/novels/${project.novelId}`}
            className="block font-headline-sm text-[16px] leading-snug text-stone-900 hover:text-primary-700 font-semibold truncate transition-colors"
          >
            {project.title}
          </Link>
          <p className="text-[13px] text-stone-600 leading-relaxed line-clamp-2 mt-0.5">{project.synopsis}</p>
        </div>
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px] text-stone-500">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[15px] text-stone-400">library_books</span>
          <span>
            <strong className="text-stone-800 font-semibold">{project.chaptersCount}</strong> chương
          </span>
        </span>
        {(Object.entries(statusCounts) as Array<[ChapterStatus, number]>).map(([chapterStatus, count]) => (
          <span key={chapterStatus}>
            {chapterStatusLabels[chapterStatus]}: <span className="text-stone-700 font-medium">{count}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-stone-100 flex-wrap">
        <button onClick={openInIde} className={primaryButton} type="button">
          <span className="material-symbols-outlined text-[16px]">edit_note</span>
          <span>Mở Studio</span>
        </button>
        <Link to={`/author/novels/${project.novelId}`} className={secondaryButton}>
          <span className="material-symbols-outlined text-[16px] text-stone-400">info</span>
          <span>Thông tin</span>
        </Link>
        <Link to={`/author/context/${project.novelId}`} className={secondaryButton} title="Cẩm nang (Story Bible)">
          <span className="material-symbols-outlined text-[16px] text-primary-600">auto_stories</span>
          <span>Cẩm nang</span>
        </Link>
        <Link to={`/author/import/${project.novelId}`} className={secondaryButton} title="Nhập bản thảo">
          <span className="material-symbols-outlined text-[16px] text-stone-400">file_upload</span>
          <span>Nhập</span>
        </Link>
      </div>
    </div>
  );
}

function openIdeTab(context: { novelId: string; chapterId?: string }) {
  const params = new URLSearchParams({ novelId: context.novelId });
  if (context.chapterId) params.set('chapterId', context.chapterId);
  window.open(`/author/ide?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
