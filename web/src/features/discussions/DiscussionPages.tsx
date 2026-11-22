import { Alert, Avatar, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import {
  IconArrowLeft, IconArrowRight, IconFeather, IconHelp, IconLayoutList, IconLock, IconMessage2,
  IconMessages, IconPencil, IconPin, IconSearch, IconSpeakerphone, IconThumbUp
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

/** Collapse markdown/whitespace into a single plain line for compact previews. */
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

/* ── Illustrations ───────────────────────────────────────────────────────────
 * Original, decorative SVG scenes drawn for this page (no stock imagery, no
 * uploaded photos, nothing that could be mistaken for user content). Fills come
 * from the `--forum-art-*` tokens in discussions.css so both themes stay warm.
 */

/** Community banner: a sunlit reading nook with a flowered window and books. */
function HeroArt() {
  return (
    <svg className="forum-hero-art" viewBox="0 0 420 240" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMaxYMax slice">
      <rect className="fa-sky" width="420" height="240" />
      <circle className="fa-glow" cx="330" cy="66" r="66" />
      <g className="fa-window">
        <rect className="fa-glass" x="196" y="14" width="208" height="180" rx="8" />
        <rect className="fa-line" x="196" y="14" width="208" height="180" rx="8" fill="none" strokeWidth="4" />
        <path className="fa-line" d="M300 16v176M198 104h204" strokeWidth="3.4" fill="none" />
        <path className="fa-beam" d="M214 40 92 208h96L322 40Z" />
        <path className="fa-beam fa-beam-soft" d="M330 40 236 208h64L386 40Z" />
      </g>
      <g className="fa-sill">
        <rect x="176" y="192" width="244" height="9" rx="4" />
      </g>
      <g className="fa-books">
        <rect className="fa-book-1" x="206" y="160" width="15" height="32" rx="2.5" />
        <rect className="fa-book-2" x="223" y="152" width="13" height="40" rx="2.5" />
        <rect className="fa-book-3" x="238" y="166" width="17" height="26" rx="2.5" />
        <rect className="fa-book-4" x="258" y="171" width="40" height="8" rx="2.5" />
        <rect className="fa-book-2" x="264" y="164" width="34" height="7" rx="2.5" />
        <rect className="fa-book-1" x="262" y="158" width="30" height="6" rx="2.5" />
      </g>
      <g className="fa-mug">
        <rect x="312" y="158" width="30" height="34" rx="5" />
        <path className="fa-line" d="M342 168h6a9 9 0 0 1 0 18h-6" strokeWidth="3.2" fill="none" />
        <path className="fa-steam" d="M320 148c6-6-6-9 0-15M330 150c6-6-6-9 0-15" strokeWidth="2.4" fill="none" />
      </g>
      <g className="fa-branch">
        <path className="fa-line" d="M84 14c22 24 30 52 30 84" strokeWidth="2.4" fill="none" />
        <ellipse className="fa-leaf" cx="76" cy="34" rx="11" ry="6" transform="rotate(-24 76 34)" />
        <ellipse className="fa-leaf" cx="104" cy="42" rx="11" ry="6" transform="rotate(22 104 42)" />
        <ellipse className="fa-leaf" cx="70" cy="62" rx="10" ry="5.5" transform="rotate(-30 70 62)" />
        <ellipse className="fa-leaf fa-leaf-soft" cx="106" cy="72" rx="10" ry="5.5" transform="rotate(26 106 72)" />
        <circle className="fa-blossom" cx="92" cy="24" r="5" />
        <circle className="fa-blossom" cx="66" cy="48" r="4" />
        <circle className="fa-blossom" cx="112" cy="60" r="4.5" />
      </g>
      <g className="fa-petals">
        <ellipse cx="150" cy="118" rx="5" ry="3" transform="rotate(24 150 118)" />
        <ellipse cx="44" cy="150" rx="4" ry="2.6" transform="rotate(-18 44 150)" />
        <ellipse cx="118" cy="196" rx="5" ry="3" transform="rotate(38 118 196)" />
        <ellipse cx="30" cy="204" rx="4" ry="2.4" transform="rotate(-32 30 204)" />
      </g>
    </svg>
  );
}

/**
 * Featured card art: a reader on a hill at golden hour. Cropped bottom-anchored
 * (`xMidYMax`) so the wide, short box on phones keeps the hills and the reader
 * instead of cutting them in half.
 */
function FeatureArt() {
  return (
    <svg className="forum-feature-art" viewBox="0 0 300 220" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="forum-feature-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="fa-sky-stop-1" />
          <stop offset=".62" className="fa-sky-stop-2" />
          <stop offset="1" className="fa-sky-stop-3" />
        </linearGradient>
      </defs>
      <rect width="300" height="220" fill="url(#forum-feature-sky)" />
      <circle className="fa-sun" cx="196" cy="104" r="26" />
      <path className="fa-hill-far" d="M0 150c46-22 88-20 132-4 40 14 74 12 168-8v82H0Z" />
      <path className="fa-hill-mid" d="M0 178c54-16 96-8 138 6 44 14 96 10 162-14v50H0Z" />
      <path className="fa-hill-near" d="M0 210c60-6 96-18 140-30 40-11 92-12 160 4v36H0Z" />
      <g className="fa-reader">
        <circle cx="120" cy="148" r="7" />
        <path d="M120 156c-9 0-16 7-16 16v18h32v-18c0-9-7-16-16-16Z" />
        <path className="fa-book" d="M104 172h32l-4 10h-24Z" />
      </g>
      <g className="fa-birds">
        <path d="M60 62c4-4 7-4 11 0 4-4 7-4 11 0" strokeWidth="2" fill="none" />
        <path d="M232 46c3-3 5-3 8 0 3-3 5-3 8 0" strokeWidth="1.7" fill="none" />
      </g>
    </svg>
  );
}

/** Sidebar art: a small book stack with a leafy sprig. */
function AboutArt() {
  return (
    <svg className="forum-about-art" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      <g className="fa-books">
        <rect className="fa-book-1" x="18" y="58" width="62" height="9" rx="3" />
        <rect className="fa-book-2" x="24" y="47" width="56" height="9" rx="3" />
        <rect className="fa-book-3" x="20" y="36" width="58" height="9" rx="3" />
      </g>
      <g className="fa-branch">
        <path className="fa-line" d="M96 16c-10 10-14 24-16 40" strokeWidth="2.2" fill="none" />
        <ellipse className="fa-leaf" cx="92" cy="26" rx="9" ry="5" transform="rotate(-30 92 26)" />
        <ellipse className="fa-leaf fa-leaf-soft" cx="104" cy="40" rx="9" ry="5" transform="rotate(20 104 40)" />
        <ellipse className="fa-leaf" cx="84" cy="52" rx="8" ry="4.6" transform="rotate(-24 84 52)" />
        <circle className="fa-blossom" cx="100" cy="14" r="4" />
      </g>
    </svg>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function CategoryTabs({ categories, active, onSelect }: {
  categories: Category[]; active?: string; onSelect: (slug?: string) => void;
}) {
  const items: Array<{ slug?: string; name: string; icon: ReactNode; accent?: string }> = [
    { name: 'Tất cả', icon: <IconLayoutList size={16} aria-hidden="true" /> },
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
      {/* Count and icon share one pill on one line; the word stays available to
          screen readers and as a hover tooltip instead of wrapping to a second row. */}
      <span className="forum-row-replies" data-empty={topic.replyCount === 0 || undefined}
        title={`${NUMBER.format(topic.replyCount)} trả lời`}>
        <IconMessage2 size={14} aria-hidden="true" />{NUMBER.format(topic.replyCount)}
        <span className="forum-visually-hidden"> trả lời</span>
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

/** “Đáng chú ý”: one real pinned/announcement topic plus the remaining ones. */
function FeaturedSection({ lead, rest }: { lead: Topic; rest: Topic[] }) {
  const author = authorName(lead.author);
  const preview = plainPreview(lead.body);
  return (
    <section className="forum-featured" aria-labelledby="forum-featured-title">
      <header className="forum-featured-head">
        <h2 id="forum-featured-title">
          <span className="forum-section-icon" aria-hidden="true"><IconPin size={15} /></span>
          Đáng chú ý
        </h2>
      </header>
      <div className="forum-featured-body" data-has-list={rest.length > 0 || undefined}>
        <article className="forum-feature" data-category={lead.category.slug}>
          <div className="forum-feature-media">
            <FeatureArt />
            {/* The board has no per-topic artwork, so the panel is labelled as
                community illustration instead of pretending to be a cover the
                author uploaded. */}
            <span className="forum-feature-media-note">Minh họa</span>
          </div>
          <div className="forum-feature-copy">
            <div className="forum-feature-badges">
              {lead.isPinned ? <span className="forum-badge" data-tone="accent"><IconPin size={11} aria-hidden="true" /> Ghim</span> : null}
              <span className="forum-badge" data-category={lead.category.slug}>{lead.category.name}</span>
            </div>
            <h3 className="forum-feature-title">
              <Link to={`/discussions/${lead.topicId}`}>{lead.title}</Link>
            </h3>
            {preview ? <p className="forum-feature-desc">{preview}</p> : null}
            <div className="forum-feature-meta">
              <Avatar src={lead.author?.avatarUrl ?? undefined} name={author} size={26} radius="xl"
                className="forum-identity-avatar" data-role={lead.author?.role === 'AUTHOR' ? 'author' : undefined}
                aria-hidden="true" />
              <span className="forum-feature-author">{author}</span>
              <RoleBadge role={lead.author?.role} />
              <span className="sc-byline-dot" aria-hidden="true">·</span>
              <time dateTime={validDate(lead.createdAt)?.toISOString()} title={fmtTime(lead.createdAt)}>
                {relTime(lead.createdAt)}
              </time>
              <span className="forum-feature-stats">
                <span title={`${lead.replyCount} bình luận`}><IconMessage2 size={14} aria-hidden="true" />{NUMBER.format(lead.replyCount)}</span>
                <span title={`${lead.likeCount} lượt thích`}><IconThumbUp size={14} aria-hidden="true" />{NUMBER.format(lead.likeCount)}</span>
              </span>
            </div>
          </div>
        </article>

        {rest.length > 0 ? (
          <ul className="forum-featured-list">
            {rest.map(topic => (
              <li key={topic.topicId}>
                <Link to={`/discussions/${topic.topicId}`} className="forum-featured-item" data-category={topic.category.slug}>
                  <span className="forum-featured-icon" aria-hidden="true">
                    {topic.category.postAdminOnly ? <IconSpeakerphone size={14} /> : <IconPin size={14} />}
                  </span>
                  <span className="forum-featured-item-body">
                    <span className="forum-featured-item-title">{topic.title}</span>
                    {/* Kind and recency share one line: the icon already hints at
                        the kind, and a second text row cost 16px per item. */}
                    <span className="forum-featured-item-meta">
                      <span className="forum-featured-item-kicker">
                        {topic.category.postAdminOnly ? 'Thông báo' : 'Ghim'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{relTime(topic.lastActivityAt)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function CommunitySidebar({ stats, trending }: {
  stats?: { memberCount: number; topicCount: number; commentCount: number };
  trending: Topic[];
}) {
  return (
    <aside className="forum-side" aria-label="Thông tin cộng đồng">
      {/* One warm card carries both the introduction and the counters: nested
          stat boxes read as a dashboard and pulled attention from the list. */}
      <section className="forum-side-card forum-about" aria-labelledby="forum-about-title">
        <h2 id="forum-about-title">Về cộng đồng</h2>
        <p>StoryCraft là nơi người viết và người đọc cùng chia sẻ hành trình sáng tác.</p>
        <AboutArt />
        {stats ? (
          <dl className="forum-about-stats">
            <div>
              <dt>thành viên</dt>
              <dd>{NUMBER.format(stats.memberCount)}</dd>
            </div>
            <div>
              <dt>chủ đề</dt>
              <dd>{NUMBER.format(stats.topicCount)}</dd>
            </div>
            <div>
              <dt>bình luận</dt>
              <dd>{NUMBER.format(stats.commentCount)}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {trending.length > 0 ? (
        <section className="forum-side-card forum-trending" aria-labelledby="forum-trending-title">
          {/* Different job from “Đáng chú ý”: that block promotes pinned notices, this
              one ranks the community's busiest threads by replies, and the API keeps
              pinned/admin-only topics out of it so the two never mirror each other. */}
          <h2 id="forum-trending-title">Sôi nổi 30 ngày</h2>
          <ol>
            {trending.map((topic, index) => (
              <li key={topic.topicId}>
                <span className="forum-trending-rank" aria-hidden="true">{index + 1}</span>
                <Link to={`/discussions/${topic.topicId}`} className="forum-trending-link">
                  <span className="forum-trending-title">{topic.title}</span>
                  <span className="forum-trending-meta">{NUMBER.format(topic.replyCount)} bình luận</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </aside>
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
  // paginated or searched view never hides a result the query asked for.
  const featuredPool = !filters.cursor && !filters.q
    ? items.filter(topic => topic.status === 'VISIBLE' && (topic.isPinned || topic.category.postAdminOnly))
    : [];
  const featuredIds = new Set(featuredPool.map(topic => topic.topicId));
  const lead = featuredPool[0];
  const rest = featuredPool.slice(1, 4);
  const listed = featuredIds.size ? items.filter(topic => !featuredIds.has(topic.topicId)) : items;
  const trending = (community.data?.trending ?? []).filter(topic => !featuredIds.has(topic.topicId)).slice(0, 3);

  return (
    <div className="forum-community">
      <header className="forum-hero">
        <div className="forum-hero-media">
          <HeroArt />
        </div>
        <div className="forum-hero-copy">
          <Text className="forum-eyebrow">Cộng đồng StoryCraft</Text>
          <Title order={1} className="forum-hero-title">Nơi những câu chuyện bắt đầu.</Title>
          {/* One fixed sentence for every tab: the old "Đang xem {category} — …"
              variant changed length on each switch, so the hero re-wrapped and the
              page below it jumped. The active tab already shows what is filtered. */}
          <Text className="forum-hero-sub">
            Giao lưu, chia sẻ kinh nghiệm viết và cùng nhau sáng tác.
          </Text>
          <div className="forum-hero-actions">
            <Button className="forum-create" component={Link} to={user ? createPath : '/login'}
              leftSection={<IconPencil size={15} aria-hidden="true" />}>
              {user ? 'Tạo chủ đề' : 'Đăng nhập để đăng bài'}
            </Button>
            {/* Outline variant, not a bare text link: beside a filled CTA a link read as
                a label, and this is the shortcut returning members use most. */}
            {user ? <Button component={Link} to="/discussions/mine" variant="default"
              leftSection={<IconLayoutList size={15} aria-hidden="true" />}>Chủ đề của tôi</Button> : null}
          </div>
        </div>
      </header>

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

          {lead ? <FeaturedSection lead={lead} rest={rest} /> : null}

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
                <h2 id="forum-latest-title">Thảo luận mới nhất</h2>
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

        <CommunitySidebar stats={community.data?.stats} trending={trending} />
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
