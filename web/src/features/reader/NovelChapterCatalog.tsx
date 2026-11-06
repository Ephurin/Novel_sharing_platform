import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination, Select, TextInput } from '@mantine/core';
import { Collapsible } from '@animate-ui/react/primitives/radix-ui/collapsible';
import { motion, useReducedMotion } from 'motion/react';
import type { ReaderChapter } from './reader-api';

const pageSize = 20;
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const chapterTitle = (chapter: ReaderChapter) => {
  const title = chapter.title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return title ? `Chương ${chapter.chapterNumber}: ${title}` : `Chương ${chapter.chapterNumber}`;
};

export function NovelChapterCatalog({ chapters, publicMode = false, currentChapterId, onReadFirst }: {
  chapters: ReaderChapter[]; publicMode?: boolean; currentChapterId?: string; onReadFirst?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  const [access, setAccess] = useState('all');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const controlsId = useId();
  const table = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number>();
  const [jump, setJump] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => { setExpanded(false); setQ(''); setAccess('all'); setOrder('asc'); setPage(1); }, [chapters]);
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const filtered = ordered.filter(chapter => (!q.trim() || normalize(chapterTitle(chapter)).includes(normalize(q.trim()))) &&
    (access === 'all' || (access === 'vip' ? chapter.isVip : !chapter.isVip)));
  if (order === 'desc') filtered.reverse();
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = expanded ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize) : ordered.slice(0, 5);
  const visibleIds = visible.map(chapter => chapter.chapterId).join(',');
  useLayoutEffect(() => {
    const node = table.current;
    if (!node) { setTableHeight(undefined); return; }
    const measure = () => setTableHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleIds]);
  const update = (callback: () => void) => { callback(); setPage(1); };
  const reset = () => { setQ(''); setAccess('all'); setOrder('asc'); setPage(1); };
  const currentIndex = ordered.findIndex(chapter => chapter.chapterId === currentChapterId);
  const showCurrent = () => {
    reset(); setExpanded(true); setPage(Math.floor(currentIndex / pageSize) + 1); setJump(value => value + 1);
  };
  useEffect(() => {
    if (!jump) return;
    const link = table.current?.querySelector<HTMLAnchorElement>('[aria-current="location"]');
    link?.focus({ preventScroll: true });
    link?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [jump]);
  return <section id="reader-chapters" className="sc-chapter-catalog" aria-label="Danh sách chương">
    <header className="sc-chapter-catalog-header"><h2>Danh sách chương <span>{chapters.length}</span></h2>
      {onReadFirst && <button type="button" className="sc-button sc-button-soft" aria-label="Đọc từ chương đầu" onClick={onReadFirst}>Đọc từ đầu</button>}
    </header>
    {currentIndex >= 0 && <div className="sc-chapter-position">
      <div><span>Vị trí đọc: {currentIndex + 1} / {chapters.length} chương</span><button type="button" onClick={showCurrent}>Tới chương đang đọc</button></div>
      <progress value={currentIndex + 1} max={chapters.length} aria-label="Vị trí chương đang đọc" />
    </div>}
    {!chapters.length ? <p className="sc-chapter-empty">Truyện chưa có chương nào được xuất bản.</p> : <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
      <Collapsible.Content id={controlsId} transition={{ duration: reduce ? 0 : .18 }} exitTransition={{ duration: reduce ? 0 : .14 }}>
        <div className="sc-chapter-filters">
          <TextInput label="Tìm chương" placeholder="Số chương hoặc tên chương" value={q} maxLength={200} onChange={event => update(() => setQ(event.currentTarget.value))} />
          <Select label="Quyền đọc" value={access} allowDeselect={false} data={[{ value: 'all', label: 'Tất cả chương' }, { value: 'free', label: 'Miễn phí' }, { value: 'vip', label: 'VIP' }]} onChange={value => update(() => setAccess(value ?? 'all'))} />
          <Select label="Thứ tự chương" value={order} allowDeselect={false} data={[{ value: 'asc', label: 'Chương đầu trước' }, { value: 'desc', label: 'Chương mới trước' }]} onChange={value => update(() => setOrder(value ?? 'asc'))} />
        </div>
        <p className="sc-chapter-result" role="status">{filtered.length} chương · Trang {currentPage} / {totalPages}</p>
      </Collapsible.Content>
      {visible.length ? <motion.div initial={false} animate={{ height: tableHeight ?? 'auto' }} style={{ overflow: 'hidden' }} transition={{ duration: reduce ? 0 : .18 }}><div ref={table} className="sc-chapter-table-scroll"><table className="sc-chapter-table">
        <thead><tr><th>Chương</th><th className="hidden md:table-cell">Số từ</th><th className="hidden sm:table-cell">Ngày đăng</th><th>Quyền đọc</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{visible.map(chapter => {
          const to = `${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`;
          const current = chapter.chapterId === currentChapterId;
          return <tr key={chapter.chapterId} data-current={current || undefined}>
            <td><Link to={to} className="sc-reader-chapter-title" title={chapterTitle(chapter)} aria-current={current ? 'location' : undefined}>{chapterTitle(chapter)}</Link>{current && <span className="sc-chapter-current-label">Đang đọc</span>}</td>
            <td className="hidden md:table-cell">{(chapter.wordCount ?? 0).toLocaleString('vi-VN')}</td>
            <td className="hidden sm:table-cell"><time className="sc-reader-chapter-date" dateTime={chapter.publishedAt}>{chapter.publishedAt ? new Date(chapter.publishedAt).toLocaleDateString('vi-VN') : '—'}</time></td>
            <td><span className={chapter.isVip ? 'sc-chapter-access is-vip' : 'sc-chapter-access'}>{chapter.isVip ? `VIP • ${chapter.priceCoins} xu` : 'Miễn phí'}</span></td>
            <td><Link to={to} className="sc-button sc-button-soft" data-testid={`read-chapter-${chapter.chapterId}`} aria-label={`Đọc chương ${chapter.chapterNumber}`}>Đọc</Link></td>
          </tr>;
        })}</tbody>
      </table></div></motion.div> : <div className="sc-chapter-empty"><p>Không tìm thấy chương.</p><button type="button" className="sc-button" onClick={reset}>Bỏ bộ lọc chương</button></div>}
      {expanded && totalPages > 1 && <nav className="sc-chapter-pagination" aria-label="Phân trang chương"><Pagination total={totalPages} value={currentPage} onChange={next => { setPage(next); document.getElementById('reader-chapters')?.scrollIntoView({ block: 'start', behavior: 'instant' }); }} getItemProps={item => ({ 'aria-label': `Trang chương ${item}` })} /></nav>}
      <div className="sc-reader-chapters-toggle"><Collapsible.Trigger asChild><button type="button" className="sc-button sc-button-soft" aria-controls={controlsId}>{expanded ? 'Thu gọn mục lục' : chapters.length > 5 ? `Xem toàn bộ ${chapters.length} chương` : 'Tìm và lọc chương'}</button></Collapsible.Trigger></div>
    </Collapsible.Root>}
  </section>;
}
