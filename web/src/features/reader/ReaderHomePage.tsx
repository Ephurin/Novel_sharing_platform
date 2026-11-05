import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AuthorNavbar } from '../../shared/components/AuthorTheme';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingFilters, searchPublishedNovels, type ReaderNovel } from './reader-api';
import './reader-home.css';

const featureTabs = [
  { value: 'views', label: 'Nổi bật', icon: 'local_fire_department' },
  { value: 'likes', label: 'Được yêu thích', icon: 'favorite' },
  { value: 'updatedAt', label: 'Mới cập nhật', icon: 'update' }
] as const;
const statusLabels: Record<string, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành', HIATUS: 'Tạm ngưng' };
const count = (value = 0) => value.toLocaleString('vi-VN');

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
  const navigate = useNavigate();
  const catalogPath = user && user.role !== 'ADMIN' ? '/reader' : '/public';
  const [search, setSearch] = useState('');
  const [featureSort, setFeatureSort] = useState<typeof featureTabs[number]['value']>('views');
  const [featurePage, setFeaturePage] = useState(0);
  const [genre, setGenre] = useState('');
  const [seed, setSeed] = useState(() => Date.now());
  const featured = useQuery({ queryKey: ['reader-home-featured', featureSort], queryFn: () => searchPublishedNovels({ sort: featureSort, order: 'desc' }) });
  const popular = useQuery({ queryKey: ['reader-home-featured', 'views'], queryFn: () => searchPublishedNovels({ sort: 'views', order: 'desc' }) });
  const latest = useQuery({ queryKey: ['reader-home-featured', 'updatedAt'], queryFn: () => searchPublishedNovels({ sort: 'updatedAt', order: 'desc' }) });
  const completed = useQuery({ queryKey: ['reader-home-completed'], queryFn: () => searchPublishedNovels({ status: 'COMPLETED', sort: 'views', order: 'desc' }) });
  const filters = useQuery({ queryKey: ['reading-filters'], queryFn: getReadingFilters, staleTime: 60_000 });
  const discovery = useQuery({ queryKey: ['reader-home-discovery', genre], queryFn: () => searchPublishedNovels({ genre, sort: 'updatedAt', order: 'desc' }) });
  const suggestions = useMemo(() => shuffled(discovery.data ?? [], seed).slice(0, 6), [discovery.data, seed]);
  const featureNovels = (featured.data ?? []).slice(0, 8);
  const featurePages = Math.max(1, Math.ceil(featureNovels.length / 4));
  const currentPage = Math.min(featurePage, featurePages - 1);
  const novelPath = (novel: ReaderNovel) => `${catalogPath}/novels/${novel.novelId}`;

  return <>
    <AuthorNavbar />
    <main className="sc-shell-content sc-reader-home">
      <header className="sc-home-intro">
        <div><p className="sc-home-eyebrow">STORYCRAFT · VĂN HOA</p><h1>Góc đọc truyện</h1><p>Tìm câu chuyện tiếp theo của bạn.</p></div>
        <form className="sc-home-search" role="search" onSubmit={event => {
          event.preventDefault();
          navigate(`${catalogPath}${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
        }}>
          <Icon name="search" />
          <input aria-label="Tìm truyện trên trang chủ" placeholder="Bạn muốn đọc truyện gì?" value={search} onChange={event => setSearch(event.target.value)} />
          <button type="submit" aria-label="Tìm truyện"><Icon name="arrow_forward" /></button>
        </form>
      </header>

      <div className="sc-home-top">
        <section className="sc-home-featured" aria-label="Truyện nổi bật">
          <div className="sc-home-feature-heading">
            <div className="sc-home-feature-tabs" role="group" aria-label="Chọn truyện nổi bật">
              {featureTabs.map(tab => <button key={tab.value} type="button" aria-pressed={featureSort === tab.value} onClick={() => { setFeatureSort(tab.value); setFeaturePage(0); }}><Icon name={tab.icon} />{tab.label}</button>)}
            </div>
            <Link className="sc-home-more" to={catalogPath}>Danh sách <Icon name="arrow_forward" /></Link>
          </div>
          <SectionState query={featured} empty="Chưa có truyện nổi bật" />
          <div className="sc-home-feature-grid">
            {featureNovels.slice(currentPage * 4, currentPage * 4 + 4).map(novel => <Link key={novel.novelId} className="sc-home-feature-cover sc-cover-hover" to={novelPath(novel)} aria-label={`Đọc truyện: ${novel.title}`}>
              <HomeCover novel={novel} />
              <div className="sc-home-feature-caption"><span>{statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra'}</span><h2>{novel.title}</h2></div>
            </Link>)}
          </div>
          {featureNovels.length > 4 && <div className="sc-home-carousel-controls">
            <button type="button" className="sc-icon-button" aria-label="Truyện nổi bật trước" disabled={currentPage === 0} onClick={() => setFeaturePage(page => page - 1)}><Icon name="chevron_left" /></button>
            {Array.from({ length: featurePages }, (_, page) => <button key={page} type="button" className="sc-home-carousel-dot" aria-label={`Trang nổi bật ${page + 1}`} aria-pressed={page === currentPage} onClick={() => setFeaturePage(page)} />)}
            <button type="button" className="sc-icon-button" aria-label="Truyện nổi bật tiếp theo" disabled={currentPage === featurePages - 1} onClick={() => setFeaturePage(page => page + 1)}><Icon name="chevron_right" /></button>
          </div>}
        </section>

        <aside className="sc-home-ranking" aria-label="Bảng đọc nhiều">
          <HomeHeading title="Đọc nhiều" icon="trending_up" />
          <SectionState query={popular} empty="Chưa có truyện trong bảng đọc nhiều" />
          <ol>
            {(popular.data ?? []).slice(0, 5).map((novel, index) => <li key={novel.novelId}>
              <span className="sc-home-rank" data-top={index < 3}>{String(index + 1).padStart(2, '0')}</span>
              <Link to={novelPath(novel)}><h3>{novel.title}</h3><span><Icon name="visibility" />{count(novel.viewsCount)} lượt đọc</span></Link>
            </li>)}
          </ol>
        </aside>
      </div>

      <section className="sc-home-panel sc-home-discovery" aria-label="Khám phá truyện">
        <div className="sc-home-discovery-heading">
          <HomeHeading title="Khám phá" icon="explore"><button className="sc-home-shuffle" type="button" onClick={() => setSeed(value => value + 1)}><Icon name="shuffle" />Đổi gợi ý</button></HomeHeading>
          <div className="sc-home-genres" role="group" aria-label="Khám phá theo thể loại">
            <button type="button" aria-pressed={!genre} onClick={() => setGenre('')}>Tất cả</button>
            {(filters.data?.genres ?? []).map(name => <button key={name} type="button" aria-pressed={genre === name} onClick={() => setGenre(name)}>{name}</button>)}
          </div>
        </div>
        {filters.isError && <button type="button" className="sc-home-more" onClick={() => void filters.refetch()}>Tải lại thể loại</button>}
        <SectionState query={discovery} empty="Chưa có truyện thuộc thể loại này" />
        <div className="sc-home-discovery-grid">
          {suggestions.map(novel => <CompactNovel key={novel.novelId} novel={novel} to={novelPath(novel)} />)}
        </div>
        {genre && <Link className="sc-home-genre-link" to={`${catalogPath}?genre=${encodeURIComponent(genre)}`}>Tất cả truyện {genre}<Icon name="arrow_forward" /></Link>}
      </section>

      <div className="sc-home-bottom">
        <section className="sc-home-panel" aria-label="Truyện mới cập nhật">
          <HomeHeading title="Mới cập nhật" icon="update"><Link className="sc-home-more" to={catalogPath}>Tất cả truyện<Icon name="arrow_forward" /></Link></HomeHeading>
          <SectionState query={latest} empty="Chưa có truyện cập nhật" />
          <div className="sc-home-updates">
            {(latest.data ?? []).slice(0, 10).map(novel => <article className="sc-home-update" key={novel.novelId}>
              <Link className="sc-home-update-cover" to={novelPath(novel)} aria-label={`Đọc truyện: ${novel.title}`}><HomeCover novel={novel} /></Link>
              <div className="sc-home-update-info">
                <Link className="sc-home-novel-title" to={novelPath(novel)}>{novel.title}</Link>
                {novel.latestChapter ? <Link className="sc-home-chapter" to={`${catalogPath}/chapters/${novel.latestChapter.chapterId}`}>{/^\s*(?:chương|chapter)\s*\d+/iu.test(novel.latestChapter.title) ? novel.latestChapter.title : `Chương ${novel.latestChapter.chapterNumber}: ${novel.latestChapter.title}`}</Link> : <span className="sc-home-chapter">{count(novel.chaptersCount)} chương</span>}
              </div>
              <span className="sc-home-update-status">{statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra'}</span>
              <time className="sc-home-time" dateTime={novel.updatedAt} title={novel.updatedAt ? new Date(novel.updatedAt).toLocaleString('vi-VN') : undefined}>{relativeTime(novel.updatedAt)}</time>
            </article>)}
          </div>
        </section>
        <aside className="sc-home-panel sc-home-completed" aria-label="Truyện đã hoàn thành">
          <HomeHeading title="Đã hoàn thành" icon="task_alt" />
          <SectionState query={completed} empty="Chưa có truyện hoàn thành" />
          <div className="sc-home-completed-list">{(completed.data ?? []).slice(0, 5).map(novel => <CompactNovel key={novel.novelId} novel={novel} to={novelPath(novel)} />)}</div>
          <Link className="sc-home-more sc-home-completed-more" to={catalogPath}>Tìm thêm truyện<Icon name="arrow_forward" /></Link>
        </aside>
      </div>
      <footer className="sc-home-footer"><Link to="/" className="sc-home-footer-brand">StoryCraft <span>Văn Hoa</span></Link><span>Mỗi câu chuyện mở ra một thế giới.</span><Link to={catalogPath}>Danh sách truyện<Icon name="arrow_forward" /></Link></footer>
    </main>
  </>;
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function HomeCover({ novel }: { novel: ReaderNovel }) {
  const [failed, setFailed] = useState(false);
  return novel.coverImageUrl && !failed
    ? <img src={novel.coverImageUrl} alt={novel.title} loading="lazy" onError={() => setFailed(true)} />
    : <span className="sc-home-cover-placeholder"><Icon name="auto_stories" /><span>{novel.title}</span></span>;
}

function HomeHeading({ title, icon, children }: { title: string; icon: string; children?: ReactNode }) {
  return <div className="sc-home-section-heading"><h2><Icon name={icon} />{title}</h2>{children}</div>;
}

function CompactNovel({ novel, to }: { novel: ReaderNovel; to: string }) {
  return <article className="sc-home-compact">
    <Link className="sc-home-compact-cover sc-cover-hover" to={to} aria-label={`Đọc truyện: ${novel.title}`}><HomeCover novel={novel} /></Link>
    <div><Link className="sc-home-novel-title" to={to}>{novel.title}</Link><span className="sc-home-compact-status">{statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra'}</span><span className="sc-home-compact-metrics">{count(novel.chaptersCount)} chương<span>·</span>{count(novel.viewsCount)} lượt đọc</span></div>
  </article>;
}

function SectionState({ query, empty }: { query: { isPending: boolean; isError: boolean; error: unknown; data?: ReaderNovel[]; refetch: () => unknown }; empty: string }) {
  if (query.isPending) return <LoadingState label="Đang tải truyện..." />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data?.length) return <EmptyState title={empty} description="Các truyện đã xuất bản sẽ xuất hiện tại đây." />;
  return null;
}
