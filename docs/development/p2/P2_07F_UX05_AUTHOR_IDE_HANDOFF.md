# P2-07F / UX-05 — Author IDE World Rules Amendment UI & CAS Verification

- **Task:** UX-05 Author IDE for post-M0 approved World Setup rule amendment, CAS conflict handling, Before/After comparison, and decision audit trail.
- **Baseline:** HEAD of `integration/p2-planning-studio` after PR #124 merge (`9002ed6218dbe1e1fbf485e985fe66b8fb7b8f9a`).
- **Branch:** `gemini/p2-07f-ux05-author-ide`
- **Target:** `integration/p2-planning-studio` (Draft PR, do **NOT** merge)

---

## 1. Architectural Integrity & Strict Invariants

1. **Canon Immutability (Append-only Successors):**
   - Author IDE never mutates historical Canon `FactRecord` rows directly.
   - Amendments are proposed via P2-07E contract API (`POST .../world-rules/:factId/amendments`).
   - Approved amendments materialize a new successor `FactRecord` superseding the parent, bumping `brain_version` by +1 and producing an immutable `ProposalDecisionRecord` receipt.
2. **Lock Immutability:**
   - The `is_locked` attribute is strictly immutable across all generations.
   - Locked rules display a prominent `Bất biến (Locked)` badge and an informative alert explaining that successors automatically inherit the locked state.
   - No UI control (checkbox, toggle, input) exists to alter or tamper with `is_locked`.
3. **Optimistic Concurrency Control (CAS / 409):**
   - Every proposal and decision request binds strictly to the `expected_brain_version`.
   - On CAS 409 conflict (`SETUP_OPTIMISTIC_LOCK_CONFLICT`), the UI displays a clear, localized explanation in Vietnamese.
   - The author's local draft in `localStorage` is preserved intact without loss, allowing seamless refresh and retry.
4. **Before/After Side-by-Side Comparison:**
   - Pending proposals render a clear two-column visual comparison between the currently active Canon fact (`TRƯỚC: Bản Canon đang hiệu lực`) and the amendment proposal (`SAU: Bản đề xuất sửa đổi mới`).
5. **Fail-Closed Writing Context Fence (Zero Provider Calls):**
   - Verified that tampered decision receipts in PostgreSQL cause `get_structured_context` and `preview_context` to fail closed with `WORLD_RULE_SUCCESSOR_UNVERIFIED`.
   - Writing generation jobs enter `stage='security_blocked'`, resulting in **strictly 0 fake-provider calls**.

---

## 2. Implemented Components

### 2.1 Web Frontend API Client (`web/src/features/ai-copilot/setup-api.ts`)
Added type definitions and client functions for the P2-07E amendment contracts:
- `WorldRuleLineageEntry`: Phả hệ kế thừa của fact qua các thế hệ.
- `WorldRuleAmendmentHistoryItem`: Chi tiết từng đề xuất sửa đổi.
- `WorldRuleAmendmentHistory`: Phản hồi lịch sử và phả hệ đầy đủ.
- `proposeWorldRuleAmendment(novelId, factId, body, signal)`: Gửi đề xuất sửa đổi quy tắc.
- `decideWorldRuleAmendment(novelId, proposalId, body, signal)`: Gửi quyết định phê duyệt (accept) hoặc từ chối (reject).
- `getWorldRuleAmendments(novelId, factId, signal)`: Truy xuất lịch sử và phả hệ của quy tắc.

### 2.2 Author IDE Amendment Component (`web/src/features/ai-copilot/WorldRuleAmendmentManager.tsx`)
Comprehensive React component for managing World Rules post-M0:
- **Canon Rules List:** Fetches current effective World Rules from `getApprovedMemory(novelId)`.
- **Badges:** `Bất biến (Locked)` (đỏ) vs `Quy tắc chuẩn` (xanh mòng két).
- **Propose Amendment Form:** Inline form with `replacement_text`, optional `private_author_notes`, lock notice, and auto-draft persistence (`usePlanningDraft`).
- **Pending Decision Card:** Side-by-side Before/After comparison, optional decision reason, `Từ chối đề xuất` (Reject) button, and `Chấp thuận (Duyệt thành Canon mới)` (Accept) button.
- **Lineage & History Modal:** Multi-generation lineage visualization with HEAD indicator and chronological proposal audit trail.

