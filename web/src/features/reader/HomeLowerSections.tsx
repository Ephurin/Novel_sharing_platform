import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';
import { listNovelReviews } from '../novels/novel-statistics-api';
import { listTargetComments } from './comments-api';
import { listHistoryPage, listLibraryPage, type ReaderNovel } from './reader-api';
import { HomeNovelCover } from './HomeNovelCover';
import { NovelQuickPreview } from './HomeEnhancements';
import writingStudioArt from '../../assets/home-writing-studio.jpg';
import collectionWeekendArt from '../../assets/collection-weekend.jpg';
import collectionFantasyArt from '../../assets/collection-fantasy.jpg';

const count = (value = 0) => value.toLocaleString('vi-VN');

const statusLabels: Record<string, string> = {
  ONGOING: 'Đang ra',
  COMPLETED: 'Hoàn thành',
  HIATUS: 'Tạm ngưng',
};

function novelStatusLabel(novel: ReaderNovel) {
  return statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra';
}

function resolveNovelPills(novel: ReaderNovel): Array<{ label: string; kind: 'genre' | 'tag' }> {
  const genres = (novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [])
    .map(g => g.trim())
    .filter(Boolean);
  const seen = new Set(genres.map(g => g.toLowerCase()));
  const tags = (novel.tags ?? [])
    .map(t => t.trim())
    .filter(t => t && !seen.has(t.toLowerCase()));

  return [
    ...genres.map(label => ({ label, kind: 'genre' as const })),
    ...tags.map(label => ({ label, kind: 'tag' as const })),
  ].slice(0, 3);
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

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pickDailySpotlight(catalogNovels: ReaderNovel[], topFeaturedId?: string): ReaderNovel | null {
  if (catalogNovels.length === 0) return null;

  // Prefer published novels with real published chapters, real readership, and non-placeholder metadata.
  const curatedPool = catalogNovels.filter(
    novel =>
      Boolean(novel.latestChapter) &&
      (novel.viewsCount ?? 0) > 0 &&
      Boolean(novel.synopsis?.trim()) &&
      !/^untitled\b/i.test(novel.title.trim())
  );
  const richPool = catalogNovels.filter(
    novel => Boolean(novel.synopsis?.trim()) && (novel.chaptersCount ?? 0) > 0
  );
  const basePool = curatedPool.length > 0 ? curatedPool : richPool.length > 0 ? richPool : catalogNovels;
  const distinctPool = topFeaturedId && basePool.length > 1
    ? basePool.filter(novel => novel.novelId !== topFeaturedId)
    : basePool;
  const candidates = distinctPool.length > 0 ? distinctPool : basePool;

  const sorted = candidates.slice().sort((a, b) => a.novelId.localeCompare(b.novelId));
  const index = hashString(`storycraft-spotlight:${todayKey()}`) % sorted.length;
  return sorted[index] ?? null;
}

type CommunityEntry = {
  id: string;
  kind: 'review' | 'comment';
  authorName: string;
  avatarUrl: string | null;
  novelId: string;
  novelTitle: string;
  score: number | null;
  content: string;
  createdAt: string;
  href: string;
};

type AuthorEntry = {
  authorId: string;
  authorName: string;
  novelsCount: number;
};

type ReadingCollectionItem = {
  id: 'weekend' | 'fantasy' | 'healing' | 'journey';
  title: string;
  description: string;
  icon: string;
  href: string;
  matchedCount: number;
  imageSrc?: string;
  imagePosition?: string;
};

function novelGenresAndTags(novel: ReaderNovel) {
  const genres = (novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [])
    .map(g => g.trim())
    .filter(Boolean);
  const tags = (novel.tags ?? []).map(t => t.trim()).filter(Boolean);
  return { genres, tags };
}

function pickTopMatchingGenre(novels: ReaderNovel[], matcher: RegExp, preferredOrder: RegExp[]): string | null {
  const counts = new Map<string, number>();
  for (const novel of novels) {
    const { genres } = novelGenresAndTags(novel);
    for (const genre of genres) {
      if (matcher.test(genre)) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
      }
    }
  }
  const available = [...counts.entries()];
  if (available.length === 0) return null;
  for (const pref of preferredOrder) {
    const match = available.find(([name]) => pref.test(name));
    if (match) return match[0];
  }
  available.sort((a, b) => b[1] - a[1]);
  return available[0]?.[0] ?? null;
}

