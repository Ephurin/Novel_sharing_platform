import { apiClient, ApiClientError, type ApiEnvelope } from '../../shared/api/api-client';

export type UUID = string;
export type EntityType = 'PER' | 'LOC' | 'ORG' | 'ITEM' | 'SKILL';

export interface KnownEntity {
  entity_id: UUID;
  name: string;
  entity_type: EntityType;
}

export interface Candidate {
  candidate_id: string;
  surface: string;
  start: number;
  end: number;
  context_start?: number;
  context_end?: number;
  context: string;
  origins?: string[];
}

export interface Decision {
  candidate_id: string;
  verdict: 'entity' | 'not_entity' | 'unresolved';
  entity_type: EntityType | null;
  canonical_name: string;
  canonical_entity_id: UUID | '';
  provisional_identity_key: string;
  identity_quote: string;
  initial_status: 'Alive' | 'Dead' | 'Unknown';
  status_quote: string;
  confidence: number;
  reason: string;
}

export interface FrozenEntity {
  entity_id: UUID;
  canonical_entity_id: UUID | '';
  provisional_identity_key?: string;
  phrase: string;
  entity: string;
  candidate_ids: string[];
  occurrences: {
    candidate_id: string;
    start: number;
    end: number;
    quote: string;
    revision_id: UUID;
    text_hash: string;
  }[];
}

export interface EntityReview {
  review_schema_version: 1;
  analysis_run_id: UUID;
  chapter_id?: UUID;
  revision_id: UUID;
  source_hash: string;
  status: 'waiting_entity_review' | 'entities_reviewed' | 'completed';
  brain_version: number;
  registry_brain_version: number;
  review_version: number;
  guidance_version: number;
  provisional_identity_scope: string;
  candidates: Candidate[];
  decisions: Decision[];
  reviewed_decisions: Decision[];
  pending_candidate_ids: string[];
  known_entities: KnownEntity[];
  entities: FrozenEntity[];
  review_error?: string;
}

export interface ReviewRequest {
  expected_version: number;
  decisions: Decision[];
  finalize: boolean;
}

export interface GuidanceEntry {
  name: string;
  kind: string;
  entity_type?: string | null;
  aliases?: string[];
  notes?: string;
}

export interface GuidanceData {
  version: number;
  entries: GuidanceEntry[];
  chapter_review_enabled: boolean;
}

export interface Evidence {
  revision_id: UUID;
  chapter_id: UUID;
  text_hash: string;
  start: number;
  end: number;
  quote: string;
  chapter_number?: number;
}

export interface EntityProfileFields {
  description: string;
  appearance: string;
  personality: string;
  background: string;
}

export interface EntityProfile {
  entity_id: UUID;
  novel_id: UUID;
  version: number;
  brain_version: number;
  profile: EntityProfileFields;
  effective_from_chapter: number | null;
  author_notes: string;
}

type ProfileVersions = { expected_version: number; expected_brain_version: number };
type CanonicalProfileChanges = {
  [Key in keyof EntityProfileFields]: Pick<EntityProfileFields, Key> & Partial<EntityProfileFields>
}[keyof EntityProfileFields];
export type EntityProfilePatch = ProfileVersions & (
  (CanonicalProfileChanges & { effective_from_chapter: number; author_notes?: string }) |
  { author_notes: string; effective_from_chapter?: never; description?: never;
    appearance?: never; personality?: never; background?: never }
);

export interface MemoryEntity {
  entity_id: UUID;
  name: string;
  entity_type: string;
  status: string;
  location: string;
  /** "last_event": the place was taken from the latest approved event (live retest 3, N8). */
  location_source?: 'last_event';
  location_chapter?: number;
  mentions?: number;
  is_locked?: boolean;
  /** Removed from memory by the author; kept only so events that still name it can be flagged. */
  is_retired?: boolean;
  approved_profile?: Partial<EntityProfileFields> & { effective_from_chapter?: number };
}

// Live retest 4: setup creates "character"/"location" while extraction creates "PER"/"LOC" (Q2), and the
// status was shown raw in English, e.g. "Alive" (Q1).
const ENTITY_KIND: Record<string, string> = { PER: 'PER', PERSON: 'PER', CHARACTER: 'PER', LOC: 'LOC', LOCATION: 'LOC',
  PLACE: 'LOC', ORG: 'ORG', ORGANIZATION: 'ORG', ITEM: 'ITEM', OBJECT: 'ITEM', SKILL: 'SKILL' };
