/** Public footnotes travel with chapter content through autosave, revisions and moderation. */
export const AUTHOR_NOTE_LIMIT = 100;
export const AUTHOR_NOTE_BODY_LIMIT = 2000;
export const authorNoteReferences = () => /\[\^(author-[a-zA-Z0-9-]{1,80})\](?!:)/g;
export const authorNoteDefinitions = () => /^\[\^(author-[a-zA-Z0-9-]{1,80})\]:[ \t]*[^\r\n]*(?:\r?\n(?: {4}|\t)[^\r\n]*)*/gm;

export type AuthorNote = { id: string; body: string; start: number; end: number; references: number[]; number?: number };

export function parseAuthorNotes(source: string) {
  const definitions = Array.from(source.matchAll(authorNoteDefinitions()));
  const all: AuthorNote[] = [];
  const byId = new Map<string, AuthorNote>();
  for (const match of definitions) {
    if (byId.has(match[1])) continue;
    const body = match[0].slice(match[0].indexOf(':') + 1).replace(/^[ \t]*/, '').replace(/\r?\n(?: {4}|\t)/g, '\n').trim();
    const note: AuthorNote = { id: match[1], body, start: match.index!, end: match.index! + match[0].length, references: [] };
    all.push(note); byId.set(note.id, note);
  }
  const notes: AuthorNote[] = [];
  for (const match of source.matchAll(authorNoteReferences())) {
    if (definitions.some(def => match.index! >= def.index! && match.index! < def.index! + def[0].length)) continue;
    const note = byId.get(match[1]);
    if (!note?.body) continue;
    if (note.number === undefined) { note.number = notes.length + 1; notes.push(note); }
    note.references.push(match.index!);
  }
  let manuscript = source;
  for (const match of definitions.slice().reverse()) manuscript = manuscript.slice(0, match.index) + manuscript.slice(match.index! + match[0].length);
  return { manuscript: definitions.length ? manuscript.trimEnd() : manuscript, all, notes, byId };
}

/** Compare note bodies and nearby attachment text without unrelated chapter edits. */
export function authorNotesPublicationSignature(source: string) {
  return JSON.stringify(parseAuthorNotes(source).notes.map(note => ({
    id: note.id, body: note.body,
    positions: note.references.map(start => [source.slice(Math.max(0, start - 80), start), source.slice(start + note.id.length + 3, start + note.id.length + 83)])
  })));
}

function definition(id: string, body: string) {
  const text = body.trim().replace(/\r\n/g, '\n');
  if (!text || text.length > AUTHOR_NOTE_BODY_LIMIT) throw new Error(`Nhập chú thích từ 1 đến ${AUTHOR_NOTE_BODY_LIMIT} ký tự.`);
  return `[^${id}]: ${text.replace(/\n/g, '\n    ')}`;
}

export function assertAuthorNoteRange(source: string, start: number, end: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length || end - start > 10000 || !source.slice(start, end).trim()) throw new Error('Chọn câu hoặc dòng cần chú thích, tối đa 10.000 ký tự.');
  if (Array.from(source.matchAll(authorNoteDefinitions())).some(match => start < match.index! + match[0].length && end > match.index!)) throw new Error('Chọn một câu trong bản thảo, bên ngoài phần chú thích.');
  if (/\[\^author-/.test(source.slice(start, end))) throw new Error('Chọn phần lời văn, không bao gồm số chú thích đã có.');
}

export function addAuthorNote(source: string, start: number, end: number, body: string, id: string) {
  assertAuthorNoteRange(source, start, end);
  if (!/^author-[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Mã chú thích không hợp lệ.');
  const parsed = parseAuthorNotes(source);
  if (parsed.all.length >= AUTHOR_NOTE_LIMIT) throw new Error(`Tối đa ${AUTHOR_NOTE_LIMIT} chú thích mỗi chương.`);
  if (parsed.byId.has(id) || source.includes(`[^${id}]`)) throw new Error('Chú thích đã tồn tại.');
  return source.slice(0, end) + `[^${id}]` + source.slice(end) + `\n\n${definition(id, body)}`;
}

export function updateAuthorNote(source: string, id: string, body: string) {
  if (!parseAuthorNotes(source).byId.has(id)) throw new Error('Chú thích không còn trong bản thảo.');
  return source.replace(authorNoteDefinitions(), (match, found: string) => found === id ? definition(id, body) : match);
}

export function authorNoteRemovalEdits(source: string, id: string) {
  const definitions = Array.from(source.matchAll(authorNoteDefinitions()));
  const references = Array.from(source.matchAll(authorNoteReferences())).filter(match => !definitions.some(def => match.index! >= def.index! && match.index! < def.index! + def[0].length));
  return [...definitions, ...references].filter(match => match[1] === id).map(match => ({ start: match.index!, end: match.index! + match[0].length, replacement: '' })).sort((a, b) => a.start - b.start);
}

export function removeAuthorNote(source: string, id: string) {
  let text = source;
  for (const edit of authorNoteRemovalEdits(source, id).reverse()) text = text.slice(0, edit.start) + text.slice(edit.end);
  return text;
}

export function reattachAuthorNote(source: string, id: string, start: number, end: number) {
  assertAuthorNoteRange(source, start, end);
  const note = parseAuthorNotes(source).byId.get(id);
  if (!note || note.references.length) throw new Error('Chỉ gắn lại chú thích đã mất vị trí trong bản thảo.');
  return source.slice(0, end) + `[^${id}]` + source.slice(end);
}