function buildReadingCollections(
  catalogNovels: ReaderNovel[],
  completedNovels: ReaderNovel[],
  catalogPath: string
): ReadingCollectionItem[] {
  const weekendMatches = completedNovels.filter(
    novel => (novel.serialStatus ?? novel.status) === 'COMPLETED'
  );

  const fantasyPattern = /fantasy|kỳ ảo|huyền ảo|dị giới|khoa học|viễn tưởng|cultivation|tu tiên/i;
  const fantasyMatches = catalogNovels.filter(novel => {
    const { genres, tags } = novelGenresAndTags(novel);
    return [...genres, ...tags].some(token => fantasyPattern.test(token));
  });
  const fantasyGenre = pickTopMatchingGenre(fantasyMatches, fantasyPattern, [/fantasy/i, /cultivation|tu tiên/i, /khoa học/i]);

  const healingPattern = /đời thường|lãng mạn|chữa lành|slice|nhẹ nhàng|tình cảm/i;
  const healingMatches = catalogNovels.filter(novel => {
    const { genres, tags } = novelGenresAndTags(novel);
    return [...genres, ...tags].some(token => healingPattern.test(token));
  });
  const healingGenre = pickTopMatchingGenre(healingMatches, healingPattern, [/đời thường/i, /lãng mạn/i]);

  const journeyPattern = /trưởng thành|phiêu lưu|kiếm hiệp|tu tiên|cultivation|hành trình|hành động/i;
  const journeyMatches = catalogNovels.filter(novel => {
    if ((novel.chaptersCount ?? 0) < 3) return false;
    const { genres, tags } = novelGenresAndTags(novel);
    return [...genres, ...tags, novel.synopsis ?? ''].some(token => journeyPattern.test(token));
  });
  const journeyGenre = pickTopMatchingGenre(journeyMatches, journeyPattern, [/kiếm hiệp/i, /phiêu lưu/i, /cultivation|tu tiên/i]);

  return [
    {
      id: 'weekend',
      title: 'Đọc một mạch cuối tuần',
      description: 'Những câu chuyện đã hoàn thành, gọn gàng và trọn vẹn cảm xúc.',
      icon: 'menu_book',
      href: `${catalogPath}?status=COMPLETED&sort=views:desc`,
      matchedCount: weekendMatches.length,
      imageSrc: collectionWeekendArt,
      imagePosition: 'center 74%',
    },
    {
      id: 'fantasy',
      title: 'Dị giới kỳ ảo',
      description: 'Bước vào những thế giới khác, huyền ảo và giàu trí tưởng tượng.',
      icon: 'castle',
      href: fantasyGenre
        ? `${catalogPath}?genre=${encodeURIComponent(fantasyGenre)}&sort=views:desc`
        : `${catalogPath}?sort=views:desc`,
      matchedCount: fantasyMatches.length,
      imageSrc: collectionFantasyArt,
      imagePosition: 'center 42%',
    },
    {
      id: 'healing',
      title: 'Chữa lành nhẹ nhàng',
      description: 'Những câu chuyện ấm áp, đời thường giúp bạn thư giãn và lắng lại.',
      icon: 'spa',
      href: healingGenre
        ? `${catalogPath}?genre=${encodeURIComponent(healingGenre)}&sort=likes:desc`
        : `${catalogPath}?sort=likes:desc`,
      matchedCount: healingMatches.length,
    },
    {
      id: 'journey',
      title: 'Hành trình trưởng thành',
      description: 'Cùng nhân vật vượt thử thách, khám phá và hoàn thiện bản thân.',
      icon: 'hiking',
      href: journeyGenre
        ? `${catalogPath}?genre=${encodeURIComponent(journeyGenre)}&sort=views:desc`
        : `${catalogPath}?sort=views:desc`,
      matchedCount: journeyMatches.length,
    },
  ];
}