export function entityKind(type: string | null | undefined): string {
  const key = String(type ?? '').trim().toUpperCase();
  return ENTITY_KIND[key] ?? key;
}

const STATUS_LABEL: Record<string, string> = { alive: 'Còn sống', dead: 'Đã chết', deceased: 'Đã chết', unknown: 'Chưa rõ',
  injured: 'Bị thương', wounded: 'Bị thương', unconscious: 'Bất tỉnh', missing: 'Mất tích', captured: 'Bị bắt', imprisoned: 'Bị giam',
  active: 'Đang hoạt động', destroyed: 'Đã bị phá hủy', lost: 'Đã mất' };
export function entityStatusLabel(status: string | null | undefined): string {
  const raw = String(status ?? '').trim();
  return STATUS_LABEL[raw.toLowerCase()] ?? (raw || 'Chưa rõ');
}

export type ChapterAnalysisStatus = { chapter_id: string; chapter_number: number; status: string | null;
  retry_count: number; waiting_reason?: 'provider_unavailable' | null };

// Live retest 6 (T2): a provider outage left analysis "FAILED" with no hint of what to do.
export function chapterAnalysisMessage(e: ChapterAnalysisStatus): string {
  const status = (e.status ?? '').toUpperCase();
  if (e.waiting_reason === 'provider_unavailable') {
    return status === 'FAILED'
      ? 'Dịch vụ AI không phản hồi quá lâu nên phân tích đã dừng. Khi AI hoạt động lại, bấm “Phân tích lại chương đang mở”.'
      : 'Dịch vụ AI tạm thời không phản hồi. Phân tích sẽ tự chạy lại khi AI hoạt động trở lại; bạn không cần làm gì.';
  }
  if (status === 'FAILED') return `Trích xuất thất bại sau ${e.retry_count ?? 0} lần thử. Bấm “Phân tích lại chương đang mở” để thử lại.`;
  return `Đang xử lý trích xuất · đã thử lại ${e.retry_count ?? 0} lần`;
}

export function entityPlaceLabel(e: Pick<MemoryEntity, 'location' | 'location_source' | 'location_chapter'>): string {
  const place = (e.location ?? '').trim();
  if (!place || ['unknown', 'không rõ', 'chưa rõ'].includes(place.toLocaleLowerCase('vi'))) return 'Chưa rõ vị trí';
  return e.location_source === 'last_event' ? `${place} (xuất hiện gần nhất, chương ${e.location_chapter})` : place;
}

export interface MemoryEvent {
  event_id: UUID;
  event_type: string;
  participants: string[];
  summary: string;
  chapter: number;
  metadata: {
    evidence?: Evidence[];
    supersedes_id?: UUID;
    is_retired?: boolean;
    [key: string]: unknown;
  };
}

export interface MemoryFact {
  fact_id?: UUID;
  subject_entity_id?: UUID | null;
  fact_key: string;
  fact_value: unknown;
  is_locked?: boolean;
  source_revision_id?: UUID | null;
  [key: string]: unknown;
}

export interface Transition {
  transition_id?: UUID;
  entity_id: UUID;
  event_id?: UUID | null;
  fact_id?: UUID | null;
  attribute_key: string;
  new_value: unknown;
}

export interface Relationship {
  subject: string;
  object: string;
  relation: string;
  source: string;
  locked: boolean;
  metadata?: {
    subject_entity_id?: UUID;
    object_entity_id?: UUID;
    transition_id?: UUID;
    event_id?: UUID | null;
    fact_id?: UUID | null;
    [key: string]: unknown;
  };
}

export interface ApprovedMemory {
  schema_version?: 1;
  story_id?: UUID;
  brain_id?: UUID | null;
  brain_version: number;
  status?: string;
  entities: MemoryEntity[];
  aliases?: { alias_id: UUID; entity_id: UUID; alias: string; normalized_alias: string }[];
  mentions?: {
    mention_id: UUID;
    entity_id: UUID;
    revision_id: UUID;
    chapter_id: UUID;
    surface_text: string;
    source_start: number;
    source_end: number;
    source_text_hash: string;
    extractor_version: string | null;
  }[];
  events: MemoryEvent[];
  facts: MemoryFact[];
  relations?: Relationship[];
  transitions: Transition[];
  current_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provenance?: {
    proposal_id: UUID;
    proposal_type: string;
    analysis_run_id: UUID | null;
    source_type: string;
    evidence: Evidence[];
  }[];
}

