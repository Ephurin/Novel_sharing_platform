# Chương 3 – Use Case AI Copilot

> Trích từ [Chương 3](../BAO_CAO_CHUONG_3.md); nguồn đối chiếu: `main`. Chỉ dùng mũi tên «include» và «extend». Đường liền là liên kết tác nhân; khung là nhóm chức năng.

### 3.2.5. Use Case hỗ trợ sáng tác bằng AI

#### a) Khởi tạo Story Brain và phê duyệt dữ kiện

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Story Brain và phê duyệt đề xuất"]
        U4(["Theo dõi trạng thái job"])
        U8(["Hợp nhất thực thể trùng"])
        U13(["Kiểm tra quyền và trạng thái đề xuất"])
        U14(["Kích hoạt baseline"])
        U15(["Xem bộ nhớ đã phê duyệt"])
        subgraph G8_1["Phương thức khởi tạo"]
            U2(["Khởi tạo từ ý tưởng"])
            U3(["Khởi tạo từ bản thảo"])
        end
        subgraph G8_2["Rà soát dữ kiện"]
            U6(["Xem hàng đợi review"])
            U7(["Rà soát thực thể"])
        end
        subgraph G8_3["Quyết định đối với đề xuất"]
            U10(["Chấp nhận đề xuất"])
            U11(["Sửa và chấp nhận"])
            U12(["Từ chối đề xuất"])
        end
    end
    A --- U2
    A --- U3
    A --- U4
    A --- U6
    A --- U7
    A --- U10
    A --- U11
    A --- U12
    A --- U14
    A --- U15
    U8 -.->|"«extend»: khi phát hiện thực thể trùng"| U7
    U10 -.->|"«include»"| U13
    U11 -.->|"«include»"| U13
    U12 -.->|"«include»"| U13
```

*Hình 3.8. Use Case khởi tạo Story Brain và quyết định đề xuất.*

**«extend»:** Hợp nhất thực thể có thể phát sinh khi tác giả rà soát và phát hiện thực thể trùng. **«include»:** Các thao tác chấp nhận, sửa–chấp nhận hoặc từ chối đều kiểm tra quyền và trạng thái đề xuất. Việc kiểm tra `brain_version` đặc thù cho nhánh chấp nhận và một số quyết định nhóm, không phải mọi lần từ chối. Khởi tạo Story Brain từ ý tưởng/bản thảo là hai thao tác khởi động độc lập. Nguồn: `ai-gateway.routes.ts`, `narrative_service.py`.

#### b) AI hỗ trợ viết và quản lý kế hoạch

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["AI Copilot trong quy trình viết"]
        U1(["Yêu cầu sinh bản thảo AI"])
        U2(["Chuẩn bị ngữ cảnh đầu vào"])
        U3(["Xem bản thảo AI đã tạo"])
        U4(["Áp dụng kết quả vào bản thảo"])
        U5(["Bỏ qua kết quả"])
        U6(["Xem trước ngữ cảnh"])
        U7(["Phân tích lại chương đã lưu"])
        U8(["Xem tiến độ trích xuất"])
        U9(["Gửi đề xuất dữ kiện thủ công"])
        U10(["Đề nghị chỉnh sửa sự kiện"])
        U11(["Quản lý quy tắc thế giới"])
        U16(["Yêu cầu brainstorm"])
        subgraph G9_1["Kế hoạch truyện"]
            U13(["Tạo kế hoạch"])
            U14(["Sửa mục tiêu kế hoạch"])
            U15(["Kích hoạt kế hoạch"])
        end
    end
    A --- U1
    A --- U3
    A --- U6
    A --- U7
    A --- U8
    A --- U9
    A --- U10
    A --- U11
    A --- U13
    A --- U14
    A --- U15
    A --- U16
    U1 -.->|"«include»"| U2
    U4 -.->|"«extend»: khi tác giả chấp nhận"| U3
    U5 -.->|"«extend»: khi tác giả bỏ qua"| U3
```

*Hình 3.9. Use Case AI Copilot và kế hoạch viết.*

**«include»:** Yêu cầu AI sinh nội dung phải chuẩn bị ngữ cảnh đầu vào. **«extend»:** Sau khi xem bản thảo AI, tác giả có thể áp dụng hoặc bỏ qua theo lựa chọn. Xem trước ngữ cảnh bằng giao diện là tính năng tùy chọn chứ không phải thao tác bắt buộc mỗi lần sinh. Các thao tác tạo/sửa/kích hoạt kế hoạch được nhóm để dễ đọc nhưng không gán quan hệ không được mã nguồn hỗ trợ. Nguồn: `ai-gateway.routes.ts`, `writing_service.py`.

