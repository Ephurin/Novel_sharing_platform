import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { getReadingFilters, searchPublishedNovelPage, type ReaderNovel } from './reader-api';
import {
  ADVANCED_SEARCH_PATH,
  buildSearchUrl,
  DEFAULT_SEARCH_STATE,
  parseSearchParams,
  SEARCH_PATH,
  SEARCH_SORTS,
  SEARCH_STATUSES,
  toSearchApiInput,
  type SearchQueryState,
  type SearchSortValue,
  type SearchStatusValue
} from './search-params';
import './search-results.css';

const PAGE_SIZE = 15;
const GENRE_PREVIEW_LIMIT = 8;
const TAG_PREVIEW_LIMIT = 10;

const placeholderVariants = ['violet', 'beige', 'sage', 'blue', 'night', 'rose'] as const;
const placeholderSymbols = ['✦', '☁', '✺', '❋', '✧', '❧', '◌', '⌛'] as const;

const statusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng'
};

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
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

function sliceWithSelected(options: string[], selected: string[], limit: number, expanded: boolean) {
  if (expanded || options.length <= limit) {
    return { visible: options, hiddenCount: 0 };
  }
  const selectedSet = new Set(selected);
  const ordered = [
    ...options.filter((item) => selectedSet.has(item)),
    ...options.filter((item) => !selectedSet.has(item))
  ];
  const take = Math.max(limit, selected.length);
  return {
    visible: ordered.slice(0, take),
    hiddenCount: Math.max(0, ordered.length - take)
  };
}

