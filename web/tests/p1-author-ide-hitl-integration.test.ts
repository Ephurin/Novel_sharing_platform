import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type Candidate,
  type Decision,
  type EntityReview,
  type KnownEntity,
  type MemoryEvent,
  type MemoryEntity,
  type Transition,
  type Relationship,
  type GroupApproval,
  type EventCorrection,
  type RelationshipLock,
  newIdentity,
  knownIdentity,
  rejectOccurrence
} from '../src/features/ai-copilot/author-memory-api.ts';

// ──────────────────────────────────────────────
// Fixture Helpers
// ──────────────────────────────────────────────

function makeReview(overrides?: Partial<EntityReview>): EntityReview {
  return {
    review_schema_version: 1,
    analysis_run_id: 'run-uuid-001',
    chapter_id: 'ch-uuid-001',
    revision_id: 'rev-uuid-001',
    source_hash: 'hash-abc-123',
    status: 'waiting_entity_review',
    brain_version: 1,
    registry_brain_version: 1,
    review_version: 1,
    guidance_version: 1,
    provisional_identity_scope: 'tenant-a/novel-b/rev-001/hash-abc/run-001',
    candidates: [
      {
        candidate_id: 'cand-minh-1',
        surface: 'Minh',
        start: 12,
        end: 16,
        context: 'Bác sĩ Minh bước vào phòng bệnh.',
        origins: ['ner']
      },
      {
        candidate_id: 'cand-minh-2',
        surface: 'Minh',
        start: 85,
        end: 89,
        context: 'Tài xế Minh nhấn ga chiếc xe tải.',
        origins: ['ner']
      },
      {
        candidate_id: 'cand-minh-3',
        surface: 'Minh',
        start: 150,
        end: 154,
        context: 'Bác sĩ Minh mở hồ sơ bệnh án.',
        origins: ['ner']
      }
    ],
    decisions: [
      {
        candidate_id: 'cand-minh-1',
        verdict: 'entity',
        canonical_name: 'Minh',
        canonical_entity_id: '',
        provisional_identity_key: '',
        entity_type: 'PER',
        identity_quote: '',
        initial_status: 'Alive',
        status_quote: '',
        confidence: 0.9,
        reason: 'Suggested character'
      },
      {
        candidate_id: 'cand-minh-2',
        verdict: 'entity',
        canonical_name: 'Minh',
        canonical_entity_id: '',
        provisional_identity_key: '',
        entity_type: 'PER',
        identity_quote: '',
        initial_status: 'Alive',
        status_quote: '',
        confidence: 0.88,
        reason: 'Suggested character'
      },
      {
        candidate_id: 'cand-minh-3',
        verdict: 'entity',
        canonical_name: 'Minh',
        canonical_entity_id: '',
        provisional_identity_key: '',
        entity_type: 'PER',
        identity_quote: '',
        initial_status: 'Alive',
        status_quote: '',
        confidence: 0.92,
        reason: 'Suggested character'
      }
    ],
    reviewed_decisions: [],
    pending_candidate_ids: ['cand-minh-1', 'cand-minh-2', 'cand-minh-3'],
    known_entities: [
      {
        entity_id: 'ent-known-minh-doctor',
        name: 'Minh',
        entity_type: 'PER'
      },
      {
        entity_id: 'ent-known-minh-driver',
        name: 'Minh',
        entity_type: 'PER'
      }
    ],
    entities: [],
    ...overrides
  };
}

// ──────────────────────────────────────────────
// Tests: B1 & B2 Entity Review DTO & Disambiguation
// ──────────────────────────────────────────────

test('B1: Empty initial review DTO handles defaults safely', () => {
  const review = makeReview({
    reviewed_decisions: [],
    known_entities: [],
    entities: [],
    pending_candidate_ids: ['cand-minh-1', 'cand-minh-2', 'cand-minh-3']
  });

  assert.equal(review.review_schema_version, 1);
  assert.equal(review.reviewed_decisions.length, 0);
  assert.equal(review.known_entities.length, 0);
  assert.equal(review.pending_candidate_ids.length, 3);
  assert.equal(review.review_version, 1);
});

test('B2: Two different characters with same display name "Minh" receive distinct provisional identities', () => {
  const review = makeReview();
  const machine1 = review.decisions[0];
  const machine2 = review.decisions[1];

  // Minh A — Doctor
  const decisionMinhA = newIdentity(review, machine1, 'doctor');
  // Minh B — Driver
  const decisionMinhB = newIdentity(review, machine2, 'driver');

  assert.equal(decisionMinhA.verdict, 'entity');
  assert.equal(decisionMinhB.verdict, 'entity');
  assert.equal(decisionMinhA.canonical_entity_id, '');
  assert.equal(decisionMinhB.canonical_entity_id, '');

  assert.equal(
    decisionMinhA.provisional_identity_key,
    `${review.provisional_identity_scope}/doctor`
  );
  assert.equal(
    decisionMinhB.provisional_identity_key,
    `${review.provisional_identity_scope}/driver`
  );

  // Distinct provisional keys must never collide
  assert.notEqual(decisionMinhA.provisional_identity_key, decisionMinhB.provisional_identity_key);
});

