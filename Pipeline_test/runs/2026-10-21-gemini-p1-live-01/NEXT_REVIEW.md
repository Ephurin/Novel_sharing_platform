# Handover Review — Run 2026-10-21-gemini-p1-live-01

**Reviewer Target:** ChatGPT / GPT-6 (Independent Reviewer via GitHub)  
**Assigned Testing Agent:** Gemini 3.8 inside Antigravity  
**Current Branch:** `codex/ai-copilot-pipeline-test`  

---

## DATED ADDENDUM (2026-10-21 UTC+7) — S02 Live Provider Blocker & Wave 1B Offline Repair

> [!IMPORTANT]
> **Post-Execution State & Blocker Status:**
> - **Current Run Verdict:** `P1_S02_LOCAL_FIX_READY_FOR_REMOTE_REVIEW`
> - **S01:** `S01_API_INTEGRATION_PASS_ONLY; S01_LIVE_UI_NOT_VERIFIED` (5 chapters persisted as drafts via API; live browser UI execution pending a future authorized window).
> - **S02:** `S02_PROVIDER_FAIL` in live run (`ISSUE-PIPELINE-VERIFY-001`, `ENTITY_VERIFICATION_UNRESOLVED`). Prompt/schema contract mismatch reproduced and resolved via narrow offline patch in `ai-service/services/entity_pipeline/verification.py`.
> - **S03–S11, P2, P3, 100k:** `NOT_RUN`.
> - **Budget Window:** The original 2-hour live window expired at `2026-10-21T05:47:52Z` (total 8 calls, ~$0.007379 USD consumed). NO live calls were made in this cycle.
> - **Wave 1B Verification:** 76 offline tests pass (including RED→GREEN prompt-driven candidate reproduction and actionable bounded repair).
> - **Review Document:** Full fix report is at [`Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/GEMINI_FIX_REPORT.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/GEMINI_FIX_REPORT.md).

---

### Historical Preflight Snapshot (2026-10-21T03:47Z, PRESERVED)
*Note: The metadata below records the preflight gate state before S01/S02 execution commenced.*
- **Preflight Code SHA:** `fcbf945cb9acb0b849b8614fa67c29580615a26b`  
- **Preflight Gate Status:** `P1_PREFLIGHT_PASS`  
- **Budget Ceilings Approved:** Max 200 provider calls, USD 5.00, 2h live wall-clock (Approved by project owner 2026-10-21)

## 1. Coverage Matrix (Wave 1 Scope)

| Hạng mục kiểm thử | Trạng thái | Bằng chứng | Ghi chú kỹ thuật |
|---|---|---|---|
| **Git Preflight** | `PASS` | Git porcelain clean, HEAD == origin | Đảm bảo không có uncommitted changes ngoài thư mục run mới |
| **Fixture Integrity** | `PASS` | `task_tool.py verify` | SHA256: `ddef699f35dea11c0659860d8988663ee76856bd1f39f95a70bb89d4befd52eb` |
| **AI-Service Full Suite** | `PASS` | `evidence/python-tests.txt` | 397 PASS, 2 SKIP, 42 DESELECTED (do filter benchmark/e2e), 6 subtests PASS |
| **Entity Review Regression** | `PASS` | `evidence/audit-regression.txt` | 66 PASS (Candidates, Guidance, OptimisticLock, Recovery) |
| **Backend Targeted Suite** | `PASS` | `evidence/backend-targeted-tests.txt` | 60 PASS, 0 FAIL (đã đối chiếu đầy đủ theo REV-P1-04) |
| **Backend Typecheck** | `PASS` | `evidence/backend-typecheck.txt` | TypeScript compilation không có lỗi (`noEmit`) |
| **Web Frontend Build** | `PASS` | `evidence/web-build.txt` | Vite bundle thành công (`dist/` generated, 7.18s) |
| **Isolated Docker Stack & Loopback** | `PASS` | `docker-compose.isolated.yml` | 5 containers bind chặt chẽ vào loopback `127.0.0.1:` (REV-P1-03) |
| **Database Migrations** | `PASS` | `evidence/schema-verification.txt` | Alembic `0012_entity_guidance` head, backend 001–012 applied |
| **Schema Verification** | `PASS` | `evidence/schema-verification.txt` | `story_brains.entity_guidance: JSONB`, `analysis_runs.entity_candidate_audit: JSONB` |
| **Real Provider & Smoke Test**| `PASS` | `evidence/provider-smoke.json` | Google AI Studio `gemini-3.5-flash-lite`, HTTP 200, output: `pong` (1.595s) |
| **Budget Guard Metering** | `PASS` | `budget_guard.py`, `budget_state.json` | Trần 200 calls, $5.00, 2h; tiêu thụ: 1 call, ~0.000001 USD (REV-P1-02) |
| **Frozen Gold Materialization** | `PASS` | `evidence/gold_manifest.json`, `memory_items.csv` | 35 assertions G01–G35 hash `e9e5bb778841bd4e5eb4a0444268a1acc01512860b8ace3c56332d61d5881d0b` |
| **P1 Live Journey (S01–S11)**| `READY` | `checkpoint.json`, `REPORT.md` | Preflight đạt chuẩn, account `p1_author` sẵn sàng, bàn giao cho coding agent |
| **P2 (Idea Bootstrap)** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |
| **P3 (Autonomous Loop)** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |
| **100k Novel Run** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |

---

## 2. Resource Ownership & Cleanup Status

* **Tài nguyên thuộc quyền sở hữu của run này (`2026-10-21-gemini-p1-live-01`):**
  * Containers: `p1-live-01-web`, `p1-live-01-backend`, `p1-live-01-ai-service`, `p1-live-01-postgres`, `p1-live-01-mongodb`.
  * Volumes: `p1-live-01_p1_live_01_postgres_data`, `p1-live-01_p1_live_01_mongodb_data`.
  * Database: `p1_ephurin`.
  * Ports (Loopback only): `127.0.0.1:18080`, `127.0.0.1:14000`, `127.0.0.1:18000`, `127.0.0.1:25432`, `127.0.0.1:27018`.
* **Tài nguyên cũ được bảo toàn nguyên vẹn:**
  * Toàn bộ dữ liệu tại `Pipeline_test/runs/2026-10-19-recovery-ui-01/` và 5 outbox cũ không bị restart hay sửa đổi.
  * Các volume và container khác trên hệ thống không bị ảnh hưởng.
* **Teardown Command & Safety Notice (Superseded per REV-P1-08):**
  > [!CAUTION]
  > **BLANKET `docker compose down -v` IS STRICTLY PROHIBITED** per `ACTIVE_GEMINI_TASK.md` and `REV-P1-08`.
  > Scoped project naming alone does not authorize blanket volume destruction.
  > Final cleanup must only stop containers and verify run ownership individually. Volumes must be preserved until independent audit review is complete.
  ```sh
  # Stop containers without removing volumes:
  docker compose -p p1-live-01 -f Pipeline_test/runs/2026-10-21-gemini-p1-live-01/docker-compose.isolated.yml stop
  ```

---

## 3. Lỗi / Vấn đề phát hiện & Trạng thái đóng Review Findings

Tất cả 8 blocker và findings kỹ thuật từ bản review độc lập GPT-6 (`reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md`) đã được giải quyết triệt để (xem chi tiết tại [`REVIEW_FINDINGS_CLOSURE.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/Pipeline_test/runs/2026-10-21-gemini-p1-live-01/REVIEW_FINDINGS_CLOSURE.md)):

