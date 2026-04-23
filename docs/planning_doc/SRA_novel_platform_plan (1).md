# Kế hoạch chuẩn bị trao đổi với giảng viên

## Môn: Phân tích yêu cầu phần mềm (Software Requirement Analysis -- SRA)

### Đề tài

**Nền tảng sáng tác tiểu thuyết trực tuyến (Online Novel Writing
Platform)**

------------------------------------------------------------------------

# 1. Mục tiêu buổi trao đổi với giảng viên

Buổi trao đổi nhằm:

-   Xác nhận **ý tưởng hệ thống**
-   Làm rõ **bài toán và phạm vi**
-   Xác định **stakeholder**
-   Thống nhất **các yêu cầu chức năng chính**
-   So sánh với **các hệ thống hiện có**

------------------------------------------------------------------------

# 2. Tổng quan hệ thống

## 2.1 Vấn đề hiện tại

Hiện nay các tác giả thường viết truyện bằng:

-   Google Docs
-   Microsoft Word
-   Các nền tảng đăng truyện như Wattpad

Những công cụ này **không được thiết kế chuyên biệt cho việc sáng tác
tiểu thuyết dài tập**.

Các hạn chế phổ biến:

-   Khó quản lý **nhiều chương**
-   Không hỗ trợ **quản lý nhân vật**
-   Không hỗ trợ **tổ chức cốt truyện**
-   Không hỗ trợ **cộng tác viết truyện**

------------------------------------------------------------------------

## 2.2 Mục tiêu hệ thống

Xây dựng một nền tảng giúp:

-   Tác giả **viết và quản lý tiểu thuyết**
-   Quản lý **chương truyện**
-   Quản lý **nhân vật**
-   Đăng truyện trực tuyến
-   Nhận phản hồi từ độc giả
-   Hỗ trợ **công cụ gợi ý nội dung**

------------------------------------------------------------------------

# 3. Người dùng chính (Actors)

## 3.1 Author (Tác giả)

Chức năng:

-   Tạo truyện
-   Viết chương
-   Quản lý nhân vật
-   Chỉnh sửa nội dung
-   Đăng chương

------------------------------------------------------------------------

## 3.2 Reader (Độc giả)

Chức năng:

-   Tìm truyện
-   Đọc truyện
-   Bình luận
-   Theo dõi truyện

------------------------------------------------------------------------

## 3.3 Admin

Chức năng:

-   Quản lý người dùng
-   Kiểm duyệt nội dung
-   Quản lý hệ thống

------------------------------------------------------------------------

# 4. Phân tích hệ thống tương tự

## 4.1 Các nền tảng tham khảo

-   Wattpad
-   RoyalRoad
-   Webnovel
-   Google Docs

------------------------------------------------------------------------

## 4.2 So sánh hệ thống

  Tiêu chí               Hệ thống hiện có   Hệ thống đề xuất
  ---------------------- ------------------ ------------------
  Viết chương            Có                 Có
  Quản lý nhân vật       Không              Có
  Quản lý timeline       Không              Có
  AI gợi ý nội dung      Không              Có
  Cộng tác viết truyện   Hạn chế            Có

------------------------------------------------------------------------

# 5. Phạm vi hệ thống (Scope)

## 5.1 Bao gồm

-   Viết truyện
-   Quản lý chương
-   Quản lý nhân vật
-   Đăng truyện
-   Đọc truyện
-   Bình luận

------------------------------------------------------------------------

## 5.2 Không bao gồm

-   Xuất bản sách giấy
-   Hệ thống thanh toán phức tạp
-   Marketplace bán sách

------------------------------------------------------------------------

# 6. Stakeholders

  Stakeholder      Mục tiêu
  ---------------- ------------------------
  Author           Viết và đăng truyện
  Reader           Đọc và theo dõi truyện
  Admin            Quản lý hệ thống
  Platform Owner   Phát triển nền tảng

------------------------------------------------------------------------

# 7. Use Case chính

## Author

-   Đăng ký tài khoản
-   Tạo truyện
-   Viết chương
-   Quản lý nhân vật
-   Đăng chương
-   Chỉnh sửa chương

------------------------------------------------------------------------

## Reader

-   Tìm truyện
-   Đọc truyện
-   Bình luận
-   Theo dõi truyện

------------------------------------------------------------------------

## Admin

-   Quản lý user
-   Kiểm duyệt truyện
-   Quản lý nội dung

------------------------------------------------------------------------

# 8. Functional Requirements (Yêu cầu chức năng)

  ID    Requirement
  ----- --------------------------
  FR1   User đăng ký tài khoản
  FR2   Author tạo truyện mới
  FR3   Author thêm chương
  FR4   Reader đọc truyện
  FR5   Reader bình luận
  FR6   Admin quản lý người dùng

------------------------------------------------------------------------

# 9. Non‑Functional Requirements

## Performance

-   Hệ thống hỗ trợ ít nhất **1000 người dùng đồng thời**

## Availability

-   Uptime tối thiểu **99%**

## Security

-   Mật khẩu được mã hóa

## Usability

-   Giao diện dễ sử dụng cho tác giả viết truyện

------------------------------------------------------------------------

# 10. Data chính của hệ thống

  Entity      Mô tả
  ----------- ----------------------
  User        Thông tin người dùng
  Novel       Thông tin truyện
  Chapter     Nội dung chương
  Character   Nhân vật
  Comment     Bình luận

------------------------------------------------------------------------

# 11. Các câu hỏi giảng viên có thể hỏi

## Vì sao cần quản lý nhân vật?

Trong tiểu thuyết dài tập có nhiều nhân vật.\
Việc quản lý giúp tác giả tránh **mâu thuẫn cốt truyện** và theo dõi mối
quan hệ giữa các nhân vật.

------------------------------------------------------------------------

## Hệ thống khác gì Google Docs?

Google Docs chỉ là **trình soạn thảo văn bản**.

Hệ thống đề xuất cung cấp thêm:

-   quản lý chương
-   quản lý nhân vật
-   tổ chức cốt truyện
-   đăng truyện trực tuyến

------------------------------------------------------------------------

## AI được dùng để làm gì?

Ví dụ:

-   gợi ý tên nhân vật
-   gợi ý cốt truyện
-   gợi ý nội dung chương

------------------------------------------------------------------------

# 12. Tóm tắt hệ thống

Hệ thống của nhóm là **nền tảng sáng tác tiểu thuyết trực tuyến**, tập
trung hỗ trợ **tác giả trong quá trình viết truyện**.

Khác với các nền tảng đọc truyện truyền thống, hệ thống cung cấp các
công cụ:

-   quản lý chương
-   quản lý nhân vật
-   tổ chức cốt truyện
-   đăng truyện trực tuyến

Các actor chính bao gồm:

-   Author
-   Reader
-   Admin