export interface GroupApproval {
  proposal_ids: UUID[];
  expected_brain_version: number;
  reason?: string;
  edited_payloads?: Record<UUID, Record<string, unknown>>;
}

export interface RelationshipLock {
  subject_entity_id: UUID;
  object_entity_id: UUID;
  relation_type: string;
  expected_brain_version: number;
}

export interface EventCorrection {
  expected_brain_version: number;
  replacement: {
    event_type: string;
    summary: string;
    participants: UUID[];
    chapter?: number | null;
  };
  transitions: {
    entity_id: UUID;
    attribute_key: string;
    new_value: unknown;
  }[];
}

export interface FutureEvent {
  title: string;
  description: string;
  target_chapter: number;
  min_words: number;
  ending: boolean;
}

export interface AuthorPlan {
  plan_id: string;
  autonomy_blocked?: string | null;
  objectives: {
    objective_id: string;
    title: string;
    description: string;
    target_chapter: number;
    status: string;
    objective_type: string;
    metadata: { min_words?: number; is_terminal?: boolean };
  }[];
}

export interface AutoRun {
  run_id: string;
  status: string;
  stop_reason: string | null;
  current_iteration: number;
}

export interface ConsistencyFinding {
  code?: 'AMBIGUOUS_ENTITY_REFERENCE' | 'WORLD_RULE_VIOLATION' | 'CANON_FACT_CONFLICT' | string;
  entity_id?: UUID;
  candidate_entity_ids?: UUID[];
  description: string;
  evidence: string;
  revision_id: string;
}

// ──────────────────────────────────────────────
// Approved Decision Constructors
// ──────────────────────────────────────────────

export function newIdentity(review: EntityReview, machine: Decision, humanGroupLabel: string): Decision {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(humanGroupLabel)) {
    throw new Error('Invalid human group label');
  }
  return {
    ...machine,
    verdict: 'entity',
    canonical_entity_id: '',
    provisional_identity_key: `${review.provisional_identity_scope}/${humanGroupLabel}`
  };
}

export function knownIdentity(machine: Decision, explicitlySelected: KnownEntity): Decision {
  return {
    ...machine,
    verdict: 'entity',
    canonical_entity_id: explicitlySelected.entity_id,
    canonical_name: explicitlySelected.name,
    entity_type: explicitlySelected.entity_type,
    provisional_identity_key: ''
  };
}

/** Stable ASCII author-group label for a machine-suggested new identity (same name → same group). */
export function groupLabelFor(name: string): string {
  const normalized = name.normalize('NFC').toLocaleLowerCase('vi');
  let hash = 0x811c9dc5;
  for (const ch of normalized) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ten';
  return `${ascii}_${hash.toString(16).padStart(8, '0')}`;
}

/**
 * F-LIVE-14: accept the machine's suggestions in one step. Links to known entities stay linked, new
 * identities are grouped by their suggested name, "not entity" verdicts are rejected. Candidates the
 * machine left unresolved, and any candidate the author already decided, are untouched.
 */
export function acceptMachineSuggestions(review: EntityReview, machine: Decision[], existing: Record<string, Decision>): Record<string, Decision> {
  const updates: Record<string, Decision> = {};
  for (const d of machine) {
    if (existing[d.candidate_id]) continue;
    if (d.verdict === 'not_entity') updates[d.candidate_id] = rejectOccurrence(d);
    else if (d.verdict === 'entity' && d.entity_type) {
      updates[d.candidate_id] = d.canonical_entity_id
        ? { ...d, provisional_identity_key: '' }
        : newIdentity(review, d, groupLabelFor(d.canonical_name));
    }
  }
  // One identity carries one life status; if its occurrences disagree, leave it Unknown for the author.
  const statuses = new Map<string, Set<string>>();
  for (const d of Object.values(updates)) {
    if (d.verdict !== 'entity') continue;
    const key = d.canonical_entity_id || d.provisional_identity_key;
    statuses.set(key, (statuses.get(key) ?? new Set()).add(d.initial_status));
  }
  for (const [id, d] of Object.entries(updates)) {
    const key = d.canonical_entity_id || d.provisional_identity_key;
    if (d.verdict === 'entity' && (statuses.get(key)?.size ?? 0) > 1)
      updates[id] = { ...d, initial_status: 'Unknown', status_quote: '' };
  }
  return updates;
}

