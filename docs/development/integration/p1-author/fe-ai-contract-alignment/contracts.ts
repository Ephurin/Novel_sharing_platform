// FE integration contract; no production React implementation or synthetic UI.
export type UUID = string;
export type EntityType = 'PER' | 'LOC' | 'ORG' | 'ITEM' | 'SKILL';
export interface Envelope<T> { data: T }
export interface KnownEntity { entity_id: UUID; name: string; entity_type: EntityType }
export interface Candidate {
  candidate_id: string; surface: string; start: number; end: number;
  context_start: number; context_end: number; context: string; origins: string[];
}
export interface Decision {
  candidate_id: string; verdict: 'entity' | 'not_entity' | 'unresolved';
  entity_type: EntityType | null; canonical_name: string; canonical_entity_id: UUID | '';
  provisional_identity_key: string; identity_quote: string;
  initial_status: 'Alive' | 'Dead' | 'Unknown'; status_quote: string;
  confidence: number; reason: string;
}
export interface FrozenEntity {
  entity_id: UUID; canonical_entity_id: UUID | ''; provisional_identity_key?: string;
  phrase: string; entity: string; candidate_ids: string[];
  occurrences: { candidate_id: string; start: number; end: number; quote: string;
    revision_id: UUID; text_hash: string }[];
}
export interface EntityReview {
  review_schema_version: 1; analysis_run_id: UUID; revision_id: UUID; source_hash: string;
  status: 'waiting_entity_review' | 'entities_reviewed' | 'completed';
  brain_version: number; registry_brain_version: number;
  review_version: number; guidance_version: number; provisional_identity_scope: string;
  candidates: Candidate[]; decisions: Decision[]; reviewed_decisions: Decision[];
  pending_candidate_ids: string[]; known_entities: KnownEntity[]; entities: FrozenEntity[];
}
export interface ReviewRequest { expected_version: number; decisions: Decision[]; finalize: boolean }
export interface Evidence {
  revision_id: UUID; chapter_id: UUID; text_hash: string; start: number; end: number;
  quote: string; chapter_number?: number;
}
export interface MemoryEvent {
  event_id: UUID; event_type: string; participants: string[]; summary: string; chapter: number;
  metadata: { evidence?: Evidence[]; supersedes_id?: UUID; is_retired?: boolean; [key: string]: unknown };
}
export interface MemoryFact {
  fact_id: UUID; subject_entity_id: UUID | null; fact_key: string; fact_value: unknown;
  is_locked: boolean; source_revision_id: UUID | null; [key: string]: unknown;
}
export interface Transition {
  transition_id: UUID; entity_id: UUID; event_id: UUID | null; fact_id: UUID | null;
  attribute_key: string; new_value: unknown;
}
export interface Relationship {
  subject: string; object: string; relation: string; source: string; locked: boolean;
  metadata: { subject_entity_id?: UUID; object_entity_id?: UUID; transition_id?: UUID;
    event_id?: UUID | null; fact_id?: UUID | null; [key: string]: unknown };
}
export interface ApprovedMemory {
  schema_version: 1; story_id: UUID; brain_id: UUID | null; brain_version: number;
  entities: { entity_id: UUID; name: string; entity_type: string; status: string;
    location: string; mentions: number; is_locked: boolean }[];
  aliases: { alias_id: UUID; entity_id: UUID; alias: string; normalized_alias: string }[];
  mentions: { mention_id: UUID; entity_id: UUID; revision_id: UUID; chapter_id: UUID;
    surface_text: string; source_start: number; source_end: number; source_text_hash: string;
    extractor_version: string | null }[];
  events: MemoryEvent[]; facts: MemoryFact[]; relations: Relationship[]; transitions: Transition[];
  current_state: Record<string, unknown>; metadata: Record<string, unknown>;
  provenance: { proposal_id: UUID; proposal_type: string; analysis_run_id: UUID | null;
    source_type: string; evidence: Evidence[] }[];
}
export interface GroupApproval {
  proposal_ids: UUID[]; expected_brain_version: number; reason?: string;
  edited_payloads?: Record<UUID, Record<string, unknown>>;
}
export interface RelationshipLock {
  subject_entity_id: UUID; object_entity_id: UUID; relation_type: string; expected_brain_version: number;
}
export interface EventCorrection {
  expected_brain_version: number;
  replacement: { event_type: string; summary: string; participants: UUID[]; chapter?: number | null };
  transitions: { entity_id: UUID; attribute_key: string; new_value: unknown }[];
}

// Executable request constructors: use actual server checkpoint IDs, never guessed IDs.
// These functions apply only after an explicit human choice in the UI.
export function newIdentity(review: EntityReview, machine: Decision, humanGroupLabel: string): Decision {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(humanGroupLabel)) throw new Error('Invalid human group label');
  return { ...machine, verdict: 'entity', canonical_entity_id: '',
    provisional_identity_key: `${review.provisional_identity_scope}/${humanGroupLabel}` };
}
export function knownIdentity(machine: Decision, explicitlySelected: KnownEntity): Decision {
  return { ...machine, verdict: 'entity', canonical_entity_id: explicitlySelected.entity_id,
    canonical_name: explicitlySelected.name, entity_type: explicitlySelected.entity_type,
    provisional_identity_key: '' };
}
export function rejectOccurrence(machine: Decision): Decision {
  return { ...machine, verdict: 'not_entity', canonical_name: '', canonical_entity_id: '',
    provisional_identity_key: '', entity_type: null, identity_quote: '', initial_status: 'Unknown',
    status_quote: '', reason: 'Author rejected this occurrence' };
}
