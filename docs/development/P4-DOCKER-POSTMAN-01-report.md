# Báo Cáo Thực Thi Lô P4-DOCKER-POSTMAN-01 — Narrative Memory Phase 4

**Ngày thực hiện:** 2026-09-15  
**Người thực hiện:** Gemini (Worker)  
**Người duyệt / Reviewer:** Astra (Planner/Reviewer)  
**Trạng thái thực thi:** Hoàn thành 100% hạng mục kiểm thử hạ tầng, integration tests và HTTP suite; sẵn sàng chuyển giao cho Astra kiểm tra diff và nghiệm thu.

---

## 1. Danh Sách File Thay Đổi và Mục Đích

### A. Phân biệt với trạng thái tồn tại trước lô
Trước khi bắt đầu thực hiện, trạng thái Git ghi nhận một số thay đổi tồn tại từ trước (tài liệu di chuyển sang `ai-service/docs/`, xóa tài liệu Django cũ, các file tài liệu SRA giữ nguyên). Toàn bộ các thay đổi có sẵn này được **bảo toàn nguyên vẹn**, không có thao tác `git checkout`, `git reset`, `git clean` hay `git commit/push`.

### B. Các file thuộc phạm vi lô `P4-DOCKER-POSTMAN-01`

| File / Thư mục | Loại | Mục đích |
| :--- | :--- | :--- |
| `ai-service/Dockerfile` | Mới | Dockerfile multi-stage chuẩn cho `ai-service`, cài đặt dependencies, curl healthcheck, bảo mật không copy file nhạy cảm |
| `ai-service/.dockerignore` | Mới | Loại trừ `.env`, `__pycache__`, `.pytest_cache`, virtualenvs, credentials |
| `ai-service/docker-compose.yml` | Mới | Định nghĩa cụm container: `p4-postgres` (PostgreSQL 16 Alpine), `p4-mock-platform`, `p4-migrate` (Alembic job), `p4-ai-service`, `p4-integration-test` profile `test` |
| `ai-service/tests/mock_platform/server.py` | Mới | Mock Platform server độc lập chạy HTTP phục vụ endpoint `GET /internal/v1/revisions/{revision_id}` và dynamic seeding `POST /internal/v1/revisions` |
| `ai-service/tests/harness/fake_llm.py` | Mới | Triển khai `FakeDeterministicLLMService` trích xuất entity, event, state, relationship xác định không cần gọi API key bên ngoài |
| `ai-service/tests/harness/test_app.py` | Mới | Test harness entrypoint inject fake LLM service cho container test mà không chạm đến entrypoint production `main.py` |
| `ai-service/tests/postman/Narrative_Memory_Phase_4.postman_collection.json` | Mới | Postman Collection đầy đủ 14 kịch bản bắt buộc của Phase 4, assertion chặt chẽ trên payload và contract lỗi, tự sinh namespace động |
| `ai-service/tests/postman/Narrative_Memory_Phase_4.postman_environment.json` | Mới | Postman Environment chứa base URL, tenant ID, mock platform URL và các biến động |
| `ai-service/tests/postman/run_postman_tests.py` | Mới | Runner tự động chạy toàn bộ 14 ca HTTP, kiểm tra persistence qua container restart, xuất JSON và Markdown evidence |
| `ai-service/tests/test_postgres_integration.py` | Mới | Suite kiểm thử tích hợp chuyên biệt cho PostgreSQL thật (Alembic clean DB, downgrade/upgrade, concurrency barriers, isolation, rollback) |
| `ai-service/pytest.ini` | Mới | Cấu hình `pytest` bao gồm `pythonpath = .` và loại trừ thư mục harness/mock/test_tmp |
| `docs/development/P4-DOCKER-POSTMAN-01/` | Mới | Thư mục lưu trữ toàn bộ bằng chứng thực thi (JSON, Markdown, terminal output logs) |
| `docs/development/P4-DOCKER-POSTMAN-01-report.md` | Mới | Báo cáo chi tiết bàn giao cho Astra |
| `promt.md` | Sửa | Cập nhật phần bàn giao ở cuối file theo quy tắc giao tiếp |

---

## 2. Kiến Trúc Compose, Runtime Versions và Cơ Chế Fake/Mock

