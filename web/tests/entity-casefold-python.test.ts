import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeEntityName } from '../src/features/ai-copilot/author-memory-api.ts';

const python = `
import sys,json,unicodedata
from domain.projection import validate_author_edit, ProjectionError
out=[]
for item in json.load(sys.stdin):
    original={'canonical_name':'Original','normalized_name':'original','entity_type':'PER'}
    edited={**original,**item}
    try:
        validate_author_edit('entity',original,edited,set())
        out.append({'valid':True,'canonical_name':item['canonical_name'],'fold':item['canonical_name'].casefold()})
    except ProjectionError as exc:
        out.append({'valid':False,'canonical_name':item['canonical_name'],'fold':item['canonical_name'].casefold(),'error':str(exc)})
print(json.dumps({'python':sys.version,'unicode':unicodedata.unidata_version,'results':out}))
`;

test('FE-18 actual Python author edit validation accepts exact submitted canonical names', () => {
  const names = ['Ánh', 'A\u0301nh', 'ĐẶNG Thị ÁNH', 'ĐA\u0323̆NG Thi\u0323 A\u0301NH',
    'Straße', 'GROẞ', 'ΟΣ', 'Σοφός', 'ﬃ ﬂ ﬁ ﬀ ﬄ ﬅ ﬆ', 'և',
    '  Minh  ', 'Mai  Linh', '\tÁnh\t', 'İ ǰ ẖ', 'µ ſ'];
  const items = names.map(canonical_name => ({ canonical_name, normalized_name: normalizeEntityName(canonical_name) }));
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', python], {
    cwd: fileURLToPath(new URL('../../ai-service/', import.meta.url)), input: JSON.stringify(items), encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  console.log('FE18_PYTHON_VALIDATION ' + JSON.stringify({ items, ...data }));
  data.results.forEach((r: { valid: boolean; canonical_name: string; fold: string }, i: number) => {
    assert.equal(r.canonical_name, items[i].canonical_name, 'Cross-language input must preserve exact code points');
    assert.equal(items[i].normalized_name, r.fold, JSON.stringify(items[i]));
    assert.equal(r.valid, true, JSON.stringify(items[i]));
  });
});

test('FE-18 unsupported name alphabets fail explicitly instead of guessing casefold', () => {
  for (const name of ['\u13a0', '\u{1c89}', 'A\u200dB', '\ud800']) {
    assert.throws(() => normalizeEntityName(name), /unsupported|hỗ trợ/i);
  }
});

test('FE-18 bounded alphabet is experimentally checked against Python validator', () => {
  const ranges = [[0x20, 0x7e], [0xa0, 0x24f], [0x300, 0x3ff], [0x530, 0x58f], [0x1e00, 0x1eff], [0xfb00, 0xfb17]];
  const items = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => {
    const char = String.fromCodePoint(a + i);
    if (/\p{Cf}/u.test(char)) return [];
    const canonical_name = `A${char} A`;
    return [{ canonical_name, normalized_name: normalizeEntityName(canonical_name) }];
  }).flat());
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', python], {
    cwd: fileURLToPath(new URL('../../ai-service/', import.meta.url)), input: JSON.stringify(items), encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.results.length, items.length);
  data.results.forEach((r: { canonical_name: string; valid: boolean; fold: string }, i: number) => {
    assert.equal(r.canonical_name, items[i].canonical_name);
    assert.equal(r.fold, items[i].normalized_name, `Code point vector ${i}`);
    assert.equal(r.valid, true, `Code point vector ${i}`);
  });
  console.log('FE18_BOUNDED_ALPHABET ' + JSON.stringify({ vectors: items.length, python: data.python, unicode: data.unicode }));
});
