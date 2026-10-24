import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

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

export interface MemoryEntity {
  entity_id: UUID;
  name: string;
  entity_type: string;
  status: string;
  location: string;
  mentions?: number;
  is_locked?: boolean;
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

const CASEFOLD_REGEX = new RegExp(Object.keys(CASEFOLD_MAP).join('|'), 'g');

/**
 * Normalizes an entity name by trimming, collapsing runs of whitespace to a single space,
 * normalizing to Unicode NFC, and applying standard Unicode full casefold expansions
 * (including German ß/ẞ -> ss, Greek sigmas Σ/ς -> σ, Latin ligatures ﬁ/ﬂ/ﬀ/ﬃ/ﬄ -> fi/fl/ff/ffi/ffl)
 * followed by lowercase conversion.
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';
  const collapsed = name.trim().replace(/\s+/g, ' ').normalize('NFC');
  return collapsed
    .replace(CASEFOLD_REGEX, match => CASEFOLD_MAP[match] ?? match)
    .toLowerCase();
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

export async function continueEntityReview(novelId: string, runId: string): Promise<{ analysis_run_id: string; status: string; proposal_count: number; deduplicated: boolean }> {
  return memoryPost<{ analysis_run_id: string; status: string; proposal_count: number; deduplicated: boolean }>(`/ai/story-brains/${novelId}/entity-reviews/${runId}/continue`, {});
}

export async function correctMemoryEvent(novelId: string, eventId: string, correction: EventCorrection): Promise<unknown> {
  return memoryPost(`/ai/story-brains/${novelId}/events/${eventId}/corrections`, correction);
}

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