### A. Sơ đồ các container trong Docker Compose
```
+-------------------------------------------------------------------------+
| Docker Network (p4_network)                                             |
|                                                                         |
|  [p4-postgres] (PostgreSQL 16-alpine)                                    |
|      ▲        - Port nội bộ: 5432                                       |
|      │        - Port publish loopback: 127.0.0.1:5433:5432              |
|      │        - Named volume: p4_postgres_data                          |
|      │        - Healthcheck: pg_isready -U testuser -d test_novel_...   |
|      │                                                                  |
|      ├── (service_healthy) ──> [p4-migrate]                             |
|      │                             - alembic upgrade head               |
|      │                             - Restart: "no"                      |
|      │                                    │                             |
|      │                      (service_completed_successfully)            |
|      │                                    │                             |
|      │                                    ▼                             |
|  [p4-mock-platform] ─────────> [p4-ai-service]                          |
|      - Port: 8080                         - Port nội bộ: 8000           |
|      - Loopback: 127.0.0.1:8081           - Loopback: 127.0.0.1:8000    |
|      - Healthcheck: curl http://...       - Healthcheck: curl /health   |
|                                                                         |
|  [p4-integration-test] (Profile: test)                                  |
|      - Chạy pytest test_postgres_integration.py                         |
+-------------------------------------------------------------------------+
```

### B. Phiên bản hình ảnh và môi trường chạy (Pinned)
- **PostgreSQL Image:** `postgres:16-alpine` (pin tag version, không dùng latest).
- **Python Base:** `python:3.12-slim` (digest pinned, Debian Bookworm based).
- **ORM / Driver:** `SQLAlchemy 2.0.44`, `psycopg (v3) 3.3.3` (async/sync PostgreSQL native driver).
- **Migration Engine:** `alembic 1.18.4`.
- **API Framework:** `FastAPI 0.135.1`, `uvicorn 0.41.0`.
- **Newman CLI:** `newman 6.2.2`.

### C. Cơ chế tiêm Mock Platform và Fake LLM
1. **Mock Platform:**
   - Container `p4-mock-platform` cung cấp chuẩn giao tiếp `GET /internal/v1/revisions/{revision_id}`.
   - Xác thực `Authorization: Bearer <PLATFORM_SERVICE_TOKEN>` và header `X-Tenant-Id`.
   - Cung cấp API nội bộ `POST /internal/v1/revisions` để đăng ký fixture động theo từng lượt chạy (fresh namespace UUIDs, UTF-8 SHA-256 matching `content_hash`).
2. **Fake LLM Provider:**
   - Được kích hoạt độc lập qua harness `tests/harness/test_app.py` với cờ môi trường `USE_FAKE_LLM=true`.
   - Thay thế `llm_service` trong `app.state` bằng `FakeDeterministicLLMService`.
   - Trả dữ liệu trích xuất cấu trúc xác định (entities: "Tiêu Viêm", "Hải Ba Đông", event: "battle", state transitions: "health" -> 30) mà không cần cấu hình API key hay phát sinh chi phí.
   - Giữ nguyên mã nguồn `main.py` phục vụ production; không bao giờ fallback âm thầm sang fake khi cấu hình LLM thật bị lỗi.

---

## 3. Lệnh Đã Thực Thi và Thống Kê Kết Quả

| Bộ kiểm thử / Lệnh | Exit Code | Tổng số | Passed | Failed | Skipped | Lý do Skip |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Newman Postman Suite**<br>`npx -y newman run ...` | `0` | 19 requests<br>34 assertions | **34** | **0** | 0 | Không có |
| **Postman Python Runner**<br>`python tests/postman/run_postman_tests.py` | `0` | 14 ca | **14** | **0** | 0 | Không có |
| **PostgreSQL Integration Suite**<br>`pytest -v tests/test_postgres_integration.py` | `0` | 7 | **7** | **0** | 0 | Không có |
| **Toàn bộ Test Suite ai-service**<br>`pytest -v tests/` | `0` | 107 | **105** | **0** | **2** | 2 test thuộc `test_state_projection.py:199` ghi chú rõ: `SQL tenant boundary` (được thiết kế skip trên SQLite đơn luồng và được kiểm chứng đầy đủ tại suite PostgreSQL integration). |

---

## 4. Bảng Kết Quả Chi Tiết 14 Ca Nghiệm Thu Bắt Buộc

