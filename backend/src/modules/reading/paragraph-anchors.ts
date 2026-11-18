import { createHash } from 'node:crypto';
import { AppError } from '../../core/errors/app-error.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export type ParagraphAnchor = { contentVersion: string; paragraphId: string; paragraphIndex: number; quote: string; before: string; after: string };
export function chapterParagraphs(content: string | null) {
  const text = content ?? '';
  const contentVersion = hash(text);
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const paragraphs = blocks.flatMap((text, paragraphIndex) => {
    if (/^(?:[-*_]\s*){3,}$/.test(text) || /^\[\^[^\]]+\]:/.test(text)) return [];
    return [{ paragraphId: hash(`${contentVersion}:${paragraphIndex}:${text}`), paragraphIndex, text }];
  });
  return { contentVersion, paragraphs };
}
export function makeAnchor(content: string | null, input: { contentVersion: string; paragraphId: string }): ParagraphAnchor {
  const source = chapterParagraphs(content);
  const index = source.paragraphs.findIndex(p => p.paragraphId === input.paragraphId);
  if (source.contentVersion !== input.contentVersion || index < 0) throw new AppError(409, 'COMMENT_ANCHOR_STALE', 'Refresh the chapter before commenting');
  const paragraph = source.paragraphs[index];
  return { contentVersion: source.contentVersion, paragraphId: paragraph.paragraphId, paragraphIndex: paragraph.paragraphIndex,
    quote: paragraph.text, before: source.paragraphs[index-1]?.text ?? '', after: source.paragraphs[index+1]?.text ?? '' };
}
export function resolveAnchor(content: string | null, anchor: ParagraphAnchor) {
  const source = chapterParagraphs(content);
  const matches = source.paragraphs.filter((p, index) => p.text === anchor.quote &&
    (source.contentVersion === anchor.contentVersion ? p.paragraphId === anchor.paragraphId :
      ((anchor.before === '' || source.paragraphs[index-1]?.text === anchor.before) &&
       (anchor.after === '' || source.paragraphs[index+1]?.text === anchor.after))));
  return { ...anchor, detached: matches.length !== 1, currentParagraphId: matches.length === 1 ? matches[0].paragraphId : null };
}
