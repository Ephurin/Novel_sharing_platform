import { formatDateTime } from '../../shared/lib/format-vi';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { useAuthStore } from '../auth/useAuthStore';
import { getRandomPublishedNovel, listLatestPublishedChapters, searchPublishedNovelPage, type LatestPublishedChapter, type ReaderNovel } from './reader-api';
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
  { key: 'new', label: 'Mới cập nhật' },
];

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
  const latestChaptersQuery = useQuery({
    queryKey: ['reader-home-latest-chapters'],
    queryFn: ({ signal }) => listLatestPublishedChapters(12, signal),
    staleTime: 30_000,
    retry: false,
  });
  const completedQuery = useQuery({
    queryKey: ['reader-home-list', 'completed'],
    queryFn: () => searchPublishedNovelPage({ status: 'COMPLETED', sort: 'views', order: 'desc', page: 1, limit: 12 }),
    staleTime: 30_000,
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

  const featuredItems = useMemo(() => {
    const raw = activeFeatureQuery.data?.items ?? [];
    const seen = new Set<string>();
    const deduped: ReaderNovel[] = [];
    for (const novel of raw) {
      if (seen.has(novel.novelId)) continue;
      seen.add(novel.novelId);
      deduped.push(novel);
      if (deduped.length >= 12) break;
    }
    return deduped;
  }, [activeFeatureQuery.data?.items]);

  const featuredIds = useMemo(
    () => new Set(featuredItems.map(novel => novel.novelId)),
    [featuredItems]
  );

  const topFeaturedIds = useMemo(
    () => new Set(featuredItems.slice(0, 6).map(novel => novel.novelId)),
    [featuredItems]
  );

  const latestChapterEntries = useMemo<LatestPublishedChapter[]>(() => {
    const dedicated = latestChaptersQuery.data ?? [];
    if (dedicated.length > 0) return dedicated;
    const seen = new Set<string>();
    const fallback: LatestPublishedChapter[] = [];
    for (const novel of latestNovels) {
      if (!novel.latestChapter || seen.has(novel.latestChapter.chapterId)) continue;
      seen.add(novel.latestChapter.chapterId);
      fallback.push({
        chapterId: novel.latestChapter.chapterId,
        novelId: novel.novelId,
        chapterNumber: novel.latestChapter.chapterNumber,
        title: novel.latestChapter.title,
        publishedAt: novel.latestChapter.publishedAt ?? novel.updatedAt ?? null,
        novelTitle: novel.title,
        coverImageUrl: novel.coverImageUrl,
        genre: novel.genre,
        genres: novel.genres,
      });
    }
    return fallback;
  }, [latestChaptersQuery.data, latestNovels]);

  const chapterUpdateItems = useMemo(() => {
    const limit = chaptersExpanded ? 12 : 8;
    return latestChapterEntries.slice(0, limit);
  }, [latestChapterEntries, chaptersExpanded]);

  const chapterUpdatesLoading = latestChaptersQuery.isPending && latestQuery.isPending;
  const chapterUpdatesError = latestChaptersQuery.isError && latestQuery.isError && latestChapterEntries.length === 0;

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
    setPickingRandom(true);
    try {
      const randomPick = await getRandomPublishedNovel();
      if (randomPick?.novelId) {
        navigate(`${catalogPath}/novels/${randomPick.novelId}`);
        return;
      }
      const total = Math.max(latestQuery.data?.totalItems ?? 0, viewsQuery.data?.totalItems ?? 0);
      if (total > 0) {
        const randomPage = Math.floor(Math.random() * total) + 1;
        const pageData = await searchPublishedNovelPage({ page: randomPage, limit: 1, sort: 'updatedAt', order: 'desc' });
        if (pageData.items[0]) {
          navigate(novelPath(pageData.items[0]));
          return;
        }
      }
      if (catalogNovels.length > 0) {
        const chosen = catalogNovels[Math.floor(Math.random() * catalogNovels.length)];
        navigate(novelPath(chosen));
        return;
      }
      navigate(catalogPath);
    } catch {
      if (catalogNovels.length > 0) {
        const chosen = catalogNovels[Math.floor(Math.random() * catalogNovels.length)];
        navigate(novelPath(chosen));
      } else {
        navigate(catalogPath);
      }
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

            {/* 3. Chương mới cập nhật (full width cột chính, lấy trực tiếp theo thứ tự published_at của chương) */}
            <section className="sc-home-panel sc-home-section" aria-label="Chương mới cập nhật">
              <div className="sc-home-sec-head">
                <div className="sc-home-sec-left">
                  <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">schedule</span>
                  <h2>Chương mới cập nhật</h2>
                </div>
                {latestChapterEntries.length > 8 ? (
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

              {chapterUpdatesLoading ? (
                <div className="sc-home-chapter-list" aria-busy="true">
                  {Array.from({ length: 6 }, (_, idx) => (
                    <div key={idx} className="sc-home-chapter-row is-skeleton" aria-hidden="true">
                      <span className="sc-skeleton-block sc-home-chapter-thumb" />
                      <span className="sc-skeleton-block" style={{ width: '74%', height: 13 }} />
                      <span className="sc-skeleton-block sc-home-chapter-sub" style={{ width: '62%', height: 12 }} />
                      <span className="sc-skeleton-block" style={{ width: 64, height: 22, borderRadius: 999 }} />
                      <span className="sc-skeleton-block" style={{ width: 52, height: 11 }} />
                    </div>
                  ))}
                </div>
              ) : chapterUpdatesError ? (
                <div className="sc-home-inline-notice" role="alert">
                  <span>Chưa tải được danh sách chương mới.</span>
                  <button type="button" onClick={() => { void latestChaptersQuery.refetch(); void latestQuery.refetch(); }}>Thử lại</button>
                </div>
              ) : chapterUpdateItems.length === 0 ? (
                <div className="sc-home-empty-block">
                  <p>Chưa có chương mới nào được xuất bản.</p>
                </div>
              ) : (
                <div className="sc-home-chapter-list">
                  {chapterUpdateItems.map(item => {
                    const target = `${catalogPath}/chapters/${item.chapterId}`;
                    const badgeLabel = `Chương ${item.chapterNumber}`;
                    const cleanChapterTitle = item.title?.trim() ?? '';
                    const coverNovel = {
                      novelId: item.novelId,
                      title: item.novelTitle,
                      coverImageUrl: item.coverImageUrl,
                      genre: item.genre,
                      genres: item.genres,
                    };
                    return (
                      <Link
                        key={item.chapterId}
                        className="sc-home-chapter-row"
                        to={target}
                        title={cleanChapterTitle ? `${item.novelTitle} — ${cleanChapterTitle}` : item.novelTitle}
                      >
                        <span className="sc-home-chapter-thumb">
                          <HomeNovelCover novel={coverNovel} size="thumb" />
                        </span>
                        <strong className="sc-home-chapter-title">{item.novelTitle}</strong>
                        <span className="sc-home-chapter-sub">{cleanChapterTitle || badgeLabel}</span>
                        <span className="sc-home-chapter-badge">{badgeLabel}</span>
                        <time
                          className="sc-home-chapter-time"
                          dateTime={item.publishedAt ?? undefined}
                          title={item.publishedAt ? formatDateTime(item.publishedAt) : undefined}
                        >
                          {formatDateTime(item.publishedAt, 'relative')}
                        </time>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

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
                  {Array.from({ length: 12 }, (_, idx) => (
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
          topFeaturedIds={topFeaturedIds}
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
