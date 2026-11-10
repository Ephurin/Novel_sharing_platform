# P2-06A — AI Brainstorming Foundation Handoff

- **Task:** P2-06A AI Brainstorming Foundation (Backend structured suggestions for World Rules, Characters, and Future Chapter Events)
- **Baseline:** HEAD of `integration/p2-planning-studio` after PR #125 merge (`10c9dea0f74e5f86b8fbea63b055c64b27100282`)
- **Branch:** `gemini/p2-06a-ai-brainstorming-foundation`
- **Target:** `integration/p2-planning-studio` (Draft PR, do **NOT** merge)

---

## 1. Architectural Integrity & Strict Invariants

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

3. **Grounding & Fabricated Identity Rejection:**
   - Suggestions are grounded in existing confirmed World Rules and approved entities of the Story Brain.
   - When suggesting future chapter events with participants:
     - If referencing an approved entity, the participant MUST use that entity's exact `entity_id` UUID with `name_hint=None`.
     - If introducing an unapproved character, the participant MUST use `name_hint="<Name>"` with `entity_id=None`.
     - **Hallucination Fence:** If the model returns an `entity_id` that is not in the approved Story Brain entities, the validation catches it immediately and rejects the request with HTTP 422 (`BRAINSTORM_FABRICATED_IDENTITY`).

4. **CAS (Optimistic Concurrency Control):**
   - Callers can supply `expected_brain_version` and/or `expected_plan_version`.
   - If `expected_brain_version` mismatches the current Story Brain version, fails with HTTP 409 (`BRAIN_VERSION_CONFLICT`).
   - If `expected_plan_version` mismatches the current active Plan version, fails with HTTP 409 (`PLAN_VERSION_CONFLICT`).

5. **Idempotency & Replay:**
   - Supports `Idempotency-Key` header and payload field.
   - Replaying with the same key and identical input returns the exact cached result.
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

## 2. API Contract Specification (`brainstorm-v1`)

### 2.1 Request Schema (`BrainstormRequest`)
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

### 2.2 Response Schema (`BrainstormResponse`)
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

## 3. Verification & Test Matrix

| Test Suite / Case | Expected | Actual | Verdict |
|-------------------|----------|--------|---------|
| `test_brainstorm_returns_model_proposed_not_canon_not_history` | All proposals have `status: model_proposed`, `is_canon: false`; Story Brain facts/events unchanged | Verified model_proposed status on all items; 0 events added to brain | **PASS** |
| `test_author_operation_suggest_events_backward_compatible` | Returns HTTP 200 with non-empty `events` array conforming to FE shape | Returns HTTP 200, `data.events` populated with future events | **PASS** |
| `test_grounded_participant_uses_approved_entity_id` | Participant references approved entity UUID from Story Brain | First participant has approved entity UUID, `name_hint: null` | **PASS** |
| `test_fabricated_participant_identity_rejected_422` | Fabricated entity UUID returns HTTP 422 `BRAINSTORM_FABRICATED_IDENTITY` | Returns HTTP 422 with fabricated entity ID in error detail | **PASS** |
| `test_identity_and_scope_checks` | Missing tenant: 401; Bad UUID: 422; Author mismatch: 403; Tenant mismatch: 403 | All negative scope checks fail closed with proper status codes | **PASS** |
| `test_cas_brain_version_conflict_409` | Mismatched expected_brain_version returns HTTP 409 `BRAIN_VERSION_CONFLICT` | Returns HTTP 409 | **PASS** |
| `test_idempotency_retry_and_conflict` | Same key + same payload: cached response; Same key + changed payload: 409 | Exact replay passes; conflicting modification returns 409 | **PASS** |
| `test_no_private_notes_leakage` | `private_notes` absent from provider prompt, response payload, and error messages | Secret marker string not found in LLM prompt, response text, or error body | **PASS** |
| `test_provider_quota_exhausted_429` | Simulated 429 returns HTTP 429 `PROVIDER_QUOTA_EXHAUSTED` with `retry_after` | Returns HTTP 429 with retry_after: 60 | **PASS** |
| `test_provider_malformed_json_502` | Malformed output returns HTTP 502 | Returns HTTP 502 | **PASS** |
| `test_provider_empty_suggestions_502` | Empty output returns HTTP 502 `BRAINSTORM_EMPTY_SUGGESTIONS` | Returns HTTP 502 | **PASS** |
| `test_provider_unavailable_503` | Provider unavailable returns HTTP 503 `BRAINSTORM_PROVIDER_UNAVAILABLE` | Returns HTTP 503 | **PASS** |
| `test_target_filtering` | Target filter isolates `world_rules`, `characters`, or `future_events` | Returns only requested categories | **PASS** |
| `ai-gateway.test.ts` (Forwarding) | Gateway forwards `/v1/story-brains/:novelId/brainstorm` with actor & idempotency | 14/14 tests PASS | **PASS** |
| `p1-closed-loop-gateway.test.ts` | P1 closed loop gateway forwards without regressions | 8/8 tests PASS | **PASS** |
| `test_brainstorm_postgres.py` | PostgreSQL integration test verifying real database readbacks and Canon immutability | Included in CI workflow with `@pytest.mark.postgres_integration` | **READY** |

---

## 4. Reproducible Commands

### AI Service Unit & Contract Tests:
```powershell
Set-Location "ai-service"
python -m pytest -q --basetemp=.pytest_tmp tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py tests/test_brainstorm_service.py
# Result: 59 passed in 2.55s
```

### Node.js Backend Gateway Tests:
```powershell
Set-Location "backend"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/p2a"
$env:MONGODB_URI="mongodb://localhost:27017/p2a"
$env:JWT_ACCESS_SECRET="test-access-secret-16chars"
$env:JWT_REFRESH_SECRET="test-refresh-secret-16chars"
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
# Result: 22 passed in 2.1s
```

---

## 5. Risk & Invariant Checklist

- [x] **Authentication & Tenant Isolation:** Forwarded headers (`X-Tenant-Id`, `X-Author-Id`, `X-User-Id`, `X-Actor-Id`) verified and enforced. Cross-tenant and mismatched identities rejected.
- [x] **Canon / Event History Boundary:** Zero inserts to `narrative_events` or `facts`. `StoryBrain` version and state unchanged.
- [x] **Idempotency & Concurrency:** CAS on Story Brain and Plan versions enforced. Idempotency replay returns exact cached receipt; conflicting replay returns 409.
- [x] **Privacy / Zero Note Leakage:** Private author notes excluded from provider payloads, excluded from responses, and redacted from errors.
- [x] **Provider Egress / Safety:** Zero live model calls. `LLM_PROVIDER=fake` in test/CI environments. Actionable HTTP 429 on quota exhaustion.
- [x] **P1 & UI Scope Discipline:** Zero modifications to P1 core routes/services. Zero modifications to `web/` frontend (P2-06B UI deferred).

---

## 6. Verdict

**READY_FOR_REVIEW** (Awaiting GPT-6 review on integration Draft PR. Do **NOT** self-merge).
