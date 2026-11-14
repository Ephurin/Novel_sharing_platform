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
