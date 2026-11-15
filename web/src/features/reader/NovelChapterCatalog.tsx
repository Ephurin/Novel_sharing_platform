import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { ReaderChapter } from './reader-api';

const chapterTitle = (chapter: ReaderChapter) => {
  const title = chapter.title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return title ? `Chương ${chapter.chapterNumber}: ${title}` : `Chương ${chapter.chapterNumber}`;
};

export function NovelChapterCatalog({ chapters, publicMode = false, readChapterIds = [], onReadFirst }: {
  chapters: ReaderChapter[]; publicMode?: boolean; readChapterIds?: string[]; onReadFirst?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const reduce = useReducedMotion();
  useEffect(() => setExpanded(false), [chapters]);
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const visible = expanded ? ordered : ordered.slice(0, 5);
  const read = new Set(readChapterIds);
  const visibleIds = visible.map(chapter => chapter.chapterId).join(',');
  useLayoutEffect(() => {
    const node = table.current;
    if (!node) { setHeight(undefined); return; }
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleIds]);
  return <section id="reader-chapters" className="sc-chapter-catalog" aria-label="Danh sách chương">
    <header className="sc-chapter-catalog-header"><h2>Danh sách chương <span>{chapters.length}</span></h2>
      {onReadFirst && <button type="button" className="sc-button sc-button-soft" aria-label="Đọc từ chương đầu" onClick={onReadFirst}>Đọc từ đầu</button>}
    </header>
    {!chapters.length ? <p className="sc-chapter-empty">Truyện chưa có chương nào được xuất bản.</p> : <>
      <motion.div initial={false} animate={{ height: height ?? 'auto' }} style={{ overflow: 'hidden' }} transition={{ duration: reduce ? 0 : .18 }}><div ref={table} className="sc-chapter-table-scroll"><table className="sc-chapter-table" id="reader-chapter-list">
        <thead><tr><th>Chương</th><th className="hidden md:table-cell">Số từ</th><th className="hidden sm:table-cell">Ngày đăng</th><th>Quyền đọc</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{visible.map(chapter => {
          const to = `${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`;
          return <tr key={chapter.chapterId} data-read={read.has(chapter.chapterId) || undefined}>
            <td><Link to={to} className="sc-reader-chapter-title" title={chapterTitle(chapter)}>{chapterTitle(chapter)}{read.has(chapter.chapterId) && <span className="sr-only"> · Đã đọc</span>}</Link></td>
            <td className="hidden md:table-cell">{(chapter.wordCount ?? 0).toLocaleString('vi-VN')}</td>
            <td className="hidden sm:table-cell"><time className="sc-reader-chapter-date" dateTime={chapter.publishedAt}>{chapter.publishedAt ? new Date(chapter.publishedAt).toLocaleDateString('vi-VN') : '—'}</time></td>
            <td><span className={chapter.isVip ? 'sc-chapter-access is-vip' : 'sc-chapter-access'}>{chapter.isVip ? `VIP • ${chapter.priceCoins} xu` : 'Miễn phí'}</span></td>
            <td><Link to={to} className="sc-button sc-button-soft" data-testid={`read-chapter-${chapter.chapterId}`} aria-label={`Đọc chương ${chapter.chapterNumber}`}>Đọc</Link></td>
          </tr>;
        })}</tbody>
      </table></div></motion.div>
      {chapters.length > 5 && <div className="sc-reader-chapters-toggle"><button type="button" className="sc-button sc-button-soft" aria-controls="reader-chapter-list" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn mục lục' : `Xem toàn bộ ${chapters.length} chương`}</button></div>}
    </>}
  </section>;
}
