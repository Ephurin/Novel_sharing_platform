import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateTime, formatNumber } from '../src/shared/lib/format-vi.ts';

test('Vietnamese absolute dates use a four-digit year and the Vietnam calendar day', () => {
  assert.equal(formatDateTime('2026-11-25T17:05:59Z'), '00:05 26/11/2026');
  assert.equal(formatDateTime(''), '—');
  assert.equal(formatDateTime(new Date('invalid')), '—');
});

test('relative times reflect elapsed and upcoming dates', () => {
  const now = Date.parse('2026-11-26T02:49:00Z');
  assert.equal(formatDateTime('2026-11-26T02:46:02Z', 'relative', now), '2 phút trước');
  assert.equal(formatDateTime('2026-11-26T02:48:02Z', 'relative', now), 'Vừa xong');
  assert.match(formatDateTime('2026-11-26T04:49:00Z', 'relative', now), /^sau 2 giờ(?: nữa)?$/);
  assert.equal(formatDateTime(undefined, 'relative', now), '—');
});

test('counts use Vietnamese digit grouping', () => {
  assert.equal(formatNumber(1480), '1.480');
  assert.equal(formatNumber(10000), '10.000');
});
