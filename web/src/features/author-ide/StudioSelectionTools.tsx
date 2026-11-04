import { useEffect, useRef, useState, type RefObject } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { selectedStudioText } from './studio-formatting';
import { revealStudioSelection } from './studio-tools';
import { AnimatedTooltip } from '../../shared/components/AnimatedTooltip';

type Selection = { start: number; end: number; value: string; rect: DOMRect; context: HTMLElement; below: boolean };

function sourceSelectionRect(el: HTMLTextAreaElement) {
  const mirror = document.createElement('div'), style = getComputedStyle(el), box = el.getBoundingClientRect();
  for (const property of ['font-family','font-size','font-weight','letter-spacing','line-height','text-indent','text-align','padding','box-sizing','tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
  Object.assign(mirror.style, { position: 'fixed', left: '-10000px', top: '0', width: `${el.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  mirror.textContent = el.value.slice(0, el.selectionStart);
  const marker = document.createElement('span'); marker.textContent = el.value[el.selectionStart] || '.'; mirror.append(marker); document.body.append(mirror);
  const rect = new DOMRect(box.left + marker.offsetLeft, box.top + marker.offsetTop - el.scrollTop, 1, marker.offsetHeight); mirror.remove(); return rect;
}

/** A portal anchored to the browser range; never inserts anything into the manuscript DOM. */
export function StudioSelectionTools({ editor, disabled, onFormat, onLookup, onAi }: {
  editor: RefObject<HTMLTextAreaElement | null>; disabled: boolean;
  onFormat: (format: 'bold' | 'italic' | 'underline') => void; onLookup: (text: string) => void; onAi: () => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const dismissed = useRef(''), frame = useRef(0), pointerDown = useRef(false), composing = useRef(false);
  const reduce = useReducedMotion();
  const { refs, floatingStyles } = useFloating({ open: !!selection && !disabled, placement: selection?.below ? 'bottom' : 'top', strategy: 'fixed', middleware: [offset(8), flip(), shift({ padding: 12 })], whileElementsMounted: autoUpdate });
  useEffect(() => {
    if (selection) refs.setPositionReference({ getBoundingClientRect: () => selection.rect, contextElement: selection.context });
  }, [selection, refs]);
  useEffect(() => {
    const update = () => {
      cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => {
        const el = editor.current;
        if (!el || disabled || composing.current || pointerDown.current || document.querySelector('[role="dialog"], [role="menu"][data-state="open"]')) { setSelection(null); return; }
        if (document.activeElement?.closest('.sc-studio-selection-tools')) return;
        const rich = el.closest('.sc-manuscript-input')?.querySelector<HTMLElement>('[data-studio-rich-editor]'), range = window.getSelection();
        const key = `${el.selectionStart}:${el.selectionEnd}:${el.value}`;
        if (dismissed.current && dismissed.current !== key) dismissed.current = '';
        if (el.selectionStart === el.selectionEnd || !el.value.slice(el.selectionStart, el.selectionEnd).trim() || el.selectionEnd - el.selectionStart > 10000 || dismissed.current === key) { setSelection(null); return; }
        let rect: DOMRect, context: HTMLElement;
        if (el.hidden) {
          if (!rich || !rich.contains(document.activeElement) || !range?.rangeCount || !rich.contains(range.anchorNode) || !rich.contains(range.focusNode)) { setSelection(null); return; }
          const first = range.getRangeAt(0).getClientRects()[0]; if (!first) { setSelection(null); return; } rect = first; context = rich;
        } else {
          if (document.activeElement !== el) { setSelection(null); return; } rect = sourceSelectionRect(el); context = el;
        }
        const workspace = el.closest('.sc-editor-workspace')?.getBoundingClientRect();
        if (!workspace || rect.bottom < workspace.top + 60 || rect.top > workspace.bottom || rect.right < workspace.left || rect.left > workspace.right) { setSelection(null); return; }
        const formatBottom = el.closest('.sc-editor-workspace')?.querySelector('.sc-format-toolbar')?.getBoundingClientRect().bottom ?? workspace.top;
        setSelection({ start: el.selectionStart, end: el.selectionEnd, value: el.value, rect, context, below: rect.top - 56 < formatBottom });
      });
    };
    const down = (event: PointerEvent) => { if ((event.target as HTMLElement)?.closest('.sc-studio-selection-tools')) return; dismissed.current = ''; pointerDown.current = true; setSelection(null); };
    const up = () => { pointerDown.current = false; update(); };
    const startComposition = () => { composing.current = true; setSelection(null); };
    const endComposition = () => { composing.current = false; update(); };
    const keydown = (event: KeyboardEvent) => {
      if (((event.ctrlKey || event.metaKey) && ['a','z','y'].includes(event.key.toLowerCase())) || event.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) dismissed.current = '';
      if (event.key === 'Escape') { const el = editor.current; if (el) dismissed.current = `${el.selectionStart}:${el.selectionEnd}:${el.value}`; setSelection(null); }
      if (event.altKey && event.shiftKey && event.code === 'KeyT' && refs.floating.current) { event.preventDefault(); refs.floating.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
    };
    document.addEventListener('selectionchange', update); document.addEventListener('select', update, true); document.addEventListener('pointerdown', down); document.addEventListener('pointerup', up); document.addEventListener('keyup', update); document.addEventListener('keydown', keydown); document.addEventListener('focusin', update); document.addEventListener('scroll', update, true); window.addEventListener('resize', update); document.addEventListener('compositionstart', startComposition); document.addEventListener('compositionend', endComposition);
    return () => { cancelAnimationFrame(frame.current); document.removeEventListener('selectionchange', update); document.removeEventListener('select', update, true); document.removeEventListener('pointerdown', down); document.removeEventListener('pointerup', up); document.removeEventListener('keyup', update); document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', update); document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); document.removeEventListener('compositionstart', startComposition); document.removeEventListener('compositionend', endComposition); };
  }, [editor, disabled, refs]);
  const act = (action: () => void) => {
    const el = editor.current; if (!el || !selection || el.value !== selection.value || disabled) { setSelection(null); return; }
    el.setSelectionRange(selection.start, selection.end); dismissed.current = `${selection.start}:${selection.end}:${selection.value}`; setSelection(null); action();
  };
  return <FloatingPortal><AnimatePresence>{selection && !disabled && <div ref={refs.setFloating} style={floatingStyles} className="sc-studio-selection-position">
    <motion.div className="sc-studio-selection-tools" role="toolbar" aria-label="Công cụ vùng chọn" initial={{ opacity: 0, scale: reduce ? 1 : .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .16 }} onPointerDown={event => event.preventDefault()}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); const el = editor.current; if (el) revealStudioSelection(el, selection.start, selection.end, false); setSelection(null); } if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const controls = Array.from(event.currentTarget.querySelectorAll('button')), at = controls.indexOf(document.activeElement as HTMLButtonElement); controls[event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (at + (event.key === 'ArrowLeft' ? -1 : 1) + controls.length) % controls.length]?.focus(); } }}>
      <AnimatedTooltip label="In đậm"><button type="button" aria-label="In đậm vùng chọn" onClick={() => act(() => onFormat('bold'))}><b>B</b></button></AnimatedTooltip>
      <AnimatedTooltip label="In nghiêng"><button type="button" aria-label="In nghiêng vùng chọn" onClick={() => act(() => onFormat('italic'))}><i>I</i></button></AnimatedTooltip>
      <AnimatedTooltip label="Gạch chân"><button type="button" aria-label="Gạch chân vùng chọn" onClick={() => act(() => onFormat('underline'))}><u>U</u></button></AnimatedTooltip>
      <span className="sc-selection-divider" aria-hidden="true" />
      <AnimatedTooltip label="Ghi chú riêng"><button type="button" aria-label="Ghi chú vùng chọn" onClick={() => act(() => editor.current?.dispatchEvent(new CustomEvent('studio-add-note')))}><span className="material-symbols-outlined" aria-hidden="true">add_comment</span></button></AnimatedTooltip>
      <AnimatedTooltip label="Chú thích cho độc giả"><button type="button" aria-label="Chú thích vùng chọn cho độc giả" onClick={() => act(() => editor.current?.dispatchEvent(new CustomEvent('studio-add-reader-note')))}><span className="material-symbols-outlined" aria-hidden="true">speaker_notes</span></button></AnimatedTooltip>
      <AnimatedTooltip label="Đánh dấu đoạn"><button type="button" aria-label="Đánh dấu vùng chọn" onClick={() => act(() => editor.current?.dispatchEvent(new CustomEvent('studio-add-bookmark')))}><span className="material-symbols-outlined" aria-hidden="true">bookmark_add</span></button></AnimatedTooltip>
      <AnimatedTooltip label="Tra cứu cẩm nang"><button type="button" aria-label="Tra cứu vùng chọn trong cẩm nang" onClick={() => act(() => onLookup(selectedStudioText(selection.value, selection.start, selection.end)))}><span className="material-symbols-outlined" aria-hidden="true">menu_book</span></button></AnimatedTooltip>
      <AnimatedTooltip label="Hỏi AI về vùng chọn"><button type="button" aria-label="Hỏi AI về vùng chọn" onClick={() => act(onAi)}><span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span></button></AnimatedTooltip>
    </motion.div></div>}</AnimatePresence></FloatingPortal>;
}
