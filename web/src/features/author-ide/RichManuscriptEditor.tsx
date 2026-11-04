import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { authorNoteDefinitions, parseAuthorNotes } from '../../shared/lib/author-notes';

type Segment = { node: Text | HTMLElement; start: number; end: number; atomic?: boolean };
function renderSource(root: HTMLElement, source: string) {
  const fragment = document.createDocumentFragment();
  const notes = parseAuthorNotes(source).byId;
  const append = (target: Node, text: string, depth = 0) => {
    if (depth > 8) { target.appendChild(document.createTextNode(text)); return; }
    const regex = /(\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|<u>([^\n]+?)<\/u>|\*([^*\n]+?)\*|\[\^(author-[a-zA-Z0-9-]{1,80})\](?!:))/g;
    let cursor = 0;
    for (const match of text.matchAll(regex)) {
      target.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      if (match[7]) {
        const marker = document.createElement('span');
        marker.dataset.studioNoteSource = match[0]; marker.dataset.authorNoteId = match[7]; marker.contentEditable = 'false';
        marker.className = 'sc-rich-author-note-ref'; marker.textContent = `[${notes.get(match[7])?.number ?? '?'}]`;
        marker.title = notes.get(match[7])?.body ?? 'Chú thích chưa có nội dung'; target.appendChild(marker);
        cursor = match.index! + match[0].length; continue;
      }
      const element = document.createElement(match[2] !== undefined || match[3] !== undefined ? 'strong' : match[4] !== undefined ? 's' : match[5] !== undefined ? 'u' : 'em');
      if (match[2] !== undefined) { const italic = document.createElement('em'); append(italic, match[2], depth + 1); element.append(italic); }
      else append(element, match[3] ?? match[4] ?? match[5] ?? match[6], depth + 1);
      target.appendChild(element); cursor = match.index! + match[0].length;
    }
    target.appendChild(document.createTextNode(text.slice(cursor)));
  };
  let cursor = 0;
  for (const match of source.matchAll(authorNoteDefinitions())) {
    append(fragment, source.slice(cursor, match.index));
    const note = notes.get(match[1]), definition = document.createElement('span');
    definition.dataset.studioNoteSource = match[0]; definition.contentEditable = 'false';
    definition.className = 'sc-rich-author-note-definition';
    definition.textContent = `Chú thích ${note?.number ?? 'chưa gắn'} cho độc giả: ${note?.body ?? ''}`;
    fragment.append(definition); cursor = match.index! + match[0].length;
  }
  append(fragment, source.slice(cursor)); root.replaceChildren(fragment);
}

/** Only supported inline marks are serialized. Clipboard HTML never enters this tree. */
export function readRichSource(root: HTMLElement) {
  let text = ''; const segments: Segment[] = [], boundaries = new Map<Node, number[]>();
  const marks: Record<string, [string, string]> = { STRONG: ['**','**'], B: ['**','**'], EM: ['*','*'], I: ['*','*'], U: ['<u>','</u>'], S: ['~~','~~'], STRIKE: ['~~','~~'] };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { const start = text.length; text += node.textContent ?? ''; segments.push({ node: node as Text, start, end: text.length }); return; }
    if (!(node instanceof HTMLElement) && node !== root) return;
    const element = node as HTMLElement;
    if (element.dataset?.studioNoteSource !== undefined) {
      const start = text.length; text += element.dataset.studioNoteSource;
      segments.push({ node: element, start, end: text.length, atomic: true }); return;
    }
    if (element.tagName === 'BR') { text += '\n'; return; }
    const block = node !== root && ['DIV','P'].includes(element.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    const mark = marks[element.tagName]; if (mark) text += mark[0];
    const positions = [text.length];
    for (const child of Array.from(node.childNodes)) { walk(child); positions.push(text.length); }
    boundaries.set(node, positions);
    if (mark) text += mark[1];
  };
  walk(root);
  const offset = (node: Node | null, position: number) => {
    const atom = segments.find(part => part.atomic && node && part.node.contains(node));
    if (atom) return position > 0 ? atom.end : atom.start;
    const segment = segments.find(part => part.node === node);
    return segment ? segment.start + Math.min(position, segment.end - segment.start) : boundaries.get(node!)?.[Math.min(position, (node?.childNodes.length ?? 0))] ?? text.length;
  };
  return { text, segments, offset };
}