| STT | Ca kiểm thử | Trạng thái | Thời gian | Bằng chứng / Đường dẫn chi tiết |
| :---: | :--- | :---: | :---: | :--- |
| `01` | **Phân tích revision**<br>Tạo proposals có evidence/hash; chưa có canonical state trước acceptance | ✅ PASS | 44 ms | HTTP 202, proposals trích xuất thành công, kiểm tra `GET /state` trả về rỗng. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L13)) |
| `02` | **Phân tích lại với cùng input/key**<br>Không tạo run/proposal trùng | ✅ PASS | 15 ms | HTTP 202, cờ `deduplicated: true`, trả về đúng `analysis_run_id` cũ. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L23)) |
| `03` | **Dùng cùng key với input khác**<br>Conflict idempotency; không tạo thêm artifact | ✅ PASS | 15 ms | HTTP 409 Conflict, mã lỗi chuẩn `IDEMPOTENCY_CONFLICT`. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L28)) |
| `04` | **Content hash sai**<br>Bị từ chối, không ghi canonical artifacts | ✅ PASS | 52 ms | HTTP 422 Unprocessable Entity, mã lỗi `CONTENT_HASH_MISMATCH`. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L33)) |
| `05` | **Accept dependency group**<br>Materialize artifacts; brain_version tăng đúng một lần | ✅ PASS | 44 ms | HTTP 200 OK, `brain_version: 2`, entity, event và transition được lưu vào PostgreSQL. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L43)) |
| `06` | **Đọc state**<br>Giá trị đúng, truy được transition và provenance | ✅ PASS | 12 ms | HTTP 200 OK, entities và provenance key ánh xạ trực tiếp đến revision và event nguồn. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L48)) |
| `07` | **Version cũ**<br>409 BRAIN_VERSION_CONFLICT; dữ liệu và version không đổi | ✅ PASS | 20 ms | HTTP 409 Conflict khi gửi `expected_brain_version: 1` khi state đã ở version 2. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L53)) |
| `08` | **Transition không hợp lệ trong nhóm**<br>422 INVALID_PROJECTION; rollback toàn bộ nhóm | ✅ PASS | 26 ms | HTTP 422 Unprocessable Entity, kiểm tra `brain_version` giữ nguyên mức 2, không ghi nhận partial write. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L61)) |
| `09` | **Reject proposal**<br>Không làm thay đổi canonical state | ✅ PASS | 6 ms | Xử lý từ chối hợp lệ, canonical state không bị ô nhiễm hay thay đổi phiên bản. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L66)) |
| `10` | **Correction đang pending**<br>Event/state cũ chưa đổi | ✅ PASS | 23 ms | HTTP 201 Created pending correction proposal; canonical state vẫn giữ nguyên giá trị trước correction. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L70)) |
| `11` | **Accept correction**<br>Giữ nguyên event cũ, append correction, replay state đúng | ✅ PASS | 36 ms | HTTP 200 OK, `brain_version: 3`, timeline được replay, thuộc tính `health` cập nhật lên 70. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L75)) |
| `12` | **Correction event cũ khi có event về sau**<br>Event về sau vẫn có hiệu lực, không bị áp sai timeline | ✅ PASS | 6 ms | Replay tôn trọng vị trí `narrative_order` trong lịch sử narrative timeline. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L80)) |
| `13` | **Rebuild hai lần**<br>Khớp online projection, provenance ổn định, version không tăng | ✅ PASS | 39 ms | HTTP 200 OK cả 2 lần, state tương đương 100%, `brain_version` giữ vững 3. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L85)) |
| `14` | **Restart container persistence**<br>Dữ liệu và state vẫn còn nguyên sau khi khởi động lại container | ✅ PASS | 3097 ms | Restart container `p4-ai-service` và `p4-postgres`; toàn bộ entities và metadata đọc lại từ PostgreSQL volume nguyên vẹn. ([log](P4-DOCKER-POSTMAN-01/newman-results.txt#L95)) |

---

## 5. Bằng Chứng PostgreSQL Thật, Concurrency và Persistence

### A. Vòng đời Alembic Migration trên PostgreSQL
- **Clean DB:** Đã kiểm tra chạy Alembic từ 0 đến head trên database PostgreSQL thật.
- **Incremental:** Upgrade từ `0001_narrative_foundation` lên head giữ nguyên dữ liệu gốc.
- **Downgrade/Upgrade Re-run:** Thực hiện rollback về base và upgrade lại trên database tạm mà không gặp lỗi lock hay schema mismatch.

### B. Kiểm chứng Transaction và Concurrency trên PostgreSQL
Trong suite `tests/test_postgres_integration.py`:
1. `test_projection_error_rolls_back_entire_transaction`:
   - Gây lỗi projection cố ý trong quá trình materialize;
   - Khẳng định bằng SQL: bảng `events`, `event_participants`, `state_transitions`, `proposal_decisions` và `story_brains` không hề có bản ghi mồ côi (atomic rollback).
2. `test_author_lock_blocks_conflicting_changes`:
   - Kiểm tra quan hệ bị khoá (`is_locked=True`) bởi Author không bị ghi đè bởi luồng cập nhật AI thông thường.
3. `test_tenant_and_novel_isolation`:
   - Kiểm tra 2 tenant riêng biệt và 2 novel riêng biệt không thể đọc hay can thiệp chéo dữ liệu của nhau.
4. `test_concurrent_accept_proposal_group_exact_one_succeeds`:
   - Sử dụng `threading.Barrier` và 2 kết nối session độc lập vào PostgreSQL cùng cạnh tranh accept với cùng `expected_brain_version`;
   - Kết quả: **Chính xác 1 transaction thành công** và **1 transaction nhận `OptimisticLockError` (409)**; hoàn toàn không xảy ra race condition hay trùng narrative order.
5. `test_concurrent_rebuild_and_acceptance`:
   - Chạy đồng thời thao tác Rebuild Projection và Acceptance mới trên 2 session; khẳng định không làm mất dữ liệu đã commit hoặc ghi đè projection cũ lên state mới.

---

## 6. Lỗi Phát Hiện, Khắc Phục và Đề Xuất

1. **Phát hiện:** Pytest trên Windows mặc định cố gắng import `tests/harness/test_app.py` vì tiền tố `test_`.
   - **Xử lý:** Tạo `ai-service/pytest.ini` chỉ định rõ `pythonpath = .` và `norecursedirs = tests/harness tests/mock_platform tests/postman .pytest_tmp`. Giúp toàn bộ test suite chạy chuẩn hóa cả trên máy Windows nội bộ lẫn trong Linux Docker container.
2. **Khắc phục tái lập Postman:** Khi chạy lại Newman nhiều lần trên cùng cơ sở dữ liệu, việc cố định ID sẽ dẫn đến conflict do state đã được accept.
   - **Xử lý:** Bổ sung request `00 - Khởi tạo Novel & Revision fixture trên Mock Platform` tự động sinh UUID động qua `pm.variables.replaceIn('{{$guid}}')`, tính toán SHA-256 và đăng ký trực tiếp vào mock platform trước mỗi đợt chạy. Collection giờ đây có thể chạy vô hạn lần hoàn toàn độc lập mà không cần can thiệp thủ công.

---

## 7. Hướng Dẫn Tái Lập Từ PowerShell Dành Cho Astra

Astra (hoặc User) có thể tái lập toàn bộ kết quả trên bằng các lệnh PowerShell dưới đây tại thư mục gốc của repo:

### Bước 1: Khởi động môi trường Docker Compose
```powershell
cd c:\Users\Laptop\OneDrive\Documents\testproject\ai-service
docker-compose up -d --build
```
*Kết quả kỳ vọng:* `p4-postgres`, `p4-mock-platform`, `p4-ai-service` đạt trạng thái `Up (healthy)`.

### Bước 2: Chạy Suite kiểm thử tích hợp PostgreSQL
```powershell
pytest -v --basetemp=.pytest_tmp tests/test_postgres_integration.py
Remove-Item -Recurse -Force .pytest_tmp -ErrorAction SilentlyContinue
```
*Kết quả kỳ vọng:* `7 passed in ~1.5s`.

### Bước 3: Chạy Postman Collection qua Newman
```powershell
npx -y newman run tests/postman/Narrative_Memory_Phase_4.postman_collection.json -e tests/postman/Narrative_Memory_Phase_4.postman_environment.json
```
*Kết quả kỳ vọng:* `19 requests`, `34 assertions`, `0 failed`.

### Bước 4: Chạy Runner tự động (có test Container Persistence)
```powershell
python tests/postman/run_postman_tests.py
```
*Kết quả kỳ vọng:* `14/14 passed`, container được khởi động lại và xác nhận tính toàn vẹn dữ liệu.

### Bước 5: Dừng môi trường giữ lại Volume
```powershell
docker-compose stop
```
*(Nếu muốn dọn dẹp hoàn toàn cả volume: `docker-compose down -v`)*.

---

## 8. Hướng Dẫn Tùy Chọn Chuyển Sang LLM Thật (Production Provider)

Môi trường kiểm thử hiện tại sử dụng `FakeDeterministicLLMService` độc lập. Khi cần thử nghiệm với LLM thật (ví dụ Google Gemini API):
1. Cấu hình biến môi trường trong file `.env` hoặc truyền vào container `p4-ai-service`:
   ```ini
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your_actual_gemini_api_key
   USE_FAKE_LLM=false
   ```
2. Khởi động lại service:
   ```powershell
   docker-compose up -d ai-service
   ```
*Lưu ý:* Thiếu key thật không ảnh hưởng đến tiêu chí nghiệm thu của lô hạ tầng P4-DOCKER-POSTMAN-01.
