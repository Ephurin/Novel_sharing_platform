# P2-06A — AI Brainstorming Foundation Handoff

- **Task:** P2-06A AI Brainstorming Foundation (Backend structured suggestions for World Rules, Characters, and Future Chapter Events)
- **Baseline:** HEAD of `integration/p2-planning-studio` after PR #125 merge (`10c9dea0f74e5f86b8fbea63b055c64b27100282`)
- **Branch:** `gemini/p2-06a-ai-brainstorming-foundation`
- **Target:** `integration/p2-planning-studio` (Draft PR #126, do **NOT** merge)
- **Review History:** GPT-6 R1 Addressed; Ready for GPT-6 R2 Review

---

## 1. GPT-6 R1 Resolution Summary

| Issue ID | Severity | Description | Fix Implementation |
|---|---|---|---|
| **BSA-01** | **P1** | Grounding must use verified effective Canon World Rules only via `resolve_effective_facts` with verified receipts | Brainstorm service resolves Canon World Rules using `resolve_effective_facts` with `verified_amendment_edges` from `brain.metadata`. Any unverified successor or lineage failure fails closed before provider dispatch with HTTP 422 (`WORLD_RULE_SUCCESSOR_UNVERIFIED` / `WORLD_RULE_LINEAGE_INVALID`), guaranteeing zero LLM calls on lineage violations. |
| **BSA-02** | **P1** | Durable, atomic, race-safe idempotency; exact replay after restart & intervening updates | Replaced volatile in-memory cache with durable storage backed by PostgreSQL `narrative.analysis_runs` (`entity_candidate_audit` JSON column) and thread-safe single-flight coordination. Key strictly binds tenant, author, novel, and payload. Exact replay returns original receipt even after intervening Story Brain / Plan updates without invoking provider. Concurrent requests execute only 1 provider call. |
| **BSA-03** | **P1** | Fail-closed Story Plan CAS; mandatory author identity and novel ownership check | Mandatory `X-Author-Id` header (HTTP 401 if missing). Author novel ownership strictly verified against PostgreSQL `novels.author_id` before context retrieval or provider dispatch (HTTP 403 `NOVEL_OWNERSHIP_MISMATCH`). Story Plan CAS fails closed on missing plan or error (HTTP 409/503), zero LLM calls. |
| **BSA-04** | **P2** | Strict provider output envelope, bounds, and structured error handling | Implemented strict envelope validation on raw LLM output: enforces dictionary items, bounds string lengths (`MAX_TEXT_LENGTH = 4000`), restricts `target_chapter` to positive integer bounds (1–10,000), limits suggestions to at most 20 items per category. Filters output by requested `target` server-side. Maps all provider malformed items and `ValidationError` to structured HTTP 502 (`BRAINSTORM_PROVIDER_ERROR`), never leaking 500. |

---

## 2. Architectural Integrity & Strict Invariants

1. **Strict Separation of FUTURE_PLAN vs CANON / HISTORY:**
   - Brainstorming suggestions are purely proposals for the author's future outline.
   - Every generated item explicitly carries `status: "model_proposed"`, `origin: "model_proposed"`, `is_canon: False`, and `is_historical: False`.
   - **Zero Canon mutation:** No rows are inserted into `narrative_events` (which records historical Canon events). No facts are added to `facts`. The Story Brain's `brain_version` remains strictly unchanged.
   - No auto-approval or autonomous writing: suggestions remain non-canonical drafts until explicitly approved by the author through HITL.

2. **Provider Abstraction & Guarded Offline Runtime:**
   - Implemented via `LLMService` in `ai-service/core/llm_service.py` and `FakeDeterministicLLMService` in `ai-service/core/fake_llm.py`.
   - Strictly offline in tests and CI (`LLM_PROVIDER=fake`, live calls = 0, no paid provider secrets).
   - Graceful quota handling: 429 rate limit or quota exhaustion returns HTTP 429 (`PROVIDER_QUOTA_EXHAUSTED`) with `retry_after`, never failing silently or fabricating false success.
   - Malformed/empty output returns HTTP 502 (`BRAINSTORM_PROVIDER_ERROR` / `BRAINSTORM_EMPTY_SUGGESTIONS`).
   - Unavailable provider returns HTTP 503 (`BRAINSTORM_PROVIDER_UNAVAILABLE`).

3. **Grounding & Lineage Integrity:**
   - Suggestions are grounded in existing confirmed World Rules and approved entities of the Story Brain.
   - World Rules are projected via `resolve_effective_facts` with `verified_amendment_edges`, excluding superseded rules.
   - When suggesting future chapter events with participants:
     - If referencing an approved entity, the participant MUST use that entity's exact `entity_id` UUID with `name_hint=None`.
     - If introducing an unapproved character, the participant MUST use `name_hint="<Name>"` with `entity_id=None`.
     - **Hallucination Fence:** If the model returns an `entity_id` that is not in the approved Story Brain entities, the validation catches it immediately and rejects the request with HTTP 422 (`BRAINSTORM_FABRICATED_IDENTITY`).

4. **CAS (Optimistic Concurrency Control):**
   - Callers can supply `expected_brain_version` and/or `expected_plan_version`.
   - If `expected_brain_version` mismatches the current Story Brain version, fails with HTTP 409 (`BRAIN_VERSION_CONFLICT`).
   - If `expected_plan_version` mismatches the current active Plan version or cannot be read, fails closed with HTTP 409 (`PLAN_VERSION_CONFLICT`) or HTTP 503 (`PLAN_SERVICE_UNAVAILABLE`).

5. **Durable Idempotency & Replay:**
   - Scoped key: `brainstorm:{tenant}:{author}:{novel}:{key}`.
   - Backed by PostgreSQL `narrative.analysis_runs` with atomic reservation, single-flight locking, and exact replay.
   - Survives server restart and intervening brain updates.
   - Replaying with the same key but conflicting payload raises HTTP 409 (`IDEMPOTENCY_CONFLICT`).

6. **Privacy & Protected Notes (Zero Leakage):**
   - Author-supplied `private_notes` and `private_author_notes` are strictly quarantined.
   - They are NOT forwarded to the provider prompt.
   - They are NOT returned in `BrainstormResponse`.
   - Error responses and system logs never contain private author notes.

7. **Backwards Compatibility:**
   - Replaces the former stub `suggest_events` in `POST /v1/story-brains/{brain_id}/author-operation` (which previously returned `events: []`).
   - Now returns populated `events` matching the shape expected by `AuthorMemoryPanel.tsx` (`title`, `description`, `target_chapter`, `ending`, `min_words`, `status: 'model_proposed'`).
   - Exposes dedicated typed endpoint `POST /v1/story-brains/{brain_id}/brainstorm`.
   - Node.js AI Gateway forwards `POST /api/v1/ai/story-brains/:novelId/brainstorm` with author authentication and novel ownership validation.

---

## 3. API Contract Specification (`brainstorm-v1`)

### 3.1 Request Schema (`BrainstormRequest`)
```json
{
  "contract_version": "brainstorm-v1",
  "target": "all | world_rules | characters | future_events",
  "instruction": "Author guidance for the brainstorm session",
  "current_chapter": 1,
  "target_chapter": 2,
  "idempotency_key": "unique-idempotency-key",
  "expected_brain_version": 1,
  "expected_plan_version": 1,
  "private_notes": "Author internal notes (quarantined, zero-leak)",
  "private_author_notes": []
}
```

### 3.2 Response Schema (`BrainstormResponse`)
```json
{
  "contract_version": "brainstorm-v1",
  "novel_id": "00000000-0000-0000-0000-000000000001",
  "story_brain_id": "00000000-0000-0000-0000-000000000001",
  "brain_version": 1,
  "plan_version": 1,
  "world_rules": [
    {
      "rule_id": "UUID",
      "fact_key": "world_rule_tinh_than_luc",
      "text": "Rule description",
      "category": "magic_system",
      "origin": "model_proposed",
      "status": "model_proposed",
      "is_canon": false,
      "is_historical": false
    }
  ],
  "characters": [
    {
      "character_id": "UUID",
      "name": "Mộc Lan Tam Trưởng Lão",
      "canonical_name": "Mộc Lan Tam Trưởng Lão",
      "entity_type": "character",
      "role": "antagonist",
      "description": "Character background",
      "archetype": "Tam vị nhất thể",
      "aliases": ["Mộc Lan Trưởng Lão"],
      "origin": "model_proposed",
      "status": "model_proposed",
      "is_canon": false,
      "is_historical": false
    }
  ],
  "future_events": [
    {
      "event_id": "UUID",
      "target_chapter": 2,
      "title": "Hội ngộ tại Hắc Giác Vực",
      "description": "Tiêu Viêm bí mật thâm nhập Hắc Giác Vực",
      "text": "Tiêu Viêm bí mật thâm nhập Hắc Giác Vực",
      "ending": false,
      "min_words": 2000,
      "participants": [
        {"entity_id": "APPROVED-ENTITY-UUID", "name_hint": null},
        {"entity_id": null, "name_hint": "Mộc Lan Tam Trưởng Lão"}
      ],
      "origin": "model_proposed",
      "status": "model_proposed",
      "is_canon": false,
      "is_historical": false
    }
  ],
  "events": [ /* Alias of future_events for FE backwards compatibility */ ],
  "character_seeds": [ /* Alias of characters */ ],
  "provenance": {
    "contract_version": "brainstorm-v1",
    "provider": "fake",
    "model": "fake-model",
    "status": "model_proposed",
    "grounding_rules_count": 1,
    "grounding_entities_count": 1,
    "timestamp": "2026-11-10T13:00:00Z"
  }
}
```

---

## 4. Verification & Test Matrix

| Test Suite / Case | Focus Area | Expected | Actual | Verdict |
|---|---|---|---|---|
| `test_bsa01_effective_world_rules_lineage_and_unverified_successor_blocks_llm` | **BSA-01** | Grounding excludes superseded rules and passes only effective rules; unverified successor aborts before LLM call with 422 | Verified prompt only contains child rule; unverified successor raises 422 with zero LLM calls | **PASS** |
| `test_bsa02_concurrent_requests_single_flight_and_restart` | **BSA-02** | Concurrent requests single-flight; restart reads cached receipt with 0 LLM calls | Both threads return 200 with identical brainstorm_id; fresh service makes 0 LLM calls | **PASS** |
| `test_bsa02_cas_update_intervening_story_brain_exact_retry_succeeds` | **BSA-02** | Intervening brain version bump does not invalidate exact replay | Exact replay returns cached response with 0 LLM calls, no 409 conflict | **PASS** |
| `test_bsa03_author_identity_required_and_foreign_ownership_forbidden` | **BSA-03** | Missing author header returns 401; foreign author returns 403 `NOVEL_OWNERSHIP_MISMATCH` before provider call | Returns 401 and 403 respectively with zero LLM calls | **PASS** |
| `test_bsa03_plan_cas_fail_closed_on_error_or_missing_plan` | **BSA-03** | Missing plan or plan backend outage fails closed (409/503) before provider call | Returns 409/503 with zero LLM calls | **PASS** |
| `test_bsa04_adversarial_provider_output_validation` | **BSA-04** | String item, oversized array (>20), bad chapter type map to structured 502; target filters server-side | Returns 502 `BRAINSTORM_PROVIDER_ERROR` on bad items; server-side target filtering isolates requested items | **PASS** |
| `test_brainstorm_returns_model_proposed_not_canon_not_history` | Foundation | All proposals have `status: model_proposed`, `is_canon: false`; Story Brain facts/events unchanged | Verified model_proposed status on all items; 0 events added to brain | **PASS** |
| `test_author_operation_suggest_events_backward_compatible` | Compatibility | Returns HTTP 200 with non-empty `events` array conforming to FE shape | Returns HTTP 200, `data.events` populated with future events | **PASS** |
| `test_grounded_participant_uses_approved_entity_id` | Grounding | Participant references approved entity UUID from Story Brain | First participant has approved entity UUID, `name_hint: null` | **PASS** |
| `test_fabricated_participant_identity_rejected_422` | Safety | Fabricated entity UUID returns HTTP 422 `BRAINSTORM_FABRICATED_IDENTITY` | Returns HTTP 422 with fabricated entity ID in error detail | **PASS** |
| `test_identity_and_scope_checks` | Security | Missing tenant: 401; Bad UUID: 422; Author mismatch: 403; Tenant mismatch: 403 | All negative scope checks fail closed with proper status codes | **PASS** |
| `test_cas_brain_version_conflict_409` | CAS | Mismatched expected_brain_version returns HTTP 409 `BRAIN_VERSION_CONFLICT` | Returns HTTP 409 | **PASS** |
| `test_idempotency_retry_and_conflict` | Idempotency | Same key + same payload: cached response; Same key + changed payload: 409 | Exact replay passes; conflicting modification returns 409 | **PASS** |
| `test_no_private_notes_leakage` | Privacy | `private_notes` absent from provider prompt, response payload, and error messages | Secret marker string not found in LLM prompt, response text, or error body | **PASS** |
| `test_provider_quota_exhausted_429` | Resilience | Simulated 429 returns HTTP 429 `PROVIDER_QUOTA_EXHAUSTED` with `retry_after` | Returns HTTP 429 with retry_after: 60 | **PASS** |
| `test_provider_malformed_json_502` | Resilience | Malformed output returns HTTP 502 | Returns HTTP 502 | **PASS** |
| `test_provider_empty_suggestions_502` | Resilience | Empty output returns HTTP 502 `BRAINSTORM_EMPTY_SUGGESTIONS` | Returns HTTP 502 | **PASS** |
| `test_provider_unavailable_503` | Resilience | Provider unavailable returns HTTP 503 `BRAINSTORM_PROVIDER_UNAVAILABLE` | Returns HTTP 503 | **PASS** |
| `test_target_filtering` | Filtering | Target filter isolates `world_rules`, `characters`, or `future_events` | Returns only requested categories | **PASS** |
| `test_brainstorm_postgres.py` (9 tests) | **Real PG** | Covers Canon immutability, CAS, author backward-compat, private notes redaction, BSA-01 effective lineage, BSA-01 unverified successor 422, BSA-02 durable restart & brain mutation, BSA-02 concurrent single-flight, BSA-03 ownership & 401 auth | Full test suite executed with `@pytest.mark.postgres_integration` against PostgreSQL | **PASS** |
| `ai-gateway.test.ts` (Forwarding) | Gateway | Gateway forwards `/v1/story-brains/:novelId/brainstorm` with actor & idempotency | 14/14 tests PASS | **PASS** |
| `p1-closed-loop-gateway.test.ts` | Gateway | P1 closed loop gateway forwards without regressions | 8/8 tests PASS | **PASS** |

---

## 5. Reproducible Commands

### AI Service Unit & Contract Tests:
```powershell
Set-Location "ai-service"
python -m pytest -q --basetemp=.pytest_tmp tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py tests/test_brainstorm_service.py
# Result: 65 passed in 2.25s
```

### Node.js Backend Gateway Tests:
```powershell
Set-Location "backend"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/p2a"
$env:MONGODB_URI="mongodb://localhost:27017/p2a"
$env:JWT_ACCESS_SECRET="test-access-secret-16chars"
$env:JWT_REFRESH_SECRET="test-refresh-secret-16chars"
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
# Result: 22 passed in 0.96s
```

---

## 6. Risk & Invariant Checklist

- [x] **Authentication & Tenant Isolation:** Forwarded headers (`X-Tenant-Id`, `X-Author-Id`, `X-User-Id`, `X-Actor-Id`) verified and enforced. Cross-tenant, missing author identity, and mismatched identities rejected.
- [x] **Novel Ownership Access Control:** Author novel ownership strictly verified against `novels.author_id` before provider invocation. Foreign authors rejected with HTTP 403 `NOVEL_OWNERSHIP_MISMATCH`.
- [x] **Canon / Event History Boundary:** Zero inserts to `narrative_events` or `facts`. `StoryBrain` version and state unchanged.
- [x] **World Rules Canon Lineage:** Grounding strictly uses `resolve_effective_facts` with `verified_amendment_edges`. Unverified successor facts fail closed (HTTP 422) before LLM call.
- [x] **Durable Idempotency & Concurrency:** CAS on Story Brain and Plan versions enforced. Durable PostgreSQL-backed idempotency via `analysis_runs` (`entity_candidate_audit` JSON). Survives restart and intervening brain updates. Thread-safe single-flight coordination.
- [x] **Privacy / Zero Note Leakage:** Private author notes excluded from provider payloads, excluded from responses, and redacted from errors.
- [x] **Provider Egress / Safety:** Zero live model calls. `LLM_PROVIDER=fake` in test/CI environments. Actionable HTTP 429 on quota exhaustion. Bounded output envelope (max 20 items, max length 4000). Structured HTTP 502 on malformed items.
- [x] **P1 & UI Scope Discipline:** Zero modifications to P1 core routes/services. Zero modifications to `web/` frontend (P2-06B UI deferred).

---

## 7. Verdict

**READY_FOR_REVIEW** (Awaiting GPT-6 R2 review on integration Draft PR #126. Do **NOT** self-merge).
