// UI-20: many chapter titles already start with "Chương N"; strip it where the number is shown separately.
const prefix = /^\s*(?:chương|chapter|ch\.)\s*\d+\s*[:.\-–—]?\s*/iu;

export function chapterTitleWithoutNumber(title: string | null | undefined) {
  return (title ?? '').replace(prefix, '').trim();
}

export function chapterShortLabel(chapterNumber: number, title: string | null | undefined) {
  const rest = chapterTitleWithoutNumber(title);
  return rest ? `Ch. ${chapterNumber}: ${rest}` : `Ch. ${chapterNumber}`;
}
