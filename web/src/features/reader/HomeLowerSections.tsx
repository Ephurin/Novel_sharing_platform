import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { listNovelReviews } from '../novels/novel-statistics-api';
import { listTargetComments } from './comments-api';
import { listHistoryPage, listLibraryPage, type ReaderNovel } from './reader-api';
import { HomeNovelCover } from './HomeNovelCover';
import { NovelQuickPreview } from './HomeEnhancements';
import writingStudioArt from '../../assets/home-writing-studio.jpg';

const count = (value = 0) => value.toLocaleString('vi-VN');

const statusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
};

function novelStatusLabel(novel: ReaderNovel) {
  return statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra';
}

function resolveNovelPills(novel: ReaderNovel): Array<{ label: string; kind: 'genre' | 'tag' }> {
  const genres = (novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [])
    .map(g => g.trim())
    .filter(Boolean);
  const seen = new Set(genres.map(g => g.toLowerCase()));
  const tags = (novel.tags ?? [])
    .map(t => t.trim())
    .filter(t => t && !seen.has(t.toLowerCase()));

  return [
    ...genres.map(label => ({ label, kind: 'genre' as const })),
    ...tags.map(label => ({ label, kind: 'tag' as const })),
  ].slice(0, 3);
}

function relativeTime(date?: string | null) {
  if (!date) return '';
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (!Number.isFinite(elapsed)) return '';
  const format = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (elapsed < 60) return 'Vừa xong';
  if (elapsed < 3600) return format.format(-Math.floor(elapsed / 60), 'minute');
  if (elapsed < 86400) return format.format(-Math.floor(elapsed / 3600), 'hour');
  return format.format(-Math.floor(elapsed / 86400), 'day');
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pickDailySpotlight(catalogNovels: ReaderNovel[], topFeaturedId?: string): ReaderNovel | null {
  if (catalogNovels.length === 0) return null;

  // Prefer published novels with real published chapters, real readership, and non-placeholder metadata.
  const curatedPool = catalogNovels.filter(
    novel =>
      Boolean(novel.latestChapter) &&
      (novel.viewsCount ?? 0) > 0 &&
      Boolean(novel.synopsis?.trim()) &&
      !/^untitled\b/i.test(novel.title.trim())
  );
  const richPool = catalogNovels.filter(
    novel => Boolean(novel.synopsis?.trim()) && (novel.chaptersCount ?? 0) > 0
  );
  const basePool = curatedPool.length > 0 ? curatedPool : richPool.length > 0 ? richPool : catalogNovels;
  const distinctPool = topFeaturedId && basePool.length > 1
    ? basePool.filter(novel => novel.novelId !== topFeaturedId)
    : basePool;
  const candidates = distinctPool.length > 0 ? distinctPool : basePool;

  const sorted = candidates.slice().sort((a, b) => a.novelId.localeCompare(b.novelId));
  const index = hashString(`storycraft-spotlight:${todayKey()}`) % sorted.length;
  return sorted[index] ?? null;
}

type CommunityEntry = {
  id: string;
  kind: 'review' | 'comment';
  authorName: string;
  avatarUrl: string | null;
  novelId: string;
  novelTitle: string;
  score: number | null;
  content: string;
  createdAt: string;
  href: string;
};

type AuthorEntry = {
  authorId: string;
  authorName: string;
  novelsCount: number;
};

export function HomeLowerSections({
  catalogPath,
  catalogNovels,
  featuredIds,
  topFeaturedId,
  completedNovels,
  completedPending,
  completedError,
  onRetryCompleted,
  authors,
  catalogPending,
}: {
  catalogPath: string;
  catalogNovels: ReaderNovel[];
  featuredIds: Set<string>;
  topFeaturedId?: string;
  completedNovels: ReaderNovel[];
  completedPending: boolean;
  completedError: boolean;
  onRetryCompleted: () => void;
  authors: AuthorEntry[];
  catalogPending: boolean;
}) {
  const user = useAuthStore(state => state.user);
  const isReaderSide = Boolean(user && user.role !== 'ADMIN' && user.status === 'ACTIVE');
  const isWriter = user?.role === 'AUTHOR' || user?.role === 'ADMIN';

  // 1. Góc truyện đề cử (ổn định theo ngày từ danh sách truyện thật)
  const spotlight = useMemo(
    () => pickDailySpotlight(catalogNovels, topFeaturedId),
    [catalogNovels, topFeaturedId]
  );

  // 2. Bình luận & đánh giá công khai gần đây (tái sử dụng API công khai theo từng truyện nổi bật)
  const communitySourceNovels = useMemo(
    () =>
      catalogNovels
        .slice()
        .sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0) || (b.likesCount ?? 0) - (a.likesCount ?? 0))
        .slice(0, 5),
    [catalogNovels]
  );
  const communitySourceKey = communitySourceNovels.map(novel => novel.novelId).join(',');

  const communityQuery = useQuery({
    queryKey: ['reader-home-recent-community', catalogPath, communitySourceKey],
    enabled: communitySourceNovels.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<CommunityEntry[]> => {
      const results = await Promise.allSettled(
        communitySourceNovels.map(async novel => {
          const [reviewsRes, commentsRes] = await Promise.allSettled([
            listNovelReviews(novel.novelId, 1, 'newest'),
            listTargetComments({ kind: 'novel', id: novel.novelId }, 1),
          ]);

          const entries: CommunityEntry[] = [];

          if (reviewsRes.status === 'fulfilled') {
            for (const rev of reviewsRes.value.items) {
              const text = rev.review?.trim();
              if (!text) continue;
              entries.push({
                id: `rev:${novel.novelId}:${rev.userId}:${rev.updatedAt || rev.createdAt}`,
                kind: 'review',
                authorName: rev.displayName || 'Độc giả',
                avatarUrl: rev.avatarUrl ?? null,
                novelId: novel.novelId,
                novelTitle: novel.title,
                score: typeof rev.score === 'number' ? rev.score : null,
                content: text,
                createdAt: rev.updatedAt || rev.createdAt,
                href: `${catalogPath}/novels/${novel.novelId}/reviews`,
              });
            }
          }

          if (commentsRes.status === 'fulfilled') {
            for (const cmt of commentsRes.value.items) {
              const text = cmt.content?.trim();
              if (!text || cmt.isSpoiler) continue;
              if (cmt.audience && cmt.audience !== 'PUBLIC') continue;
              if (cmt.status && cmt.status !== 'VISIBLE') continue;
              const targetHref = cmt.chapterId
                ? `${catalogPath}/chapters/${cmt.chapterId}?commentId=${encodeURIComponent(cmt.commentId)}#reader-comments`
                : `${catalogPath}/novels/${novel.novelId}?commentId=${encodeURIComponent(cmt.commentId)}#reader-comments`;
              entries.push({
                id: `cmt:${cmt.commentId}`,
                kind: 'comment',
                authorName: cmt.displayName || 'Độc giả',
                avatarUrl: cmt.avatarUrl ?? null,
                novelId: novel.novelId,
                novelTitle: novel.title,
                score: null,
                content: text,
                createdAt: cmt.createdAt,
                href: targetHref,
              });
            }
          }

          return entries;
        })
      );

      const merged: CommunityEntry[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled') merged.push(...res.value);
      }

      return merged
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 6);
    },
  });

  const communityItems = communityQuery.data ?? [];
  const communityPageSize = 2;
  const communityTotalPages = Math.max(1, Math.ceil(communityItems.length / communityPageSize));
  const [communityPage, setCommunityPage] = useState(0);
  useEffect(() => {
    if (communityPage >= communityTotalPages) setCommunityPage(0);
  }, [communityPage, communityTotalPages]);
  const visibleCommunityItems = communityItems.slice(
    communityPage * communityPageSize,
    communityPage * communityPageSize + communityPageSize
  );
  const isCommunityCompact = !communityQuery.isPending && visibleCommunityItems.length <= 1;

  // 3. Gợi ý dành cho bạn (dựa trên lịch sử đọc/thư viện cho người đăng nhập, hoặc truyện công khai ít trùng cho khách)
  const historyQuery = useQuery({
    queryKey: ['reader-home-history', user?.userId],
    queryFn: () => listHistoryPage(1, 10),
    enabled: isReaderSide,
    staleTime: 30_000,
    retry: false,
  });

  const libraryQuery = useQuery({
    queryKey: ['reader-home-recs-library', user?.userId],
    queryFn: () => listLibraryPage(1, 10),
    enabled: isReaderSide,
    staleTime: 60_000,
    retry: false,
  });

  const recommendedNovels = useMemo(() => {
    if (catalogNovels.length === 0) return [];
    const byId = new Map(catalogNovels.map(n => [n.novelId, n]));
    const readIds = new Set<string>();
    const preferredGenres = new Map<string, number>();

    if (isReaderSide) {
      for (const item of historyQuery.data?.items ?? []) {
        readIds.add(item.novelId);
        const novel = byId.get(item.novelId);
        const genres = novel?.genres?.length ? novel.genres : novel?.genre ? [novel.genre] : [];
        for (const g of genres) preferredGenres.set(g.toLowerCase(), (preferredGenres.get(g.toLowerCase()) ?? 0) + 2);
      }
      for (const item of libraryQuery.data?.items ?? []) {
        const genres = item.genres?.length ? item.genres : item.genre ? [item.genre] : [];
        for (const g of genres) preferredGenres.set(g.toLowerCase(), (preferredGenres.get(g.toLowerCase()) ?? 0) + 3);
      }
    }

    const excludeTop = new Set<string>(featuredIds);
    if (spotlight) excludeTop.add(spotlight.novelId);

    const scored = catalogNovels.map(novel => {
      const genres = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
      let score = 0;
      if (isReaderSide) {
        if (readIds.has(novel.novelId)) score -= 25;
        for (const g of genres) score += (preferredGenres.get(g.toLowerCase()) ?? 0) * 6;
      }
      if (!excludeTop.has(novel.novelId)) score += 18;
      if (novel.coverImageUrl) score += 4;
      if ((novel.chaptersCount ?? 0) >= 3) score += 3;
      score += Math.min(5, Math.log10((novel.viewsCount ?? 0) + 1) * 2);
      return { novel, score };
    });

    return scored
      .sort((a, b) => b.score - a.score || (b.novel.viewsCount ?? 0) - (a.novel.viewsCount ?? 0))
      .map(entry => entry.novel)
      .slice(0, 9);
  }, [catalogNovels, featuredIds, spotlight, isReaderSide, historyQuery.data?.items, libraryQuery.data?.items]);

  const [recPage, setRecPage] = useState(0);
  const recPageSize = 3;
  const recTotalPages = Math.max(1, Math.ceil(recommendedNovels.length / recPageSize));
  const safeRecPage = Math.min(recPage, recTotalPages - 1);
  const visibleRecs = recommendedNovels.slice(safeRecPage * recPageSize, safeRecPage * recPageSize + recPageSize);

  const novelPath = (novel: ReaderNovel) => `${catalogPath}/novels/${novel.novelId}`;
  const writerCtaTo = isWriter ? '/author/projects' : user ? '/profile/me' : '/login';

  return (
    <div className="sc-home-lower">
      {/* 1. Góc truyện đề cử (Full-width spotlight) */}
      {(catalogPending || spotlight) && (
        <section className="sc-home-panel sc-home-spotlight" aria-label="Góc truyện đề cử">
          <div className="sc-home-spotlight-bg" aria-hidden="true">
            <svg viewBox="0 0 640 240" fill="none" preserveAspectRatio="xMaxYMid slice">
              <defs>
                <radialGradient id="sc-spot-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(500 50) rotate(135) scale(260 180)">
                  <stop stopColor="var(--home-accent)" stopOpacity=".22" />
                  <stop offset="1" stopColor="var(--home-accent)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="640" height="240" fill="url(#sc-spot-glow)" />
              <path d="M260 240C335 190 405 182 475 196C535 208 590 175 640 148V240H260Z" fill="currentColor" opacity=".09" />
              <path d="M350 240C420 202 490 198 560 212C595 219 620 208 640 196V240H350Z" fill="currentColor" opacity=".12" />
              <path d="M472 178V122L488 102L504 122V178M510 178V108L530 84L550 108V178M556 178V132L572 114L588 132V178" stroke="currentColor" strokeWidth="1.4" strokeOpacity=".26" fill="currentColor" fillOpacity=".07" />
              <circle cx="448" cy="64" r="16" fill="currentColor" opacity=".1" />
              <path d="M412 88L414 93L419 95L414 97L412 102L410 97L405 95L410 93L412 88Z" fill="currentColor" opacity=".28" />
            </svg>
          </div>

          <div className="sc-home-spotlight-inner">
            <div className="sc-home-sec-head sc-home-spotlight-head">
              <div className="sc-home-sec-left">
                <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">auto_awesome</span>
                <h2>Góc truyện đề cử</h2>
              </div>
              {spotlight && (
                <Link className="sc-home-sec-link" to={novelPath(spotlight)}>Xem chi tiết →</Link>
              )}
            </div>

            {catalogPending && !spotlight ? (
              <div className="sc-home-spotlight-body is-skeleton" aria-busy="true">
                <span className="sc-skeleton-block sc-home-spotlight-cover" />
                <div className="sc-home-spotlight-info">
                  <span className="sc-skeleton-block" style={{ width: '44%', height: 22 }} />
                  <span className="sc-skeleton-block" style={{ width: '28%', height: 16 }} />
                  <span className="sc-skeleton-block" style={{ width: '78%', height: 14 }} />
                  <span className="sc-skeleton-block" style={{ width: '68%', height: 14 }} />
                  <span className="sc-skeleton-block" style={{ width: 120, height: 36, borderRadius: 999 }} />
                </div>
              </div>
            ) : spotlight ? (
              <div className="sc-home-spotlight-body">
                <Link
                  to={novelPath(spotlight)}
                  className="sc-home-spotlight-cover"
                  aria-label={`Đọc truyện đề cử: ${spotlight.title}`}
                >
                  <HomeNovelCover novel={spotlight} size="card" />
                </Link>

                <div className="sc-home-spotlight-info">
                  <h3>
                    <Link to={novelPath(spotlight)}>{spotlight.title}</Link>
                  </h3>

                  <div className="sc-home-spotlight-meta">
                    {resolveNovelPills(spotlight).map((pill, idx) => (
                      <span
                        key={`${pill.kind}-${pill.label}`}
                        className={`sc-home-spot-pill ${idx === 0 ? 'is-primary' : 'is-secondary'}`}
                        translate="no"
                      >
                        {pill.label}
                      </span>
                    ))}
                    {spotlight.authorName && (
                      <Link to={`/authors/${spotlight.authorId}`} className="sc-home-spotlight-author">
                        <span className="material-symbols-outlined" aria-hidden="true">person</span>
                        <span>{spotlight.authorName}</span>
                      </Link>
                    )}
                  </div>

                  <p className="sc-home-spotlight-synopsis">
                    {spotlight.synopsis?.trim() || 'Mở trang truyện để xem giới thiệu đầy đủ và theo dõi các chương mới nhất.'}
                  </p>

                  <ul className="sc-home-spotlight-facts">
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>{count(spotlight.chaptersCount)} chương đã xuất bản</span>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>{count(spotlight.viewsCount)} lượt đọc</span>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>Trạng thái: {novelStatusLabel(spotlight)}</span>
                    </li>
                    {(spotlight.likesCount ?? 0) > 0 && (
                      <li>
                        <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                        <span>{count(spotlight.likesCount)} lượt yêu thích</span>
                      </li>
                    )}
                  </ul>

                  <div className="sc-home-spotlight-actions">
                    <Link to={novelPath(spotlight)} className="sc-home-pill-btn sc-home-pill-primary">
                      <span>Đọc ngay</span>
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* 2. Truyện đã hoàn thành (Full-width, tối đa 6 bìa dọc 2:3) */}
      <section className="sc-home-panel sc-home-section" id="completed-novels" aria-label="Truyện đã hoàn thành">
        <div className="sc-home-sec-head">
          <div className="sc-home-sec-left">
            <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">task_alt</span>
            <h2>Truyện đã hoàn thành</h2>
          </div>
          <Link className="sc-home-sec-link" to={`${catalogPath}?status=COMPLETED`}>Xem tất cả →</Link>
        </div>

        {completedPending ? (
          <div className="sc-home-completed-grid" aria-busy="true">
            {Array.from({ length: 6 }, (_, idx) => (
              <div key={idx} className="sc-home-featured-card is-skeleton" aria-hidden="true">
                <span className="sc-skeleton-block sc-home-featured-cover" />
                <span className="sc-skeleton-block" style={{ width: '84%', height: 13, marginTop: 8 }} />
                <span className="sc-skeleton-block" style={{ width: '56%', height: 16, marginTop: 6 }} />
              </div>
            ))}
          </div>
        ) : completedError ? (
          <div className="sc-home-inline-notice" role="alert">
            <span>Không tải được danh sách truyện đã hoàn thành.</span>
            <button type="button" onClick={onRetryCompleted}>Thử lại</button>
          </div>
        ) : completedNovels.length === 0 ? (
          <div className="sc-home-empty-inline">
            <span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>
            <p>Hiện chưa có truyện nào ở trạng thái đã hoàn thành.</p>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem danh sách truyện →</Link>
          </div>
        ) : (
          <div className="sc-home-completed-grid">
            {completedNovels.slice(0, 6).map(novel => (
              <article key={novel.novelId} className="sc-home-featured-card">
                <div className="sc-home-featured-media">
                  <Link className="sc-home-featured-cover-link" to={novelPath(novel)} aria-label={`Đọc truyện hoàn thành: ${novel.title}`}>
                    <span className="sc-home-featured-cover">
                      <HomeNovelCover novel={novel} size="card" />
                    </span>
                  </Link>
                  <NovelQuickPreview novel={novel} to={novelPath(novel)} />
                </div>
                <Link className="sc-home-featured-title" to={novelPath(novel)} title={novel.title}>
                  {novel.title}
                </Link>
                <div className="sc-home-ftags">
                  <span className="is-primary">Hoàn thành</span>
                  <span className="is-secondary">{count(novel.chaptersCount)} chương</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 3. Bình luận & đánh giá gần đây + Gợi ý dành cho bạn (2 cột full-width trên desktop) */}
      <div className="sc-home-lower-paired">
        <section
          className={`sc-home-panel sc-home-section sc-home-community-card${isCommunityCompact ? ' is-compact' : ''}`}
          aria-label="Bình luận và đánh giá gần đây"
        >
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">rate_review</span>
              <h2>Bình luận &amp; đánh giá gần đây</h2>
            </div>
            <Link
              className="sc-home-sec-link"
              to={visibleCommunityItems[0]?.href ?? catalogPath}
            >
              Xem tất cả →
            </Link>
          </div>

          {communityQuery.isPending ? (
            <div className="sc-home-review-skeleton" aria-busy="true">
              <span className="sc-skeleton-block" style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none' }} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <span className="sc-skeleton-block" style={{ width: '62%', height: 14 }} />
                <span className="sc-skeleton-block" style={{ width: '92%', height: 13 }} />
                <span className="sc-skeleton-block" style={{ width: '40%', height: 11 }} />
              </div>
            </div>
          ) : communityQuery.isError ? (
            <div className="sc-home-inline-notice" role="alert">
              <span>Chưa tải được bình luận và đánh giá gần đây.</span>
              <button type="button" onClick={() => void communityQuery.refetch()}>Thử lại</button>
            </div>
          ) : visibleCommunityItems.length === 0 ? (
            <div className="sc-home-empty-block sc-home-community-empty">
              <span className="sc-home-empty-badge" aria-hidden="true">
                <span className="material-symbols-outlined">rate_review</span>
              </span>
              <p>Chưa có bình luận hay đánh giá công khai gần đây trên các truyện nổi bật.</p>
              <Link className="sc-home-sec-link" to={catalogPath}>Đọc truyện &amp; để lại nhận xét →</Link>
            </div>
          ) : (
            <div className="sc-home-community-body">
              <div className={`sc-home-review-stack${visibleCommunityItems.length === 1 ? ' is-single' : ''}`}>
                {visibleCommunityItems.map(entry => {
                  const filledStars = entry.score !== null ? Math.max(1, Math.min(5, Math.round(entry.score / 2))) : 0;
                  return (
                    <Link key={entry.id} to={entry.href} className="sc-home-review-card">
                      <div className="sc-home-review-top">
                        <div className="sc-home-review-identity">
                          <span className="sc-home-review-avatar" aria-hidden="true">
                            {entry.avatarUrl ? (
                              <img src={entry.avatarUrl} alt="" loading="lazy" />
                            ) : (
                              entry.authorName.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <div className="sc-home-review-person">
                            <div className="sc-home-review-name-row">
                              <strong className="sc-home-review-author">{entry.authorName}</strong>
                              <span className="sc-home-review-kind">
                                {entry.kind === 'review' ? 'Đánh giá' : 'Bình luận'}
                              </span>
                            </div>
                            <time className="sc-home-review-time" dateTime={entry.createdAt}>
                              {relativeTime(entry.createdAt)}
                            </time>
                          </div>
                        </div>

                        {entry.score !== null && (
                          <div className="sc-home-review-score-pill" aria-label={`Điểm ${entry.score} trên 10`}>
                            <span className="sc-home-review-stars" aria-hidden="true">
                              {Array.from({ length: 5 }, (_, i) => (
                                <span
                                  key={i}
                                  className={`material-symbols-outlined${i < filledStars ? ' is-filled' : ''}`}
                                >
                                  star
                                </span>
                              ))}
                            </span>
                            <strong className="sc-home-review-score">{entry.score}/10</strong>
                          </div>
                        )}
                      </div>

                      <div className="sc-home-review-novel-row">
                        <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                        <span className="sc-home-review-novel">{entry.novelTitle}</span>
                      </div>

                      <blockquote className="sc-home-review-quote">
                        {entry.content}
                      </blockquote>
                    </Link>
                  );
                })}
              </div>

              {communityTotalPages > 1 && (
                <div className="sc-home-slider-nav" aria-label="Chuyển trang bình luận gần đây">
                  <button
                    type="button"
                    className="sc-home-slider-arrow"
                    aria-label="Trang trước"
                    onClick={() => setCommunityPage(prev => (prev - 1 + communityTotalPages) % communityTotalPages)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                  </button>
                  <div className="sc-home-slider-dots" role="tablist" aria-label="Chọn trang bình luận">
                    {Array.from({ length: communityTotalPages }, (_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        role="tab"
                        aria-selected={idx === communityPage}
                        aria-label={`Trang ${idx + 1}`}
                        className={`sc-home-slider-dot${idx === communityPage ? ' is-active' : ''}`}
                        onClick={() => setCommunityPage(idx)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="sc-home-slider-arrow"
                    aria-label="Trang tiếp theo"
                    onClick={() => setCommunityPage(prev => (prev + 1) % communityTotalPages)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="sc-home-panel sc-home-section sc-home-recs-card" aria-label="Gợi ý dành cho bạn">
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">recommend</span>
              <h2>Gợi ý dành cho bạn</h2>
            </div>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem thêm →</Link>
          </div>

          {catalogPending && visibleRecs.length === 0 ? (
            <div className="sc-home-recs-grid" aria-busy="true">
              {Array.from({ length: 3 }, (_, idx) => (
                <div key={idx} className="sc-home-rec-item is-skeleton" aria-hidden="true">
                  <span className="sc-skeleton-block sc-home-rec-cover" />
                  <span className="sc-skeleton-block" style={{ width: '80%', height: 12, marginTop: 7 }} />
                </div>
              ))}
            </div>
          ) : visibleRecs.length === 0 ? (
            <div className="sc-home-empty-block">
              <p>Chưa có đủ truyện để gợi ý lúc này.</p>
            </div>
          ) : (
            <div className="sc-home-recs-carousel">
              {recTotalPages > 1 && (
                <button
                  type="button"
                  className="sc-home-slider-arrow"
                  aria-label="Nhóm gợi ý trước"
                  onClick={() => setRecPage(prev => (prev - 1 + recTotalPages) % recTotalPages)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                </button>
              )}

              <div className="sc-home-recs-grid">
                {visibleRecs.map(novel => {
                  const genre = novel.genres?.[0] || novel.genre;
                  return (
                    <Link
                      key={novel.novelId}
                      to={novelPath(novel)}
                      className="sc-home-rec-item"
                      title={novel.title}
                    >
                      <span className="sc-home-rec-cover">
                        <HomeNovelCover novel={novel} size="card" />
                      </span>
                      <strong className="sc-home-rec-title">{novel.title}</strong>
                      {genre && <span className="sc-home-rec-genre" translate="no">{genre}</span>}
                    </Link>
                  );
                })}
              </div>

              {recTotalPages > 1 && (
                <button
                  type="button"
                  className="sc-home-slider-arrow"
                  aria-label="Nhóm gợi ý tiếp theo"
                  onClick={() => setRecPage(prev => (prev + 1) % recTotalPages)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 4. Những người kể chuyện (Full-width, ngay phía trên Không gian sáng tác) */}
      {authors.length > 0 && (
        <section className="sc-home-panel sc-home-section" id="featured-authors" aria-label="Những người kể chuyện">
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">edit_note</span>
              <h2>Những người kể chuyện</h2>
            </div>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem tác giả →</Link>
          </div>
          <div className="sc-home-authors">
            {authors.map(author => (
              <Link key={author.authorId} className="sc-home-author-item" to={`/authors/${author.authorId}`}>
                <span className="sc-home-author-avatar" aria-hidden="true">
                  {author.authorName.slice(0, 1).toUpperCase()}
                </span>
                <span className="sc-home-author-copy">
                  <strong>{author.authorName}</strong>
                  <small>{count(author.novelsCount)} tác phẩm</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 5. Không gian sáng tác (Full-width bottom banner) */}
      <section className="sc-home-panel sc-home-studio-banner" aria-label="Không gian sáng tác">
        <div className="sc-home-studio-copy">
          <h2>
            <span>Không gian sáng tác</span>
            <span className="material-symbols-outlined sc-home-studio-pen" aria-hidden="true">edit_note</span>
          </h2>
          <p>
            {isWriter
              ? 'Quản lý tác phẩm, viết chương mới và chia sẻ câu chuyện của bạn cùng cộng đồng đọc truyện StoryCraft.'
              : 'Giao lưu, chia sẻ kinh nghiệm viết và cùng nhau xây dựng những câu chuyện mới tại StoryCraft.'}
          </p>
          <Link to={writerCtaTo} className="sc-home-pill-btn sc-home-pill-primary">
            <span>{isWriter ? 'Mở không gian sáng tác' : 'Bắt đầu sáng tác'}</span>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
        <div className="sc-home-studio-art" aria-hidden="true">
          <img src={writingStudioArt} alt="" loading="lazy" />
        </div>
      </section>
    </div>
  );
}
