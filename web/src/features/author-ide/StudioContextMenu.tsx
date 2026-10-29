import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { ContextMenu } from 'radix-ui';
import { isStudioEditorTarget, revealStudioSelection } from './studio-tools';
import { selectedStudioText, transformStudioRange } from './studio-formatting';

/** Keep the manuscript range while Radix moves keyboard focus into the menu. */
export function StudioContextMenu({ children, editor, disabled, apply, onError }: {
  children: ReactElement; editor: RefObject<HTMLTextAreaElement | null>; disabled: boolean;
  apply: (text: string, start: number, end: number) => void; onError: (message: string) => void;
}) {
  const captured = useRef({ text: '', start: 0, end: 0 }), acted = useRef(false);
  const noteFocus = useRef(false), [hasSelection, setHasSelection] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const capture = () => { const el = editor.current; if (el) { captured.current = { text: el.value, start: el.selectionStart, end: el.selectionEnd }; setHasSelection(el.selectionEnd > el.selectionStart); } acted.current = false; noteFocus.current = false; };
  const replace = (value: string) => {
    const { text, start, end } = captured.current;
    if (!alive.current || disabled || !editor.current || editor.current.readOnly) return;
    if (editor.current.value !== text) { onError('Bản thảo đã thay đổi. Hãy chọn lại đoạn cần sửa.'); return; }
    if (!value && editor.current.hidden) { const next = transformStudioRange(text, start, end, 'delete'); apply(next.text, next.start, next.end); }
    else apply(text.slice(0, start) + value + text.slice(end), start + value.length, start + value.length);
  };
  const copy = async (cut = false) => {
    acted.current = true; const { text, start, end } = captured.current;
    if (start === end) return;
    try { await navigator.clipboard.writeText(editor.current?.hidden ? selectedStudioText(text, start, end) : text.slice(start, end)); if (cut) replace(''); }
    catch { onError(`Trình duyệt chưa cho phép ${cut ? 'cắt' : 'sao chép'}. Dùng Ctrl/Cmd + ${cut ? 'X' : 'C'} trong bản thảo.`); }
  };
  const paste = async () => { try { const value = await navigator.clipboard.readText(); if (value) replace(value); } catch { onError('Trình duyệt chưa cho phép đọc bảng nhớ tạm. Dùng Ctrl/Cmd + V trong bản thảo.'); } };
  const item = (label: string, shortcut: string, action: () => void, locked = false) => <ContextMenu.Item className="sc-animated-menu-item" disabled={locked} onSelect={() => { acted.current = true; action(); }}><span className="sc-animated-menu-label">{label}</span><kbd>{shortcut}</kbd></ContextMenu.Item>;
  return <ContextMenu.Root modal={false} onOpenChange={open => { if (open) capture(); }}>
    <ContextMenu.Trigger asChild onContextMenuCapture={capture}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className="sc-animated-menu sc-studio-context-menu" collisionPadding={12} loop onCloseAutoFocus={event => { event.preventDefault(); const el = editor.current, active = document.activeElement; if (!el || noteFocus.current) return; if (active && active !== document.body && !isStudioEditorTarget(active, el) && !(event.target instanceof HTMLElement && event.target.contains(active))) return; revealStudioSelection(el, acted.current ? el.selectionStart : captured.current.start, acted.current ? el.selectionEnd : captured.current.end); }}>
      {item('Cắt', 'Ctrl+X', () => void copy(true), disabled || !hasSelection)}
      {item('Sao chép', 'Ctrl+C', () => void copy(), !hasSelection)}
      {item('Dán văn bản', 'Ctrl+V', () => void paste(), disabled)}
      {item('Xóa vùng chọn', 'Delete', () => replace(''), disabled || !hasSelection)}
      <ContextMenu.Separator className="sc-animated-menu-divider" />
      {item('Thêm ghi chú đoạn', 'Ctrl+Alt+M', () => { const el = editor.current; if (!el) return; noteFocus.current = true; el.setSelectionRange(captured.current.start, captured.current.end); el.dispatchEvent(new CustomEvent('studio-add-note')); }, disabled)}
      <ContextMenu.Separator className="sc-animated-menu-divider" />
      {item('Xóa định dạng vùng chọn', 'Ctrl+\\', () => { const {text,start,end} = captured.current; if (!editor.current || editor.current.value !== text || editor.current.readOnly) return; const next = transformStudioRange(text, start, end, 'clear'); apply(next.text, next.start, next.end); }, disabled || !hasSelection)}
      {item('Chọn tất cả bản thảo', 'Ctrl+A', () => { const el = editor.current; if (el) revealStudioSelection(el, 0, el.value.length); })}
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
