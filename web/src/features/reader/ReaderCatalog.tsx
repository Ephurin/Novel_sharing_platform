import { novelHref } from '../../shared/routes';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useListScroll, useUrlFilters } from '../../shared/components/WorkspacePreferences';
import { getReadingFilters, searchPublishedNovelPage, type ReaderNovel, type SearchPublishedNovelsInput } from './reader-api';
import { ReaderFilterBar } from './ReaderFilterBar';
import './reader-catalog.css';

const PAGE_SIZE = 20;

const sorts = [
  ['updatedAt:desc', 'Mới cập nhật'],
  ['views:desc', 'Nhiều lượt đọc'],
  ['likes:desc', 'Nhiều lượt thích'],
  ['wordCount:desc', 'Nhiều từ nhất'],
  ['title:asc', 'Tên truyện (A–Z)'],
  ['title:desc', 'Tên truyện (Z–A)'],
  ['updatedAt:asc', 'Cập nhật cũ nhất'],
  ['views:asc', 'Ít lượt đọc nhất']
] as const;

const statuses = [
  ['', 'Tất cả'],
  ['ONGOING', 'Đang ra'],
  ['COMPLETED', 'Hoàn thành'],
  ['HIATUS', 'Tạm ngưng']
] as const;

const defaults = {
  q: '',
  genre: [] as string[],
  tag: [] as string[],
  status: '',
  sort: 'updatedAt:desc',
  page: 1
};

const placeholderVariants = ['violet', 'beige', 'sage', 'blue', 'night', 'rose'] as const;
const placeholderSymbols = ['✦', '☁', '✺', '❋', '✧', '❧', '◌', '⌛'] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function isRecentlyUpdated(dateStr?: string | null) {
  if (!dateStr) return false;
  const timestamp = Date.parse(dateStr);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= 7 * 24 * 60 * 60 * 1000;
}

