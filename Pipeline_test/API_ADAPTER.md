# Adapter cho ứng dụng hiện có

**Revision 1.2:** adapter mô tả khả năng API, không định nghĩa luồng sản phẩm.
Ưu tiên `WORKFLOW_CONTRACT.md`. Trong vòng `SHORT_LOOP_TEST.md`, dùng API
read-only để đối chiếu; mutation API chỉ được ghi như test kỹ thuật riêng, không
thay thao tác UI hoặc giả lập rằng autosave đã tự trích xuất thành công.

Đối chiếu tại checkout `af20712`; đây là hướng dẫn contract, không phải trình chạy tự động. Trước run, kiểm tra lại routes/schema theo SHA thực tế. URL nền ví dụ `http://localhost:4000/api/v1`; lấy URL thật từ cấu hình. Chỉ dùng tài khoản AUTHOR/test được cấp. Không ghi token vào request log.

## Nguồn contract trong repo

- `backend/src/modules/ai/ai-gateway.routes.ts`
- `backend/src/modules/ai/ai-gateway.controller.ts`
- `backend/src/modules/novels/chapters.routes.ts`, `chapters.schemas.ts`
- `backend/src/modules/novels/chapter-revisions.schemas.ts`
- `ai-service/api/schemas.py`
- `web/src/features/manuscript-import/manuscript-import-api.ts`

Mọi đường bên dưới tương đối với `/api/v1`. Response Node thường có envelope `data`; kiểm tra response thực. Không gọi internal FastAPI/service-token để bỏ qua quyền hoặc bù chức năng thiếu.

## Nạp văn bản seed

Tạo novel qua giao diện/contract hiện hành, lưu ID. Tạo lần lượt 5 chương:

`POST /novels/{novelId}/chapters`

```json
{"title":"Chương 1 — Bến trở về","content":"<body thật của ch01.md, bỏ dòng tiêu đề Markdown>","isVip":false,"priceCoins":0}
```

Không gửi body rỗng. Kiểm tra số chương do server cấp; không giả định chapterNumber có thể gán trong create payload. Snapshot:

`POST /chapters/{chapterId}/revisions/snapshot`

```json
{"content":"<nội dung thật đã nạp>"}
```

Readback revision và lấy `revision_id`/`content_hash` đúng tên trường trả về. Khác biệt camelCase/snake_case phải ánh xạ từ contract, không đoán. Chuỗi SHA file Markdown trong fixture không phải content hash của body server.

`POST /ai/story-brains/bootstrap/from-manuscript`

```json
{
  "novel_id":"<NOVEL_ID>",
  "revisions":[{"chapter_id":"<ID>","revision_id":"<ID>","content_hash":"<64_HEX_FROM_API>"}],
  "locale":"vi-VN",
  "options":{"extract_world_rules":true,"build_embeddings":false,"require_review_for_all":true}
}
```

Mảng phải có đủ 5 revision thực. Mẫu dùng `build_embeddings=false` đúng flow UI hiện tại; nếu cần gate semantic, chọn cấu hình hỗ trợ embedding thật và ghi rõ trước run. Không đánh dấu semantic PASS khi không build/retrieve vector.

Poll `GET /ai/jobs/{jobId}`; review `GET /ai/story-brains/{novelId}/review-queue`; accept nhóm qua `POST /ai/proposal-groups/{groupId}/accept` với `proposal_ids`, `expected_brain_version`, `reason`. Baseline qua `POST /ai/story-brains/{novelId}/baseline/activate` với `{"job_id":"<ID>"}`. Không nhập gold trực tiếp vào repository.

**Memory audit:** trước accept/edit proposal, lưu raw queue và trace extraction sẵn có; sau activation lưu persisted-memory readback qua khả năng được hỗ trợ và chạy context probes theo `NARRATIVE_MEMORY_AUDIT.md`. Queue pending sau auto-accept có thể rỗng: không coi rỗng là không trích xuất hoặc tự suy là thành công; cần history/trace. Summary counts không thay chi tiết record/provenance. Adapter này không giả định có endpoint export memory hoặc provider trace; nếu chưa được ứng dụng/diagnostics cung cấp, ghi OBSERVABILITY_GAP. Áp dụng cả P2 bootstrap, incremental analysis sau accept và P3 controller.

## P2 idea bootstrap trên project riêng

`POST /ai/story-brains/bootstrap/from-idea`

```json
{
  "novel_id":"<EMPTY_PROBE_NOVEL_ID>",
  "idea":"Một người phục chế âm thanh trở về Cồn Vân điều tra lựa chọn của cha trong lũ cũ và ngăn thành phố lặp lại việc hy sinh Bãi Dưới.",
  "outline":"Kế hoạch tương lai: điều tra vật chứng, đối chiếu nhân chứng, tổ chức chống lũ công khai, công bố trách nhiệm và hậu quả. Chưa có các sự kiện này ở thời điểm khởi đầu.",
  "locale":"vi-VN",
  "preferences":{"genre":["bí ẩn xã hội","giả tưởng công nghệ nhẹ"],"tone":"tiết chế, giàu chi tiết đời sống","target_length":"long_form"},
  "author_constraints":["Mai Lâm đã chết, không hồi sinh","Gốm thanh chỉ lưu âm đã xảy ra","Kế hoạch tương lai không phải lịch sử canon"]
}
```