1. `REV-P1-01` (Real Provider): **CLOSED** — Google AI Studio `gemini-3.5-flash-lite`, HTTP 200 `pong`.
2. `REV-P1-02` (Budget Approval & Enforcement): **CLOSED** — Phê duyệt 200 calls, $5.00, 2h; `budget_guard.py` active.
3. `REV-P1-03` (Loopback Isolation): **CLOSED** — Bind chặt chẽ vào `127.0.0.1:` cho cả 5 ports.
4. `REV-P1-04` (Test Count Reconciliation): **CLOSED** — Xác nhận 60 tests PASS trong runner targeted Backend.
5. `REV-P1-05` (Coverage Labeling): **CLOSED** — Phân biệt rõ unit/integration suite vs E2E system.
6. `REV-P1-06` (Frozen Gold Materialization): **CLOSED** — Materialize 35 narrative assertions G01–G35 và `gold_manifest.json`.
7. `REV-P1-07` (Issue Ledger Integrity): **CLOSED** — Ghi nhận đầy đủ issue vào `issues.csv`.
8. `REV-P1-08` (Teardown Safety): **CLOSED** — Cấm hoàn toàn `down -v`, hướng dẫn stop bảo toàn volume.
9. `REV-P1-09` (Execution Gate): **IN_PROGRESS / READY** — Sẵn sàng bàn giao cho coding agent thực thi S01–S11.

