# Astra review bàn giao Phase 6 — 2026-09-17

Kết luận: **CHƯA NGHIỆM THU — cần sửa implementation và bổ sung integration/UI evidence.** Review dựa trên mã working tree, báo cáo và bằng chứng Gemini bàn giao. Không sửa mã ứng dụng trong lượt review này.

## Các lỗi chặn nghiệm thu

1. **P1 — Accept cho phép draft validation failed.** `backend/src/modules/novels/chapter-revisions.service.ts:138` chỉ kiểm tra status completed và có patch. `ai-service/application/writing_service.py:309` lưu validation_status failed nhưng vẫn đặt status completed ở dòng 327. Vì vậy gọi accept trực tiếp có thể materialize draft đã bị validator bác bỏ. Phải kiểm tra final validation_status, kết quả validators, schema patch và ownership của generation ở server; thêm integration test accept failed/pending/tampered job.

2. **P1 — Accept stale/retry vẫn tạo revision mới và ghi đè draft.** `chapter-revisions.service.ts:148` khóa chapter nhưng bỏ qua latest_revision_id; dòng 159 chỉ so hash của immutable base, không kiểm tra base còn current và không kiểm tra brain version. Không lookup generation đã accepted; migration 009 chỉ có index thường trên source_generation_id. Retry cùng generation chèn nhiều revision; accept base cũ sau save/snapshot mới vẫn cập nhật latest pointer rồi ghi Mongo bằng nội dung cũ. Cần unique acceptance mapping, trả lại kết quả cũ, chapter/draft version CAS và cơ chế brain-version check tại commit. Test concurrent accepts và save thường xen giữa generate–accept.

3. **P1 — “Dual-write consistency” trong báo cáo không đúng mã.** SQL transaction kết thúc trước upsertDraftChapter (`chapter-revisions.service.ts:188`, snapshot cũng tương tự tại dòng 90). Không có outbox, recovery hoặc Mongo conditional version. Mongo lỗi để lại revision đã commit; Mongo update trễ có thể ghi đè edit mới. Thêm cơ chế recovery bền vững và version guard; test fault injection sau SQL commit. Row lock SQL không bảo vệ write Mongo diễn ra sau khi lock được thả.

4. **P1 — Endpoint nội bộ không xác thực.** AI `api/narrative_routes.py:509` không đọc/kiểm tra service token. Platform `backend/src/app.ts` mount internal revision route với schema validation, controller gọi getInternalRevision không auth/tenant/ownership check. Người biết ID có thể đọc manuscript/generation qua route này. Public context/job/writing cũng chưa có trusted actor boundary; preview_context nhận tenant_id nhưng không dùng để scope repository theo request. Cần fail-closed service auth và tenant/actor mapping; test anonymous và cross-tenant.

5. **P1 — UI không bao giờ chuyển sang preview hoàn tất.** `web/src/features/ai-copilot/WritingAssistantPanel.tsx:193`, 195 và 342 dùng COMPLETED/FAILED, trong khi service trả completed/failed. API client trả json.data nguyên trạng. Poll tiếp tục và preview không render. Ngoài ra client mặc định expected_brain_version=1, panel không truyền version thật nên brain đã review có version >1 bị conflict. Sửa mapping contract và browser test với brain version >1.

6. **P1 — World-rule validation bỏ qua facts từ repository thật; output patch không có upper bound.** PostgreSQL context trả fact_value (`postgres_narrative_repository.py:1550`), validator chỉ đọc statement/description/summary (`writing_service.py:406`). Validator chỉ kiểm tra start/end âm hoặc đảo thứ tự, không so end với chiều dài base; không kiểm tra replacement trùng draft đã validate, không bắt empty draft. Platform còn clamp offsets thay vì từ chối. Kết quả probe trực tiếp: world rule fact_value='không thể dịch chuyển trong kết giới', draft='Hắn dịch chuyển trong kết giới.', patch=(0,999999,'') được trả duy nhất [('OK', True)]. Phải thống nhất fact schema, validate chính replacement sẽ apply và upper bounds từ immutable base; bổ sung repository-to-validator tests và negative cases.

7. **P1 — UI có thể áp patch lên sai nội dung và mất edit chưa lưu.** Panel dùng revisions[0] làm base nhưng offsets lấy từ editorContent hiện tại, không kiểm tra hash/content khớp. Generate lần đầu còn tự tạo snapshot ghi cả SQL/Mongo. Sau generate, editor vẫn có thể đổi nhưng accept ghi đè bằng revision.content. Chapter switch không hủy/reset job cũ khi chuyển sang chapter khác có ID. Cần explicit save/snapshot policy, dirty-content guard, reset/cancel polling khi đổi chapter và test edit trong lúc chờ job.

## Các yêu cầu Phase 6 còn thiếu

- **Idempotency generation:** writing_service.py:103–106 trả existing trước khi so input_hash; cùng key khác chapter/instruction vẫn trả job cũ. input_hash hiện thiếu revision/hash/constraints/style. Cần canonical request hash đầy đủ và conflict, concurrency test.
- **Context consistency:** process_generation lấy context sau kiểm tra version lúc start mà không recheck/snapshot; không truyền chapter cutoff, bỏ constraints/style khi gọi LLM. Repository không dùng character_name, không importance rank, không loại superseded event, state luôn latest; token budget chỉ số ước tính, không thực thi giới hạn. Cần sửa và test actual prompt artifacts/version, timeline cutoff và budget.
- **Incremental analysis không bền vững:** fire-and-forget fetch không retry/outbox, không kiểm tra response.ok; HTTP 4xx/5xx không vào catch. Tenant=userId khác default tenant dùng ở browser; chưa có mapping thống nhất. Cần durable dispatch và chứng minh retry không tạo revision mới.
- **Legacy `/suggest-next` chưa chuyển sang generation service:** ai-service/api/routes.py không có diff Phase 6; vẫn pipeline cũ.
- **Evidence còn thiếu:** thư mục bàn giao chỉ có 4 file unit/typecheck/build; không có Phase 6 live PostgreSQL migration/concurrency, Mongo fault recovery, HTTP/Postman, Platform end-to-end hoặc browser evidence. 4 backend tests chỉ kiểm tra helper applyPatchToContent, không kiểm thử accept/revision transaction. Một test còn yêu cầu clamp offsets ngoài biên, trái tiêu chí từ chối patch sai.

## Kiểm tra thực hiện bởi Astra

- Chạy `python -m pytest -q tests/test_writing_validation_golden.py`: **8 passed**, 4 warnings.
- Probe trực tiếp validator bằng context shape PostgreSQL như mục 6: **vi phạm không bị chặn**. Đây là tái hiện ở cấp validator, không phải live HTTP/PostgreSQL test.
- Đọc code API, service/repository, migration, client/panel, tests và report. Không chạy UI; không tuyên bố có evidence end-to-end.

## Yêu cầu sửa bàn giao

Giữ nguyên bàn giao trước để truy vết, bổ sung correction: các tuyên bố “complete end-to-end”, “adheres strictly ... approved plan”, “dual-write consistency” và “invariants verified” chưa có cơ sở; lần review plan trước là NEEDS REVISION. Sửa lỗi theo thứ tự server authorization/accept/data safety → validation/context → frontend → integration evidence. Chưa chuyển Phase 7. Báo cáo tiếp theo đối chiếu từng finding với diff, test thật và evidence; ghi NOT RUN/BLOCKED nếu thiếu môi trường.
