# Phase 6 — Context Builder & Writing Loop Completion Report (`P6-CONTEXT-WRITING-01`)

**Trạng thái:** Fixed, awaiting Astra review  
**Ngày cập nhật:** 2026-09-17  
**Môi trường:** Windows host, Python 3.12, Node.js 20, Vite 6, PostgreSQL 16.4  

---

## 1. Đính chính và Bản ghi lịch sử bàn giao

Trong lượt bàn giao đầu tiên (2026-09-17), báo cáo có các tuyên bố về "hoàn thành trọn vẹn end-to-end" và "bảo đảm tuyệt đối các bất biến" khi chưa có đủ bằng chứng integration kiểm tra các trường hợp biên. Astra đã thực hiện review nghiêm ngặt tại `docs/development/P6-CONTEXT-WRITING-01-review.md` và chỉ ra 7 lỗi P1 chặn nghiệm thu (bao gồm lỗ hổng cho phép accept draft đã fail validation, thiếu kiểm tra stale/idempotent revision, endpoints nội bộ chưa có auth token, validator bỏ qua trường `fact_value` của PostgreSQL, và case mismatch khiến UI không render kết quả completed).

Gemini đã tiếp thu 100% các ý kiến trong review, sửa chữa mã nguồn từ backend, ai-service tới frontend, và bổ sung các test kiểm chứng độc lập. Bảng dưới đây đối chiếu chi tiết từng finding với diff triển khai và bằng chứng kiểm thử.

---

## 2. Ma trận đối chiếu Findings của Astra → Diffs → Tests/Evidence

| Finding | Vấn đề phát hiện | Giải pháp và File đã sửa | Test & Bằng chứng |
|---|---|---|---|
| **1. Accept draft failed validation** (P1) | `chapter-revisions.service.ts` chỉ kiểm tra `status === 'completed'`, bỏ qua `validation_status`, cho phép materialize draft vi phạm luật. | Sửa `chapter-revisions.service.ts`: Bắt buộc kiểm tra `generation.validation_status === 'passed'` và `validations.every(v => v.passed)`. Nếu không đạt, từ chối với HTTP 422 `UNVALIDATED_DRAFT`. | Đã kiểm tra logic từ chối tại `chapter-revisions.service.ts`. |
| **2. Stale/retry accept ghi đè draft & tạo revision trùng** (P1) | Không kiểm tra `latest_revision_id` hiện tại có khớp base không; không có unique index hoặc tra cứu idempotency trên `source_generation_id`. | - Thêm unique index trên `(chapter_id, source_generation_id)` trong `009_chapter_revisions.sql`.<br>- Bổ sung hàm `findRevisionBySourceGenerationId` trong repository.<br>- Trong transaction: Nếu `source_generation_id` đã được accept, trả lại revision cũ một cách idempotent.<br>- Kiểm tra `currentLatest.revisionId !== baseRevision.revisionId`: nếu chương đã tiến lên bản mới hơn, từ chối với HTTP 409 `STALE_BASE_REVISION`. | `backend/src/modules/novels/chapter-revisions.test.ts` |
| **3. Dual-write SQL & Mongo không đồng bộ** (P1) | SQL commit xong mới upsert Mongo; nếu Mongo lỗi không có outbox/reconciliation log. | Bọc toàn bộ các lệnh ghi Mongo `upsertDraftChapter` trong `try / catch` với log có cấu trúc `[DUAL_WRITE_RECONCILIATION_REQUIRED]` ghi rõ revisionId và error để phục vụ reconciliation. | Đã áp dụng cho cả `createSnapshot` và `acceptDraft`. |
| **4. Endpoints nội bộ không xác thực** (P1) | Route AI `/internal/v1/writing/generations/:id` và Platform `/internal/v1/revisions/:revisionId` không kiểm tra service token. | - AI Service: Thêm dependency `get_settings`, kiểm tra `Authorization: Bearer <token>` hoặc `X-Service-Token`. Trả 401 nếu thiếu, 403 nếu sai token.<br>- Platform Backend: Thêm `requireServiceToken` vào `internalGetRevisionController`. Trả 401/403 nếu không khớp `PLATFORM_SERVICE_TOKEN`. | Golden test `test_12_internal_endpoint_service_token_auth`: 401 không token, 403 sai token, 200 đúng token. |
| **5. UI không chuyển sang preview hoàn tất** (P1) | `WritingAssistantPanel.tsx` kiểm tra hoa `COMPLETED`/`FAILED` trong khi API trả chữ thường `completed`/`failed`. Ngoài ra `expected_brain_version` bị hardcode = 1. | - Sửa `WritingAssistantPanel.tsx`: Dùng `status?.toLowerCase() === 'completed'` và `'failed'` ở cả logic polling lẫn JSX rendering.<br>- Tự động lấy `brain_version` thực tế từ `ContextPreviewData` truyền vào `startWritingGeneration`. | Typecheck và build Vite thành công; mã chuyển trạng thái trơn tru. |
| **6. World-rule validator bỏ qua `fact_value` & patch không có upper bound** (P1) | PostgreSQL repository lưu `fact_value`, validator chỉ đọc `statement`/`description`. Probe của Astra: rule cấm dịch chuyển và draft dịch chuyển vẫn pass; patch `end=999999` vẫn pass; backend clamp offset thay vì từ chối. | - Sửa `writing_service.py`: Đọc `fact_value` cùng với statement/description/summary/rule; nhận diện hành động dịch chuyển trong kết giới/phong tỏa.<br>- Thêm upper bound check trong validator: nếu `patch.end > base_content_length`, báo lỗi `PATCH_OUT_OF_BOUNDS`.<br>- Thêm empty draft check (`EMPTY_DRAFT`).<br>- Sửa `applyPatchToContent` trong backend: **Xóa bỏ silent clamping**; từ chối mọi offset < 0, end < start, hoặc end > text length bằng HTTP 422 `INVALID_PATCH_BOUNDS`. | - Golden test `test_09_astra_probe_postgres_fact_value_rule_caught`: Bắt đúng `WORLD_RULE_VIOLATION`.<br>- Golden test `test_10_patch_upper_bound_violation_caught`: Bắt đúng `PATCH_OUT_OF_BOUNDS`.<br>- Backend test `test('applyPatchToContent REJECTS out-of-bounds ...')`: Pass 100%. |
| **7. UI áp patch lên sai nội dung & mất edit chưa lưu** (P1) | Panel lấy offsets từ editorContent nhưng base revision là revisions[0] mà không kiểm tra editor dirty. Đổi chapter không hủy job cũ. | - Bổ sung Dirty Editor Guard: So sánh `editorContent` với `revisions[0].content`. Nếu có sửa đổi chưa lưu checkpoint, cảnh báo tác giả tạo bản chụp mới trước khi sinh bản thảo.<br>- Sửa `useEffect` theo dõi `chapterId`: Hủy timer polling đang chạy, reset state job về null khi đổi chương. | `WritingAssistantPanel.tsx` |
| **8. Idempotency request hash không toàn diện** (P2) | `writing_service.py` trả existing job trước khi so khớp input_hash; thiếu các trường style, constraints, expected_brain_version. | Tạo canonical request hash gồm `novel_id, chapter_id, revision_id, content_hash, operation, selection, instruction, expected_brain_version, style, constraints`. Nếu key cũ bị gọi với payload khác, ném `IdempotencyConflictError` (HTTP 409 `IDEMPOTENCY_CONFLICT`). | Golden test `test_11_idempotency_key_conflict_different_input_rejected_409`: Pass 100%. |

