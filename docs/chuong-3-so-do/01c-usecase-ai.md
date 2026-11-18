# Chương 3 – Use Case AI Writing Copilot

> Tách từ [bản báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các quan hệ được xác định theo mã nguồn nhánh `main`; sơ đồ Mermaid là biểu diễn gần đúng ký pháp UML.

#### a) Khởi tạo Story Brain và phê duyệt dữ kiện

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Story Brain và phê duyệt đề xuất"]
        U1(["Khởi tạo Story Brain (trừu tượng)"])
        U2(["Khởi tạo từ ý tưởng"])
        U3(["Khởi tạo từ bản thảo"])
        U4(["Theo dõi trạng thái job"])
        U5(["Rà soát dữ kiện Story Brain (trừu tượng)"])
        U6(["Xem hàng đợi review"])
        U7(["Rà soát thực thể"])
        U8(["Hợp nhất thực thể trùng"])
        U9(["Ra quyết định về đề xuất (trừu tượng)"])
        U10(["Chấp nhận đề xuất"])
        U11(["Sửa và chấp nhận"])
        U12(["Từ chối đề xuất"])
        U13(["Kiểm tra quyền và trạng thái đề xuất"])
        U14(["Kích hoạt baseline"])
        U15(["Xem bộ nhớ đã phê duyệt"])
    end
    A --- U1
    A --- U4
    A --- U5
    A --- U9
    A --- U14
    A --- U15
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U8 -.->|"«extend»: khi phát hiện thực thể trùng"| U7
    U10 -.->|"«generalization»"| U9
    U11 -.->|"«generalization»"| U9
    U12 -.->|"«generalization»"| U9
    U9 -.->|"«include»"| U13
```

*Hình 3.8. Use Case Story Brain với các biến thể khởi tạo, rà soát và quyết định.*

**Phân cấp:** Khởi tạo từ ý tưởng và từ bản thảo là hai biến thể của cùng mục tiêu tạo Story Brain. Chấp nhận, chỉnh sửa–chấp nhận và từ chối là các biến thể quyết định về đề xuất, không phải ba thao tác bắt buộc trong một lần review. Cả ba nhánh đều được kiểm tra quyền và trạng thái đề xuất; kiểm tra **brain version** là yêu cầu riêng trên nhánh chấp nhận (và một số quyết định nhóm), không áp dụng như bước bắt buộc của mọi lần từ chối. **«extend»:** Hợp nhất thực thể chỉ xuất hiện trong quá trình rà soát thực thể khi phát hiện trùng danh tính. **Điều kiện tiên quyết:** Kích hoạt baseline cần kết quả chuẩn bị/rà soát phù hợp; không «include» thao tác khởi tạo mỗi lần kích hoạt. Căn cứ: `ai-gateway.routes.ts`, `narrative_service.py`.

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
        U12(["Quản lý kế hoạch truyện (trừu tượng)"])
        U13(["Tạo kế hoạch"])
        U14(["Sửa mục tiêu kế hoạch"])
        U15(["Kích hoạt kế hoạch"])
        U16(["Yêu cầu brainstorm"])
    end
    A --- U1
    A --- U3
    A --- U6
    A --- U7
    A --- U8
    A --- U9
    A --- U10
    A --- U11
    A --- U12
    A --- U16
    U1 -.->|"«include»"| U2
    U4 -.->|"«extend»: khi tác giả chấp nhận"| U3
    U5 -.->|"«extend»: khi tác giả bỏ qua"| U3
    U13 -.->|"«generalization»"| U12
    U14 -.->|"«generalization»"| U12
    U15 -.->|"«generalization»"| U12
```

*Hình 3.9. Use Case AI Copilot với ngữ cảnh bắt buộc và các lựa chọn hậu sinh.*

**«include»:** Yêu cầu AI viết cần bước chuẩn bị ngữ cảnh đầu vào từ tác phẩm/văn bản hiện hành, ngay cả khi bộ nhớ semantic tùy cấu hình chưa được bật. **«extend»:** Sau khi xem bản thảo sinh, tác giả có thể áp dụng hoặc bỏ qua; hai hành động này chỉ phát sinh theo quyết định của tác giả. **«generalization»:** Tạo, sửa và kích hoạt là các thao tác chuyên biệt đối với kế hoạch truyện. **Không «include»:** Xem trước ngữ cảnh là tùy chọn của tác giả, không phải thao tác giao diện bắt buộc trước mỗi yêu cầu sinh. Kích hoạt kế hoạch cần một kế hoạch hợp lệ đã tồn tại. Nguồn: `ai-gateway.routes.ts`, `writing_service.py`.