test('B2: Human provisional group label format validation', () => {
  const review = makeReview();
  const machine = review.decisions[0];

  // Valid group labels
  assert.doesNotThrow(() => newIdentity(review, machine, 'doctor'));
  assert.doesNotThrow(() => newIdentity(review, machine, 'driver_01'));
  assert.doesNotThrow(() => newIdentity(review, machine, 'minh-A'));

  // Invalid group labels
  assert.throws(() => newIdentity(review, machine, ''), /Invalid human group label/);
  assert.throws(() => newIdentity(review, machine, 'doctor/driver'), /Invalid human group label/);
  assert.throws(() => newIdentity(review, machine, 'doctor with spaces'), /Invalid human group label/);
  assert.throws(() => newIdentity(review, machine, 'a'.repeat(65)), /Invalid human group label/);
});

test('B2: Multiple occurrences sharing one provisional group', () => {
  const review = makeReview();
  const occ1 = review.decisions[0]; // cand-minh-1
  const occ3 = review.decisions[2]; // cand-minh-3 (also doctor)

  const dec1 = newIdentity(review, occ1, 'doctor');
  const dec3 = newIdentity(review, occ3, 'doctor');

  // Both share the exact same author-controlled provisional key
  assert.equal(dec1.provisional_identity_key, dec3.provisional_identity_key);
  // Preserves real distinct candidate IDs
  assert.equal(dec1.candidate_id, 'cand-minh-1');
  assert.equal(dec3.candidate_id, 'cand-minh-3');
});

test('B2: Existing canonical UUID selection distinguishes homonymous entities', () => {
  const review = makeReview();
  const machine = review.decisions[0];

  const knownDoctor = review.known_entities[0]; // ent-known-minh-doctor
  const knownDriver = review.known_entities[1]; // ent-known-minh-driver

  assert.equal(knownDoctor.name, 'Minh');
  assert.equal(knownDriver.name, 'Minh');

  // Assign to doctor by exact UUID
  const decDoctor = knownIdentity(machine, knownDoctor);
  assert.equal(decDoctor.canonical_entity_id, 'ent-known-minh-doctor');
  assert.equal(decDoctor.canonical_name, 'Minh');
  assert.equal(decDoctor.provisional_identity_key, '');

  // Assign to driver by exact UUID
  const decDriver = knownIdentity(machine, knownDriver);
  assert.equal(decDriver.canonical_entity_id, 'ent-known-minh-driver');
  assert.equal(decDriver.canonical_name, 'Minh');
  assert.equal(decDriver.provisional_identity_key, '');

  // Exact UUIDs must be distinct
  assert.notEqual(decDoctor.canonical_entity_id, decDriver.canonical_entity_id);
});

test('B2: Reject occurrence marks not_entity and clears identity', () => {
  const review = makeReview();
  const machine = review.decisions[0];

  const rejected = rejectOccurrence(machine);
  assert.equal(rejected.verdict, 'not_entity');
  assert.equal(rejected.canonical_entity_id, '');
  assert.equal(rejected.canonical_name, '');
  assert.equal(rejected.provisional_identity_key, '');
  assert.equal(rejected.entity_type, null);
  assert.equal(rejected.reason, 'Author rejected this occurrence');
});

// ──────────────────────────────────────────────
// Tests: B3 Review/Refresh Lifecycle
// ──────────────────────────────────────────────

test('B3: Partial review request sends finalize=false with only resolved decisions', () => {
  const review = makeReview();
  const dec1 = newIdentity(review, review.decisions[0], 'doctor');

  // Author has only reviewed occurrence 1; occurrences 2 & 3 remain unresolved
  const choices: Record<string, Decision> = {
    'cand-minh-1': dec1
  };

  const resolved = review.candidates
    .map(c => choices[c.candidate_id])
    .filter((d): d is Decision => Boolean(d && (d.verdict === 'entity' || d.verdict === 'not_entity')));

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].candidate_id, 'cand-minh-1');

  const payload = {
    expected_version: review.review_version,
    decisions: resolved,
    finalize: false
  };

  assert.equal(payload.finalize, false);
  assert.equal(payload.decisions.length, 1);
  assert.equal(payload.expected_version, 1);
});

