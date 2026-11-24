import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockingRules, builtInFilterRules, highestSeverity, scanContent } from './content-filter.js';
import { bannedKeywordGroups } from './banned-keywords.js';

const scan = (text: string) => scanContent(text, builtInFilterRules).map(rule => rule.pattern);

test('Vietnamese profanity is caught regardless of case and Unicode form', () => {
  assert.deepEqual(scan('Đồ ÓC CHÓ'), ['óc chó']);
  assert.deepEqual(scan('đồ óc chó'.normalize('NFD')), ['óc chó']);
  assert.deepEqual(scan('ĐM truyện gì thế'), ['đm']);
});

test('only whole words match, so ordinary words are not flagged', () => {
  assert.deepEqual(scan('Các nhân vật bước vào lớp học'), []); // "cặc" must not match "các"
  assert.deepEqual(scan('The assassin came at dawn'), []);
  assert.deepEqual(scan('Đặt cược mạng sống, hắn đứng dậy'), []);
  assert.deepEqual(scan('dmca và vlog'), []);
});

test('phrases tolerate extra whitespace between syllables', () => {
  assert.deepEqual(scan('tham gia nhà    cái uy tín'), ['nhà cái']);
  assert.deepEqual(scan('tao  giết\nmày'), ['tao giết mày']);
});

test('severity decides whether a comment is held', () => {
  const mild = scanContent('truyện hay vl', builtInFilterRules);
  assert.equal(highestSeverity(mild), 'LOW');
  assert.deepEqual(blockingRules(mild), []);
  const threat = scanContent('mày chết đi', builtInFilterRules);
  assert.equal(highestSeverity(threat), 'HIGH');
  assert.equal(blockingRules(threat).length, 1);
});

test('admin-defined database rules use the same matcher', () => {
  const rules = [{ ruleId: 'db-1', name: 'Test', pattern: 'qa-blocked', category: 'TEST', severity: 'HIGH' }];
  assert.equal(scanContent('this has qa-blocked inside', rules).length, 1);
  assert.equal(scanContent('this has qa-blockedx inside', rules).length, 0);
});

test('the keyword file has no duplicates or blank entries', () => {
  const words = bannedKeywordGroups.flatMap(group => group.words.map(word => word.normalize('NFC').toLowerCase().trim()));
  assert.ok(words.every(Boolean));
  assert.equal(new Set(words).size, words.length);
  assert.equal(new Set(builtInFilterRules.map(rule => rule.ruleId)).size, builtInFilterRules.length);
});
