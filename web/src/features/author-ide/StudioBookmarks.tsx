import { useEffect, useRef, useState, type RefObject } from 'react';
import { followStudioAnchor, locateAnchor, passageAnchor, validBookmarks, type StudioBookmark, type TextAnchor } from './studio-annotations';
import { plainStudioText } from './studio-tools';
import { FeedbackReveal } from '../../shared/components/ActionFeedback';

export function StudioBookmarks({ scope, content, ready, editor, request, onJump }: {
  scope: string; content: string; ready: boolean; editor: RefObject<HTMLTextAreaElement | null>; request: number; onJump: (start: number, end: number) => void;
}) {
  const key = `storycraft-studio-bookmarks:${scope}`;
  const [items, setItems] = useState<StudioBookmark[]>(() => { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return validBookmarks(value) ? value : []; } catch { return []; } });
  const latest = useRef(items); latest.current = items;
  const previous = useRef<string | null>(null), input = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<TextAnchor | null>(null), [name, setName] = useState(''), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const save = (next: StudioBookmark[]) => { latest.current = next; setItems(next); try { localStorage.setItem(key, JSON.stringify(next)); setError(''); } catch { setError('Không lưu được đánh dấu trên trình duyệt. Hãy giữ lại nội dung cần nhớ trước khi rời trang.'); } };
  useEffect(() => {
    if (!ready) return;
    const old = previous.current; previous.current = content;
    const next = latest.current.map(item => ({ ...item, ...(old === null ? locateAnchor(item, content) : followStudioAnchor(item, old, content, editor.current)) }));
    if (JSON.stringify(next) !== JSON.stringify(latest.current)) save(next);
  }, [content, ready]);
  const choose = () => {
    const el = editor.current; if (!el || !ready) return;
    const selected = passageAnchor(content, el.selectionStart, el.selectionEnd);
    if (!selected) { setError('Chọn một đoạn hoặc đặt con trỏ trên dòng có nội dung, tối đa 10.000 ký tự.'); return; }
    setAnchor(selected); setName(plainStudioText(selected.quote).trim().slice(0, 80)); setError(''); setQuery('');
  };
  useEffect(() => { if (request > 0 && ready) choose(); }, [request]);
  useEffect(() => { if (anchor) input.current?.focus({ preventScroll: true }); }, [anchor]);
  const visible = items.filter(item => `${item.name} ${plainStudioText(item.quote)}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  return <section aria-label="Đánh dấu đoạn văn" className="sc-studio-bookmarks">
    <p className="text-meta">Lưu chỗ cần quay lại mà không tạo ghi chú. Đánh dấu lưu riêng trên trình duyệt này.</p>
    <button type="button" disabled={!ready || items.length >= 100} onClick={choose}>Đánh dấu vùng chọn / dòng hiện tại</button>
    <input type="search" aria-label="Tìm đánh dấu" placeholder="Tìm đánh dấu…" value={query} onChange={event => setQuery(event.target.value)} />
    {anchor && <form className="sc-studio-bookmark" onSubmit={event => { event.preventDefault(); if (!name.trim() || latest.current.length >= 100) return; save([...latest.current, { ...locateAnchor(anchor, content), id: crypto.randomUUID(), name: name.trim() }]); setAnchor(null); setMessage('Đã lưu đánh dấu.'); }}>
      <blockquote>{plainStudioText(anchor.quote)}</blockquote><label>Tên đánh dấu<input ref={input} aria-label="Tên đánh dấu" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="sc-studio-tool-row"><button type="submit" disabled={!name.trim() || items.length >= 100}>Lưu đánh dấu</button><button type="button" onClick={() => setAnchor(null)}>Hủy đánh dấu</button></div>
    </form>}
    {!visible.length && !anchor && <p className="sc-note-empty">{items.length ? 'Không có đánh dấu phù hợp.' : 'Chưa có đánh dấu trong chương này.'}</p>}
    {visible.map(item => <FeedbackReveal key={item.id} className="sc-studio-bookmark">
      <input aria-label="Đổi tên đánh dấu" defaultValue={item.name} maxLength={80} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={event => { const name = event.currentTarget.value.trim() || item.name; event.currentTarget.value = name; if (name !== item.name) save(latest.current.map(value => value.id === item.id ? { ...value, name } : value)); }} />
      <blockquote>{plainStudioText(item.quote)}</blockquote>
      {item.detached && <p className="text-meta">Đoạn gốc đã thay đổi hoặc bị xóa. Chọn lại đoạn để gắn lại đánh dấu.</p>}
      <div className="sc-studio-tool-row"><button type="button" disabled={item.detached || !ready} onClick={() => onJump(item.start, item.end)}>Tới đánh dấu</button><button type="button" disabled={!ready} onClick={() => { const el = editor.current; if (!el) return; const chosen = passageAnchor(content, el.selectionStart, el.selectionEnd); if (chosen) save(latest.current.map(value => value.id === item.id ? { ...value, ...chosen, detached: false } : value)); else setError('Chọn lại một dòng hoặc đoạn có nội dung.'); }}>Gắn lại đánh dấu</button><button type="button" onClick={() => { save(latest.current.filter(value => value.id !== item.id)); setMessage('Đã xóa đánh dấu.'); }}>Xóa đánh dấu</button></div>
    </FeedbackReveal>)}
    {items.length >= 100 && <p className="text-meta">Tối đa 100 đánh dấu mỗi chương.</p>}
    <span role="status" className="sc-motion-sr-only">{message}</span>{error && <p role="alert">{error}</p>}
  </section>;
}
