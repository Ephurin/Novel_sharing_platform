# Tổng hợp Văn bản Quy định & Chứng cứ Pháp lý

Tài liệu này tổng hợp các văn bản pháp luật hiện hành và các tài liệu nội bộ hỗ trợ quá trình vận hành nền tảng theo đúng quy định.

## 1. Danh mục Văn bản Pháp luật Cốt lõi

| Tên Văn bản | Cơ quan Ban hành | Phạm vi Áp dụng |
| :--- | :--- | :--- |
| **Luật Xuất bản** | Quốc hội | Điều chỉnh hoạt động biên tập và phát hành nội dung số. |
| **Luật An ninh mạng** | Quốc hội | Quy định về lưu trữ dữ liệu người dùng và xử lý nội dung vi phạm. |
| **Luật Sở hữu trí tuệ** | Quốc hội | Bảo hộ bản quyền tác giả và xử lý các hành vi xâm phạm. |
| **Luật Giao dịch điện tử** | Quốc hội | Xác lập giá trị pháp lý của hợp đồng điện tử và chữ ký số. |
| **Luật Bảo vệ NTTD** | Quốc hội | Đảm bảo minh bạch trong giao dịch nạp tiền và chính sách hoàn trả. |

## 2. Quy định về Thuế và Tài chính
- **Thuế Giá trị gia tăng (VAT):** Áp dụng cho các giao dịch nạp coin và gói thuê bao.
- **Thuế Thu nhập cá nhân (TNCN):** Quy trình khấu trừ thuế tại nguồn đối với thu nhập của tác giả khi đạt ngưỡng chi trả.
- **Hóa đơn điện tử:** Thực hiện xuất hóa đơn theo Nghị định 123/2020/NĐ-CP cho mọi giao dịch doanh thu.

## 3. Hệ thống Lưu trữ Tài liệu (Artifacts)

Toàn bộ các bằng chứng vật lý và tài liệu số được phân loại và lưu trữ tại các thư mục sau:

- **Hợp đồng & Chính sách:** [artifacts/contracts/](artifacts/contracts/)  
  Lưu trữ mẫu hợp đồng tác giả, Điều khoản sử dụng (ToS) và Chính sách bảo mật (Privacy Policy).
  
- **Văn bản Pháp lý (Bản gốc):** [artifacts/legal/](artifacts/legal/)  
  Bản PDF các bộ luật và thông tư hướng dẫn được tải từ các cổng thông tin chính thống (vanban.chinhphu.vn).

- **Thiết kế & Quy trình:** [artifacts/diagrams/](artifacts/diagrams/)  
  Sơ đồ quy trình thanh toán, phê duyệt nội dung và giải quyết tranh chấp.

- **Bằng chứng Vận hành:** [artifacts/screenshots/](artifacts/screenshots/)  
  Ảnh chụp giao diện thực tế của hệ thống để làm bằng chứng về tính minh bạch của luồng thanh toán và kiểm duyệt.

## 4. Ghi chú Thực thi
Trong quá trình triển khai, cần định kỳ cập nhật các thông tư hướng dẫn mới nhất từ Tổng cục Thuế và Bộ Thông tin & Truyền thông để đảm bảo tính tuân thủ liên tục. Ưu tiên hoàn thiện cơ chế xác thực định danh (KYC) cho đối tượng tác giả trước khi thực hiện lần thanh toán doanh thu đầu tiên.
