import { useState } from 'react';
import type { ReaderNovel } from './reader-api';

const primaryGenre = (novel: ReaderNovel) => novel.genres?.[0] || novel.genre || null;

export function HomeNovelCover({
  novel,
  eager = false,
  size = 'thumb',
}: {
  novel: ReaderNovel;
  eager?: boolean;
  size?: 'card' | 'lead' | 'thumb';
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const genreName = primaryGenre(novel);

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

  return (
    <span className={`sc-home-cover-placeholder is-${size}`} aria-hidden="true">
      <span className="sc-home-cover-spine" />
      <span className="sc-home-cover-frame">
        {size !== 'thumb' && <span className="sc-home-cover-corner is-tl" />}
        {size !== 'thumb' && <span className="sc-home-cover-corner is-br" />}
        <span className="sc-home-cover-crest">
          <span className="sc-home-cover-emblem">
            <span className="material-symbols-outlined">auto_stories</span>
          </span>
          {size !== 'thumb' && genreName && <span className="sc-home-cover-kicker">{genreName}</span>}
        </span>
        {size !== 'thumb' && (
          <span className="sc-home-cover-center">
            <span className="sc-home-cover-title">{novel.title}</span>
            {size === 'lead' && novel.authorName && (
              <span className="sc-home-cover-author">{novel.authorName}</span>
            )}
          </span>
        )}
        {size !== 'thumb' && (
          <span className="sc-home-cover-colophon">
            <span className="sc-home-cover-rule" />
            <span className="sc-home-cover-diamond" />
            <span className="sc-home-cover-rule" />
          </span>
        )}
      </span>
    </span>
  );
}
