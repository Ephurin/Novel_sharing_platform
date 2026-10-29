# Tổng duyệt demo P1 Author IDE — 09/11/2026

Runbook cho người trình bày, dựa trên thao tác UI thực tế ở source `e8f44dfbad7950b5a6b6835ec239ba45b4fb7e6f`. Xem [báo cáo acceptance](P1_DEMO_FINAL_ACCEPTANCE.md) cho giới hạn và bằng chứng kỹ thuật.

## Chuẩn bị

Người vận hành cung cấp URL của stack demo riêng và tài khoản qua kênh riêng. URL QA đã dùng là `http://127.0.0.1:15577`; stack này hiện đã dừng, không phải địa chỉ dịch vụ luôn sẵn sàng. Frontend phải được build từ source đã chốt; Backend, AI Service và DB phải cùng stack.

Cấu hình được chọn cho demo: **`ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`**. Luồng này có checkpoint duyệt danh tính trước khi trích xuất event/fact. Default của ứng dụng là false; không tự đổi cờ giữa buổi hoặc dùng script này để tuyên bố đã tổng duyệt luồng false.

Dùng fake provider local, không cloud/paid calls. Kết quả văn bản là mẫu cố định để chứng minh context và lưu trữ, không dùng để đánh giá chất lượng AI. Không nhập dữ liệu riêng tư thật. Chuẩn bị 10–15 phút hoặc hơn cho phần duyệt; đây là dự trù trình bày, không phải số đo tốc độ người dùng.

## Các bước người trình bày

