import { useLayoutEffect, useRef, useState } from 'react';
type Entry = { text: string; start: number; end: number };
export function useStudioHistory(scope: string, value: string, ready: boolean, onChange: (value: string) => void) {
  const state = useRef({ scope, ready: false, entries: [] as Entry[], index: -1, lastTyping: 0 });
  const [, rerender] = useState(0);
  const bump = () => rerender(version => version + 1);
  const record = (next: Entry, typing = false) => {
    const history = state.current;
    if (history.entries[history.index]?.text === next.text) { history.entries[history.index] = next; return; }
    const coalesce = typing && history.lastTyping > Date.now() - 650 && history.index > 0 && history.index === history.entries.length - 1;
    history.entries = history.entries.slice(0, history.index + 1);
    if (coalesce) history.entries[history.index] = next; else { history.entries.push(next); history.index++; }
    history.lastTyping = typing ? Date.now() : 0;
    let total = history.entries.reduce((count, entry) => count + entry.text.length, 0);
    while (history.entries.length > 2 && (history.entries.length > 60 || total > 2000000)) { total -= history.entries.shift()!.text.length; history.index--; }
    bump();
  };
  useLayoutEffect(() => {
    const history = state.current;
    if (history.scope !== scope || !ready || !history.ready) {
      state.current = { scope, ready, entries: ready ? [{ text: value, start: 0, end: 0 }] : [], index: ready ? 0 : -1, lastTyping: 0 }; bump(); return;
    }
    if (history.entries[history.index]?.text !== value) record({ text: value, start: value.length, end: value.length });
  }, [scope, value, ready]);
  const valid = ready && state.current.scope === scope && state.current.ready;
  const edit = (text: string, start: number, end: number, typing = false) => {
    if (!valid) return; record({ text, start, end }, typing); onChange(text);
  };
  const move = (direction: number) => {
    const history = state.current; if (!valid) return;
    const next = history.index + direction; if (next < 0 || next >= history.entries.length) return;
    history.index = next; history.lastTyping = 0; const entry = history.entries[next]; onChange(entry.text); bump(); return entry;
  };
  return { edit, undo: () => move(-1), redo: () => move(1), canUndo: valid && state.current.index > 0, canRedo: valid && state.current.index < state.current.entries.length - 1,
    remember: (start: number, end: number) => { const entry = state.current.entries[state.current.index]; if (valid && entry) { entry.start = start; entry.end = end; } } };
}
