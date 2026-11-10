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

### 3.2 Playwright Browser Regression Tests (`web/tests/p2-07f-ux05-world-amendment.browser.test.mjs`)
Fully updated with high-fidelity stateful mock server enforcing real P2-07E invariants (CAS checks, strict idempotency with fingerprint matching, M0 provenance check returning 422 for non-setup facts, pre-M0 guard, and true append-only factsDb).
All **5 / 5** comprehensive regression scenarios passed cleanly:
```
--- SCENARIO 1: UXF-03 Pre-M0 Guard & Sync Upon M0 Activation ---
✓ UXF-03: Pre-M0 guard verified (propose actions hidden before M0 activation)!
✓ UXF-03: Manager automatically synchronized to active M0 and Brain v2!

--- SCENARIO 2: UXF-01 Same-Key Isolation & Ineligible Facts ---
✓ UXF-01: Non-setup P1 rule rendered as read-only with propose/history hidden!
✓ UXF-01: Root B remains completely isolated from Root A despite identical fact_key!

--- SCENARIO 3: UXF-02 Fingerprint Idempotency, 409 Rebase & 503 Reconcile ---
✓ UXF-02b: Rebase failure on GET /memory handled cleanly (409 retained, draft intact)!
✓ UXF-02b: Rebase failure on GET history handled cleanly (409 retained, draft intact)!
✓ UXF-02b: Rebase succeeded upon recovery with 100% draft preservation!
✓ UXF-02a: Editing draft after 503 properly blocks reconcile with stale snapshot!
✓ UXF-02a: Exact idempotent replay verified with zero duplicate writes!

--- SCENARIO 4: Competing Decision Conflict, Reject & Canon Promotion ---
✓ UXF-02a: Competing decision conflict detected, draft preserved, no false success!
✓ Rejection confirmed on server, parent Canon preserved intact on Root A!
✓ Accept decision promoted successor to Canon and bumped Brain Version to v3!

--- SCENARIO 5: Lineage & History Modal Inspection ---
✓ Lineage chain and proposal audit trail modal verified!

ALL UXF-01, UXF-02, UXF-03 REGRESSION SCENARIOS PASSED 100% CLEANLY!
✔ P2-07F Regression: UXF-01/02/03 Author IDE World Rules Amendment Lifecycle (8914.8336ms)
```

### 3.3 Visual Evidence Artifacts
Screenshots captured and stored at `docs/development/p2/evidence/p2-07f/`:
1. `ux05-m0-pre-activation.png`: Banner cảnh báo mốc M0 chưa kích hoạt, ẩn toàn bộ nút đề xuất hiệu chỉnh (UXF-03).
2. `ux05-same-key-isolation.png`: Phân lập tuyệt đối giữa hai root cùng `fact_key`, hiển thị thẻ đề xuất độc lập và quy tắc P1 ngoài M0 chỉ đọc (UXF-01).
3. `ux05-cas-409-rebase.png`: Xung đột CAS 409 với nút Rebase làm mới phiên bản máy chủ và bảo toàn 100% bản nháp (UXF-02).
4. `ux05-lineage-history-modal.png`: Modal lịch sử hiệu chỉnh hiển thị phả hệ đa thế hệ (Lineage) và nhật ký đề xuất kiểm toán.
5. `ux05-full-regression-complete.png`: Toàn cảnh hoàn tất 5 kịch bản hồi quy sau khi chấp thuận đề xuất và thăng cấp successor lên Canon.

---

## 4. Resolution of GPT-6 Review Findings (R1 & R2)

### 4.1 UXF-01: Proposal Management by Fact UUID & Lineage Isolation (PASS in R1)
- Proposals, pending decision cards, and amendment forms are keyed strictly by Fact UUID (`fact_id`), completely removing `fact_key` collisions.
- Same-key roots (e.g. two setup rules both having `fact_key: 'world_rule_gravity'`) remain strictly isolated; proposing on Root A does not trigger or affect Root B.
- Non-setup World Rules (e.g. general P1 facts) fail-closed via M0 setup root verification (`getWorldRuleAmendments` returning 422/404) and render as read-only with badge `Không thuộc thiết lập M0 (Chỉ đọc)`. Propose and history actions are hidden.
- History loading errors are rendered in an inline Mantine Alert with a retry button instead of being silently swallowed.

### 4.2 UXF-02: Fingerprint-bound CAS & Idempotency Protocol (Updated for R2)

