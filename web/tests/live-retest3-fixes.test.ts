import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalGroupBlock, type ReviewProposal } from '../src/features/manuscript-import/manuscript-import-api';
import { fullAutoBlockReason } from '../src/features/ai-copilot/full-auto-gate';
import { publishCopy, publishedToast } from '../src/features/author-ide/publish-copy';
import { ApiClientError, getApiErrorMessage } from '../src/shared/api/api-client';

const p = (id: string, extra: Partial<ReviewProposal> = {}): ReviewProposal => ({
  proposal_id: id, proposal_type: 'event', dependency_group_id: 'g', payload: {}, confidence: 1,
  review_priority: 0, review_reason: '', ...extra
});

test('P2: stale or repeated groups are blocked with a Vietnamese reason', () => {
  assert.deepEqual(proposalGroupBlock([p('a'), p('b')]), { stale: false, duplicates: [], repeats: [], blocked: false, notice: null });
  const stale = proposalGroupBlock([p('a', { stale: true }), p('b')]);
  assert.equal(stale.blocked, true);
  assert.match(stale.notice!, /không thể duyệt nữa/);
  const repeated = proposalGroupBlock([p('a', { duplicate_of_event: { event_id: 'e', chapter: 1, summary: 's' } }), p('b')]);
  assert.equal(repeated.blocked, true);
  assert.match(repeated.notice!, /1\/2 đề xuất lặp lại sự kiện đã duyệt ở chương 1/);
});

test('P2: version conflicts and Vietnamese projection errors are readable', () => {
  const conflict = new ApiClientError({ message: 'AI Service returned status 409', status: 409, code: 'BRAIN_VERSION_CONFLICT' });
  assert.doesNotMatch(getApiErrorMessage(conflict), /status 409/);
  assert.match(getApiErrorMessage(conflict), /Bộ nhớ truyện đã thay đổi/);
  const dup = new ApiClientError({ message: 'Sự kiện này đã có trong bộ nhớ (chương 1: "x"). Hãy từ chối đề xuất trùng.', status: 422, code: 'INVALID_PROJECTION' });
  assert.equal(getApiErrorMessage(dup), dup.message);
});

test('P3: Full auto needs active memory and a system plan, not a manuscript baseline', () => {
  assert.equal(fullAutoBlockReason({ brainStatus: 'active', plan: { plan_id: 'p', autonomy_blocked: null } }), null);
  assert.match(fullAutoBlockReason({ brainStatus: 'draft', plan: { plan_id: 'p' } })!, /kích hoạt bộ nhớ/);
  assert.match(fullAutoBlockReason({ brainStatus: 'active', plan: null })!, /chưa có dàn ý đang dùng/);
  assert.match(fullAutoBlockReason({ brainStatus: 'active', plan: { plan_id: 'p', autonomy_blocked: 'MANUAL_PLAN_AUTONOMY_NOT_AVAILABLE' } })!,
    /do bạn soạn hoặc sửa/);
});

test('P4/P5: the publish dialog says what happens and warns when readers cannot see the chapter', () => {
  assert.equal(publishCopy('PUBLISHED').confirm, 'Xuất bản chương');
  assert.equal(publishCopy('PUBLISHED').readerNotice, null);
  assert.match(publishCopy('DRAFT').readerNotice!, /bản nháp, nên độc giả chưa đọc được/);
  assert.match(publishedToast(false, 'DRAFT'), /sau khi truyện được công khai/);
  assert.match(publishedToast(true, 'PUBLISHED'), /chờ kiểm duyệt/);
});

test('N8: a place taken from the latest event says so', async () => {
  const { entityPlaceLabel } = await import('../src/features/ai-copilot/author-memory-api');
  assert.equal(entityPlaceLabel({ location: 'Unknown' }), 'Chưa rõ vị trí');
  assert.equal(entityPlaceLabel({ location: 'Kinh thành' }), 'Kinh thành');
  assert.equal(entityPlaceLabel({ location: 'Thạch Khê', location_source: 'last_event', location_chapter: 2 }),
    'Thạch Khê (xuất hiện gần nhất, chương 2)');
});

test('Q1/Q2: statuses read in Vietnamese and setup/extraction types compare as one kind', async () => {
  const { entityKind, entityStatusLabel } = await import('../src/features/ai-copilot/author-memory-api');
  assert.equal(entityStatusLabel('Alive'), 'Còn sống');
  assert.equal(entityStatusLabel('dead'), 'Đã chết');
  assert.equal(entityStatusLabel(''), 'Chưa rõ');
  assert.equal(entityStatusLabel('Trọng thương'), 'Trọng thương');
  assert.equal(entityKind('location'), entityKind('LOC'));
  assert.equal(entityKind('character'), 'PER');
  assert.notEqual(entityKind('LOC'), entityKind('PER'));
});

test('T2: a provider outage tells the author analysis resumes by itself, or how to restart it', async () => {
  const { chapterAnalysisMessage } = await import('../src/features/ai-copilot/author-memory-api');
  const base = { chapter_id: 'c', chapter_number: 9, retry_count: 0 };
  assert.match(chapterAnalysisMessage({ ...base, status: 'PENDING', waiting_reason: 'provider_unavailable' }), /tự chạy lại/);
  assert.match(chapterAnalysisMessage({ ...base, status: 'FAILED', waiting_reason: 'provider_unavailable' }), /Phân tích lại chương đang mở/);
  assert.match(chapterAnalysisMessage({ ...base, status: 'FAILED', retry_count: 5 }), /sau 5 lần thử/);
  assert.match(chapterAnalysisMessage({ ...base, status: 'PENDING', retry_count: 1 }), /Đang xử lý/);
});

test('U2: a provider outage on a synchronous request reads in Vietnamese', () => {
  const err = new ApiClientError({ message: 'PROVIDER_UNAVAILABLE retry_after=60', status: 502, code: 'AI_SERVICE_502' });
  assert.match(getApiErrorMessage(err), /Dịch vụ AI tạm thời không phản hồi/);
  assert.doesNotMatch(getApiErrorMessage(err), /AI_SERVICE_502/);
});

test('live retest 10 (X2): a possible repeat warns without blocking the group', () => {
  const block = proposalGroupBlock([p('a', { possible_repeat_of_event: { event_id: 'e', chapter: 9, summary: 's', overlap: 0.39 } }), p('b')]);
  assert.equal(block.blocked, false);
  assert.equal(block.repeats.length, 1);
  assert.match(block.notice ?? '', /chương 9/);
});
