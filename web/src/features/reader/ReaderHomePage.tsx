import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingFilters, searchPublishedNovelPage, type ReaderNovel } from './reader-api';
import { useListScroll, useUrlFilters } from '../../shared/components/WorkspacePreferences';
import { ContinueReading } from './HomePersonalization';
import { HomeNovelCover } from './HomeNovelCover';
import { NovelQuickPreview } from './HomeEnhancements';
import { HomeSidebar } from './HomeSidebar';
import { HomeLowerSections } from './HomeLowerSections';
import booksTeaArt from '../../assets/home-books-tea.png';
import './reader-home.css';

type FeatureTabKey = 'hot' | 'liked' | 'new';

const FEATURE_TABS: Array<{ key: FeatureTabKey; label: string }> = [
  { key: 'hot', label: 'Đang hot' },
  { key: 'liked', label: 'Được yêu thích' },
  { key: 'new', label: 'Mới ra mắt' },
];

const count = (value = 0) => value.toLocaleString('vi-VN');

function relativeTime(date?: string | null) {
  if (!date) return '';
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (!Number.isFinite(elapsed)) return '';
  const format = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (elapsed < 60) return 'Vừa cập nhật';
  if (elapsed < 3600) return format.format(-Math.floor(elapsed / 60), 'minute');
  if (elapsed < 86400) return format.format(-Math.floor(elapsed / 3600), 'hour');
  return format.format(-Math.floor(elapsed / 86400), 'day');
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
  ].slice(0, 2);
}

type GenreGlyphKind = 'mountain' | 'house' | 'castle' | 'sword' | 'compass' | 'magnify' | 'heart' | 'book';

function resolveGenreVisual(name: string): { subtitle: string; glyph: GenreGlyphKind } {
  if (/cultivation|tu tiên|tiên hiệp/i.test(name)) return { subtitle: 'Tu tiên', glyph: 'mountain' };
  if (/đời thường|slice/i.test(name)) return { subtitle: 'Nhẹ nhàng', glyph: 'house' };
  if (/fantasy|kỳ ảo|huyền ảo/i.test(name)) return { subtitle: 'Kỳ ảo', glyph: 'castle' };
  if (/kiếm hiệp|võ|hành động/i.test(name)) return { subtitle: 'Giang hồ', glyph: 'sword' };
  if (/phiêu lưu|hành trình/i.test(name)) return { subtitle: 'Khám phá', glyph: 'compass' };
  if (/trinh thám|bí ẩn/i.test(name)) return { subtitle: 'Bí ẩn', glyph: 'magnify' };
  if (/lãng mạn|ngôn tình|romcom/i.test(name)) return { subtitle: 'Lãng mạn', glyph: 'heart' };
  if (/khoa học|viễn tưởng|sci-fi/i.test(name)) return { subtitle: 'Viễn tưởng', glyph: 'compass' };
  return { subtitle: 'Khám phá', glyph: 'book' };
}

function GenreGlyphSvg({ kind }: { kind: GenreGlyphKind }) {
  switch (kind) {
    case 'mountain':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m2 20 7.4-13 4.7 7 3-4 4.9 10H2Z" />
          <path d="m6.8 11.5 2.6 1.3 1.8-1.6" />
        </svg>
      );
    case 'house':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 11 9-8 9 8v9H3v-9Z" />
          <path d="M9 20v-7h6v7" />
        </svg>
      );
    case 'castle':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 21V8h4v3h3V7h4v4h3V8h4v13H3Z" />
          <path d="M9 21v-6h6v6M6 4h.01M18 4h.01" />
        </svg>
      );
    case 'sword':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 19 12-12 3-3-5 1-3 3-9 9m4-2 3 3m-6-2 4 4m-7 1 4-4" />
        </svg>
      );
    case 'compass':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z" />
        </svg>
      );
    case 'magnify':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="7" />
          <path d="m15 15 6 6" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 5c-2.5-2.5-6-1.5-8 1-2-2.5-5.5-3.5-8-1-5 5 1 10 8 16 7-6 13-11 8-16Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 6c-2.5-2.4-6-3-9-2v15c3-1 6.5-.4 9 2m0-15c2.5-2.4 6-3 9-2v15c-3-1-6.5-.4-9 2m0-15v15" />
        </svg>
      );
  }
}