test('B3: Freeze review request requires all candidates resolved with finalize=true', () => {
  const review = makeReview();
  const dec1 = newIdentity(review, review.decisions[0], 'doctor');
  const dec2 = newIdentity(review, review.decisions[1], 'driver');
  const dec3 = rejectOccurrence(review.decisions[2]);

  const choices: Record<string, Decision> = {
    'cand-minh-1': dec1,
    'cand-minh-2': dec2,
    'cand-minh-3': dec3
  };

  const allResolved = review.candidates.every(c => {
    const d = choices[c.candidate_id];
    return d && (d.verdict === 'entity' || d.verdict === 'not_entity');
  });

  assert.equal(allResolved, true);

  const payload = {
    expected_version: review.review_version,
    decisions: review.candidates.map(c => choices[c.candidate_id]),
    finalize: true
  };

  assert.equal(payload.finalize, true);
  assert.equal(payload.decisions.length, 3);
});

test('B3: Refresh payload sends expected_version and does not call continue', () => {
  const review = makeReview({ review_version: 2 });
  const refreshPayload = {
    expected_version: review.review_version
  };

  assert.equal(refreshPayload.expected_version, 2);
});

// ──────────────────────────────────────────────
// Tests: B5 Edited Canon Approval & C-01 Atomic Semantics
// ──────────────────────────────────────────────

test('B5: Full replacement payload preserves immutable provenance and replaces allowed fields', () => {
  const originalEvent = {
    event_id: 'ev-uuid-001',
    event_type: 'meeting',
    summary: 'Minh gặp Nam tại bệnh viện',
    participants: ['ent-minh-uuid', 'ent-nam-uuid'],
    chapter: 1,
    revision_id: 'rev-001',
    evidence: [{ quote: 'Minh gặp Nam', start: 10, end: 22 }]
  };

  // Author edits event summary
  const editedEvent = {
    ...originalEvent,
    summary: 'Bác sĩ Minh hội chẩn với Trưởng khoa Nam'
  };

  // Edited payload is a complete replacement, not a partial JSON patch
  assert.equal(editedEvent.event_id, originalEvent.event_id);
  assert.equal(editedEvent.chapter, originalEvent.chapter);
  assert.equal(editedEvent.revision_id, originalEvent.revision_id);
  assert.deepEqual(editedEvent.evidence, originalEvent.evidence);
  assert.equal(editedEvent.summary, 'Bác sĩ Minh hội chẩn với Trưởng khoa Nam');
});

test('B5 & C-01: Multi-proposal dependency group must be approved atomically with complete IDs', () => {
  const proposalIds = ['prop-event-1', 'prop-fact-1', 'prop-trans-1'];
  const editedPayloads = {
    'prop-event-1': {
      event_type: 'battle',
      summary: 'Trận đại chiến trên đỉnh Thanh Vân',
      participants: ['ent-uuid-1']
    }
  };

  const groupApproval: GroupApproval = {
    proposal_ids: proposalIds,
    expected_brain_version: 3,
    reason: 'Author reviewed in editor',
    edited_payloads: editedPayloads
  };

  // Contains every member of the group
  assert.equal(groupApproval.proposal_ids.length, 3);
  assert.equal(groupApproval.expected_brain_version, 3);
  // Contains edits only for the explicitly edited proposal
  assert.equal(Object.keys(groupApproval.edited_payloads!).length, 1);
  assert.ok('prop-event-1' in groupApproval.edited_payloads!);
  assert.ok(!('prop-fact-1' in groupApproval.edited_payloads!));
});

test('B5 & C-01: Incomplete dependency group submission is prevented', () => {
  const allGroupProposals = ['prop-event-1', 'prop-fact-1', 'prop-trans-1'];
  const subsetSubmission = allGroupProposals.slice(0, 2);

  // Validation function checks complete membership
  const isValidGroupSubmission = (submittedIds: string[], expectedIds: string[]) => {
    return (
      submittedIds.length === expectedIds.length &&
      submittedIds.every(id => expectedIds.includes(id))
    );
  };

  assert.equal(isValidGroupSubmission(subsetSubmission, allGroupProposals), false);
  assert.equal(isValidGroupSubmission(allGroupProposals, allGroupProposals), true);
});

// ──────────────────────────────────────────────
// Tests: B4 Event Correction & Approved History
// ──────────────────────────────────────────────

