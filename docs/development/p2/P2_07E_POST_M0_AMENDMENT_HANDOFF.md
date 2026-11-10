# P2-07E / UX-05 — Author-approved World Setup rule amendment (post-M0, backend)

- **Issue:** #123 (`[P2-07E][Gemini 4 Argon][P1] Post-M0 author-approved World Setup amendment backend`)
- **Parent:** #114 (`[P2-07][P1] Amendment-safe Setup & Planning Authority before UX-05`)
- **Prerequisite:** PR #121 merged into `integration/p2-planning-studio` (`02b4e563b12d8482378ad3f1c1811be4bfd064bf`)
- **Branch:** `gemini/p2-07e-post-m0-world-rule-amendment`
- **Base:** `integration/p2-planning-studio`

---

## 0. Contract Freeze & Architecture Decisions

### 1. Scope & Invariants
- **Target Fact Family:** Globally scoped author-owned World Setup `world_rule` records materialized during `setup-v1` review and verified under active `setup-m0-v1` baseline.
- **Out of Scope (Fail Closed):**
  - Unrelated P1 facts (`character_trait`, chapter-scoped facts, revision-bound facts).
  - Pre-M0 unreviewed or unactivated setup rules.
  - Adding new rules or new entities.
  - Toggling or modifying `is_locked` (lock status is immutable; successor inherits parent lock).
  - Direct mutation of historical `FactRecord` rows (append-only successor only).
  - Fabricating chapters, revisions, events, or outbox records.

### 2. Durable Amendment Receipt Strategy
We reuse the existing transactional tables `narrative.analysis_runs`, `narrative.proposals`, and `narrative.proposal_decisions`.
- `narrative.analysis_runs`:
  - `operation = 'setup_amendment'`
  - `pipeline_version = 'setup-rule-amendment-v1'`
  - `idempotency_key = 'amendment:propose:{novel_id}:{idempotency_key}'`
- `narrative.proposals`:
  - `proposal_type = 'world_rule_amendment'`
  - `status = 'pending'` (until decision)
  - `payload`: Contains `contract_version`, `parent_fact_id`, `root_fact_id`, `fact_key`, `replacement_text`, `is_locked`, `private_author_notes`.
  - `evidence`: Contains M0 snapshot ID, setup hash, author ID, timestamp.
- `narrative.proposal_decisions`:
  - `decision = 'accept'` or `'reject'` (satisfies `ck_proposal_decision_value`).
  - `edited_payload`: An immutable, database-verified decision receipt containing:
    ```json
    {
      "contract_version": "setup-rule-amendment-v1",
      "decision_type": "amendment_decision",
      "decision": "accept",
      "proposal_id": "<uuid>",
      "parent_fact_id": "<uuid>",
      "successor_fact_id": "<uuid>",
      "root_fact_id": "<uuid>",
      "fact_key": "<key>",
      "fact_value": "<replacement_text>",
      "is_locked": true/false,
      "actor_id": "<author_uuid>",
      "tenant_id": "<tenant_uuid>",
      "novel_id": "<novel_uuid>",
      "story_brain_id": "<brain_uuid>",
      "expected_brain_version": 2,
      "resulting_brain_version": 3,
      "setup_snapshot_id": "<m0_job_uuid>",
      "setup_hash": "<hash>",
      "artifact_ids": ["<successor_uuid>"],
      "decided_at": "<iso_timestamp>",
      "idempotency_key": "<key>",
      "request_hash": "<hash>"
    }
    ```

### 3. Integration with `resolve_effective_facts` (P2-07D)
- In P2-07D, `resolve_effective_facts` failed closed (`WORLD_RULE_SUCCESSOR_UNVERIFIED`) because no decision receipt existed.
- In P2-07E, the repository loads verified amendment edges `(parent_id, successor_id)` exclusively from accepted `narrative.proposal_decisions` where `decision == 'accept'`, `contract_version == 'setup-rule-amendment-v1'`, and `successor_id in artifact_ids`.
- `resolve_effective_facts` accepts a World Setup successor edge **if and only if** `(parent_id, successor_id)` is in the repository's verified edges set.
- Any unaudited, directly inserted, or unverified confirmed successor continues to raise `WORLD_RULE_SUCCESSOR_UNVERIFIED` and blocks AI provider dispatch with 0 calls.

