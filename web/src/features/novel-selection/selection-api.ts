import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export const selectionLabels = {
  PENDING: 'Chờ xét', NEEDS_INFO: 'Cần bổ sung', SELECTED: 'Được tuyển chọn',
  RECHECK: 'Chờ xét lại', REJECTED: 'Từ chối', REVOKED: 'Đã thu hồi'
};
export const decisionLabels = {
  APPROVE: 'Công nhận', REQUEST_INFO: 'Yêu cầu bổ sung', REJECT: 'Từ chối',
  CONFIRM_MINOR_CHANGE: 'Xác nhận chỉnh sửa nhỏ', REOPEN: 'Mở xét lại', REVOKE: 'Thu hồi công nhận'
};
export const criteriaLabels = {
  content: 'Chất lượng và cấu trúc', readability: 'Trình bày và dễ đọc',
  consistency: 'Tính nhất quán', completeness: 'Độ hoàn chỉnh của phần công khai'
};

export type Criteria = Record<keyof typeof criteriaLabels, boolean>;
export type Decision = keyof typeof decisionLabels;
type Eligibility = 'STANDARD' | 'SHORT_STORY' | null;
export type SelectionCase = {
  case_id: string; novel_id: string; status: keyof typeof selectionLabels; version: number;
  needs_comparison: boolean; last_reason: string | null; author_notes: string | null;
};
type Chapter = { chapterId: string; number: number; title: string; hash: string; revisionId: string | null };
type Snapshot = { title: string; synopsis: string; chapters: Chapter[] };
type SelectionDetail = SelectionCase & {
  title: string; eligibility: Eligibility; allowedDecisions: Decision[];
  nominations: { nominator_id: string; kind: string; reason: string }[];
  current: Snapshot; baseline: Snapshot | null;
};
type Comparison = { title: string; content: string | null } | null;
type Page<T> = { items: T[]; hasMore: boolean };
type Nomination = { nomination_id: string; novel_id: string; reason: string; title: string; status: SelectionCase['status'] };

export async function nominateNovel(novelId: string, reason: string, key: string) {
  return (await apiClient.post<ApiEnvelope<{ caseId: string }>>(`/novels/${novelId}/nominations`, { reason }, {
    headers: { 'Idempotency-Key': key }
  })).data.data;
}

export async function ownNominations(page: number) {
  return (await apiClient.get<ApiEnvelope<Page<Nomination>>>('/account/nominations', { params: { page } })).data.data;
}

export async function getAuthorSelection(novelId: string) {
  return (await apiClient.get<ApiEnvelope<{ item: SelectionCase | null; eligibility: Eligibility }>>(`/author/novels/${novelId}/selection`)).data.data;
}

export async function supplementSelection(item: SelectionCase, notes: string) {
  return (await apiClient.post(`/novels/${item.novel_id}/selections/${item.case_id}/supplement`, { notes, expectedVersion: item.version })).data.data;
}

export async function getSelectionQueue(page: number, view: 'queue' | 'selected') {
  return (await apiClient.get<ApiEnvelope<Page<SelectionCase & { title: string }>>>('/moderator/selections', { params: { page, view } })).data.data;
}

export async function getSelectionDetail(caseId: string) {
  return (await apiClient.get<ApiEnvelope<SelectionDetail>>(`/moderator/selections/${caseId}`)).data.data;
}

export async function getSelectionChapter(caseId: string, chapterId: string) {
  return (await apiClient.get<ApiEnvelope<{ baseline: Comparison; current: Comparison }>>(`/moderator/selections/${caseId}/chapters/${chapterId}`)).data.data;
}

export async function decideSelection(item: SelectionCase, decision: Decision, reason: string, criteria: Criteria, shortStoryVerified: boolean) {
  return (await apiClient.post(`/moderator/selections/${item.case_id}/decisions`, {
    decision, reason, criteria, shortStoryVerified, expectedVersion: item.version
  })).data.data;
}
