import { useLayoutEffect, useRef, type RefObject } from 'react';
import { locateAnchor, type TextAnchor } from './studio-annotations';
import { revealStudioSelection } from './studio-tools';

type Position = { version: 1; signature: string; start: number; end: number; scroll: number; width: number; anchor: TextAnchor | null; offset: number };
export function studioTextSignature(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
function readPosition(key: string): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || value.version !== 1 || typeof value.signature !== 'string' || !Number.isInteger(value.start) || value.start < 0 || !Number.isInteger(value.end) || value.end < value.start || !Number.isFinite(value.scroll) || value.scroll < 0 || !Number.isFinite(value.width) || value.width <= 0 || !Number.isInteger(value.offset) || value.offset < 0) return null;
    const anchor = value.anchor;
    if (anchor !== null && (!anchor || !Number.isInteger(anchor.start) || anchor.start < 0 || !Number.isInteger(anchor.end) || anchor.end <= anchor.start || typeof anchor.quote !== 'string' || anchor.quote.length !== anchor.end - anchor.start || anchor.quote.length > 160 || typeof anchor.before !== 'string' || anchor.before.length > 40 || typeof anchor.after !== 'string' || anchor.after.length > 40 || value.offset > anchor.quote.length)) return null;
    return value;
  } catch { return null; }
}

/** Restore once on chapter entry, never when a tool panel toggles or an autosave finishes. */
export function useStudioPosition(scope: string, content: string, ready: boolean, editor: RefObject<HTMLTextAreaElement | null>) {
  const latest = useRef({ scope, content, ready }); latest.current = { scope, content, ready };
  useLayoutEffect(() => {
    const el = editor.current, viewport = el?.closest<HTMLElement>('.sc-editor-workspace');
    if (!ready || !el || !viewport) return;
    const key = `storycraft-studio-position:${scope}`, saved = readPosition(key);
    let active = true, pending = !!saved, restoring = false, frame = 0, restoreFrame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let snapshot: { text: string; start: number; end: number; scroll: number; width: number } | null = null;
    const write = () => {
      if (!snapshot) return;
      const { text, start, end, scroll, width } = snapshot, left = Math.max(0, start - 60), right = Math.min(text.length, start + 100);
      const anchor = right > left ? { start: left, end: right, quote: text.slice(left, right), before: text.slice(Math.max(0, left - 40), left), after: text.slice(right, right + 40) } : null;
      try { localStorage.setItem(key, JSON.stringify({ version: 1, signature: studioTextSignature(text), start, end, scroll, width, anchor, offset: start - left } satisfies Position)); } catch { /* Remembering position is optional; never interrupt writing. */ }
    };
    const capture = () => {
      if (!active || pending || latest.current.scope !== scope || !latest.current.ready || el.value !== latest.current.content) return;
      snapshot = { text: el.value, start: el.selectionStart, end: el.selectionEnd, scroll: viewport.scrollTop, width: viewport.clientWidth };
      clearTimeout(timer); timer = setTimeout(write, 400);
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(capture); };
    const cancelRestore = () => { if (!restoring) { pending = false; update(); } };
    const scroll = update;
    const selection = () => { const active = document.activeElement; if (!restoring && (active === el || active instanceof HTMLElement && active.closest('[data-studio-rich-editor]'))) cancelRestore(); else update(); };
    const visibility = () => { if (document.visibilityState === 'hidden') { capture(); write(); } };
    const leave = () => { capture(); write(); };
    document.addEventListener('pointerdown', cancelRestore, true); document.addEventListener('keydown', cancelRestore, true); viewport.addEventListener('wheel', cancelRestore, { passive: true });
    el.addEventListener('studio-select-source', cancelRestore); el.addEventListener('select', selection); el.addEventListener('blur', update); document.addEventListener('selectionchange', update); viewport.addEventListener('scroll', scroll, { passive: true }); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leave);
    if (!saved) { viewport.scrollTop = 0; el.setSelectionRange(0, 0); }
    else {
      void document.fonts.ready.then(() => {
        if (!active || !pending) return;
        restoreFrame = requestAnimationFrame(() => { restoreFrame = requestAnimationFrame(() => {
          if (!active || !pending || latest.current.scope !== scope || document.querySelector('[role="dialog"]')) return;
          const text = latest.current.content, sameText = studioTextSignature(text) === saved.signature;
          let start = saved.start;
          if (!sameText) {
            if (!saved.anchor) { pending = false; return; }
            const found = locateAnchor(saved.anchor, text); if (found.detached) { pending = false; return; }
            start = found.start + saved.offset;
          }
          start = Math.min(start, text.length); const end = Math.min(start + saved.end - saved.start, text.length);
          const sameWidth = Math.abs(viewport.clientWidth - saved.width) < 1;
          pending = false; restoring = true;
          revealStudioSelection(el, start, end, !(sameText && sameWidth));
          if (sameText && sameWidth) viewport.scrollTop = saved.scroll;
          restoring = false; capture();
        }); });
      });
    }
    return () => {
      capture(); active = false; clearTimeout(timer); cancelAnimationFrame(frame); cancelAnimationFrame(restoreFrame); write();
      document.removeEventListener('pointerdown', cancelRestore, true); document.removeEventListener('keydown', cancelRestore, true); viewport.removeEventListener('wheel', cancelRestore); el.removeEventListener('studio-select-source', cancelRestore); el.removeEventListener('select', selection); el.removeEventListener('blur', update); document.removeEventListener('selectionchange', update); viewport.removeEventListener('scroll', scroll); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave);
    };
  }, [scope, ready, editor]);
}
