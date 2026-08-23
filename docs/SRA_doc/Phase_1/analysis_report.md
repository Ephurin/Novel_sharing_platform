# Báo cáo phân tích & đánh giá hệ thống hiện tại

1) Chức năng chính
- Reader: Tìm kiếm & khám phá (tags, recommendation), đọc theo chương, tùy chỉnh giao diện, lưu vào thư viện, bình luận, thanh toán nội dung.
- Author: Đăng truyện, quản lý chương, lên lịch xuất bản (auto-publish), dashboard thống kê (views, unlocks, doanh thu), đăng ký chế độ trả phí.
- Monetization: Pay-per-chapter, subscription/memberships, in-app currency, tipping, promotional campaigns.
- Admin/Moderator: Kiểm duyệt nội dung, quản lý khiếu nại/DMCA, quản lý thanh toán và báo cáo gian lận.
- Hạ tầng & tích hợp: Payment gateway, CDN, search/index, notification service, analytics pipeline.

2) Điểm mạnh
- Mô hình serialization giúp duy trì sự tương tác của độc giả.
- Cộng đồng tương tác cao qua hệ thống bình luận và bình chọn.
- Đa dạng hóa các kênh thu nhập cho tác giả và nền tảng.

3) Điểm yếu và tồn tại
- Quy trình onboarding tác giả chưa tối ưu; công cụ soạn thảo còn hạn chế.
- Ma sát khi thanh toán ở một số thị trường, quy trình mở khóa chương chưa liền mạch.
- Khó khăn trong việc kiểm soát nội dung vi phạm bản quyền và sao chép lậu.
- Thuật toán gợi ý đối với người dùng mới chưa thực sự hiệu quả.

4) Rủi ro pháp lý & vận hành
- Vấn đề bản quyền và yêu cầu lưu trữ chứng từ liên quan đến hợp đồng tác giả.
- Tuân thủ quy định về thanh toán, thuế và hóa đơn điện tử tùy theo thị trường.

5) Đề xuất cải tiến
- Giai đoạn MVP: Nâng cấp trình soạn thảo (hỗ trợ autosave, markdown), tối ưu hóa luồng thanh toán (1-click payment), cung cấp dashboard cơ bản cho tác giả.
- Giai đoạn mở rộng: Hệ thống kiểm duyệt kết hợp (AI + Human review), xây dựng API tích hợp bên thứ ba, thực hiện A/B testing cho hệ thống gợi ý, hỗ trợ đa ngôn ngữ.

6) Phụ lục lưu trữ
- Toàn bộ văn bản pháp lý, mẫu hợp đồng và các tài liệu liên quan được lưu trữ tại thư mục [artifacts/](artifacts/).

7) Kế hoạch tiếp theo
- Hoàn thiện danh mục văn bản quy định về giao dịch và nội dung số.
- Nghiên cứu chi tiết luồng người dùng của các nền tảng đối thủ (Webnovel, Wattpad) để tối ưu hóa trải nghiệm.
