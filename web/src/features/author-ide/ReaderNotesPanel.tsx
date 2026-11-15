import { useEffect, useRef, useState, type RefObject } from 'react';
import { addAuthorNote, assertAuthorNoteRange, authorNoteRemovalEdits, authorNotesPublicationSignature, AUTHOR_NOTE_BODY_LIMIT, AUTHOR_NOTE_LIMIT, parseAuthorNotes, reattachAuthorNote, removeAuthorNote, updateAuthorNote } from '../../shared/lib/author-notes';
import { locateAnchor, passageAnchor, rememberAnnotationEdits, type AnchorEdit, type TextAnchor } from './studio-annotations';
import { plainStudioText } from './studio-tools';

type Composer = { mode: 'create'; anchor: TextAnchor } | { mode: 'edit'; id: string };

/** Public notes use chapter autosave, while the existing passage notes remain private. */
export function ReaderNotesPanel({ content, ready, request, getSelection, apply, onJump, editor, publishedContent, chapterStatus, onPreview, onPublish }: {
  content: string; ready: boolean; request: number; getSelection: () => { start: number; end: number };
  apply: (content: string, start: number, end: number) => void; onJump: (start: number, end: number) => void;
  editor: RefObject<HTMLTextAreaElement | null>;
  publishedContent?: string | null; chapterStatus?: string; onPreview?: () => void; onPublish?: () => void;
}) {
  const { all } = parseAuthorNotes(content);
  const published = parseAuthorNotes(publishedContent ?? '');
  const hasChanges = authorNotesPublicationSignature(content) !== authorNotesPublicationSignature(publishedContent ?? '');
  const isPublished = chapterStatus === 'PUBLISHED';
  const publicationMessage = chapterStatus === 'PENDING_MODERATION' ? 'Chương đang chờ duyệt. Chú thích của phiên bản này chỉ hiện sau khi được duyệt.'
    : isPublished && !hasChanges ? 'Chú thích đã có trên bản công khai.'
    : isPublished ? 'Chú thích đã thay đổi trong bản nháp. Trang đọc vẫn dùng bản công khai cũ; cần xuất bản phiên bản mới để cập nhật.'
    : 'Chú thích đang ở bản nháp. Độc giả chỉ thấy sau khi chương được xuất bản.';
  const [composer, setComposer] = useState<Composer | null>(null), [body, setBody] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const selection = () => {
    const range = getSelection(), anchor = passageAnchor(content, range.start, range.end);
    if (!anchor) throw new Error('Chọn câu hoặc đặt con trỏ ở dòng cần chú thích.');
    assertAuthorNoteRange(content, anchor.start, anchor.end);
    return anchor;
  };
  const choose = () => {
    try { const anchor = selection(); setComposer({ mode: 'create', anchor }); setBody(''); setError(''); }
    catch (reason) { setError((reason as Error).message); }
  };
  useEffect(() => { if (request > 0 && ready) choose(); }, [request]);
  useEffect(() => { if (composer) input.current?.focus(); }, [composer]);
  const edit = (next: string, caret: number, message: string, edits?: AnchorEdit[]) => {
    if (editor.current && edits) rememberAnnotationEdits(editor.current, content, next, edits);
    apply(next, Math.min(caret, next.length), Math.min(caret, next.length));
    setError(''); setMessage(message);
  };
  const save = () => {
    if (!ready || !composer) return;
    try {
      if (composer.mode === 'create') {
        const anchor = locateAnchor(composer.anchor, content);
        if (anchor.detached) throw new Error('Câu đã thay đổi. Chọn lại vị trí cần chú thích.');
        const id = `author-${crypto.randomUUID()}`, marker = `[^${id}]`, next = addAuthorNote(content, anchor.start, anchor.end, body, id);
        edit(next, anchor.end, 'Đã thêm chú thích vào bản nháp.', [
          { start: anchor.end, end: anchor.end, replacement: marker },
          { start: content.length, end: content.length, replacement: next.slice(content.length + marker.length) }
        ]);
      } else {
        const note = parseAuthorNotes(content).byId.get(composer.id);
        edit(updateAuthorNote(content, composer.id, body), note?.references[0] ?? 0, 'Đã sửa chú thích trong bản nháp.');
      }
      setComposer(null); setBody('');
    } catch (reason) { setError((reason as Error).message); }
  };
  return <section className="sc-reader-notes-panel" aria-label="Chú thích cho độc giả">
    <p className="text-meta">Giải thích cách xưng hô, từ ngữ hoặc chi tiết trong truyện. Độc giả bấm số chú thích cạnh câu để xem.</p>
    {(all.length > 0 || published.all.length > 0) && <div className="sc-reader-note-publication" role="status" aria-label="Trạng thái công khai chú thích" data-published={isPublished && !hasChanges}>
      <p>{publicationMessage}</p>
      <div className="sc-studio-tool-row">
        {onPreview && <button type="button" onClick={onPreview}>Xem trước như độc giả</button>}
        {onPublish && (!isPublished || hasChanges) && <button type="button" disabled={!ready || chapterStatus === 'PENDING_MODERATION'} onClick={onPublish}>{isPublished ? 'Xuất bản phiên bản mới' : 'Xuất bản chương có chú thích'}</button>}
      </div>
    </div>}
    <button type="button" className="sc-feedback-button" disabled={!ready || all.length >= AUTHOR_NOTE_LIMIT} onClick={choose}>Chú thích vùng chọn / dòng hiện tại</button>
    {!all.length && !composer && <p className="sc-note-empty">Chưa có chú thích cho độc giả trong chương này.</p>}
    {composer && <div className="sc-passage-note sc-reader-note-composer">
      <h3>{composer.mode === 'create' ? 'Thêm chú thích cho độc giả' : 'Sửa chú thích cho độc giả'}</h3>
      {composer.mode === 'create' && <blockquote>{plainStudioText(composer.anchor.quote)}</blockquote>}
      <label htmlFor="studio-reader-note-body">Nội dung chú thích</label>
      <textarea id="studio-reader-note-body" ref={input} value={body} maxLength={AUTHOR_NOTE_BODY_LIMIT} onChange={event => setBody(event.target.value)} placeholder="Ví dụ: Nhân vật dùng ‘huynh’ để gọi người anh kết nghĩa, không phải anh ruột." />
      <span className="text-meta">{body.length}/{AUTHOR_NOTE_BODY_LIMIT}</span>
      <div className="sc-studio-tool-row"><button type="button" disabled={!ready || !body.trim()} onClick={save}>Lưu chú thích</button><button type="button" onClick={() => { setComposer(null); setError(''); }}>Hủy chú thích</button></div>
    </div>}
    {all.map(note => <article className="sc-passage-note" key={note.id}>
      <h3>{note.number ? `Chú thích ${note.number}` : 'Chú thích chưa gắn vào lời văn'}</h3>
      {note.references.length > 0 && <p className="text-meta">{isPublished && published.byId.get(note.id)?.number ? (published.byId.get(note.id)?.body === note.body ? 'Đã có trên bản công khai' : 'Nội dung chú thích đã sửa, chưa xuất bản') : 'Chưa có trên bản công khai'}</p>}
      {note.references.length > 0 && <blockquote>{plainStudioText(content.slice(Math.max(content.lastIndexOf('\n', note.references[0]) + 1, note.references[0] - 180), note.references[0]))}</blockquote>}
      <p className="sc-reader-note-body">{note.body}</p>
      <div className="sc-studio-tool-row">
        <button type="button" disabled={!ready} onClick={() => { setComposer({ mode: 'edit', id: note.id }); setBody(note.body); setError(''); }}>Sửa chú thích</button>
        {note.references.length ? <button type="button" onClick={() => onJump(note.references[0], note.references[0] + note.id.length + 3)}>Tới vị trí</button> : <button type="button" disabled={!ready} onClick={() => { try { const anchor = selection(); edit(reattachAuthorNote(content, note.id, anchor.start, anchor.end), anchor.end, 'Đã gắn lại chú thích.', [{ start: anchor.end, end: anchor.end, replacement: `[^${note.id}]` }]); } catch (reason) { setError((reason as Error).message); } }}>Gắn vào vùng chọn / dòng hiện tại</button>}
        <button type="button" disabled={!ready} onClick={() => { edit(removeAuthorNote(content, note.id), note.references[0] ?? 0, 'Đã xóa chú thích. Có thể hoàn tác trong bản thảo.', authorNoteRemovalEdits(content, note.id)); if (composer?.mode === 'edit' && composer.id === note.id) setComposer(null); }}>Xóa chú thích</button>
      </div>
      {!note.references.length && <p className="text-meta">Chú thích này chưa hiện với độc giả. Chọn lại câu để gắn vị trí.</p>}
    </article>)}
    {all.length >= AUTHOR_NOTE_LIMIT && <p className="text-meta">Tối đa {AUTHOR_NOTE_LIMIT} chú thích mỗi chương.</p>}
    {error && <p role="alert">{error}</p>}
    <span role="status" className="sc-motion-sr-only">{message}</span>
  </section>;
}
