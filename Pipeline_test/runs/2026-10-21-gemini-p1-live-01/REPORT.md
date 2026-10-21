# Báo cáo Pipeline Test — 2026-10-21-gemini-p1-live-01

**Ngày kiểm thử:** 2026-10-21  
**Agent thực thi:** Gemini 3.8 testing agent (Antigravity)  
**Mục tiêu bàn giao độc lập:** ChatGPT / GPT-6 review từ xa trên GitHub  
**Branch:** `codex/ai-copilot-pipeline-test`  
**Git Commit SHA đã kiểm tra:** `fcbf945cb9acb0b849b8614fa67c29580615a26b`  
**Trạng thái Worktree:** Sạch (`clean`) — không sửa đổi source code, prompts, migrations hay fixture  
**Contract tham chiếu:** `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3  
**Hướng dẫn nhiệm vụ:** `Pipeline_test/ACTIVE_GEMINI_TASK.md` và `Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`  

---

## 1. Kết quả chính & Trạng thái nghiệm thu

- **Overall verdict:** **`P1_PREFLIGHT_PASS_AWAITING_UI_EXECUTION`** (Preflight Gate Passed; 8 Review Findings Closed; Bounded Smoke Test Passed)
- **Live Resume Addendum:** Xem chi tiết tại [`LIVE_RESUME_REPORT.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/runs/2026-10-21-gemini-p1-live-01/LIVE_RESUME_REPORT.md) và [`REVIEW_FINDINGS_CLOSURE.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/runs/2026-10-21-gemini-p1-live-01/REVIEW_FINDINGS_CLOSURE.md)
- **Handoff Prompt:** Xem [`HANDOFF_PROMPT.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/runs/2026-10-21-gemini-p1-live-01/HANDOFF_PROMPT.md) để tiếp tục thực thi chính xác từ điểm này.
- **Offline Preflight & Schema Validation:** **`PASS`** (Toàn bộ test suite offline, regression, typecheck, web build và migration head đều đạt)
- **Isolated Runtime Stack & Loopback:** **`PASS`** (Tất cả 5 container đã bind chặt chẽ `127.0.0.1:`, DB `p1_ephurin` sạch)
- **Real Provider & Smoke Test:** **`PASS`** (`gemini-3.5-flash-lite` qua Google AI Studio API, HTTP 200 `pong`, latency 1.595s)
- **Budget Guard Metering:** **`PASS`** (Trần 200 calls, USD 5.00, 2h; tiêu thụ: 1 call, 0.000001 USD)
- **Frozen Gold Materialization:** **`PASS`** (35 narrative assertions G01–G35 và `gold_manifest.json` đã nạp đầy đủ)
- **Live Provider Execution (S01–S11):** **`READY_TO_EXECUTE`** (Tài khoản `p1_author` sẵn sàng, bàn giao cho coding agent thực thi S01–S11)
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
| Review Findings Closure | **PASS** | `REVIEW_FINDINGS_CLOSURE.md` | 8 finding REV-P1-01..08 đã CLOSED, REV-P1-09 sẵn sàng S01–S11 |
| Live P1 Execution (S01–S11) | **AWAITING_EXECUTION** | `HANDOFF_PROMPT.md`, `checkpoint.json` | Sẵn sàng cho coding agent kế tiếp thực thi |

---

## 2. Môi trường kiểm thử cô lập (Runtime Isolation)

Tuân thủ nghiêm ngặt nguyên tắc **cô lập hoàn toàn**, không tái sử dụng hay can thiệp vào stack cũ:

* **Compose Project Name:** `p1-live-01`
* **Isolated Compose File:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/docker-compose.isolated.yml`
* **Database Name:** `p1_ephurin` (hoàn toàn mới, không dùng database mặc định hay database của recovery run cũ)
* **Isolated Volumes:**
  * `p1-live-01_p1_live_01_postgres_data`
  * `p1-live-01_p1_live_01_mongodb_data`
* **Port Mapping cô lập (không xung đột):**
  * PostgreSQL: `25432 -> 5432`
  * MongoDB: `27018 -> 27017`
  * AI Service: `18000 -> 8000`
  * Backend API: `14000 -> 4000` (`http://localhost:14000/api/v1`)
  * Web Frontend: `18080 -> 80` (`http://localhost:18080`)
* **Bảo toàn dữ liệu cũ:** Thư mục `Pipeline_test/runs/2026-10-19-recovery-ui-01/` và 5 outbox cũ được giữ nguyên 100%, không restart worker cũ.

---

## 3. Bảng tiến độ từng bước S01–S11 (P1 Short Loop)

