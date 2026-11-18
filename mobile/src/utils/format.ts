/**
 * Normalizes duplicate chapter prefixes such as:
 * chapterNumber=3, title="Chương 3: Đêm trăng" -> "Chương 3: Đêm trăng"
 * chapterNumber=3, title="Chương 3" -> "Chương 3"
 * chapterNumber=3, title="Đêm trăng trên đỉnh" -> "Chương 3: Đêm trăng trên đỉnh"
 */
export function stripDuplicateChapterPrefix(
  chapterNumber: number,
  rawTitle?: string | null
): string {
  const trimmed = (rawTitle ?? '').trim();
  if (!trimmed) return '';

  const pattern = new RegExp(`^chương\\s*0*${chapterNumber}(?:\\b|\\s*[:.\\-–—]\\s*)`, 'i');
  if (!pattern.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(pattern, '').replace(/^[:.\-–—]\s*/, '').trim();
}

export function formatChapterLabel(
  chapterNumber: number,
  rawTitle?: string | null
): string {
  const cleanTitle = stripDuplicateChapterPrefix(chapterNumber, rawTitle);
  return cleanTitle ? `Chương ${chapterNumber}: ${cleanTitle}` : `Chương ${chapterNumber}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatRelativeOrDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  if (diffMs >= 0) {
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
  }

  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad2(date.getHours());
  const mins = pad2(date.getMinutes());
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

export function extractInitials(name?: string | null): string {
  const cleaned = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'ĐG';
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}
