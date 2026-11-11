# P2-06A — AI Brainstorming Foundation Handoff

- **Task:** P2-06A AI Brainstorming Foundation (Backend structured suggestions for World Rules, Characters, and Future Chapter Events)
- **Baseline:** HEAD of `integration/p2-planning-studio` after PR #125 merge (`10c9dea0f74e5f86b8fbea63b055c64b27100282`)
- **Branch:** `gemini/p2-06a-ai-brainstorming-foundation`
- **Target:** `integration/p2-planning-studio` (Draft PR #126, do **NOT** merge)
- **Review History:** GPT-6 R1, R2, R3 Addressed; Ready for GPT-6 R4 Review

---

## 1. GPT-6 Review Resolution Matrix

| Issue ID | Severity | Description | Fix Implementation |
|---|---|---|---|
| **BSA-01** (R1) | **P1** | Grounding must use verified effective Canon World Rules only via `resolve_effective_facts` with verified receipts | Brainstorm service resolves Canon World Rules using `resolve_effective_facts` with `verified_amendment_edges` from `brain.metadata`. Any unverified successor or lineage failure fails closed before provider dispatch with HTTP 422 (`WORLD_RULE_SUCCESSOR_UNVERIFIED` / `WORLD_RULE_LINEAGE_INVALID`), guaranteeing zero LLM calls on lineage violations. *(Verified PASS by GPT-6 R2 & R3)* |
| **BSA-02R** (R2) | **P1** | Durable idempotency retry recovery after 429/502/503 and crash recovery / stale lease takeover; fail-closed reservation | Replaced simple binary reservation with an atomic, lease-based state machine (`pending` with `lease_token` and `lease_expires_at`, `completed`, `failed`) under per-key row lock (`with_for_update()`). Slots marked `failed` or with expired leases can be safely re-reserved/taken over on same-key exact retries. Completed receipts are immutable and exact-replayed. Any non-unique DB error during reservation fails closed with HTTP 503 (`IDEMPOTENCY_STORE_UNAVAILABLE`), guaranteeing **zero provider calls** without an actively held lease. Handled concurrent insert races (`IntegrityError`) cleanly via session rollback so racing workers single-flight and await the winner without `PendingRollbackError`. *(Verified PASS by GPT-6 R3)* |
| **BSA-03R** (R2) | **P1** | Owner gate fails closed if Core `novels` row is missing or deleted; no fallback to `StoryBrainRecord` existence | Authoritative novel ownership check executes `SELECT author_id, deleted_at FROM novels WHERE novel_id = :n`. Missing novel rows immediately return HTTP 404 (`NOVEL_NOT_FOUND`). Soft-deleted novel rows (`deleted_at IS NOT NULL`) return HTTP 404 (`NOVEL_DELETED`). Mismatched author returns HTTP 403 (`NOVEL_OWNERSHIP_MISMATCH`). The unsafe fallback to `StoryBrainRecord` existence has been completely eliminated. *(Verified PASS by GPT-6 R3)* |
| **BSA-04R** (R2) | **P2** | Strict scalar type validation preventing unhandled `AttributeError` / HTTP 500 on malformed provider types | Added defensive scalar type checks (`isinstance`) for all returned fields (`world_rules.text`, `characters.name`, `characters.aliases`, `future_events.title`, `future_events.target_chapter`, `participants.*`) prior to any string transformations (`.strip()`) or conversions. Disallows booleans for integer fields (e.g. `target_chapter: true`). All malformed items map to structured HTTP 502 (`BRAINSTORM_PROVIDER_ERROR`), guaranteeing zero HTTP 500 errors. *(Verified PASS by GPT-6 R3)* |
| **BSA-02S** (R3) | **P1** | Fixed 30s lease could expire while LLM provider call is still running, causing duplicate LLM dispatch on worker takeover | Added active `_LeaseHeartbeat` background thread that continuously renews `lease_expires_at` in both PostgreSQL and in-memory storage while long-running provider generation is active. Added local in-flight worker liveness discrimination (`_is_local_worker_alive`) so active workers are never evicted by clock jumps or timeouts. Retained completion fencing token check (`IDEMPOTENCY_LEASE_EXPIRED`) and bounded crash recovery for genuine deceased workers. In PostgreSQL reservation, distinguished unique key collisions (`23505`) from unrelated `IntegrityError`s which immediately fail closed with HTTP 503 (`IDEMPOTENCY_STORE_UNAVAILABLE`). |
| **BSA-03S** (R3) | **P1** | Unsupported/unverifiable repository adapters (e.g. `JsonNarrativeRepository`) skipped owner verification before provider dispatch | In `_verify_novel_ownership`, added explicit final fail-closed `else` block: any adapter without authoritative novel ownership verification capabilities (such as `JsonNarrativeRepository` which only manages KB files) immediately returns sanitized HTTP 503 `OWNERSHIP_VERIFICATION_UNAVAILABLE` before reading Story Brain or dispatching to provider. Guaranteed zero fake provider calls and zero context leakage. |

---

## 2. Architectural Integrity & Strict Invariants

1. **Strict Separation of FUTURE_PLAN vs CANON / HISTORY:**
   - Brainstorming suggestions are purely proposals for the author's future outline.
   - Every generated item explicitly carries `status: "model_proposed"`, `origin: "model_proposed"`, `is_canon: False`, and `is_historical: False`.
   - **Zero Canon mutation:** No rows are inserted into `narrative_events` (which records historical Canon events). No facts are added to `facts`. The Story Brain's `brain_version` remains strictly unchanged.
   - No auto-approval or autonomous writing: suggestions remain non-canonical drafts until explicitly approved by the author through HITL.

2. **Durable Idempotency & Lease State Machine (BSA-02R):**
   - Scoped key: `brainstorm:{tenant}:{author}:{novel}:{key}`.
   - Backed by PostgreSQL `narrative.analysis_runs` (`entity_candidate_audit` JSONB column).
   - Fields: `status` (`pending`, `completed`, `failed`), `lease_token`, `lease_expires_at`, `response`, `error`.
   - Atomic reservation and takeover under `select ... with_for_update()`.
   - Bounded lease duration (30.0s). Expired pending records or failed runs can be safely re-reserved on subsequent same-key requests.
   - Completed receipts are permanent, immutable, and served on exact replay without provider calls.
   - DB reservation failures fail closed (HTTP 503), preventing unreserved provider dispatch.

3. **Authoritative Ownership & Scope (BSA-03R):**
   - Forwarded headers (`X-Tenant-Id`, `X-Author-Id`, `X-User-Id`, `X-Actor-Id`) verified and enforced.
   - Author ownership queried from `novels` table:
     - Absent novel row -> HTTP 404 `NOVEL_NOT_FOUND`
     - Soft-deleted novel row -> HTTP 404 `NOVEL_DELETED`
     - Author mismatch -> HTTP 403 `NOVEL_OWNERSHIP_MISMATCH`
   - Story Brain presence alone NEVER grants authorization. Zero provider calls on ownership denial.

4. **Strict Scalar Provider Validation (BSA-04R):**
   - Defensive validation ensures all scalar fields are strings, integers, or lists of strings before any string operations (`strip`) or coercions.
   - Target chapter strictly checked against boolean trap (`isinstance(True, int) == True`).
   - All malformed provider structures return structured HTTP 502 (`BRAINSTORM_PROVIDER_ERROR`).

5. **Grounding & Lineage Integrity (BSA-01):**
   - Suggestions are grounded in existing confirmed World Rules and approved entities of the Story Brain.
   - World Rules are projected via `resolve_effective_facts` with `verified_amendment_edges`, excluding superseded rules.
   - Unverified successor facts fail closed (HTTP 422) before LLM call.
   - Fabricated entity IDs rejected with HTTP 422 (`BRAINSTORM_FABRICATED_IDENTITY`).

6. **CAS (Optimistic Concurrency Control):**
   - Callers can supply `expected_brain_version` and/or `expected_plan_version`.
   - If `expected_brain_version` mismatches the current Story Brain version, fails with HTTP 409 (`BRAIN_VERSION_CONFLICT`).
   - If `expected_plan_version` mismatches the current active Plan version or cannot be read, fails closed with HTTP 409 (`PLAN_VERSION_CONFLICT`) or HTTP 503 (`PLAN_SERVICE_UNAVAILABLE`).

7. **Privacy & Protected Notes (Zero Leakage):**
   - Author-supplied `private_notes` and `private_author_notes` are strictly quarantined.
   - They are NOT forwarded to the provider prompt.
   - They are NOT returned in `BrainstormResponse`.
   - Error responses and system logs never contain private author notes.

8. **Backwards Compatibility:**
   - Replaces the former stub `suggest_events` in `POST /v1/story-brains/{brain_id}/author-operation` (which previously returned `events: []`).
   - Now returns populated `events` matching the shape expected by `AuthorMemoryPanel.tsx`.
   - Exposes dedicated typed endpoint `POST /v1/story-brains/{brain_id}/brainstorm`.
   - Node.js AI Gateway forwards `POST /api/v1/ai/story-brains/:novelId/brainstorm` with author authentication and novel ownership validation.

---

## 3. Verification Matrix

| Test Suite / Case | Focus Area | Expected | Actual | Verdict |
|---|---|---|---|---|
| `test_bsa02r_retry_succeeds_after_429_quota_failure` | **BSA-02R** | Failed 429 run sets status `failed`; same-key retry succeeds with 200, then replays from cache | First call returns 429, retry succeeds with 200, 3rd call serves cached response | **PASS** |
| `test_bsa02r_retry_succeeds_after_502_provider_failure` | **BSA-02R** | Failed 502 run sets status `failed`; same-key retry succeeds with 200 | First call returns 502, retry succeeds with 200 | **PASS** |
| `test_bsa02r_stale_pending_lease_takeover` | **BSA-02R** | Stale pending record with expired lease is taken over by subsequent request and completes | Returns 200, updates status to completed | **PASS** |
| `test_bsa03r_novel_not_found_when_unregistered` | **BSA-03R** | Novel absent from ownership store returns 404 `NOVEL_NOT_FOUND` despite Story Brain existence | Returns 404 `NOVEL_NOT_FOUND` | **PASS** |
| `test_bsa03r_novel_ownership_mismatch_denied` | **BSA-03R** | Foreign author calling novel returns 403 `NOVEL_OWNERSHIP_MISMATCH` | Returns 403 `NOVEL_OWNERSHIP_MISMATCH` | **PASS** |
| `test_bsa04r_scalar_type_errors_map_to_502` | **BSA-04R** | Malformed scalar types (int, list, dict, bool) return structured 502, zero 500 errors | All 9 adversarial cases return HTTP 502 `BRAINSTORM_PROVIDER_ERROR` | **PASS** |
| `test_bsa02s_slow_provider_lease_renewal_prevents_duplicate_dispatch` | **BSA-02S** | Worker A in provider longer than lease timeout renews lease via heartbeat; Worker B does not takeover; zero duplicate LLM dispatches | Worker A succeeds, Worker B gets completed result, exactly 1 LLM dispatch | **PASS** |
| `test_bsa02s_controlled_clock_worker_alive_prevents_takeover` | **BSA-02S** | Controlled clock advances 45s while Worker A is alive in provider; Worker B avoids takeover; zero duplicate dispatches | Worker A completes, 1 total LLM dispatch | **PASS** |
| `test_bsa02s_crashed_worker_takeover_recovers_safely` | **BSA-02S** | Expired lease with no live worker thread safely taken over by Worker B, completes with 200 | Returns 200, marks status completed | **PASS** |
| `test_bsa03s_json_narrative_repository_ownership_fails_closed_zero_provider_calls` | **BSA-03S** | Real JsonNarrativeRepository denies unverified author requests with 503 before reading KB or dispatching provider | Both author A and B get 503 `OWNERSHIP_VERIFICATION_UNAVAILABLE`, 0 LLM calls | **PASS** |
| `test_brainstorm_postgres_bsa02s_slow_provider_lease_renewal_prevents_duplicate_dispatch` | **Real PG (BSA-02S)** | Background lease renewal extends PG `lease_expires_at` past 30s; Worker B does not takeover; 1 LLM dispatch | Real PG lease extension verified; zero duplicate LLM calls | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02s_crashed_worker_safe_takeover` | **Real PG (BSA-02S)** | Crashed worker with expired lease in PostgreSQL safely taken over by Worker B with new token | Real PG crash takeover verified | **PASS** (CI) |
| `test_brainstorm_postgres_bsa03s_json_adapter_ownership_fail_closed_zero_llm_calls` | **Real PG (BSA-03S)** | JsonNarrativeRepository fails closed with 503 on PostgreSQL integration testbed, zero LLM calls | HTTP 503 `OWNERSHIP_VERIFICATION_UNAVAILABLE`, 0 LLM calls | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02s_non_unique_integrity_error_fails_closed_503` | **Real PG (Maint)** | Non-unique constraint IntegrityError immediately returns 503 without waiting 10s or 409 | HTTP 503 `IDEMPOTENCY_STORE_UNAVAILABLE`, fast fail-closed | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02r_retry_succeeds_after_429_failure` | **Real PG** | 429 marks row `failed`; same-key retry re-reserves slot, completes with 200, 3rd call exact replays | Real PG state machine verified across transitions | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02r_retry_succeeds_after_502_failure` | **Real PG** | 502 marks row `failed`; same-key retry re-reserves slot, completes with 200 | Real PG state machine verified | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02r_stale_pending_lease_takeover` | **Real PG** | Expired lease from crashed worker is taken over in PostgreSQL, transitions to completed | Real PG lease takeover verified | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02r_reservation_db_failure_fail_closed` | **Real PG** | DB failure during reservation fails closed (503), **zero provider calls** | Verified 0 provider calls on reservation error | **PASS** (CI) |
| `test_brainstorm_postgres_bsa02r_concurrency_across_separate_instances` | **Real PG** | Simultaneous requests across separate service instances single-flight to 1 provider call | Exactly 1 provider call across separate service instances | **PASS** (CI) |
| `test_brainstorm_postgres_bsa03r_ownership_denied_when_core_novel_absent` | **Real PG** | Core novel row absent or soft-deleted in PostgreSQL returns 404, **zero provider calls** | Returns 404 `NOVEL_NOT_FOUND` / `NOVEL_DELETED`, 0 provider calls | **PASS** (CI) |
| `test_brainstorm_postgres_bsa04r_scalar_type_errors_return_502` | **Real PG** | Provider scalar type mismatches in real PostgreSQL return 502, never 500 | Verified structured 502 responses across all adversarial cases | **PASS** (CI) |
| `test_brainstorm_service.py` (29 unit tests) | Unit | Complete unit test coverage for brainstorming foundation, safety, idempotency, CAS, privacy | 29/29 PASS | **PASS** |
| `ai-gateway.test.ts` (14 tests) | Gateway | Gateway forwards `/v1/story-brains/:novelId/brainstorm` with actor & idempotency | 14/14 PASS | **PASS** |
| `p1-closed-loop-gateway.test.ts` (8 tests) | Gateway | P1 closed loop gateway forwards without regressions | 8/8 PASS | **PASS** |

---

## 4. Reproducible Commands & CI Run Evidence

### AI Service Unit & Contract Tests:
```powershell
Set-Location "ai-service"
python -m pytest -q tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py tests/test_brainstorm_service.py
# Result: 75 passed in 3.56s
```

### Node.js Backend Gateway Tests:
```powershell
Set-Location "backend"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/p2a"
$env:MONGODB_URI="mongodb://localhost:27017/p2a"
$env:JWT_ACCESS_SECRET="test-access-secret-16chars"
$env:JWT_REFRESH_SECRET="test-refresh-secret-16chars"
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
# Result: 22 passed in 2.02s
```

---

## 5. Verdict

**READY_FOR_REVIEW** (Draft PR #126 updated for GPT-6 R4 Review. Do **NOT** merge).
