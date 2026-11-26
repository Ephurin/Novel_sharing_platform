import { Alert, Avatar, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import {
  IconArrowLeft, IconArrowRight, IconEye, IconFeather, IconFlame, IconHelp, IconLayoutGrid,
  IconLayoutList, IconLock, IconMessage2, IconMessages, IconPencil, IconPin, IconSearch,
  IconSpeakerphone
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useResourceId } from '../../app/ResourceRoute';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { adminGet, type Access } from '../admin/admin-operations-api';
import { useAuthStore } from '../auth/useAuthStore';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../shared/components/PageStates';
import { DiscussionComposer } from './DiscussionComposer';
import { RoleBadge } from './DiscussionRole';
import {
  createTopic, getCommunity, getTopic, listCategories, listOwnTopics, listTopics, updateTopic,
  type Topic, type Category, type TopicDraft, type TopicSort
} from './discussion-api';

const SORTS: Array<{ value: TopicSort; label: string }> = [
  { value: 'activity', label: 'Hoạt động gần đây' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'replies', label: 'Nhiều trả lời' }
];
const TITLE_MIN = 3, TITLE_MAX = 200, BODY_MAX = 20000;
const RELATIVE = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' });
const NUMBER = new Intl.NumberFormat('vi-VN');
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

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function CategoryTabs({ categories, active, onSelect }: {
  categories: Category[]; active?: string; onSelect: (slug?: string) => void;
}) {
  const items: Array<{ slug?: string; name: string; icon: ReactNode; accent?: string }> = [
    { name: 'Tất cả', icon: <IconLayoutGrid size={16} aria-hidden="true" /> },
    ...categories.map(category => ({
      slug: category.slug,
      name: category.name,
      icon: guideFor(category).icon,
      accent: category.postAdminOnly ? 'announce' : undefined
    }))
  ];
  return (
    <nav className="forum-tabs" aria-label="Chuyên mục thảo luận">
      <ul>
        {items.map(item => (
          <li key={item.slug ?? 'all'}>
            <button type="button" className="forum-tab" aria-pressed={active === item.slug}
              data-category={item.slug} data-announce={item.accent}
              onClick={() => onSelect(item.slug)}>
              <span className="forum-tab-icon" aria-hidden="true">{item.icon}</span>
              <span className="forum-tab-label">{item.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
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

function TopicRow({ topic }: { topic: Topic }) {
  const author = authorName(topic.author);
  const hidden = topic.status !== 'VISIBLE';
  // `false` only when the server identified this viewer and found no retained view,
  // so the marker never appears for anonymous visitors or unreadable guests.
  const unread = topic.viewerViewed === false && !hidden;
  const className = ['forum-row', hidden ? 'forum-row-static' : ''].filter(Boolean).join(' ');
  const isAuthor = topic.author?.role === 'AUTHOR';

  // Three levels only: the title leads, category + author sit in one quiet meta
  // line, and the reply count closes the row. Views, likes and the trailing
  // chevron live on the topic page so rows stay scannable.
  const inner = (
    <>
      {/* Category bar: one short rounded mark per row, in the category hue. */}
      <span className="forum-row-stripe" aria-hidden="true" />
      {/* The unread dot is pinned to the avatar corner rather than set inline before
          the title: a board where most threads are new keeps reading as a list. */}
      <span className="forum-row-ident">
        <Avatar src={topic.author?.avatarUrl ?? undefined} name={author} size={36} radius="xl"
          className="forum-row-avatar" data-role={isAuthor ? 'author' : undefined} aria-hidden="true" />
        {unread ? <span className="forum-row-unread" aria-hidden="true" /> : null}
        {unread ? <span className="forum-visually-hidden">Chưa xem</span> : null}
      </span>
      <span className="forum-row-main">
        <span className="forum-row-title">
          {topic.title}
          {topic.isPinned ? (
            <span className="forum-row-flag" title="Đã ghim">
              <IconPin size={12} aria-hidden="true" /><span className="forum-visually-hidden">Đã ghim</span>
            </span>
          ) : null}
          {topic.isLocked ? (
            <span className="forum-row-flag" title="Đã khóa">
              <IconLock size={12} aria-hidden="true" /><span className="forum-visually-hidden">Đã khóa</span>
            </span>
          ) : null}
          {hidden ? (
            <span className="forum-row-flag-text">{topic.status === 'HIDDEN' ? 'Đã ẩn' : 'Đã xóa'}</span>
          ) : null}
        </span>
        <span className="forum-row-meta">
          <span className="forum-row-cat" data-category={topic.category.slug}>{topic.category.name}</span>
          <span className="forum-row-sep" aria-hidden="true">·</span>
          <span className="forum-row-author">{author}</span>
          <RoleBadge role={topic.author?.role} />
          <span className="forum-row-sep" aria-hidden="true">·</span>
          <time className="forum-row-time" dateTime={validDate(topic.lastActivityAt)?.toISOString()}
            title={fmtTime(topic.lastActivityAt)}>
            {relTime(topic.lastActivityAt)}
          </time>
        </span>
      </span>
      {/* Two server-side counters close the row on one line: views then replies.
          Both are real (`viewCount` / `replyCount` from the list payload), never
          derived, never invented, and no third metadata line is added. Narrow
          viewports drop views and keep replies, the clearer of the two. */}
      <span className="forum-row-stats">
        <span className="forum-row-stat forum-row-views" title={`${NUMBER.format(topic.viewCount)} lượt xem`}>
          <IconEye size={14} aria-hidden="true" />{NUMBER.format(topic.viewCount)}
          <span className="forum-visually-hidden"> lượt xem</span>
        </span>
        <span className="forum-row-replies" data-empty={topic.replyCount === 0 || undefined}
          title={`${NUMBER.format(topic.replyCount)} trả lời`}>
          <IconMessage2 size={14} aria-hidden="true" />{NUMBER.format(topic.replyCount)}
          <span className="forum-visually-hidden"> trả lời</span>
        </span>
      </span>
    </>
  );

  if (hidden) {
    return (
      <div className={className} data-category={topic.category.slug} data-announce={topic.category.postAdminOnly || undefined}
      data-unread={unread || undefined}>
        {inner}
      </div>
    );
  }

  return (
    <Link to={`/discussions/${topic.topicId}`} className={className}
      data-category={topic.category.slug} data-announce={topic.category.postAdminOnly || undefined}
      data-unread={unread || undefined}>
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

/** “Đáng chú ý”: pinned threads and admin announcements, as one compact
 *  sidebar card. The V4 board keeps this block out of the list column, so the
 *  thread list starts right under the toolbar instead of behind a big panel. */
function NoticeCard({ items }: { items: Topic[] }) {
  if (items.length === 0) return null;
  return (
    <section className="forum-side-card forum-notices" aria-labelledby="forum-notices-title">
      <h2 id="forum-notices-title">
        <span className="forum-section-icon" data-tone="sage" aria-hidden="true"><IconSpeakerphone size={17} /></span>
        Đáng chú ý
      </h2>
      <ul>
        {items.map(topic => (
          <li key={topic.topicId}>
            {/* Accent bar and pill both resolve from the topic's own category
                slug, so a notice keeps its category colour here as well. */}
            <Link to={`/discussions/${topic.topicId}`} className="forum-notice" data-category={topic.category.slug}>
              <span className="forum-notice-icon" aria-hidden="true">
                {topic.category.postAdminOnly ? <IconSpeakerphone size={13} /> : <IconPin size={13} />}
              </span>
              <span className="forum-notice-body">
                <span className="forum-notice-title">{topic.title}</span>
                <span className="forum-notice-meta">
                  <span className="forum-notice-kicker">{topic.category.name}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={validDate(topic.lastActivityAt)?.toISOString()} title={fmtTime(topic.lastActivityAt)}>
                    {relTime(topic.lastActivityAt)}
                  </time>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommunitySidebar({ notices, trending }: {
  notices: Topic[];
  trending: Topic[];
}) {
  return (
    <aside className="forum-side" aria-label="Thông tin cộng đồng">
      <NoticeCard items={notices} />

      {trending.length > 0 ? (
        <section className="forum-side-card forum-trending" aria-labelledby="forum-trending-title">
          {/* Different job from “Đáng chú ý”: that block promotes pinned notices, this
              one ranks the community's busiest threads by replies, and the API keeps
              pinned/admin-only topics out of it so the two never mirror each other. */}
          <h2 id="forum-trending-title">
            <span className="forum-section-icon" data-tone="plum" aria-hidden="true"><IconFlame size={17} /></span>
            Đang được quan tâm
          </h2>
          <ol>
            {trending.map((topic, index) => (
              <li key={topic.topicId}>
                <span className="forum-trending-rank" aria-hidden="true">{index + 1}</span>
                <Link to={`/discussions/${topic.topicId}`} className="forum-trending-link">
                  <span className="forum-trending-body">
                    <span className="forum-trending-title">{topic.title}</span>
                    {/* Author, never the reply count: that number already sits in the
                        badge on the right and printing it twice muddied the card. */}
                    <span className="forum-trending-author">{authorName(topic.author)}</span>
                  </span>
                  <span className="forum-trending-replies" title={`${NUMBER.format(topic.replyCount)} trả lời`}>
                    <IconMessage2 size={13} aria-hidden="true" />{NUMBER.format(topic.replyCount)}
                    <span className="forum-visually-hidden"> trả lời</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
  );
}

/**
 * V4 board header: one compact strip — mark, title, subtitle — with the board's
 * actions on the right. Buttons follow the real session state from the auth
 * store instead of guessing from the navbar: a guest gets a single sign-in CTA
 * (“Chủ đề của tôi” is an account shortcut and must not be offered) and a
 * signed-in member gets both. The route guard already holds the page while a
 * stored session is restored, so this branch is only a fallback: it keeps a
 * same-size placeholder instead of a button, never a guest CTA.
 */
function BoardHeader({ createPath }: { createPath: string }) {
  const user = useAuthStore((s) => s.user);
  const sessionStatus = useAuthStore((s) => s.sessionStatus);
  const signedIn = sessionStatus === 'authenticated' && Boolean(user);
  return (
    <header className="forum-board-head">
      <div className="forum-board-ident">
        <span className="forum-board-mark" aria-hidden="true"><IconMessage2 size={20} /></span>
        <div className="forum-board-copy">
          <Title order={1} className="forum-heading">Thảo luận</Title>
          <Text className="forum-board-sub">Nơi những câu chuyện bắt đầu.</Text>
        </div>
      </div>
      <div className="forum-board-actions">
        {signedIn ? (
          <>
            {/* Outline first, filled CTA last: the primary action stays rightmost. */}
            <Button component={Link} to="/discussions/mine" variant="default"
              leftSection={<IconLayoutList size={15} aria-hidden="true" />}>Chủ đề của tôi</Button>
            <Button className="forum-create" component={Link} to={createPath}
              leftSection={<IconPencil size={15} aria-hidden="true" />}>Tạo chủ đề</Button>
          </>
        ) : sessionStatus === 'guest' ? (
          <Button className="forum-create" component={Link} to="/login"
            leftSection={<IconPencil size={15} aria-hidden="true" />}>Đăng nhập để đăng bài</Button>
        ) : (
          <span className="forum-board-pending" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

/** Compact header for secondary community pages (own topics, editor). */
function PageMasthead({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="forum-page-head">
      <div>
        <Text className="forum-eyebrow">Cộng đồng StoryCraft</Text>
        <Title order={1} className="forum-heading">{title}</Title>
        <Text className="forum-page-sub">{subtitle}</Text>
      </div>
      {children ? <div className="forum-page-head-actions">{children}</div> : null}
    </header>
  );
}

const listKey = (params: URLSearchParams) => ['discussions', params.toString()] as const;

export function DiscussionListPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const previousCursors: string[] = location.state?.forumPrevious ?? [];
  const categories = useQuery({ queryKey: ['discussion-categories'], queryFn: () => listCategories() });
  const community = useQuery({
    queryKey: ['discussion-community'], queryFn: () => getCommunity(), staleTime: 60_000
  });
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

  // The sidebar sticks below the shell navbar, whose height changes when the
  // author nav wraps (57px on desktop, ~99px on tablets) and drops away entirely
  // once the header leaves the viewport. Tracking the navbar's bottom edge keeps
  // the sticky column clear of it while it is on screen, and flush to the top
  // when it is not.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.sc-navbar');
    const shell = document.querySelector<HTMLElement>('.sc-discussions-shell');
    if (!nav || !shell) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const bottom = Math.round(nav.getBoundingClientRect().bottom);
      shell.style.setProperty('--forum-nav-offset', `${Math.max(0, bottom)}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(nav);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, []);

  const patch = useCallback((next: Record<string, string | undefined>, previous: string[] = []) => {
    const merged = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v ? merged.set(k, v) : merged.delete(k)));
    setParams(merged, { state: { forumPrevious: previous } });
  }, [params, setParams]);

  useEffect(() => { setQ(params.get('q') ?? ''); }, [params]);

  // Search commits itself: typing settles into the URL after a pause, so the
  // toolbar needs no extra submit button while Enter and the clear button still work.
  const urlQ = params.get('q') ?? '';
  useEffect(() => {
    const next = q.trim();
    if (next === urlQ) return;
    const timer = setTimeout(() => patch({ q: next || undefined, cursor: undefined }), 420);
    return () => clearTimeout(timer);
  }, [q, urlQ, patch]);

  const hasFilters = Boolean(filters.category || filters.q);
  const activeCategory = categories.data?.find(category => category.slug === filters.category);
  const createPath = activeCategory ? `/discussions/new?categoryId=${activeCategory.categoryId}` : '/discussions/new';
  const items = topics.data?.items ?? [];
  // Pinned topics and announcements are promoted only on the unfiltered first page, so a
  // paginated or searched view never hides a result the query asked for. Only the four
  // entries the “Đáng chú ý” card actually renders leave the chronological list; further
  // pinned or announcement topics stay in it so no thread can fall out of the board.
  const noticePool = !filters.cursor && !filters.q
    ? items.filter(topic => topic.status === 'VISIBLE' && (topic.isPinned || topic.category.postAdminOnly))
    : [];
  const notices = noticePool.slice(0, 4);
  const noticeIds = new Set(notices.map(topic => topic.topicId));
  const listed = noticeIds.size ? items.filter(topic => !noticeIds.has(topic.topicId)) : items;
  const trending = (community.data?.trending ?? []).filter(topic => !noticeIds.has(topic.topicId)).slice(0, 3);

  return (
    <div className="forum-community">
      <BoardHeader createPath={createPath} />

      <div className="forum-community-grid">
        <div className="forum-community-main">
          <CategoryTabs categories={categories.data ?? []} active={filters.category}
            onSelect={slug => patch({ category: slug, cursor: undefined })} />

          <div className="forum-toolbar">
            <form role="search" aria-label="Tìm chủ đề" className="forum-toolbar-search"
              onSubmit={(e) => { e.preventDefault(); patch({ q: q.trim() || undefined, cursor: undefined }); }}>
              <TextInput aria-label="Tìm kiếm chủ đề" placeholder="Tìm kiếm chủ đề…" value={q}
                leftSection={<IconSearch size={15} aria-hidden="true" />} maxLength={120}
                onChange={(e) => setQ(e.currentTarget.value)} />
            </form>
            <Select aria-label="Sắp xếp chủ đề" className="forum-toolbar-sort" data={SORTS} value={filters.sort}
              allowDeselect={false} onChange={(v) => patch({ sort: v ?? 'activity', cursor: undefined })} />
          </div>

          {topics.isPending ? <LoadingState variant="table" label="Đang tải chủ đề…" /> : null}
          {topics.isError ? <ErrorState error={topics.error} onRetry={() => void topics.refetch()} /> : null}

          {topics.data && items.length === 0 ? (
            <div className="forum-empty">
              <EmptyState description={hasFilters ? 'Không có chủ đề nào khớp bộ lọc hiện tại.' : 'Chưa có chủ đề nào. Hãy mở đầu cuộc trò chuyện.'}
                action={hasFilters
                  ? <Button variant="light" size="xs" onClick={() => setParams(new URLSearchParams())}>Xóa bộ lọc</Button>
                  : undefined} />
            </div>
          ) : null}

          {listed.length > 0 ? (
            <section className="forum-latest" aria-labelledby="forum-latest-title">
              <header className="forum-latest-head">
                <h2 id="forum-latest-title">
                  <span className="forum-section-icon" data-tone="coral" aria-hidden="true"><IconMessage2 size={17} /></span>
                  Thảo luận mới nhất
                </h2>
              </header>
              <RowList items={listed} />
            </section>
          ) : null}

          {topics.data && (filters.cursor || topics.data.nextCursor) ? (
            <Pager hasPrev={Boolean(filters.cursor)} hasNext={Boolean(topics.data.nextCursor)}
              onPrev={() => patch({ cursor: previousCursors.at(-1) || undefined }, previousCursors.slice(0, -1))}
              onNext={() => patch({ cursor: topics.data?.nextCursor ?? undefined }, [...previousCursors, filters.cursor ?? ''])} />
          ) : null}
        </div>

        <CommunitySidebar notices={notices} trending={trending} />
      </div>
    </div>
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
      <PageMasthead title="Chủ đề của tôi" subtitle="Những cuộc trò chuyện bạn đã mở.">
        <Button className="forum-create" component={Link} to="/discussions/new"
          leftSection={<IconPencil size={15} aria-hidden="true" />}>Tạo chủ đề</Button>
        <Button component={Link} to="/discussions" variant="default"
          leftSection={<IconArrowLeft size={15} aria-hidden="true" />}>Tất cả thảo luận</Button>
      </PageMasthead>
      {topics.isPending ? <LoadingState variant="table" label="Đang tải chủ đề của bạn…" /> : null}
      {topics.isError ? <ErrorState error={topics.error} onRetry={() => void topics.refetch()} /> : null}
      {topics.data && topics.data.items.length === 0 ? (
        <div className="forum-empty">
          <EmptyState description="Bạn chưa tạo chủ đề nào."
            action={<Button component={Link} to="/discussions/new" size="xs">Tạo chủ đề đầu tiên</Button>} />
        </div>
      ) : null}
      {topics.data && topics.data.items.length > 0 ? (
        <section className="forum-latest"><RowList items={topics.data.items} /></section>
      ) : null}
      {topics.data ? (
        <Pager hasPrev={Boolean(cursor)} hasNext={Boolean(topics.data.nextCursor)}
          onPrev={() => setCursor(history.current.pop())}
          onNext={() => { history.current.push(cursor ?? ''); setCursor(topics.data?.nextCursor ?? undefined); }} />
      ) : null}
    </Stack>
  );
}

export function DiscussionEditorPage() {
  const topicId = useResourceId('topicId');
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
      void queryClient.invalidateQueries({ queryKey: ['discussion-community'] });
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
