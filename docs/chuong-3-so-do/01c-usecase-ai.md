# Chương 3 – Use Case AI Writing Copilot

> Tách từ [báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các sơ đồ bám theo mã nguồn nhánh `main`.

#### a) Khởi tạo Story Brain và phê duyệt dữ kiện

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Story Brain và dữ liệu đề xuất"]
        U1(["Khởi tạo Story Brain từ ý tưởng"])
        U2(["Khởi tạo Story Brain từ bản thảo"])
        U3(["Xem trạng thái tác vụ phân tích"])
        U4(["Xem thông tin Story Brain"])
        U5(["Xem hàng đợi cần rà soát"])
        U6(["Rà soát thực thể trích xuất"])
        U7(["Hợp nhất các thực thể trùng"])
        U8(["Chấp nhận nhóm đề xuất"])
        U9(["Sửa và chấp nhận đề xuất"])
        U10(["Từ chối đề xuất"])
        U11(["Kích hoạt baseline được duyệt"])
        U12(["Xem bộ nhớ đã được phê duyệt"])
    end
    A --- U1
    A --- U2
    A --- U3
    A --- U4
    A --- U5
    A --- U6
    A --- U7
    A --- U8
    A --- U9
    A --- U10
    A --- U11
    A --- U12
```

*Hình 3.8. Use Case khởi tạo Story Brain và duyệt đề xuất.*

Các endpoint bootstrap, job, review queue, entity reviews, merge, proposal decision, baseline activation và approved memory hiện diện trong ai-gateway.routes.ts và ai-service/api/narrative_routes.py. Chúng chứng minh phạm vi API, không thay thế cho đánh giá độ chính xác hay tỷ lệ hoàn thành job ở Chương 4.

#### b) AI hỗ trợ viết và quản lý kế hoạch

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["AI Copilot trong quy trình viết"]
        U1(["Xem trước dữ liệu ngữ cảnh"])
        U2(["Yêu cầu AI sinh bản thảo"])
        U3(["Xem kết quả sinh bản thảo"])
        U4(["Áp dụng kết quả phù hợp"])
        U5(["Bỏ qua bản thảo gợi ý"])
        U6(["Phân tích lại chương đã lưu"])
        U7(["Xem trạng thái trích xuất"])
        U8(["Gửi đề xuất dữ kiện thủ công"])
        U9(["Yêu cầu điều chỉnh sự kiện"])
        U10(["Xem hoặc sửa quy tắc thế giới"])
        U11(["Tạo hoặc sửa kế hoạch truyện"])
        U12(["Kích hoạt kế hoạch truyện"])
        U13(["Yêu cầu brainstorm"])
    end
    A --- U1
    A --- U2
    A --- U3
    A --- U4
    A --- U5
    A --- U6
    A --- U7
    A --- U8
    A --- U9
    A --- U10
    A --- U11
    A --- U12
    A --- U13
```

*Hình 3.9. Use Case AI hỗ trợ sáng tác và cập nhật ngữ cảnh.*

Đối chiếu với ai-gateway.routes.ts, ai-service/application/writing_service.py và các API kế hoạch, tái phân tích. Áp dụng kết quả và bỏ qua kết quả là hai lựa chọn của tác giả; không nối quan hệ «extend» chỉ để sơ đồ nhiều đường. Kết quả LLM không tự động trở thành nội dung chính thức.