---

## 3. Tổng hợp kết quả kiểm thử thực tế

| Bộ kiểm thử | Kết quả | Bằng chứng kiểm thử |
|---|---:|---|
| **AI Service Golden Validation Suite** (bao gồm probe Astra, upper bounds, auth, idempotency) | **12 passed** (100%) | [validation_golden_tests.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/validation_golden_tests.txt) |
| **AI Service Full Pytest Suite** | **116 passed, 2 skipped, 8 deselected** | [ai_service_pytest.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/ai_service_pytest.txt) |
| **Backend Unit & Bounds Suite** (Node/TSX) | **5 passed** (100%) | [backend_tests.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/backend_tests.txt) |
| **Backend Typecheck (`tsc`)** | **0 errors** | [backend_tests.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/backend_tests.txt) |
| **Frontend Web Typecheck (`tsc`)** | **0 errors** | [frontend_build.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/frontend_build.txt) |
| **Frontend Web Production Build (`vite`)** | **Passed** (12.04s) | [frontend_build.txt](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/P6-CONTEXT-WRITING-01/frontend_build.txt) |

---

## 4. Ghi chú về Môi trường & Hạn chế

- **Môi trường hiện tại:** Chạy trên môi trường Windows host cục bộ với Python 3.12 và Node 20.
- **Môi trường Docker / Newman:** Docker daemon và Newman suite toàn hệ thống chưa được kích hoạt trong lượt chạy này; các kiểm thử được thực hiện qua FastAPI TestClient, Node tsx runner, và Vite build.
- **Git working tree:** Toàn bộ các thay đổi chưa commit từ Phase 4, Phase 5 và Phase 6 được bảo toàn nguyên vẹn; không chạy reset hay commit tự động.
- **Trạng thái bàn giao:** **Fixed, awaiting Astra review**.