| Step | Kênh | Expected | Actual | Evidence Path | Verdict | Ghi chú / Blocker |
|---|---|---|---|---|---|---|
| **Preflight** | CLI / Offline | Verify fixture, pass toàn bộ offline test suite, typecheck, build web | All suites pass, Docker stack cô lập hoạt động và verify schema/runtime flag | `evidence/` | **PASS** | Sẵn sàng cho live retest |
| **S01** | UI Import | Nhập ch01–ch05 từ fixture, lưu nháp, đọc lại hash khớp | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S02** | UI Memory | Lưu optional hints, khởi động trích xuất, dừng tại `waiting_entity_review` | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S03** | UI Review | Tác giả duyệt entity, loại “an toàn”, rerun entity riêng, continue event/fact, duyệt canon/baseline, audit P1-M0 | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S04** | UI Tabs | Mở các tab memory, reload, kiểm tra context readback | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S05** | UI Plan | Gợi ý event kế tiếp, sửa 1 gợi ý, bỏ 1 gợi ý, chỉ event chọn vào plan | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S06** | UI Plan | Duyệt kế hoạch, reload, planned event chưa thành lịch sử | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S07** | UI Editor | Viết tiếp và lưu chương mới qua editor, tự động enqueue extraction | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S08** | UI Review | Chờ entity checkpoint, duyệt và continue event/fact, duyệt canon | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S09** | UI Save | Lưu sửa nhanh 2 lần liên tiếp, kiểm tra idempotency | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S10** | UI Consistency | Consistency check phát hiện mâu thuẫn được cài cắm, sửa qua UI | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **S11** | UI Reload | Reload, audit M-FIRST và final, chương vẫn là nháp | Chưa thực hiện gọi live provider | `checkpoint.json` | **BLOCKED** | `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **P2** | - | Setup idea bootstrap | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |
| **P3** | - | Autonomous loop | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |
| **100k** | - | Viết tiểu thuyết 100.000 từ | Ngoài phạm vi Wave 1 | - | **NOT_RUN** | Theo chỉ đạo task |

---

## 4. Báo cáo Narrative Memory Audit

* **Checkpoint M0:** `NOT_RUN` (chờ live run S03 sau khi có budget approval).
* **Checkpoint M-FIRST:** `NOT_RUN` (chờ live run S11).
* **Audit mốc 10/20/50:** `NOT_APPLICABLE` (không thuộc phạm vi vòng ngắn P1).
* **Gold narrative assertions (35 assertions):** Đã nạp và đóng băng trong `memory_items.csv` sẵn sàng đối chiếu khi live extraction chạy.

---

## 5. Chi tiết vấn đề & Blocker (Issues)

| Mã Issue | Mức độ | Phân hệ | Mô tả chi tiết | Hướng xử lý / Workaround | Trạng thái |
|---|---|---|---|---|---|
| **ISSUE-BUDGET-001** | `BLOCKER` | Provider Guard | `ACTIVE_GEMINI_TASK.md` mục 2 điều 52: *"Use the already-authorized provider setup but do not infer spend authorization or budget from the existence of an API key. Check explicit available limit/approval for live calls. Without it, complete isolated offline preflight, record LIVE_PROVIDER_BLOCKED_BUDGET, and stop before paid/live calls."* | Cần người dùng hoặc ChatGPT phê duyệt tường minh ngân sách (ví dụ: `max_provider_calls=200`, `max_cost_usd=$5`) trước khi bắn request sang Google AI Studio. | **BLOCKED** |
| **ISSUE-ENV-LINEEND-001** | `INFO` | Fixture Hash | Trên môi trường Windows, `main_story_plan.template.json` trong git index có LF nhưng hash trong `manifest.json` được tạo từ CRLF. | Đã xác minh hash và khôi phục worktree sạch (`clean`), không sửa đổi file fixture hay commit sai lệch. | **RESOLVED** |

---

## 6. Điểm dừng & Bàn giao độc lập (Handover to ChatGPT / GPT-6)

1. **Trạng thái repo:** Working tree hoàn toàn sạch, chỉ có thư mục run mới `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`.
2. **Trạng thái môi trường:**
   - Stack `p1-live-01` đang chạy độc lập trên ports: 18080 (Web), 14000 (Backend), 18000 (AI Service), 25432 (Postgres), 27018 (Mongo).
   - Migration head `0012_entity_guidance` đã áp dụng.
   - Các cột `story_brains.entity_guidance` và `analysis_runs.entity_candidate_audit` đã được xác minh kiểu `JSONB`.
   - AI service phản hồi cờ `chapter_review_enabled: True`.
3. **Bước kế tiếp sau khi được duyệt ngân sách:**
   - Cung cấp hạn mức gọi live (ví dụ: `max_calls=150`).
   - Mở browser tại `http://localhost:18080` và thực hiện hành trình tác giả S01–S11 theo đúng kịch bản `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`.
