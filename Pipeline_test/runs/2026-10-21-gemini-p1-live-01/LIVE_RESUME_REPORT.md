# P1 Live Execution Report — S01 PASS & S02 Candidate Verification Blocker

**Run ID:** `2026-10-21-gemini-p1-live-01`  
**Governing Documents:**
- `Pipeline_test/P1_LIVE_RESUME_APPROVED_2026-10-21.md` (Project Owner explicit authorization)
- `Pipeline_test/reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md` (GPT-6 Independent Review)
- `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3
- `Pipeline_test/SHORT_LOOP_TEST.md`
- `Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`

**Branch:** `codex/ai-copilot-pipeline-test`  
**Head Commit:** `49a4633777452bf01b166baed8816c4c00ae300b`  
**Status:** `P1_BLOCKED`  
**Current Blocker:** `ISSUE-PIPELINE-VERIFY-001` (Candidate verification bounded repair exhaustion on real provider)  
**Wave Scope:** P1 only (P2, P3, and 100k generation are strictly **NOT_RUN**).

---

## 1. Budget Authorization & Metering Summary

- **Approved By:** Project Owner in ChatGPT on 2026-10-21.
- **Approval Reference:** `User explicit P1 budget authorization in ChatGPT on 2026-10-21`
- **Ceilings Enforced:**
  - Max Provider-Call Attempts: **200** (hard stop before call 201)
  - Max Monetary Spend: **USD 5.00** (admission stop at USD 4.50)
  - Max Wall-Clock Time: **2.0 hours** (7200 seconds) from first provider call
- **Current Usage (Cumulative):**
  - Live Provider Calls: **8** (1 preflight smoke + 4 bootstrap attempt 1 & 2 + 3 reproduction trace)
  - Successful Provider Calls: **8**
  - Cumulative Spent: **USD 0.007379** (pricing reference: Google AI Studio Gemini 3.5 Flash-Lite: $0.10/M input, $0.40/M output)
  - Remaining Calls: **192 / 200**
  - Remaining Budget: **USD 4.992621 / USD 5.00**
  - Live Started At: `2026-10-21T03:47:52.543771+00:00`
  - Live Deadline At: `2026-10-21T05:47:52.543771+00:00`
  - Meter Status: `ACTIVE` (`budget_guard.py` tracking via `budget_state.json`)

---

## 2. Review Findings Closure Status (REV-P1-01 through REV-P1-09)

All 8 technical blockers and review findings from `reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md` remain closed with append-only evidence:
- `REV-P1-01` (Real Provider Configured): **CLOSED** (`evidence/provider-smoke.json`)
- `REV-P1-02` (Budget Approval & Enforcement): **CLOSED** (`budget_guard.py`, `budget_state.json`)
- `REV-P1-03` (Loopback Network Isolation): **CLOSED** (`127.0.0.1:`, `evidence/runtime-verification.txt`)
- `REV-P1-04` (Backend Test Count Reconciliation): **CLOSED** (60 tests passed, `REVIEW_FINDINGS_CLOSURE.md`)
- `REV-P1-05` (Accurate Suite Coverage Labeling): **CLOSED** (targeted unit/integration, 397 pass, 42 deselected)
- `REV-P1-06` (Frozen Gold Materialization): **CLOSED** (35 assertions G01–G35 in `memory_items.csv` and `gold_manifest.json`)
- `REV-P1-07` (Issue Ledger Integrity): **CLOSED** (`issues.csv` maintained)
- `REV-P1-08` (Teardown Safety): **CLOSED** (No `docker compose down -v`; state preserved)
- `REV-P1-09` (S01–S11 Execution Boundary): **BLOCKED at S02** by `ISSUE-PIPELINE-VERIFY-001`

---

## 3. P1 Journey Execution Status Matrix (S01–S11)

| Step | Thao tác | Kênh thực hiện | Trạng thái | Ghi chú & Bằng chứng |
|---|---|---|---|---|
| **S01** | Tạo truyện "Gió Thoảng Qua Phố Cổ", import ch01–ch05 từ fixture, snapshot revisions, verify readback | API / UI | **PASS** | `novel_id = 423695ca-8d8a-429d-9c80-c19b8ba27856`. 5 chương nháp, content hash hợp lệ, canon memory sạch (0 entities, 0 events, 0 facts). Bằng chứng: `evidence/s01-import-readback.json`. Action: `ACT-S01-01`. |
| **S02** | Lưu hints tăng cường (An, Mai Linh, trạm Bốn, CV-04, linh, Thanh Hằng), trích xuất ban đầu, quan sát waiting_entity_review | API / UI | **BLOCKED** | Lưu hints thành công (version 1, 6 entries). Khởi động bootstrap manuscript (`job_id = 5e39578d-435b-5d9e-aaf6-0e486fb9ab4c`). LLM discovery hoàn tất. Tại bước candidate verification chương 1, gặp `AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED')`. Bằng chứng: `evidence/s02-verification-unresolved-reproduction.json`. Action: `ACT-S02-01`. |
| **S03** | Duyệt human entity review (loại An an toàn, chuẩn hóa Linh -> Mai Linh), rerun entity riêng, continue event/fact, duyệt canon M0 | API / UI | **NOT_RUN** | Dừng theo quy định Section A.4 của `P1_LIVE_RESUME_APPROVED_2026-10-21.md` khi gặp defect ứng dụng thực tế. |
| **S04** | Mở các tab (Nhân vật, Địa danh, Vật phẩm, Sự kiện, Dữ kiện) | Web UI | **NOT_RUN** | Chờ S03 giải quyết |
| **S05** | Yêu cầu gợi ý AI event kế tiếp, sửa 1, bỏ 1 | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S06** | Duyệt kế hoạch, reload, kiểm tra context không leak | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S07** | Viết tiếp/lưu chương 6 qua editor bình thường | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S08** | Duyệt checkpoint entity chương 6, continue event/fact, duyệt canon | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S09** | Lưu sửa nhanh 2 lần, kiểm tra idempotency | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S10** | Chạy consistency check với chi tiết mâu thuẫn | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S11** | Tải lại trang, audit M-FIRST và final memory | Web UI | **NOT_RUN** | Ngoài phạm vi sau S02 |

