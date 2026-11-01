import { plainStudioText } from './studio-tools';
export type TextAnchor = { start: number; end: number; quote: string; before: string; after: string; detached?: boolean };
export const noteLabels = { plot: 'Cốt truyện', character: 'Nhân vật', prose: 'Câu chữ', research: 'Cần tra cứu' } as const;
export type NoteLabel = keyof typeof noteLabels;
export type PassageNote = TextAnchor & { id: string; body: string; resolved: boolean; pinned?: boolean; label?: NoteLabel };
export type StudioBookmark = TextAnchor & { id: string; name: string };
export type AnchorEdit = { start: number; end: number; replacement: string };
export function passageAnchor(text: string, start: number, end: number): TextAnchor | null {
  if (start === end) { start = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1; const next = text.indexOf('\n', end); end = next < 0 ? text.length : next; }
  if (!text.slice(start, end).trim() || end - start > 10000) return null;
  return { start, end, quote: text.slice(start, end), before: text.slice(Math.max(0, start - 40), start), after: text.slice(end, end + 40) };
}
export function locateAnchor(anchor: TextAnchor, text: string): TextAnchor {
  if (anchor.detached) return anchor;
  if (text.slice(anchor.start, anchor.end) === anchor.quote) return anchor;
  const candidates: Array<{ start: number; score: number }> = [];
  let cursor = 0;
  while (cursor <= text.length) { const start = text.indexOf(anchor.quote, cursor); if (start < 0) break; const end = start + anchor.quote.length; candidates.push({ start, score: Number(!!anchor.before && text.slice(Math.max(0, start - anchor.before.length), start) === anchor.before) + Number(!!anchor.after && text.slice(end, end + anchor.after.length) === anchor.after) }); cursor = start + Math.max(1, anchor.quote.length); }
  candidates.sort((a,b) => b.score - a.score);
  const best = candidates[0];
  if (best && (best.score > 0 || candidates.length === 1 && anchor.quote.length >= 8) && (!candidates[1] || best.score > candidates[1].score)) return { ...anchor, start: best.start, end: best.start + anchor.quote.length };
  return { ...anchor, detached: true };
}
export function moveAnchor(anchor: TextAnchor, oldText: string, nextText: string): TextAnchor {
  if (anchor.detached || oldText === nextText) return anchor;
  let left = 0; while (left < oldText.length && left < nextText.length && oldText[left] === nextText[left]) left++;
  let oldEnd = oldText.length, newEnd = nextText.length;
  while (oldEnd > left && newEnd > left && oldText[oldEnd - 1] === nextText[newEnd - 1]) { oldEnd--; newEnd--; }
  if (oldEnd > left && left <= anchor.start && oldEnd >= anchor.end) {
    const oldPart = oldText.slice(left, oldEnd), newPart = nextText.slice(left, newEnd), quote = plainStudioText(anchor.quote);
    if (plainStudioText(oldPart) === plainStudioText(newPart)) {
      const at = newPart.indexOf(quote);
      if (at >= 0 && newPart.indexOf(quote, at + 1) < 0) return passageAnchor(nextText, left + at, left + at + quote.length) ?? { ...anchor, detached: true };
    }
    return { ...anchor, detached: true };
  }
  const delta = newEnd - oldEnd;
  const start = anchor.start < left ? anchor.start : anchor.start >= oldEnd ? anchor.start + delta : left;
  const end = anchor.end <= left ? anchor.end : anchor.end >= oldEnd ? anchor.end + delta : newEnd;
  if (end <= start) return { ...anchor, detached: true };
  return passageAnchor(nextText, start, end) ?? { ...anchor, detached: true };
}
export function validPassageNotes(value: unknown): value is PassageNote[] {
  return Array.isArray(value) && value.length <= 100 && value.every(note => validAnchor(note) && typeof note.id === 'string' && typeof note.body === 'string' && note.body.length <= 4000 && typeof note.resolved === 'boolean' && (note.pinned === undefined || typeof note.pinned === 'boolean') && (note.label === undefined || typeof note.label === 'string' && Object.prototype.hasOwnProperty.call(noteLabels, note.label)));
}

function validAnchor(value: unknown): value is TextAnchor & Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return typeof note.quote === 'string' && note.quote.length > 0 && note.quote.length <= 10000 && typeof note.before === 'string' && note.before.length <= 40 && typeof note.after === 'string' && note.after.length <= 40 && Number.isInteger(note.start) && Number(note.start) >= 0 && Number.isInteger(note.end) && Number(note.end) > Number(note.start) && (note.detached === undefined || typeof note.detached === 'boolean');
}
export function validBookmarks(value: unknown): value is StudioBookmark[] {
  return Array.isArray(value) && value.length <= 100 && value.every(item => validAnchor(item) && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 80) && new Set(value.map(item => item.id)).size === value.length;
}

/** Known edits avoid treating several independent punctuation fixes as one deleted passage. */
export function moveAnchorThroughEdits(anchor: TextAnchor, nextText: string, edits: readonly AnchorEdit[]): TextAnchor {
  if (anchor.detached) return anchor;
  let start = anchor.start, end = anchor.end, delta = 0;
  for (const edit of edits) {
    const left = edit.start + delta, oldEnd = edit.end + delta, newEnd = left + edit.replacement.length, change = newEnd - oldEnd;
    if (oldEnd > left && left <= start && oldEnd >= end) return { ...anchor, detached: true };
    start = start < left ? start : start >= oldEnd ? start + change : left;
    end = end <= left ? end : end >= oldEnd ? end + change : newEnd;
    if (end <= start) return { ...anchor, detached: true };
    delta += change;
  }
  return passageAnchor(nextText, start, end) ?? { ...anchor, detached: true };
}
const batches = new WeakMap<HTMLTextAreaElement, { before: string; after: string; edits: AnchorEdit[]; reverse: AnchorEdit[] }>();
export function rememberAnnotationEdits(editor: HTMLTextAreaElement, before: string, after: string, edits: readonly AnchorEdit[]) {
  let delta = 0;
  const reverse = edits.map(edit => { const start = edit.start + delta; delta += edit.replacement.length - (edit.end - edit.start); return { start, end: start + edit.replacement.length, replacement: before.slice(edit.start, edit.end) }; });
  batches.set(editor, { before, after, edits: [...edits], reverse });
}
export function followStudioAnchor(anchor: TextAnchor, before: string, after: string, editor?: HTMLTextAreaElement | null) {
  const batch = editor ? batches.get(editor) : undefined;
  if (batch?.before === before && batch.after === after) return moveAnchorThroughEdits(anchor, after, batch.edits);
  if (batch?.after === before && batch.before === after) return moveAnchorThroughEdits(anchor, after, batch.reverse);
  return moveAnchor(anchor, before, after);
}
