import { novelHref } from '../../shared/routes';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import { HomeNovelCover } from './HomeNovelCover';
import type { ReaderNovel } from './reader-api';

type FeaturedFeed = {
  items: Array<ReaderNovel & { placementId: string; endsAt: string }>;
  refreshInMs: number | null;
};

export function FeaturedSelectionsShelf({ catalogPath }: { catalogPath: string }) {
  const [observedAt, setObservedAt] = useState(Date.now);
  const { data, dataUpdatedAt, refetch, isError } = useQuery({
    queryKey: ['featured-selections'],
    queryFn: async ({ signal }) => (await apiClient.get<ApiEnvelope<FeaturedFeed>>(
      '/reading/featured-selections', { signal })).data.data,
    refetchInterval: 30_000,
    retry: false
  });
  useEffect(() => {
    if (data?.refreshInMs == null) return;
    const timer = window.setTimeout(() => {
      setObservedAt(Date.now());
      void refetch();
    }, Math.max(20, dataUpdatedAt + data.refreshInMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [data?.refreshInMs, dataUpdatedAt, refetch]);
  const items = isError ? [] : (data?.items ?? []).filter(item =>
    Date.parse(item.endsAt) > Math.max(observedAt, dataUpdatedAt));
  if (!items.length) return null;
  return <section className="sc-home-panel sc-home-section" aria-labelledby="featured-selections-title">
    <div className="sc-home-sec-head"><h2 id="featured-selections-title">Tác phẩm được tuyển chọn</h2></div>
    <div className="sc-home-featured-grid">
      {items.map(item => <article key={item.placementId} className="sc-home-featured-card">
        <Link className="sc-home-featured-cover-link" to={novelHref(item, catalogPath)}>
          <span className="sc-home-featured-cover"><HomeNovelCover novel={item} size="card" /></span>
          <span className="sc-home-featured-title">{item.title}</span>
        </Link>
      </article>)}
    </div>
  </section>;
}
