// Minor findings from the P2 live tests (2026-11-15): author-facing text instead of raw values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readingTimeLabel } from '../src/features/author-ide/studio-tools';
import { proposalKindLabel } from '../src/features/manuscript-import/manuscript-import-api';
import { ApiClientError, getApiErrorMessage } from '../src/shared/api/api-client';

test('F-A-08: reading time never looks negative and is honest for short chapters', () => {
  assert.equal(readingTimeLabel(0), 'chưa có chữ');
  assert.equal(readingTimeLabel(60), 'dưới 1 phút');
  assert.equal(readingTimeLabel(160), 'dưới 1 phút');
  assert.equal(readingTimeLabel(350), 'khoảng 1 phút');
  assert.equal(readingTimeLabel(2000), 'khoảng 6 phút');
  for (const words of [0, 60, 160, 2000]) assert.doesNotMatch(readingTimeLabel(words), /[-~]/);
});

test('Q-4: proposal kinds are named in Vietnamese, world rules included', () => {
  assert.equal(proposalKindLabel({ proposal_type: 'fact', payload: { fact_type: 'world_rule' } }), 'Quy tắc thế giới');
  assert.equal(proposalKindLabel({ proposal_type: 'fact', payload: {} }), 'Dữ kiện');
  assert.equal(proposalKindLabel({ proposal_type: 'entity', payload: {} }), 'Thực thể mới');
  assert.equal(proposalKindLabel({ proposal_type: 'mystery', payload: {} }), 'Mystery');
});

test('F-A-11: an inactive world setup is explained instead of showing M0_NOT_ACTIVE 409', () => {
  const message = getApiErrorMessage(new ApiClientError({ code: 'M0_NOT_ACTIVE', message: 'AI Service returned status 409', status: 409 }));
  assert.doesNotMatch(message, /M0_NOT_ACTIVE|409/);
  assert.match(message, /kích hoạt thiết lập/);
});
