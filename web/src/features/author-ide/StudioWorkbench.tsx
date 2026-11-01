import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedMenu as Menu } from '../../shared/components/AnimatedMenu';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { AnimatedTooltip } from '../../shared/components/AnimatedTooltip';
import { AnimatedNumber } from '../../shared/components/AuthorAdminMotion';
import { CopyTextButton, FeedbackIcon } from '../../shared/components/ActionFeedback';
import { WritingGoalFeedback } from './StudioReviewTools';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { downloadStudioFile, findText, plainStudioText, isStudioEditorTarget, manuscriptScenes, replaceMatches, revealStudioSelection, studioStatistics } from './studio-tools';
import { PassageNotes } from './PassageNotes';
import { StudioBookmarks } from './StudioBookmarks';
import { StudioProofreader } from './StudioProofreader';
import { rememberAnnotationEdits } from './studio-annotations';
import { transformStudioRange } from './studio-formatting';
import './studio-workbench.css';

type Props = {
  scope: string; title: string; content: string; editor: RefObject<HTMLTextAreaElement | null>; disabled: boolean;
  apply: (value: string, start: number, end: number) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; save: () => Promise<void>;
  onError: (message: string) => void; exportOpen: boolean; onExportClose: () => void;
  chapterSettings?: ReactNode; fileActions?: ReactNode;
  formatToolbarVisible: boolean;
  onLookup?: (query: string) => void;
  onSearchNovel?: () => void;
  notesOpen: boolean; onNotesOpenChange: (open: boolean) => void;
};
export function StudioWorkbench({ scope, title, content, editor, disabled, apply, undo, redo, canUndo, canRedo, save, onError, exportOpen, onExportClose, chapterSettings, fileActions, formatToolbarVisible, onLookup, onSearchNovel, notesOpen, onNotesOpenChange }: Props) {
  const [panel, setPanel] = useState<'search' | 'replace' | 'scenes' | null>(null);
  const [preview, setPreview] = useState(false), [statistics, setStatistics] = useState(false), [help, setHelp] = useState(false);
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false), [wholeWord, setWholeWord] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1), [announcement, setAnnouncement] = useState(''), [saving, setSaving] = useState(false);
  const [exportType, setExportType] = useState<'txt' | 'md' | 'html' | 'pdf'>('txt');
  const [selected, setSelected] = useState('');
  const [activeScene, setActiveScene] = useState(0), [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [noteRequest, setNoteRequest] = useState(0);
  const [bookmarkRequest, setBookmarkRequest] = useState(0), [proofreading, setProofreading] = useState(false);
  const [noteTab, setNoteTab] = useState<'passages' | 'private' | 'bookmarks'>('passages');
  const [notesHost, setNotesHost] = useState<HTMLElement | null>(null);
  const editorIntent = useRef(false);
  const preserveNextMenu = (event: Event) => {
    if (document.querySelector('[role="menu"][data-state="open"]') || document.activeElement?.getAttribute('aria-expanded') === 'true') event.preventDefault();
  };
  const closeEditingMenu = (event: Event, trigger: string) => {
    preserveNextMenu(event); if (event.defaultPrevented) { editorIntent.current = false; return; }
    if (!editorIntent.current) return; editorIntent.current = false; event.preventDefault();
    const el = editor.current, active = document.activeElement;
    // An exit animation may finish after the author has already opened another menu.
    if (active && active !== document.body && !isStudioEditorTarget(active, el) && active.textContent !== trigger && !(event.target instanceof HTMLElement && event.target.contains(active))) return;
    if (el) revealStudioSelection(el, el.selectionStart, el.selectionEnd);
  };
  const [width, setWidth] = useWorkspacePreference<'narrow' | 'standard' | 'wide'>('studio-writing-width', 'standard', (v): v is 'narrow' | 'standard' | 'wide' => ['narrow','standard','wide'].includes(v as string));
  const [goal, setGoal] = useWorkspacePreference<number>(`studio-word-goal:${scope}`, 1500, (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 100 && v <= 100000);
  const [goalDraft, setGoalDraft] = useState(String(goal));
  const noteKey = `storycraft-studio-note:${scope}`;
  const noteUnavailable = useRef(false);
  const [note, setNote] = useState(() => { try { const value = localStorage.getItem(noteKey); return value?.slice(0, 20000) ?? ''; } catch { noteUnavailable.current = true; return ''; } });
  const [noteError, setNoteError] = useState(noteUnavailable.current ? 'Không đọc được ghi chú trên máy. Hãy kiểm tra quyền lưu trữ của trình duyệt.' : '');
  const [online, setOnline] = useState(navigator.onLine);
  const reduce = useReducedMotion(); const panelRef = useRef<HTMLElement>(null);
  const found = useMemo(() => findText(content, query, caseSensitive, wholeWord), [content, query, caseSensitive, wholeWord]);
  const stats = useMemo(() => studioStatistics(content), [content]);
  const scenes = useMemo(() => manuscriptScenes(content), [content]);
  useEffect(() => {
    const update = () => { const start = editor.current?.selectionStart ?? 0; const index = scenes.findIndex(scene => start >= scene.start && start <= scene.end); setActiveScene(Math.max(0, index)); };
    document.addEventListener('selectionchange', update); document.addEventListener('select', update, true); update();
    return () => { document.removeEventListener('selectionchange', update); document.removeEventListener('select', update, true); };
  }, [editor, scenes]);
  const rememberSelection = () => { const el = editor.current; if (el) setSelected(el.value.slice(el.selectionStart, el.selectionEnd)); };
  const select = (start: number, end: number) => { if (editor.current) revealStudioSelection(editor.current, start, end); };
  const noteFlash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(noteFlash.current); (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete('sc-note-target'); }, []);
  const jumpToNote = (start: number, end: number) => {
    select(start, end);
    const range = window.getSelection();
    const Highlight = (window as unknown as { Highlight?: new (range: Range) => unknown }).Highlight;
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (Highlight && highlights && editor.current?.hidden && range?.rangeCount) {
      clearTimeout(noteFlash.current); highlights.set('sc-note-target', new Highlight(range.getRangeAt(0).cloneRange()));
      noteFlash.current = setTimeout(() => highlights.delete('sc-note-target'), 1400);
    }
  };
  const closeTools = () => { setPanel(null); onNotesOpenChange(false); const el = editor.current; if (el) revealStudioSelection(el, el.selectionStart, el.selectionEnd, false); };
  const nextMatch = (direction = 1) => {
    if (!found.matches.length) return;
    const next = matchIndex < 0 ? (direction > 0 ? 0 : found.matches.length - 1) : (matchIndex + direction + found.matches.length) % found.matches.length;
    setMatchIndex(next); const match = found.matches[next]; select(match.start, match.end);
    panelRef.current?.querySelector<HTMLInputElement>('[aria-label="Tìm trong bản thảo"]')?.focus({ preventScroll: true });
    setAnnouncement(`Kết quả ${next + 1}/${found.matches.length}`);
  };
  const replaceOne = () => {
    if (disabled || !found.matches.length) return;
    const index = matchIndex < 0 ? 0 : Math.min(matchIndex, found.matches.length - 1), match = found.matches[index];
    apply(content.slice(0, match.start) + replacement + content.slice(match.end), match.start, match.start + replacement.length);
    setMatchIndex(-1); setAnnouncement('Đã thay thế một kết quả. Có thể hoàn tác.');
  };
  const insert = (text: string) => { const el = editor.current; if (!el || disabled) return; editorIntent.current = true; const start = el.selectionStart, end = el.selectionEnd; apply(content.slice(0, start) + text + content.slice(end), start + text.length, start + text.length); };
  const quoteSelection = () => { const el = editor.current; if (!el || disabled) return; editorIntent.current = true; const start = el.selectionStart, end = el.selectionEnd; const selected = content.slice(start, end); apply(content.slice(0, start) + '“' + selected + '”' + content.slice(end), start + 1, selected ? end + 1 : start + 1); };
  const transform = (operation: 'clear' | 'upper' | 'lower', fromMenu = true) => {
    const el = editor.current; if (!el || disabled) return;
    if (el.selectionStart === el.selectionEnd) { onError('Chọn đoạn cần chỉnh sửa trước.'); return; }
    const result = transformStudioRange(content, el.selectionStart, el.selectionEnd, operation);
    editorIntent.current = fromMenu;
    apply(result.text, result.start, result.end);
  };
  const saveNow = async () => { if (saving || disabled) return; setSaving(true); try { await save(); setAnnouncement('Đã lưu bản nháp lên máy chủ.'); } catch (error) { onError(error instanceof Error ? error.message : 'Không lưu được bản nháp.'); } finally { setSaving(false); } };
  const exportHtml = async () => { const { renderToStaticMarkup } = await import('react-dom/server'); return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{max-width:760px;margin:40px auto;padding:0 24px;font:17px/1.8 system-ui;color:#252b2a;background:white}h1{font-size:26px}blockquote{color:#555}@page{margin:20mm}@media print{body{margin:0;padding:0}}</style></head><body>' + renderToStaticMarkup(<article><h1>{title}</h1><ManuscriptContent content={content} /></article>) + '</body></html>'; };
  const print = async () => {
    const html = await exportHtml();
    const frame = document.createElement('iframe'); frame.title = 'Bản in chương'; frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.onload = () => { frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
    frame.srcdoc = html; document.body.append(frame); setTimeout(() => frame.remove(), 60000);
  };
  const exportFile = async (type: typeof exportType, close = false) => {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true);
    try {
      if (type === 'pdf') await print();
      else if (type === 'html') downloadStudioFile(title, await exportHtml(), 'html', 'text/html');
      else downloadStudioFile(title, title + '\n\n' + (type === 'txt' ? plainStudioText(content) : content), type, type === 'txt' ? 'text/plain' : 'text/markdown');
      setAnnouncement(type === 'pdf' ? 'Đã mở bản in. Chọn máy in hoặc Lưu PDF trong hộp thoại trình duyệt.' : `Đã tạo tệp ${type.toUpperCase()}.`);
      if (close) onExportClose();
    } catch { onError('Không xuất được bản thảo. Hãy thử lại.'); }
    finally { exportLock.current = false; setExporting(false); }
  };
  const setNoteValue = (value: string) => { setNote(value); try { localStorage.setItem(noteKey, value); setNoteError(''); } catch { setNoteError('Không lưu được ghi chú trên máy. Hãy tải ghi chú về trước khi rời trang.'); } };
  const openNotes = () => { setPanel(null); onNotesOpenChange(true); };
  const addNote = () => { openNotes(); setNoteTab('passages'); setNoteRequest(value => value + 1); };
  const addBookmark = () => { openNotes(); setNoteTab('bookmarks'); setBookmarkRequest(value => value + 1); };
  useEffect(() => { const el = editor.current; el?.addEventListener('studio-add-bookmark', addBookmark); return () => el?.removeEventListener('studio-add-bookmark', addBookmark); }, [editor]);
  useEffect(() => { setNotesHost(editor.current?.closest<HTMLElement>('.sc-studio-editor-region') ?? null); const el = editor.current; el?.addEventListener('studio-add-note', addNote); return () => el?.removeEventListener('studio-add-note', addNote); }, [editor]);
  useLayoutEffect(() => {
    if (!notesHost) return;
    const toolbar = notesHost.querySelector<HTMLElement>('.sc-format-toolbar');
    const preferredWidth = { narrow: 640, standard: 760, wide: 1040 }[width];
    notesHost.style.setProperty('--sc-studio-reading-width', `${preferredWidth}px`);
    const measure = () => {
      const workspace = notesHost.querySelector<HTMLElement>('.sc-editor-workspace');
      const page = notesHost.querySelector<HTMLElement>('.sc-manuscript-page');
      const scrollbar = workspace ? workspace.offsetWidth - workspace.clientWidth : 0;
      const required = preferredWidth + 32 + 336 + scrollbar;
      notesHost.style.setProperty('--sc-studio-page-padding', `${notesHost.clientWidth >= required ? 64 : Math.min(64, Math.max(20, (workspace?.clientWidth ?? 0) * .05))}px`);
      notesHost.style.setProperty('--sc-studio-scrollbar-width', `${scrollbar}px`);
      // Dock in the natural right margin, without reserving a column or resizing prose.
      const spare = workspace && page ? workspace.getBoundingClientRect().right - scrollbar - page.getBoundingClientRect().right : 0;
      notesHost.dataset.notesLayout = spare >= 336 + 16 ? 'dock' : 'drawer';
      const height = `${toolbar ? toolbar.getBoundingClientRect().height + parseFloat(getComputedStyle(toolbar).marginBottom || '0') : 0}px`;
      notesHost.style.setProperty('--sc-studio-format-height', height);
      const body = notesHost.closest<HTMLElement>('.sc-studio-body');
      if (body) { body.dataset.panelLayout = notesHost.dataset.notesLayout; body.style.setProperty('--sc-studio-format-height', height); body.style.setProperty('--sc-studio-scrollbar-width', `${scrollbar}px`); }
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(notesHost); if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [notesHost, formatToolbarVisible, width]);
  useLayoutEffect(() => { if (notesHost) notesHost.dataset.notesOpen = String(notesOpen); }, [notesHost, notesOpen]);
  useEffect(() => { const root = editor.current?.closest<HTMLElement>('.sc-writing-studio'); if (root) root.dataset.writingWidth = width; return () => { if (root) delete root.dataset.writingWidth; }; }, [width, editor]);
  useEffect(() => { setMatchIndex(-1); }, [query, caseSensitive, wholeWord]);
  useEffect(() => { if (panel) panelRef.current?.querySelector<HTMLElement>((panel === 'search' || panel === 'replace') ? '[aria-label="Tìm trong bản thảo"]' : '.sc-studio-scene-list button')?.focus({ preventScroll: true }); }, [panel]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      const inEditor = isStudioEditorTarget(event.target, editor.current);
      if (mod && key === 's') { event.preventDefault(); void saveNow(); }
      else if (mod && !event.shiftKey && key === 'f' && (inEditor || panel === 'search' || panel === 'replace' || !(event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable]')))) { event.preventDefault(); rememberSelection(); if (inEditor && editor.current && editor.current.selectionEnd > editor.current.selectionStart) setQuery(editor.current.value.slice(editor.current.selectionStart, editor.current.selectionEnd)); setPanel('search'); panelRef.current?.querySelector<HTMLInputElement>('[aria-label="Tìm trong bản thảo"]')?.focus(); }
      else if (mod && key === 'h' && (inEditor || panel === 'search' || panel === 'replace')) { event.preventDefault(); setPanel('replace'); }
      else if (mod && event.altKey && key === 'm' && inEditor && !disabled) { event.preventDefault(); rememberSelection(); addNote(); }
      else if (!disabled && mod && event.shiftKey && key === 'f' && onSearchNovel) { event.preventDefault(); onSearchNovel(); }
      else if (inEditor && !disabled && mod && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (inEditor && !disabled && mod && key === 'y') { event.preventDefault(); redo(); }
      else if (inEditor && !disabled && mod && key === '\\') { event.preventDefault(); transform('clear', false); }
      else if (inEditor && mod && event.shiftKey && key === 'c') { event.preventDefault(); rememberSelection(); setStatistics(true); }
      else if (event.key === 'Escape' && (panel || notesOpen)) { closeTools(); }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  return <div className="sc-studio-workbench">
    <div className="sc-studio-command-row"><div className="sc-studio-workbench-bar" role="toolbar" aria-label="Công cụ bản thảo">
      <Menu position="bottom-start" onCloseAutoFocus={preserveNextMenu}><Menu.Target><button type="button">Tệp</button></Menu.Target><Menu.Dropdown>
        <Menu.Item disabled={disabled || saving} onClick={() => void saveNow()}>Lưu ngay · Ctrl/Cmd + S</Menu.Item>
        {fileActions}<Menu.Divider />
        <Menu.Item disabled={exporting} onClick={() => void exportFile('txt')}>Tải văn bản TXT</Menu.Item>
        <Menu.Item disabled={exporting} onClick={() => void exportFile('md')}>Tải Markdown</Menu.Item>
        <Menu.Item disabled={exporting} onClick={() => void exportFile('html')}>Tải bản định dạng HTML</Menu.Item>
        <Menu.Item disabled={exporting} onClick={() => void exportFile('pdf')}>In / Lưu PDF qua trình duyệt</Menu.Item>
      </Menu.Dropdown></Menu>
      <Menu position="bottom-start" onCloseAutoFocus={event => closeEditingMenu(event, 'Chèn')}><Menu.Target><button type="button">Chèn</button></Menu.Target><Menu.Dropdown>
        <Menu.Item disabled={disabled} onClick={() => insert('\n\n---\n\n')}>Ngắt cảnh</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('— ')}>Gạch lời thoại</Menu.Item>
        <Menu.Item disabled={disabled} onClick={quoteSelection}>Ngoặc thoại</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('…')}>Dấu chấm lửng</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('\n\n> Trích dẫn\n\n')}>Khối trích dẫn</Menu.Item>
      </Menu.Dropdown></Menu>
      <AnimatedTooltip label="Hoàn tác nội dung · Ctrl/Cmd + Z"><button type="button" aria-label="Hoàn tác nội dung" disabled={disabled || !canUndo} onClick={undo}>↶</button></AnimatedTooltip>
      <AnimatedTooltip label="Làm lại · Ctrl/Cmd + Shift + Z"><button type="button" aria-label="Làm lại nội dung" disabled={disabled || !canRedo} onClick={redo}>↷</button></AnimatedTooltip>
      <Menu position="bottom-start" onCloseAutoFocus={event => closeEditingMenu(event, 'Chỉnh sửa')}><Menu.Target><button type="button">Chỉnh sửa</button></Menu.Target><Menu.Dropdown>
        <Menu.Item disabled={disabled || !canUndo} onClick={() => { editorIntent.current = true; undo(); }}>Hoàn tác · Ctrl+Z</Menu.Item>
        <Menu.Item disabled={disabled || !canRedo} onClick={() => { editorIntent.current = true; redo(); }}>Làm lại · Ctrl+Shift+Z</Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={() => { rememberSelection(); setPanel('search'); }}>Tìm kiếm</Menu.Item>
        {onSearchNovel && <Menu.Item disabled={disabled} onClick={onSearchNovel}>Tìm xuyên chương · Ctrl+Shift+F</Menu.Item>}
        <Menu.Item onClick={() => setPanel('replace')}>Thay thế</Menu.Item>
        <Menu.Item onClick={() => { editorIntent.current = true; select(0, content.length); }}>Chọn tất cả bản thảo</Menu.Item>
        <Menu.Divider />
        <Menu.Item disabled={disabled} onClick={() => transform('clear')}>Xóa định dạng vùng chọn · Ctrl+\</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => transform('upper')}>Đổi vùng chọn thành CHỮ HOA</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => transform('lower')}>Đổi vùng chọn thành chữ thường</Menu.Item>
      </Menu.Dropdown></Menu>
      <Menu position="bottom-start" onCloseAutoFocus={preserveNextMenu}><Menu.Target><button type="button">Xem</button></Menu.Target><Menu.Dropdown>
        <Menu.Item onClick={() => setPanel('scenes')}>Cảnh ({scenes.length})</Menu.Item>
        <Menu.Item onClick={() => setPreview(true)}>Xem bản định dạng</Menu.Item>
        {onLookup && <Menu.Item onClick={() => onLookup(plainStudioText(editor.current?.value.slice(editor.current.selectionStart, editor.current.selectionEnd) ?? ''))}>Tra cứu cẩm nang</Menu.Item>}
        <Menu.Item onClick={() => { rememberSelection(); setStatistics(true); }}>Thống kê &amp; mục tiêu</Menu.Item>
        <Menu.Item onClick={() => setHelp(true)}>Phím tắt Studio</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => { openNotes(); setNoteTab('bookmarks'); }}>Đánh dấu đoạn văn</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => setProofreading(true)}>Kiểm tra dấu câu &amp; khoảng trắng</Menu.Item>
        <Menu.Divider /><Menu.Label>Chiều rộng vùng viết</Menu.Label>
        {(['narrow','standard','wide'] as const).map(option => <Menu.Item key={option} onClick={() => setWidth(option)} leftSection={width === option ? '✓' : ' '}>{option === 'narrow' ? 'Hẹp · dòng ngắn' : option === 'standard' ? 'Vừa · mặc định' : 'Rộng · tận dụng màn hình'}</Menu.Item>)}
      </Menu.Dropdown></Menu>
      <button type="button" aria-expanded={notesOpen} aria-controls="studio-notes-sidebar" onMouseDown={event => event.preventDefault()} onClick={() => notesOpen ? closeTools() : openNotes()}>Ghi chú</button>
      {!online && <span role="status" className="sc-studio-offline">Ngoại tuyến · kiểm tra trạng thái lưu trước khi rời trang</span>}
    </div>{chapterSettings}</div>
    <motion.section hidden={!panel} ref={panelRef} className="sc-studio-tool-panel" aria-label={panel === 'search' ? 'Tìm kiếm bản thảo' : panel === 'replace' ? 'Thay thế bản thảo' : 'Điều hướng cảnh'} initial={false} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: reduce ? 0 : 0.16 }}>
      <button type="button" className="sc-studio-panel-close" aria-label="Đóng công cụ" onClick={closeTools}>×</button>
      {(panel === 'search' || panel === 'replace') && <><div className="sc-studio-tool-row"><label>Tìm<input aria-label="Tìm trong bản thảo" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextMatch(e.shiftKey ? -1 : 1); } }} /></label>{panel === 'replace' && <label>Thay bằng<input aria-label="Thay bằng" value={replacement} onChange={e => setReplacement(e.target.value)} /></label>}
        <button type="button" disabled={!found.matches.length} onClick={() => nextMatch(-1)}>Trước</button><button type="button" disabled={!found.matches.length} onClick={() => nextMatch(1)}>Tiếp</button>
        {panel === 'replace' && <><button type="button" disabled={disabled || !found.matches.length} onClick={replaceOne}>Thay một</button><button type="button" disabled={disabled || !found.matches.length || found.truncated} onClick={() => { apply(replaceMatches(content, found.matches, replacement), 0, 0); setMatchIndex(-1); setAnnouncement(`Đã thay ${found.matches.length} kết quả. Có thể hoàn tác.`); }}>Thay tất cả ({found.matches.length})</button></>}</div>
        <div className="sc-studio-tool-row"><label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} /> Phân biệt hoa/thường</label><label><input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} /> Nguyên từ</label><span>{found.truncated ? 'Hơn 10.000 kết quả. Thu hẹp tìm kiếm để thay tất cả.' : `${found.matches.length} kết quả`}</span></div></>}
      {panel === 'scenes' && <><p className="text-meta">Các cảnh được ngăn bằng dấu ngắt cảnh. Bấm để đến vị trí trong bản thảo.</p><div className="sc-studio-scene-list">{scenes.map((scene, index) => <button key={scene.start} type="button" aria-current={activeScene === index ? 'true' : undefined} onClick={() => { setActiveScene(index); select(scene.start, scene.start); }}>{index + 1}. {scene.label}</button>)}</div></>}
    </motion.section>
    {notesHost && createPortal(<aside id="studio-notes-sidebar" data-open={notesOpen} inert={!notesOpen} aria-hidden={!notesOpen} className="sc-studio-notes-sidebar" aria-label="Ghi chú chương">
      <header><h2>Ghi chú</h2><button type="button" aria-label="Đóng công cụ" onClick={closeTools}>×</button></header>
      <div role="tablist" aria-label="Loại ghi chú" className="sc-studio-note-tabs">{(['passages','private','bookmarks'] as const).map((tab, index, tabs) => <button key={tab} id={`studio-note-tab-${tab}`} type="button" role="tab" aria-selected={noteTab === tab} aria-controls={`studio-note-panel-${tab}`} tabIndex={noteTab === tab ? 0 : -1} onClick={() => setNoteTab(tab)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; setNoteTab(next); document.getElementById(`studio-note-tab-${next}`)?.focus(); } }}>{tab === 'passages' ? 'Theo đoạn' : tab === 'private' ? 'Sổ tay chương' : 'Đánh dấu'}</button>)}</div>
      <div className="sc-studio-notes-scroll">
        <div role="tabpanel" id="studio-note-panel-passages" aria-labelledby="studio-note-tab-passages" hidden={noteTab !== 'passages'}><PassageNotes editor={editor} request={noteRequest} scope={scope} content={content} ready={!disabled} getSelection={() => ({ start: editor.current?.selectionStart ?? 0, end: editor.current?.selectionEnd ?? 0 })} onJump={jumpToNote} /></div>
        <div role="tabpanel" id="studio-note-panel-bookmarks" aria-labelledby="studio-note-tab-bookmarks" hidden={noteTab !== 'bookmarks'}><StudioBookmarks scope={scope} content={content} ready={!disabled} editor={editor} request={bookmarkRequest} onJump={jumpToNote} /></div>
        <div role="tabpanel" id="studio-note-panel-private" aria-labelledby="studio-note-tab-private" hidden={noteTab !== 'private'}><label className="text-meta" htmlFor="studio-private-note">Ý tưởng và việc cần sửa cho chương này</label><textarea id="studio-private-note" aria-label="Ghi chú riêng" value={note} maxLength={20000} onChange={e => setNoteValue(e.target.value)} /><div className="sc-studio-tool-row"><button type="button" onClick={() => downloadStudioFile(title + '-ghi-chu', note, 'txt', 'text/plain')}>Tải ghi chú</button><span>{note.length.toLocaleString('vi-VN')}/20.000 ký tự</span></div>{noteError && <p role="alert">{noteError}</p>}</div>
      </div><footer>Lưu trên trình duyệt này · chỉ dành cho bạn, không xuất bản cùng chương.</footer>
    </aside>, notesHost)}
    <span className="sc-motion-sr-only" role="status">{announcement}</span>
    {proofreading && <StudioProofreader content={content} disabled={disabled} onClose={() => setProofreading(false)} onApply={(before, after, issues) => {
      const el = editor.current; if (!el || disabled || el.value !== before) throw new Error('Bản thảo đã thay đổi. Hãy kiểm tra lại.');
      const edits = [...issues].sort((a,b) => a.start - b.start); rememberAnnotationEdits(el, before, after, edits);
      const start = edits[0]?.start ?? 0; apply(after, start, start);
    }} />}
    <AnimatedModal opened={exportOpen} onClose={onExportClose} title="Xuất bản thảo" centered>
      <label className="sc-studio-goal">Định dạng xuất<select aria-label="Định dạng xuất" value={exportType} onChange={event => setExportType(event.target.value as typeof exportType)}><option value="txt">TXT · văn bản</option><option value="md">Markdown · ký hiệu định dạng</option><option value="html">HTML · giữ định dạng</option><option value="pdf">PDF · qua hộp thoại in</option></select></label>
      <p className="text-meta">Xuất nội dung đang viết. Ghi chú riêng không đi vào bản xuất.</p>
      <button type="button" className="sc-button sc-button-primary" disabled={exporting} aria-busy={exporting} onClick={() => void exportFile(exportType, true)}><FeedbackIcon icon={exporting ? 'sync' : 'download'} busy={exporting} />{exporting ? 'Đang tạo tệp…' : 'Xuất tệp'}</button>
    </AnimatedModal>
    <AnimatedModal opened={preview} onClose={() => setPreview(false)} title="Xem bản định dạng" size="xl" centered><p className="text-meta">Xem nội dung đang viết, kể cả thay đổi chưa đồng bộ. Định dạng hiển thị theo các ký hiệu đang hỗ trợ.</p><CopyTextButton value={plainStudioText(content)} label="Sao chép văn bản" /><article className="sc-studio-reading-preview"><h1>{title}</h1><ManuscriptContent content={content} /></article></AnimatedModal>
    <AnimatedModal opened={statistics} onClose={() => setStatistics(false)} title="Thống kê & mục tiêu chương" centered><dl className="sc-studio-statistics"><dt>Số từ</dt><dd><AnimatedNumber value={stats.words} /></dd><dt>Ký tự / không khoảng trắng</dt><dd><AnimatedNumber value={stats.characters} /> / <AnimatedNumber value={stats.withoutSpaces} /></dd><dt>Đoạn văn</dt><dd><AnimatedNumber value={stats.paragraphs} /></dd><dt>Thời gian đọc ước tính</dt><dd>{Math.max(1, Math.ceil(stats.words / 350))} phút</dd>{selected && <><dt>Vùng đang chọn</dt><dd>{studioStatistics(selected).words} từ · {Array.from(selected).length} ký tự</dd></>}</dl><label className="sc-studio-goal">Mục tiêu số từ<input type="number" aria-label="Mục tiêu số từ" min={100} max={100000} step={100} value={goalDraft} onChange={e => { setGoalDraft(e.target.value); const next = Number(e.target.value); if (next >= 100 && next <= 100000 && Number.isInteger(next)) setGoal(next); }} onBlur={() => setGoalDraft(String(goal))} /></label><WritingGoalFeedback words={stats.words} goal={goal} /></AnimatedModal>
    <AnimatedModal opened={help} onClose={() => setHelp(false)} title="Phím tắt Studio" centered><dl><dt>Alt + Shift + T</dt><dd>Focus thanh công cụ vùng chọn (khi đang hiện)</dd><dt>Ctrl/Cmd + S</dt><dd>Lưu ngay</dd><dt>Ctrl/Cmd + F</dt><dd>Tìm trong bản thảo</dd><dt>Ctrl/Cmd + Shift + F</dt><dd>Tìm xuyên chương trong tác phẩm</dd><dt>Ctrl/Cmd + H</dt><dd>Thay thế trong bản thảo</dd><dt>Ctrl/Cmd + Alt + M</dt><dd>Ghi chú vùng chọn hoặc dòng hiện tại</dd><dt>Ctrl/Cmd + \</dt><dd>Xóa định dạng vùng chọn</dd><dt>Ctrl/Cmd + Shift + C</dt><dd>Thống kê vùng chọn và mục tiêu</dd><dt>Ctrl/Cmd + Z</dt><dd>Hoàn tác nội dung</dd><dt>Ctrl/Cmd + Shift + Z hoặc Ctrl + Y</dt><dd>Làm lại nội dung</dd><dt>Enter / Shift + Enter trong ô tìm</dt><dd>Kết quả tiếp / trước</dd><dt>Esc</dt><dd>Đóng công cụ hoặc hộp thoại</dd></dl><p className="text-meta">Hoàn tác/làm lại chỉ áp dụng trong nội dung chương hiện tại. Ghi chú và ô nhập khác giữ phím tắt riêng của trình duyệt.</p></AnimatedModal>
  </div>;
}
