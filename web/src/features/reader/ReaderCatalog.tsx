import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { Pagination, Select, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ResponsiveFilters } from '../../shared/components/InteractionWidgets';
import { ActiveFilterChips } from '../../shared/components/AuthorAdminMotion';
import { useListScroll, useUrlFilters } from '../../shared/components/WorkspacePreferences';
import { HomeResults, HomeSectionState, NovelQuickPreview } from './HomeEnhancements';
import { getReadingFilters, searchPublishedNovelPage, type ReaderNovel, type SearchPublishedNovelsInput } from './reader-api';
import './reader-home.css';
import './reader-catalog.css';

const sorts = [
  ['updatedAt:desc', 'Mới cập nhật'], ['updatedAt:asc', 'Cập nhật cũ nhất'],
  ['views:desc', 'Lượt đọc: nhiều đến ít'], ['views:asc', 'Lượt đọc: ít đến nhiều'],
  ['likes:desc', 'Lượt thích: nhiều đến ít'], ['likes:asc', 'Lượt thích: ít đến nhiều'],
  ['wordCount:desc', 'Số từ: nhiều đến ít'], ['wordCount:asc', 'Số từ: ít đến nhiều'],
  ['title:asc', 'Tên truyện: A–Z'], ['title:desc', 'Tên truyện: Z–A']
];
const statuses = [['', 'Tất cả'], ['ONGOING', 'Đang ra'], ['COMPLETED', 'Hoàn thành'], ['HIATUS', 'Tạm ngưng']];
const defaults = { q: '', genre: '', tag: '', status: '', sort: 'updatedAt:desc', page: 1 };

