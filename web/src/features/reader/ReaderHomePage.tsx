import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { AnimatedChoiceGroup } from '../../shared/components/AnimatedChoiceGroup';
import { HomeResults, HomeSectionState, NovelQuickPreview } from './HomeEnhancements';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingFilters, searchPublishedNovels, type ReaderNovel } from './reader-api';
import { useListScroll, useUrlFilters } from '../../shared/components/WorkspacePreferences';
import { HomeSearch } from './HomeSearch';
import { HomeGenres } from './HomeGenres';
import { ContinueReading } from './HomePersonalization';
import { AuthorSpotlight, CuratedShelves, GenreShowcase, WritingStudioBanner } from './HomeDiscoverySections';
import { HomeNovelCover } from './HomeNovelCover';
import booksTeaArt from '../../assets/home-books-tea.png';
import './reader-home.css';

const featureTabs = [
  { value: 'views', label: 'Nổi bật', icon: 'local_fire_department' },
  { value: 'likes', label: 'Được yêu thích', icon: 'favorite' },
  { value: 'updatedAt', label: 'Mới cập nhật', icon: 'update' }
] as const;
const statusLabels: Record<string, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành', HIATUS: 'Tạm ngưng' };
const count = (value = 0) => value.toLocaleString('vi-VN');
const primaryGenre = (novel: ReaderNovel) => novel.genres?.[0] || novel.genre || null;
const isCompletedNovel = (novel: ReaderNovel) => (novel.serialStatus ?? novel.status) === 'COMPLETED';
const novelStatusLabel = (novel: ReaderNovel) => statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra';

