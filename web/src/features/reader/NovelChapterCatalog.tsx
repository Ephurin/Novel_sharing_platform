import { chapterHref } from '../../shared/routes';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReaderChapter } from './reader-api';

const chapterTitle = (chapter: ReaderChapter) => {
  const title = chapter.title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return title ? `Chương ${chapter.chapterNumber}: ${title}` : `Chương ${chapter.chapterNumber}`;
};

export function NovelChapterCatalog({ chapters, novelSlug, publicMode = false, readChapterIds = [], onReadFirst }: {
  chapters: ReaderChapter[]; novelSlug?: string; publicMode?: boolean; readChapterIds?: string[]; onReadFirst?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [descending, setDescending] = useState(false);
  const novelKey = chapters[0]?.novelId ?? '';
  const isEmpty = chapters.length === 0;
  useEffect(() => { setExpanded(false); setDescending(false); }, [novelKey, isEmpty]);
  const ordered = useMemo(
    () => [...chapters].sort((a, b) => descending ? b.chapterNumber - a.chapterNumber : a.chapterNumber - b.chapterNumber),
    [chapters, descending]
  );
  const visible = expanded ? ordered : ordered.slice(0, 5);
  const read = useMemo(() => new Set(readChapterIds), [readChapterIds]);
  return <section id="reader-chapters" className="sc-chapter-catalog" aria-label="Danh sách chương">
    <header className="sc-chapter-catalog-header">
      <h2>Danh sách chương <span>{chapters.length}</span></h2>
      <div className="sc-chapter-catalog-actions">
        {chapters.length > 1 && <button type="button" className="sc-button sc-chapter-sort-toggle" aria-pressed={descending}
          aria-label={descending ? 'Thứ tự chương: Mới đến cũ' : 'Thứ tự chương: Cũ đến mới'}
          onClick={() => setDescending(value => !value)}>
          <span className="material-symbols-outlined" aria-hidden="true">swap_vert</span>
          <span>{descending ? 'Mới → Cũ' : 'Cũ → Mới'}</span>
        </button>}
        {onReadFirst && <button type="button" className="sc-button sc-button-soft" aria-label="Đọc từ chương đầu" onClick={onReadFirst}>Đọc từ đầu</button>}
      </div>
    </header>
    {!chapters.length ? <p className="sc-chapter-empty">Truyện chưa có chương nào được xuất bản.</p> : <>
      <div className="sc-chapter-table-scroll"><table className="sc-chapter-table" id="reader-chapter-list">
        <thead><tr><th>Chương</th><th className="hidden md:table-cell">Số từ</th><th className="hidden sm:table-cell">Ngày đăng</th><th>Quyền đọc</th></tr></thead>
        <tbody>{visible.map(chapter => {
          const to = chapterHref({ ...chapter, novelSlug }, publicMode ? '/public' : '/reader');
          const label = chapterTitle(chapter);
          return <tr key={chapter.chapterId} data-read={read.has(chapter.chapterId) || undefined}>
            <td><Link to={to} className="sc-reader-chapter-title" data-testid={`read-chapter-${chapter.chapterId}`} title={label}>{label}{read.has(chapter.chapterId) && <span className="sr-only"> · Đã đọc</span>}</Link></td>
            <td className="hidden md:table-cell">{(chapter.wordCount ?? 0).toLocaleString('vi-VN')}</td>
            <td className="hidden sm:table-cell"><time className="sc-reader-chapter-date" dateTime={chapter.publishedAt}>{chapter.publishedAt ? new Date(chapter.publishedAt).toLocaleDateString('vi-VN') : '—'}</time></td>
            <td><span className={chapter.isVip ? 'sc-chapter-access is-vip' : 'sc-chapter-access'}>{chapter.isVip ? `VIP • ${chapter.priceCoins} xu` : 'Miễn phí'}</span></td>
          </tr>;
        })}</tbody>
      </table></div>
      {chapters.length > 5 && <div className="sc-reader-chapters-toggle"><button type="button" className="sc-button sc-button-soft" aria-controls="reader-chapter-list" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn mục lục' : `Xem toàn bộ ${chapters.length} chương`}</button></div>}
    </>}
  </section>;
}
