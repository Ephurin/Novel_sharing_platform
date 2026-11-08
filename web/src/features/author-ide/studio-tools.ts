export type TextMatch = { start: number; end: number };
export function plainStudioText(source: string) {
  let text = source;
  for (let depth = 0; depth < 8; depth++) {
    const next = text.replace(/\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|<u>([^\n]+?)<\/u>|\*([^*\n]+?)\*/g, (_match, both, bold, strike, underline, italic) => both ?? bold ?? strike ?? underline ?? italic);
    if (next === text) break; text = next;
  }
  return text.replace(/^> /gm, '');
}
export function findText(text: string, query: string, caseSensitive = false, wholeWord = false, limit = 10000) {
  const matches: TextMatch[] = [];
  if (!query) return { matches, truncated: false };
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'gu' : 'giu');
  const word = (char: string) => /[\p{L}\p{N}_]/u.test(char);
  for (const match of text.matchAll(regex)) {
    const start = match.index!, end = start + match[0].length;
    if (wholeWord && (word(Array.from(text.slice(Math.max(0, start - 2), start)).at(-1) ?? '') || word(Array.from(text.slice(end, end + 2))[0] ?? ''))) continue;
    if (matches.length === limit) return { matches, truncated: true };
    matches.push({ start, end });
  }
  return { matches, truncated: false };
}
export function replaceMatches(text: string, matches: TextMatch[], replacement: string) {
  let result = '', cursor = 0;
  for (const match of matches) { result += text.slice(cursor, match.start) + replacement; cursor = match.end; }
  return result + text.slice(cursor);
}
export function studioStatistics(text: string) {
  return { words: text.trim() ? text.trim().split(/\s+/u).length : 0, characters: Array.from(text).length, withoutSpaces: Array.from(text.replace(/\s/gu, '')).length, paragraphs: text.trim() ? text.trim().split(/\n\s*\n/u).length : 0 };
}
export function manuscriptScenes(text: string) {
  const scenes: Array<{ start: number; end: number; label: string }> = [];
  let start = 0;
  const add = (end: number) => {
    const fragment = text.slice(start, end), first = fragment.search(/\S/u);
    if (first >= 0) scenes.push({ start: start + first, end, label: fragment.trim().split('\n')[0].replace(/\*\*/g, '').slice(0, 90) });
  };
  for (const match of text.matchAll(/^(?:[ \t]*)(?:---|\*\*\*|※(?:[ \t]+※){2})[ \t]*$/gm)) { add(match.index!); start = match.index! + match[0].length; }
  add(text.length); return scenes;
}

export function downloadStudioFile(title: string, content: string, extension: 'txt' | 'md' | 'html', mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a'); link.href = url;
  link.download = (title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim().slice(0, 100) || 'ban-thao') + '.' + extension;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reveal the selected text in an auto-growing textarea without altering its value. */
export function revealStudioSelection(editor: HTMLTextAreaElement, start: number, end: number, scroll = true) {
  if (!editor.dispatchEvent(new CustomEvent('studio-select-source', { detail: { start, end, scroll }, cancelable: true }))) return;
  editor.focus({ preventScroll: true }); editor.setSelectionRange(start, end);
  if (!scroll) return;
  const viewport = editor.closest<HTMLElement>('.sc-editor-workspace'); if (!viewport) return;
  const mirror = document.createElement('div'), style = getComputedStyle(editor);
  mirror.setAttribute('aria-hidden', 'true');
  for (const property of ['font-family','font-size','font-weight','font-style','letter-spacing','line-height','text-indent','text-align','padding','box-sizing','tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
  Object.assign(mirror.style, { position: 'fixed', left: '-10000px', top: '0', width: `${editor.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  mirror.textContent = editor.value.slice(0, start); const marker = document.createElement('span'); marker.textContent = editor.value[start] || '.'; mirror.append(marker); document.body.append(mirror);
  const top = marker.offsetTop; mirror.remove();
  viewport.scrollTop += editor.getBoundingClientRect().top - viewport.getBoundingClientRect().top + top - Math.min(120, viewport.clientHeight / 3);
}
export function isStudioEditorTarget(target: EventTarget | null, editor: HTMLTextAreaElement | null) {
  return target === editor || target instanceof HTMLElement && !!target.closest('[data-studio-rich-editor]') && !!target.closest('.sc-manuscript-input')?.contains(editor);
}
export function focusStudioEditor(editor: HTMLTextAreaElement | null) {
  if (!editor) return;
  const rich = editor.closest('.sc-manuscript-input')?.querySelector<HTMLElement>('[data-studio-rich-editor]');
  (rich ?? editor).focus({ preventScroll: true });
}