export function ReaderCatalog({ publicMode = false }: { publicMode?: boolean }) {
  const client = useQueryClient();
  const filters = useUrlFilters(defaults, { status: statuses.map(item => item[0]), sort: sorts.map(item => item[0]) });
  const { q, genre, tag, status, sort, page } = filters.values;
  const [debounced] = useDebouncedValue(q, 250);
  const waiting = q !== debounced;
  const [sortField, order] = sort.split(':');
  const key = ['reader-catalog', publicMode, debounced, genre, tag, status, sort, page];
  const result = useQuery({ queryKey: key, queryFn: ({ signal }) => searchPublishedNovelPage({
    q: debounced.trim(), genre, tag, status: status as SearchPublishedNovelsInput['status'],
    sort: sortField as SearchPublishedNovelsInput['sort'], order: order as 'asc' | 'desc', page, limit: 20
  }, signal), enabled: !waiting });
  useEffect(() => { if (waiting) void client.cancelQueries({ queryKey: key, exact: true }); }, [waiting, client, JSON.stringify(key)]);
  useEffect(() => {
    if (!waiting && result.data && page > result.data.totalPages) filters.update({ page: result.data.totalPages });
  }, [waiting, result.data?.totalPages, page]);
  const busy = waiting || result.isPending;
  useListScroll(!busy);
  const change = (patch: Partial<typeof defaults>) => filters.update({ ...patch, page: 1 });
  const reset = () => filters.update(defaults);
  const active = [
    ...(q ? [{ id: 'q', label: `Tìm: ${q}`, onRemove: () => change({ q: '' }) }] : []),
    ...(genre ? [{ id: 'genre', label: `Thể loại: ${genre}`, onRemove: () => change({ genre: '' }) }] : []),
    ...(tag ? [{ id: 'tag', label: `Thẻ: ${tag}`, onRemove: () => change({ tag: '' }) }] : []),
    ...(status ? [{ id: 'status', label: `Trạng thái: ${statuses.find(item => item[0] === status)?.[1]}`, onRemove: () => change({ status: '' }) }] : []),
    ...(sort !== defaults.sort ? [{ id: 'sort', label: `Sắp xếp: ${sorts.find(item => item[0] === sort)?.[1]}`, onRemove: () => change({ sort: defaults.sort }) }] : [])
  ];
  const taxonomy = useQuery({ queryKey: ['reading-filters'], queryFn: getReadingFilters, staleTime: 60_000 });
  const items = busy ? [] : result.data?.items ?? [];
  const base = publicMode ? '/public' : '/reader';
  const select = (field: 'genre' | 'tag', label: string, data: string[]) => <Select value={filters.values[field] || null}
    aria-label={label} placeholder={label} searchable clearable data={data}
    onChange={value => change({ [field]: value ?? '' })} nothingFoundMessage="Không có lựa chọn phù hợp"
    clearButtonProps={{ 'aria-label': `Bỏ ${label.toLowerCase()}`, 'aria-hidden': false, tabIndex: 0 }} comboboxProps={{ withinPortal: false }} />;

  return <div className="sc-catalog">
    <h1 className="text-page-title">{publicMode ? 'Thư viện công khai' : 'Danh sách truyện'}</h1>
    <ResponsiveFilters className="sc-catalog-filters">
      <TextInput label="Tìm truyện" aria-label="Tìm truyện" value={q} maxLength={200} data-testid="reader-search-input"
        placeholder="Tìm theo tên truyện, giới thiệu…" onChange={event => change({ q: event.currentTarget.value })} />
      <div className="sc-catalog-filter-row">
        {select('genre', 'Lọc theo thể loại', taxonomy.data?.genres ?? [])}
        {select('tag', 'Lọc theo thẻ', taxonomy.data?.tags ?? [])}
        <label className="sc-catalog-sort" htmlFor="reader-sort">Sắp xếp<select id="reader-sort" value={sort} onChange={event => change({ sort: event.target.value })}>
          {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <div className="sc-catalog-status" role="group" aria-label="Lọc theo trạng thái">
        {statuses.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => change({ status: value })}>{label}</button>)}
      </div>
      {taxonomy.isError && <button type="button" className="sc-button" onClick={() => void taxonomy.refetch()}>Tải lại bộ lọc</button>}
    </ResponsiveFilters>
    {active.length > 0 && <div className="sc-catalog-active"><ActiveFilterChips items={active} /><button type="button" className="sc-button" onClick={reset}>Xóa tất cả bộ lọc</button></div>}
    <p className="sc-catalog-summary" role="status" aria-atomic="true">{busy ? 'Đang tải danh sách truyện…' : result.isError ? '' : `${result.data?.totalItems ?? 0} truyện · Trang ${page} / ${result.data?.totalPages ?? 1}`}</p>
    <section aria-label="Kết quả truyện" aria-busy={busy || result.isFetching}>
      <HomeSectionState query={{ isPending: busy, isError: !busy && result.isError, data: busy ? undefined : items, refetch: result.refetch }}
        variant="featured" empty="Không tìm thấy truyện" announceLoading={false} onReset={active.length ? reset : undefined} />
      <HomeResults identity={JSON.stringify([filters.values, items.map(item => item.novelId)])} className="sc-novel-grid">
        {items.map(novel => <CatalogCard key={novel.novelId} novel={novel} to={`${base}/novels/${novel.novelId}`} />)}
      </HomeResults>
    </section>
    {!busy && result.data && result.data.totalPages > 1 && <nav className="sc-catalog-pagination" aria-label="Phân trang truyện">
      <Pagination total={result.data.totalPages} value={page} onChange={next => { filters.update({ page: next }); window.scrollTo({ top: 0, behavior: 'instant' }); }}
        siblings={1} boundaries={1} getItemProps={item => ({ 'aria-label': `Trang ${item}` })} />
    </nav>}
  </div>;
}

function CatalogCard({ novel, to }: { novel: ReaderNovel; to: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const labels: Record<string, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành', HIATUS: 'Tạm ngưng', PUBLISHED: 'Đã xuất bản' };
  return <article className="sc-novel-card sc-reader-book sc-catalog-card">
    <Link className="sc-book-cover sc-cover-hover" to={to} aria-label={`Đọc truyện: ${novel.title}`}>
      {novel.coverImageUrl && failedUrl !== novel.coverImageUrl ? <img src={novel.coverImageUrl} alt="" loading="lazy" onError={() => setFailedUrl(novel.coverImageUrl ?? undefined)} /> : <span className="sc-cover-placeholder" aria-hidden="true">{novel.title}</span>}
      <span className="sc-book-status">{labels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra'}</span>
    </Link>
    <div className="sc-book-info">
      <Link to={to} className="sc-book-title" title={novel.title}>{novel.title}</Link>
      <div className="sc-book-metrics"><span>{novel.chaptersCount ?? 0} chương</span><span>{(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc</span></div>
    </div>
    <NovelQuickPreview novel={novel} to={to} />
  </article>;
}