/** Short names that may be the same person as a longer name ("Mai" / "Mai Linh"); shown as hints, never merged. */
export function shortNameHints(newNames: string[], otherNames: string[] = [], limit = 8): Array<[string, string]> {
  const tokens = (n: string) => n.normalize('NFC').toLocaleLowerCase('vi').split(/\s+/).filter(Boolean);
  const pool = Array.from(new Set([...newNames, ...otherNames]));
  const hints: Array<[string, string]> = [];
  for (const short of Array.from(new Set(newNames))) {
    const a = tokens(short);
    for (const long of pool) {
      const b = tokens(long);
      if (b.length <= a.length) continue;
      const prefix = a.every((t, i) => b[i] === t);
      const suffix = a.every((t, i) => b[b.length - a.length + i] === t);
      if ((prefix || suffix) && !hints.some(([s, l]) => s === short && l === long)) hints.push([short, long]);
      if (hints.length >= limit) return hints;
    }
  }
  return hints;
}

export function rejectOccurrence(machine: Decision): Decision {
  return {
    ...machine,
    verdict: 'not_entity',
    canonical_name: '',
    canonical_entity_id: '',
    provisional_identity_key: '',
    entity_type: null,
    identity_quote: '',
    initial_status: 'Unknown',
    status_quote: '',
    reason: 'Author rejected this occurrence'
  };
}

// ──────────────────────────────────────────────
// Entity Name Normalization (Python Unicode Casefold Alignment)
// ──────────────────────────────────────────────

const CASEFOLD_MAP: Record<string, string> = {
  '\u00b5': '\u03bc',
  '\u017f': 's',
  '\u0345': '\u03b9',
  '\u0390': '\u03b9\u0308\u0301',
  '\u03b0': '\u03c5\u0308\u0301',
  '\u03d0': '\u03b2',
  '\u03d1': '\u03b8',
  '\u03d5': '\u03c6',
  '\u03d6': '\u03c0',
  '\u03f0': '\u03ba',
  '\u03f1': '\u03c1',
  '\u03f5': '\u03b5',
  '\u1e97': 't\u0308',
  '\u1e98': 'w\u030a',
  '\u1e99': 'y\u030a',
  // German sharp S
  '\u00df': 'ss', // ß
  '\u1e9e': 'ss', // ẞ
  // Greek sigmas (fold to non-final lowercase sigma σ U+03C3)
  '\u03a3': '\u03c3', // Σ
  '\u03c2': '\u03c3', // ς
  // Latin ligatures
  '\ufb00': 'ff', // ﬀ
  '\ufb01': 'fi', // ﬁ
  '\ufb02': 'fl', // ﬂ
  '\ufb03': 'ffi', // ﬃ
  '\ufb04': 'ffl', // ﬄ
  '\ufb05': 'st', // ﬅ
  '\ufb06': 'st', // ﬆ
  // Armenian ligatures
  '\u0587': '\u0565\u0582', // և
  '\ufb13': '\u0574\u0576', // ﬓ
  '\ufb14': '\u0574\u0565', // ﬔ
  '\ufb15': '\u0574\u056b', // ﬕ
  '\ufb16': '\u057e\u0576', // ﬖ
  '\ufb17': '\u0574\u056d', // ﬗ
  // Specific case fold expansions
  '\u0149': '\u02bcn', // ŉ -> ʼn
  '\u01f0': 'j\u030c', // ǰ -> ǰ
  '\u0130': 'i\u0307', // İ -> i̇
  '\u1e9a': 'a\u02be', // ẚ
  '\u1e9b': '\u1e61', // ẛ
  '\u1e96': 'h\u0331' // ẖ
};

