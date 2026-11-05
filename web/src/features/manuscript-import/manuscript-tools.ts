export type SplitPreset = { name: string; pattern: string; normalizePunctuation: boolean; removeExtraBlankLines: boolean; preserveDialogue: boolean };
export const splitPresetsValid = (value: unknown): value is SplitPreset[] => Array.isArray(value) && value.length <= 20 && value.every(p => p && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 50 && typeof p.pattern === 'string' && p.pattern.length <= 2000 && typeof p.normalizePunctuation === 'boolean' && typeof p.removeExtraBlankLines === 'boolean' && typeof p.preserveDialogue === 'boolean');

export function splitPatternError(pattern: string): string | null {
  if (!pattern.trim()) return 'Nhập quy tắc tách chương.';
  if (pattern.length > 2000) return 'Quy tắc tối đa 2.000 ký tự.';
  try {
    const end = pattern.startsWith('/') ? pattern.lastIndexOf('/') : -1;
    const body = end > 0 ? pattern.slice(1, end) : pattern;
    const flags = end > 0 ? pattern.slice(end + 1) : 'gim';
    const regex = new RegExp(body, flags.includes('g') ? flags : flags + 'g');
    if (regex.test('')) return 'Quy tắc phải khớp tiêu đề, không được khớp văn bản rỗng.';
    return null;
  } catch { return 'Quy tắc Regex không hợp lệ. Hãy kiểm tra dấu ngoặc và cờ nhận diện.'; }
}

/** Compare content only, preserving punctuation and case; ignore incidental whitespace. */
export function duplicateChapterGroups(chapters: ReadonlyArray<{ id: string; content: string }>): string[][] {
  const content = new Map<string, string[]>();
  for (const chapter of chapters) {
    const key = chapter.content.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!key) continue;
    const group = content.get(key); if (group) group.push(chapter.id); else content.set(key, [chapter.id]);
  }
  return [...content.values()].filter(group => group.length > 1);
}
