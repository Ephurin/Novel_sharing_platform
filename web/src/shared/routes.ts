
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

export const emitCanonicalLinks = import.meta.env.VITE_EMIT_CANONICAL_LINKS !== 'false';

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