/**
 * Exact submitted spelling, including NFC/NFD and whitespace, is preserved.
 * Bounded alphabet: printable ASCII, Latin U+00A0–024F/U+1E00–1EFF,
 * combining/Greek U+0300–03FF, Armenian U+0530–058F and ligatures FB00–FB17.
 * Format controls and other alphabets fail explicitly. No universal Unicode claim.
 * Cross-language tests execute Python validate_author_edit for this alphabet.
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';
  if (/[^\t\n\r\u0020-\u007e\u00a0-\u024f\u0300-\u03ff\u0530-\u058f\u1e00-\u1eff\ufb00-\ufb17]/u.test(name)
      || /\p{Cf}/u.test(name)) {
    throw new Error('Unsupported entity-name characters: ký tự chưa được hỗ trợ khi đổi tên.');
  }
  return Array.from(name, char => CASEFOLD_MAP[char] ?? char.toLowerCase()).join('');
}

export function entityNameEditError(name: string): string | undefined {
  if (!name.trim()) return 'Tên thực thể không được để trống hoặc chỉ chứa khoảng trắng';
  try { normalizeEntityName(name); } catch (error) {
    return error instanceof Error ? error.message : 'Tên thực thể chưa được hỗ trợ';
  }
}

// ──────────────────────────────────────────────
// HTTP Client Helpers
// ──────────────────────────────────────────────

export async function memoryGet<T>(path: string): Promise<T> {
  return (await apiClient.get<ApiEnvelope<T>>(path)).data.data;
}

export async function memoryPost<T>(path: string, body: unknown): Promise<T> {
  return (await apiClient.post<ApiEnvelope<T>>(path, body)).data.data;
}

export const getApprovedMemory = (novelId: string) =>
  memoryGet<ApprovedMemory>(`/ai/story-brains/${novelId}/memory`);

/** Private readback: never place this DTO in the approved-memory query cache. */
export async function getEntityProfile(novelId: string, entityId: string): Promise<EntityProfile> {
  const data = await memoryGet<EntityProfile>(`/ai/story-brains/${encodeURIComponent(novelId)}/entities/${encodeURIComponent(entityId)}/profile`);
  if (data.entity_id !== entityId || data.novel_id !== novelId) {
    throw new ApiClientError({ status: 502, code: 'PROFILE_SCOPE_INVALID', message: 'Không xác nhận được phạm vi hồ sơ.' });
  }
  if (!Number.isInteger(data.version) || data.version < 0 || !Number.isInteger(data.brain_version) || data.brain_version < 1 ||
      typeof data.author_notes !== 'string' || !data.profile ||
      ['description', 'appearance', 'personality', 'background'].some(key => typeof data.profile[key as keyof EntityProfileFields] !== 'string')) {
    throw new ApiClientError({ status: 502, code: 'PROFILE_RESPONSE_INVALID', message: 'Không đọc được hồ sơ hợp lệ từ máy chủ.' });
  }
  return data;
}

export async function updateEntityProfile(
  novelId: string, entityId: string, patch: EntityProfilePatch, idempotencyKey: string
): Promise<EntityProfile> {
  const allowed = new Set(['expected_version', 'expected_brain_version', 'description', 'appearance',
    'personality', 'background', 'author_notes', 'effective_from_chapter']);
  const canonical = ['description', 'appearance', 'personality', 'background'].some(key => key in patch);
  const valuesInvalid = Object.entries(patch).some(([key, value]) =>
    ['description', 'appearance', 'personality', 'background', 'author_notes'].includes(key) &&
    (typeof value !== 'string' || Array.from(value).length > (key === 'author_notes' ? 8000 : 4000) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)));
  if (valuesInvalid || (!canonical && !('author_notes' in patch)) ||
      (canonical ? (!Number.isInteger(patch.effective_from_chapter) || patch.effective_from_chapter! < 1 || patch.effective_from_chapter! > 1000000) : ('effective_from_chapter' in patch)) ||
      Object.keys(patch).some(key => !allowed.has(key)) ||
      Object.values(patch).some(value => value === null || value === undefined) ||
      !Number.isInteger(patch.expected_version) || patch.expected_version < 0 ||
      !Number.isInteger(patch.expected_brain_version) || patch.expected_brain_version < 1 ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey)) {
    throw new ApiClientError({ status: 422, code: 'INVALID_PROFILE_REQUEST', message: 'Yêu cầu hồ sơ không hợp lệ.' });
  }
  return (await apiClient.patch<ApiEnvelope<EntityProfile>>(
    `/ai/story-brains/${encodeURIComponent(novelId)}/entities/${encodeURIComponent(entityId)}/profile`, patch,
    { headers: { 'Idempotency-Key': idempotencyKey } }
  )).data.data;
}

export async function getEntityReviews(novelId: string): Promise<EntityReview[]> {
  return memoryGet<EntityReview[]>(`/ai/story-brains/${novelId}/entity-reviews`);
}

export async function getEntityCandidateAudit(novelId: string, runId: string): Promise<EntityReview> {
  return memoryGet<EntityReview>(`/ai/story-brains/${novelId}/entity-candidate-audits/${runId}`);
}

export async function getEntityGuidance(novelId: string): Promise<GuidanceData> {
  return memoryGet<GuidanceData>(`/ai/story-brains/${novelId}/entity-guidance`);
}

export async function saveEntityGuidance(novelId: string, data: { expected_version: number; entries: GuidanceEntry[] }): Promise<{ version: number; entries: GuidanceEntry[] }> {
  return memoryPost<{ version: number; entries: GuidanceEntry[] }>(`/ai/story-brains/${novelId}/entity-guidance`, data);
}