export function ReaderHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const catalogPath = user && user.role !== 'ADMIN' ? '/reader' : '/public';
  const [pickingRandom, setPickingRandom] = useState(false);
  const [chaptersExpanded, setChaptersExpanded] = useState(false);

  const homeFilters = useUrlFilters(
    { tab: 'hot' as FeatureTabKey },
    { tab: ['hot', 'liked', 'new'] }
  );
  const featureTab = homeFilters.values.tab;

  const viewsQuery = useQuery({
    queryKey: ['reader-home-list', 'views'],
    queryFn: () => searchPublishedNovelPage({ sort: 'views', order: 'desc', page: 1, limit: 20 }),
    staleTime: 30_000,
  });
  const likesQuery = useQuery({
    queryKey: ['reader-home-list', 'likes'],
    queryFn: () => searchPublishedNovelPage({ sort: 'likes', order: 'desc', page: 1, limit: 20 }),
    staleTime: 30_000,
  });
  const latestQuery = useQuery({
    queryKey: ['reader-home-list', 'updatedAt'],
    queryFn: () => searchPublishedNovelPage({ sort: 'updatedAt', order: 'desc', page: 1, limit: 20 }),
    staleTime: 30_000,
  });
  const completedQuery = useQuery({
    queryKey: ['reader-home-list', 'completed'],
    queryFn: () => searchPublishedNovelPage({ status: 'COMPLETED', sort: 'views', order: 'desc', page: 1, limit: 12 }),
    staleTime: 30_000,
  });
  const filtersQuery = useQuery({
    queryKey: ['reading-filters'],
    queryFn: getReadingFilters,
    staleTime: 60_000,
  });

  useListScroll(!viewsQuery.isPending && !latestQuery.isPending);

  const viewsNovels = viewsQuery.data?.items ?? [];
  const likesNovels = likesQuery.data?.items ?? [];
  const latestNovels = latestQuery.data?.items ?? [];
  const completedNovels = completedQuery.data?.items ?? [];

  const catalogNovels = useMemo(() => {
    const byId = new Map<string, ReaderNovel>();
    for (const list of [latestNovels, viewsNovels, likesNovels, completedNovels]) {
      for (const novel of list) {
        if (!byId.has(novel.novelId)) byId.set(novel.novelId, novel);
      }
    }
    return [...byId.values()];
  }, [latestNovels, viewsNovels, likesNovels, completedNovels]);

  const catalogNovelsMap = useMemo(() => {
    const map = new Map<string, ReaderNovel>();
    for (const novel of catalogNovels) map.set(novel.novelId, novel);
    return map;
  }, [catalogNovels]);

  const activeFeatureQuery =
    featureTab === 'hot'
      ? viewsQuery
      : featureTab === 'liked'
        ? likesQuery
        : latestQuery;

  const featuredItems = useMemo(
    () => (activeFeatureQuery.data?.items ?? []).slice(0, 6),
    [activeFeatureQuery.data?.items]
  );

  const featuredIds = useMemo(
    () => new Set(featuredItems.map(novel => novel.novelId)),
    [featuredItems]
  );

  const novelsWithPublishedChapter = useMemo(
    () => latestNovels.filter(novel => Boolean(novel.latestChapter)),
    [latestNovels]
  );

  const chapterUpdateItems = useMemo(() => {
    const limit = chaptersExpanded ? 10 : 6;
    return novelsWithPublishedChapter.slice(0, limit);
  }, [novelsWithPublishedChapter, chaptersExpanded]);

  const genreCards = useMemo(() => {
    const rawGenres = filtersQuery.data?.genres ?? [];
    const totalCatalog = latestQuery.data?.totalItems ?? 0;
    const hasCompleteCount = totalCatalog > 0 && catalogNovels.length >= totalCatalog;
    const counts = new Map<string, number>();
    if (hasCompleteCount) {
      for (const novel of catalogNovels) {
        const list = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
        for (const g of list) counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }

    return rawGenres.slice(0, 6).map(name => {
      const visual = resolveGenreVisual(name);
      const genreCount = counts.get(name);
      return {
        name,
        glyph: visual.glyph,
        subtitle: hasCompleteCount && typeof genreCount === 'number' && genreCount > 0
          ? `${count(genreCount)} truyện`
          : visual.subtitle,
      };
    });
  }, [filtersQuery.data?.genres, catalogNovels, latestQuery.data?.totalItems]);

  const authors = useMemo(() => {
    const byId = new Map<string, { authorId: string; authorName: string; novelsCount: number; totalViews: number }>();
    for (const novel of catalogNovels) {
      if (!novel.authorId || !novel.authorName?.trim()) continue;
      const existing = byId.get(novel.authorId);
      const views = novel.viewsCount ?? 0;
      if (!existing) {
        byId.set(novel.authorId, {
          authorId: novel.authorId,
          authorName: novel.authorName.trim(),
          novelsCount: 1,
          totalViews: views,
        });
      } else {
        existing.novelsCount += 1;
        existing.totalViews += views;
      }
    }
    return [...byId.values()]
      .sort((a, b) => b.novelsCount - a.novelsCount || b.totalViews - a.totalViews)
      .slice(0, 4);
  }, [catalogNovels]);

  const novelPath = (novel: ReaderNovel) => `${catalogPath}/novels/${novel.novelId}`;

  async function handleRandomNovel() {
    if (pickingRandom) return;
    if (catalogNovels.length > 0) {
      const chosen = catalogNovels[Math.floor(Math.random() * catalogNovels.length)];
      navigate(novelPath(chosen));
      return;
    }
    setPickingRandom(true);
    try {
      const pageData = await searchPublishedNovelPage({ page: 1, limit: 20, sort: 'updatedAt', order: 'desc' });
      if (pageData.items.length > 0) {
        const chosen = pageData.items[Math.floor(Math.random() * pageData.items.length)];
        navigate(novelPath(chosen));
      } else {
        navigate(catalogPath);
      }
    } catch {
      navigate(catalogPath);
    } finally {
      setPickingRandom(false);
    }
  }

  return (
    <>
      <a className="sc-home-skip-link" href="#home-main">Đến nội dung chính</a>
      <AuthorNavbar />
      <main id="home-main" tabIndex={-1} className={`sc-shell-content sc-reader-home${!user ? ' is-guest' : ''}`}>
        <div className="sc-home-layout">
          <div className="sc-home-maincol">
            {/* 1. Hero "Góc đọc truyện" */}
            <header className="sc-home-hero">
              <div className="sc-home-hero-copy">
                <span className="sc-home-eyebrow">
                  KHÔNG GIAN ĐỌC STORYCRAFT
                  <svg className="sc-home-eyebrow-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                    <path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2Z" />
                  </svg>
                </span>
                <h1>Góc đọc truyện</h1>
                <p>Khám phá những câu chuyện hấp dẫn, theo dõi chương mới và tham gia cộng đồng yêu truyện.</p>
                <div className="sc-home-hero-actions">
                  <Link to={catalogPath} className="sc-home-hero-btn sc-home-hero-btn-primary" data-testid="home-hero-explore">
                    <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                    <span>Khám phá truyện</span>
                    <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </Link>
                  <button
                    type="button"
                    className="sc-home-hero-btn sc-home-hero-btn-secondary"
                    disabled={pickingRandom}
                    onClick={() => void handleRandomNovel()}
                    data-testid="home-hero-random"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">shuffle</span>
                    <span>{pickingRandom ? 'Đang chọn…' : 'Truyện ngẫu nhiên'}</span>
                  </button>
                </div>
              </div>
              <div className="sc-home-hero-art" aria-hidden="true">
                <img src={booksTeaArt} alt="" loading="eager" />
              </div>
            </header>

            {/* 2. Đọc tiếp (chỉ hiện với người đã đăng nhập) */}
            <ContinueReading catalogNovelsMap={catalogNovelsMap} catalogPath={catalogPath} />

            {/* 3. Chương mới cập nhật & Thảo luận nổi bật nằm cạnh nhau trên desktop */}
            <div className="sc-home-paired">
              <section className="sc-home-panel sc-home-section" aria-label="Chương mới cập nhật">
                <div className="sc-home-sec-head">
                  <div className="sc-home-sec-left">
                    <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">schedule</span>
                    <h2>Chương mới cập nhật</h2>
                  </div>
                  {novelsWithPublishedChapter.length > 6 ? (
                    <button
                      type="button"
                      className="sc-home-sec-link"
                      onClick={() => setChaptersExpanded(prev => !prev)}
                    >
                      {chaptersExpanded ? 'Thu gọn ↑' : 'Xem thêm →'}
                    </button>
                  ) : (
                    <Link className="sc-home-sec-link" to={`${catalogPath}?sort=updatedAt:desc`}>Xem thêm →</Link>
                  )}
                </div>

                {latestQuery.isPending ? (
                  <div className="sc-home-chapter-list" aria-busy="true">
                    {Array.from({ length: 6 }, (_, idx) => (
                      <div key={idx} className="sc-home-chapter-row is-skeleton" aria-hidden="true">
                        <span className="sc-skeleton-block sc-home-chapter-thumb" />
                        <span className="sc-skeleton-block" style={{ width: '74%', height: 13 }} />
                        <span className="sc-skeleton-block" style={{ width: 64, height: 22, borderRadius: 999 }} />
                        <span className="sc-skeleton-block" style={{ width: 52, height: 11 }} />
                      </div>
                    ))}
                  </div>
                ) : latestQuery.isError ? (
                  <div className="sc-home-inline-notice" role="alert">
                    <span>Chưa tải được danh sách chương mới.</span>
                    <button type="button" onClick={() => void latestQuery.refetch()}>Thử lại</button>
                  </div>
                ) : chapterUpdateItems.length === 0 ? (
                  <div className="sc-home-empty-block">
                    <p>Chưa có chương mới nào được xuất bản.</p>
                  </div>
                ) : (
                  <div className="sc-home-chapter-list">
                    {chapterUpdateItems.map(novel => {
                      const latestChapter = novel.latestChapter!;
                      const target = `${catalogPath}/chapters/${latestChapter.chapterId}`;
                      const badgeLabel = `Chương ${latestChapter.chapterNumber}`;
                      const updatedStamp = latestChapter.publishedAt ?? novel.updatedAt;
                      return (
                        <Link key={novel.novelId} className="sc-home-chapter-row" to={target} title={novel.title}>
                          <span className="sc-home-chapter-thumb">
                            <HomeNovelCover novel={novel} size="thumb" />
                          </span>
                          <strong className="sc-home-chapter-title">{novel.title}</strong>
                          <span className="sc-home-chapter-badge">{badgeLabel}</span>
                          <time
                            className="sc-home-chapter-time"
                            dateTime={updatedStamp ?? undefined}
                            title={updatedStamp ? new Date(updatedStamp).toLocaleString('vi-VN') : undefined}
                          >
                            {relativeTime(updatedStamp)}
                          </time>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="sc-home-panel sc-home-section sc-home-discussions-panel" aria-label="Thảo luận nổi bật">
                <div className="sc-home-sec-head">
                  <div className="sc-home-sec-left">
                    <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">forum</span>
                    <h2>Thảo luận nổi bật</h2>
                  </div>
                  <Link className="sc-home-sec-link" to={catalogPath}>Bình luận truyện →</Link>
                </div>

                <div className="sc-home-empty-block sc-home-discussions-empty">
                  <span className="sc-home-empty-badge" aria-hidden="true">
                    <span className="material-symbols-outlined">forum</span>
                  </span>
                  <h3>Chưa có chủ đề thảo luận</h3>
                  <p>
                    Thảo luận chung chưa có bài viết trên nhánh này. Bạn có thể bình luận trực tiếp trong từng truyện.
                  </p>
                  <Link className="sc-home-pill-btn sc-home-pill-secondary sc-home-discussions-cta" to={catalogPath}>
                    <span>Mở danh sách truyện</span>
                    <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </Link>
                </div>
              </section>
            </div>

            {/* 4. Truyện nổi bật dạng lưới bìa có tab */}
            <section className="sc-home-panel sc-home-section" id="featured-novels" aria-label="Truyện nổi bật">
              <div className="sc-home-sec-head sc-home-featured-head">
                <div className="sc-home-sec-left sc-home-featured-left">
                  <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">local_fire_department</span>
                  <h2>Truyện nổi bật</h2>
                  <div className="sc-home-subtabs" role="tablist" aria-label="Lọc truyện nổi bật">
                    {FEATURE_TABS.map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={featureTab === tab.key}
                        className={`sc-home-tab${featureTab === tab.key ? ' is-active' : ''}`}
                        onClick={() => homeFilters.update({ tab: tab.key })}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Link className="sc-home-sec-link" to={catalogPath}>Xem tất cả →</Link>
              </div>

              {activeFeatureQuery.isPending ? (
                <div className="sc-home-featured-grid" aria-busy="true">
                  {Array.from({ length: 6 }, (_, idx) => (
                    <div key={idx} className="sc-home-featured-card is-skeleton" aria-hidden="true">
                      <span className="sc-skeleton-block sc-home-featured-cover" />
                      <span className="sc-skeleton-block" style={{ width: '86%', height: 13, marginTop: 8 }} />
                      <span className="sc-skeleton-block" style={{ width: '58%', height: 16, marginTop: 6 }} />
                    </div>
                  ))}
                </div>
              ) : activeFeatureQuery.isError ? (
                <div className="sc-home-inline-notice" role="alert">
                  <span>Không thể tải truyện nổi bật.</span>
                  <button type="button" onClick={() => void activeFeatureQuery.refetch()}>Thử lại</button>
                </div>
              ) : featuredItems.length === 0 ? (
                <div className="sc-home-empty-block">
                  <p>Chưa có truyện nào trong mục này.</p>
                </div>
              ) : (
                <div className="sc-home-featured-grid">
                  {featuredItems.map((novel, idx) => {
                    const pills = resolveNovelPills(novel);
                    return (
                      <article key={novel.novelId} className="sc-home-featured-card">
                        <div className="sc-home-featured-media">
                          <Link className="sc-home-featured-cover-link" to={novelPath(novel)} aria-label={`Đọc truyện: ${novel.title}`}>
                            <span className="sc-home-featured-cover">
                              <HomeNovelCover novel={novel} eager={idx < 3} size="card" />
                            </span>
                          </Link>
                          <NovelQuickPreview novel={novel} to={novelPath(novel)} />
                        </div>
                        <Link className="sc-home-featured-title" to={novelPath(novel)} title={novel.title}>
                          {novel.title}
                        </Link>
                        {pills.length > 0 && (
                          <div className="sc-home-ftags">
                            {pills.map((pill, pillIdx) => (
                              <span
                                key={`${pill.kind}-${pill.label}`}
                                className={pillIdx === 0 ? 'is-primary' : 'is-secondary'}
                                translate="no"
                              >
                                {pill.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 5. Khám phá theo thể loại (duy nhất, không lặp section khám phá khác) */}
            {genreCards.length > 0 && (
              <section className="sc-home-panel sc-home-section" id="browse-genres" aria-label="Khám phá theo thể loại">
                <div className="sc-home-sec-head">
                  <div className="sc-home-sec-left">
                    <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">menu_book</span>
                    <h2>Khám phá theo thể loại</h2>
                  </div>
                  <Link className="sc-home-sec-link" to={catalogPath}>Xem tất cả thể loại →</Link>
                </div>
                <div className="sc-home-categories">
                  {genreCards.map((item, idx) => (
                    <Link
                      key={item.name}
                      className={`sc-home-category is-cat-${(idx % 6) + 1}`}
                      to={`${catalogPath}?genre=${encodeURIComponent(item.name)}`}
                    >
                      <span className="sc-home-category-copy">
                        <strong translate="no">{item.name}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                      <span className="sc-home-category-glyph">
                        <GenreGlyphSvg kind={item.glyph} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Cột Sidebar phải */}
          <HomeSidebar
            catalogPath={catalogPath}
            viewsNovels={viewsNovels}
            latestNovels={latestNovels}
            likesNovels={likesNovels}
            rankingLoading={viewsQuery.isPending || latestQuery.isPending || likesQuery.isPending}
          />
        </div>

        {/* Vùng dưới — Full-width toàn bộ container */}
        <HomeLowerSections
          catalogPath={catalogPath}
          catalogNovels={catalogNovels}
          featuredIds={featuredIds}
          topFeaturedId={viewsNovels[0]?.novelId}
          completedNovels={completedNovels}
          completedPending={completedQuery.isPending}
          completedError={completedQuery.isError}
          onRetryCompleted={() => void completedQuery.refetch()}
          authors={authors}
          catalogPending={viewsQuery.isPending && latestQuery.isPending}
        />
      </main>
    </>
  );
}
