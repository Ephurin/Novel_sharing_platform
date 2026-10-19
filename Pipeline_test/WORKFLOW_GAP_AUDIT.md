# Đối chiếu luồng với checkout — 2026-10-18

**Cập nhật triển khai:** các khoảng trống bên dưới đã được xử lý trong code theo
`runs/2026-10-18-workflow-repair/REPORT.md`. Giữ bảng này làm bằng chứng audit ban
đầu; đọc báo cáo mới để biết thay đổi, kết quả kiểm tra và giới hạn UI/provider.

Phạm vi: code hiện tại, gồm các bản sửa M0 chưa commit. Đây là audit SOURCE_CODE,
không phải báo cáo UI E2E pass. Browser tool không khởi tạo được
(`failed to write kernel assets`, OS error 3). Không gọi Gemini hoặc sửa DB.

## Bảng đối chiếu

| Bước | Kết quả từ code | Bằng chứng | Việc cần làm |
|---|---|---|---|
| Import manuscript + extraction/review | Có đường UI riêng; chưa chứng minh đường editor/chương đã xuất bản tương đương | `web/src/features/manuscript-import/ManuscriptImportPage.tsx:278`, `:340`, `:356`, `:1288` | Kiểm tra UI import thật; bổ sung điểm vào từ dữ liệu sẵn có |
| Ý tưởng thô chỉ extract nhân vật/địa danh | Lệch phạm vi: service gọi novel architect sinh blueprint, premise/world rules/constraints thành fact proposals | `ai-service/application/bootstrap_service.py:149`, `:172`, `:197`, `:296` | Tách extraction dữ liệu tác giả khỏi sáng tạo blueprint; không dùng một smoke thay cho cả hai |
| Chờ duyệt được lưu tạm | Phù hợp thiết kế: queue, accept/reject, activate baseline tồn tại | `ManuscriptImportPage.tsx:293`, `:319`; repository accept proposal group | Giữ; xác minh context không dùng pending và reload hiển thị đúng |
| Các tab đọc memory sau duyệt | Nguy cơ lệch nguồn dữ liệu: IDE gọi story-context API; API đọc bảng legacy, AI lưu narrative schema | `AuthorWritingIde.tsx:15`; `backend/src/modules/story-context/story-context.repository.ts:82`, `:278`; `ai-service/infrastructure/orm_models.py:30`, `:57`, `:140` | Truy vết cầu nối/sync và kiểm tra readback. Chưa kết luận dữ liệu bị mất nếu chưa kiểm chứng runtime |
| Lưu chương tự extract | Có gap rõ tại đường editor: autosave gọi updateChapter; updateChapter ghi draft Mongo rồi return, không tạo revision/outbox trong đường này | `AuthorWritingIde.tsx:454`; `backend/src/modules/novels/chapters.service.ts:170`; so `chapter-revisions.service.ts:138`, `:371` | Nối save thành durable revision/extraction job, debounce/dedup, xử lý sửa nhanh và revision cũ |
| Duyệt cập nhật memory ngay trong editor | Review queue được tìm thấy tại trang import; chưa tìm thấy wiring queue trong IDE đang được router dùng | `web/src/app/router.tsx:54`; `ManuscriptImportPage.tsx:139`; search `review-queue` toàn `web/src` | Đưa queue và trạng thái đồng bộ vào hành trình viết; kiểm thử sau save thường |
| Gợi ý event → chỉnh → duyệt làm kế hoạch | Chưa tìm thấy wiring UI from-idea/story-plan/autonomous trong tìm kiếm toàn web/src; timeline CRUD không đủ chứng minh lifecycle planned/occurred | `story-context-api.ts:101`; `AuthorWritingIde.tsx:1813` | Xác minh contract và triển khai UI/lifecycle riêng; không coi generation prose là event suggestion |
| Cập nhật thế giới/consistency | Chưa chứng minh hành trình tác giả hoàn chỉnh qua UI | Search `consistency`, `update_world`, `next_event` trong các đường đã đọc | Cần case có mâu thuẫn + dẫn chứng + quyết định tác giả + readback |
| Full auto tự duyệt, lưu nháp | Có controller gọi acceptDraft và scoped accept proposals; không thấy publish call trong controller đã đọc | `backend/src/modules/ai/autonomous-controller.service.ts:362`–`:425` | Kiểm tra trạng thái chương thực và quyền publish bằng test; chưa gọi đây là LIVE PASS |
| Full auto xử lý thất bại memory | Gap: lỗi auto-accept chỉ cảnh báo, sau đó objective vẫn được đánh completed | controller `:395`–`:432` | Chặn tiến độ khi memory bắt buộc chưa xong; retry có giới hạn và resume |
| Full auto không bắt buộc tác giả lập định hướng | API hiện cần plan active nếu không truyền plan; trả NO_ACTIVE_PLAN | `ai-service/api/narrative_routes.py:336` | Có bước hệ thống tự tạo kế hoạch khi thiếu; chưa cần đổi kiến trúc agent |
| Hoàn thành truyện | Objective được đánh completed sau accept một generation; kết thúc dựa terminal/hết objectives | controller `:427`–`:454` | Kiểm tra đủ nội dung/độ dài/payoff trước khi kết luận bài 100k hoàn thành |

Đường file rút gọn trong bảng trỏ vào `web/src/features/author-ide/`,
`web/src/features/manuscript-import/`, `backend/src/modules/novels/` như hàng đầu tiên tương ứng.
Các kết luận “chưa tìm thấy” là giới hạn của audit, không phải bằng chứng tính năng
không tồn tại ở mọi nhánh hay môi trường triển khai.

## Xem lại bản sửa M0

- Confidence 0–10 → 0–1 và kiểm tra trước ghi: giữ; độc lập với thay đổi luồng.
- Structured JSON budget/finish reason: giữ; hỗ trợ chẩn đoán extraction, không
  chứng minh chất lượng extraction hoặc sửa gap autosave.
- Unknown thay Alive mặc định, initial_status có duyệt: phù hợp yêu cầu không
  tự tạo trạng thái sai. Tuy nhiên prompt sinh blueprint vẫn rộng hơn luồng ý tưởng
  thô đã thống nhất; không tuyên bố P2 đã đúng chỉ vì trạng thái Dead được giữ.
- 270 tests pass ở lượt sửa trước là bằng chứng regression của lượt đó. Lượt audit
  này chỉ sửa tài liệu; không chạy lại và không nâng kết quả thành UI acceptance.

## Thứ tự xử lý

1. Chốt nguồn memory mà sidebar/context cùng đọc; nối save → revision → extraction
   và queue duyệt trong editor. Đây là điều kiện để vòng P1 ngắn phản ánh sản phẩm.
2. Chạy `SHORT_LOOP_TEST.md`, lưu bằng chứng từng bước. Sửa chỗ đứt theo kết quả.
3. Tách ý tưởng thô/blueprint; event kế hoạch/lịch sử; hoàn thiện thao tác tương ứng.
4. Sửa gate memory/completion của full auto; chứng minh không xuất bản tự động.
5. Sau vòng ngắn mới mở bài 100k và các checkpoint dài. Không dùng API bypass
   các gap UI rồi kết luận hành trình tác giả đã pass.

Chưa sửa thêm product code trong lượt audit này. Bản sửa M0 và evidence cũ được giữ.