function shuffled(items: ReaderNovel[], seed: number) {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
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

export function ReaderHomePage() {
  const user = useAuthStore(state => state.user);
  const catalogPath = user && user.role !== 'ADMIN' ? '/reader' : '/public';
  const homeFilters = useUrlFilters({ featured: 'views' as typeof featureTabs[number]['value'], genre: '', page: 1 }, { featured: ['views', 'likes', 'updatedAt'] });
  const { featured: featureSort, genre, page } = homeFilters.values;
  const featurePage = page - 1;
  const setGenre = (next: string) => homeFilters.update({ genre: next });
  const [featureDirection, setFeatureDirection] = useState(0);
  const [seed, setSeed] = useState(() => Date.now());
  const [shuffleCount, setShuffleCount] = useState(0);
  const reduce = useReducedMotion();
  const featured = useQuery({ queryKey: ['reader-home-featured', featureSort], queryFn: () => searchPublishedNovels({ sort: featureSort, order: 'desc' }) });
  const ranking = useQuery({ queryKey: ['reader-home-featured', 'likes'], queryFn: () => searchPublishedNovels({ sort: 'likes', order: 'desc' }) });
  const latest = useQuery({ queryKey: ['reader-home-featured', 'updatedAt'], queryFn: () => searchPublishedNovels({ sort: 'updatedAt', order: 'desc' }) });
  const completed = useQuery({ queryKey: ['reader-home-completed'], queryFn: () => searchPublishedNovels({ status: 'COMPLETED', sort: 'views', order: 'desc' }) });
  const filters = useQuery({ queryKey: ['reading-filters'], queryFn: getReadingFilters, staleTime: 60_000 });
  const discovery = useQuery({
    queryKey: genre ? ['reader-home-discovery', genre] : ['reader-home-featured', 'updatedAt'],
    queryFn: () => searchPublishedNovels({ genre, sort: 'updatedAt', order: 'desc' })
  });
  useListScroll(!featured.isPending && !discovery.isPending);
  const suggestions = useMemo(() => shuffled(discovery.data ?? [], seed).slice(0, 6), [discovery.data, seed]);
  const featureNovels = (featured.data ?? []).slice(0, 8);
  const featurePages = Math.max(1, Math.ceil(featureNovels.length / 4));
  const currentPage = Math.min(featurePage, featurePages - 1);
  const visibleFeatureSlice = featureNovels.slice(currentPage * 4, currentPage * 4 + 4);
  const rankingNovels = useMemo(() => {
    const list = ranking.data ?? [];
    if (list.length <= 4) return list;
    const heroIds = new Set(visibleFeatureSlice.map(novel => novel.novelId));
    const overlapsHero = featureSort === 'views' && list.slice(0, 4).every(novel => heroIds.has(novel.novelId));
    const ordered = overlapsHero
      ? [...list.filter(novel => !heroIds.has(novel.novelId)), ...list.filter(novel => heroIds.has(novel.novelId))]
      : list;
    return ordered.slice(0, 5);
  }, [ranking.data, featureSort, visibleFeatureSlice]);
  const changeFeaturePage = (page: number) => {
    setFeatureDirection(Math.sign(page - currentPage));
    homeFilters.update({ page: page + 1 });
  };
  const completedNovels = (completed.data ?? []).slice(0, 5);
  const completedLayout = !completed.isPending && completedNovels.length >= 4 ? 'grid' : 'aside';
  const catalogNovels = useMemo(() => {
    const byId = new Map<string, ReaderNovel>();
    for (const list of [latest.data, featured.data, ranking.data, completed.data]) {
      for (const novel of list ?? []) {
        if (!byId.has(novel.novelId)) byId.set(novel.novelId, novel);
      }
    }
    return [...byId.values()];
  }, [latest.data, featured.data, ranking.data, completed.data]);
  const featuredExcludeIds = useMemo(() => new Set(visibleFeatureSlice.map(novel => novel.novelId)), [visibleFeatureSlice]);
  const isWriter = user?.role === 'AUTHOR' || user?.role === 'ADMIN';
  const novelPath = (novel: ReaderNovel) => `${catalogPath}/novels/${novel.novelId}`;

  return <>
    <a className="sc-home-skip-link" href="#home-main">Đến nội dung chính</a>
    <AuthorNavbar />
    <main id="home-main" tabIndex={-1} className="sc-shell-content sc-reader-home">
      <header className="sc-home-intro">
        <div className="sc-home-intro-copy">
          <span className="sc-home-eyebrow">Không gian đọc StoryCraft</span>
          <h1 className="text-page-title">Góc đọc truyện</h1>
          <p className="sc-home-intro-subtitle">Tìm một câu chuyện để say mê và một khoảnh khắc đọc thật riêng cho mình.</p>
          <HomeSearch catalogPath={catalogPath} />
        </div>
        <div className="sc-home-intro-art" aria-hidden="true">
          <img src={booksTeaArt} alt="" loading="eager" />
        </div>
      </header>

      <ContinueReading />

      <div className="sc-home-top">
        <section className="sc-home-featured" aria-label="Truyện nổi bật">
          <div className="sc-home-feature-heading">
            <AnimatedChoiceGroup className="sc-home-feature-tabs" label="Chọn truyện nổi bật" controls="home-feature-results" value={featureSort}
              onChange={value => { setFeatureDirection(0); homeFilters.update({ featured: value, page: 1 }); }}
              options={featureTabs.map(tab => ({ value: tab.value, label: <><Icon name={tab.icon} />{tab.label}</> }))} />
            <Link className="sc-home-more" to={catalogPath}>Danh sách <Icon name="arrow_forward" /></Link>
          </div>
          <div id="home-feature-results" aria-busy={featured.isFetching}>
          <HomeSectionState query={featured} empty="Chưa có truyện nổi bật" variant="featured" />
          <HomeResults identity={`${featureSort}-${currentPage}-${featureNovels.map(novel => novel.novelId).join(',')}`} direction={featureDirection} className="sc-home-feature-grid">
            {visibleFeatureSlice.map((novel, index) => {
              const genreName = primaryGenre(novel);
              return <motion.article key={novel.novelId} className="sc-home-feature-card"
                initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : index * 0.045, ease: [0.22, 1, 0.36, 1] }}>
                <Link className="sc-home-feature-cover sc-cover-hover" to={novelPath(novel)} aria-label={`Đọc truyện: ${novel.title}`}>
                  <div className="sc-home-feature-artwork"><HomeCover novel={novel} eager size="card" /></div>
                  <div className="sc-home-feature-caption">
                    <span data-completed={isCompletedNovel(novel) || undefined}>
                      <span className="sc-home-status-pill" data-completed={isCompletedNovel(novel) || undefined}>{novelStatusLabel(novel)}</span>
                      {genreName ? <span className="sc-home-feature-genre" translate="no"> · {genreName}</span> : null}
                    </span>
                    <h2>{novel.title}</h2>
                    <div className="sc-home-feature-stats">
                      <span><Icon name="menu_book" />{count(novel.chaptersCount)} chương</span>
                      <span><Icon name="visibility" />{count(novel.viewsCount)} lượt đọc</span>
                    </div>
                  </div>
                </Link><NovelQuickPreview novel={novel} to={novelPath(novel)} />
              </motion.article>;
            })}
          </HomeResults>
          </div>
          {featureNovels.length > 4 && <div className="sc-home-carousel-controls">
            <button type="button" className="sc-icon-button" aria-label="Truyện nổi bật trước" disabled={currentPage === 0} onClick={() => changeFeaturePage(currentPage - 1)}><Icon name="chevron_left" /></button>
            <span className="sc-home-page-label" role="status" aria-atomic="true">Trang {currentPage + 1} / {featurePages}</span>
            {Array.from({ length: featurePages }, (_, page) => <button key={page} type="button" className="sc-home-carousel-dot" aria-label={`Trang nổi bật ${page + 1}`} aria-pressed={page === currentPage} onClick={() => changeFeaturePage(page)} />)}
            <button type="button" className="sc-icon-button" aria-label="Truyện nổi bật tiếp theo" disabled={currentPage === featurePages - 1} onClick={() => changeFeaturePage(currentPage + 1)}><Icon name="chevron_right" /></button>
          </div>}
        </section>

        <aside className="sc-home-ranking" aria-label="Bảng yêu thích">
          <HomeHeading title="Yêu thích" icon="favorite" />
          <HomeSectionState query={ranking} empty="Chưa có truyện trong bảng xếp hạng" variant="ranking" />
          <ol>
            {rankingNovels.map((novel, index) => <li key={novel.novelId}>
              <span className="sc-home-rank" data-top={index < 3}>{String(index + 1).padStart(2, '0')}</span>
              <Link to={novelPath(novel)}><h3>{novel.title}</h3><span>{(novel.likesCount ?? 0) > 0 ? <><Icon name="favorite" />{count(novel.likesCount)} lượt thích</> : <><Icon name="visibility" />{count(novel.viewsCount)} lượt đọc</>}</span></Link>
            </li>)}
          </ol>
        </aside>
      </div>

      <section className="sc-home-panel sc-home-discovery" aria-label="Khám phá truyện">
        <div className="sc-home-discovery-heading">
          <HomeHeading title="Khám phá" icon="explore">
            <button className="sc-home-shuffle" type="button" disabled={discovery.isPending || discovery.isError || suggestions.length < 2} onClick={() => { setSeed(value => value + 1); setShuffleCount(c => c + 1); }}>
              <motion.span className="material-symbols-outlined" aria-hidden="true" animate={{ rotate: reduce ? 0 : shuffleCount * 180 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22 }}>shuffle</motion.span>
              Đổi gợi ý
            </button>
          </HomeHeading>
          <HomeGenres genres={filters.data?.genres ?? []} genre={genre} onChange={setGenre} />
        </div>
        {filters.isError && <button type="button" className="sc-home-more" onClick={() => void filters.refetch()}>Tải lại thể loại</button>}
        <p className="sc-home-results-summary text-meta" role="status" aria-atomic="true">{discovery.isPending ? `Đang tìm truyện${genre ? ` ${genre}` : ''}…` : discovery.isError ? '' : `${suggestions.length} gợi ý${genre ? ` cho thể loại ${genre}` : ' dành cho bạn'}`}</p>
        <div id="home-discovery-results" aria-busy={discovery.isFetching}>
        <HomeSectionState query={discovery} empty="Chưa có truyện thuộc thể loại này" onReset={genre ? () => setGenre('') : undefined} announceLoading={false} />
        <HomeResults identity={`${genre}-${discovery.data?.map(novel => novel.novelId).join(',') ?? ''}`} className="sc-home-discovery-grid">
          {suggestions.map(novel => <CompactNovel key={novel.novelId} novel={novel} to={novelPath(novel)} preview />)}
        </HomeResults>
        </div>
        {genre && <Link className="sc-home-genre-link" to={`${catalogPath}?genre=${encodeURIComponent(genre)}`}>Tất cả truyện {genre}<Icon name="arrow_forward" /></Link>}
      </section>

      <GenreShowcase genres={filters.data?.genres ?? []} catalogNovels={catalogNovels} catalogPath={catalogPath} />

      <CuratedShelves catalogNovels={catalogNovels} excludeIds={featuredExcludeIds} catalogPath={catalogPath} />

      <div className="sc-home-bottom" data-completed-layout={completedLayout}>
        <section className="sc-home-panel sc-home-updates-panel" aria-label="Truyện mới cập nhật">
          <HomeHeading title="Mới cập nhật" icon="update"><Link className="sc-home-more" to={`${catalogPath}?sort=updatedAt:desc`}>Xem thêm<Icon name="arrow_forward" /></Link></HomeHeading>
          <HomeSectionState query={latest} empty="Chưa có truyện cập nhật" variant="rows" />
          <div className="sc-home-updates">
            {(latest.data ?? []).slice(0, 6).map(novel => <article className="sc-home-update" key={novel.novelId}>
              <Link className="sc-home-update-cover" to={novelPath(novel)} aria-label={`Đọc truyện: ${novel.title}`}><HomeCover novel={novel} size="thumb" /></Link>
              <div className="sc-home-update-info">
                <Link className="sc-home-novel-title" to={novelPath(novel)}>{novel.title}</Link>
                {novel.latestChapter ? <Link className="sc-home-chapter" to={`${catalogPath}/chapters/${novel.latestChapter.chapterId}`}>{/^\s*(?:chương|chapter)\s*\d+/iu.test(novel.latestChapter.title) ? novel.latestChapter.title : `Chương ${novel.latestChapter.chapterNumber}: ${novel.latestChapter.title}`}</Link> : <span className="sc-home-chapter">{count(novel.chaptersCount)} chương</span>}
              </div>
              <span className="sc-home-update-status" data-completed={isCompletedNovel(novel) || undefined}>{novelStatusLabel(novel)}</span>
              <time className="sc-home-time" dateTime={novel.updatedAt} title={novel.updatedAt ? new Date(novel.updatedAt).toLocaleString('vi-VN') : undefined}>{relativeTime(novel.updatedAt)}</time>
            </article>)}
          </div>
        </section>
        <section className="sc-home-panel sc-home-completed" data-layout={completedLayout} data-count={completedNovels.length} aria-label="Truyện đã hoàn thành">
          <HomeHeading title="Đã hoàn thành" icon="task_alt"><Link className="sc-home-more" to={`${catalogPath}?status=COMPLETED`}>Xem thêm<Icon name="arrow_forward" /></Link></HomeHeading>
          <HomeSectionState query={completed} empty="Chưa có truyện hoàn thành" variant={completedLayout === 'grid' ? 'completed' : 'compact'} />
          <div className="sc-home-completed-list">{completedNovels.map(novel => <CompactNovel key={novel.novelId} novel={novel} to={novelPath(novel)} coverSize={completedLayout === 'grid' ? 'card' : 'thumb'} />)}</div>
          {completedLayout === 'aside' && completedNovels.length > 0 && <div className="sc-home-completed-foot">
            <span>Đọc trọn bộ không cần chờ chương mới.</span>
            <Link className="sc-home-more" to={`${catalogPath}?status=COMPLETED`}>Tất cả truyện hoàn thành<Icon name="arrow_forward" /></Link>
          </div>}
        </section>
      </div>

      <AuthorSpotlight catalogNovels={catalogNovels} />

      <WritingStudioBanner isWriter={isWriter} isSignedIn={Boolean(user)} catalogPath={catalogPath} />

      <footer className="sc-home-footer">
        <div className="sc-home-footer-identity">
          <Link to="/" className="sc-home-footer-brand">StoryCraft <span>Văn Hoa</span></Link>
          <span className="sc-home-footer-tagline">Nơi những câu chuyện bắt đầu và tiếp nối.</span>
        </div>
        <Link to={catalogPath}>Danh sách truyện<Icon name="arrow_forward" /></Link>
      </footer>
    </main>
  </>;
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function HomeCover({ novel, eager = false, size = 'thumb' }: { novel: ReaderNovel; eager?: boolean; size?: 'card' | 'thumb' }) {
  return <HomeNovelCover novel={novel} eager={eager} size={size} />;
}