### 4. Transaction Lock Order (Atomic Acceptance)
1. Lock `StoryBrainRecord` with `SELECT ... FOR UPDATE`.
2. Verify author novel ownership with `novels` row check.
3. Verify active M0 status from `bootstrap_jobs`.
4. Validate parent `FactRecord` (must be confirmed, not retired, and the current effective head).
5. Lock `ProposalRecord` with `SELECT ... FOR UPDATE`.
6. Verify CAS (`expected_brain_version == brain.brain_version`).
7. Check idempotency: same key + same hash -> return existing receipt; same key + different hash -> 409 conflict.
8. If reject:
   - Mark proposal `rejected`.
   - Insert `ProposalDecisionRecord(decision='reject')`.
   - No fact created, no brain bump.
9. If accept:
   - Insert successor `FactRecord` with `supersedes_id = parent.id`, same `fact_key`, same `is_locked`, `fact_value = replacement_text`.
   - Insert `ProposalDecisionRecord(decision='accept', artifact_ids=[successor.id])`.
   - Mark proposal `accepted`.
   - Increment `brain.brain_version += 1`.
   - Commit transaction atomically.

### 5. Versioned DTOs & Typed Error Codes
- **Propose:**
  - Route: `POST /v1/story-brains/{novel_id}/world-rules/{fact_id}/amendments`
  - DTO: `SetupRuleAmendmentProposalRequest`
  - Response: `SetupRuleAmendmentProposalResponse`
- **Decide:**
  - Route: `POST /v1/story-brains/{novel_id}/world-rule-amendments/{proposal_id}/decision`
  - DTO: `SetupRuleAmendmentDecisionRequest`
  - Response: `SetupRuleAmendmentDecisionResponse`
- **History / Readback:**
  - Route: `GET /v1/story-brains/{novel_id}/world-rules/{fact_id}/amendments`
  - Response: `SetupRuleAmendmentHistoryResponse`
- **Gateway Endpoints:**
  - `POST /api/v1/ai/story-brains/:novelId/world-rules/:factId/amendments`
  - `POST /api/v1/ai/story-brains/:novelId/world-rule-amendments/:proposalId/decision`
  - `GET /api/v1/ai/story-brains/:novelId/world-rules/:factId/amendments`

**Typed Error Codes:**
- `AMENDMENT_TARGET_INELIGIBLE` (422 / 404)
- `AMENDMENT_PROPOSAL_NOT_FOUND` (404)
- `AMENDMENT_LOCK_IMMUTABLE` (422)
- `AMENDMENT_VERSION_CONFLICT` (409)
- `AMENDMENT_IDEMPOTENCY_CONFLICT` (409)
- `AMENDMENT_PENDING_EXISTS` (409)
- `AMENDMENT_PROPOSAL_ALREADY_DECIDED` (409)
- `AMENDMENT_PARENT_CONFLICT` (409)
- `M0_NOT_ACTIVE` / `M0_PROVENANCE_INVALID` (409)
- `SETUP_IDENTITY_REQUIRED` (401)
- `SETUP_IDENTITY_MISMATCH` / `TENANT_SCOPE_MISMATCH` (403)

---

## 6. Implementation & Test Verification Evidence

### 1. Commit & Branch Information
- **Commit:** `295b9e69a37a3ce22890ca22b51e4e3f97dedae0`
- **Branch:** `gemini/p2-07e-post-m0-world-rule-amendment`
- **Base:** `integration/p2-planning-studio` (`02b4e563b12d8482378ad3f1c1811be4bfd064bf`)

