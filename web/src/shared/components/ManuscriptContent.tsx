import type { ReactNode } from 'react';
// Only editor-supported marks are interpreted. React escapes all other HTML.
function inline(text: string, depth = 0): ReactNode {
  if (depth > 8) return text;
  const marks = /(\*\*\*([^*\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|<u>([^\n]+?)<\/u>|\*([^*\n]+?)\*)/g;
  const nodes: ReactNode[] = []; let start = 0; let match: RegExpExecArray | null;
  while ((match = marks.exec(text))) { nodes.push(text.slice(start, match.index)); const body = inline(match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6], depth + 1); nodes.push(match[2] !== undefined ? <strong key={match.index}><em>{body}</em></strong> : match[3] !== undefined ? <strong key={match.index}>{body}</strong> : match[4] !== undefined ? <s key={match.index}>{body}</s> : match[5] !== undefined ? <u key={match.index}>{body}</u> : <em key={match.index}>{body}</em>); start = marks.lastIndex; }
  nodes.push(text.slice(start)); return nodes;
}
export function ManuscriptContent({ content }: { content: string }) {
  return <div className="chapter-prose" style={{ color: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>{content.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((block, index) => {
    if (/^\s*(?:---|\*\*\*)\s*$/.test(block)) return <hr key={index} />;
    if (block.startsWith('> ')) return <blockquote key={index} style={{ borderLeft: '3px solid var(--sc-border)', paddingLeft: '1em', marginLeft: 0 }}>{inline(block.replace(/^> /gm, ''))}</blockquote>;
    return <p key={index} style={{ whiteSpace: 'pre-wrap', margin: '0 0 1em' }}>{inline(block)}</p>;
  })}</div>;
}
