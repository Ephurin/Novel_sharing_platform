# Vòng P1 ngắn — gate trước bài 100k

Đọc WORKFLOW_CONTRACT.md trước. Tạo run/project mới; giữ evidence cũ. Dùng UI
cho hành động tác giả, API read-only để kiểm chứng. Thiếu UI ghi BLOCKED tại bước
đó; API diagnostic có thể chạy riêng nhưng không thay verdict UI. Không xuất bản.
Việc gửi fixture tới provider thật vẫn cần quyền đã được xác nhận cho đích/payload;
lệnh retest Gemini của lượt trước đang bị approval gate chặn, không tự chạy lại.

| ID | Thao tác | Điều kiện đạt / bằng chứng |
|---|---|---|
| S01 | Nhập ch01–ch05 từ fixture bằng UI import hoặc editor, lưu nháp | Nội dung readback khớp; chapter/revision IDs và hash; chưa xem nhập thành extraction |
| S02 | Chủ động trích xuất dữ liệu ban đầu | Job/source revision rõ; proposals xuất hiện, chưa vào official context |
| S03 | Duyệt từng nhóm, bỏ mục sai; hoàn tất baseline | Lưu before/after, quyết định và provenance; audit P1-M0 theo gold có sẵn |
| S04 | Mở các tab và reload | Nhân vật/địa danh/vật phẩm/sự kiện đã duyệt hiện đúng; khớp bộ nhớ mà context sử dụng |
| S05 | Yêu cầu gợi ý event kế tiếp, sửa một gợi ý và bỏ một gợi ý | Gợi ý xuất phát từ canon; lưu bản gốc và chỉnh sửa; chỉ event được chọn vào kế hoạch |
| S06 | Duyệt kế hoạch, reload và kiểm tra context | Event dự kiến chưa trở thành lịch sử; chưa đổi sở hữu/tri thức nhân vật |
| S07 | Viết tiếp/lưu chương qua editor bình thường | Không gọi snapshot thủ công để cứu bài test; tự có extraction từ revision mới |
| S08 | Đợi queue, kiểm tra rồi duyệt | Trước duyệt official memory không đổi; sau duyệt phản ánh prose thực; planned event chỉ realized nếu có bằng chứng |
| S09 | Lưu sửa nhanh hai lần và thử lại thao tác save | Không nhân đôi canon, không áp kết quả revision cũ âm thầm; dữ liệu mới nhất được xử lý |
| S10 | Chạy consistency checking với chi tiết mâu thuẫn được cài có chủ đích trong nháp | Báo đúng bằng chứng; sửa nháp qua UI, lưu và kiểm tra lại; không sửa DB để che lỗi |
| S11 | Tải lại trang và tiếp tục viết | Memory/context/tab thống nhất; audit M-FIRST và final; chương vẫn là nháp |

Không bắt buộc hoàn thành 100k ở vòng này. Ghi word count thực; không sửa gold
để phù hợp output. Sau PASS vòng P1, chạy riêng nhánh ý tưởng thô và full auto:
kiểm tra có/không có định hướng, tự duyệt chỉ trong full auto, không publish,
memory lỗi thì không âm thầm completed và truyện hoàn thành theo tiêu chí nội dung.

Mẫu ghi kết quả mỗi bước:

| Step | Kênh UI/API/code | Expected | Actual | Evidence path | PASS/FAIL/BLOCKED/NOT_RUN | Issue |
|---|---|---|---|---|---|---|
| S01 | | | | | NOT_RUN | |

Kết quả cuối phải tách UI journey, raw extraction, approved memory và văn học.
Vòng ngắn không thay các mốc memory 10/20/50 của bài dài trên P1/P2/P3.
