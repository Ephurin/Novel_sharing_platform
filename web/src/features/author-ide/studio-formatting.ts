import { authorNoteDefinitions } from '../../shared/lib/author-notes';

type Style = readonly [string, string];
type Run = { text: string; start: number; styles: Style[]; selected?: boolean; atomic?: boolean };

// Keep offsets in the same UTF-16 coordinate system as the canonical textarea.
function inlineRuns(source: string) {
  const runs: Run[] = [];
  const parse = (text: string, offset: number, styles: Style[], depth = 0) => {
    const add = (value: string, start: number) => { if (value) runs.push({ text: value, start, styles }); };
    if (depth > 8) { add(text, offset); return; }
    const regex = /\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|<u>([^\n]+?)<\/u>|\*([^*\n]+?)\*|(\[\^author-[a-zA-Z0-9-]{1,80}\](?!:))/g;
    let cursor = 0;
    for (const match of text.matchAll(regex)) {
      add(text.slice(cursor, match.index), offset + cursor);
      if (match[6]) { runs.push({ text: match[0], start: offset + match.index!, styles, atomic: true }); cursor = match.index! + match[0].length; continue; }
      const body = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      const both = match[1] !== undefined;
      const mark: Style = both || match[2] !== undefined ? ['**','**'] : match[3] !== undefined ? ['~~','~~'] : match[4] !== undefined ? ['<u>','</u>'] : ['*','*'];
      parse(body, offset + match.index! + (both ? 3 : mark[0].length), [...styles, mark, ...(both ? [['*','*'] as Style] : [])], depth + 1);
      cursor = match.index! + match[0].length;
    }
    add(text.slice(cursor), offset + cursor);
  };
  let cursor = 0;
  for (const match of source.matchAll(authorNoteDefinitions())) {
    parse(source.slice(cursor, match.index), cursor, []);
    runs.push({ text: match[0], start: match.index!, styles: [], atomic: true }); cursor = match.index! + match[0].length;
  }
  parse(source.slice(cursor), cursor, []); return runs;
}

export function selectedStudioText(source: string, start: number, end: number) {
  return inlineRuns(source).map(run => run.text.slice(Math.max(0, start - run.start), Math.max(0, Math.min(run.text.length, end - run.start)))).join('');
}

/** Change selected prose only, splitting marks around it so adjacent prose keeps its style. */
export function transformStudioRange(source: string, start: number, end: number, operation: 'clear' | 'upper' | 'lower' | 'delete') {
  if (start >= end) return { text: source, start, end };
  const transformed: Run[] = []; let changed = false;
  for (const run of inlineRuns(source)) {
    const left = Math.max(0, Math.min(run.text.length, start - run.start)), right = Math.max(0, Math.min(run.text.length, end - run.start));
    if (right <= left) { transformed.push(run); continue; }
    if (run.atomic && operation !== 'delete') { transformed.push(run); continue; }
    changed = true;
    if (left) transformed.push({ ...run, text: run.text.slice(0, left) });
    const value = run.text.slice(left, right);
    transformed.push({ ...run, selected: true, text: operation === 'delete' ? '' : operation === 'upper' ? value.toLocaleUpperCase('vi') : operation === 'lower' ? value.toLocaleLowerCase('vi') : value, styles: operation === 'clear' ? [] : run.styles });
    if (right < run.text.length) transformed.push({ ...run, text: run.text.slice(right) });
  }
  if (!changed) return { text: source, start, end };
  let result = '', active: Style[] = [], selectionStart: number | null = null, selectionEnd = 0;
  for (const run of transformed) {
    // Empty deletion markers locate the caret without producing empty formatting delimiters.
    if (!run.text) { if (selectionStart === null) { selectionStart = result.length; selectionEnd = result.length; } continue; }
    let common = 0;
    while (common < active.length && common < run.styles.length && active[common][0] === run.styles[common][0]) common++;
    for (let index = active.length - 1; index >= common; index--) result += active[index][1];
    for (let index = common; index < run.styles.length; index++) result += run.styles[index][0];
    active = run.styles;
    if (run.selected && selectionStart === null) selectionStart = result.length;
    result += run.text;
    if (run.selected) selectionEnd = result.length;
  }
  for (let index = active.length - 1; index >= 0; index--) result += active[index][1];
  const nextStart = Math.min(selectionStart ?? start, result.length);
  return { text: result, start: nextStart, end: Math.min(selectionEnd, result.length) };
}