| Bước / thao tác | Màn hình và kết quả mong đợi | Độ phức tạp tương đối | Khôi phục nếu không đúng | Bằng chứng |
|---|---|---|---|---|
| 1. Mở URL, chọn Đăng ký hoặc Đăng nhập. Tạo tài khoản demo mới. | Đăng nhập thành công vào ứng dụng. | 1 form | Kiểm tra URL/stack; không dùng tài khoản của người khác. | Đã thao tác UI |
| 2. Mở Hồ sơ cá nhân → “Trở thành tác giả”. | Có trang tác giả và “Tạo tác phẩm mới”. | 2–3 thao tác | Quay về Hồ sơ; xác nhận đã đăng nhập đúng tài khoản. | Đã thao tác UI |
| 3. Tạo tác phẩm “Vân Sơn Ký — Tổng duyệt P1”, nhập mô tả ngắn, xác nhận. | Studio của tác phẩm mới. | 1 form | Giữ nội dung nhập; đọc lỗi form trước khi thử lại. | Đã thao tác UI |
| 4. Thêm chương “Chương 1 — Sương núi Cồn Vân”, nhập đoạn bên dưới. Đợi “Đã lưu”. | Chương và nội dung được lưu. | 1 form + chờ autosave | Không reload khi còn đang lưu. Nếu tên ở sidebar cũ, đợi lưu rồi reload. | UI + DB readback |
| 5. Mở Story Brain → “Trích xuất” → trích xuất dữ liệu từ các chương đã lưu. | Có tiến trình và checkpoint danh tính. | 3–4 thao tác + chờ | Nếu provider lỗi, giữ bản thảo và nhờ người vận hành kiểm tra fake service; không đổi provider. | Đã thao tác UI |
| 6. Tại checkpoint, tạo nhóm Lâm Phong, Diệp Linh Nhi, Cồn Vân; dùng khóa ASCII `lam-phong`, `diep-linh-nhi`, `con-van`. Gán tên đầy đủ vào đúng nhóm, từ chối các mảnh tên/đại từ không cần thiết. | Mọi vị trí được quyết định rõ; không chỉ nhìn badge “Chờ duyệt (0)”. | Cao: lần chạy có 27 vị trí/6 trang, hàng chục thao tác | Lật từng trang, kiểm tra vị trí chưa xử lý. Không Freeze khi còn nghi ngờ. | Đã duyệt đủ 27 bằng UI |
| 7. Kiểm tra loại thực thể trước Freeze. Địa danh Cồn Vân không nên bị bỏ mặc định thành nhân vật. | Danh tính/loại phù hợp ý tác giả. | Cần chú ý, không bấm lướt | Dừng để người trình bày kiểm tra “Sửa thuộc tính”. Đường sửa LOC chưa hoàn tất trong rehearsal; không hứa thao tác chưa thử. | Điểm cần tổng duyệt bổ sung |
| 8. Freeze danh tính → tiếp tục trích xuất event/fact. | Các đề xuất Canon xuất hiện. | 2–3 thao tác + chờ | Không bỏ qua HITL; xem trạng thái checkpoint và lỗi trước khi thử tiếp. | Đã thao tác UI |
| 9. Xem nhóm đề xuất, chọn duyệt nguyên tử nhóm phù hợp → kích hoạt bộ nhớ sau duyệt. | Brain active, thực thể đã xác nhận và event được hiển thị. Lần chạy có 3 thực thể/1 event. | 3–5 thao tác | Không auto-approve đề xuất không đúng; dừng demo nếu cần sửa source. | UI + reload |
| 10. Reload. Mở Story Brain → “Hồ sơ Codex” → chọn Lâm Phong bằng tên và UUID. | Brain vẫn active; đúng nhân vật được chọn. | 3–4 thao tác | Kiểm tra đúng tác phẩm/tài khoản; không chọn chỉ dựa vào tên nếu có mơ hồ. | Đã thao tác UI |
| 11. Nhập ngoại hình, tính cách, xuất thân; chọn hiệu lực từ chương 1; lưu. | Báo lưu thành công và đọc lại từ server; version thay đổi. | 1 form | Khi đang lưu, chờ hoàn tất. Nếu 409, giữ nháp và đối chiếu bản mới trước khi lưu có chủ đích. | UI + PostgreSQL/audit |
| 12. Đóng drawer, về Tủ truyện, mở lại Studio và hồ sơ. | Ba trường vẫn đúng sau điều hướng. | 4–6 thao tác | Đợi drawer đóng hẳn rồi bấm; reload sau khi đã lưu. Nếu dữ liệu mất, dừng demo. | Đã thao tác UI |
| 13. Thêm ghi chú riêng hư cấu, lưu. Giải thích đây không phải Canon. | Ghi chú lưu; Brain/Canon không bị note-only mutation thay đổi. | 1 field + save | Không chiếu màn hình có ghi chú nhạy cảm. Không copy note vào yêu cầu AI. | UI + hash/audit readback |
| 14. Tạo chương 2, nhập đoạn mở đầu bên dưới, đợi “Đã lưu”. | Chương tiếp theo có bản thảo. | 1 form | Sidebar có thể chậm đổi tên; reload sau autosave. | Đã thao tác UI |
| 15. Mở “AI Hỗ trợ viết”, chọn phạm vi “Story Bible (Nhân vật & Sự kiện)”, nhập yêu cầu bên dưới, gửi. | Có writing job và kết quả từ fake provider. Không cần gọi Context Preview trước. | 3–5 thao tác + chờ | Giữ bản thảo; nếu lỗi, nhờ vận hành khôi phục fake service. Không đổi sang cloud. | UI → Gateway → job/DB → fake prompt |
| 16. Giải thích profile đã vào context, private note không vào prompt. Với kết quả fake có tên không đúng, chọn từ chối/bỏ qua. | Bản thảo/Canon không bị mẫu cố định ghi đè. | 1–2 thao tác | Không chèn một kết quả sai chỉ để hoàn thành demo. | UI + hash/context readback |
| 17. Kết thúc ở hồ sơ đã lưu hoặc bản thảo gốc; đăng xuất nếu dùng máy chung. | Dữ liệu tác giả còn nguyên, không mở note riêng trên màn hình. | 1–3 thao tác | Không mở Studio tác giả khác; trở về dashboard của mình. | Logout/đổi tài khoản đã thử |