---

## 4. Kế hoạch hành động chi tiết cho Coding Agent tiếp nhận (S01–S11)

### Tài nguyên & Thông tin đăng nhập
- **Web UI:** `http://127.0.0.1:18080/login`
- **Username:** `p1_author`
- **Password:** `<CREDENTIAL_CONFIGURED_IN_ENV>`
- **Role:** `AUTHOR` (Database `p1_ephurin` hiện tại đang sạch 0 truyện).
- **Fixture chapters:** `Pipeline_test/input/manuscript/ch01.md` đến `ch05.md`.

### Trình tự thực thi S01–S11:
1. **S01:** Đăng nhập tại `http://127.0.0.1:18080/login`. Tạo truyện "Gió Thoảng Qua Phố Cổ" (thể loại "Đô thị / Tình cảm", tóm tắt "Hành trình trở về phố cổ của Mai Linh sau nhiều năm xa cách và những ký ức trạm Bốn."). Nạp 5 chương từ `Pipeline_test/input/manuscript/` qua `/author/import/:novelId` và lưu nháp. Xác minh readback API/DB (chapter IDs, revision IDs, content hashes). Bước nhập không được tự ý trích xuất canon.
2. **S02:** Mở `/author/ide?novelId=...` -> "Bộ nhớ truyện" (`AuthorMemoryPanel`) -> "Chờ duyệt" (`EntityExtractionReview`). Nhập hints tăng cường: `An`, `Mai Linh`, `trạm Bốn`, `CV-04`, `linh`, `Thanh Hằng`. Bấm lưu hints, reload kiểm tra version tăng. Bấm "Bắt đầu trích xuất" bản thảo: quan sát `waiting_entity_review` dừng đúng chương trước khi trích xuất event/fact.
3. **S03:** Thực hiện Human Entity Review: phân biệt `An` (nhân vật) vs `an toàn` (loại bỏ occurrence trong `an toàn`), chuẩn hóa alias `Linh` -> `Mai Linh`, xác nhận `trạm Bốn` (Địa danh), `CV-04` (Vật phẩm/Địa danh). Thử rerun riêng entity stage. Bấm "Tiếp tục trích xuất event/fact", duyệt proposal groups canon, bấm `baseline/activate`. Tiến hành Audit P1-M0 đối chiếu với 35 narrative assertions trong `memory_items.csv`.
4. **S04–S06:** Mở các tab Nhân vật, Địa danh, Vật phẩm, Sự kiện, Dữ kiện. Dùng AI Copilot trong IDE yêu cầu gợi ý sự kiện kế tiếp; sửa 1, bỏ 1; kiểm tra chỉ gợi ý được chọn vào Story Plan. Kiểm tra Story Plan không rò rỉ vào canon lịch sử.
5. **S07–S09:** Viết tiếp chương 6 qua editor bình thường (không dùng snapshot thủ công). Kiểm tra auto-extraction từ revision mới, duyệt entity gate và event/fact. Thử lưu nhanh 2 lần liên tiếp để xác minh tính idempotent (không tạo bản ghi duplicate).
6. **S10–S11:** Cài đặt 1 chi tiết mâu thuẫn trong bản nháp, chạy Consistency Checker kiểm tra phát hiện đúng bằng chứng. Sửa qua UI, lưu và kiểm tra lại. Tải lại trang, audit M-FIRST và trạng thái bộ nhớ cuối cùng.

