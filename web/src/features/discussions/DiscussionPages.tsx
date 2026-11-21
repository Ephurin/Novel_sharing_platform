import { Alert, Avatar, Button, Group, Select, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import {
  IconArrowLeft, IconArrowRight, IconFeather, IconChevronDown, IconChevronRight, IconEye, IconHelp,
  IconLayoutList, IconLock, IconMessage2, IconMessages, IconPencil, IconPin, IconSearch, IconSpeakerphone,
  IconThumbUp
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { adminGet, type Access } from '../admin/admin-operations-api';
import { useAuthStore } from '../auth/useAuthStore';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';
import { DiscussionComposer } from './DiscussionComposer';
import {
  createTopic, getTopic, listCategories, listOwnTopics, listTopics, updateTopic,
  type Category, type Topic, type TopicDraft, type TopicSort
} from './discussion-api';

const SORTS: Array<{ value: TopicSort; label: string }> = [
  { value: 'activity', label: 'Hoạt động gần đây' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'replies', label: 'Nhiều trả lời' }
];
const TITLE_MIN = 3, TITLE_MAX = 200, BODY_MAX = 20000;
const RELATIVE = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];

/** Icon + one-line explanation for a category, resolved from the live category list. */
const CATEGORY_GUIDE: Record<string, { icon: ReactNode; hint: string }> = {
  'thao-luan-chung': {
    icon: <IconMessages size={18} aria-hidden="true" />,
    hint: 'Giao lưu và chia sẻ với cộng đồng.'
  },
  'hoi-dap': {
    icon: <IconHelp size={18} aria-hidden="true" />,
    hint: 'Hỏi về sáng tác và cách dùng StoryCraft.'
  },
  'goc-tac-gia': {
    icon: <IconFeather size={18} aria-hidden="true" />,
    hint: 'Chia sẻ kỹ thuật viết và xây dựng thế giới.'
  }
};

const ANNOUNCEMENT_GUIDE = {
  icon: <IconSpeakerphone size={18} aria-hidden="true" />,
  hint: 'Bảng tin do quản trị viên đăng tải.'
};

function guideFor(category: Category) {
  if (category.postAdminOnly) return ANNOUNCEMENT_GUIDE;
  return CATEGORY_GUIDE[category.slug] ?? { icon: <IconLayoutList size={18} aria-hidden="true" />, hint: category.name };
}

function validDate(value: string | null | undefined) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function fmtTime(value: string) { const d = validDate(value); return d ? d.toLocaleString('vi-VN') : '—'; }
function relTime(value: string) {
  const d = validDate(value);
  if (!d) return '—';
  const diff = Math.round((d.getTime() - Date.now()) / 1000);
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return RELATIVE.format(Math.round(diff / secs), unit);
  return RELATIVE.format(diff, 'second');
}
function authorName(a: { displayName: string | null } | null) { return a?.displayName?.trim() || 'Ẩn danh'; }

/** Collapse markdown/whitespace into a single plain line for the compact preview. */
function plainPreview(body: string) {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function TopicRow({ topic }: { topic: Topic }) {
  const author = authorName(topic.author);
  const preview = plainPreview(topic.body);
  const hidden = topic.status !== 'VISIBLE';
  const lastUser = topic.lastActivityUser ? authorName(topic.lastActivityUser) : null;
  const className = ['forum-row', hidden ? 'forum-row-static' : ''].filter(Boolean).join(' ');

  const inner = (
    <>
      <Avatar src={topic.author?.avatarUrl ?? undefined} name={author} size={40} radius="xl"
        className="forum-row-avatar" data-role={topic.author?.role === 'AUTHOR' ? 'author' : undefined}
        aria-hidden="true" />
      <span className="forum-row-main">
        <span className="forum-row-title">
          {topic.title}
          {topic.isPinned ? <span className="forum-badge" data-tone="accent"><IconPin size={11} aria-hidden="true" /> Ghim</span> : null}
          {topic.isLocked ? <span className="forum-badge" data-tone="muted"><IconLock size={11} aria-hidden="true" /> Đã khóa</span> : null}
          {hidden ? <span className="forum-badge" data-tone="muted">{topic.status === 'HIDDEN' ? 'Đã ẩn' : 'Đã xóa'}</span> : null}
        </span>
        {preview ? <span className="forum-preview">{preview}</span> : null}
        <span className="forum-row-meta">
          <span className="forum-row-author">{author}</span>
          <span className="forum-row-cat forum-badge" data-category={topic.category.slug}>
            {topic.category.name}
          </span>
          <span className="forum-row-stats">
            <span title={`${topic.viewCount} lượt xem`}><IconEye size={13} aria-hidden="true" />
              <span className="forum-visually-hidden">Lượt xem: </span>{topic.viewCount}</span>
            <span title={`${topic.replyCount} trả lời`}><IconMessage2 size={13} aria-hidden="true" />
              <span className="forum-visually-hidden">Trả lời: </span>{topic.replyCount}</span>
            <span title={`${topic.likeCount} lượt thích`}><IconThumbUp size={13} aria-hidden="true" />
              <span className="forum-visually-hidden">Thích: </span>{topic.likeCount}</span>
          </span>
        </span>
      </span>
      <span className="forum-row-side">
        <span className="forum-row-side-text">
          <time dateTime={validDate(topic.lastActivityAt)?.toISOString()} title={fmtTime(topic.lastActivityAt)}>
            {relTime(topic.lastActivityAt)}
          </time>
          {lastUser && lastUser !== author ? <span className="forum-row-side-user">bởi {lastUser}</span> : null}
        </span>
        {hidden ? null : <IconChevronRight size={16} className="forum-row-chevron" aria-hidden="true" />}
      </span>
    </>
  );

  if (hidden) {
    return (
      <div className={className} data-pinned={topic.isPinned || undefined}
        data-category={topic.category.slug} data-announce={topic.category.postAdminOnly || undefined}>
        {inner}
      </div>
    );
  }

  return (
    <Link to={`/discussions/${topic.topicId}`} className={className} data-pinned={topic.isPinned || undefined}
      data-category={topic.category.slug} data-announce={topic.category.postAdminOnly || undefined}>
      {inner}
    </Link>
  );
}

function RowList({ items }: { items: Topic[] }) {
  return (
    <div className="forum-list" role="list">
      {items.map(topic => <div role="listitem" key={topic.topicId}><TopicRow topic={topic} /></div>)}
    </div>
  );
}

function Pager({ hasPrev, hasNext, onPrev, onNext }: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <nav className="forum-pagination" aria-label="Phân trang chủ đề">
      <Button variant="default" size="xs" leftSection={<IconArrowLeft size={14} aria-hidden="true" />} disabled={!hasPrev} onClick={onPrev}>Trước</Button>
      <Button variant="default" size="xs" rightSection={<IconArrowRight size={14} aria-hidden="true" />} disabled={!hasNext} onClick={onNext}>Sau</Button>
    </nav>
  );
}

function CategorySidebar({ categories, active, onSelect }: { categories: Category[]; active?: string; onSelect: (slug?: string) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  function select(slug?: string) {
    onSelect(slug);
    setOpen(false);
    if (toggle.current?.getClientRects().length) toggle.current.focus();
  }
  if (!categories.length) return null;
  const selected = categories.find(category => category.slug === active);
  return (
    <aside className="forum-categories" aria-label="Danh mục thảo luận">
      <button ref={toggle} type="button" className="forum-categories-toggle" aria-expanded={open} aria-controls="forum-category-options"
        onClick={() => setOpen(v => !v)}>
        <IconLayoutList size={15} aria-hidden="true" />
        <span className="forum-categories-toggle-label">{selected?.name ?? 'Chuyên mục'}</span>
        <IconChevronDown size={15} className="forum-categories-toggle-caret" aria-hidden="true" />
      </button>
      <div id="forum-category-options" className="forum-categories-body" data-open={open || undefined}>
        <p className="forum-categories-heading">Chuyên mục</p>
        <UnstyledButton className="forum-categories-item" aria-pressed={!active} onClick={() => select()}>
          <span className="forum-category-icon" aria-hidden="true"><IconLayoutList size={15} /></span>
          <span className="forum-categories-name">Tất cả chủ đề</span>
        </UnstyledButton>
        {categories.map(category => {
          const guide = guideFor(category);
          return (
            <UnstyledButton key={category.categoryId} className="forum-categories-item"
              data-category={category.slug} aria-pressed={active === category.slug}
              onClick={() => select(category.slug)}>
              <span className="forum-category-icon" aria-hidden="true">{guide.icon}</span>
              <span className="forum-categories-name">{category.name}</span>
              {category.postAdminOnly ? <IconLock size={12} aria-hidden="true" /> : null}
            </UnstyledButton>
          );
        })}
      </div>
    </aside>
  );
}

/** Decorative open book, drawn in flow so a CTA can never cover it. */
function CommunityArt() {
  return (
    <svg className="forum-intro-art" viewBox="0 0 132 92" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M66 21c-8.8-6.4-19.6-8.7-33.4-8.3-3 .1-5 1.8-5 4.7v46.4c0 2.6 1.7 4.1 4.3 4.1 14.4-.3 26.1 1.9 34.1 8 8-6.1 19.7-8.3 34.1-8 2.6 0 4.3-1.5 4.3-4.1V17.4c0-2.9-2-4.6-5-4.7C86 12.3 74.8 14.6 66 21Z" />
        <path d="M66 21v55" opacity=".5" />
        <g opacity=".4">
          <path d="M18 32h35M18 43h35M18 54h24M79 32h35M79 43h35M79 54h24" />
        </g>
      </g>
    </svg>
  );
}

function CommunityMasthead({ eyebrow, title, subtitle, children }: {
  eyebrow: string; title: string; subtitle: string; children?: ReactNode;
}) {
  return (
    <header className="forum-intro">
      <div className="forum-intro-copy">
        <Text className="forum-eyebrow">{eyebrow}</Text>
        <Title order={1} className="forum-intro-title">{title}</Title>
        <Text className="forum-intro-sub">{subtitle}</Text>
      </div>
      <CommunityArt />
      <div className="forum-intro-actions">{children}</div>
    </header>
  );
}

/** Compact strip for pinned topics and official announcements (first page only). */
function TopicHighlights({ items }: { items: Topic[] }) {
  if (!items.length) return null;
  return (
    <section className="forum-highlights" aria-label="Chủ đề ghim và thông báo">
      <p className="forum-highlights-heading"><IconPin size={12} aria-hidden="true" /> Ghim &amp; thông báo</p>
      <ul>
        {items.slice(0, 4).map(topic => (
          <li key={topic.topicId}>
            <Link to={`/discussions/${topic.topicId}`} className="forum-highlight" data-category={topic.category.slug}>
              <span className="forum-highlight-icon" aria-hidden="true">
                {topic.category.postAdminOnly ? <IconSpeakerphone size={13} /> : <IconPin size={13} />}
              </span>
              <span className="forum-highlight-title">{topic.title}</span>
              <span className="forum-highlight-meta">
                {topic.category.postAdminOnly ? 'Thông báo' : 'Ghim'} · {relTime(topic.lastActivityAt)}
              </span>
              <IconChevronRight size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const listKey = (params: URLSearchParams) => ['discussions', params.toString()] as const;

export function DiscussionListPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const previousCursors: string[] = location.state?.forumPrevious ?? [];
  const categories = useQuery({ queryKey: ['discussion-categories'], queryFn: () => listCategories() });
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters = {
    category: params.get('category') ?? undefined,
    q: params.get('q') ?? undefined,
    sort: SORTS.find(option => option.value === params.get('sort'))?.value ?? 'activity',
    cursor: params.get('cursor') ?? undefined,
    limit: 20
  };
  const topics = useQuery({ queryKey: [...listKey(params), user?.userId ?? 'guest'], queryFn: () => listTopics(filters) });


  const patch = useCallback((next: Record<string, string | undefined>, previous: string[] = []) => {
    const merged = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? merged.set(k, v) : merged.delete(k)));
    setParams(merged, { state: { forumPrevious: previous } });
  }, [params, setParams]);

  useEffect(() => { setQ(params.get('q') ?? ''); }, [params]);
  const hasFilters = Boolean(filters.category || filters.q);
  const activeCategory = categories.data?.find(category => category.slug === filters.category);
  const createPath = activeCategory ? `/discussions/new?categoryId=${activeCategory.categoryId}` : '/discussions/new';
  const items = topics.data?.items ?? [];
  // Pinned topics and announcements only move to the strip on an unfiltered first page, so a
  // paginated or searched view never hides a result the query asked for.
  const highlights = !filters.cursor && !filters.q
    ? items.filter(topic => topic.status === 'VISIBLE' && (topic.isPinned || topic.category.postAdminOnly))
    : [];
  const listed = highlights.length ? items.filter(topic => !highlights.includes(topic)) : items;

  return (
    <Stack className="forum-page" gap="lg">
      <CommunityMasthead eyebrow="Cộng đồng StoryCraft" title="Thảo luận"
        subtitle={activeCategory ? `Đang xem chuyên mục ${activeCategory.name}.` : 'Giao lưu, chia sẻ kinh nghiệm viết và hỏi đáp.'}>
        <Button className="forum-create" component={Link} to={user ? createPath : '/login'}
          leftSection={<IconPencil size={15} aria-hidden="true" />}>
          {user ? 'Tạo chủ đề' : 'Đăng nhập để đăng bài'}
        </Button>
        {user ? <Link to="/discussions/mine" className="forum-text-action">Chủ đề của tôi</Link> : null}
      </CommunityMasthead>

      <div className="forum-list-layout">
        <CategorySidebar categories={categories.data ?? []} active={filters.category}
          onSelect={slug => patch({ category: slug, cursor: undefined })} />
        <div className="forum-list-main">
          <div className="forum-toolbar">
            <form role="search" aria-label="Tìm chủ đề" className="forum-toolbar-search"
              onSubmit={(e) => { e.preventDefault(); patch({ q: q.trim() || undefined, cursor: undefined }); }}>
              <TextInput aria-label="Tìm kiếm chủ đề" placeholder="Tìm kiếm chủ đề…" value={q}
                leftSection={<IconSearch size={15} aria-hidden="true" />} maxLength={120}
                onChange={(e) => setQ(e.currentTarget.value)} />
              <Button type="submit" variant="default">Tìm</Button>
            </form>
            <Select aria-label="Sắp xếp chủ đề" className="forum-toolbar-sort" data={SORTS} value={filters.sort}
              allowDeselect={false} onChange={(v) => patch({ sort: v ?? 'activity', cursor: undefined })} />
          </div>
          {topics.isPending ? <LoadingState variant="table" label="Đang tải chủ đề…" /> : null}
          {topics.isError ? <ErrorState error={topics.error} onRetry={() => void topics.refetch()} /> : null}
          <TopicHighlights items={highlights} />
          {topics.data && items.length === 0 ? (
            <div className="forum-empty">
              <EmptyState description={hasFilters ? 'Không có chủ đề nào khớp bộ lọc hiện tại.' : 'Chưa có chủ đề nào. Hãy mở đầu cuộc trò chuyện.'}
                action={hasFilters
                  ? <Button variant="light" size="xs" onClick={() => setParams(new URLSearchParams())}>Xóa bộ lọc</Button>
                  : undefined} />
            </div>
          ) : null}
          {listed.length > 0 ? <RowList items={listed} /> : null}
          {topics.data && (filters.cursor || topics.data.nextCursor) ? (
            <Pager hasPrev={Boolean(filters.cursor)} hasNext={Boolean(topics.data.nextCursor)}
              onPrev={() => patch({ cursor: previousCursors.at(-1) || undefined }, previousCursors.slice(0, -1))}
              onNext={() => patch({ cursor: topics.data?.nextCursor ?? undefined }, [...previousCursors, filters.cursor ?? ''])} />
          ) : null}
        </div>
      </div>
    </Stack>
  );
}

export function MyDiscussionsPage() {
  const user = useAuthStore((s) => s.user);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const history = useRef<string[]>([]);
  const topics = useQuery({
    queryKey: ['discussions-mine', user?.userId, cursor ?? 'first'],
    queryFn: () => listOwnTopics(cursor),
    enabled: Boolean(user)
  });
  if (!user) {
    return <EmptyState title="Cần đăng nhập" description="Đăng nhập để xem chủ đề của bạn."
      action={<Button component={Link} to="/login">Đăng nhập</Button>} />;
  }
  return (
    <Stack className="forum-page" gap="lg">
      <CommunityMasthead eyebrow="Cộng đồng StoryCraft" title="Chủ đề của tôi"
        subtitle="Những cuộc trò chuyện bạn đã mở.">
        <Button className="forum-create" component={Link} to="/discussions/new"
          leftSection={<IconPencil size={15} aria-hidden="true" />}>Tạo chủ đề</Button>
        <Link to="/discussions" className="forum-text-action">Tất cả thảo luận</Link>
      </CommunityMasthead>
      {topics.isPending ? <LoadingState variant="table" label="Đang tải chủ đề của bạn…" /> : null}
      {topics.isError ? <ErrorState error={topics.error} onRetry={() => void topics.refetch()} /> : null}
      {topics.data && topics.data.items.length === 0 ? (
        <div className="forum-empty">
          <EmptyState description="Bạn chưa tạo chủ đề nào."
            action={<Button component={Link} to="/discussions/new" size="xs">Tạo chủ đề đầu tiên</Button>} />
        </div>
      ) : null}
      {topics.data && topics.data.items.length > 0 ? <RowList items={topics.data.items} /> : null}
      {topics.data ? (
        <Pager hasPrev={Boolean(cursor)} hasNext={Boolean(topics.data.nextCursor)}
          onPrev={() => setCursor(history.current.pop())}
          onNext={() => { history.current.push(cursor ?? ''); setCursor(topics.data?.nextCursor ?? undefined); }} />
      ) : null}
    </Stack>
  );
}

export function DiscussionEditorPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const isEdit = Boolean(topicId);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const categories = useQuery({ queryKey: ['discussion-categories'], queryFn: () => listCategories() });
  const topic = useQuery({ queryKey: ['discussion-topic', topicId], queryFn: () => getTopic(topicId as string), enabled: isEdit });
  const [categoryId, setCategoryId] = useState<string | null>(params.get('categoryId'));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const adminAccess = useQuery({
    queryKey: ['admin-access', user?.userId],
    queryFn: () => adminGet<Access>('/admin/access'),
    enabled: user?.role === 'ADMIN'
  });
  const canPostAnnouncement = adminAccess.data?.permissions.includes('content');
  const selectableCategories = (categories.data ?? []).filter(category => !category.postAdminOnly || canPostAnnouncement);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !topic.data || loadedFor === topic.data.topicId) return;
    setCategoryId(topic.data.category.categoryId);
    setTitle(topic.data.title);
    setBody(topic.data.body);
    setLoadedFor(topic.data.topicId);
  }, [isEdit, topic.data, loadedFor]);

  const titleError = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX
    ? null : `Tiêu đề phải từ ${TITLE_MIN} đến ${TITLE_MAX} ký tự.`;
  const bodyError = body.trim().length > 0 && body.length <= BODY_MAX ? null : `Nội dung bắt buộc, tối đa ${BODY_MAX} ký tự.`;
  const locked = Boolean(isEdit && topic.data?.isLocked);
  const canSubmit = selectableCategories.some(category => category.categoryId === categoryId)
    && !titleError && !bodyError && !busy && !locked && !categories.isPending;

  if (!user) {
    return <EmptyState title="Cần đăng nhập" description="Đăng nhập để tạo hoặc sửa chủ đề."
      action={<Button component={Link} to="/login">Đăng nhập</Button>} />;
  }
  if (isEdit && topic.isPending) return <LoadingState />;
  if (isEdit && topic.isError) return <ErrorState error={topic.error} onRetry={() => void topic.refetch()} />;
  if (isEdit && topic.data && topic.data.author?.userId !== user.userId) {
    return <PermissionState requiredRole="Tác giả chủ đề" onBack={() => navigate(`/discussions/${topicId}`)} />;
  }

  async function submit() {
    if (!canSubmit || !categoryId) return;
    setBusy(true);
    setError(null);
    const draft: TopicDraft = { categoryId, title: title.trim(), body };
    try {
      if (isEdit && topicId) {
        await updateTopic(topicId, draft);
        await queryClient.invalidateQueries({ queryKey: ['discussion-topic', topicId] });
        navigate(`/discussions/${topicId}`);
      } else {
        const { topicId: created } = await createTopic(draft);
        navigate(`/discussions/${created}`);
      }
      void queryClient.invalidateQueries({ queryKey: ['discussions'] });
      void queryClient.invalidateQueries({ queryKey: ['discussions-mine'] });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack className="forum-editor" gap="md">
      <nav className="forum-breadcrumb" aria-label="Đường dẫn">
        <Link to="/discussions">Thảo luận</Link>
        <span className="forum-breadcrumb-sep" aria-hidden="true">›</span>
        {isEdit && topicId ? <Link to={`/discussions/${topicId}`}>Chủ đề</Link> : <span aria-current="page">Chủ đề mới</span>}
        {isEdit && topicId ? <><span className="forum-breadcrumb-sep" aria-hidden="true">›</span><span className="forum-breadcrumb-crumb" aria-current="page">Chỉnh sửa</span></> : null}
      </nav>
      <div>
        <Title order={1} className="forum-heading">{isEdit ? 'Sửa chủ đề' : 'Tạo chủ đề'}</Title>
        {locked ? <Alert color="yellow" title="Chủ đề đã khóa">Chủ đề này đã bị khóa nên không thể chỉnh sửa.</Alert> : null}
        {error ? <Alert color="red" title="Lỗi">{error}</Alert> : null}
        {categories.isError ? <ErrorState error={categories.error} onRetry={() => void categories.refetch()} /> : null}
        <form className="forum-editor-panel" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <fieldset className="forum-category-field" disabled={locked || busy || categories.isPending}>
            <legend className="forum-category-legend">Danh mục</legend>
            <div className="forum-category-choices" role="radiogroup" aria-label="Danh mục">
              {selectableCategories.map((category) => {
                const guide = guideFor(category);
                const checked = categoryId === category.categoryId;
                return (
                  <label key={category.categoryId} className="forum-category-choice" data-category={category.slug}
                    data-checked={checked || undefined}>
                    <input type="radio" name="forum-category" className="forum-category-radio"
                      value={category.categoryId} checked={checked}
                      onChange={() => setCategoryId(category.categoryId)} />
                    <span className="forum-category-choice-icon" aria-hidden="true">{guide.icon}</span>
                    <span className="forum-category-choice-body">
                      <span className="forum-category-choice-title">{category.name}</span>
                      <span className="forum-category-choice-hint">{guide.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {categories.isPending ? <Text size="xs" c="dimmed">Đang tải danh mục…</Text> : null}
          </fieldset>

          <div className="forum-editor-grid">
            <TextInput label="Tiêu đề" required aria-label="Tiêu đề" value={title} maxLength={TITLE_MAX} disabled={locked || busy}
              error={title ? titleError : null} onChange={(e) => setTitle(e.currentTarget.value)} />
          </div>
          <DiscussionComposer label="Nội dung" value={body} onChange={setBody} maxLength={BODY_MAX} minRows={7}
            disabled={locked || busy} placeholder="Chia sẻ góc nhìn của bạn…" />
          {body && bodyError ? <Text size="xs" c="red">{bodyError}</Text> : null}
          <Group justify="space-between">
            <Button variant="default" component={Link} disabled={busy}
              to={isEdit && topicId ? `/discussions/${topicId}` : '/discussions'}>Hủy</Button>
            <Button type="submit" loading={busy} disabled={!canSubmit || locked}>{isEdit ? 'Lưu thay đổi' : 'Đăng chủ đề'}</Button>
          </Group>
        </form>
      </div>
    </Stack>
  );
}
