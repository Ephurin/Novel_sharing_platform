
import { generatePath, matchPath } from 'react-router-dom';

export const routes = {
  catalog: '/danh-sach',
  novel: '/truyen/:novelSlug',
  chapter: '/truyen/:novelSlug/chuong/:chapterSlug',
  reviews: '/truyen/:novelSlug/danh-gia',
  bookmarks: '/danh-dau',
  library: '/thu-vien',
  history: '/lich-su',
  topic: '/thao-luan/:topicSlug',
  topicEdit: '/thao-luan/:topicSlug/chinh-sua',
  member: '/thanh-vien/:publicKey',
  author: '/tac-gia/:publicKey'
} as const;

export const staticRouteTargets = {
  '/reader/connections': '/ket-noi',
  '/reader/feedback': '/gop-y',
  '/notifications': '/thong-bao',
  '/profile/me': '/tai-khoan',
  '/account/nominations': '/de-cu-cua-toi',
  '/appeals': '/khieu-nai',
  '/login': '/dang-nhap',
  '/verify-email': '/xac-thuc-email',
  '/wallet': '/vi',
  '/wallet/vnpay-return': '/vi/ket-qua-thanh-toan',
  '/discussions': '/thao-luan',
  '/discussions/mine': '/thao-luan/cua-toi',
  '/discussions/new': '/thao-luan/tao-moi',
  '/author': '/sang-tac',
  '/author/projects': '/sang-tac',
  '/author/ide': '/sang-tac/viet',
  '/author/import/:novelId': '/sang-tac/tac-pham/:novelId/nhap-ban-thao',
  '/author/context/:novelId': '/sang-tac/tac-pham/:novelId/boi-canh',
  '/author/novels/:novelId': '/sang-tac/tac-pham/:novelId',
  '/author/novels/:novelId/comments': '/sang-tac/tac-pham/:novelId/binh-luan',
  '/author/novels/:novelId/reviews': '/sang-tac/tac-pham/:novelId/danh-gia',
  '/moderator': '/kiem-duyet/hang-doi',
  '/moderator/reviews': '/kiem-duyet/hang-doi',
  '/moderator/reviews/:reviewId': '/kiem-duyet/hang-doi/:reviewId',
  '/moderator/history': '/kiem-duyet/lich-su',
  '/moderator/selections': '/kiem-duyet/de-cu',
  '/moderator/selections/:caseId': '/kiem-duyet/de-cu/:caseId',
  '/moderator/placements': '/kiem-duyet/lich-gioi-thieu',
  '/moderator/discussions': '/kiem-duyet/thao-luan',
  '/admin': '/quan-tri',
  '/admin/users': '/quan-tri/nguoi-dung',
  '/admin/users/:userId': '/quan-tri/nguoi-dung/:userId',
  '/admin/novels': '/quan-tri/tac-pham',
  '/admin/novels/:novelId': '/quan-tri/tac-pham/:novelId',
  '/admin/taxonomy': '/quan-tri/the-loai-va-nhan',
  '/admin/moderation': '/quan-tri/kiem-duyet',
  '/admin/moderation/:reviewId': '/quan-tri/kiem-duyet/:reviewId',
  '/admin/escalations': '/quan-tri/chuyen-cap',
  '/admin/reports': '/quan-tri/bao-cao',
  '/admin/audit': '/quan-tri/nhat-ky',
  '/admin/appeals': '/quan-tri/khieu-nai',
  '/admin/selection-reconsiderations': '/quan-tri/xet-lai-tuyen-chon',
  '/admin/placements': '/quan-tri/lich-gioi-thieu',
  '/admin/discussions': '/quan-tri/thao-luan',
  '/admin/withdraws': '/quan-tri/rut-tien',
  '/admin/withdraws/:requestId': '/quan-tri/rut-tien/:requestId'
} as const;

