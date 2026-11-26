import { novelHref } from '../routes';
import { useEffect, useId, useRef, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { searchPublishedNovelPage, type ReaderNovel } from '../../features/reader/reader-api';
import {
  ADVANCED_SEARCH_PATH,
  buildSearchUrl,
  DEFAULT_SEARCH_STATE,
  parseSearchParams,
  SEARCH_PATH
} from '../../features/reader/search-params';
import './global-search-dropdown.css';

const SUGGESTION_LIMIT = 6;

const statusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng'
};

export function GlobalSearchDropdown({ catalogPath }: { catalogPath: '/reader' | '/public' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const listId = useId();

  const isSearchPage =
    location.pathname === SEARCH_PATH || location.pathname === ADVANCED_SEARCH_PATH;
  const urlKeywords = isSearchPage ? parseSearchParams(searchParams).keywords : '';

  const [value, setValue] = useState(urlKeywords);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync navbar search input with URL only on dedicated search routes (decoupled from ReaderCatalog)
  useEffect(() => {
    if (isSearchPage) {
      setValue(urlKeywords);
    }
  }, [isSearchPage, urlKeywords]);

  // Close dropdown & mobile overlay when navigating to another page
  useEffect(() => {
    setDropdownOpen(false);
    setMobileOpen(false);
    setActiveIndex(-1);
  }, [location.pathname, location.search]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!dropdownOpen && !mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setMobileOpen(false);
        setActiveIndex(-1);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setMobileOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [dropdownOpen, mobileOpen]);

  const trimmed = value.trim();
  const [debounced] = useDebouncedValue(trimmed, 300);
  const waiting = trimmed !== debounced;
  const shouldShowDropdown = dropdownOpen && trimmed.length > 0;
  const queryEnabled = shouldShowDropdown && debounced.length > 0 && !waiting;

  const suggestionsQuery = useQuery({
    queryKey: ['global-live-search', debounced],
    queryFn: ({ signal }) =>
      searchPublishedNovelPage(
        { q: debounced, page: 1, limit: SUGGESTION_LIMIT, sort: 'relevance', order: 'desc' },
        signal
      ),
    enabled: queryEnabled,
    staleTime: 30_000,
    retry: false
  });

  useEffect(() => {
    if (waiting && debounced) {
      void queryClient.cancelQueries({ queryKey: ['global-live-search', debounced], exact: true });
    }
  }, [waiting, debounced, queryClient]);

  const items: ReaderNovel[] =
    !waiting && suggestionsQuery.isSuccess ? suggestionsQuery.data.items.slice(0, SUGGESTION_LIMIT) : [];
  const selectedIndex = activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;
  const isLoading = shouldShowDropdown && (waiting || suggestionsQuery.isPending);
  const allResultsPath = buildSearchUrl(SEARCH_PATH, {
    keywords: trimmed,
    sort: trimmed ? 'relevance:desc' : DEFAULT_SEARCH_STATE.sort
  });

  useEffect(() => {
    if (shouldShowDropdown && selectedIndex >= 0) {
      document.getElementById(`${listId}-opt-${selectedIndex}`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant'
      });
    }
  }, [shouldShowDropdown, selectedIndex, listId]);

  function closeAll() {
    setDropdownOpen(false);
    setMobileOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(nextValue: string) {
    setValue(nextValue);
    setActiveIndex(-1);
    setDropdownOpen(nextValue.trim().length > 0);
  }

  function handleClear() {
    setValue('');
    setActiveIndex(-1);
    setDropdownOpen(false);
    inputRef.current?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldShowDropdown && selectedIndex >= 0 && items[selectedIndex]) {
      const target = novelHref(items[selectedIndex], catalogPath);
      closeAll();
      navigate(target);
      return;
    }
    closeAll();
    navigate(allResultsPath);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      closeAll();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!trimmed) return;
      event.preventDefault();
      setDropdownOpen(true);
      if (!items.length) return;
      const dir = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) =>
        prev < 0 ? (dir > 0 ? 0 : items.length - 1) : (prev + dir + items.length) % items.length
      );
    }
  }

  return (
    <div ref={containerRef} className={`sc-nav-search${mobileOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="sc-nav-search-toggle"
        aria-label="Tìm kiếm truyện"
        aria-expanded={mobileOpen}
        aria-controls="sc-navbar-search-input"
        title="Tìm kiếm truyện"
        onClick={() => {
          setMobileOpen((prev) => {
            const next = !prev;
            if (next) {
              requestAnimationFrame(() => inputRef.current?.focus());
            } else {
              setDropdownOpen(false);
            }
            return next;
          });
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      </button>

      <div className="sc-nav-search-box">
        <form className="sc-nav-search-form" role="search" autoComplete="off" onSubmit={handleSubmit}>
          <svg className="sc-nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            ref={inputRef}
            id="sc-navbar-search-input"
            name="storycraft-global-search"
            type="text"
            inputMode="search"
            maxLength={200}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={shouldShowDropdown}
            aria-controls={shouldShowDropdown ? listId : undefined}
            aria-activedescendant={shouldShowDropdown && selectedIndex >= 0 ? `${listId}-opt-${selectedIndex}` : undefined}
            aria-label="Tìm kiếm truyện"
            data-testid="navbar-global-search-input"
            placeholder="Tìm truyện, giới thiệu..."
            value={value}
            onChange={(event) => handleInputChange(event.currentTarget.value)}
            onFocus={() => {
              if (trimmed.length > 0) setDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {value.length > 0 && (
            <button
              type="button"
              className="sc-nav-search-clear"
              aria-label="Xóa từ khóa tìm kiếm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          )}
        </form>

        {shouldShowDropdown && (
          <div className="sc-global-search-dropdown" role="region" aria-label="Gợi ý tìm kiếm truyện">
            {isLoading ? (
              <div aria-live="polite" aria-busy="true">
                {Array.from({ length: 3 }, (_, idx) => (
                  <div key={idx} className="sc-global-search-skeleton-row" aria-hidden="true">
                    <div className="sc-global-search-skeleton-cover" />
                    <div className="sc-global-search-skeleton-lines">
                      <div className="sc-global-search-skeleton-bar" style={{ width: '76%' }} />
                      <div className="sc-global-search-skeleton-bar" style={{ width: '48%', height: '10px' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : suggestionsQuery.isError ? (
              <div className="sc-global-search-state" role="status">
                Chưa tải được gợi ý. Nhấn Enter để tìm kiếm.
              </div>
            ) : items.length === 0 ? (
              <div className="sc-global-search-state" role="status">
                Không tìm thấy truyện phù hợp với “{trimmed}”.
              </div>
            ) : (
              <ul id={listId} className="sc-global-search-list" role="listbox" aria-label="Danh sách truyện gợi ý">
                {items.map((novel, index) => (
                  <SuggestionItem
                    key={novel.novelId}
                    id={`${listId}-opt-${index}`}
                    novel={novel}
                    to={novelHref(novel, catalogPath)}
                    selected={selectedIndex === index}
                    onHover={() => setActiveIndex(index)}
                    onSelect={closeAll}
                  />
                ))}
              </ul>
            )}

            <Link
              to={allResultsPath}
              className="sc-global-search-footer"
              onMouseDown={(event) => event.preventDefault()}
              onClick={closeAll}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <span>Xem tất cả kết quả cho</span>
              <span className="sc-global-search-footer-query">“{trimmed}”</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionItem({
  id,
  novel,
  to,
  selected,
  onHover,
  onSelect
}: {
  id: string;
  novel: ReaderNovel;
  to: string;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const statusCode = novel.serialStatus ?? novel.status ?? 'ONGOING';
  const statusLabel = statusLabels[statusCode] ?? 'Đang ra';
  const chaptersCount = novel.chaptersCount ?? 0;

  return (
    <li className="sc-global-search-item" role="presentation">
      <Link
        id={id}
        to={to}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        className="sc-global-search-link"
        onMouseEnter={onHover}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSelect}
      >
        <div className="sc-global-search-cover">
          {novel.coverImageUrl && !imgFailed ? (
            <img
              src={novel.coverImageUrl}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span aria-hidden="true">{novel.title.trim().slice(0, 1).toUpperCase() || 'S'}</span>
          )}
        </div>
        <div className="sc-global-search-info">
          <div className="sc-global-search-title">{novel.title}</div>
          <div className="sc-global-search-meta">
            <span className="sc-global-search-status" data-status={statusCode}>
              {statusLabel}
            </span>
            <span className="sc-global-search-chapters">
              {chaptersCount.toLocaleString('vi-VN')} chương
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