---

## 5. Lệnh tự hủy / Dọn dẹp tài liệu Handoff tạm thời

Để tránh làm rác thư mục run sau khi coding agent đã tiếp nhận và đọc xong thông tin handoff:

```bash
# Sau khi bắt đầu phiên làm việc mới, xóa bỏ file prompt tạm thời:
rm -f Pipeline_test/runs/2026-10-21-gemini-p1-live-01/HANDOFF_PROMPT.md
rm -f Pipeline_test/runs/2026-10-21-gemini-p1-live-01/smoke_test.py

# Toàn bộ thông tin chính thức đã được hợp nhất vĩnh viễn trong:
# - NEXT_REVIEW.md (tài liệu bàn giao này)
# - REPORT.md & LIVE_RESUME_REPORT.md (báo cáo tiến độ & preflight gate)
# - REVIEW_FINDINGS_CLOSURE.md (hồ sơ đóng 9 review findings)
# - checkpoint.json, run_config.json, validation.json (trạng thái máy đọc)
```

---

## 6. DATED ADDENDUM (2026-10-21 UTC+7) — Wave 1C Offline Pre-Live Hardening Summary

> [!NOTE]
> **Wave 1C Completion Status:** **`P1_WAVE_1C_OFFLINE_READY_FOR_INDEPENDENT_REVIEW`**  
> All 5 findings from GPT-6 independent verdict (`WAVE_1B_INDEPENDENT_VERDICT.md`) resolved with deterministic offline proofs:
> 1. **V1C-01 (Cross-Container Budget Gate):** Implemented `Pipeline_test/tools/budget_gateway.py` with multi-process durable ledger, atomic pre-dispatch reservation, and token metering. Tested 8/8 fault injection scenarios including call 200/201 boundary, 2h absolute expiration, $4.50 admission cutoff, multi-process race on final slot, failed call accounting, and corrupt ledger denial. Both `ai-service` and `backend` wired.
> 2. **V1C-02 (Authentic Browser Evidence):** Replaced filename string loophole in `execute_p1_journey.py` with `validate_browser_evidence()` requiring existing non-empty artifacts and structured action provenance manifests (`action_kind`, `url`, `timestamp`, `novel_id`). Added `Pipeline_test/tools/browser_author_driver.py` and 9/9 offline authenticity tests pass.
> 3. **V1C-03 (Partial Import & Replay Idempotency):** Hardened S01 runner logic with `verify_manuscript_gold_hashes()`. Fails closed (`S01_PARTIAL_IMPORT_REQUIRES_RECOVERY` / `S01_PARTIAL_IMPORT_HASH_MISMATCH`) on 0/1/3/4/6 chapters, corrupt checkpoints, or hash mismatches, issuing 0 duplicate novel POSTs. 12/12 offline idempotency tests pass.
> 4. **V1C-04 (Credential & Secret Hygiene):** Removed hardcoded demo passwords from executable runner; parameterized isolated Docker Compose environment; withheld Google AI Studio credentials from worker containers.
> 5. **V1C-05 (Live Window Expired):** Preserved expired live window boundary (`2026-10-21T05:47:52Z`); executed OFFLINE ONLY tests; ZERO paid provider calls made.