export function RichManuscriptEditor({ value, source, disabled, style, onChange, onSelection, onKeyDown }: {
  value: string; source: RefObject<HTMLTextAreaElement | null>; disabled: boolean; style: CSSProperties;
  onChange: (value: string, start: number, end: number) => void; onSelection: (start: number, end: number) => void; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const root = useRef<HTMLDivElement>(null), lastEmitted = useRef<string | null>(null), composing = useRef(false);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const readSelection = () => {
    const element = root.current, selection = window.getSelection();
    if (!element || !selection?.anchorNode || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    const parsed = readRichSource(element), anchor = parsed.offset(selection.anchorNode, selection.anchorOffset), focus = parsed.offset(selection.focusNode, selection.focusOffset);
    return { ...parsed, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
  };
  const remember = () => {
    const selection = readSelection(); if (!selection) return;
    pending.current = selection;
    source.current?.setSelectionRange(selection.start, selection.end); onSelection(selection.start, selection.end);
  };
  const emit = () => {
    const selection = readSelection(); if (!selection || disabled) return;
    lastEmitted.current = selection.text; pending.current = selection;
    onChange(selection.text, selection.start, selection.end);
  };
  useLayoutEffect(() => {
    const element = root.current; if (!element) return;
    if (!composing.current && lastEmitted.current !== value) { renderSource(element, value); lastEmitted.current = value; }
    if (pending.current) source.current?.setSelectionRange(pending.current.start, pending.current.end);
  }, [value]);
  useLayoutEffect(() => {
    const canonical = source.current, element = root.current; if (!canonical || !element) return;
    const choose = (event: Event) => {
      const request = (event as CustomEvent<{ start: number; end: number; scroll?: boolean }>).detail; if (!request) return;
      event.preventDefault();
      const parsed = readRichSource(element);
      const point = (offset: number) => {
        const segment = parsed.segments.find(part => offset >= part.start && offset <= part.end) ?? parsed.segments.find(part => part.start > offset) ?? parsed.segments.at(-1);
        if (segment?.atomic && segment.node.parentNode) {
          const index = Array.from(segment.node.parentNode.childNodes).indexOf(segment.node as ChildNode);
          return { node: segment.node.parentNode, offset: index + Number(offset > segment.start) };
        }
        return segment ? { node: segment.node as Node, offset: Math.max(0, Math.min(segment.end - segment.start, offset - segment.start)) } : { node: element as Node, offset: 0 };
      };
      const start = point(request.start), end = point(request.end), range = document.createRange();
      element.focus({ preventScroll: true }); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); remember();
      const box = range.getClientRects()[0], viewport = element.closest<HTMLElement>('.sc-editor-workspace');
      if (box && viewport && request.scroll !== false) viewport.scrollTop += box.top - viewport.getBoundingClientRect().top - Math.min(120, viewport.clientHeight / 3);
    };
    const changed = () => { if (!composing.current) remember(); };
    canonical.addEventListener('studio-select-source', choose); document.addEventListener('selectionchange', changed);
    return () => { canonical.removeEventListener('studio-select-source', choose); document.removeEventListener('selectionchange', changed); };
  });
  const insertPlain = (text: string) => {
    if (disabled || !text) return;
    const selection = window.getSelection(); if (!selection?.rangeCount || !root.current?.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); emit();
  };
  return <div ref={root} data-studio-rich-editor role="textbox" aria-label="Nội dung bản thảo" aria-multiline="true" aria-readonly={disabled} contentEditable={!disabled} suppressContentEditableWarning spellCheck style={style}
    className="sc-manuscript sc-rich-manuscript" onInput={emit} onMouseUp={remember} onKeyUp={remember} onBlur={remember} onKeyDown={onKeyDown}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; emit(); }}
    onPaste={event => { event.preventDefault(); insertPlain(event.clipboardData.getData('text/plain')); }} onDrop={event => { event.preventDefault(); insertPlain(event.dataTransfer.getData('text/plain')); }} />;
}
