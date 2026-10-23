# Sửa review PR #54 và #55 — 22/10/2026

Nhánh nhận bản sửa là `feat/author-workflow-hardening` (PR #55), nền `0c0b903f`.
Các thay đổi #54 nằm trong nhánh hardening để được đưa vào workspace theo thứ tự
merge đã thống nhất: #55 → #54. Không tự merge hai PR.

## Nội dung đã sửa

- **#54 — điểm nhận xét:** UI ghi rõ “Điểm trung bình của nhận xét có nội dung”;
  số nhận xét được tách nghĩa khỏi số lượt chấm điểm chung. Test có một nhận xét
  10 điểm và một lượt chấm 4 điểm không có văn bản: danh sách hiện 10, thống kê
  chung là 7. Contract API được cập nhật.
- **#55 — tham chiếu cốt truyện:** chỉ đổi thứ tự bản thảo chưa phát hành,
  chưa có checkpoint, outbox phân tích, Story Brain PostgreSQL, plot summary hoặc
  timeline. Lịch sử phát hành của chương đã xóa/lưu trữ vẫn được kiểm tra. API trả
  `409 CHAPTER_ORDER_CANONICAL`; không tự sửa các tham chiếu lịch sử.
- **#55 — số chương đã xóa:** chương đã xóa giữ nguyên số; reorder chỉ hoán vị
  các số của chương active. Khoảng trống được giữ có chủ đích, chương mới lấy
  số kế tiếp sau số lớn nhất từng cấp. Test create → archive/delete → reorder
  ba lần → create xác nhận chương mới là số 4, tombstone vẫn là số 2.
- **#55 — transaction lịch đăng:** truyền PostgreSQL client vào kiểm duyệt.
  Migration `017_transactional_moderation_evidence.sql` lưu bằng chứng phát hành
  trong PostgreSQL cùng review, chapter, schedule và notification outbox.
  Bằng chứng MongoDB cũ vẫn đọc được. Savepoint loại bỏ các ghi dở khi xử lý
  lỗi nghiệp vụ; lỗi SQL rollback toàn bộ lần chạy và được retry.
- **Bình luận #55 / issue #56 — autosave:** đổi tài khoản tạo phiên bộ đệm mới;
  callback cũ không được gửi tiếp hàng đợi hoặc cập nhật trạng thái phiên mới.
  Giữ backup theo tài khoản, hiển thị đúng giá trị đang gửi khi quay lại chương,
  và không báo “đã lưu” khi vẫn còn bản mới chờ gửi. IDE khóa query/bộ đệm theo
  tài khoản và xóa nội dung hiển thị khi đổi tài khoản.

## Kiểm chứng

- Toàn bộ backend: **136/136 PASS**, không skip, PostgreSQL/MongoDB trong database
  kiểm thử riêng. Sau bổ sung test timeline/lịch sử phát hành, test workflow chạy
  lại cũng PASS.
- Frontend hiện có: **12/12 PASS**; TypeScript và production build backend/web PASS.
- Playwright Chrome headless mount **hook thật và NovelReviews thật**, React
  Strict Mode và RouterProvider, gọi backend thật trong schema/MongoDB riêng.
  Đã kiểm tra Undo B→A→B trước debounce (0 PATCH, revision/outbox không đổi),
  chỉ gửi buffer mới nhất, request A đang chạy→B, đổi chương, chặn rời trang,
  đổi tài khoản trên cùng hook/chapter, đổi tài khoản lúc request đang chạy,
  khôi phục sau router remount, 409 từ lượt lưu cạnh tranh, nhãn review,
  desktop Light và mobile Dark không tràn ngang.
- Snapshot sau flush có hash nội dung khớp revision PostgreSQL và outbox.
  Autosave vẫn chỉ lưu draft; checkpoint được tạo tường minh. Không khẳng định
  mỗi autosave tạo một immutable revision.
- Fault injection bằng trigger làm lỗi cập nhật schedule **sau khi tạo review**:
  review/evidence/chapter/outbox rollback, schedule vẫn PENDING. Bỏ trigger rồi
  retry hai lần chỉ tạo một review, một evidence và kết quả lịch nhất quán.
- Backend AI của browser fixture trỏ tới local port không có provider; không
  gọi Gemini hoặc dịch vụ trả phí. Không sửa nhánh/evidence P1 đã niêm phong.

Artifacts: [readback và source hashes](draft-readback.json),
[Playwright trace](draft-trace.zip), [hook sau remount](draft-persistence.png),
[Light desktop](reviews-light-desktop.png), [Dark mobile](reviews-dark-mobile.png).
Readback ghi rõ SHA nền và hash của source working tree, không giả định đã có
commit mới. Đây là regression của hook/component với backend thật, chưa phải
chạy lại S09–S11 trên nhánh pipeline hoặc toàn bộ auth/router production.

## Chạy lại browser regression

Cài dependency của `backend` và `web`; cung cấp `DATABASE_URL`, `MONGODB_URI`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` cho môi trường kiểm thử. Fixture tạo
schema và MongoDB ngẫu nhiên rồi dọn sau khi chạy; không cần seed demo.

Trong PowerShell, từ thư mục `web`:

```powershell
$env:RUN_DRAFT_BROWSER_TESTS = '1'
npm run test:draft-browser
```

Mặc định dùng Chrome đã cài; có thể chọn Edge bằng `PLAYWRIGHT_CHANNEL=msedge`.
Test không có opt-in sẽ skip. Trace và ảnh được ghi lại trong thư mục này.

## Triển khai và thứ tự merge

Áp dụng migration 017 trước khi triển khai backend mới. Merge #55 vào
`feat/author-workspace` trước khi merge #54 vào `main`, để #54 nhận đầy đủ bản
sửa. Theo yêu cầu của chủ repository, PR #52 nằm ngoài phạm vi lượt này và không
là điều kiện chặn commit/push các sửa đổi #54/#55.