### 2.3 Planning Studio Integration (`web/src/features/ai-copilot/SetupFoundationPanel.tsx`)
Mounted `<WorldRuleAmendmentManager>` directly inside the World Setup tab (`planningStep === 'rules'`) under the divider:
`Hiệu chỉnh Quy tắc Thế giới sau M0 (UX-05)`.

---

## 3. Test Evidence

### 3.1 PostgreSQL Integration Tests (`ai-service/tests/test_setup_amendment_postgres.py`)
All **25 / 25** PostgreSQL integration tests passed:
```
tests/test_setup_amendment_postgres.py::test_amendment_full_lifecycle_accept_flow PASSED [  4%]
tests/test_setup_amendment_postgres.py::test_amendment_full_lifecycle_reject_flow PASSED [  8%]
tests/test_setup_amendment_postgres.py::test_amendment_second_generation_chain PASSED [ 12%]
tests/test_setup_amendment_postgres.py::test_amendment_locked_rule_strictly_preserves_lock PASSED [ 16%]
tests/test_setup_amendment_postgres.py::test_amendment_idempotent_replay_and_conflict_guards PASSED [ 20%]
tests/test_setup_amendment_postgres.py::test_amendment_cross_tenant_and_foreign_author_forbidden PASSED [ 24%]
tests/test_setup_amendment_postgres.py::test_amendment_fails_when_m0_not_active PASSED [ 28%]
tests/test_setup_amendment_postgres.py::test_unaudited_lookalike_successor_remains_strictly_blocked PASSED [ 32%]
tests/test_setup_amendment_postgres.py::test_concurrent_double_accept_race PASSED [ 36%]
tests/test_setup_amendment_postgres.py::test_transaction_atomic_rollback_on_failure PASSED [ 40%]
tests/test_setup_amendment_postgres.py::test_m0_provenance_rejects_non_setup_root PASSED [ 44%]
tests/test_setup_amendment_postgres.py::test_forged_decision_receipt_fails_closed PASSED [ 48%]
tests/test_setup_amendment_postgres.py::test_unaudited_ancestor_chain_fails_closed PASSED [ 52%]
tests/test_setup_amendment_postgres.py::test_propose_idempotency_after_brain_bump_and_accept PASSED [ 56%]
tests/test_setup_amendment_postgres.py::test_propose_changed_private_notes_conflict PASSED [ 60%]
tests/test_setup_amendment_postgres.py::test_decide_changed_reason_conflict PASSED [ 64%]
tests/test_setup_amendment_postgres.py::test_history_isolation_same_fact_key_different_roots PASSED [ 68%]
tests/test_setup_amendment_postgres.py::test_history_fails_closed_on_tampered_lineage PASSED [ 72%]
tests/test_setup_amendment_postgres.py::test_f04_non_global_fact_cannot_supersede_second_gen_head PASSED [ 76%]
tests/test_setup_amendment_postgres.py::test_f04_non_global_fact_cannot_supersede_third_gen_head PASSED [ 80%]
tests/test_setup_amendment_postgres.py::test_f04_independent_p1_fact_corrections_unaffected PASSED [ 84%]
tests/test_setup_amendment_postgres.py::test_f05_tampered_decision_receipt_fields_fail_closed PASSED [ 88%]
tests/test_setup_amendment_postgres.py::test_f05_tampered_run_or_successor_scope_fails_closed PASSED [ 92%]
tests/test_setup_amendment_postgres.py::test_f06_decision_revalidation_rejects_tampered_ancestry_under_same_brain_version PASSED [ 96%]
tests/test_setup_amendment_postgres.py::test_ux05_full_e2e_tampered_receipt_blocks_writing_generation PASSED [100%]

============================= 25 passed in 8.36s ==============================
```

