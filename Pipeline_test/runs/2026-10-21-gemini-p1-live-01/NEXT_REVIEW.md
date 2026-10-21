# Handover Review — Run 2026-10-21-gemini-p1-live-01

**Reviewer Target:** ChatGPT / GPT-6 (Independent Reviewer via GitHub)  
**Assigned Testing Agent:** Gemini 3.8 inside Antigravity  
**Tested Code SHA:** `fcbf945cb9acb0b849b8614fa67c29580615a26b`  
**Branch:** `codex/ai-copilot-pipeline-test`  
**Current Run Status:** `P1_BLOCKED`  
**Active Blocker:** `LIVE_PROVIDER_BLOCKED_BUDGET` (Provider Guard)  

---

## 1. Coverage Matrix (Wave 1 Scope)

| Hạng mục kiểm thử | Trạng thái | Bằng chứng | Ghi chú kỹ thuật |
|---|---|---|---|
| **Git Preflight** | `PASS` | Git porcelain clean, HEAD == origin | Đảm bảo không có uncommitted changes ngoài thư mục run mới |
| **Fixture Integrity** | `PASS` | `task_tool.py verify` | SHA256: `ddef699f35dea11c0659860d8988663ee76856bd1f39f95a70bb89d4befd52eb` |
| **AI-Service Full Suite** | `PASS` | `evidence/python-tests.txt` | 397 PASS, 2 SKIP, 42 DESELECTED, 6 subtests PASS (10.06s) |
| **Entity Review Regression** | `PASS` | `evidence/audit-regression.txt` | 66 PASS (Candidates, Guidance, OptimisticLock, Recovery) |
| **Backend Targeted Suite** | `PASS` | `evidence/backend-targeted-tests.txt` | 26 PASS, 0 FAIL (Gateway forwarding, Outbox, Autonomous Guard) |
| **Backend Typecheck** | `PASS` | `evidence/backend-typecheck.txt` | TypeScript compilation không có lỗi (`noEmit`) |
| **Web Frontend Build** | `PASS` | `evidence/web-build.txt` | Vite bundle thành công (`dist/` generated, 7.18s) |
| **Isolated Docker Stack** | `PASS` | `docker-compose.isolated.yml` | 5 containers (Web, Backend, AI-Service, Postgres, Mongo) UP & healthy |
| **Database Migrations** | `PASS` | `evidence/schema-verification.txt` | Alembic `0012_entity_guidance` head, backend 001–012 applied |
| **Schema Verification** | `PASS` | `evidence/schema-verification.txt` | `story_brains.entity_guidance: JSONB`, `analysis_runs.entity_candidate_audit: JSONB` |
| **Runtime Flag Verification**| `PASS` | `evidence/runtime-verification.txt`| `entity_candidate_verification_enabled: True`, `pipeline_version: entity-human-review-v1`, `policy: entity-candidates-v1` |
| **P1 Live Journey (S01–S11)**| `BLOCKED` | `REPORT.md`, `checkpoint.json` | Dừng an toàn tại `LIVE_PROVIDER_BLOCKED_BUDGET` |
| **P2 (Idea Bootstrap)** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |
| **P3 (Autonomous Loop)** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |
| **100k Novel Run** | `NOT_RUN` | N/A | Ngoài phạm vi Wave 1 theo chỉ thị |

---

## 2. Resource Ownership & Cleanup Status

* **Tài nguyên thuộc quyền sở hữu của run này (`2026-10-21-gemini-p1-live-01`):**
  * Containers: `p1-live-01-web`, `p1-live-01-backend`, `p1-live-01-ai-service`, `p1-live-01-postgres`, `p1-live-01-mongodb`.
  * Volumes: `p1-live-01_p1_live_01_postgres_data`, `p1-live-01_p1_live_01_mongodb_data`.
  * Database: `p1_ephurin`.
  * Ports: `18080`, `14000`, `18000`, `25432`, `27018`.
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

## 3. Lỗi / Vấn đề phát hiện & Blocker

1. **`ISSUE-BUDGET-001` (`LIVE_PROVIDER_BLOCKED_BUDGET`):**
   * *Mô tả:* Theo `ACTIVE_GEMINI_TASK.md` điều 52, agent kiểm thử tuyệt đối không tự ý suy đoán quyền chi tiêu từ sự tồn tại của API key trong file `.env.demo`. Vì yêu cầu của user và task chỉ định mức trần chi phí chưa được cung cấp cụ thể trong lượt gọi này, hệ thống phải dừng lại trước khi gọi API có phí/quota.
   * *Hành động yêu cầu:* Xác nhận ngân sách gọi (ví dụ: `max_provider_calls: 200`, `max_cost_usd: 5.0`).
2. **`ISSUE-ENV-LINEEND-001` (Windows CRLF Fixture Hash):**
   * *Mô tả:* Hash `main_story_plan.template.json` trong `manifest.json` được tính theo CRLF trên Windows trong khi git index chứa LF.
   * *Khắc phục:* Đã kiểm tra hash khớp chính xác theo LF/CRLF và hoàn trả worktree về trạng thái sạch (`clean`), không sửa đổi file fixture hay commit sai lệch.

---

## 4. Điều kiện để P1 tiến lên Live Journey & Điều kiện cho P2 / P3

* **Để P1 tiến lên Live Journey (S01–S11):**
  1. Người dùng / Reviewer xác nhận budget gọi API (ví dụ cấp ngân sách `150 calls`).
  2. Khởi chạy browser tại `http://localhost:18080`, nạp 5 chương bản thảo đầu qua UI.
  3. Kiểm tra gate `waiting_entity_review` xuất hiện trước event/fact.
  4. Thực hiện các thao tác duyệt thực thể của tác giả theo `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md` (giữ/loại `An` trong `an toàn`, sửa type/alias, thêm tên vắng mặt).
  5. Rerun riêng entity stage, continue sang event/fact, duyệt canon và đối chiếu 35 narrative assertions tại M0.
  6. Hoàn thành S04–S11 và audit M-FIRST.
* **Điều kiện mở P2:** Chỉ sau khi P1 đạt toàn bộ S01–S11 và audit narrative memory M0/M-FIRST có live UI evidence.
* **Điều kiện mở P3 / Bài 100k:** Chỉ sau khi P1 và P2 đều đã pass độc lập; P3 phải hoạt động dưới human review gate (không auto-approve entity khi cờ bật).