function CollectionVectorArtwork({ kind }: { kind: 'healing' | 'journey' }) {
  if (kind === 'healing') {
    return (
      <svg className="sc-home-col-svg" viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="sc-col-heal-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde6ea" />
            <stop offset="52%" stopColor="#fff3ea" />
            <stop offset="100%" stopColor="#f9d9e0" />
          </linearGradient>
          <radialGradient id="sc-col-heal-sun" cx="76%" cy="28%" r="48%">
            <stop offset="0%" stopColor="#fff9e8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffd9c4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="360" height="140" fill="url(#sc-col-heal-sky)" />
        <rect width="360" height="140" fill="url(#sc-col-heal-sun)" />
        <path d="M0 106 Q95 88 188 100 T360 94 V140 H0 Z" fill="#e8e2d0" opacity="0.65" />
        <path d="M0 116 Q120 106 230 114 T360 110 V140 H0 Z" fill="#d4dec8" opacity="0.8" />
        {/* Wooden park bench */}
        <g opacity="0.88">
          <rect x="122" y="88" width="116" height="6" rx="2.5" fill="#b77f62" />
          <rect x="122" y="97" width="116" height="6" rx="2.5" fill="#a87054" />
          <rect x="116" y="106" width="128" height="6" rx="2.5" fill="#9a6349" />
          <rect x="132" y="86" width="5" height="35" rx="2" fill="#7c4e3b" />
          <rect x="223" y="86" width="5" height="35" rx="2" fill="#7c4e3b" />
        </g>
        {/* Cherry blossom boughs */}
        <path d="M-10 18 Q72 28 134 52" stroke="#8f5d52" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M370 14 Q290 30 232 48" stroke="#8f5d52" strokeWidth="4" strokeLinecap="round" fill="none" />
        <g fill="#f5a7b8" opacity="0.92">
          <circle cx="38" cy="24" r="14" />
          <circle cx="62" cy="18" r="16" />
          <circle cx="88" cy="30" r="14" />
          <circle cx="116" cy="40" r="11" />
          <circle cx="318" cy="22" r="15" />
          <circle cx="288" cy="28" r="13" />
          <circle cx="256" cy="38" r="11" />
        </g>
        <g fill="#ffd4de" opacity="0.9">
          <circle cx="48" cy="28" r="8" />
          <circle cx="76" cy="22" r="9" />
          <circle cx="104" cy="36" r="7" />
          <circle cx="304" cy="24" r="9" />
          <circle cx="272" cy="34" r="7" />
        </g>
        {/* Drifting petals */}
        <g fill="#f499ad" opacity="0.78">
          <ellipse cx="160" cy="44" rx="4.5" ry="2.2" transform="rotate(-24 160 44)" />
          <ellipse cx="204" cy="58" rx="4" ry="2" transform="rotate(18 204 58)" />
          <ellipse cx="92" cy="74" rx="4" ry="2" transform="rotate(32 92 74)" />
          <ellipse cx="268" cy="76" rx="4.5" ry="2.2" transform="rotate(-18 268 76)" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="sc-home-col-svg" viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sc-col-jrn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3d8dc" />
          <stop offset="48%" stopColor="#fde1c6" />
          <stop offset="100%" stopColor="#ffefcf" />
        </linearGradient>
        <radialGradient id="sc-col-jrn-sun" cx="50%" cy="62%" r="42%">
          <stop offset="0%" stopColor="#fff9e2" />
          <stop offset="55%" stopColor="#ffca82" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffca82" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="140" fill="url(#sc-col-jrn-sky)" />
      <rect width="360" height="140" fill="url(#sc-col-jrn-sun)" />
      <circle cx="180" cy="78" r="24" fill="#fff7da" opacity="0.92" />
      {/* Distant ridges */}
      <path d="M0 98 L62 56 L126 84 L196 48 L266 80 L322 54 L360 76 V140 H0 Z" fill="#d9a18e" opacity="0.52" />
      <path d="M0 108 L86 72 L156 98 L234 68 L314 96 L360 82 V140 H0 Z" fill="#c2806b" opacity="0.68" />
      <path d="M0 118 Q104 94 184 110 T360 104 V140 H0 Z" fill="#9a5f4e" opacity="0.82" />
      {/* Sunlit winding trail */}
      <path d="M168 140 Q180 124 198 117 T214 104" stroke="#ffe5bd" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.86" />
      <path d="M168 140 Q180 124 198 117 T214 104" stroke="#fff7e6" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.95" />
    </svg>
  );
}

export function HomeLowerSections({
  catalogPath,
  catalogNovels,
  featuredIds,
  topFeaturedIds,
  topFeaturedId,
  completedNovels,
  completedPending,
  completedError,
  onRetryCompleted,
  authors,
  catalogPending,
}: {
  catalogPath: string;
  catalogNovels: ReaderNovel[];
  featuredIds: Set<string>;
  topFeaturedIds: Set<string>;
  topFeaturedId?: string;
  completedNovels: ReaderNovel[];
  completedPending: boolean;
  completedError: boolean;
  onRetryCompleted: () => void;
  authors: AuthorEntry[];
  catalogPending: boolean;
}) {
  const user = useAuthStore(state => state.user);
  const isReaderSide = Boolean(user && user.role !== 'ADMIN' && user.status === 'ACTIVE');
  const isWriter = user?.role === 'AUTHOR' || user?.role === 'ADMIN';

  // 1. Góc truyện đề cử (ổn định theo ngày từ danh sách truyện thật)
  const spotlight = useMemo(
    () => pickDailySpotlight(catalogNovels, topFeaturedId),
    [catalogNovels, topFeaturedId]
  );

  // 2. Bình luận & đánh giá công khai gần đây (tái sử dụng API công khai theo từng truyện nổi bật)
  const communitySourceNovels = useMemo(
    () =>
      catalogNovels
        .slice()
        .sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0) || (b.likesCount ?? 0) - (a.likesCount ?? 0))
        .slice(0, 5),
    [catalogNovels]
  );
  const communitySourceKey = communitySourceNovels.map(novel => novel.novelId).join(',');

  const communityQuery = useQuery({
    queryKey: ['reader-home-recent-community', catalogPath, communitySourceKey],
    enabled: communitySourceNovels.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<CommunityEntry[]> => {
      const results = await Promise.allSettled(
        communitySourceNovels.map(async novel => {
          const [reviewsRes, commentsRes] = await Promise.allSettled([
            listNovelReviews(novel.novelId, 1, 'newest'),
            listTargetComments({ kind: 'novel', id: novel.novelId }, 1),
          ]);

          const entries: CommunityEntry[] = [];

          if (reviewsRes.status === 'fulfilled') {
            for (const rev of reviewsRes.value.items) {
              const text = rev.review?.trim();
              if (!text) continue;
              entries.push({
                id: `rev:${novel.novelId}:${rev.userId}:${rev.updatedAt || rev.createdAt}`,
                kind: 'review',
                authorName: rev.displayName || 'Độc giả',
                avatarUrl: rev.avatarUrl ?? null,
                novelId: novel.novelId,
                novelTitle: novel.title,
                score: typeof rev.score === 'number' ? rev.score : null,
                content: text,
                createdAt: rev.updatedAt || rev.createdAt,
                href: `${catalogPath}/novels/${novel.novelId}/reviews`,
              });
            }
          }

          if (commentsRes.status === 'fulfilled') {
            for (const cmt of commentsRes.value.items) {
              const text = cmt.content?.trim();
              if (!text || cmt.isSpoiler) continue;
              if (cmt.audience && cmt.audience !== 'PUBLIC') continue;
              if (cmt.status && cmt.status !== 'VISIBLE') continue;
              const targetHref = cmt.chapterId
                ? `${catalogPath}/chapters/${cmt.chapterId}?commentId=${encodeURIComponent(cmt.commentId)}#reader-comments`
                : `${catalogPath}/novels/${novel.novelId}?commentId=${encodeURIComponent(cmt.commentId)}#reader-comments`;
              entries.push({
                id: `cmt:${cmt.commentId}`,
                kind: 'comment',
                authorName: cmt.displayName || 'Độc giả',
                avatarUrl: cmt.avatarUrl ?? null,
                novelId: novel.novelId,
                novelTitle: novel.title,
                score: null,
                content: text,
                createdAt: cmt.createdAt,
                href: targetHref,
              });
            }
          }

          return entries;
        })
      );

      const merged: CommunityEntry[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled') merged.push(...res.value);
      }

      return merged
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 6);
    },
  });

  const communityItems = communityQuery.data ?? [];
  const communityPageSize = 3;
  const communityTotalPages = Math.max(1, Math.ceil(communityItems.length / communityPageSize));
  const [communityPage, setCommunityPage] = useState(0);
  useEffect(() => {
    if (communityPage >= communityTotalPages) setCommunityPage(0);
  }, [communityPage, communityTotalPages]);
  const visibleCommunityItems = communityItems.slice(
    communityPage * communityPageSize,
    communityPage * communityPageSize + communityPageSize
  );
  const isCommunityCompact = !communityQuery.isPending && visibleCommunityItems.length <= 1;

  // 3. Gợi ý dành cho bạn (dựa trên lịch sử đọc/thư viện cho người đăng nhập, hoặc truyện công khai ít trùng cho khách)
  const historyQuery = useQuery({
    queryKey: ['reader-home-history', user?.userId],
    queryFn: () => listHistoryPage(1, 10),
    enabled: isReaderSide,
    staleTime: 30_000,
    retry: false,
  });

  const libraryQuery = useQuery({
    queryKey: ['reader-home-recs-library', user?.userId],
    queryFn: () => listLibraryPage(1, 10),
    enabled: isReaderSide,
    staleTime: 60_000,
    retry: false,
  });

  const recommendedNovels = useMemo(() => {
    if (catalogNovels.length === 0) return [];
    const byId = new Map(catalogNovels.map(n => [n.novelId, n]));
    const readIds = new Set<string>();
    const preferredGenres = new Map<string, number>();

    if (isReaderSide) {
      for (const item of historyQuery.data?.items ?? []) {
        readIds.add(item.novelId);
        const novel = byId.get(item.novelId);
        const genres = novel?.genres?.length ? novel.genres : novel?.genre ? [novel.genre] : [];
        for (const g of genres) preferredGenres.set(g.toLowerCase(), (preferredGenres.get(g.toLowerCase()) ?? 0) + 2);
      }
      for (const item of libraryQuery.data?.items ?? []) {
        const genres = item.genres?.length ? item.genres : item.genre ? [item.genre] : [];
        for (const g of genres) preferredGenres.set(g.toLowerCase(), (preferredGenres.get(g.toLowerCase()) ?? 0) + 3);
      }
    }

    const nonPlaceholder = catalogNovels.filter(
      novel => !(/^untitled\b/i.test(novel.title.trim()) && !novel.latestChapter)
    );
    const pool = nonPlaceholder.length >= 3 ? nonPlaceholder : catalogNovels;

    const excludeAllFeatured = new Set<string>(featuredIds);
    if (spotlight) excludeAllFeatured.add(spotlight.novelId);

    const scored = pool.map(novel => {
      const genres = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
      let score = 0;
      if (isReaderSide) {
        if (readIds.has(novel.novelId)) score -= 25;
        for (const g of genres) score += (preferredGenres.get(g.toLowerCase()) ?? 0) * 6;
      }
      if (!excludeAllFeatured.has(novel.novelId)) score += 22;
      else if (!topFeaturedIds.has(novel.novelId)) score += 12;
      if (spotlight && novel.novelId === spotlight.novelId) score -= 24;
      if (novel.coverImageUrl) score += 3;
      if ((novel.chaptersCount ?? 0) >= 3) score += 3;
      score += Math.min(5, Math.log10((novel.viewsCount ?? 0) + 1) * 2);
      return { novel, score };
    });

    return scored
      .sort((a, b) => b.score - a.score || (b.novel.viewsCount ?? 0) - (a.novel.viewsCount ?? 0))
      .map(entry => entry.novel)
      .slice(0, 9);
  }, [catalogNovels, featuredIds, topFeaturedIds, spotlight, isReaderSide, historyQuery.data?.items, libraryQuery.data?.items]);

  const uniqueCompletedNovels = useMemo(() => {
    const seen = new Set<string>();
    return completedNovels.filter(novel => {
      if ((novel.serialStatus ?? novel.status) !== 'COMPLETED') return false;
      if (seen.has(novel.novelId)) return false;
      seen.add(novel.novelId);
      return true;
    });
  }, [completedNovels]);

  const readingCollections = useMemo(
    () =>
      buildReadingCollections(catalogNovels, uniqueCompletedNovels, catalogPath).filter(
        col => col.matchedCount > 0
      ),
    [catalogNovels, uniqueCompletedNovels, catalogPath]
  );

  const [recPage, setRecPage] = useState(0);
  const recPageSize = 3;
  const recTotalPages = Math.max(1, Math.ceil(recommendedNovels.length / recPageSize));
  const safeRecPage = Math.min(recPage, recTotalPages - 1);
  const visibleRecs = recommendedNovels.slice(safeRecPage * recPageSize, safeRecPage * recPageSize + recPageSize);

  const novelPath = (novel: ReaderNovel) => `${catalogPath}/novels/${novel.novelId}`;
  const writerCtaTo = isWriter ? '/author/projects' : user ? '/profile/me' : '/login';

  return (
    <div className="sc-home-lower">
      {/* 1. Góc truyện đề cử (Full-width spotlight) */}
      {(catalogPending || spotlight) && (
        <section className="sc-home-panel sc-home-spotlight" aria-label="Góc truyện đề cử">
          <div className="sc-home-spotlight-bg" aria-hidden="true">
            <svg viewBox="0 0 640 240" fill="none" preserveAspectRatio="xMaxYMid slice">
              <defs>
                <radialGradient id="sc-spot-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(500 50) rotate(135) scale(260 180)">
                  <stop stopColor="var(--home-accent)" stopOpacity=".22" />
                  <stop offset="1" stopColor="var(--home-accent)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="640" height="240" fill="url(#sc-spot-glow)" />
              <path d="M260 240C335 190 405 182 475 196C535 208 590 175 640 148V240H260Z" fill="currentColor" opacity=".09" />
              <path d="M350 240C420 202 490 198 560 212C595 219 620 208 640 196V240H350Z" fill="currentColor" opacity=".12" />
              <path d="M472 178V122L488 102L504 122V178M510 178V108L530 84L550 108V178M556 178V132L572 114L588 132V178" stroke="currentColor" strokeWidth="1.4" strokeOpacity=".26" fill="currentColor" fillOpacity=".07" />
              <circle cx="448" cy="64" r="16" fill="currentColor" opacity=".1" />
              <path d="M412 88L414 93L419 95L414 97L412 102L410 97L405 95L410 93L412 88Z" fill="currentColor" opacity=".28" />
            </svg>
          </div>

          <div className="sc-home-spotlight-inner">
            <div className="sc-home-sec-head sc-home-spotlight-head">
              <div className="sc-home-sec-left">
                <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">auto_awesome</span>
                <h2>Góc truyện đề cử</h2>
              </div>
              {spotlight && (
                <Link className="sc-home-sec-link" to={novelPath(spotlight)}>Xem chi tiết →</Link>
              )}
            </div>

            {catalogPending && !spotlight ? (
              <div className="sc-home-spotlight-body is-skeleton" aria-busy="true">
                <span className="sc-skeleton-block sc-home-spotlight-cover" />
                <div className="sc-home-spotlight-info">
                  <span className="sc-skeleton-block" style={{ width: '44%', height: 22 }} />
                  <span className="sc-skeleton-block" style={{ width: '28%', height: 16 }} />
                  <span className="sc-skeleton-block" style={{ width: '78%', height: 14 }} />
                  <span className="sc-skeleton-block" style={{ width: '68%', height: 14 }} />
                  <span className="sc-skeleton-block" style={{ width: 120, height: 36, borderRadius: 999 }} />
                </div>
              </div>
            ) : spotlight ? (
              <div className="sc-home-spotlight-body">
                <Link
                  to={novelPath(spotlight)}
                  className="sc-home-spotlight-cover"
                  aria-label={`Đọc truyện đề cử: ${spotlight.title}`}
                >
                  <HomeNovelCover novel={spotlight} size="card" />
                </Link>

                <div className="sc-home-spotlight-info">
                  <h3>
                    <Link to={novelPath(spotlight)}>{spotlight.title}</Link>
                  </h3>

                  <div className="sc-home-spotlight-meta">
                    {resolveNovelPills(spotlight).map((pill, idx) => (
                      <span
                        key={`${pill.kind}-${pill.label}`}
                        className={`sc-home-spot-pill ${idx === 0 ? 'is-primary' : 'is-secondary'}`}
                        translate="no"
                      >
                        {pill.label}
                      </span>
                    ))}
                    {spotlight.authorName && (
                      <Link to={`/authors/${spotlight.authorId}`} className="sc-home-spotlight-author">
                        <span className="material-symbols-outlined" aria-hidden="true">person</span>
                        <span>{spotlight.authorName}</span>
                      </Link>
                    )}
                  </div>

                  <p className="sc-home-spotlight-synopsis">
                    {spotlight.synopsis?.trim() || 'Mở trang truyện để xem giới thiệu đầy đủ và theo dõi các chương mới nhất.'}
                  </p>

                  <ul className="sc-home-spotlight-facts">
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>{count(spotlight.chaptersCount)} chương đã xuất bản</span>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>{count(spotlight.viewsCount)} lượt đọc</span>
                    </li>
                    <li>
                      <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                      <span>Trạng thái: {novelStatusLabel(spotlight)}</span>
                    </li>
                    {(spotlight.likesCount ?? 0) > 0 && (
                      <li>
                        <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                        <span>{count(spotlight.likesCount)} lượt yêu thích</span>
                      </li>
                    )}
                  </ul>

                  <div className="sc-home-spotlight-actions">
                    <Link to={novelPath(spotlight)} className="sc-home-pill-btn sc-home-pill-primary">
                      <span>Đọc ngay</span>
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* 2. Truyện đã hoàn thành (Full-width: 1–2 truyện hiển thị card ngang; >=3 hiển thị lưới 6 bìa 2:3) */}
      <section className="sc-home-panel sc-home-section" id="completed-novels" aria-label="Truyện đã hoàn thành">
        <div className="sc-home-sec-head">
          <div className="sc-home-sec-left">
            <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">task_alt</span>
            <h2>Truyện đã hoàn thành</h2>
          </div>
          <Link className="sc-home-sec-link" to={`${catalogPath}?status=COMPLETED`}>Xem tất cả →</Link>
        </div>

        {completedPending ? (
          <div className="sc-home-completed-horiz" aria-busy="true">
            {Array.from({ length: 2 }, (_, idx) => (
              <div key={idx} className="sc-home-completed-hcard is-skeleton" aria-hidden="true">
                <span className="sc-skeleton-block sc-home-completed-hcover" />
                <div className="sc-home-completed-hbody">
                  <span className="sc-skeleton-block" style={{ width: '58%', height: 16 }} />
                  <span className="sc-skeleton-block" style={{ width: '36%', height: 18 }} />
                  <span className="sc-skeleton-block" style={{ width: '92%', height: 13 }} />
                  <span className="sc-skeleton-block" style={{ width: '48%', height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : completedError ? (
          <div className="sc-home-inline-notice" role="alert">
            <span>Không tải được danh sách truyện đã hoàn thành.</span>
            <button type="button" onClick={onRetryCompleted}>Thử lại</button>
          </div>
        ) : uniqueCompletedNovels.length === 0 ? (
          <div className="sc-home-empty-inline">
            <span className="material-symbols-outlined" aria-hidden="true">auto_stories</span>
            <p>Hiện chưa có truyện nào ở trạng thái đã hoàn thành.</p>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem danh sách truyện →</Link>
          </div>
        ) : uniqueCompletedNovels.length <= 2 ? (
          <div className={`sc-home-completed-horiz${uniqueCompletedNovels.length === 1 ? ' is-single' : ''}`}>
            {uniqueCompletedNovels.map(novel => {
              const primaryGenre = novel.genres?.[0] || novel.genre;
              return (
                <Link key={novel.novelId} to={novelPath(novel)} className="sc-home-completed-hcard">
                  <span className="sc-home-completed-hcover">
                    <HomeNovelCover novel={novel} size="compact" />
                  </span>
                  <div className="sc-home-completed-hbody">
                    <strong className="sc-home-completed-htitle">{novel.title}</strong>
                    <div className="sc-home-completed-hpills">
                      {primaryGenre && (
                        <span className="sc-home-spot-pill is-secondary" translate="no">{primaryGenre}</span>
                      )}
                      <span className="sc-home-spot-pill is-primary">Hoàn thành</span>
                    </div>
                    <p className="sc-home-completed-hsynopsis">
                      {novel.synopsis?.trim() || 'Câu chuyện đã hoàn thành trọn vẹn, sẵn sàng để đọc liền mạch từ đầu đến cuối.'}
                    </p>
                    <div className="sc-home-completed-hmeta">
                      <span>
                        <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                        {count(novel.chaptersCount)} chương
                      </span>
                      <span>
                        <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                        {count(novel.viewsCount)} lượt đọc
                      </span>
                    </div>
                  </div>
                  <span className="sc-home-completed-harrow" aria-hidden="true">
                    <span className="material-symbols-outlined">chevron_right</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="sc-home-completed-grid">
            {uniqueCompletedNovels.slice(0, 6).map(novel => (
              <article key={novel.novelId} className="sc-home-featured-card">
                <div className="sc-home-featured-media">
                  <Link className="sc-home-featured-cover-link" to={novelPath(novel)} aria-label={`Đọc truyện hoàn thành: ${novel.title}`}>
                    <span className="sc-home-featured-cover">
                      <HomeNovelCover novel={novel} size="card" />
                    </span>
                  </Link>
                  <NovelQuickPreview novel={novel} to={novelPath(novel)} />
                </div>
                <Link className="sc-home-featured-title" to={novelPath(novel)} title={novel.title}>
                  {novel.title}
                </Link>
                <div className="sc-home-ftags">
                  <span className="is-primary">Hoàn thành</span>
                  <span className="is-secondary">{count(novel.chaptersCount)} chương</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 3. Bộ sưu tập theo gu đọc (Full-width, chỉ hiện bộ sưu tập có truyện khớp thật) */}
      {readingCollections.length > 0 && (
        <section className="sc-home-panel sc-home-section" id="reading-collections" aria-label="Bộ sưu tập theo gu đọc">
          <div className="sc-home-sec-head sc-home-collections-head">
            <div className="sc-home-collections-title">
              <div className="sc-home-sec-left">
                <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">collections_bookmark</span>
                <h2>Bộ sưu tập theo gu đọc</h2>
              </div>
              <p className="sc-home-collections-sub">
                Những bộ truyện được tuyển chọn theo chủ đề và cảm hứng đọc dành cho bạn.
              </p>
            </div>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem tất cả truyện →</Link>
          </div>

          <div className="sc-home-collections-grid">
            {readingCollections.map(col => (
              <Link key={col.id} to={col.href} className={`sc-home-collection-card is-col-${col.id}`}>
                <div className="sc-home-col-media" aria-hidden="true">
                  {col.imageSrc ? (
                    <img
                      src={col.imageSrc}
                      alt=""
                      loading="lazy"
                      style={col.imagePosition ? { objectPosition: col.imagePosition } : undefined}
                    />
                  ) : (
                    <CollectionVectorArtwork kind={col.id === 'healing' ? 'healing' : 'journey'} />
                  )}
                  <span className="sc-home-col-count">{count(col.matchedCount)} truyện</span>
                </div>
                <div className="sc-home-col-body">
                  <div className="sc-home-col-heading">
                    <span className="material-symbols-outlined sc-home-col-icon" aria-hidden="true">{col.icon}</span>
                    <h3>{col.title}</h3>
                  </div>
                  <p>{col.description}</p>
                  <span className="sc-home-col-cta">Xem bộ sưu tập →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3. Bình luận & đánh giá gần đây + Gợi ý dành cho bạn (2 cột full-width trên desktop) */}
      <div className="sc-home-lower-paired">
        <section
          className={`sc-home-panel sc-home-section sc-home-community-card${isCommunityCompact ? ' is-compact' : ''}`}
          aria-label="Bình luận và đánh giá gần đây"
        >
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">rate_review</span>
              <h2>Bình luận &amp; đánh giá gần đây</h2>
            </div>
          </div>

          {communityQuery.isPending ? (
            <div className="sc-home-review-skeleton" aria-busy="true">
              <span className="sc-skeleton-block" style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none' }} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <span className="sc-skeleton-block" style={{ width: '62%', height: 14 }} />
                <span className="sc-skeleton-block" style={{ width: '92%', height: 13 }} />
                <span className="sc-skeleton-block" style={{ width: '40%', height: 11 }} />
              </div>
            </div>
          ) : communityQuery.isError ? (
            <div className="sc-home-inline-notice" role="alert">
              <span>Chưa tải được bình luận và đánh giá gần đây.</span>
              <button type="button" onClick={() => void communityQuery.refetch()}>Thử lại</button>
            </div>
          ) : visibleCommunityItems.length === 0 ? (
            <div className="sc-home-empty-block sc-home-community-empty">
              <span className="sc-home-empty-badge" aria-hidden="true">
                <span className="material-symbols-outlined">rate_review</span>
              </span>
              <p>Chưa có bình luận hay đánh giá công khai gần đây trên các truyện nổi bật.</p>
              <Link className="sc-home-sec-link" to={catalogPath}>Đọc truyện &amp; để lại nhận xét →</Link>
            </div>
          ) : (
            <div className="sc-home-community-body">
              <div className={`sc-home-review-stack${visibleCommunityItems.length === 1 ? ' is-single' : ''}`}>
                {visibleCommunityItems.map(entry => {
                  const filledStars = entry.score !== null ? Math.max(1, Math.min(5, Math.round(entry.score / 2))) : 0;
                  return (
                    <Link key={entry.id} to={entry.href} className="sc-home-review-card">
                      <div className="sc-home-review-top">
                        <div className="sc-home-review-identity">
                          <span className="sc-home-review-avatar" aria-hidden="true">
                            {entry.avatarUrl ? (
                              <img src={entry.avatarUrl} alt="" loading="lazy" />
                            ) : (
                              entry.authorName.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <div className="sc-home-review-person">
                            <div className="sc-home-review-name-row">
                              <strong className="sc-home-review-author">{entry.authorName}</strong>
                              <span className="sc-home-review-kind">
                                {entry.kind === 'review' ? 'Đánh giá' : 'Bình luận'}
                              </span>
                            </div>
                            <time className="sc-home-review-time" dateTime={entry.createdAt}>
                              {relativeTime(entry.createdAt)}
                            </time>
                          </div>
                        </div>

                        {entry.score !== null && (
                          <div className="sc-home-review-score-pill" aria-label={`Điểm ${entry.score} trên 10`}>
                            <span className="sc-home-review-stars" aria-hidden="true">
                              {Array.from({ length: 5 }, (_, i) => (
                                <span
                                  key={i}
                                  className={`material-symbols-outlined${i < filledStars ? ' is-filled' : ''}`}
                                >
                                  star
                                </span>
                              ))}
                            </span>
                            <strong className="sc-home-review-score">{entry.score}/10</strong>
                          </div>
                        )}
                      </div>

                      <div className="sc-home-review-novel-row">
                        <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                        <span className="sc-home-review-novel">{entry.novelTitle}</span>
                      </div>

                      <blockquote className="sc-home-review-quote">
                        {entry.content}
                      </blockquote>
                    </Link>
                  );
                })}
              </div>

              {communityTotalPages > 1 && (
                <div className="sc-home-slider-nav" aria-label="Chuyển trang bình luận gần đây">
                  <button
                    type="button"
                    className="sc-home-slider-arrow"
                    aria-label="Trang trước"
                    onClick={() => setCommunityPage(prev => (prev - 1 + communityTotalPages) % communityTotalPages)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                  </button>
                  <div className="sc-home-slider-dots" role="tablist" aria-label="Chọn trang bình luận">
                    {Array.from({ length: communityTotalPages }, (_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        role="tab"
                        aria-selected={idx === communityPage}
                        aria-label={`Trang ${idx + 1}`}
                        className={`sc-home-slider-dot${idx === communityPage ? ' is-active' : ''}`}
                        onClick={() => setCommunityPage(idx)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="sc-home-slider-arrow"
                    aria-label="Trang tiếp theo"
                    onClick={() => setCommunityPage(prev => (prev + 1) % communityTotalPages)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="sc-home-panel sc-home-section sc-home-recs-card" aria-label="Gợi ý dành cho bạn">
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">recommend</span>
              <h2>Gợi ý dành cho bạn</h2>
            </div>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem thêm →</Link>
          </div>

          {catalogPending && visibleRecs.length === 0 ? (
            <div className="sc-home-recs-grid" aria-busy="true">
              {Array.from({ length: 3 }, (_, idx) => (
                <div key={idx} className="sc-home-rec-item is-skeleton" aria-hidden="true">
                  <span className="sc-skeleton-block sc-home-rec-cover" />
                  <span className="sc-skeleton-block" style={{ width: '80%', height: 12, marginTop: 7 }} />
                </div>
              ))}
            </div>
          ) : visibleRecs.length === 0 ? (
            <div className="sc-home-empty-block">
              <p>Chưa có đủ truyện để gợi ý lúc này.</p>
            </div>
          ) : (
            <div className="sc-home-recs-carousel">
              {recTotalPages > 1 && (
                <button
                  type="button"
                  className="sc-home-slider-arrow"
                  aria-label="Nhóm gợi ý trước"
                  onClick={() => setRecPage(prev => (prev - 1 + recTotalPages) % recTotalPages)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                </button>
              )}

              <div className="sc-home-recs-grid">
                {visibleRecs.map(novel => {
                  const genre = novel.genres?.[0] || novel.genre;
                  return (
                    <Link
                      key={novel.novelId}
                      to={novelPath(novel)}
                      className="sc-home-rec-item"
                      title={novel.title}
                    >
                      <span className="sc-home-rec-cover">
                        <HomeNovelCover novel={novel} size="card" />
                      </span>
                      <strong className="sc-home-rec-title">{novel.title}</strong>
                      {genre && <span className="sc-home-rec-genre" translate="no">{genre}</span>}
                    </Link>
                  );
                })}
              </div>

              {recTotalPages > 1 && (
                <button
                  type="button"
                  className="sc-home-slider-arrow"
                  aria-label="Nhóm gợi ý tiếp theo"
                  onClick={() => setRecPage(prev => (prev + 1) % recTotalPages)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 4. Những người kể chuyện (Full-width, ngay phía trên Không gian sáng tác) */}
      {authors.length > 0 && (
        <section className="sc-home-panel sc-home-section" id="featured-authors" aria-label="Những người kể chuyện">
          <div className="sc-home-sec-head">
            <div className="sc-home-sec-left">
              <span className="material-symbols-outlined sc-home-sec-icon" aria-hidden="true">edit_note</span>
              <h2>Những người kể chuyện</h2>
            </div>
            <Link className="sc-home-sec-link" to={catalogPath}>Xem tác giả →</Link>
          </div>
          <div className="sc-home-authors">
            {authors.map(author => (
              <Link key={author.authorId} className="sc-home-author-item" to={`/authors/${author.authorId}`}>
                <span className="sc-home-author-avatar" aria-hidden="true">
                  {author.authorName.slice(0, 1).toUpperCase()}
                </span>
                <span className="sc-home-author-copy">
                  <strong>{author.authorName}</strong>
                  <small>{count(author.novelsCount)} tác phẩm</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 5. Không gian sáng tác (Full-width bottom banner) */}
      <section className="sc-home-panel sc-home-studio-banner" aria-label="Không gian sáng tác">
        <div className="sc-home-studio-copy">
          <h2>
            <span>Không gian sáng tác</span>
            <span className="material-symbols-outlined sc-home-studio-pen" aria-hidden="true">edit_note</span>
          </h2>
          <p>
            {isWriter
              ? 'Quản lý tác phẩm, viết chương mới và chia sẻ câu chuyện của bạn cùng cộng đồng đọc truyện StoryCraft.'
              : 'Giao lưu, chia sẻ kinh nghiệm viết và cùng nhau xây dựng những câu chuyện mới tại StoryCraft.'}
          </p>
          <Link to={writerCtaTo} className="sc-home-pill-btn sc-home-pill-primary">
            <span>{isWriter ? 'Mở không gian sáng tác' : 'Bắt đầu sáng tác'}</span>
            <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
        <div className="sc-home-studio-art" aria-hidden="true">
          <img src={writingStudioArt} alt="" loading="lazy" />
        </div>
      </section>
    </div>
  );
}
