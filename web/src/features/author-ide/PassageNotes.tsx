import { useEffect, useRef, useState } from 'react';
import { locateAnchor, moveAnchor, passageAnchor, validPassageNotes, type PassageNote, type TextAnchor } from './studio-annotations';
import { downloadStudioFile, plainStudioText } from './studio-tools';

export function PassageNotes({ scope, content, ready, getSelection, onJump, request = 0 }: { scope: string; content: string; ready: boolean; getSelection: () => { start: number; end: number }; onJump: (start: number, end: number) => void; request?: number }) {
  const key = `storycraft-passage-notes:${scope}`;
  const [notes, setNotes] = useState<PassageNote[]>(() => { try { const stored = JSON.parse(localStorage.getItem(key) ?? '[]'); return validPassageNotes(stored) ? stored : []; } catch { return []; } });
  const latest = useRef(notes); latest.current = notes;
  const previous = useRef<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState(''), [body, setBody] = useState(''), [anchor, setAnchor] = useState<TextAnchor | null>(null);
  const [filter, setFilter] = useState('open'), [query, setQuery] = useState('');
  const visible = notes.filter(note => (filter === 'all' || filter === 'resolved' && note.resolved || filter === 'open' && !note.resolved || filter === 'detached' && note.detached) && `${plainStudioText(note.quote)} ${note.body}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const save = (next: PassageNote[]) => { latest.current = next; setNotes(next); try { localStorage.setItem(key, JSON.stringify(next)); setError(''); } catch { setError('Không lưu được ghi chú trên máy. Hãy sao chép ghi chú trước khi rời trang.'); } };
  useEffect(() => {
    if (!ready) return;
    const old = previous.current; previous.current = content;
    const next = latest.current.map(note => ({ ...note, ...(old === null ? locateAnchor(note, content) : moveAnchor(note, old, content)) }));
    if (JSON.stringify(next) !== JSON.stringify(latest.current)) save(next);
  }, [content, ready]);
  const choose = () => { const selection = getSelection(); const chosen = passageAnchor(content, selection.start, selection.end); if (!chosen) { setError('Chọn một dòng hoặc đoạn có nội dung, tối đa 10.000 ký tự.'); return; } setFilter('open'); setQuery(''); setAnchor(chosen); setBody(''); setError(''); };
  useEffect(() => { if (request > 0 && ready) choose(); }, [request]);
  useEffect(() => { if (anchor) composer.current?.focus(); }, [anchor]);
  return <section className="sc-passage-notes" aria-label="Ghi chú theo đoạn"><div className="sc-studio-tool-row"><button type="button" disabled={!ready} onClick={choose}>Ghi chú vùng chọn / dòng hiện tại</button>{notes.length > 0 && <button type="button" onClick={() => downloadStudioFile('ghi-chu-theo-doan', notes.map((note, index) => `${index + 1}. ${note.resolved ? 'Đã xử lý' : 'Đang mở'}${note.detached ? ' · Đoạn gốc đã thay đổi' : ''}\n${plainStudioText(note.quote)}\n\n${note.body}`).join('\n\n---\n\n'), 'txt', 'text/plain')}>Tải ghi chú theo đoạn</button>}</div>
    <div className="sc-note-filters"><input type="search" aria-label="Tìm ghi chú" placeholder="Tìm ghi chú…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Trạng thái ghi chú" value={filter} onChange={event => setFilter(event.target.value)}><option value="open">Đang mở ({notes.filter(note => !note.resolved).length})</option><option value="resolved">Đã xử lý</option><option value="all">Tất cả ({notes.length})</option><option value="detached">Đoạn đã thay đổi</option></select></div>
    {!anchor && visible.length === 0 && <p className="sc-note-empty">{notes.length ? 'Không có ghi chú phù hợp.' : 'Chọn một đoạn trong bản thảo để lưu ý tưởng hoặc đánh dấu chỗ cần sửa.'}</p>}
    {anchor && <div className="sc-passage-note"><blockquote>{plainStudioText(anchor.quote)}</blockquote><textarea ref={composer} aria-label="Nội dung ghi chú đoạn" value={body} maxLength={4000} onChange={event => setBody(event.target.value)} /><div className="sc-studio-tool-row"><button type="button" disabled={!body.trim() || notes.length >= 100} onClick={() => { const located = locateAnchor(anchor, content); save([...latest.current, { ...located, id: crypto.randomUUID(), body: body.trim(), resolved: false }]); setAnchor(null); setBody(''); }}>Lưu ghi chú đoạn</button><button type="button" onClick={() => setAnchor(null)}>Hủy ghi chú</button></div></div>}
    {notes.length >= 100 && <p className="text-meta">Tối đa 100 ghi chú mỗi chương.</p>}
    {visible.map(note => <article key={note.id} className="sc-passage-note" data-detached={note.detached || undefined}><blockquote>{plainStudioText(note.quote)}</blockquote>
      <textarea aria-label="Sửa ghi chú đoạn" value={note.body} maxLength={4000} onChange={event => save(latest.current.map(item => item.id === note.id ? { ...item, body: event.target.value } : item))} />
      <div className="sc-studio-tool-row"><span className="text-meta">{note.detached ? 'Đoạn gốc đã bị thay hoặc xóa; ghi chú được giữ lại.' : note.resolved ? 'Đã xử lý' : 'Đang mở'}</span><button type="button" disabled={note.detached} onClick={() => onJump(note.start, note.end)}>Tới đoạn</button><button type="button" disabled={!ready} onClick={() => { const chosen = getSelection(); const next = passageAnchor(content, chosen.start, chosen.end); if (next) save(latest.current.map(item => item.id === note.id ? { ...item, ...next, detached: false } : item)); else setError('Chọn một dòng hoặc đoạn có nội dung để gắn lại.'); }}>Gắn lại vùng chọn</button><button type="button" onClick={() => save(latest.current.map(item => item.id === note.id ? { ...item, resolved: !item.resolved } : item))}>{note.resolved ? 'Mở lại' : 'Đánh dấu đã xử lý'}</button><button type="button" onClick={() => save(latest.current.filter(item => item.id !== note.id))}>Xóa ghi chú</button></div>
    </article>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
