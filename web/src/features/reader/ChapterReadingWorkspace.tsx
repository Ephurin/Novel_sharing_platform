import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NumberInput, Select } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { ReadingProgress } from '../../shared/components/ReadingProgress';
import { readerBackgrounds, useChapterReadingPreferences } from './useChapterReadingPreferences';
import { useReadingBookmarks } from './useReadingBookmarks';
import { ReadingBookmarksList } from './ReadingBookmarksPage';
import { readingLineAt, readingLineRects, readingRange, type ReadingLine } from './reading-lines';
import type { ReaderChapter, ReaderNovel, ReadingPreferences } from './reader-api';
import './chapter-reading-workspace.css';

const fonts = ['Be Vietnam Pro', 'Literata', 'Lora', 'Georgia', 'Times New Roman', 'Arial', 'system-ui'];
const alignments = [
  { value: 'LEFT', label: 'Căn trái', icon: 'format_align_left' },
  { value: 'CENTER', label: 'Căn giữa', icon: 'format_align_center' },
  { value: 'RIGHT', label: 'Căn phải', icon: 'format_align_right' },
  { value: 'JUSTIFY', label: 'Căn đều', icon: 'format_align_justify' }
] as const;

export function chapterDisplayTitle(chapter: ReaderChapter) {
  const title = chapter.title.replace(/^\s*(Chương|Chapter|Ch\.)\s*\d+\s*[:.\-–—]?\s*/i, '');
  return title ? `Chương ${chapter.chapterNumber}: ${title}` : `Chương ${chapter.chapterNumber}`;
}