Mẫu này là smoke bootstrap, không thay thế BLUEPRINT đầy đủ của main novel. Review các facts/proposals thực sinh ra; chứng minh failure nếu model biến tương lai thành lịch sử.

## Story Plan

`POST /ai/story-plans`

```json
{
  "novel_id":"<MAIN_NOVEL_ID>",
  "source_outline":"<kế hoạch tương lai từ BLUEPRINT, gắn nhãn rõ>",
  "objectives":[
    {"order_index":1,"title":"Hoàn tất Ba tiếng gõ","description":"Khảo sát có kiểm soát; giải thích tiếng gõ bằng cơ cấu và phát hiện lối vận hành phụ. Chỉ complete khi chương có cảnh và hệ quả đầy đủ.","target_chapter":5,"objective_type":"chapter_goal","metadata":{"fixture_id":"PT-CV-001"}}
  ],
  "idempotency_key":"<RUN_ID>-plan-v1"
}
```

Tạo đủ 36 objectives cho chương 5–40; order_index tăng liên tục. Chỉ chương 40 là `objective_type=ending`; các tiêu chí văn học vẫn phải review ngoài cờ này. Nếu chia thành nhiều scene objectives, mỗi objective có ID/thứ tự riêng và cùng target_chapter thích hợp; ghi cấu trúc trước run. Không coi các metadata tự đặt là tính năng enforcement của server.

Payload đủ 36 objectives đã chuẩn bị trong `input/main_story_plan.template.json`. Bind `{{NOVEL_ID}}` và `{{RUN_ID}}` vào bản sao trong thư mục run, không sửa fixture gốc. Metadata trong đó là tiêu chí tác giả, không phải bảo đảm server sẽ thực thi độ dài.

Activate: `POST /ai/story-plans/{planId}/activate` với `{"novel_id":"<MAIN_NOVEL_ID>"}`. Read: `GET /ai/story-plans/{planId}`. Update objective: `PATCH /ai/story-plans/{planId}/objectives/{objectiveId}?novel_id=<ID>` với `{"status":"completed"}` khi tác giả đã đánh giá xong.

## Assisted writing

Context: `GET /ai/story-brains/{novelId}/context-preview` với các query bắt buộc theo controller hiện hành. Lưu request thực, context hash, brain version và IDs được chọn.

`POST /ai/writing/generations`

```json
{
  "novel_id":"<ID>","chapter_id":"<ID>","revision_id":"<LATEST_REVISION_ID>",
  "content_hash":"<LATEST_CONTENT_HASH>","operation":"continue",
  "selection":{"start":123,"end":123,"cursor":123},
  "instruction":"Viết tiếp cảnh hiện tại chương 5 từ câu cuối; xác định nguồn tiếng gõ qua quan sát. Giữ điểm nhìn Linh. Chưa tiết lộ bí mật của lũ cũ. Phát triển hành động và đối thoại, không tóm tắt.",
  "constraints":["Không hồi sinh Lâm","Duy không nghe bằng tai trái"],
  "expected_brain_version":1,"chapter_number":5,
  "idempotency_key":"<RUN_ID>-ch05-sc01-attempt01"
}
```

`123` và `1` là placeholder: thay bằng offsets Unicode code point và version thật. Không dùng độ dài UTF-16 JavaScript khi có ký tự ngoài BMP. Với continue, selection cuối body; không tính dòng title. Poll public job API; đọc draft/validation qua contract public hiện có. Nếu public API thiếu nội dung cần để author review, ghi blocker; không lách bằng internal endpoint.

Accept: `POST /chapters/{chapterId}/revisions/accept-draft` với `{"generationId":"<ID>"}`. Lấy revision mới, readback và review proposal mới. Sửa tay dùng editor hoặc `PATCH /chapters/{chapterId}` theo schema rồi snapshot; ghi can thiệp. Mỗi lần write phải có log nguồn.

## P3

Create `POST /ai/autonomous/runs`:

```json
{"novel_id":"<PROBE_ID>","plan_id":"<PLAN_ID>","max_iterations":10,"max_retries_per_objective":3,"idempotency_key":"<RUN_ID>-p3-probe"}
```

Quan sát từng bước: `POST /ai/autonomous/runs/{runId}/step`, đọc `GET /ai/autonomous/runs/{runId}`. Batch: `POST /ai/autonomous/runs/{runId}/run` với `{"max_steps":1}` trước khi tăng. Stop: `POST /ai/autonomous/runs/{runId}/stop` với `{"reason":"test_stop_probe"}`.

Giới hạn schema tại SHA tham chiếu: `max_iterations` tối đa 100. Không tự tăng code để chạy 100k. Quan sát số từ mỗi objective và khả năng continuation thực tế. Nếu run completed quá sớm, giữ nguyên kết quả thất bại.

## Mọi ví dụ đều có placeholder

Không gửi nguyên ví dụ chưa bind. Kiểm tra ownership, IDs, revision/version và kế hoạch trước mỗi write. Các bước read-only DB diagnostics chỉ dùng khi đã có quyền và phải gắn nhãn diagnostic; không được dùng SQL để tạo/accept/chỉnh truyện.