export function SearchResultsPage({ advanced = false }: { advanced?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPath: typeof SEARCH_PATH | typeof ADVANCED_SEARCH_PATH = advanced
    ? ADVANCED_SEARCH_PATH
    : SEARCH_PATH;
  const detailBase = user ? '/reader' : '/public';

  const urlState = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const [draft, setDraft] = useState<SearchQueryState>(urlState);
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // Keep form inputs synchronized with URL on Back/Forward or external navigation
  useEffect(() => {
    setDraft(urlState);
  }, [location.search, location.pathname]);

  const apiInput = useMemo(() => toSearchApiInput(urlState, PAGE_SIZE), [urlState]);

  const searchQuery = useQuery({
    queryKey: ['published-search', apiInput],
    queryFn: ({ signal }) => searchPublishedNovelPage(apiInput, signal),
    staleTime: 30_000
  });

  const taxonomyQuery = useQuery({
    queryKey: ['reading-filters'],
    queryFn: getReadingFilters,
    staleTime: 60_000,
    enabled: advanced
  });

  useEffect(() => {
    if (searchQuery.data && urlState.page > searchQuery.data.totalPages) {
      navigate(buildSearchUrl(currentPath, { ...urlState, page: searchQuery.data.totalPages }), {
        replace: true
      });
    }
  }, [searchQuery.data?.totalPages, urlState, currentPath, navigate]);

  const items = searchQuery.data?.items ?? [];
  const totalPages = searchQuery.data?.totalPages ?? 1;

  const urlFilterCount =
    urlState.genres.length + urlState.tags.length + (urlState.status ? 1 : 0);

  const genreOptions = [...new Set([...(taxonomyQuery.data?.genres ?? []), ...draft.genres])];
  const tagOptions = [...new Set([...(taxonomyQuery.data?.tags ?? []), ...draft.tags])];

  const genreSlice = sliceWithSelected(genreOptions, draft.genres, GENRE_PREVIEW_LIMIT, genresExpanded);
  const tagSlice = sliceWithSelected(tagOptions, draft.tags, TAG_PREVIEW_LIMIT, tagsExpanded);

  function commitSearch(
    next: Partial<SearchQueryState>,
    targetPath: typeof SEARCH_PATH | typeof ADVANCED_SEARCH_PATH = currentPath
  ) {
    const merged: SearchQueryState = { ...urlState, ...next };
    navigate(buildSearchUrl(targetPath, merged));
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(buildSearchUrl(currentPath, { ...draft, page: 1 }));
  }

  function handleReset() {
    setDraft(DEFAULT_SEARCH_STATE);
    navigate(currentPath);
  }

  function toggleDraftMulti(field: 'genres' | 'tags', item: string) {
    setDraft((prev) => {
      const current = prev[field];
      const next = current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item];
      return { ...prev, [field]: next };
    });
  }

  function handlePageChange(nextPage: number) {
    if (nextPage === urlState.page || nextPage < 1 || nextPage > totalPages) return;
    commitSearch({ page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="sc-search-page">
      <section
        className={`sc-search-panel${advanced ? ' is-advanced' : ''}`}
        aria-label={advanced ? 'Biểu mẫu tìm kiếm nâng cao' : 'Tìm kiếm truyện'}
      >
        <div className="sc-search-panel-head">
          <h1 className="sc-search-title">Tìm kiếm</h1>
          {advanced ? (
            <Link
              to={buildSearchUrl(SEARCH_PATH, urlState)}
              className="sc-search-mode-link"
              data-testid="search-basic-link"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_back
              </span>
              <span>Tìm kiếm cơ bản</span>
            </Link>
          ) : (
            <Link
              to={buildSearchUrl(ADVANCED_SEARCH_PATH, urlState)}
              className="sc-search-mode-link"
              data-testid="search-advanced-link"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                tune
              </span>
              <span>Tìm kiếm nâng cao</span>
            </Link>
          )}
        </div>

        <form onSubmit={handleFormSubmit} autoComplete="off">
          <div className="sc-search-bar">
            <div className="sc-search-input-wrap">
              <svg className="sc-search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                ref={inputRef}
                id="sc-search-page-input"
                name="keywords"
                type="text"
                inputMode="search"
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                placeholder="Nhập tên truyện, từ khóa giới thiệu..."
                aria-label="Từ khóa tìm kiếm truyện"
                data-testid="search-page-input"
                value={draft.keywords}
                onChange={(event) => {
                  const nextKeywords = event.currentTarget.value;
                  setDraft((prev) => ({ ...prev, keywords: nextKeywords }));
                }}
              />
              {draft.keywords.length > 0 && (
                <button
                  type="button"
                  className="sc-search-input-clear"
                  aria-label="Xóa từ khóa"
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, keywords: '' }));
                    inputRef.current?.focus();
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              )}
            </div>
            {!advanced && (
              <button type="submit" className="sc-search-submit-btn" data-testid="search-page-submit">
                Tìm kiếm
              </button>
            )}
          </div>

          {advanced && (
            <div className="sc-search-advanced-body">
              <div className="sc-search-advanced-row">
                <div className="sc-search-field">
                  <div className="sc-search-field-label">Tình trạng</div>
                  <div className="sc-search-radio-group" role="radiogroup" aria-label="Lọc theo tình trạng">
                    {SEARCH_STATUSES.map(([val, label]) => (
                      <label key={val || 'all'} className="sc-search-radio-pill">
                        <input
                          type="radio"
                          name="advanced-status"
                          value={val}
                          checked={draft.status === val}
                          onChange={() => setDraft((prev) => ({ ...prev, status: val as SearchStatusValue }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sc-search-field sc-search-field-sort">
                  <label className="sc-search-field-label" htmlFor="sc-advanced-sort">
                    Sắp xếp theo
                  </label>
                  <select
                    id="sc-advanced-sort"
                    className="sc-search-select"
                    value={draft.sort}
                    onChange={(event) => {
                      const nextSort = event.target.value as SearchSortValue;
                      setDraft((prev) => ({ ...prev, sort: nextSort }));
                    }}
                  >
                    {SEARCH_SORTS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sc-search-field">
                <div className="sc-search-field-label">
                  Thể loại
                  {draft.genres.length > 0 && (
                    <span className="sc-search-field-badge">{draft.genres.length}</span>
                  )}
                </div>
                {taxonomyQuery.isError ? (
                  <button
                    type="button"
                    className="sc-search-chip-clear"
                    onClick={() => void taxonomyQuery.refetch()}
                  >
                    ↻ Tải lại danh sách thể loại
                  </button>
                ) : genreOptions.length === 0 ? (
                  <span className="sc-search-advanced-count">
                    {taxonomyQuery.isPending ? 'Đang tải thể loại…' : 'Chưa có thể loại.'}
                  </span>
                ) : (
                  <div className="sc-search-chip-list" translate="no">
                    {genreSlice.visible.map((name) => (
                      <label key={name} className="sc-search-check-chip">
                        <input
                          type="checkbox"
                          value={name}
                          checked={draft.genres.includes(name)}
                          onChange={() => toggleDraftMulti('genres', name)}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                    {(genreSlice.hiddenCount > 0 || (genresExpanded && genreOptions.length > GENRE_PREVIEW_LIMIT)) && (
                      <button
                        type="button"
                        className="sc-search-expand-btn"
                        aria-expanded={genresExpanded}
                        onClick={() => setGenresExpanded((prev) => !prev)}
                      >
                        {genresExpanded ? 'Thu gọn' : `Xem thêm (+${genreSlice.hiddenCount})`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="sc-search-field">
                <div className="sc-search-field-label">
                  Thẻ / đặc trưng
                  {draft.tags.length > 0 && (
                    <span className="sc-search-field-badge">{draft.tags.length}</span>
                  )}
                </div>
                {taxonomyQuery.isError ? (
                  <button
                    type="button"
                    className="sc-search-chip-clear"
                    onClick={() => void taxonomyQuery.refetch()}
                  >
                    ↻ Tải lại danh sách thẻ
                  </button>
                ) : tagOptions.length === 0 ? (
                  <span className="sc-search-advanced-count">
                    {taxonomyQuery.isPending ? 'Đang tải thẻ…' : 'Chưa có thẻ.'}
                  </span>
                ) : (
                  <div className="sc-search-chip-list" translate="no">
                    {tagSlice.visible.map((name) => (
                      <label key={name} className="sc-search-check-chip">
                        <input
                          type="checkbox"
                          value={name}
                          checked={draft.tags.includes(name)}
                          onChange={() => toggleDraftMulti('tags', name)}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                    {(tagSlice.hiddenCount > 0 || (tagsExpanded && tagOptions.length > TAG_PREVIEW_LIMIT)) && (
                      <button
                        type="button"
                        className="sc-search-expand-btn"
                        aria-expanded={tagsExpanded}
                        onClick={() => setTagsExpanded((prev) => !prev)}
                      >
                        {tagsExpanded ? 'Thu gọn' : `Xem thêm (+${tagSlice.hiddenCount})`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="sc-search-advanced-actions">
                <div className="sc-search-advanced-buttons">
                  <button
                    type="button"
                    className="sc-search-reset-btn"
                    data-testid="search-advanced-reset"
                    onClick={handleReset}
                  >
                    ↻ Đặt lại bộ lọc
                  </button>
                  <button
                    type="submit"
                    className="sc-search-submit-btn is-compact"
                    data-testid="search-advanced-submit"
                  >
                    Tìm kiếm
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>

        {!advanced && urlFilterCount > 0 && (
          <div className="sc-search-active-chips" aria-label="Bộ lọc đang áp dụng">
            {urlState.status && (
              <button
                type="button"
                className="sc-search-chip"
                onClick={() => commitSearch({ status: '', page: 1 })}
              >
                <span>Tình trạng: {statusLabels[urlState.status]}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {urlState.genres.map((g) => (
              <button
                key={`g:${g}`}
                type="button"
                className="sc-search-chip"
                onClick={() =>
                  commitSearch({ genres: urlState.genres.filter((x) => x !== g), page: 1 })
                }
              >
                <span>Thể loại: {g}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
            {urlState.tags.map((t) => (
              <button
                key={`t:${t}`}
                type="button"
                className="sc-search-chip"
                onClick={() =>
                  commitSearch({ tags: urlState.tags.filter((x) => x !== t), page: 1 })
                }
              >
                <span>Thẻ: {t}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="sc-search-chip-clear" onClick={handleReset}>
              Xóa bộ lọc
            </button>
          </div>
        )}
      </section>

      {!advanced && (
        <div className="sc-search-meta-bar">
          <div className="sc-search-sort-wrap">
            <label htmlFor="sc-search-quick-sort">Sắp xếp</label>
            <select
              id="sc-search-quick-sort"
              className="sc-search-select"
              value={urlState.sort}
              onChange={(event) =>
                commitSearch({ sort: event.target.value as SearchSortValue, page: 1 })
              }
            >
              {SEARCH_SORTS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <section
        className="sc-search-results-list"
        aria-label="Danh sách kết quả tìm kiếm"
        aria-busy={searchQuery.isPending || searchQuery.isFetching}
      >
        {searchQuery.isPending ? (
          Array.from({ length: 4 }, (_, idx) => (
            <div key={idx} className="sc-search-skeleton" aria-hidden="true">
              <div className="sc-search-skeleton-cover" />
              <div className="sc-search-skeleton-body">
                <div className="sc-search-skeleton-bar" style={{ width: '54%' }} />
                <div className="sc-search-skeleton-bar" style={{ width: '34%', height: '11px' }} />
                <div className="sc-search-skeleton-bar" style={{ width: '86%', height: '11px' }} />
                <div className="sc-search-skeleton-bar" style={{ width: '42%', height: '11px', marginTop: 'auto' }} />
              </div>
            </div>
          ))
        ) : searchQuery.isError ? (
          <div className="sc-search-empty">
            <div className="sc-search-empty-icon" aria-hidden="true">
              ⚠
            </div>
            <h2>Không thể tải kết quả tìm kiếm</h2>
            <p>Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại.</p>
            <div className="sc-search-empty-actions">
              <button
                type="button"
                className="sc-search-submit-btn is-compact"
                onClick={() => void searchQuery.refetch()}
              >
                Thử lại
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="sc-search-empty">
            <div className="sc-search-empty-icon" aria-hidden="true">
              ⌕
            </div>
            <h2>Chưa tìm thấy truyện phù hợp</h2>
            <p>
              {urlState.keywords.trim()
                ? `Không có bộ truyện nào khớp với “${urlState.keywords.trim()}” cùng bộ lọc hiện tại.`
                : 'Hãy thử thay đổi từ khóa hoặc nới lỏng điều kiện lọc nhé.'}
            </p>
            <div className="sc-search-empty-actions">
              {(urlState.keywords.trim() || urlFilterCount > 0) && (
                <button type="button" className="sc-search-reset-btn" onClick={handleReset}>
                  Đặt lại bộ lọc
                </button>
              )}
              {!advanced && (
                <Link
                  to={buildSearchUrl(ADVANCED_SEARCH_PATH, urlState)}
                  className="sc-search-mode-link"
                >
                  Thử tìm kiếm nâng cao →
                </Link>
              )}
            </div>
          </div>
        ) : (
          items.map((novel) => (
            <SearchResultCard
              key={novel.novelId}
              novel={novel}
              to={`${detailBase}/novels/${novel.novelId}`}
            />
          ))
        )}
      </section>

      {!searchQuery.isPending && !searchQuery.isError && totalPages > 1 && (
        <nav className="sc-search-pagination" aria-label="Phân trang kết quả tìm kiếm">
          <button
            type="button"
            className="sc-search-pg"
            aria-label="Trang trước"
            disabled={urlState.page <= 1}
            onClick={() => handlePageChange(urlState.page - 1)}
          >
            ‹
          </button>
          {buildPaginationRange(urlState.page, totalPages).map((entry, idx) =>
            entry === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="sc-search-pg-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={`sc-search-pg${urlState.page === entry ? ' active' : ''}`}
                aria-label={`Trang ${entry}`}
                aria-current={urlState.page === entry ? 'page' : undefined}
                onClick={() => handlePageChange(entry)}
              >
                {entry}
              </button>
            )
          )}
          <button
            type="button"
            className="sc-search-pg"
            aria-label="Trang sau"
            disabled={urlState.page >= totalPages}
            onClick={() => handlePageChange(urlState.page + 1)}
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

function SearchResultCard({ novel, to }: { novel: ReaderNovel; to: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const statusCode = novel.serialStatus ?? novel.status ?? 'ONGOING';
  const statusLabel = statusLabels[statusCode] ?? 'Đang ra';

  const novelGenres = [...new Set(novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [])];
  const genreKeys = new Set(novelGenres.map((item) => item.trim().toLowerCase()));
  const novelTags = [...new Set((novel.tags ?? []).filter((item) => !genreKeys.has(item.trim().toLowerCase())))];
  const visibleTags = novelTags.slice(0, 3);
  const hiddenTags = novelTags.slice(3);

  const hash = hashString(novel.novelId || novel.title);
  const variant = placeholderVariants[hash % placeholderVariants.length];
  const symbol = placeholderSymbols[hash % placeholderSymbols.length];

  return (
    <article className="sc-search-card">
      <Link
        to={to}
        className="sc-search-card-cover"
        data-variant={variant}
        aria-label={`Xem truyện: ${novel.title}`}
      >
        {novel.coverImageUrl && failedUrl !== novel.coverImageUrl ? (
          <img
            src={novel.coverImageUrl}
            alt={`Bìa truyện ${novel.title}`}
            loading="lazy"
            onError={() => setFailedUrl(novel.coverImageUrl ?? undefined)}
          />
        ) : (
          <div className="sc-search-cover-fallback" aria-hidden="true">
            <span className="symbol">{symbol}</span>
            <span className="title">{novel.title}</span>
          </div>
        )}
      </Link>

      <div className="sc-search-card-body">
        <div className="sc-search-card-top">
          <Link to={to} className="sc-search-card-title" title={novel.title}>
            {novel.title}
          </Link>
          <span className="sc-search-card-status" data-status={statusCode}>
            ● {statusLabel}
          </span>
        </div>

        <div className="sc-search-card-meta">
          {novel.authorName && (
            <span>
              Tác giả: <strong>{novel.authorName}</strong>
            </span>
          )}
          <span>◫ {(novel.chaptersCount ?? 0).toLocaleString('vi-VN')} chương</span>
          <span>◉ {(novel.viewsCount ?? 0).toLocaleString('vi-VN')} lượt đọc</span>
        </div>

        <p className="sc-search-card-synopsis">
          {novel.synopsis?.trim() || 'Câu chuyện đang chờ bạn khám phá trên StoryCraft.'}
        </p>

        <div className="sc-search-card-bottom">
          <div className="sc-search-card-tags" translate="no">
            {novelGenres.map((name) => (
              <span key={`g:${name}`} className="sc-search-pill is-genre">
                {name}
              </span>
            ))}
            {visibleTags.map((name) => (
              <span key={`t:${name}`} className="sc-search-pill">
                {name}
              </span>
            ))}
            {hiddenTags.length > 0 && (
              <span className="sc-search-pill" title={hiddenTags.join(', ')}>
                +{hiddenTags.length}
              </span>
            )}
          </div>
          <Link to={to} className="sc-search-card-cta">
            Xem truyện →
          </Link>
        </div>
      </div>
    </article>
  );
}
