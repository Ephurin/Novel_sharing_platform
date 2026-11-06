import { useEffect, useId, useRef, type PropsWithChildren } from 'react';
import { Popover } from '@animate-ui/react/primitives/radix-ui/popover';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import type { ReaderNovel } from './reader-api';
import { PreviewLibraryAction } from './HomePersonalization';

export function NovelQuickPreview({ novel, to }: { novel: ReaderNovel; to: string }) {
  const titleId = useId();
  const genres = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className="sc-home-preview-trigger" aria-label={`Xem nhanh: ${novel.title}`} title="Xem nhanh">
        <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="sc-home-preview" side="bottom" align="end" sideOffset={8} collisionPadding={16} aria-labelledby={titleId}>
        <header><h3 id={titleId}>{novel.title}</h3>
          <Popover.Close asChild><button type="button" className="sc-home-preview-close" aria-label="Đóng xem nhanh"><span className="material-symbols-outlined" aria-hidden="true">close</span></button></Popover.Close>
        </header>
        {novel.authorName && <Link className="sc-home-preview-author" to={`/authors/${novel.authorId}`}>{novel.authorName}</Link>}
        {genres.length > 0 && <p className="sc-home-preview-meta">{genres.join(' · ')}</p>}
        <p className="sc-home-preview-synopsis">{novel.synopsis?.trim() || 'Chưa có giới thiệu.'}</p>
        {(novel.chaptersCount != null || novel.viewsCount != null) && <p className="sc-home-preview-meta">{[
          novel.chaptersCount != null ? `${novel.chaptersCount.toLocaleString('vi-VN')} chương` : null,
          novel.viewsCount != null ? `${novel.viewsCount.toLocaleString('vi-VN')} lượt đọc` : null
        ].filter(Boolean).join(' · ')}</p>}
        <Popover.Close asChild><Link className="sc-home-preview-link" to={to}>Đọc truyện<span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></Link></Popover.Close>
        <PreviewLibraryAction novelId={novel.novelId} authorId={novel.authorId} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

/** Keep keyed children mounted; interrupted motion never decides the selected data. */
export function HomeResults({ identity, direction = 0, className, children }: PropsWithChildren<{ identity: string; direction?: number; className: string }>) {
  const controls = useAnimationControls();
  const previous = useRef(identity);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (previous.current !== identity) {
      if (reduce) controls.set({ opacity: 1, x: 0 });
      else void controls.start({ opacity: [.65, 1], x: [direction * 12, 0], transition: { duration: .18, ease: 'easeOut' } });
    } else controls.set({ opacity: 1, x: 0 });
    previous.current = identity;
    return () => controls.stop();
  }, [identity, direction, reduce, controls]);
  return <motion.div className={className} initial={false} animate={controls}>{children}</motion.div>;
}

export function HomeSectionState({ query, empty, variant = 'compact', onReset, announceLoading = true }: {
  query: { isPending: boolean; isError: boolean; data?: ReaderNovel[]; refetch: () => unknown };
  empty: string;
  variant?: 'featured' | 'compact' | 'rows' | 'ranking';
  onReset?: () => void;
  announceLoading?: boolean;
}) {
  if (query.isPending) return <div className={`sc-home-loading sc-home-loading-${variant}`} role={announceLoading ? 'status' : undefined} aria-hidden={!announceLoading || undefined}>
    {announceLoading && <span className="sc-home-sr-only">Đang tải truyện…</span>}
    {Array.from({ length: variant === 'compact' ? 6 : variant === 'ranking' ? 5 : 4 }, (_, index) => <div key={index} className="sc-home-loading-item" aria-hidden="true">
      <span className="sc-skeleton-block sc-home-loading-cover" />
      <div><span className="sc-skeleton-block" /><span className="sc-skeleton-block" /></div>
    </div>)}
  </div>;
  if (query.isError) return <div className="sc-home-inline-state" role="alert">
    <p>{query.data?.length ? 'Chưa cập nhật được danh sách.' : 'Không tải được truyện.'}</p>
    <button type="button" onClick={() => void query.refetch()}>Thử lại</button>
  </div>;
  if (!query.data?.length) return <div className="sc-home-inline-state">
    <h3>{empty}</h3>
    {onReset && <button type="button" onClick={onReset}>Bỏ bộ lọc</button>}
  </div>;
  return null;
}
