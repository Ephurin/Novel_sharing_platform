import { bannedKeywordGroups } from './banned-keywords.js';
import type { MatchedRule } from './content-control.types.js';

const normalize = (text: string) => text.normalize('NFC').toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word match: no letter or digit may touch either end of the phrase.
const compiled = new Map<string, RegExp>();
function matcher(pattern: string) {
  const key = normalize(pattern).trim();
  let regex = compiled.get(key);
  if (!regex) {
    const body = key.split(/\s+/).map(escape).join('\\s+');
    regex = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
    compiled.set(key, regex);
  }
  return regex;
}

export const builtInFilterRules: MatchedRule[] = bannedKeywordGroups.flatMap(group =>
  group.words.map((word, index) => ({
    ruleId: `builtin:${group.category.toLowerCase()}:${group.severity.toLowerCase()}:${index + 1}`,
    name: group.name,
    pattern: word,
    category: group.category,
    severity: group.severity
  }))
);

export function scanContent(content: string, rules: MatchedRule[]) {
  const text = normalize(content);
  return rules.filter(rule => rule.pattern.trim() && matcher(rule.pattern).test(text));
}

// LOW matches are evidence only; anything else holds a comment for review.
export const blockingRules = (rules: MatchedRule[]) => rules.filter(rule => rule.severity !== 'LOW');

export function highestSeverity(rules: MatchedRule[]) {
  if (rules.some(rule => rule.severity === 'HIGH')) return 'HIGH';
  if (rules.some(rule => rule.severity === 'MEDIUM')) return 'MEDIUM';
  return 'LOW';
}