export async function saveEntityReview(novelId: string, runId: string, request: ReviewRequest): Promise<EntityReview> {
  return memoryPost<EntityReview>(`/ai/story-brains/${novelId}/entity-reviews/${runId}/review`, request);
}

export async function refreshEntityReview(novelId: string, runId: string, expectedVersion: number): Promise<EntityReview> {
  return memoryPost<EntityReview>(`/ai/story-brains/${novelId}/entity-reviews/${runId}/refresh`, { expected_version: expectedVersion });
}

export async function continueEntityReview(novelId: string, runId: string): Promise<{ analysis_run_id: string; status: string; proposal_count: number; deduplicated: boolean; dropped_events?: number }> {
  return memoryPost<{ analysis_run_id: string; status: string; proposal_count: number; deduplicated: boolean; dropped_events?: number }>(`/ai/story-brains/${novelId}/entity-reviews/${runId}/continue`, {});
}

export async function correctMemoryEvent(novelId: string, eventId: string, correction: EventCorrection): Promise<unknown> {
  return memoryPost(`/ai/story-brains/${novelId}/events/${eventId}/corrections`, correction);
}

/** Demo walkthrough 2026-11-18: remove a wrong entity from memory (history and events are kept). */
export async function retireMemoryEntity(novelId: string, entityId: string, expectedBrainVersion: number, reason?: string) {
  return memoryPost<{ entity_id: string; brain_version: number; status: 'retired' }>(
    `/ai/story-brains/${novelId}/entities/${entityId}/retire`,
    { expected_brain_version: expectedBrainVersion, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
}

/** Demo walkthrough 2026-11-18: replace a fact's value, or remove the fact; the old one stays in history. */
export async function correctMemoryFact(novelId: string, factId: string, expectedBrainVersion: number,
  change: { fact_value: string } | { retire: true }) {
  return memoryPost<{ fact_id: string; brain_version: number; status: 'corrected' | 'removed' }>(
    `/ai/story-brains/${novelId}/facts/${factId}/corrections`, { expected_brain_version: expectedBrainVersion, ...change });
}

/** Entities the author has not removed: what lists and pickers offer. */
export const activeEntities = <T extends { is_retired?: boolean }>(entities: T[]) => entities.filter(e => !e.is_retired);

export async function lockRelationship(novelId: string, payload: RelationshipLock): Promise<{ status: string; relation: string; locked: boolean; brain_version: number; subject_entity_id: string; object_entity_id: string }> {
  return memoryPost(`/ai/story-brains/${novelId}/relationship-locks`, payload);
}

export async function acceptProposalGroupAtomic(groupId: string, payload: GroupApproval): Promise<{ canonical_artifact_ids: UUID[]; brain_version: number; status: string }> {
  return memoryPost(`/ai/proposal-groups/${groupId}/accept`, payload);
}

export interface RejectGroupPayload {
  expected_brain_version: number;
  reason?: string;
}

export interface RejectGroupResult {
  group_id: string;
  proposal_ids: string[];
  status: 'rejected';
  brain_version: number;
}

export async function rejectProposalGroupAtomic(
  groupId: string,
  payload: RejectGroupPayload
): Promise<RejectGroupResult> {
  return memoryPost<RejectGroupResult>(`/ai/proposal-groups/${groupId}/reject`, payload);
}

export async function reanalyseSavedChapter(novelId: string, revisionId: string) {
  return (await apiClient.post(`/ai/story-brains/${novelId}/reanalyse`,
    { revision_id: revisionId }, { headers: { 'Idempotency-Key': crypto.randomUUID() } })).data;
}

export const runAuthorOperation = <T,>(novelId: string, body: unknown) =>
  memoryPost<T>(`/ai/story-brains/${novelId}/author-operation`, body);

export async function saveFuturePlan(novelId: string, events: FutureEvent[], direction: string) {
  const plan = await memoryPost<AuthorPlan>('/ai/story-plans', {
    novel_id: novelId,
    source_outline: direction,
    objectives: events.map((e, i) => ({
      order_index: i + 1,
      title: e.title,
      description: e.description,
      target_chapter: e.target_chapter,
      objective_type: e.ending ? 'ending' : 'chapter_goal',
      metadata: { min_words: e.min_words, is_terminal: e.ending }
    }))
  });
  return memoryPost<AuthorPlan>(`/ai/story-plans/${plan.plan_id}/activate?novel_id=${novelId}`, {});
}