### 2. Test Execution Results (Local Environment with Disposable PostgreSQL)
- **`tests/test_setup_amendment_postgres.py`**: **18/18 PASSED** in 6.36s
  1. `test_amendment_proposal_contract_and_cas_guard`: PASSED
  2. `test_amendment_idempotency_and_pending_guard`: PASSED
  3. `test_amendment_decision_accept_atomic_lineage_and_snapshots`: PASSED
  4. `test_amendment_decision_reject_preserves_parent_rule`: PASSED
  5. `test_amendment_full_lifecycle_accept_flow`: PASSED
  6. `test_amendment_tenant_author_boundary`: PASSED
  7. `test_amendment_locked_rule_strictly_preserves_lock`: PASSED
  8. `test_amendment_history_audit_trail`: PASSED
  9. `test_unaudited_lookalike_successor_remains_strictly_blocked`: PASSED
  10. `test_concurrent_double_accept_race`: PASSED (Concurrency: 2 threads racing to accept, lock order ensures exactly 1 winner, 1 conflict, 1 successor, 1 decision)
  11. `test_transaction_atomic_rollback_on_failure`: PASSED (Failure injection: verifies atomic rollback of successor fact, proposal status, decision record, and brain version)
  12. `test_m0_provenance_rejects_non_setup_root`: PASSED (F-01: non-setup-origin root rejected with 422 AMENDMENT_TARGET_INELIGIBLE)
  13. `test_forged_decision_receipt_fails_closed`: PASSED (F-01: forged decision with intruder actor / tampered payload rejected by _load_verified_amendment_edges, fails closed in resolver)
  14. `test_unaudited_ancestor_chain_fails_closed`: PASSED (F-01: proposing amendment atop an unaudited ancestor fails closed with AMENDMENT_PARENT_CONFLICT)
  15. `test_propose_idempotency_after_brain_bump_and_accept`: PASSED (F-02: retrying propose with identical request after brain version bump and accept returns original proposal receipt with original brain version)
  16. `test_propose_changed_private_notes_conflict`: PASSED (F-02: fingerprint includes private_author_notes; changing notes on same key yields 409 conflict)
  17. `test_decide_changed_reason_conflict`: PASSED (F-02: fingerprint includes reason; changing reason on same key yields 409 conflict)
  18. `test_history_isolation_same_fact_key_different_roots`: PASSED (F-03: two independent roots sharing same fact_key have zero cross-chain leakage in history)
- **`tests/test_world_rule_effective_head_postgres.py`**: **35/35 PASSED** in 11.87s (Zero regressions on P2-07D resolver and P1 fact isolation)
- **`tests/test_state_projection.py`**: **67/67 PASSED** in 3.09s
- **`tests/test_setup_activation_postgres.py` + `test_setup_review_postgres.py` + `test_setup_v1_postgres.py`**: **70/70 PASSED** in 19.98s
- **AI Gateway tests (`src/modules/ai/ai-gateway.test.ts`)**: **13/13 PASSED** in 352.8ms (including cross-author 403 access control)
- **AI Service Unit Tests (`pytest -m "not postgres_integration"`):** **448 PASSED, 32 skipped, 0 failed**

### 3. Critical Invariant Verifications (Addressing GPT-6 Review)
- **F-01 (M0 Root & Lineage Provenance):** Both `_load_verified_amendment_edges` and `_find_root_and_chain` strictly verify root fact membership in the active M0 baseline `canonical_artifact_ids`, validate proposal status `accepted`, decision `accept`, actor identity against novel author, payload content matches, and check ancestor continuity.
- **F-02 (Idempotency & Replay Before CAS):** Replay resolution runs before CAS version validation; original proposal brain version is preserved and returned upon identical retry. Fingerprints include all normalized user fields (`private_author_notes` in proposal, `reason` in decision).
- **F-03 (History Lineage Identity & Fail-Closed):** History traversal is keyed strictly to the requested Fact UUID and its verified ancestor/root identity, eliminating cross-chain leakage across same-`fact_key` rules. Resolver errors are never swallowed; tampered lineage fails closed with typed 409.
- **Zero Direct Mutation:** Parent `FactRecord` rows are completely untouched (`UPDATE facts` is never performed on existing rows). Successor rows are append-only with `supersedes_id` referencing parent.
- **Lock Immutability:** An amendment to a locked rule produces a locked successor (`is_locked=True` inherited). Toggling `is_locked` via request payload is rejected.
- **Fail-Closed Resolution:** Lookalike successors created without an authoritative `ProposalDecisionRecord(decision='accept')` fail closed with `WORLD_RULE_SUCCESSOR_UNVERIFIED` and 0 AI provider dispatch calls.
- **Zero Fake Artifacts:** Zero fake chapters, revisions, events, or outbox records created.
- **Zero Live LLM Calls:** All test suites run with fake providers (`LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`).