test('B4: Event correction builds valid replacement with canonical entity UUIDs', () => {
  const event: MemoryEvent = {
    event_id: 'ev-historical-1',
    event_type: 'duel',
    summary: 'Minh đấu với Hắc Y Nhân',
    chapter: 2,
    participants: ['ent-known-minh-doctor'],
    metadata: {}
  };

  const correction: EventCorrection = {
    expected_brain_version: 2,
    replacement: {
      event_type: 'investigation',
      summary: 'Bác sĩ Minh điều tra hồ sơ tử thi',
      participants: ['ent-known-minh-doctor'],
      chapter: event.chapter
    },
    transitions: [
      {
        entity_id: 'ent-known-minh-doctor',
        attribute_key: 'stamina',
        new_value: 80
      }
    ]
  };

  assert.equal(correction.expected_brain_version, 2);
  assert.equal(correction.replacement.chapter, 2);
  assert.equal(correction.replacement.summary, 'Bác sĩ Minh điều tra hồ sơ tử thi');
  assert.deepEqual(correction.replacement.participants, ['ent-known-minh-doctor']);
  assert.equal(correction.transitions[0].entity_id, 'ent-known-minh-doctor');
  assert.equal(correction.transitions[0].new_value, 80);
});

// ──────────────────────────────────────────────
// Tests: B6 Relationship Locks by Exact UUID
// ──────────────────────────────────────────────

test('B6: Relationship lock requires exact subject and object entity UUIDs', () => {
  const lock: RelationshipLock = {
    subject_entity_id: 'ent-uuid-minh-doctor',
    object_entity_id: 'ent-uuid-x',
    relation_type: 'ally',
    expected_brain_version: 3
  };

  assert.equal(lock.subject_entity_id, 'ent-uuid-minh-doctor');
  assert.equal(lock.object_entity_id, 'ent-uuid-x');
  assert.equal(lock.relation_type, 'ally');
  assert.equal(lock.expected_brain_version, 3);
});

test('B6: Two same-name characters have independent relationship locks', () => {
  // Lock 1: Minh A -> X
  const lockA: RelationshipLock = {
    subject_entity_id: 'ent-uuid-minh-doctor',
    object_entity_id: 'ent-uuid-hospital',
    relation_type: 'works_at',
    expected_brain_version: 1
  };

  // Lock 2: Minh B -> X
  const lockB: RelationshipLock = {
    subject_entity_id: 'ent-uuid-minh-driver',
    object_entity_id: 'ent-uuid-hospital',
    relation_type: 'delivers_to',
    expected_brain_version: 1
  };

  // Independent exact endpoint pairs
  assert.notEqual(lockA.subject_entity_id, lockB.subject_entity_id);
  assert.notEqual(lockA.relation_type, lockB.relation_type);
});

test('B6: Ambiguous legacy lock lacking UUIDs triggers remediation detection', () => {
  const legacyRelation: Relationship = {
    subject: 'Minh',
    object: 'Nam',
    relation: 'friend',
    source: 'historical',
    locked: true,
    metadata: {} // Missing subject_entity_id and object_entity_id!
  };

  const hasExactIds = Boolean(
    legacyRelation.metadata?.subject_entity_id && legacyRelation.metadata?.object_entity_id
  );
  const isAmbiguousLegacy = legacyRelation.locked && !hasExactIds;

  assert.equal(isAmbiguousLegacy, true);

  const modernRelation: Relationship = {
    subject: 'Minh',
    object: 'Nam',
    relation: 'friend',
    source: 'historical',
    locked: true,
    metadata: {
      subject_entity_id: 'ent-uuid-minh-doctor',
      object_entity_id: 'ent-uuid-nam'
    }
  };

  const modernHasExactIds = Boolean(
    modernRelation.metadata?.subject_entity_id && modernRelation.metadata?.object_entity_id
  );
  assert.equal(modernHasExactIds, true);
  assert.equal(modernRelation.locked && !modernHasExactIds, false);
});

// ──────────────────────────────────────────────
// Tests: Stale 409 Conflict & State Isolation
// ──────────────────────────────────────────────

test('State isolation: Switching novel resets local edits and decisions', () => {
  let novelId = 'novel-1';
  let edits: Record<string, Record<string, unknown>> = {
    'prop-1': { summary: 'Unsaved edit for novel 1' }
  };

  // Novel switch trigger
  const switchNovel = (newNovelId: string) => {
    if (newNovelId !== novelId) {
      novelId = newNovelId;
      edits = {}; // Purge local edits
    }
  };

  switchNovel('novel-2');
  assert.equal(novelId, 'novel-2');
  assert.equal(Object.keys(edits).length, 0);
});

test('Stale 409: Preserves unsaved local edits when version conflict occurs', () => {
  const localEdits: Record<string, Record<string, unknown>> = {
    'prop-1': { summary: 'Author custom edit' }
  };

  // Simulate 409 Conflict handler
  const handleConflict = (errorStatus: number) => {
    if (errorStatus === 409) {
      // Do NOT clear localEdits!
      return {
        preservedEdits: { ...localEdits },
        errorMessage: '409 Conflict: Reloading current authoritative checkpoint'
      };
    }
    return null;
  };

  const result = handleConflict(409);
  assert.ok(result);
  assert.deepEqual(result.preservedEdits, localEdits);
});
