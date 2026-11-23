import type { SearchPublishedNovelsInput } from './reader-api';

export const SEARCH_PATH = '/tim-kiem';
export const ADVANCED_SEARCH_PATH = '/tim-kiem-nang-cao';

export const SEARCH_SORTS = [
  ['updatedAt:desc', 'Mới cập nhật'],
  ['relevance:desc', 'Liên quan nhất'],
  ['views:desc', 'Nhiều lượt đọc'],
  ['likes:desc', 'Nhiều lượt thích'],
  ['wordCount:desc', 'Nhiều từ nhất'],
  ['title:asc', 'Tên truyện (A–Z)'],
  ['title:desc', 'Tên truyện (Z–A)']
] as const;

export const SEARCH_STATUSES = [
  ['', 'Tất cả'],
  ['ONGOING', 'Đang ra'],
  ['COMPLETED', 'Hoàn thành'],
  ['HIATUS', 'Tạm ngưng']
] as const;

export type SearchSortValue = (typeof SEARCH_SORTS)[number][0];
export type SearchStatusValue = (typeof SEARCH_STATUSES)[number][0];

export type SearchQueryState = {
  keywords: string;
  genres: string[];
  tags: string[];
  status: SearchStatusValue;
  sort: SearchSortValue;
  page: number;
};

export const DEFAULT_SEARCH_STATE: SearchQueryState = {
  keywords: '',
  genres: [],
  tags: [],
  status: '',
  sort: 'updatedAt:desc',
  page: 1
};

const VALID_SORTS = new Set<string>(SEARCH_SORTS.map((item) => item[0]));
const VALID_STATUSES = new Set<string>(SEARCH_STATUSES.map((item) => item[0]));

export function parseSearchParams(params: URLSearchParams): SearchQueryState {
  const rawKeywords = params.get('keywords') ?? params.get('q') ?? '';
  const keywords = rawKeywords.slice(0, 200);

  const genres = [
    ...new Set(
      [...params.getAll('genre'), ...params.getAll('genres')]
        .map((item) => item.trim().slice(0, 100))
        .filter(Boolean)
    )
  ].slice(0, 30);

  const tags = [
    ...new Set(
      [...params.getAll('tag'), ...params.getAll('tags')]
        .map((item) => item.trim().slice(0, 100))
        .filter(Boolean)
    )
  ].slice(0, 30);

  const rawStatus = params.get('status') ?? '';
  const status = (VALID_STATUSES.has(rawStatus) ? rawStatus : '') as SearchStatusValue;

  const rawSort = params.get('sort') ?? '';
  const defaultSort: SearchSortValue = keywords.trim() ? 'relevance:desc' : DEFAULT_SEARCH_STATE.sort;
  const sort = (VALID_SORTS.has(rawSort) ? rawSort : defaultSort) as SearchSortValue;

  const rawPage = params.get('page') ?? '1';
  const page = /^\d+$/.test(rawPage) ? Math.min(100_000, Math.max(1, Number(rawPage))) : 1;

  return { keywords, genres, tags, status, sort, page };
}

export function buildSearchParams(patch: Partial<SearchQueryState>): URLSearchParams {
  const state: SearchQueryState = { ...DEFAULT_SEARCH_STATE, ...patch };
  const next = new URLSearchParams();

  const trimmedKeywords = state.keywords.trim();
  if (trimmedKeywords) next.set('keywords', trimmedKeywords);
  for (const genre of state.genres) {
    if (genre.trim()) next.append('genre', genre.trim());
  }
  for (const tag of state.tags) {
    if (tag.trim()) next.append('tag', tag.trim());
  }
  if (state.status) next.set('status', state.status);
  if (trimmedKeywords) {
    if (state.sort) next.set('sort', state.sort);
  } else if (state.sort && state.sort !== DEFAULT_SEARCH_STATE.sort) {
    next.set('sort', state.sort);
  }
  if (state.page > 1) next.set('page', String(state.page));

  return next;
}

export function buildSearchUrl(
  basePath: typeof SEARCH_PATH | typeof ADVANCED_SEARCH_PATH,
  patch: Partial<SearchQueryState>
): string {
  const qs = buildSearchParams(patch).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function toSearchApiInput(
  state: SearchQueryState,
  limit: number
): SearchPublishedNovelsInput & { page: number; limit: number } {
  const [sortField, order] = state.sort.split(':');
  return {
    q: state.keywords.trim() || undefined,
    genres: state.genres.length ? state.genres : undefined,
    tags: state.tags.length ? state.tags : undefined,
    status: (state.status || undefined) as SearchPublishedNovelsInput['status'],
    sort: sortField as SearchPublishedNovelsInput['sort'],
    order: (order as 'asc' | 'desc') || 'desc',
    page: state.page,
    limit
  };
}