#### UXF-02a (P1): 503/504 Reconciliation & Competing Decision Conflict
- **Immutable In-Flight Request Identity:** Trước khi gửi request (propose hoặc decide), client lưu trữ snapshot bất biến của request (`lastSubmittedRef` / `lastSubmittedDecisionRef`) gồm `novelId`, `factId`/`proposalId`, `decision`/`replacement_text`, `reason`/`private_notes`, `expected_brain_version` và `idempotency_key`.
- **Ràng buộc xác thực theo Idempotency Replay:** Khi gặp 503/504 hoặc khi bấm "Kiểm tra đồng bộ máy chủ", client thực hiện đối chiếu bằng cách tái phát yêu cầu với đúng `idempotency_key` và payload đã lưu. Chỉ khi máy chủ xác thực thành công (200 OK với receipt tương ứng) thì client mới xác nhận đồng bộ. Không bao giờ nhận nhầm proposal của phiên khác chỉ dựa trên text trùng khớp.
- **Phát hiện chỉnh sửa bản nháp sau 503:** Nếu tác giả chỉnh sửa form sau khi gặp 503, việc bấm "Kiểm tra đồng bộ máy chủ" sẽ cảnh báo bản nháp đã thay đổi và yêu cầu bấm gửi mới với khóa giao dịch mới.
- **Nhận diện Xung đột Quyết định Cạnh tranh (Competing Decision Conflict):** Trong quá trình quyết định (accept/reject), nếu yêu cầu bị gián đoạn mạng (503) và trong thời gian đó một phiên khác đã đưa ra quyết định khác (ví dụ phiên khác `reject` trong khi client gửi `accept`, hoặc khác lý do), giao diện phát hiện chính xác và hiển thị cảnh báo `Xung đột quyết định (Competing Decision)`. Client **giữ nguyên bản nháp quyết định** và **không bao giờ gọi callback hoàn tất giả mạo**.
- **Sửa ánh xạ trạng thái terminal:** Sửa lỗi ép kiểu `target.status` (`accepted` &rarr; `'accept'`, `rejected` &rarr; `'reject'`).

#### UXF-02b (P2): Verified Rebase sau Xung đột CAS (409)
- **Typed `ReloadResult`:** Hàm `reloadRules` trả về đối tượng `ReloadResult` xác định rõ ràng trạng thái thành công (`ok: true` kèm `brainVersion`, `rules`, `pendingProposalsByFactId`, `ineligibleFacts`, `historyErrors`) hoặc thất bại (`ok: false` kèm `error`).
- **Xác nhận Refresh thành công trước khi xóa cảnh báo 409:** Nút "Làm mới phiên bản máy chủ & Giữ bản nháp" (`rebase-retry-btn`) chỉ xóa cảnh báo 409 khi:
  1. `getApprovedMemory` thành công (không bị lỗi 503/mạng).
  2. `getWorldRuleAmendments` cho rule/proposal mục tiêu thành công (không có trong `historyErrors`).
  3. Rule/proposal mục tiêu vẫn còn tồn tại và hợp lệ trong trạng thái mới.
  Nếu refresh thất bại, hệ thống hiển thị thông báo lỗi chi tiết, **giữ nguyên cảnh báo 409 và bảo toàn 100% bản nháp của tác giả**.

#### UXF-02c (P1): Ngăn Safe Retry gửi lại Request cũ và xóa bản nháp mới khi đã chỉnh sửa (R3 Fix)
- **Safe Retry Guard on Edited Draft:** So sánh đối chiếu bản nháp chuẩn hóa hiện tại (`replacement_text` và `private_notes` trong Propose, `reason` trong Decision) với snapshot yêu cầu bất biến đã lưu (`lastSubmittedRef` / `lastSubmittedDecisionRef`).
- **Chặn gửi nhầm và chặn xóa nháp B:** Nếu tác giả đã chỉnh sửa nội dung sau khi gặp lỗi 503/504, thao tác "Thử gửi lại an toàn" (`safe-retry-btn`, `safe-retry-decision-btn`) bị chặn hoàn toàn. Hệ thống không gửi lại request A, không gọi `draft.clear()`, không xóa bản nháp B, và không đưa ra thông báo gây hiểu lầm là B đã được gửi.
- **Phân định rõ ràng giữa xác nhận request cũ và gửi request mới:**
  - Tác giả có thể bấm "Gửi đề xuất sửa" / "Chấp thuận" / "Từ chối" để gửi nội dung B với mã Idempotency Key mới.
  - Hoặc chọn "Xác nhận yêu cầu trước (Bảo lưu bản nháp mới)" (`reconcile-preserve-draft-btn`, `decision-reconcile-preserve-draft-btn`) để thực hiện idempotent replay xác nhận request A trên máy chủ mà **hoàn toàn không xóa bản nháp B**.
