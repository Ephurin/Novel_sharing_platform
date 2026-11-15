import test from 'node:test';
import assert from 'node:assert/strict';
import { jobErrorLabel, jobStageLabel, jobStatusLabel, nextChapterBlockedMessage } from '../src/features/manuscript-import/manuscript-import-api';

test('bootstrap job status and stage are shown in Vietnamese', () => {
  assert.equal(jobStatusLabel('waiting_entity_review'), 'Chờ bạn duyệt chương');
  assert.equal(jobStatusLabel('failed'), 'Gặp lỗi');
  assert.equal(jobStageLabel('chapter_review'), 'duyệt chương');
  assert.equal(jobStageLabel('unknown_stage'), 'unknown_stage');
});

test('failed job errors are author-facing and point to the retry button', () => {
  assert.match(jobErrorLabel('BUDGET_GUARD_DENIED'), /Thử lại từ chương còn dở/);
  assert.match(jobErrorLabel('BUDGET_GUARD_DENIED RPM_LIMIT_EXCEEDED retry_after=12'), /giới hạn tần suất/);
  assert.equal(jobErrorLabel('Entity checkpoint source changed'), 'Entity checkpoint source changed');
});

test('a resume refused because the chapter is not settled explains what to do', () => {
  assert.match(nextChapterBlockedMessage({ code: 'BOOTSTRAP_CHAPTER_REVIEW_PENDING' }) ?? '', /chưa duyệt xong/);
  assert.equal(nextChapterBlockedMessage({ code: 'OTHER' }), null);
});

import { describeProposal, proposalKind, summarizeProposalGroup } from '../src/features/manuscript-import/manuscript-import-api';

test('proposal groups are summarised in Vietnamese instead of raw payloads', () => {
  const ps = [
    { proposal_type: 'entity', payload: { canonical_name: 'Duy', entity_type: 'PER' } },
    { proposal_type: 'alias', payload: { alias: 'Ông Hòa', entity_name: 'Hòa' } },
    { proposal_type: 'fact', payload: { fact_type: 'world_rule', fact_value: 'Mưa không tạnh trước nửa đêm.' } },
    { proposal_type: 'fact', payload: { fact_type: 'narrative_fact', fact_key: 'limit', fact_value: 3 } },
    { proposal_type: 'event', payload: { summary: 'Linh về bến.' } }
  ];
  assert.equal(proposalKind(ps[2]), 'world_rule');
  assert.equal(describeProposal(ps[0]), 'nhân vật mới: Duy');
  assert.equal(describeProposal(ps[1]), 'Tên gọi khác: “Ông Hòa” → Hòa');
  assert.equal(describeProposal(ps[2]), 'Quy tắc thế giới: Mưa không tạnh trước nửa đêm.');
  assert.equal(describeProposal(ps[3]), 'Dữ kiện: limit = 3');
  assert.equal(summarizeProposalGroup(ps), '5 đề xuất: 1 thực thể mới, 1 tên gọi khác, 1 quy tắc thế giới, 1 dữ kiện, 1 sự kiện');
});
