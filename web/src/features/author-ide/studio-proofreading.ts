import type { AnchorEdit } from './studio-annotations';

export const proofRules = { beforePunctuation: 'Khoảng trắng trước dấu câu', repeatedSpace: 'Khoảng trắng lặp', trailingSpace: 'Khoảng trắng cuối dòng', afterPunctuation: 'Thiếu khoảng trắng sau dấu câu', ellipsis: 'Dấu chấm lửng' } as const;
export type ProofIssue = AnchorEdit & { id: string; rule: keyof typeof proofRules; original: string };

/** Conservative suggestions only. Preserve line breaks, Markdown marks, URLs and code. */
export function inspectPunctuation(source: string, limit = 500) {
  const protectedRanges = Array.from(source.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]*`|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[\p{L}]{2,}|<[^>\n]*>/gu), match => ({ start: match.index!, end: match.index! + match[0].length }));
  const candidates: ProofIssue[] = [];
  const add = (rule: keyof typeof proofRules, pattern: RegExp, replacement: (value: string) => string) => {
    for (const match of source.matchAll(pattern)) {
      const start = match.index!, end = start + match[0].length;
      if (protectedRanges.some(range => start < range.end && end > range.start)) continue;
      if (rule === 'beforePunctuation') {
        const previous = source[start - 1] ?? '';
        if (!/[\p{L}\p{M}\p{N}]/u.test(previous) && !['”','’','"',"'",'*',')',']','>'].includes(previous)) continue;
      }
      candidates.push({ id: `${rule}:${start}:${end}`, rule, start, end, original: match[0], replacement: replacement(match[0]) });
      if (candidates.length >= limit * 3) break;
    }
  };
  add('beforePunctuation', /[ \t]+(?=[,;:!?]|\.(?![.\d]))/gu, () => '');
  add('trailingSpace', /[ \t]+(?=\r?$)/gmu, () => '');
  add('repeatedSpace', /(?<=\S)[ \t]{2,}(?=\S)/gu, () => ' ');
  add('afterPunctuation', /[,;:!?](?=[\p{L}])/gu, value => value + ' ');
  add('ellipsis', /(?<!\.)\.{3}(?!\.)/gu, () => '…');
  candidates.sort((a, b) => a.start - b.start);
  const issues: ProofIssue[] = []; let end = -1, truncated = false;
  for (const issue of candidates) {
    if (issue.start < end) continue;
    if (issues.length >= limit) { truncated = true; break; }
    issues.push(issue); end = issue.end;
  }
  return { issues, truncated };
}

export function applyProofIssues(source: string, issues: readonly ProofIssue[]) {
  let value = '', cursor = 0;
  for (const issue of [...issues].sort((a,b) => a.start - b.start)) {
    if (issue.start < cursor || issue.end < issue.start || source.slice(issue.start, issue.end) !== issue.original) throw new Error('Bản thảo đã thay đổi. Hãy kiểm tra lại trước khi áp dụng.');
    value += source.slice(cursor, issue.start) + issue.replacement; cursor = issue.end;
  }
  return value + source.slice(cursor);
}
