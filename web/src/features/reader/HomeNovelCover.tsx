import { useState } from 'react';
import type { ReaderNovel } from './reader-api';

const primaryGenre = (novel: ReaderNovel) => novel.genres?.[0] || novel.genre || null;
const FALLBACK_TONES = ['blue', 'pink', 'purple', 'sage', 'night', 'cream'] as const;

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function genreIconName(genre: string | null) {
  if (!genre) return 'menu_book';
  if (/fantasy|kỳ ảo|huyền ảo/i.test(genre)) return 'auto_awesome';
  if (/đời thường|slice/i.test(genre)) return 'home';
  if (/lãng mạn|ngôn tình|romcom/i.test(genre)) return 'favorite';
  if (/cultivation|tu tiên|tiên hiệp/i.test(genre)) return 'landscape';
  if (/trinh thám|bí ẩn/i.test(genre)) return 'search';
  if (/phiêu lưu|hành trình/i.test(genre)) return 'explore';
  return 'menu_book';
}

export function HomeNovelCover({
  novel,
  eager = false,
  size = 'thumb',
}: {
  novel: Pick<ReaderNovel, 'novelId' | 'title' | 'coverImageUrl' | 'genre' | 'genres'>;
  eager?: boolean;
  size?: 'card' | 'lead' | 'thumb';
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

  const tone = FALLBACK_TONES[hashString(novel.novelId || novel.title) % FALLBACK_TONES.length];

  return (
    <span className={`sc-home-cover-fallback is-${size} is-tone-${tone}`} aria-hidden="true">
      {size !== 'thumb' && <span className="sc-home-cover-brand">STORYCRAFT · ORIGINAL</span>}
      <span className="sc-home-cover-glyph">
        <span className="material-symbols-outlined">{genreIconName(genreName)}</span>
      </span>
      {size !== 'thumb' && <span className="sc-home-cover-title">{novel.title}</span>}
      {size !== 'thumb' && <span className="sc-home-cover-foot">A STORY TO DISCOVER</span>}
    </span>
  );
}
