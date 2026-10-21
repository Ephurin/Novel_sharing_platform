# Entity candidate verification — implementation checkpoint

Status: implementation and offline regression; live provider/UI quality NOT_RUN.

## Đã làm

- Tầng ứng viên theo occurrence: tên viết hoa, danh xưng/địa danh, mã vật phẩm, approved names/aliases và discovery bằng LLM trên các đoạn có overlap. Offset/hash giữ theo nguồn Unicode gốc; cùng span được gộp origins, không nhân đôi.
- LLM phải quyết định mỗi candidate ID: entity / not_entity / unresolved. Kiểm tra đủ IDs, type/name/target, quote và life status; một lần repair bổ sung rồi fail có mã lỗi nếu vẫn không hợp lệ.
- Alias cần bằng chứng trong context đang xác minh; identity mới cần occurrence của tên canonical đã verified. Không tự thêm entity mới để che target sai.
- Canonical revision analysis dùng inventory đã xác minh trước event/fact; chuẩn hóa alias được xác minh về canonical name, tạo alias proposal cùng nhóm review. Không ghi thẳng canon.
- Unresolved được lưu audit với trạng thái needs_review và chặn analysis trước event/fact; không để fullauto xem queue rỗng là extraction thành công.
- Audit riêng khỏi official memory: migration0011 cho PostgreSQL; JSON backend có trường riêng, không lọt vào brain metadata/context. Có GET read-only theo novel/analysis run.
- UI review có dòng riêng cho alias: tên gọi → canonical identity, quote xác lập và source revision/offset; tác giả có thể loại trước khi duyệt nhóm.
- Cờ `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`, mặc định **false**. Khi bật, pipeline policy/version đổi; retry cũ không được coi là kết quả mới. Legacy extraction endpoints và P2 setup extraction chưa chuyển sang tầng mới.

## Phạm vi chưa được chứng minh

Các LLM trong regression là stub xác định: kiểm tra cơ chế và guard, không đo recall/precision của Gemini. Chưa chạy gold entity với provider thật, chưa retest35 narrative assertions, P2/P3/100k NOT_RUN. Chỉ discovery/entity verification có chia đoạn; event/fact vẫn đọc toàn chương.

Không deploy, không chạy migration trên DB ứng dụng, không bật lại5 outbox cũ. Backend/AI test stack riêng vẫn giữ trạng thái dừng từ checkpoint trước.

## Validation

Python: **374 passed, 2 skipped, 42 deselected**; xem `python-tests.txt`. Bao gồm occurrence/negative controls, Unicode NFC/NFD offset, overlap, đầy đủ verdict/repair limit, alias→event/fact, alias ngắn của hai người không merge hoặc bị bỏ âm thầm, audit isolation trên memory/JSON/SQL, API GET scope và migration bảo toàn dữ liệu. Các test SQL repository ở đây dùng SQLite; PostgreSQL thật cho migration mới chưa chạy. Web build **PASS** (còn warnings dependency và bundle size). Xem thêm `validation.json` và `web-build.txt`.

## Liên kết với bản đồ

X01–X04: đã có implementation cho canonical revision workflow dưới cờ; chưa đạt live acceptance. X05: chỉ inventory dùng chung/alias canonicalization, chưa chunk event/fact. X06: chưa có coverage audit độc lập toàn chương. X07: có feature flag và offline regressions; rollout/benchmark còn chờ.

Bản đồ trong `Pipeline_test/architecture` là snapshot trước thay đổi này; không sửa hồi tố trạng thái/evidence của run cũ.
