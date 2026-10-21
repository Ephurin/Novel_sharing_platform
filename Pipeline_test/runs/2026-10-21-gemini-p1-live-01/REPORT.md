# Báo cáo Thực thi Pipeline Test P1 — 2026-10-21-gemini-p1-live-01

**Ngày kiểm thử:** 2026-10-21  
**Agent thực thi:** Gemini 3.8 testing agent (Antigravity)  
**Mục tiêu bàn giao độc lập:** ChatGPT / GPT-6 review từ xa trên GitHub  
**Branch:** `codex/ai-copilot-pipeline-test`  
**Git Commit SHA:** `49a4633777452bf01b166baed8816c4c00ae300b`  
**Trạng thái Worktree:** Tuân thủ Section A.4 của `Pipeline_test/P1_LIVE_RESUME_APPROVED_2026-10-21.md` — không sửa source code, prompts, migrations hay fixture để ép pass test  
**Contract tham chiếu:** `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3  
**Hướng dẫn phê duyệt:** `Pipeline_test/P1_LIVE_RESUME_APPROVED_2026-10-21.md`  

---

## 1. Kết quả chính & Trạng thái nghiệm thu

- **Overall verdict:** **`P1_BLOCKED`** (S01 PASS, S02 BLOCKED bởi defect ứng dụng thực tế `ISSUE-PIPELINE-VERIFY-001`)
- **Live Resume Addendum:** Xem chi tiết tại [`LIVE_RESUME_REPORT.md`](LIVE_RESUME_REPORT.md) và [`REVIEW_FINDINGS_CLOSURE.md`](REVIEW_FINDINGS_CLOSURE.md)
- **Offline Preflight & Schema Validation:** **`PASS`** (Tất cả test suite offline, regression 66/66, typecheck, web build và migration head 0012 đạt)
- **Isolated Runtime Stack & Loopback:** **`PASS`** (5 container bind chặt chẽ `127.0.0.1:`, DB `p1_ephurin` sạch)
- **Real Provider & Smoke Test:** **`PASS`** (`gemini-3.5-flash-lite` qua Google AI Studio API, HTTP 200 `pong`)
- **Budget Guard Metering:** **`PASS`** (Trần 200 calls, USD 5.00, 2h; tiêu thụ: 8 calls, USD 0.007379, còn lại 192 calls / USD 4.99)
- **Frozen Gold Materialization:** **`PASS`** (35 narrative assertions G01–G35 và `gold_manifest.json` đã nạp đầy đủ)
- **S01 (Tạo truyện & Nhập ch01–ch05):** **`PASS`** (`novel_id = 423695ca-8d8a-429d-9c80-c19b8ba27856`, 5 chương nháp, content hash hợp lệ, canon sạch)
- **S02 (Lưu hints & Bootstrap trích xuất):** **`BLOCKED`** (Lưu 6 hints version 1 thành công; bootstrap job `5e39578d-435b-5d9e-aaf6-0e486fb9ab4c` dừng do lỗi `ENTITY_VERIFICATION_UNRESOLVED`)
- **S03–S11:** **`NOT_RUN`** (Dừng theo nguyên tắc Section A.4 không sửa mã để ép pass; lưu reproduction bằng chứng và bàn giao review)
- **P2 / P3 / 100k:** **`NOT_RUN`** (Ngoài phạm vi Wave 1)

| Trục đánh giá | Verdict | Evidence | Ghi chú |
|---|---|---|---|
| Git & Fixture Preflight | **PASS** | `Pipeline_test/tools/task_tool.py verify` | SHA `ddef699f35dea11c0659860d8988663ee76856bd1f39f95a70bb89d4befd52eb` |
| AI Service Test Suite | **PASS** | `evidence/python-tests.txt` | 397 passed, 2 skipped, 42 deselected (do filter benchmark/e2e) |
| Entity Audit Regression | **PASS** | `evidence/audit-regression.txt` | 66 passed (candidates, guidance, optimistic locking, recovery) |
| Backend Targeted Tests | **PASS** | `evidence/backend-targeted-tests.txt` | 60 passed, 0 failed (đã đối chiếu đầy đủ theo REV-P1-04) |
| Backend Typecheck | **PASS** | `evidence/backend-typecheck.txt` | `tsc -p tsconfig.json --noEmit` exit 0 |
| Web Production Build | **PASS** | `evidence/web-build.txt` | `tsc -b && vite build` built in 7.18s, dist/ tạo thành công |
| Isolated Database Migration | **PASS** | `evidence/schema-verification.txt` | Alembic `0012_entity_guidance` head, backend 001–012 applied |
| Schema Column Verification | **PASS** | `evidence/schema-verification.txt` | `story_brains.entity_guidance` (JSONB) & `analysis_runs.entity_candidate_audit` (JSONB) |
| Runtime Flag & Loopback | **PASS** | `evidence/runtime-verification.txt` | Loopback `127.0.0.1:` cho cả 5 ports, provider `gemini-3.5-flash-lite` |
| Bounded Provider Smoke | **PASS** | `evidence/provider-smoke.json` | Google AI Studio real call, HTTP 200, output: `pong` (1.595s) |
| Frozen Gold Materialization | **PASS** | `evidence/gold_manifest.json`, `memory_items.csv` | 35 assertions G01–G35 hash `e9e5bb778841bd4e5eb4a0444268a1acc01512860b8ace3c56332d61d5881d0b` |
| S01: Import Manuscript | **PASS** | `evidence/s01-import-readback.json` | 5 chapters imported, revisions snapped, canon 0 entities |
| S02: Initial Extraction | **BLOCKED** | `evidence/s02-verification-unresolved-reproduction.json` | Candidate verification bounded repair exhaustion on real provider |
| S03–S11: Author Workflow | **NOT_RUN** | `checkpoint.json` | Dừng theo quy định governance khi phát hiện defect thực tế |

---

## 2. Bảng tiến độ từng bước S01–S11 (P1 Short Loop)

| Step | Kênh | Expected | Actual | Evidence Path | Verdict | Ghi chú / Blocker |
|---|---|---|---|---|---|---|
| **S01** | API / UI | Nhập ch01–ch05 từ fixture, lưu nháp, đọc lại hash khớp, canon memory sạch | Tạo novel `423695ca-8d8a-429d-9c80-c19b8ba27856`, 5 chapters, 5 revisions snapped, canon 0 entities/events/facts | `evidence/s01-import-readback.json` | **PASS** | Action `ACT-S01-01` |
| **S02** | API / UI | Lưu optional hints, khởi động trích xuất, dừng tại `waiting_entity_review` | Lưu 6 hints thành công (version 1); bootstrap ch01 fail tại candidate verification do `_validate` từ chối `canonical_name` trên non-entity | `evidence/s02-verification-unresolved-reproduction.json` | **BLOCKED** | `ISSUE-PIPELINE-VERIFY-001` |
| **S03** | API / UI | Tác giả duyệt entity, loại “an toàn”, rerun entity riêng, continue event/fact, duyệt canon/baseline, audit P1-M0 | Dừng tại S02 per Section A.4 | `checkpoint.json` | **NOT_RUN** | Chờ fix blocker sau review |
| **S04** | Web UI | Mở các tab memory, reload, kiểm tra context readback | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S05** | Web UI | Gợi ý event kế tiếp, sửa 1 gợi ý, bỏ 1 gợi ý, chỉ event chọn vào plan | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S06** | Web UI | Duyệt kế hoạch, reload, planned event chưa thành lịch sử | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S07** | Web UI | Viết tiếp và lưu chương mới qua editor, tự động enqueue extraction | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S08** | Web UI | Chờ entity checkpoint, duyệt và continue event/fact, duyệt canon | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S09** | Web UI | Lưu sửa nhanh 2 lần liên tiếp, kiểm tra idempotency | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S10** | Web UI | Consistency check phát hiện mâu thuẫn được cài cắm, sửa qua UI | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **S11** | Web UI | Reload, audit M-FIRST và final, chương vẫn là nháp | Dừng tại S02 | `checkpoint.json` | **NOT_RUN** | Ngoài phạm vi sau S02 |
| **P2** | - | Setup idea bootstrap | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |
| **P3** | - | Autonomous loop | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |
| **100k** | - | Viết tiểu thuyết 100.000 từ | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |

---

## 3. Phân tích Chi tiết Blocker: `ISSUE-PIPELINE-VERIFY-001`

### Hiện tượng & Root Cause
Tại bước **S02**, bootstrap manuscript gọi AI service trích xuất chương 1:
1. LLM discovery trích xuất các cụm từ (2 calls, ~3200 tokens) -> 179 candidates được thu thập.
2. Candidate verification chia batch 24 items và gửi đến real `gemini-3.5-flash-lite`.
3. System prompt trong `ai-service/services/entity_pipeline/verification.py` quy định:
   > `"canonical_name must be an exact known canonical name or a supplied surface."`
4. Gemini tuân thủ prompt và đánh giá chính xác ngữ nghĩa:
   - Các từ không phải thực thể (`"Chương"`, `"Bến"`, `"Chiếc"`, `"Ở"`, `"Mười"`, `"Mỗi"`, `"Bây"`, `"Một"`, `"Cô"`, `"Bánh"`, `"Người"`, `"Đừng"`): set `verdict="not_entity"`, `canonical_name=candidate.surface`, `entity_type=None`.
   - Thực thể thực sự (`"Linh"`): set `verdict="entity"`, `canonical_name="Mai Linh"`, `entity_type="PER"`.
5. Trong `verification.py` dòng 135, hàm `_validate()` kiểm tra:
   ```python
   if d.verdict != 'entity':
       if d.canonical_entity_id or d.canonical_name or d.entity_type or d.initial_status != 'Unknown' or d.status_quote:
           raise ValueError('Rejected/unresolved occurrence cannot carry a resolved identity or status')
       continue
   ```
   Do `d.canonical_name` mang giá trị surface không rỗng (`"Chương"`), validator ném `ValueError`.
6. Vòng lặp bounded repair (tối đa 2 attempts) gửi lại lỗi `validation_error: 'Rejected/unresolved occurrence cannot carry a resolved identity or status'`. Prompt repair không hướng dẫn model rằng đối với `not_entity`, `canonical_name` phải là chuỗi rỗng `""`. Gemini giữ nguyên surface name, làm cạn số lượt thử và ném ngoại lệ:
   ```
   domain.errors.AnalysisOutputError: Candidate decisions are incomplete or invalid after bounded repair.
   ```
7. Bootstrap job `5e39578d-435b-5d9e-aaf6-0e486fb9ab4c` chuyển thành `failed`.

### Bằng chứng tái hiện độc lập
File bằng chứng: [`evidence/s02-verification-unresolved-reproduction.json`](evidence/s02-verification-unresolved-reproduction.json)
- Trace ID bootstrap 1: `b27ac12d-d572-435a-b220-554a308fde66`
- Trace ID bootstrap 2 (repair): `9f22d104-90be-4bec-a9f0-a6f687d90305`
- Trace ID tái hiện độc lập: `14c45e11-e3b1-4e2e-86da-d5c2568163f0`

### Tuân thủ Governance
Theo Section A.4 của `P1_LIVE_RESUME_APPROVED_2026-10-21.md`:
> *"Tuyệt đối không silently sửa application logic, narrative gold manifests, hoặc unit test assertions để ép pass test trong quá trình chạy evidence. Nếu phát hiện defect thực tế của application/pipeline, phải document reproduction, dừng ở bước đó, và checkpoint là P1_BLOCKED:<reason> để review độc lập."*

Hệ thống đã dừng đúng tại S02, không sửa `verification.py` một cách tùy tiện, bảo toàn toàn bộ state và volume để phục vụ GPT-6 review độc lập.

---

## 4. Báo cáo Ngân sách (Budget Consumption)

- **Trần được duyệt:** 200 provider calls, USD 5.00, 2h live window.
- **Tiêu thụ thực tế:**
  - Call 1: Smoke preflight test (`pong`, 5 prompt + 2 candidate tokens) — USD 0.000001
  - Call 2: Bootstrap Ch01 discovery chunk 1 (1324 prompt + 551 candidate tokens) — USD 0.000353
  - Call 3: Bootstrap Ch01 discovery chunk 2 (686 prompt + 670 candidate tokens) — USD 0.000337
  - Call 4: Bootstrap Ch01 candidate verification attempt 1 (5822 prompt + 3264 candidate tokens) — USD 0.001888
  - Call 5: Bootstrap Ch01 candidate verification attempt 2 repair (9405 prompt + 3118 candidate tokens) — USD 0.002188
  - Call 6: Repro extraction chunk 1 (1324 prompt + 558 candidate tokens) — USD 0.000356
  - Call 7: Repro extraction chunk 2 (686 prompt + 892 candidate tokens) — USD 0.000425
  - Call 8: Repro verification batch 0 (5710 prompt + 3151 candidate tokens) — USD 0.001831
  - **Tổng cộng:** **8 / 200 calls** (4.0% hạn mức), **USD 0.007379 / USD 5.00** (0.15% hạn mức).
  - Tất cả các cuộc gọi đều được kiểm soát bởi `budget_guard.py` và lưu trữ chi tiết trong `budget_state.json`.

---

## 5. Danh sách Issue & Blocker (Issues Ledger)

| Mã Issue | Mức độ | Phân hệ | Mô tả | Workaround / Giải pháp đề xuất | Trạng thái |
|---|---|---|---|---|---|
| **ISSUE-PIPELINE-VERIFY-001** | `BLOCKER` | Pipeline Verification | System prompt yêu cầu `canonical_name` là known name hoặc supplied surface, nhưng `_validate` cấm tuyệt đối non-empty `canonical_name` khi `verdict != 'entity'`. Bounded repair lặp lại lỗi trên real Gemini 3.5 Flash-Lite. | Cập nhật system prompt và repair hint trong `verification.py`: nếu verdict không phải entity, `canonical_name` BẮT BUỘC phải là chuỗi rỗng `""`. | **OPEN (BLOCKED)** |
| **ISSUE-BUDGET-001** | `BLOCKER` | Budget Guard | Cần phê duyệt ngân sách tường minh trước khi gọi live provider. | Đã được phê duyệt trong `P1_LIVE_RESUME_APPROVED_2026-10-21.md` và kiểm soát qua `budget_guard.py`. | **RESOLVED** |
| **ISSUE-ENV-LINEEND-001** | `LOW` | Environment | Line ending CRLF vs LF trên Windows. | Đã xử lý với git `core.autocrlf false`. | **RESOLVED** |
| **REV-P1-01 .. 08** | `VARIOUS` | Review Findings | 8 finding preflight từ GPT-6 review. | Đã đóng toàn bộ với append-only evidence. | **RESOLVED** |
| **REV-P1-09** | `INFO` | Execution Gate | Thực thi S01–S11 live. | S01 PASS, S02 dừng do `ISSUE-PIPELINE-VERIFY-001`. | **BLOCKED** |

---

## 6. Bàn giao độc lập cho GPT-6 Review

1. **Cam kết an toàn dữ liệu:**
   - Stack `p1-live-01` và các volume `p1-live-01_p1_live_01_postgres_data`, `p1-live-01_p1_live_01_mongodb_data` được bảo toàn nguyên vẹn.
   - **Tuyệt đối không chạy `docker compose down -v`**.
2. **Dữ liệu trong Database:**
   - Novel `Gió Thoảng Qua Phố Cổ` (`novel_id = 423695ca-8d8a-429d-9c80-c19b8ba27856`) và 5 chương nháp vẫn lưu trữ đầy đủ trong PostgreSQL `127.0.0.1:25432`.
   - Entity guidance (6 hints) đã lưu ở version 1 trong bảng `story_brains`.
3. **Các file cần review:**
   - `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/evidence/s02-verification-unresolved-reproduction.json`
   - `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/actions.csv`
   - `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/budget_state.json`
   - `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/checkpoint.json`
   - `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/validation.json`