export function ChapterReadingWorkspace({ chapter, novel, chapters, publicMode, tocPending, tocFailed, onRetryToc, onReport, reporting, children }: {
  chapter: ReaderChapter; novel?: ReaderNovel; chapters: ReaderChapter[]; publicMode: boolean;
  tocPending: boolean; tocFailed: boolean; onRetryToc: () => void; onReport?: () => void; reporting?: boolean;
  children?: ReactNode;
}) {
  const location = useLocation();
  const mobile = useMediaQuery('(max-width: 767px)', undefined, { getInitialValueInEffect: false });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [panel, setPanel] = useState<'settings' | 'toc' | 'bookmarks' | null>(null);
  const [selectedPassage, setSelectedPassage] = useState<{ index: number; offset: number; top: number; left: number; scrollY: number; keyboard: boolean; beside: boolean; line: ReadingLine } | null>(null);
  const [lineHighlight, setLineHighlight] = useState<{ key: number; rects: ReturnType<typeof readingLineRects> } | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const highlightKey = useRef(0);
  const [focusedParagraph, setFocusedParagraph] = useState(0);
  const bookmarkAction = useRef<HTMLButtonElement>(null);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  const article = useRef<HTMLElement>(null);
  const toc = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const jumpAfterClose = useRef(false);
  const restored = useRef<string | null>(null);
  const gesture = useRef({ x: 0, y: 0, time: 0, scroll: 0, selected: false, moved: false });
  const preference = useChapterReadingPreferences();
  const bookmarks = useReadingBookmarks(chapter.novelId);
  const { preferences } = preference;
  const base = publicMode ? '/public' : '/reader';
  const novelPath = `${base}/novels/${chapter.novelId}`;
  const index = chapters.findIndex(item => item.chapterId === chapter.chapterId);
  const previous = index > 0 ? chapters[index - 1] : undefined;
  const next = index >= 0 ? chapters[index + 1] : undefined;
  const toolsVisible = !mobile || toolsOpen;
  const selectedBookmark = bookmarks.items.find(item => item.chapterId === chapter.chapterId && item.paragraphIndex === selectedPassage?.index && (item.startOffset ?? 0) === selectedPassage?.line.startOffset);

  const paragraphs = () => Array.from(article.current?.querySelectorAll<HTMLElement>('.chapter-prose > p, .chapter-prose > blockquote, .chapter-prose > hr') ?? []);
  const flashLine = (range: Range) => {
    if (!article.current) return;
    clearTimeout(highlightTimer.current);
    setLineHighlight({ key: ++highlightKey.current, rects: readingLineRects(range, article.current) });
    highlightTimer.current = setTimeout(() => setLineHighlight(null), 3000);
  };
  useEffect(() => {
    const clear = () => { clearTimeout(highlightTimer.current); setLineHighlight(null); };
    window.addEventListener('resize', clear);
    return () => { clearTimeout(highlightTimer.current); window.removeEventListener('resize', clear); };
  }, []);
  useEffect(() => { clearTimeout(highlightTimer.current); setLineHighlight(null); }, [preferences.fontSize, preferences.fontFamily, preferences.lineHeight, preferences.margin, preferences.textAlign]);
  const restoreBookmark = () => {
    const params = new URLSearchParams(location.search);
    const requested = params.get('paragraph');
    const legacy = bookmarks.items.find(item => item.chapterId === chapter.chapterId);
    const paragraphIndex = requested !== null ? Number(requested) : legacy?.paragraphIndex;
    const pageOffset = requested !== null ? Number(params.get('offset') ?? 0) : legacy?.pageOffset ?? 0;
    if (paragraphIndex === undefined || !Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex > 1000000 || !Number.isFinite(pageOffset) || pageOffset < 0 || pageOffset > 1) return;
    const blocks = paragraphs();
    const targetIndex = Math.min(paragraphIndex, blocks.length - 1);
    const block = blocks[targetIndex];
    if (!block) return;
    const box = block.getBoundingClientRect();
    const start = Number(params.get('start') ?? 0), end = Number(params.get('end'));
    const range = params.has('end') && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= 10000000
      ? readingRange(block, start, end) : readingLineAt(block, box.top + box.height * pageOffset)?.range;
    const lineTop = range?.getBoundingClientRect().top ?? box.top + box.height * pageOffset;
    setFocusedParagraph(targetIndex);
    window.scrollTo({ top: Math.max(0, window.scrollY + lineTop - innerHeight * .25), behavior: 'instant' });
    block.dataset.bookmarkArrival = 'true';
    block.setAttribute('tabindex', '-1');
    block.focus({ preventScroll: true });
    if (range) flashLine(range);
  };
  useLayoutEffect(() => {
    setSelectedPassage(null);
    clearTimeout(highlightTimer.current); setLineHighlight(null);
    if (new URLSearchParams(location.search).get('bookmark') === '1') return;
    restored.current = location.key;
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [location.key, location.search]);
  useEffect(() => {
    if (restored.current === location.key || bookmarks.pending) return;
    if (new URLSearchParams(location.search).get('bookmark') === '1' && preference.status === 'saving') return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void document.fonts.ready.then(() => {
        if (cancelled) return;
        restored.current = location.key;
        restoreBookmark();
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [bookmarks.pending, preference.status, location.search, location.key]);
  useEffect(() => {
    if (panel !== 'toc') return;
    const frame = requestAnimationFrame(() => toc.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  useEffect(() => {
    if (!selectedPassage) return;
    const dismiss = () => setSelectedPassage(null);
    const followScroll = () => setSelectedPassage(current => {
      if (!current || current.scrollY === window.scrollY) return current;
      const top = current.top + current.scrollY - window.scrollY;
      return top < 8 || top > innerHeight - 88 ? null : { ...current, top, scrollY: window.scrollY };
    });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { dismiss(); paragraphs()[selectedPassage.index]?.focus({ preventScroll: true }); } };
    window.addEventListener('scroll', followScroll, { passive: true }); window.addEventListener('resize', dismiss); window.addEventListener('keydown', escape);
    if (selectedPassage.keyboard) bookmarkAction.current?.focus({ preventScroll: true });
    return () => { window.removeEventListener('scroll', followScroll); window.removeEventListener('resize', dismiss); window.removeEventListener('keydown', escape); };
  }, [selectedPassage]);
  const choosePassage = (block: HTMLElement, x?: number, y?: number) => {
    const index = paragraphs().indexOf(block);
    if (index < 0 || block.tagName === 'HR') return;
    const box = block.getBoundingClientRect();
    const line = readingLineAt(block, y ?? box.top);
    if (!line) return;
    const lineBox = line.range.getBoundingClientRect();
    const beside = !mobile && innerWidth - box.right > 240;
    const top = beside ? lineBox.top + lineBox.height / 2 : lineBox.bottom + 8;
    block.dataset.bookmarkArrival = 'true';
    setFocusedParagraph(index);
    setSelectedPassage({ index, offset: y === undefined ? 0 : Math.max(0, Math.min(1, (y - box.top) / Math.max(1, box.height))),
      top: Math.max(beside ? 30 : 8, Math.min(innerHeight - (beside ? 30 : 120), top)), left: Math.max(8, Math.min(innerWidth - 184, beside ? box.right + 12 : x ?? box.right - 176)), scrollY: window.scrollY, keyboard: x === undefined, beside, line });
    flashLine(line.range);
    if (mobile) setToolsOpen(true);
  };
  const savePassage = () => {
    if (!selectedPassage) return;
    if (selectedBookmark) { bookmarks.remove(selectedBookmark.bookmarkId); return; }
    bookmarks.save({ novelId: chapter.novelId, chapterId: chapter.chapterId, paragraphIndex: selectedPassage.index, pageOffset: selectedPassage.offset,
      startOffset: selectedPassage.line.startOffset, endOffset: selectedPassage.line.endOffset, excerpt: selectedPassage.line.excerpt, novelTitle: novel?.title ?? 'Truyện đã lưu bookmark',
      chapterTitle: chapter.title, chapterNumber: chapter.chapterNumber, coverImageUrl: novel?.coverImageUrl ?? null });
  };
  const startGesture = (event: PointerEvent) => {
    gesture.current = { x: event.clientX, y: event.clientY, time: performance.now(), scroll: window.scrollY,
      selected: Boolean(window.getSelection() && !window.getSelection()!.isCollapsed), moved: false };
  };
  const readingStyle = {
    '--reader-side-margin': `${preferences.margin ?? 24}px`,
    fontFamily: preferences.fontFamily ?? 'Be Vietnam Pro', fontSize: preferences.fontSize,
    lineHeight: preferences.lineHeight, textAlign: (preferences.textAlign ?? 'LEFT').toLowerCase()
  } as CSSProperties;
  const navigationLink = (target: ReaderChapter | undefined, label: string, icon: string) => target
    ? <Link className="sc-reader-tool" to={`${base}/chapters/${target.chapterId}`} title={`${label} · ${target.chapterNumber}`} aria-label={label}><Icon name={icon} /></Link>
    : <button type="button" className="sc-reader-tool" disabled aria-label={label} title={label}><Icon name={icon} /></button>;

  return <div className="sc-reader-workspace" data-reader-background={preferences.background}>
    <div className="sc-reader-page" onPointerDown={startGesture}
      onPointerMove={event => { if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 8) gesture.current.moved = true; }}
      onPointerCancel={() => { gesture.current.moved = true; }}
      onClick={event => {
        if (!mobile || (event.target as Element).closest('a, button, input, textarea, select, [role="button"]')) return;
        if (gesture.current.moved || gesture.current.selected || performance.now() - gesture.current.time > 500 || Math.abs(window.scrollY - gesture.current.scroll) > 8) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        setToolsOpen(value => !value);
      }}>
      <header className="sc-reader-chapter-heading">
        {novel?.title && <p className="sc-reader-novel-name">{novel.title}</p>}
        <h1 ref={heading} tabIndex={-1}>{chapterDisplayTitle(chapter)}</h1>
        <div className="sc-reader-chapter-meta">
          {chapter.wordCount != null && <span>{chapter.wordCount.toLocaleString('vi-VN')} từ</span>}
          {chapter.isVip && <span className="sc-reader-vip">VIP · {chapter.priceCoins} xu</span>}
          {onReport && <button type="button" onClick={onReport} disabled={reporting} aria-label="Báo cáo chương" title="Báo cáo chương"><Icon name="flag" /></button>}
        </div>
      </header>
      <ReadingProgress><article ref={article} className="sc-reader-manuscript" style={readingStyle} aria-label="Nội dung chương"
        onClick={event => {
          const target = (event.target as Element).closest<HTMLElement>('.chapter-prose > p, .chapter-prose > blockquote');
          if (!target || (event.target as Element).closest('a, button') || gesture.current.moved || gesture.current.selected || performance.now() - gesture.current.time > 500 || Math.abs(window.scrollY - gesture.current.scroll) > 8 || !window.getSelection()?.isCollapsed) return;
          event.stopPropagation(); choosePassage(target, event.clientX, event.clientY);
        }}
        onKeyDown={event => {
          const block = event.target as HTMLElement;
          const blocks = paragraphs();
          const index = blocks.indexOf(block);
          if (index < 0) return;
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choosePassage(block); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const readable = blocks.filter(item => item.tagName !== 'HR');
            const next = readable[Math.max(0, Math.min(readable.length - 1, readable.indexOf(block) + (event.key === 'ArrowDown' ? 1 : -1)))];
            setFocusedParagraph(blocks.indexOf(next)); next?.focus();
          }
        }}>
        <ManuscriptContent content={chapter.content ?? ''} blockProps={index => ({ tabIndex: index === focusedParagraph ? 0 : -1,
          onBlur: event => { delete event.currentTarget.dataset.bookmarkArrival; },
          'aria-describedby': 'reading-bookmark-help',
        })} />
        {lineHighlight && <div key={lineHighlight.key} className="sc-reading-line-flash" aria-hidden="true">
          {lineHighlight.rects.map((rect, index) => <span key={index} className="sc-reading-line-highlight" style={rect} />)}
        </div>}
      </article></ReadingProgress>
      <span id="reading-bookmark-help" className="sc-reader-bookmark-help">Bấm vào dòng cần lưu, hoặc nhấn Enter để bookmark dòng đầu. Dùng phím lên, xuống để chuyển đoạn.</span>
    </div>
    {selectedPassage && <button ref={bookmarkAction} type="button" className="sc-reading-bookmark-action" data-placement={selectedPassage.beside ? 'side' : 'below'} style={{ top: selectedPassage.top, left: selectedPassage.left }}
      disabled={bookmarks.pending || bookmarks.saving} onClick={savePassage} aria-pressed={Boolean(selectedBookmark)}
      aria-label={selectedBookmark ? 'Xóa bookmark' : 'Bookmark'} title={selectedBookmark ? 'Xóa bookmark' : 'Bookmark'}>
      <Icon name={selectedBookmark ? 'close' : 'bookmark_add'} />{bookmarks.saving ? 'Đang xử lý…' : !selectedBookmark && 'Bookmark'}
    </button>}
    <button type="button" className="sc-reader-tools-toggle" aria-expanded={toolsVisible} aria-controls="chapter-reader-tools" onClick={() => setToolsOpen(value => !value)}>{toolsOpen ? 'Ẩn công cụ đọc' : 'Hiện công cụ đọc'}</button>
    <aside id="chapter-reader-tools" className="sc-reader-tool-rail" aria-label="Công cụ đọc chương" data-open={toolsOpen} aria-hidden={!toolsVisible} inert={!toolsVisible}>
      {navigationLink(previous, 'Chương trước', 'skip_previous')}
      <Link to={novelPath} className="sc-reader-tool" aria-label="Về trang truyện" title="Về trang truyện"><Icon name="home" /></Link>
      <button type="button" className="sc-reader-tool" aria-label="Tùy chỉnh đọc" title="Tùy chỉnh đọc" aria-haspopup="dialog" onClick={() => { setSelectedPassage(null); setPanel('settings'); }}><Icon name="text_fields" /></button>
      <button type="button" className="sc-reader-tool" aria-label="Mục lục" title="Mục lục" aria-haspopup="dialog" onClick={() => { setSelectedPassage(null); setPanel('toc'); }}><Icon name="format_list_bulleted" /></button>
      <button type="button" className="sc-reader-tool" aria-label="Bookmark" title="Bookmark" aria-haspopup="dialog" onClick={() => { setSelectedPassage(null); setPanel('bookmarks'); }}><Icon name="bookmarks" /></button>
      {navigationLink(next, 'Chương sau', 'skip_next')}
    </aside>
    <footer className="sc-reader-end-navigation" aria-label="Điều hướng cuối chương">
      {previous && <Link to={`${base}/chapters/${previous.chapterId}`} className="sc-button"><Icon name="chevron_left" />Chương trước</Link>}
      {next && <Link to={`${base}/chapters/${next.chapterId}`} className="sc-button sc-button-primary">Chương sau<Icon name="chevron_right" /></Link>}
    </footer>
    {children}
    <AnimatedModal opened={panel !== null} onClose={() => setPanel(null)} side="right" title={panel === 'toc' ? 'Mục lục chương' : panel === 'bookmarks' ? 'Bookmark' : 'Tùy chỉnh đọc'} className="sc-reader-tool-panel"
      onCloseAutoFocus={event => {
        if (!jumpAfterClose.current) return;
        event.preventDefault(); jumpAfterClose.current = false; restoreBookmark();
      }}>
      {panel === 'settings' && <>
        <fieldset className="sc-reader-setting-field"><legend>Màu nền</legend><div className="sc-reader-background-options" role="group" aria-label="Màu nền trang đọc">
          {readerBackgrounds.map(background => <button key={background.value} type="button" data-reader-background={background.value} aria-label={background.label} title={background.label} aria-pressed={preferences.background === background.value} onClick={() => preference.update({ background: background.value })}><span className="sc-reader-swatch" />{preferences.background === background.value && <Icon name="check" />}</button>)}
        </div></fieldset>
        <Select label="Phông chữ" value={preferences.fontFamily} allowDeselect={false} data={[...new Set([...fonts, preferences.fontFamily || 'Be Vietnam Pro'])]} onChange={value => preference.update({ fontFamily: value ?? 'Be Vietnam Pro' })} comboboxProps={{ withinPortal: false }} />
        <ReadingNumber label="Cỡ chữ" value={preferences.fontSize} min={10} max={40} step={1} onChange={value => preference.update({ fontSize: value })} />
        <ReadingNumber label="Lề hai bên" value={preferences.margin ?? 24} min={0} max={80} step={4} onChange={value => preference.update({ margin: value })} />
        <ReadingNumber label="Giãn dòng" value={preferences.lineHeight} min={1} max={3} step={.1} onChange={value => preference.update({ lineHeight: value })} />
        <fieldset className="sc-reader-setting-field"><legend>Kiểu căn chỉnh</legend><div className="sc-reader-alignment-options" role="group" aria-label="Kiểu căn chỉnh">
          {alignments.map(alignment => <button key={alignment.value} type="button" title={alignment.label} aria-label={alignment.label} aria-pressed={preferences.textAlign === alignment.value} onClick={() => preference.update({ textAlign: alignment.value as ReadingPreferences['textAlign'] })}><Icon name={alignment.icon} /></button>)}
        </div></fieldset>
        <div className="sc-reader-preference-status" role="status">{preference.status === 'saving' ? 'Đang lưu tùy chỉnh…' : preference.status === 'error' ? <>Chưa đồng bộ tùy chỉnh. <button type="button" onClick={preference.retry}>Thử lại</button></> : preference.status === 'local' ? 'Đã lưu trên thiết bị.' : 'Đã lưu tùy chỉnh.'}</div>
      </>}
      {panel === 'toc' && <>
        {novel && <div className="sc-reader-toc-book">
          {novel.coverImageUrl && failedCoverUrl !== novel.coverImageUrl && <img src={novel.coverImageUrl} alt="" onError={() => setFailedCoverUrl(novel.coverImageUrl ?? undefined)} />}
          <div><h2>{novel.title}</h2>{novel.authorName && <p>{novel.authorName}</p>}<span>{chapters.length} chương</span></div>
        </div>}
        {tocPending && <p role="status">Đang tải mục lục…</p>}
        {tocFailed && <div role="alert"><p>Không tải được mục lục.</p><button type="button" className="sc-button" onClick={onRetryToc}>Thử lại</button></div>}
        <nav ref={toc} className="sc-chapter-toc sc-reader-toc-list" aria-label="Mục lục chương">{chapters.map(item => <Link key={item.chapterId} to={`${base}/chapters/${item.chapterId}`} aria-current={item.chapterId === chapter.chapterId ? 'page' : undefined} onClick={() => setPanel(null)}><span>{chapterDisplayTitle(item)}</span>{item.isVip && <small>VIP · {item.priceCoins} xu</small>}</Link>)}</nav>
      </>}
      {panel === 'bookmarks' && <>
        <Link className="sc-button" to={`${base}/bookmarks?novelId=${encodeURIComponent(chapter.novelId)}`} onClick={() => setPanel(null)}>Mở trang Bookmark</Link>
        <ReadingBookmarksList novelId={chapter.novelId} base={base} onOpen={() => { jumpAfterClose.current = true; setPanel(null); }} />
      </>}
    </AnimatedModal>
  </div>;
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function ReadingNumber({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<number | string>(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return <NumberInput label={label} value={draft} min={min} max={max} step={step} decimalScale={step < 1 ? 1 : 0}
    onFocus={() => { focused.current = true; }} onBlur={() => {
      focused.current = false;
      const numeric = draft === '' ? value : Number(draft);
      const next = Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : value;
      setDraft(next); onChange(next);
    }} onChange={next => { setDraft(next); if (typeof next === 'number' && next >= min && next <= max) onChange(next); }} />;
}