function HomeHeading({ title, icon, children }: { title: string; icon: string; children?: ReactNode }) {
  return <div className="sc-home-section-heading"><h2><Icon name={icon} />{title}</h2>{children}</div>;
}

function CompactNovel({ novel, to, preview = false, coverSize = 'thumb' }: { novel: ReaderNovel; to: string; preview?: boolean; coverSize?: 'card' | 'thumb' }) {
  const reduce = useReducedMotion();
  const genreName = primaryGenre(novel);
  return <motion.article layout={reduce ? false : 'position'} transition={{ duration: .2 }} className="sc-home-compact">
    <Link className="sc-home-compact-cover sc-cover-hover" to={to} aria-label={`Đọc truyện: ${novel.title}`}><HomeCover novel={novel} size={coverSize} /></Link>
    <div>
      <Link className="sc-home-novel-title" to={to}>{novel.title}</Link>
      <span className="sc-home-compact-status"><span data-completed={isCompletedNovel(novel) || undefined}>{novelStatusLabel(novel)}</span>{genreName && <span className="sc-home-compact-genre" translate="no"> · {genreName}</span>}</span>
      <span className="sc-home-compact-metrics">{count(novel.chaptersCount)} chương<span>·</span>{count(novel.viewsCount)} lượt đọc</span>
    </div>
    {preview && <NovelQuickPreview novel={novel} to={to} />}
  </motion.article>;
}
