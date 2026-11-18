# Chương 3 – Use Case tác giả

> Tách từ [báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các sơ đồ bám theo mã nguồn nhánh `main`.

#### a) Quản lý tác phẩm, chương và vòng đời công bố

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Tác phẩm và chương truyện"]
        U1(["Xem danh sách tác phẩm của mình"])
        U2(["Tạo tác phẩm"])
        U3(["Sửa hoặc xóa tác phẩm"])
        U4(["Gửi duyệt công bố tác phẩm"])
        U5(["Tạo chương"])
        U6(["Chỉnh sửa và lưu bản thảo"])
        U7(["Tạo và xem revision"])
        U8(["Sắp xếp thứ tự chương"])
        U9(["Lên lịch hoặc hủy lịch chương"])
        U10(["Gửi duyệt công bố chương"])
        U11(["Lưu trữ hoặc khôi phục chương"])
        U12(["Xem thu nhập theo truyện"])
        U13(["Kiểm tra nội dung theo quy tắc"])
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
    U10 -.->|"«include»"| U13
```

*Hình 3.6. Use Case quản lý truyện và chương của tác giả.*

Căn cứ chính là novels.routes.ts, chapters.routes.ts và chapters.service.ts. Phần Kiểm tra nội dung theo quy tắc được biểu diễn bằng quan hệ «include» từ Gửi duyệt công bố chương, vì đây là bước xử lý bắt buộc trong luồng submitChapterPublish. Quyền sở hữu và trạng thái bản thảo là điều kiện trước, không phải Use Case mở rộng Đăng nhập.

#### b) Quản lý ngữ cảnh truyện thủ công

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Dữ kiện tác phẩm do tác giả quản lý"]
        U1(["Xem và tạo hồ sơ nhân vật"])
        U2(["Sửa hoặc xóa hồ sơ nhân vật"])
        U3(["Xem quan hệ giữa nhân vật"])
        U4(["Tạo hoặc sửa quan hệ nhân vật"])
        U5(["Xem các sự kiện theo dòng thời gian"])
        U6(["Thêm, sửa hoặc xóa sự kiện"])
        U7(["Xem tóm tắt truyện"])
        U8(["Tạo, sửa hoặc xóa tóm tắt"])
        U9(["Đồng bộ dữ liệu Story Bible"])
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
```

*Hình 3.7. Use Case tác giả quản lý hồ sơ nhân vật và dòng thời gian.*

Các chức năng được đối chiếu với story-context.routes.ts. Đây là phân hệ quản lý thông tin do tác giả nhập trực tiếp và có thể vận hành độc lập với mô hình LLM. Tách phân hệ này khỏi AI là cần thiết để làm rõ trách nhiệm và nguồn dữ liệu chính thức của tác phẩm.