Không dùng script/SQL để “làm sẵn” các bước tác giả rồi tuyên bố UI đã thực hiện. Người trình bày không cần đọc source hoặc mở DB. Hash và prompt được người vận hành kiểm chứng riêng, không chiếu raw traces/credentials.

## Nội dung hư cấu có thể dùng

Chương 1:

> Lâm Phong đứng trước cổng cổ thành Cồn Vân. Chàng mặc áo vải xanh, cầm kiếm gỗ trong tay phải. Diệp Linh Nhi bước tới, trao cho Lâm Phong một viên linh thạch.
>
> — Đừng đi vào rừng khi trăng chưa lên, nàng nói.
>
> Lâm Phong gật đầu rồi cùng Diệp Linh Nhi tiến về thung lũng.

Hồ sơ Lâm Phong:

- Ngoại hình: Tóc đen buộc gọn, áo choàng xanh, mắt sáng.
- Tính cách: Điềm tĩnh, giữ lời hứa và quan sát kỹ trước khi hành động.
- Xuất thân: Đệ tử trẻ của sơn môn Vân Sơn, lớn lên cạnh thung lũng Cồn Vân.

Chương 2:

> Lâm Phong nhìn về con đường xuống núi. Diệp Linh Nhi chờ dưới tán tùng già.

Yêu cầu viết:

> Viết tiếp cảnh Lâm Phong và Diệp Linh Nhi xuống núi, giữ giọng văn điềm tĩnh và dùng hồ sơ nhân vật đã xác nhận.

Ghi chú riêng: tự tạo một câu hư cấu không nhạy cảm; không dùng giá trị ghi chú QA hoặc mật khẩu. Không cần chiếu nội dung này để chứng minh isolation.

## Phần tùy chọn và giới hạn

- Có thể giải thích cutoff bằng hồ sơ nền hiệu lực từ chương 10: ở chương 2 nó chưa vào context. Đây là whole-snapshot cutoff, không phải tái dựng lịch sử từng trường. Thay đổi xảy ra trong truyện phải qua event/state correction hiện có.
- Bulk “áp dụng mọi vị trí” có bước xác nhận thứ hai. Rehearsal chưa hoàn tất bước đó; dùng quyết định từng vị trí cho đường đã kiểm chứng.
- Hai browser context tự động đã kiểm chứng 409/giữ nháp và retry idempotent. Chưa có tổng duyệt thủ công hai cửa sổ; không ứng biến màn conflict nếu chưa tập trước.
- Người thứ hai bị backend từ chối Studio của tác giả đầu tiên. UI có thể trống/loading thay vì trang cấm rõ ràng; quay về dashboard riêng, không reload liên tục.
- Nút hủy generation đang chạy, chèn/accept bản AI, sửa danh tính sau xác nhận, mobile và flag=false chưa được tổng duyệt thủ công.
- Fake extractor có thể tạo quá nhiều candidate; fake writer có thể trả tên mẫu khác. Đây không phải bản demo chất lượng mô hình.
- Badge kiểm định trong UI không thay thế việc đọc kết quả. Không diễn giải badge là chứng nhận nội dung của live model.

## Khi nào phải dừng

Dừng ngay nếu lưu/reload mất dữ liệu, private note xuất hiện trong prompt/tài khoản khác, migration thất bại, hoặc cần sửa source để đi tiếp. Giữ nháp và báo người vận hành; không tự sửa DB, backfill timestamp, đổi flag hoặc dùng live provider.

Bằng chứng kỹ thuật hiện có: schema fresh/upgrade/NULL fail-closed PASS; profile/audit persistence PASS; generation job/hash/profile/private-note isolation PASS. Runbook còn cần người trình bày tự tập lại phần kiểm tra loại thực thể và các tương tác được ghi rõ là chưa thử. Không deploy/merge từ buổi tổng duyệt này.
