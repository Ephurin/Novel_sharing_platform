import { Button, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

type ProviderGif = { id: string; title: string; images: Record<string, { url: string }> };
type ProviderResponse = { data: ProviderGif[]; pagination: { offset: number; count: number; total_count: number } };
type Gif = { id: string; title: string; previewUrl: string; url: string };

function useGiphyConfig() {
  return useQuery({ queryKey: ['giphy-config'], queryFn: async () => {
    const response = await apiClient.get<ApiEnvelope<{ apiKey: string | null }>>('/media/giphy-config');
    return response.data.data;
  }, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false });
}

function mediaUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^(media[0-9]*|i)\.giphy\.com$/.test(parsed.hostname)) throw new Error('Không tải được GIF.');
  return url;
}

function normalizeGif(gif: ProviderGif): Gif {
  if (!gif || !/^[a-zA-Z0-9]{1,80}$/.test(gif.id) || !gif.images?.original?.url) throw new Error('Không tải được GIF.');
  return { id: gif.id, title: gif.title || 'GIF',
    previewUrl: mediaUrl(gif.images.fixed_width_still?.url ?? gif.images.original_still?.url ?? gif.images.original.url),
    url: mediaUrl(gif.images.downsized_medium?.url ?? gif.images.original.url) };
}

async function requestGiphy(path: string, apiKey: string, signal: AbortSignal, params: Record<string, string> = {}) {
  const url = new URL(`https://api.giphy.com/v1/gifs/${path}`);
  url.search = new URLSearchParams({ api_key: apiKey, rating: 'pg-13', ...params }).toString();
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY đang giới hạn lượt tìm. Vui lòng thử lại sau.' : 'Không tải được GIF từ GIPHY.');
  return response.json();
}

export default function CommentGifPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const config = useGiphyConfig();
  const [keyword, setKeyword] = useState('');
  const [search] = useDebouncedValue(keyword, 350);
  const apiKey = config.data?.apiKey;
  const results = useInfiniteQuery({
    queryKey: ['giphy-search', apiKey, search], enabled: Boolean(apiKey), initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const response = await requestGiphy(search.trim() ? 'search' : 'trending', apiKey!, signal,
        { ...(search.trim() ? { q: search, lang: 'vi' } : {}), offset: String(pageParam), limit: '20' }) as ProviderResponse;
      return { ...response, data: response.data.map(normalizeGif) };
    },
    getNextPageParam: page => {
      const next = page.pagination.offset + page.pagination.count;
      return page.pagination.count > 0 && next < page.pagination.total_count && next <= (search.trim() ? 4999 : 499) ? next : undefined;
    },
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false
  });
  const searching = search !== keyword;
  const gifs = searching ? [] : results.data?.pages.flatMap(page => page.data) ?? [];
  return <div className="sc-comment-gif-picker">
    <TextInput label="Tìm GIF" placeholder="Nhập meme, vui, mèo…" value={keyword} maxLength={50}
      disabled={!apiKey} onChange={event => setKeyword(event.currentTarget.value)} />
    {config.isPending && <p role="status">Đang mở kho GIF…</p>}
    {config.isError && <div role="alert"><p>Không tải được cấu hình kho GIF.</p><Button variant="subtle" onClick={() => void config.refetch()}>Thử lại</Button></div>}
    {config.isSuccess && !apiKey && <p role="status">Kho GIF cần API key GIPHY để hoạt động. Thêm GIPHY_API_KEY vào cấu hình máy chủ để bật tìm kiếm.</p>}
    {apiKey && (results.isPending || searching) && <p role="status">Đang tìm GIF…</p>}
    {apiKey && results.isError && <div role="alert"><p>{results.error.message}</p><Button variant="subtle" onClick={() => void results.refetch()}>Thử lại</Button></div>}
    {apiKey && !searching && results.isSuccess && gifs.length === 0 && <p role="status">Không tìm thấy GIF. Thử từ khóa khác.</p>}
    <div className="sc-comment-gif-grid" aria-label="Kết quả GIF">
      {gifs.map((gif, index) => <button key={`${gif.id}-${index}`} type="button" aria-label={`Chọn GIF ${gif.title || gif.id}`} onClick={() => onSelect(gif.id)}>
        <img src={gif.previewUrl} alt={gif.title || 'GIF'} loading="lazy" />
      </button>)}
    </div>
    {results.hasNextPage && !searching && <Button variant="subtle" loading={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>Xem thêm GIF</Button>}
    <GiphyAttribution />
  </div>;
}

export function GiphyAttribution() {
  return <a className="sc-comment-giphy-credit" href="https://giphy.com/" target="_blank" rel="noreferrer">
    <img className="sc-giphy-credit-light" src="/giphy/powered-by-light.png" alt="Powered by GIPHY" width={160} />
    <img className="sc-giphy-credit-dark" src="/giphy/powered-by-dark.png" alt="Powered by GIPHY" width={160} />
  </a>;
}

export function GiphyMedia({ id }: { id: string }) {
  const config = useGiphyConfig();
  const apiKey = config.data?.apiKey;
  const gif = useQuery({ queryKey: ['giphy-media', id, apiKey], enabled: Boolean(apiKey),
    queryFn: async ({ signal }) => {
      const response = await requestGiphy(encodeURIComponent(id), apiKey!, signal);
      return normalizeGif(response.data);
    }, retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  return <div className="sc-comment-giphy-media">
    {(config.isPending || (apiKey && gif.isPending)) && <p role="status">Đang tải GIF…</p>}
    {(config.isError || gif.isError) && <p role="alert">Không tải được GIF.</p>}
    {gif.data && <img src={gif.data.url} alt={gif.data.title || 'GIF GIPHY'} loading="lazy" />}
    {config.isSuccess && !apiKey && <a href={`https://giphy.com/gifs/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Xem GIF trên GIPHY</a>}
    <GiphyAttribution />
  </div>;
}