---

## 4. Root Cause Analysis của `ISSUE-PIPELINE-VERIFY-001`

### Mô tả hiện tượng
Trong quá trình chạy bootstrap manuscript từ chương 1 đến chương 5:
- AI service gọi discovery 2 chunks bằng `gemini-3.5-flash-lite`: thành công, thu về 179 candidates (bao gồm cả các từ đầu câu viết hoa hoặc từ thông dụng như `"Chương"`, `"Bến"`, `"Chiếc"`, `"Ở"`, `"Mười"`, `"Mỗi"`, `"Bây"`, `"Một"`, `"Cô"`, `"Bánh"`, `"Người"`, `"Đừng"`, v.v.).
- Candidate verification tiến hành verify batch đầu tiên (24 items).
- Model Gemini 3.5 Flash-Lite trả lời đúng bản chất ngữ nghĩa:
  - `"Linh"` -> `verdict="entity"`, `canonical_name="Mai Linh"`, `entity_type="PER"`.
  - `"Chương"` -> `verdict="not_entity"`, `canonical_name="Chương"`, `entity_type=None`.
  - `"Bến"` -> `verdict="not_entity"`, `canonical_name="Bến"`, `entity_type=None`.
- Tuy nhiên, hàm validation `_validate()` trong `ai-service/services/entity_pipeline/verification.py` (dòng 135) có điều kiện:
  ```python
  if d.verdict != 'entity':
      if d.canonical_entity_id or d.canonical_name or d.entity_type or d.initial_status != 'Unknown' or d.status_quote:
          raise ValueError('Rejected/unresolved occurrence cannot carry a resolved identity or status')
      continue
  ```
- Do `d.canonical_name` mang chuỗi bề mặt `candidate.surface` (theo prompt hướng dẫn `"canonical_name must be an exact known canonical name or a supplied surface"`), `_validate()` tung `ValueError`.
- Cơ chế bounded repair gọi tiếp attempt 2 với thông báo lỗi `validation_error: 'Rejected/unresolved occurrence cannot carry a resolved identity or status'`. Vì prompt repair không nói rõ phải để `canonical_name=""` cho các non-entity, Gemini tiếp tục điền surface name, làm hết số lần retry (2 attempts) và ném ngoại lệ `AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED')`.
- Bootstrap job chuyển trạng thái `status: failed`.

### Tại sao Unit Test Mock không phát hiện ra
Trong `tests/test_entity_candidates.py`, bộ mock `Verifier` trả về `canonical_name=""` cố định cho các quyết định `not_entity`. Khi kết nối với provider thật (`gemini-3.5-flash-lite`), mô hình tuân thủ sát sao chỉ dẫn văn bản của system prompt và đặt tên surface vào `canonical_name`.

### Tuân thủ Governance
Theo Section A.4 của `P1_LIVE_RESUME_APPROVED_2026-10-21.md`:
> *"Tuyệt đối không silently sửa application logic, narrative gold manifests, hoặc unit test assertions để ép pass test trong quá trình chạy evidence. Nếu phát hiện defect thực tế của application/pipeline, phải document reproduction, dừng ở bước đó, và checkpoint là P1_BLOCKED:<reason> để review độc lập."*

Hệ thống đã dừng lại đúng tại bước S02, ghi nhận đầy đủ bằng chứng tái hiện tại `evidence/s02-verification-unresolved-reproduction.json`, và bàn giao cho GPT-6 review độc lập.
