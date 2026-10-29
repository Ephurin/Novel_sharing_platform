import { plainStudioText } from './studio-tools';
export type TextAnchor = { start: number; end: number; quote: string; before: string; after: string; detached?: boolean };
export type PassageNote = TextAnchor & { id: string; body: string; resolved: boolean };
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
  return Array.isArray(value) && value.length <= 100 && value.every(note => note && typeof note.id === 'string' && typeof note.body === 'string' && note.body.length <= 4000 && typeof note.quote === 'string' && note.quote.length > 0 && note.quote.length <= 10000 && typeof note.before === 'string' && note.before.length <= 40 && typeof note.after === 'string' && note.after.length <= 40 && Number.isInteger(note.start) && note.start >= 0 && Number.isInteger(note.end) && note.end > note.start && typeof note.resolved === 'boolean');
}