- **Verified Competing Refresh:** Nút `competing-refresh-btn` áp dụng đúng pattern verified-rebase: kiểm tra `res.ok` và `historyErrors` của `ReloadResult`. Nếu quá trình refresh trạng thái máy chủ thất bại (ví dụ 503), hệ thống giữ nguyên cảnh báo xung đột quyết định và bảo toàn bản nháp. Chỉ khi refresh thành công mới xóa cảnh báo.

#### UXF-02d (P1): Trực quan hóa, Khôi phục & Xuất bản nháp B trên giao diện qua các thế hệ Fact (R4 Fix)
- **Truy cập trực quan bản nháp bảo lưu (Visual Preserved Draft Affordance):**
  - Khi tác giả xác nhận request A và bảo lưu bản nháp B (cả đề xuất sửa đổi lẫn ghi chú lý do quyết định), bản nháp B không bị giấu kín trong `localStorage` mà được hiển thị nổi bật trực tiếp trên thẻ của quy tắc tương ứng:
    - `preserved-proposal-alert-${rule.fact_id}` hiển thị đầy đủ `replacement_text` và `private_notes`.
    - `preserved-decision-alert-${rule.fact_id}` hiển thị đầy đủ `reason`.
- **Ràng buộc theo danh tính bất biến và phả hệ (Immutable Lineage Binding):**
  - Bản nháp được liên kết với `root_fact_id` và `supersedes_id`. Kể cả khi đề xuất A chuyển sang trạng thái Pending, hoặc sau đó được Chấp thuận và quy tắc được thăng cấp sang thế hệ kế nhiệm (Successor Fact) với Fact UUID mới, bản nháp bảo lưu B **vẫn tự động hiển thị trên thẻ thế hệ mới**, loại bỏ triệt để hiện tượng orphaned draft.
- **Bộ công cụ thao tác toàn diện cho tác giả:**
  1. **Xem trực tiếp:** Toàn bộ nội dung bản nháp/lý do B hiển thị rõ ràng trên giao diện.
  2. **Tải về bản nháp (.json):** Nút `export-preserved-draft-btn` / `export-preserved-decision-btn` cho phép tải file JSON về máy tính.
  3. **Sao chép nội dung:** Nút `copy-preserved-draft-btn` / `copy-preserved-decision-btn` sao chép nhanh vào clipboard.
  4. **Đưa vào ô đề xuất sửa:** Nút `apply-preserved-draft-btn` tự động mở form đề xuất và điền sẵn nội dung B khi quy tắc sẵn sàng.
  5. **Bỏ bản nháp:** Nút `discard-preserved-draft-btn` / `discard-preserved-decision-btn` cho phép tác giả chủ động dọn dẹp khi không còn nhu cầu.
- **Kiểm thử hồi quy Browser thực tế:** Bộ kiểm thử tự động thực hiện thao tác click thực tế `reconcile-preserve-draft-btn` và `decision-reconcile-preserve-draft-btn`, kiểm tra chuyển trạng thái từ Pending đến Successor Fact, xác nhận nội dung B hiển thị chính xác và các nút xuất/sao chép/bỏ bản nháp hoạt động hoàn hảo.

### 4.3 UXF-03: Pre-M0 Guard & Automatic Brain Version Sync (PASS in R1)
- Pre-M0 banner (`data-testid="m0-not-active-banner"`) informs the author that world rules cannot be amended before M0 activation.
- Propose buttons are hidden prior to M0 activation.
- Upon clicking "Kích hoạt thiết lập để bắt đầu viết", the amendment manager automatically detects M0 activation and synchronizes to M0 Active and Brain v2 without requiring manual browser page reload.

---

## 5. CI Workflow Integration
Updated `.github/workflows/p2-setup-provenance.yml`:
- Added step `Story Planning Studio UX-05 World Setup Rule Amendments regression (Chromium HTTP mocks)` running `node --test tests/p2-07f-ux05-world-amendment.browser.test.mjs`.
- All tests run strictly with fake providers (`LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`).