const staticAliases: Readonly<Record<string, string>> = {
  ...staticRouteTargets,
  '/public': routes.catalog,
  '/reader': routes.catalog,
  '/public/bookmarks': routes.bookmarks,
  '/reader/bookmarks': routes.bookmarks,
  '/reader/library': routes.library,
  '/reader/history': routes.history
};
const parameterizedAliases = Object.entries(staticAliases).filter(([path]) => path.includes(':'));

export function canonicalStaticPath(pathname: string) {
  const exact = staticAliases[pathname];
  if (typeof exact === 'string') return exact;

  for (const [pattern, target] of parameterizedAliases) {
    const match = matchPath(pattern, pathname);
    if (match) return generatePath(target, match.params);
  }
  return pathname;
}

export function legacyStaticPaths(pathname: string) {
  return Object.entries(staticAliases).flatMap(([legacy, canonical]) => {
    const match = matchPath(canonical, pathname);
    return match ? [generatePath(legacy, match.params)] : [];
  });
}

export function navigationHref(href: string) {
  if (!emitCanonicalLinks) return href;
  const separator = href.search(/[?#]/);
  const pathname = separator < 0 ? href : href.slice(0, separator);
  return canonicalStaticPath(pathname) + (separator < 0 ? '' : href.slice(separator));
}

export function roleHomePath(role?: string) {
  if (role === 'ADMIN') return staticRouteTargets['/admin'];
  if (role === 'MODERATOR') return staticRouteTargets['/moderator/reviews'];
  if (role === 'AUTHOR') return staticRouteTargets['/author'];
  return '/';
}

export const emitCanonicalLinks = import.meta.env?.VITE_EMIT_CANONICAL_LINKS !== 'false';

export function novelPath(novelSlug: string) {
  return `/truyen/${encodeURIComponent(novelSlug)}`;
}

export function chapterPath(novelSlug: string, chapterSlug: string) {
  return `${novelPath(novelSlug)}/chuong/${encodeURIComponent(chapterSlug)}`;
}

export function topicPath(topicSlug: string) {
  return `/thao-luan/${encodeURIComponent(topicSlug)}`;
}

export function profilePath(kind: 'member' | 'author', publicKey: string) {
  return `${kind === 'author' ? '/tac-gia/' : '/thanh-vien/'}${encodeURIComponent(publicKey)}`;
}

export function novelHref(novel: { novelId: string; novelSlug?: string }, base = '/reader', reviews = false) {
  if (emitCanonicalLinks && novel.novelSlug) return novelPath(novel.novelSlug) + (reviews ? '/danh-gia' : '');
  return `${base}/novels/${encodeURIComponent(novel.novelId)}${reviews ? '/reviews' : ''}`;
}

export function chapterHref(chapter: { chapterId: string; chapterSlug?: string; novelSlug?: string }, base = '/reader') {
  if (emitCanonicalLinks && chapter.novelSlug && chapter.chapterSlug) return chapterPath(chapter.novelSlug, chapter.chapterSlug);
  return `${base}/chapters/${encodeURIComponent(chapter.chapterId)}`;
}

export function topicHref(topic: { topicId: string; topicSlug?: string }, editing = false) {
  if (emitCanonicalLinks && topic.topicSlug) return topicPath(topic.topicSlug) + (editing ? '/chinh-sua' : '');
  return `/discussions/${encodeURIComponent(topic.topicId)}${editing ? '/edit' : ''}`;
}

export function profileHref(kind: 'member' | 'author', userId: string, publicKey?: string) {
  if (emitCanonicalLinks && publicKey) return profilePath(kind, publicKey);
  return `${kind === 'author' ? '/authors' : '/readers'}/${encodeURIComponent(userId)}`;
}

export function catalogHref(base = '/reader') {
  return emitCanonicalLinks ? routes.catalog : base;
}

export function bookmarksHref(base = '/reader') {
  return emitCanonicalLinks ? routes.bookmarks : `${base}/bookmarks`;
}
