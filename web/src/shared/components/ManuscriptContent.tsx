import type { ReactNode } from 'react';
import { parseAuthorNotes, type AuthorNote } from '../lib/author-notes';
import { AuthorNoteReference } from './AuthorNoteReference';
// Only editor-supported marks are interpreted. React escapes all other HTML.
function inline(text: string, notes: Map<string, AuthorNote>, depth = 0): ReactNode {
  if (depth > 8) return text;
  const marks = /(\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|<u>([^\n]+?)<\/u>|\*([^*\n]+?)\*|\[\^(author-[a-zA-Z0-9-]{1,80})\](?!:))/g;
  const nodes: ReactNode[] = []; let start = 0; let match: RegExpExecArray | null;
  while ((match = marks.exec(text))) {
    nodes.push(text.slice(start, match.index));
    if (match[7]) {
      const note = notes.get(match[7]);
      if (note?.number) nodes.push(<AuthorNoteReference key={match.index} note={note} />);
    } else {
      const body = inline(match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6], notes, depth + 1);
      nodes.push(match[2] !== undefined ? <strong key={match.index}><em>{body}</em></strong> : match[3] !== undefined ? <strong key={match.index}>{body}</strong> : match[4] !== undefined ? <s key={match.index}>{body}</s> : match[5] !== undefined ? <u key={match.index}>{body}</u> : <em key={match.index}>{body}</em>);
    }
    start = marks.lastIndex;
  }
  nodes.push(text.slice(start)); return nodes;
}
export function ManuscriptContent({ content }: { content: string }) {
  const { manuscript, notes, byId } = parseAuthorNotes(content.replace(/\r\n/g, '\n'));
  return <div className="chapter-prose" style={{ color: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>{manuscript.split(/\n\s*\n/).map((block, index) => {
    if (/^\s*(?:---|\*\*\*)\s*$/.test(block)) return <hr key={index} />;
    if (block.startsWith('> ')) return <blockquote key={index} style={{ borderLeft: '3px solid var(--sc-border)', paddingLeft: '1em', marginLeft: 0 }}>{inline(block.replace(/^> /gm, ''), byId)}</blockquote>;
    return <p key={index} style={{ whiteSpace: 'pre-wrap', margin: '0 0 1em' }}>{inline(block, byId)}</p>;
  })}{notes.length > 0 && <section className="sc-author-footnotes" aria-label="Chú thích của tác giả"><h4>Chú thích của tác giả</h4><ol>{notes.map(note => <li key={note.id} value={note.number}>{note.body}</li>)}</ol></section>}</div>;
}
