# Luồng tác giả đã thống nhất — revision 1.2, 2026-10-18

Nguồn: `../promt_.md` và ba xác nhận của người dùng trong hội thoại. Tài liệu này
ưu tiên hơn các giả định khác trong bộ test; không sửa hồi tố báo cáo/evidence cũ.

## Quy tắc sản phẩm

1. Nguồn ban đầu: ô riêng cho ý tưởng/thiết lập thế giới, hoặc chương đã lưu nháp,
   hoặc chương đã xuất bản. Tác giả chủ động nhấn “Trích xuất dữ liệu tiểu thuyết”.
2. Ý tưởng thô: trích xuất nhân vật và địa danh. Không tự biến outline tương lai
   thành lịch sử. Các trường thiết lập khác trong đầu vào phải được giữ riêng;
   chưa có yêu cầu cho phép AI tự bổ sung chúng thành canon qua luồng này.
3. Chương truyện: trích xuất nhân vật, vật phẩm, địa danh, sự kiện và dữ liệu bộ nhớ
   có bằng chứng trong phiên bản nguồn. Phân biệt lời đồn/nhận thức với sự thật.
4. Cho phép lưu proposals chờ duyệt vào DB. Chế độ thường: chỉ tác giả duyệt mới
   cập nhật bộ nhớ chính thức. UI phải phân biệt dữ liệu đang chờ với đã duyệt.
5. Sau duyệt: các tab nhân vật/địa danh/vật phẩm/sự kiện phải đọc lại dữ liệu đã
   lưu; kiểm tra sau reload và đối chiếu dữ liệu thực sự được dùng làm context.
6. Sau bước ban đầu, lưu nội dung chương mới tự kích hoạt extraction. Không yêu
   cầu tác giả tạo snapshot riêng hoặc accept văn AI để một lần lưu được phân tích.
   Code có thể debounce/gộp công việc, nhưng phải xử lý phiên bản mới nhất, chống
   trùng và không áp proposal cũ lên nội dung mới một cách âm thầm. Không cần gọi
   LLM cho mỗi phím gõ hay cho thay đổi metadata không ảnh hưởng nội dung.
7. Gợi ý event tiếp theo dựa trên memory đã duyệt. Tác giả được sửa, thêm/bớt,
   chọn một phần hoặc toàn bộ rồi duyệt lưu làm kế hoạch. Event kế hoạch được
   duyệt chưa trở thành event đã xảy ra; cần liên kết/đối chiếu khi prose xác lập nó.
8. Cập nhật thế giới/event chain và consistency checking có kết quả để tác giả
   xem và quyết định. Không đổi lịch sử chỉ để che mâu thuẫn trong chương mới.
9. Full auto tự lựa chọn, duyệt memory, viết và lưu chương NHÁP. Không có quyền
   tự xuất bản. Bản định hướng là khuyến cáo, không bắt buộc; thiếu định hướng
   thì hệ thống cần một cách xây dựng kế hoạch thay vì yêu cầu người dùng tự nhập.
10. Hoàn thành dựa trên nội dung, kết thúc và tiêu chí đã khai báo, không chỉ là
    generation thành công hay hết danh sách objectives. Mục tiêu 95–105k từ là
    acceptance của bài test dài, không phải yêu cầu cho mọi lần dùng copilot.

## Cách chứng minh

Luôn tách: SOURCE_CODE (đọc code), AUTOMATED_TEST (test đã chạy), LIVE_UI
(thao tác thực), LIVE_API (API thực). Có endpoint không đồng nghĩa có hành trình UI.
API hỗ trợ chẩn đoán không được biến một bước UI thiếu thành PASS.

Lượt tới chạy vòng ngắn trong `SHORT_LOOP_TEST.md` trước bài 100k. Mốc memory
sau import, sau lần lưu mới đầu tiên, 10/20/50 chương và kết thúc vẫn giữ nguyên
cho cả P1/P2/P3; chỉ ghi N/A khi run thực sự không đạt tới mốc đó.
