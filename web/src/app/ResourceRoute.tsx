
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { apiClient, type ApiEnvelope } from '../shared/api/api-client';
import { ErrorState, LoadingState } from '../shared/components/PageStates';
import { chapterPath, novelPath, profilePath, topicPath } from '../shared/routes';
import { ReaderNotFound, isReaderNotFound } from '../features/reader/ReaderNotFound';

type ResourceKind = 'novel' | 'chapter' | 'topic' | 'author' | 'member';
type ResourceId = 'novelId' | 'chapterId' | 'topicId' | 'authorId' | 'userId';
type RouteParams = Readonly<Record<string, string | undefined>>;
type Resource = { param: ResourceId; id: string; path: string; canonicalParams: string[] };

const ResourceContext = createContext<Resource | null>(null);

export function useResourceId(param: ResourceId) {
  const resource = useContext(ResourceContext);
  const params = useParams();
  return resource?.param === param ? resource.id : params[param];
}

const paramByKind: Record<ResourceKind, ResourceId> = {
  novel: 'novelId',
  chapter: 'chapterId',
  topic: 'topicId',
  author: 'authorId',
  member: 'userId'
};

function queryKey(kind: ResourceKind, keys: string[], legacy: boolean) {
  return ['url-resource', kind, legacy, ...keys];
}

function lookupParts(kind: ResourceKind, params: RouteParams, legacy: boolean) {
  if (legacy) return [params[paramByKind[kind]] ?? ''];
  switch (kind) {
    case 'novel': return [params.novelSlug ?? ''];
    case 'chapter': return [params.novelSlug ?? '', params.chapterSlug ?? ''];
    case 'topic': return [params.topicSlug ?? ''];
    case 'author':
    case 'member': return [params.publicKey ?? ''];
  }
}

async function locateResource(kind: ResourceKind, parts: string[], legacy: boolean, signal: AbortSignal): Promise<Resource> {
  const [first, second] = parts.map(encodeURIComponent);
  const get = async <T,>(path: string) => (await apiClient.get<ApiEnvelope<T>>(path, { signal })).data.data;
  const param = paramByKind[kind];
  switch (kind) {
    case 'novel': {
      const { novelId, novelSlug } = await get<{ novelId: string; novelSlug: string }>(
        legacy ? `/reading/novels/${first}/locator` : `/reading/novels/by-slug/${first}/locator`
      );
      return { param, id: novelId, path: novelPath(novelSlug), canonicalParams: [novelSlug] };
    }
    case 'chapter': {
      const { chapterId, chapterSlug, novelSlug } = await get<{ chapterId: string; chapterSlug: string; novelSlug: string }>(
        legacy ? `/reading/chapters/${first}/locator` : `/reading/novels/by-slug/${first}/chapters/${second}/locator`
      );
      return { param, id: chapterId, path: chapterPath(novelSlug, chapterSlug), canonicalParams: [novelSlug, chapterSlug] };
    }
    case 'topic': {
      const { topicId, topicSlug } = await get<{ topicId: string; topicSlug: string }>(
        legacy ? `/discussions/${first}/locator` : `/discussions/by-slug/${first}/locator`
      );
      return { param, id: topicId, path: topicPath(topicSlug), canonicalParams: [topicSlug] };
    }
    case 'author':
    case 'member': {
      const prefix = kind === 'author' ? 'authors' : 'users';
      const endpoint = legacy ? `/${prefix}/${first}/profile` : `/${prefix}/by-key/${first}/locator`;
      const profile = await get<{ userId?: string; authorId?: string; publicKey: string }>(endpoint);
      const id = profile.userId ?? profile.authorId;
      if (!id || !profile.publicKey) throw new Error('Không tìm thấy định danh hồ sơ.');
      return { param, id, path: profilePath(kind, profile.publicKey), canonicalParams: [profile.publicKey] };
    }
  }
}

export function UrlRedirect({ pathname, search }: { pathname: string; search?: string }) {
  const location = useLocation();
  const state = typeof location.state === 'object' && location.state !== null ? location.state : {};
  return <Navigate to={{ pathname, search: search ?? location.search, hash: location.hash }}
    state={{ ...state, legacyPathname: location.pathname }} replace />;
}

export function ResourceRoute({ kind, legacy = false, legacyId, suffix = '', privatePage = false, children }: {
  kind: ResourceKind;
  legacy?: boolean;
  legacyId?: string;
  suffix?: string;
  privatePage?: boolean;
  children?: ReactNode;
}) {
  const params = useParams();
  const queryClient = useQueryClient();
  const parts = legacyId ? [legacyId] : lookupParts(kind, params, legacy);
  const query = useQuery({
    queryKey: queryKey(kind, parts, legacy),
    queryFn: async ({ signal }) => {
      const resource = await locateResource(kind, parts, legacy, signal);
      if (legacy) queryClient.setQueryData(queryKey(kind, resource.canonicalParams, false), resource);
      return resource;
    },
    staleTime: 30_000,
    retry: false
  });

  const canonical = !legacy && !privatePage && query.data ? query.data.path + suffix : undefined;
  useEffect(() => {
    if (!canonical) return;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = new URL(canonical, window.location.origin).href;
    document.head.append(link);
    return () => link.remove();
  }, [canonical]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    if ((kind === 'novel' || kind === 'chapter') && isReaderNotFound(query.error)) return <ReaderNotFound kind={kind} />;
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (legacy) return <UrlRedirect pathname={query.data.path + suffix} />;
  return <ResourceContext.Provider value={query.data}>{children}</ResourceContext.Provider>;
}
