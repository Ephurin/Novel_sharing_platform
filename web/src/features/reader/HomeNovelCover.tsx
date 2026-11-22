import { useState } from 'react';
import type { ReaderNovel } from './reader-api';

const primaryGenre = (novel: ReaderNovel) => novel.genres?.[0] || novel.genre || null;
const FALLBACK_TONES = ['blue', 'peach', 'purple', 'sage', 'night', 'cream', 'rose', 'teal'] as const;
const LITERARY_ICONS = [
  'auto_stories',
  'stylus_note',
  'eco',
  'wb_twilight',
  'bookmark_star',
  'flare',
  'local_library',
  'explore',
] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fallbackIconName(genre: string | null, title: string, seed: string) {
  if (genre) {
    if (/fantasy|kỳ ảo|huyền ảo/i.test(genre)) return 'auto_awesome';
    if (/đời thường|slice/i.test(genre)) return 'cottage';
    if (/lãng mạn|ngôn tình|romcom/i.test(genre)) return 'favorite';
    if (/cultivation|tu tiên|tiên hiệp/i.test(genre)) return 'landscape';
    if (/kiếm hiệp|võ|hành động/i.test(genre)) return 'swords';
    if (/trinh thám|bí ẩn/i.test(genre)) return 'search';
    if (/phiêu lưu|hành trình/i.test(genre)) return 'explore';
    if (/khoa học|viễn tưởng|sci-fi/i.test(genre)) return 'rocket_launch';
  }

  const normalized = title.toLowerCase();
  if (/đồng hồ|thời gian|kim/i.test(normalized)) return 'hourglass_top';
  if (/sao|trăng|đêm|vũ trụ/i.test(normalized)) return 'nights_stay';
  if (/mây|trời|gió|hoàng hôn/i.test(normalized)) return 'cloud';
  if (/sông|hồ|biển|mưa|bến/i.test(normalized)) return 'water';
  if (/đồi|thông|rừng|lá|hoa|cây/i.test(normalized)) return 'park';
  if (/cửa|nhà|phòng|thư viện/i.test(normalized)) return 'door_front';
  if (/bản đồ|hành trình|đường/i.test(normalized)) return 'explore';
  if (/dấu vết|bí mật|ẩn/i.test(normalized)) return 'fingerprint';

  return LITERARY_ICONS[hashString(seed) % LITERARY_ICONS.length];
}

export function HomeNovelCover({
  novel,
  eager = false,
  size = 'thumb',
}: {
  novel: Pick<ReaderNovel, 'novelId' | 'title' | 'coverImageUrl' | 'genre' | 'genres'>;
  eager?: boolean;
  size?: 'card' | 'compact' | 'lead' | 'thumb';
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const genreName = primaryGenre(novel as ReaderNovel);

  if (novel.coverImageUrl && novel.coverImageUrl !== failedUrl) {
    return (
      <img
        src={novel.coverImageUrl}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        onError={() => setFailedUrl(novel.coverImageUrl ?? undefined)}
      />
    );
  }

  const seed = novel.novelId || novel.title;
  const tone = FALLBACK_TONES[hashString(seed) % FALLBACK_TONES.length];
  const icon = fallbackIconName(genreName, novel.title, seed);
  const footLabel = genreName ? genreName.toUpperCase() : 'ORIGINAL';

  return (
    <span className={`sc-home-cover-fallback is-${size} is-tone-${tone}`} aria-hidden="true">
      {size !== 'thumb' && size !== 'compact' && (
        <span className="sc-home-cover-brand">STORYCRAFT</span>
      )}
      <span className="sc-home-cover-glyph">
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      {size !== 'thumb' && <span className="sc-home-cover-title">{novel.title}</span>}
      {size !== 'thumb' && size !== 'compact' && (
        <span className="sc-home-cover-foot" translate="no">{footLabel}</span>
      )}
    </span>
  );
}