function buildPaginationRange(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function ReaderCatalog({ publicMode = false }: { publicMode?: boolean }) {
  const client = useQueryClient();
  const filters = useUrlFilters(defaults, {
    status: statuses.map((item) => item[0]),
    sort: sorts.map((item) => item[0])
  });
  const { q, genre, tag, status, sort, page } = filters.values;
  const [debounced] = useDebouncedValue(q, 250);
  const waiting = q !== debounced;
  const [sortField, order] = sort.split(':');
  const key = ['reader-catalog', publicMode, debounced, genre, tag, status, sort, page];
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      searchPublishedNovelPage(
        {
          q: debounced.trim(),
          genres: genre,
          tags: tag,
          status: status as SearchPublishedNovelsInput['status'],
          sort: sortField as SearchPublishedNovelsInput['sort'],
          order: order as 'asc' | 'desc',
          page,
          limit: PAGE_SIZE
        },
        signal
      ),
    enabled: !waiting
  });

  const taxonomy = useQuery({
    queryKey: ['reading-filters'],
    queryFn: getReadingFilters,
    staleTime: 60_000
  });

  useEffect(() => {
    if (waiting) void client.cancelQueries({ queryKey: key, exact: true });
  }, [waiting, client, JSON.stringify(key)]);

  useEffect(() => {
    if (!waiting && result.data && page > result.data.totalPages) {
      filters.update({ page: result.data.totalPages });
    }
  }, [waiting, result.data?.totalPages, page]);

  const busy = waiting || result.isPending;
  useListScroll(!busy);

  const change = (patch: Partial<typeof defaults>) => filters.update({ ...patch, page: 1 });
  const reset = () => filters.update(defaults);


  const items = busy ? [] : result.data?.items ?? [];
  // UI-18: when most cards on the page were updated this week, "Mới" tells the reader nothing.
  const recentCount = items.filter((novel) => isRecentlyUpdated(novel.lastUpdatedAt ?? novel.updatedAt)).length;
  const newBadgeMeaningful = recentCount <= items.length / 2;
  const totalItems = result.data?.totalItems;
  const totalPages = result.data?.totalPages ?? 1;

  const hasAnyFilter = genre.length + tag.length + (status ? 1 : 0) > 0 || Boolean(q.trim());
  const base = publicMode ? '/public' : '/reader';

  const genreOptions = [...new Set([...(taxonomy.data?.genres ?? []), ...genre])];
  const tagOptions = [...new Set([...(taxonomy.data?.tags ?? []), ...tag])];

  const handlePageChange = (nextPage: number) => {
    if (nextPage === page || nextPage < 1 || nextPage > totalPages) return;
    filters.update({ page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="sc-catalog-page">
      <div className="sc-catalog-columns">
        <section className="sc-catalog-left" aria-label="Kết quả truyện" aria-busy={busy || result.isFetching}>
          <div className="sc-catalog-topbar">
            <h1 className="sc-catalog-title">
              DANH SÁCH TRUYỆN
              {!busy && !result.isError && typeof totalItems === 'number' && (
                <span className="sc-catalog-title-count"> ({totalItems.toLocaleString('vi-VN')})</span>
              )}
            </h1>
          </div>

          <ReaderFilterBar
            value={{ genres: genre, tags: tag, status }}
            genreOptions={genreOptions}
            tagOptions={tagOptions}
            statuses={statuses}
            taxonomy={{ pending: taxonomy.isPending, error: taxonomy.isError, retry: () => void taxonomy.refetch() }}
            onChange={(patch) => change({ ...(patch.genres ? { genre: patch.genres } : {}), ...(patch.tags ? { tag: patch.tags } : {}), ...(patch.status !== undefined ? { status: patch.status } : {}) })}
            onReset={() => change({ genre: [], tag: [], status: '' })}
            trailing={
              <div className="sc-catalog-order">
                <span>Sắp xếp</span>
                <select
                  id="reader-sort"
                  aria-label="Sắp xếp truyện"
                  value={sort}
                  onChange={(event) => change({ sort: event.target.value })}
                >
                  {sorts.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          <div className="sc-catalog-stories">
            {busy ? (
              Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="sc-catalog-skeleton" aria-hidden="true">
                  <div className="sc-catalog-skeleton-cover" />
                  <div className="sc-catalog-skeleton-body">
                    <div className="sc-catalog-skeleton-line" style={{ width: '78%' }} />
                    <div className="sc-catalog-skeleton-line" style={{ width: '48%', height: '12px' }} />
                    <div className="sc-catalog-skeleton-line" style={{ width: '92%', height: '12px' }} />
                    <div className="sc-catalog-skeleton-line" style={{ width: '65%', height: '12px', marginTop: 'auto' }} />
                  </div>
                </div>
              ))
            ) : result.isError ? (
              <div className="sc-catalog-empty">
                <div className="sc-catalog-empty-icon" aria-hidden="true">
                  ⚠
                </div>
                <h3>Không thể tải danh sách truyện</h3>
                <p>Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại.</p>
                <button type="button" onClick={() => void result.refetch()}>
                  Tải lại
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="sc-catalog-empty">
                <div className="sc-catalog-empty-icon" aria-hidden="true">
                  ⌕
                </div>
                <h3>Chưa tìm thấy truyện phù hợp</h3>
                <p>Hãy thử thay đổi từ khóa hoặc bộ lọc nhé.</p>
                {hasAnyFilter && (
                  <button type="button" onClick={reset}>
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            ) : (
              items.map((novel) => (
                <CatalogCard key={novel.novelId} novel={novel} to={novelHref(novel, base)} newBadgeMeaningful={newBadgeMeaningful} />
              ))
            )}
          </div>

          {!busy && !result.isError && totalPages > 1 && (
            <nav className="sc-catalog-pagination" aria-label="Phân trang">
              <button
                type="button"
                className="sc-catalog-pg"
                aria-label="Trang trước"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                ‹
              </button>
              {buildPaginationRange(page, totalPages).map((entry, idx) =>
                entry === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="sc-catalog-pg-ellipsis" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={`sc-catalog-pg${page === entry ? ' active' : ''}`}
                    aria-label={`Trang ${entry}`}
                    aria-current={page === entry ? 'page' : undefined}
                    onClick={() => handlePageChange(entry)}
                  >
                    {entry}
                  </button>
                )
              )}
              <button
                type="button"
                className="sc-catalog-pg"
                aria-label="Trang sau"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                ›
              </button>
            </nav>
          )}
        </section>

      </div>
    </div>
  );
}

const cardStatusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng'
};

function CatalogCard({ novel, to, newBadgeMeaningful = true }: { novel: ReaderNovel; to: string; newBadgeMeaningful?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const statusCode = novel.serialStatus ?? novel.status ?? 'ONGOING';
  const statusLabel = cardStatusLabels[statusCode] ?? 'Đang ra';
  const statusClass =
    statusCode === 'COMPLETED' ? 'completed' : statusCode === 'HIATUS' ? 'pause' : '';

  const novelGenres = [...new Set(novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [])];
  const genreKeys = new Set(novelGenres.map((item) => item.trim().toLowerCase()));
  const novelTags = [...new Set((novel.tags ?? []).filter((item) => !genreKeys.has(item.trim().toLowerCase())))];
  const remainingSlots = Math.max(0, 3 - novelGenres.length);
  const visibleTags = novelTags.slice(0, remainingSlots);
  const hiddenTags = novelTags.slice(remainingSlots);
  const extraCount = hiddenTags.length;

  const hash = hashString(novel.novelId || novel.title);
  const variant = placeholderVariants[hash % placeholderVariants.length];
  const symbol = placeholderSymbols[hash % placeholderSymbols.length];
  const showNewBadge = newBadgeMeaningful && isRecentlyUpdated(novel.lastUpdatedAt ?? novel.updatedAt);

  return (
    <article className="sc-catalog-story">
      <Link
        className="sc-catalog-cover"
        to={to}
        data-variant={variant}
        aria-label={`Đọc truyện: ${novel.title}`}
        data-testid={`novel-open-detail-${novel.novelId}`}
      >
        {novel.coverImageUrl && failedUrl !== novel.coverImageUrl ? (
          <img
            src={novel.coverImageUrl}
            alt={`Bìa truyện ${novel.title}`}
            loading="lazy"
            onError={() => setFailedUrl(novel.coverImageUrl ?? undefined)}
          />
        ) : (
          <div className="sc-catalog-placeholder" aria-hidden="true">
            <span className="mini-label">{novelGenres[0] ?? 'Truyện'}</span>
            <div>
              <div className="decor">{symbol}</div>
              <div className="cover-title">{novel.title}</div>
            </div>
            <span className="footer-label">{statusLabel}</span>
          </div>
        )}
      </Link>

      <div className="sc-catalog-body">
        <div className="sc-catalog-novel-header">
          <Link to={to} className="sc-catalog-novel-title" title={novel.title}>
            {novel.title}
          </Link>
          {showNewBadge && <span className="sc-catalog-new-badge">Mới</span>}
        </div>

        {(novelGenres.length > 0 || visibleTags.length > 0 || extraCount > 0) && (
          <div className="sc-catalog-tags" translate="no">
            {novelGenres.map((label) => (
              <span key={`g:${label}`} className="sc-catalog-tag green">
                {label}
              </span>
            ))}
            {visibleTags.map((label) => (
              <span key={`t:${label}`} className="sc-catalog-tag">
                {label}
              </span>
            ))}
            {extraCount > 0 && (
              <span
                className="sc-catalog-tag sc-catalog-tag-more"
                tabIndex={0}
                aria-label={`Thêm ${extraCount} thẻ: ${hiddenTags.join(', ')}`}
              >
                +{extraCount}
                <span className="sc-catalog-tag-tooltip" role="tooltip">
                  {hiddenTags.join(', ')}
                </span>
              </span>
            )}
          </div>
        )}

        <div className="sc-catalog-metrics">
          <span>◫ {(novel.chaptersCount ?? 0).toLocaleString('vi-VN')} chương</span>
          <span>◉ {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc</span>
        </div>

        <p className="sc-catalog-desc">
          {novel.synopsis?.trim() || 'Câu chuyện đang chờ bạn khám phá trên StoryCraft.'}
        </p>

        <div className="sc-catalog-bottom">
          <span className={`sc-catalog-state${statusClass ? ` ${statusClass}` : ''}`}>
            ● {statusLabel}
          </span>
          <Link to={to} className="sc-catalog-read">
            Xem truyện →
          </Link>
        </div>
      </div>
    </article>
  );
}