#### Detailed Full E2E Tamper & Zero Provider Call Test:
`test_ux05_full_e2e_tampered_receipt_blocks_writing_generation`:
1. Activated novel under M0.
2. Author proposed and accepted amendment -> successor fact created and `brain_version` bumped.
3. Valid receipt confirmed with initial generation succeeding (`status == 'completed'`, 1 provider call).
4. Tampered `edited_payload["fact_value"]` in PostgreSQL `narrative.proposal_decisions`.
5. Reset provider call recorder (`provider.payloads.clear()`).
6. Called `writing_service.preview_context` -> failed closed raising `WorldRuleLineageError(code='WORLD_RULE_SUCCESSOR_UNVERIFIED')`.
7. Called `writing_service.start_generation` -> failed closed with `status='failed'`, `stage='security_blocked'`, `error={'code': 'WRITING_CONTEXT_AUTHORITY_DENIED'}`.
8. Asserted **`len(provider.payloads) == 0`** (strictly zero fake-provider calls under tampered receipt).
9. Restored valid receipt -> generation succeeded again (`status == 'completed'`).

### 3.2 Playwright Browser E2E Tests (`web/tests/p2-07f-ux05-world-amendment.browser.test.mjs`)
All **8 / 8** browser tests passed cleanly:
```
--- TEST 1: View Canon Rules & Verify Badges & Immutability ---
✓ UX-05: Canon rules and immutability status badges rendered properly!

--- TEST 2: Open Propose Form & Verify Lock Immutability Notice ---
✓ UX-05: Lock immutability notice verified (no lock toggle controls exist)!

--- TEST 3: Verify Draft Persistence Across Page Reload ---
✓ UX-05: Local draft persistence and recovery verified successfully!

--- TEST 4: CAS Conflict Handling (409) ---
✓ UX-05: CAS 409 conflict handled gracefully with draft preserved!

--- TEST 5: Submit Proposal & Render Before/After Comparison ---
✓ UX-05: Before/After comparison cards rendered with exact accuracy!

--- TEST 6: Author Decision — Reject Proposal ---
✓ UX-05: Reject decision preserved parent Canon intact!

--- TEST 7: Author Decision — Accept Proposal & Canon Promotion ---
✓ UX-05: Accept decision promoted successor to Canon and bumped Brain Version to v2!

--- TEST 8: Lineage & History Modal Inspection ---
✓ UX-05: Lineage and proposal audit trail modal verified!

ALL 8 UX-05 BROWSER REGRESSION TESTS PASSED CLEANLY!
✔ P2-07F Regression: UX-05 Author IDE World Rules Amendment & CAS Lifecycle (8431.2932ms)
```

### 3.3 Visual Evidence Artifacts
Screenshots captured and stored at `docs/development/p2/evidence/p2-07f/`:
1. `ux05-canon-rules-view.png`: Approved Canon rules with `Bất biến (Locked)` and `Quy tắc chuẩn` badges.
2. `ux05-cas-409-conflict.png`: Graceful CAS 409 conflict alert with draft preservation.
3. `ux05-before-after-comparison.png`: Side-by-side Before/After comparison cards.
4. `ux05-accepted-canon-promoted.png`: Successor promoted to Canon with updated brain version.
5. `ux05-lineage-history-modal.png`: Lineage generations and proposal audit trail modal.

---

## 4. CI Workflow Integration
Updated `.github/workflows/p2-setup-provenance.yml`:
- Added step `Story Planning Studio UX-05 World Setup Rule Amendments regression (Chromium HTTP mocks)` running `node --test tests/p2-07f-ux05-world-amendment.browser.test.mjs`.
- All tests run strictly with fake providers (`LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`).
