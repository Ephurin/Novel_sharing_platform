import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { AnimatedMenu as Menu } from '../../shared/components/AnimatedMenu';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { AnimatedTooltip } from '../../shared/components/AnimatedTooltip';
import { AnimatedProgress } from '../../shared/components/AnimatedProgress';
import { ManuscriptContent } from '../../shared/components/ManuscriptContent';
import { useWorkspacePreference } from '../../shared/components/WorkspacePreferences';
import { downloadStudioFile, findText, plainStudioText, focusStudioEditor, isStudioEditorTarget, manuscriptScenes, replaceMatches, revealStudioSelection, studioStatistics } from './studio-tools';
import { PassageNotes } from './PassageNotes';
import './studio-workbench.css';

type Props = {
  scope: string; title: string; content: string; editor: RefObject<HTMLTextAreaElement | null>; disabled: boolean;
  apply: (value: string, start: number, end: number) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; save: () => Promise<void>;
  onError: (message: string) => void; exportOpen: boolean; onExportClose: () => void;
  chapterSettings?: ReactNode; fileActions?: ReactNode;
};
export function StudioWorkbench({ scope, title, content, editor, disabled, apply, undo, redo, canUndo, canRedo, save, onError, exportOpen, onExportClose, chapterSettings, fileActions }: Props) {
  const [panel, setPanel] = useState<'search' | 'replace' | 'scenes' | 'notes' | null>(null);
  const [preview, setPreview] = useState(false), [statistics, setStatistics] = useState(false), [help, setHelp] = useState(false);
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false), [wholeWord, setWholeWord] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1), [announcement, setAnnouncement] = useState(''), [saving, setSaving] = useState(false);
  const [exportType, setExportType] = useState<'txt' | 'md' | 'html' | 'pdf'>('txt');
  const [selected, setSelected] = useState('');
  const [noteRequest, setNoteRequest] = useState(0);
  const [noteTab, setNoteTab] = useState<'passages' | 'private'>('passages');
  const [notesHost, setNotesHost] = useState<HTMLElement | null>(null);
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
  const rememberSelection = () => { const el = editor.current; if (el) setSelected(el.value.slice(el.selectionStart, el.selectionEnd)); };
  const select = (start: number, end: number) => { if (editor.current) revealStudioSelection(editor.current, start, end); };
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
  const insert = (text: string) => { const el = editor.current; if (!el || disabled) return; const start = el.selectionStart, end = el.selectionEnd; apply(content.slice(0, start) + text + content.slice(end), start + text.length, start + text.length); };
  const saveNow = async () => { if (saving || disabled) return; setSaving(true); try { await save(); setAnnouncement('Đã lưu bản nháp lên máy chủ.'); } catch (error) { onError(error instanceof Error ? error.message : 'Không lưu được bản nháp.'); } finally { setSaving(false); } };
  const exportHtml = async () => { const { renderToStaticMarkup } = await import('react-dom/server'); return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{max-width:760px;margin:40px auto;padding:0 24px;font:17px/1.8 system-ui;color:#252b2a;background:white}h1{font-size:26px}blockquote{color:#555}@page{margin:20mm}@media print{body{margin:0;padding:0}}</style></head><body>' + renderToStaticMarkup(<article><h1>{title}</h1><ManuscriptContent content={content} /></article>) + '</body></html>'; };
  const print = async () => {
    const html = await exportHtml();
    const frame = document.createElement('iframe'); frame.title = 'Bản in chương'; frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0';
    frame.onload = () => { frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
    frame.srcdoc = html; document.body.append(frame); setTimeout(() => frame.remove(), 60000);
  };
  const setNoteValue = (value: string) => { setNote(value); try { localStorage.setItem(noteKey, value); setNoteError(''); } catch { setNoteError('Không lưu được ghi chú trên máy. Hãy tải ghi chú về trước khi rời trang.'); } };
  const addNote = () => { setPanel('notes'); setNoteTab('passages'); setNoteRequest(value => value + 1); };
  useEffect(() => { setNotesHost(editor.current?.closest('.sc-writing-studio')?.querySelector<HTMLElement>('.sc-studio-body') ?? null); const el = editor.current; el?.addEventListener('studio-add-note', addNote); return () => el?.removeEventListener('studio-add-note', addNote); }, [editor]);
  useEffect(() => { setMatchIndex(-1); }, [query, caseSensitive, wholeWord]);
  useEffect(() => { if (panel && panel !== 'notes') panelRef.current?.querySelector<HTMLElement>((panel === 'search' || panel === 'replace') ? '[aria-label="Tìm trong bản thảo"]' : '.sc-studio-scene-list button')?.focus({ preventScroll: true }); }, [panel]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      const inEditor = isStudioEditorTarget(event.target, editor.current);
      if (mod && key === 's') { event.preventDefault(); void saveNow(); }
      else if (mod && key === 'f' && (inEditor || panel === 'search' || panel === 'replace' || !(event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable]')))) { event.preventDefault(); rememberSelection(); if (inEditor && editor.current && editor.current.selectionEnd > editor.current.selectionStart) setQuery(editor.current.value.slice(editor.current.selectionStart, editor.current.selectionEnd)); setPanel('search'); panelRef.current?.querySelector<HTMLInputElement>('[aria-label="Tìm trong bản thảo"]')?.focus(); }
      else if (mod && key === 'h' && (inEditor || panel === 'search' || panel === 'replace')) { event.preventDefault(); setPanel('replace'); }
      else if (mod && event.altKey && key === 'm' && inEditor && !disabled) { event.preventDefault(); rememberSelection(); addNote(); }
      else if (inEditor && !disabled && mod && key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (inEditor && !disabled && mod && key === 'y') { event.preventDefault(); redo(); }
      else if (event.key === 'Escape' && panel) { setPanel(null); focusStudioEditor(editor.current); }
    };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  return <div className="sc-studio-workbench">
    <div className="sc-studio-command-row"><div className="sc-studio-workbench-bar" role="toolbar" aria-label="Công cụ bản thảo">
      <Menu position="bottom-start"><Menu.Target><button type="button">Tệp</button></Menu.Target><Menu.Dropdown>
        <Menu.Item disabled={disabled || saving} onClick={() => void saveNow()}>Lưu ngay · Ctrl/Cmd + S</Menu.Item>
        {fileActions}<Menu.Divider />
        <Menu.Item onClick={() => downloadStudioFile(title, title + '\n\n' + plainStudioText(content), 'txt', 'text/plain')}>Tải văn bản TXT</Menu.Item>
        <Menu.Item onClick={() => downloadStudioFile(title, title + '\n\n' + content, 'md', 'text/markdown')}>Tải Markdown</Menu.Item>
        <Menu.Item onClick={() => void exportHtml().then(html => downloadStudioFile(title, html, 'html', 'text/html')).catch(error => onError(String(error)))}>Tải bản định dạng HTML</Menu.Item>
        <Menu.Item onClick={() => void print().catch(error => onError(String(error)))}>In / Lưu PDF qua trình duyệt</Menu.Item>
      </Menu.Dropdown></Menu>
      <Menu position="bottom-start"><Menu.Target><button type="button">Chèn</button></Menu.Target><Menu.Dropdown>
        <Menu.Item disabled={disabled} onClick={() => insert('\n\n---\n\n')}>Ngắt cảnh</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('— ')}>Gạch lời thoại</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('“”')}>Ngoặc thoại</Menu.Item>
        <Menu.Item disabled={disabled} onClick={() => insert('\n\n> Trích dẫn\n\n')}>Khối trích dẫn</Menu.Item>
      </Menu.Dropdown></Menu>
      <AnimatedTooltip label="Hoàn tác nội dung · Ctrl/Cmd + Z"><button type="button" aria-label="Hoàn tác nội dung" disabled={disabled || !canUndo} onClick={undo}>↶</button></AnimatedTooltip>
      <AnimatedTooltip label="Làm lại · Ctrl/Cmd + Shift + Z"><button type="button" aria-label="Làm lại nội dung" disabled={disabled || !canRedo} onClick={redo}>↷</button></AnimatedTooltip>
      <Menu position="bottom-start"><Menu.Target><button type="button">Chỉnh sửa</button></Menu.Target><Menu.Dropdown>
        <Menu.Item onClick={() => { rememberSelection(); setPanel('search'); }}>Tìm kiếm</Menu.Item>
        <Menu.Item onClick={() => setPanel('replace')}>Thay thế</Menu.Item>
      </Menu.Dropdown></Menu>
      <Menu position="bottom-start"><Menu.Target><button type="button">Xem</button></Menu.Target><Menu.Dropdown>
        <Menu.Item onClick={() => setPanel('scenes')}>Cảnh ({scenes.length})</Menu.Item>
        <Menu.Item onClick={() => setPreview(true)}>Xem bản định dạng</Menu.Item>
        <Menu.Item onClick={() => { rememberSelection(); setStatistics(true); }}>Thống kê &amp; mục tiêu</Menu.Item>
        <Menu.Item onClick={() => setHelp(true)}>Phím tắt Studio</Menu.Item>
      </Menu.Dropdown></Menu>
      <button type="button" aria-expanded={panel === 'notes'} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>Ghi chú</button>
      {!online && <span role="status" className="sc-studio-offline">Ngoại tuyến · kiểm tra trạng thái lưu trước khi rời trang</span>}
    </div>{chapterSettings}</div>
    <motion.section hidden={!panel || panel === 'notes'} ref={panelRef} className="sc-studio-tool-panel" aria-label={panel === 'search' ? 'Tìm kiếm bản thảo' : panel === 'replace' ? 'Thay thế bản thảo' : 'Điều hướng cảnh'} initial={false} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: reduce ? 0 : 0.16 }}>
      <button type="button" className="sc-studio-panel-close" aria-label="Đóng công cụ" onClick={() => { setPanel(null); focusStudioEditor(editor.current); }}>×</button>
      {(panel === 'search' || panel === 'replace') && <><div className="sc-studio-tool-row"><label>Tìm<input aria-label="Tìm trong bản thảo" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextMatch(e.shiftKey ? -1 : 1); } }} /></label>{panel === 'replace' && <label>Thay bằng<input aria-label="Thay bằng" value={replacement} onChange={e => setReplacement(e.target.value)} /></label>}
        <button type="button" disabled={!found.matches.length} onClick={() => nextMatch(-1)}>Trước</button><button type="button" disabled={!found.matches.length} onClick={() => nextMatch(1)}>Tiếp</button>
        {panel === 'replace' && <><button type="button" disabled={disabled || !found.matches.length} onClick={replaceOne}>Thay một</button><button type="button" disabled={disabled || !found.matches.length || found.truncated} onClick={() => { apply(replaceMatches(content, found.matches, replacement), 0, 0); setMatchIndex(-1); setAnnouncement(`Đã thay ${found.matches.length} kết quả. Có thể hoàn tác.`); }}>Thay tất cả ({found.matches.length})</button></>}</div>
        <div className="sc-studio-tool-row"><label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} /> Phân biệt hoa/thường</label><label><input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} /> Nguyên từ</label><span>{found.truncated ? 'Hơn 10.000 kết quả. Thu hẹp tìm kiếm để thay tất cả.' : `${found.matches.length} kết quả`}</span></div></>}
      {panel === 'scenes' && <><p className="text-meta">Các cảnh được ngăn bằng dấu ngắt cảnh. Bấm để đến vị trí trong bản thảo.</p><div className="sc-studio-scene-list">{scenes.map((scene, index) => <button key={scene.start} type="button" onClick={() => select(scene.start, scene.start)}>{index + 1}. {scene.label}</button>)}</div></>}
    </motion.section>
    {notesHost && createPortal(<aside hidden={panel !== 'notes'} className="sc-studio-notes-sidebar" aria-label="Ghi chú chương">
      <header><h2>Ghi chú</h2><button type="button" aria-label="Đóng công cụ" onClick={() => { setPanel(null); focusStudioEditor(editor.current); }}>×</button></header>
      <div role="tablist" aria-label="Loại ghi chú" className="sc-studio-note-tabs">{(['passages','private'] as const).map((tab, index, tabs) => <button key={tab} id={`studio-note-tab-${tab}`} type="button" role="tab" aria-selected={noteTab === tab} aria-controls={`studio-note-panel-${tab}`} tabIndex={noteTab === tab ? 0 : -1} onClick={() => setNoteTab(tab)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs[1-index]; setNoteTab(next); document.getElementById(`studio-note-tab-${next}`)?.focus(); } }}>{tab === 'passages' ? 'Theo đoạn' : 'Sổ tay chương'}</button>)}</div>
      <div className="sc-studio-notes-scroll">
        <div role="tabpanel" id="studio-note-panel-passages" aria-labelledby="studio-note-tab-passages" hidden={noteTab !== 'passages'}><PassageNotes request={noteRequest} scope={scope} content={content} ready={!disabled} getSelection={() => ({ start: editor.current?.selectionStart ?? 0, end: editor.current?.selectionEnd ?? 0 })} onJump={select} /></div>
        <div role="tabpanel" id="studio-note-panel-private" aria-labelledby="studio-note-tab-private" hidden={noteTab !== 'private'}><label className="text-meta" htmlFor="studio-private-note">Ý tưởng và việc cần sửa cho chương này</label><textarea id="studio-private-note" aria-label="Ghi chú riêng" value={note} maxLength={20000} onChange={e => setNoteValue(e.target.value)} /><div className="sc-studio-tool-row"><button type="button" onClick={() => downloadStudioFile(title + '-ghi-chu', note, 'txt', 'text/plain')}>Tải ghi chú</button><span>{note.length.toLocaleString('vi-VN')}/20.000 ký tự</span></div>{noteError && <p role="alert">{noteError}</p>}</div>
      </div><footer>Lưu trên trình duyệt này · chỉ dành cho bạn, không xuất bản cùng chương.</footer>
    </aside>, notesHost)}
    <span className="sc-motion-sr-only" role="status">{announcement}</span>
    <AnimatedModal opened={exportOpen} onClose={onExportClose} title="Xuất bản thảo" centered>
      <label className="sc-studio-goal">Định dạng xuất<select aria-label="Định dạng xuất" value={exportType} onChange={event => setExportType(event.target.value as typeof exportType)}><option value="txt">TXT · văn bản</option><option value="md">Markdown · ký hiệu định dạng</option><option value="html">HTML · giữ định dạng</option><option value="pdf">PDF · qua hộp thoại in</option></select></label>
      <p className="text-meta">Xuất nội dung đang viết. Ghi chú riêng không đi vào bản xuất.</p>
      <button type="button" className="sc-button sc-button-primary" onClick={async () => { try { if (exportType === 'pdf') await print(); else if (exportType === 'html') downloadStudioFile(title, await exportHtml(), 'html', 'text/html'); else downloadStudioFile(title, title + '\n\n' + (exportType === 'txt' ? plainStudioText(content) : content), exportType, exportType === 'txt' ? 'text/plain' : 'text/markdown'); onExportClose(); } catch { onError('Không xuất được bản thảo. Hãy thử lại.'); } }}>Xuất tệp</button>
    </AnimatedModal>
    <AnimatedModal opened={preview} onClose={() => setPreview(false)} title="Xem bản định dạng" size="xl" centered><p className="text-meta">Xem nội dung đang viết, kể cả thay đổi chưa đồng bộ. Định dạng hiển thị theo các ký hiệu đang hỗ trợ.</p><article className="sc-studio-reading-preview"><h1>{title}</h1><ManuscriptContent content={content} /></article></AnimatedModal>
    <AnimatedModal opened={statistics} onClose={() => setStatistics(false)} title="Thống kê & mục tiêu chương" centered><dl className="sc-studio-statistics"><dt>Số từ</dt><dd>{stats.words.toLocaleString('vi-VN')}</dd><dt>Ký tự / không khoảng trắng</dt><dd>{stats.characters.toLocaleString('vi-VN')} / {stats.withoutSpaces.toLocaleString('vi-VN')}</dd><dt>Đoạn văn</dt><dd>{stats.paragraphs}</dd><dt>Thời gian đọc ước tính</dt><dd>{Math.max(1, Math.ceil(stats.words / 350))} phút</dd>{selected && <><dt>Vùng đang chọn</dt><dd>{studioStatistics(selected).words} từ · {Array.from(selected).length} ký tự</dd></>}</dl><label className="sc-studio-goal">Mục tiêu số từ<input type="number" aria-label="Mục tiêu số từ" min={100} max={100000} step={100} value={goalDraft} onChange={e => { setGoalDraft(e.target.value); const next = Number(e.target.value); if (next >= 100 && next <= 100000 && Number.isInteger(next)) setGoal(next); }} onBlur={() => setGoalDraft(String(goal))} /></label><AnimatedProgress value={Math.min(100, stats.words / goal * 100)} label={`${stats.words}/${goal} từ`} /></AnimatedModal>
    <AnimatedModal opened={help} onClose={() => setHelp(false)} title="Phím tắt Studio" centered><dl><dt>Ctrl/Cmd + S</dt><dd>Lưu ngay</dd><dt>Ctrl/Cmd + F</dt><dd>Tìm trong bản thảo</dd><dt>Ctrl/Cmd + Z</dt><dd>Hoàn tác nội dung</dd><dt>Ctrl/Cmd + Shift + Z hoặc Ctrl + Y</dt><dd>Làm lại nội dung</dd><dt>Enter / Shift + Enter trong ô tìm</dt><dd>Kết quả tiếp / trước</dd><dt>Esc</dt><dd>Đóng công cụ hoặc hộp thoại</dd></dl><p className="text-meta">Hoàn tác/làm lại chỉ áp dụng trong nội dung chương hiện tại. Ghi chú và ô nhập khác giữ phím tắt riêng của trình duyệt.</p></AnimatedModal>
  </div>;
}
