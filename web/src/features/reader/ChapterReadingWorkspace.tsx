import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NumberInput, Select } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { ReadingProgress } from '../../shared/components/ReadingProgress';
import { readerBackgrounds, useChapterReadingPreferences } from './useChapterReadingPreferences';
import { useReadingBookmark } from './useReadingBookmark';
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
  const [panel, setPanel] = useState<'settings' | 'toc' | null>(null);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  const article = useRef<HTMLElement>(null);
  const toc = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const jumpAfterClose = useRef(false);
  const restored = useRef<string | null>(null);
  const gesture = useRef({ x: 0, y: 0, time: 0, scroll: 0, selected: false, moved: false });
  const preference = useChapterReadingPreferences();
  const bookmark = useReadingBookmark(chapter.novelId);
  const { preferences } = preference;
  const base = publicMode ? '/public' : '/reader';
  const novelPath = `${base}/novels/${chapter.novelId}`;
  const index = chapters.findIndex(item => item.chapterId === chapter.chapterId);
  const previous = index > 0 ? chapters[index - 1] : undefined;
  const next = index >= 0 ? chapters[index + 1] : undefined;
  const toolsVisible = !mobile || toolsOpen;
  const saved = bookmark.bookmark?.chapterId === chapter.chapterId;
  const bookmarkedChapter = chapters.find(item => item.chapterId === bookmark.bookmark?.chapterId);

  const paragraphs = () => Array.from(article.current?.querySelectorAll<HTMLElement>('.chapter-prose > p, .chapter-prose > blockquote, .chapter-prose > hr') ?? []);
  const restoreBookmark = () => {
    const mark = bookmark.bookmark;
    if (!mark || mark.chapterId !== chapter.chapterId) return;
    const blocks = paragraphs();
    const block = blocks[Math.min(mark.paragraphIndex, blocks.length - 1)];
    if (!block) return;
    const box = block.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top + box.height * mark.pageOffset - innerHeight * .25), behavior: 'instant' });
    block.setAttribute('tabindex', '-1');
    block.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (new URLSearchParams(location.search).get('bookmark') === '1') return;
    restored.current = location.key;
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [location.key, location.search]);
  useEffect(() => {
    if (restored.current === location.key || bookmark.pending) return;
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
  }, [bookmark.pending, preference.status, location.search, location.key]);
  useEffect(() => {
    if (panel !== 'toc') return;
    const frame = requestAnimationFrame(() => toc.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  const toggleBookmark = () => {
    if (bookmark.failed) { bookmark.retry(); return; }
    if (saved) { bookmark.update(null); return; }
    const blocks = paragraphs();
    const visibleIndex = blocks.findIndex(block => block.getBoundingClientRect().bottom > innerHeight * .25);
    const paragraphIndex = visibleIndex < 0 ? Math.max(0, blocks.length - 1) : visibleIndex;
    const box = blocks[paragraphIndex]?.getBoundingClientRect();
    const pageOffset = box ? Math.max(0, Math.min(1, (innerHeight * .25 - box.top) / Math.max(1, box.height))) : 0;
    bookmark.update({ novelId: chapter.novelId, chapterId: chapter.chapterId, paragraphIndex, pageOffset, updatedAt: new Date().toISOString() });
  };
  const startGesture = (event: PointerEvent) => {
    gesture.current = { x: event.clientX, y: event.clientY, time: performance.now(), scroll: window.scrollY,
      selected: Boolean(window.getSelection() && !window.getSelection()!.isCollapsed), moved: false };
  };
  const bookmarkLabel = bookmark.failed ? 'Tải lại dấu trang' : saved ? 'Bỏ dấu trang' : 'Đánh dấu vị trí đọc';
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
      <ReadingProgress><article ref={article} className="sc-reader-manuscript" style={readingStyle} aria-label="Nội dung chương">
        <ManuscriptContent content={chapter.content ?? ''} />
      </article></ReadingProgress>
    </div>
    <button type="button" className="sc-reader-tools-toggle" aria-expanded={toolsVisible} aria-controls="chapter-reader-tools" onClick={() => setToolsOpen(value => !value)}>{toolsOpen ? 'Ẩn công cụ đọc' : 'Hiện công cụ đọc'}</button>
    <aside id="chapter-reader-tools" className="sc-reader-tool-rail" aria-label="Công cụ đọc chương" data-open={toolsOpen} aria-hidden={!toolsVisible} inert={!toolsVisible}>
      {navigationLink(previous, 'Chương trước', 'skip_previous')}
      <Link to={novelPath} className="sc-reader-tool" aria-label="Về trang truyện" title="Về trang truyện"><Icon name="home" /></Link>
      <button type="button" className="sc-reader-tool" aria-label="Tùy chỉnh đọc" title="Tùy chỉnh đọc" aria-haspopup="dialog" onClick={() => setPanel('settings')}><Icon name="text_fields" /></button>
      <button type="button" className="sc-reader-tool" aria-label="Mục lục" title="Mục lục" aria-haspopup="dialog" onClick={() => setPanel('toc')}><Icon name="format_list_bulleted" /></button>
      <button type="button" className="sc-reader-tool" aria-label={bookmarkLabel} title={bookmarkLabel} aria-pressed={saved} disabled={bookmark.pending} onClick={toggleBookmark}><Icon name={saved ? 'bookmark' : 'bookmark_border'} /></button>
      {navigationLink(next, 'Chương sau', 'skip_next')}
    </aside>
    <footer className="sc-reader-end-navigation" aria-label="Điều hướng cuối chương">
      {previous && <Link to={`${base}/chapters/${previous.chapterId}`} className="sc-button"><Icon name="chevron_left" />Chương trước</Link>}
      {next && <Link to={`${base}/chapters/${next.chapterId}`} className="sc-button sc-button-primary">Chương sau<Icon name="chevron_right" /></Link>}
    </footer>
    {children}
    <AnimatedModal opened={panel !== null} onClose={() => setPanel(null)} side="right" title={panel === 'toc' ? 'Mục lục chương' : 'Tùy chỉnh đọc'} className="sc-reader-tool-panel"
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
        {bookmarkedChapter && <div className="sc-reader-toc-bookmark"><Icon name="bookmark" />{bookmarkedChapter.chapterId === chapter.chapterId
          ? <button type="button" onClick={() => { jumpAfterClose.current = true; setPanel(null); }}>Tới dấu trang · Chương {bookmarkedChapter.chapterNumber}</button>
          : <Link to={`${base}/chapters/${bookmarkedChapter.chapterId}?bookmark=1`} onClick={() => setPanel(null)}>Tới dấu trang · Chương {bookmarkedChapter.chapterNumber}</Link>}</div>}
        {tocPending && <p role="status">Đang tải mục lục…</p>}
        {tocFailed && <div role="alert"><p>Không tải được mục lục.</p><button type="button" className="sc-button" onClick={onRetryToc}>Thử lại</button></div>}
        <nav ref={toc} className="sc-chapter-toc sc-reader-toc-list" aria-label="Mục lục chương">{chapters.map(item => <Link key={item.chapterId} to={`${base}/chapters/${item.chapterId}`} aria-current={item.chapterId === chapter.chapterId ? 'page' : undefined} onClick={() => setPanel(null)}><span>{chapterDisplayTitle(item)}</span>{item.isVip && <small>VIP · {item.priceCoins} xu</small>}</Link>)}</nav>
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
