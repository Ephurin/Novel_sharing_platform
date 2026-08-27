# Ephurin Novel Platform System Design

## 1. Mục tiêu Hệ thống

Tài liệu này mô tả thiết kế hệ thống cấp cao cho phân hệ **Sáng tác và Đăng truyện trực tuyến (Ephurin)**. 

Hệ thống được thiết kế để phục vụ các nhóm chức năng cốt lõi sau:
- **Tác giả (Author):** Tạo và quản lý truyện, viết chương mới (soạn thảo Rich-text, lưu nháp), quản lý thông tin nhân vật (Characters) và tuyến cốt truyện (Timeline/Plot), thiết lập đăng truyện hẹn giờ, và xem thống kê lượt đọc/doanh thu.
- **AI Writing IDE:** Hỗ trợ Author quản lý Novel/Arc/Chapter, Character/Entity, Timeline, Plot Summary, Knowledge Graph, Writing Copilot và Plot Consistency Checking trong cùng workspace.
- **Độc giả (Reader):** Đọc truyện, tương tác (bình luận chương truyện, bình luận inline theo từng đoạn văn, thả tim, theo dõi truyện), nạp tiền và mở khóa các chương Premium bằng Coin.
- **Quản trị viên (Admin):** Quản lý người dùng, kiểm duyệt nội dung (truyện/chương mới) trước khi xuất bản công khai, xử lý các báo cáo vi phạm từ độc giả.
- **AI/Copilot:** LLM-only cho gợi ý tag/thể loại/tiêu đề, phân tích văn phong, writing suggestions, context proposals và consistency warnings.
- **Content Control:** Keyword/rule filtering, user reports, moderation queue và Admin final decision; không dùng LLM/AI để đánh giá nội dung.

---

## 2. Kiến trúc Phân tầng (Layered Architecture)

Ứng dụng được tổ chức theo kiến trúc phân tầng rõ ràng để đảm bảo tính dễ bảo trì và mở rộng:

```
Tầng Giao diện (Presentation)
  - Web App cho Tác giả & Quản trị viên (React + Mantine)
  - Mobile App cho Độc giả (React Native - phát triển sau)

Tầng API Gateway / Routing
  - RESTful API endpoints (Node.js Express / NestJS)
  - Middleware: Authentication (JWT), Rate limiting, Logging, Validation (Zod)

Tầng Nghiệp vụ (Domain Services)
  - Business logic & quy trình nghiệp vụ (NovelService, ChapterService, ContentControlService, PaymentService...)
  - Phân quyền cấp độ tài nguyên (RBAC - Role-Based Access Control)

Tầng Dữ liệu (Data Access)
  - PostgreSQL (Thông qua Prisma ORM)
  - MongoDB (Thông qua Mongoose)
  - Redis cache (View counts, Leaderboards, Auth token blacklist)
  - Object Storage Port (Lưu trữ ảnh bìa, avatar)
```

---

## 3. Chỉ số Phi chức năng cơ bản (Non-functional Requirements)

| Tiêu chí | Mục tiêu V1 |
|---|---|
| **Độ trễ API** | p95 dưới 300 ms cho các API đọc truyện và 500 ms cho các API lưu/viết truyện |
| **Khả năng chịu tải** | Hỗ trợ tối thiểu 1.000 người dùng đồng thời (Concurrent Users) |
| **Độ tin cậy** | Uptime tối thiểu 99% |
| **Bảo mật** | Mã hóa HTTPS, phân quyền RBAC chặt chẽ, mật khẩu lưu trữ dùng Argon2id hoặc bcrypt |
| **Tính toàn vẹn** | Các giao dịch nạp tiền, mở khóa chương truyện (Coin transaction) phải chạy dưới dạng Database Transaction |

---

## 4. Thiết kế RESTful API

- Toàn bộ giao tiếp giữa Client và Backend được thực hiện qua các API RESTful định dạng JSON.
- Payload yêu cầu (Request payload) và phản hồi (Response payload) phải được định nghĩa kiểu dữ liệu chặt chẽ bằng TypeScript Interfaces.
- Sử dụng thư viện **Zod** để validate schema đầu vào của API ngay tại tầng Route/Middleware.
- Mã lỗi trả về client phải tuân thủ chuẩn HTTP Status Codes kết hợp với error object có cấu trúc nhất quán:
  ```json
  {
    "success": false,
    "code": "INSUFFICIENT_COINS",
    "message": "Số dư Coin không đủ để mở khóa chương này.",
    "details": null
  }
  ```

---

## 5. Thiết kế Dữ liệu (Data Design)

Hệ thống sử dụng mô hình cơ sở dữ liệu kép (Polyglot Persistence) để tận dụng thế mạnh của từng loại DB:

### PostgreSQL (Prisma ORM) - Dữ liệu quan hệ
Lưu trữ các thực thể cần tính nhất quán cao và giao dịch ACID:
- `User`: ID, Email, PasswordHash, Role (Reader/Author/Admin), Wallet Balance.
- `Novel`: ID, AuthorID, Title, Synopsis, CoverURL, Genre, Status (Draft/Pending/Published), Views, Likes.
- `Chapter`: ID, NovelID, Title, ChapterNumber, IsPremium, CoinPrice, Status, PublishedAt.
- `Character`: ID, NovelID, Name, Role (Main/Supporting), Description, AvatarURL.
- `Comment`: ID, UserID, NovelID, ChapterID, ParagraphIndex (dành cho bình luận inline), Content, ParentID (bình luận lồng nhau).
- `Transaction`: ID, WalletID, Amount (Coin), Type (Deposit/Purchase/Donate), Status, CreatedAt.
- `ContentFilterRule`, `ModerationReview`, `Report`: dữ liệu Content Control và review queue.

### MongoDB (Mongoose ORM) - Dữ liệu phi cấu trúc & Nhật ký
Lưu trữ dữ liệu có cấu trúc linh hoạt hoặc có tần suất ghi cao:
- `ChapterDraft`: Lưu các phiên bản nháp đang viết của tác giả (Auto-save).
- `ActivityLog`: Nhật ký thao tác của hệ thống và lịch sử chỉnh sửa chương truyện để phục vụ phục hồi dữ liệu khi cần.
- `ModerationEvidence`: Evidence từ rule/filter/report cho moderation queue.
- `CopilotGenerationLog`: Log gợi ý Copilot và consistency warnings, retention 90 ngày.

---

## 6. Bảo mật và Phân quyền (Security & Authorization)

- **Authentication:** Xác thực bằng cơ chế JWT kép. Access Token (lưu ở bộ nhớ tạm của client) có thời hạn 15-30 phút. Refresh Token (lưu trong Cookie `HttpOnly`, `Secure`, `SameSite=Strict`) có thời hạn 7 ngày.
- **Phân quyền (RBAC):**
  - *Guest:* Chỉ được tìm kiếm truyện, đọc các chương miễn phí.
  - *Reader:* Được bình luận, theo dõi truyện, nạp coin và mua chương Premium.
  - *Author:* Có toàn quyền với truyện và chương của chính mình tạo ra (CRUD), quản lý nhân vật, xem báo cáo doanh thu cá nhân.
  - *Admin:* Xem dashboard hệ thống, resolve moderation review, xử lý báo cáo vi phạm, quản lý người dùng.
- **Kiểm soát quyền sở hữu (Ownership Gate):** Backend phải xác thực rằng Author thực hiện chỉnh sửa truyện/chương chính là chủ sở hữu của truyện đó (`novel.author_id === current_user.id`).
