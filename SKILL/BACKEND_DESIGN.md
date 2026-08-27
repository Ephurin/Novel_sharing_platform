# Node.js Backend Design Standard

Tài liệu này định nghĩa quy chuẩn thiết kế và phát triển mã nguồn Backend bằng **Node.js (TypeScript)** cho phân hệ **Sáng tác và Đăng truyện (Ephurin)**.

---

## 1. Kiến trúc Phân lớp (Required Pattern)

Backend của hệ thống tuân thủ mô hình phân lớp chuẩn sau:

```
Route -> Middleware -> Controller -> Service -> Repository -> Database
```

### Chi tiết vai trò từng lớp:

1. **`*.router.ts` (Routing):** 
   - Định nghĩa các endpoint API RESTful.
   - Gán các middleware bảo vệ: kiểm tra xác thực (auth JWT), phân quyền vai trò (RBAC) và xác thực dữ liệu đầu vào (Zod validation).
   
2. **`*.controller.ts` (Controller):**
   - Tiếp nhận request từ router.
   - Trích xuất tham số (`req.body`, `req.query`, `req.params`, `req.user`).
   - Gọi lớp Service để thực hiện logic nghiệp vụ.
   - Trả về response JSON chuẩn cho client với HTTP Status Code phù hợp.
   - **Cấm:** Không chứa logic nghiệp vụ, không kết nối và truy vấn trực tiếp đến Database.

3. **`*.service.ts` (Service):**
   - Nơi chứa logic nghiệp vụ chính (business logic) và các quy tắc kiểm tra nghiệp vụ.
   - Quản lý và điều phối các database transactions khi có nhiều hành động ghi đồng thời.
   - Độc lập với HTTP request/response context (không đọc ghi trực tiếp lên `req` hay `res`).
   - Ném ra các custom errors (`AppError`) rõ ràng nếu vi phạm nghiệp vụ.

4. **`*.repository.ts` (Repository):**
   - Lớp duy nhất được trực tiếp tương tác với cơ sở dữ liệu qua **Prisma Client** (PostgreSQL) hoặc **Mongoose Model** (MongoDB).
   - Đóng gói các hàm query DB (CRUD, filters, pagination).
   - **Cấm:** Không đưa logic nghiệp vụ hoặc phân quyền vào lớp repository.

---

## 2. Cấu trúc Thư mục Đề xuất

```
backend/
  src/
    config/               # Các cấu hình kết nối DB, Redis, env variables
      db.ts               # Khởi tạo Prisma & Mongoose connection
      env.ts              # Load và validate biến môi trường bằng Zod
    middlewares/          # Middleware dùng chung
      auth.middleware.ts  # Xác thực JWT và phân quyền (RBAC)
      error.middleware.ts # Global Error Handler Middleware
      validate.middleware.ts # Validate request schema bằng Zod
    modules/              # Thư mục chứa các module nghiệp vụ
      auth/
        auth.router.ts
        auth.controller.ts
        auth.service.ts
      users/
      novels/             # Novel, chapter, draft, context, proposals
      reading/
      interactions/
      wallet/             # Mock wallet, transactions, unlocks, withdraw requests
      ai/                 # LLM provider, metadata, Copilot, consistency checks
      content-control/    # Rule/filter check, reports, moderation reviews
      admin/              # Users, taxonomy, dashboard, withdraw review
    shared/               # Tiện ích dùng chung toàn hệ thống
      errors/             # Các lớp định nghĩa lỗi custom
        app-error.ts
      utils/
        logger.ts         # Cấu hình log bằng Winston/Pino
  prisma/                 # File schema và migrations của Prisma (PostgreSQL)
    schema.prisma
  package.json
  tsconfig.json
```

---

## 2.1. Module Ownership hiện hành

| Module | Ownership |
| :--- | :--- |
| `auth` | Login/register, refresh tokens, password/session logic. |
| `users` | Profile and user settings. |
| `novels` | Novel/chapter metadata, draft ownership, character/timeline/plot summaries, context proposals. |
| `reading` | Reading preferences, reading histories, bookmarks/library. |
| `interactions` | Comments, likes, follows, notifications, device tokens. |
| `wallet` | Mock Coins, deposits, chapter unlocks, donations, withdraw requests, transaction ledger. |
| `ai` | LLM provider calls, metadata suggestions, style analysis, Writing Copilot, consistency warnings. |
| `content-control` | Keyword/rule filtering, user reports, moderation reviews, moderation evidence. |
| `admin` | User lock/unlock, taxonomy, dashboard aggregation, mock withdraw review. |

Rules:

- Novel/Interaction modules call `content-control` for publish/comment checks; they do not own moderation rule logic.
- AI module must not perform content moderation.
- Context proposals from AI must be approved by Author before Novel service commits official context changes.

---

## 3. Quy tắc xử lý lỗi (Error Handling Rules)

- Không bao giờ bắt lỗi (catch error) rồi im lặng bỏ qua.
- Định nghĩa lớp lỗi chung `AppError` kế thừa từ `Error` tích hợp thêm `statusCode` (HTTP Status) và `errorCode` (Mã lỗi nghiệp vụ):
  ```typescript
  export class AppError extends Error {
    constructor(
      public statusCode: number,
      public errorCode: string,
      message: string
    ) {
      super(message);
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }
  ```
- Sử dụng **Global Error Middleware** ở cuối pipeline của Express để bắt mọi lỗi không mong muốn:
  - Nếu lỗi là instance của `AppError`, trả về JSON an toàn cùng `statusCode` và `errorCode`.
  - Nếu lỗi là lỗi hệ thống khác (lỗi DB, lỗi code crash), log chi tiết lỗi ra server (để debug) nhưng chỉ trả về lỗi `500 Internal Server Error` chung chung cho client, không bao giờ lộ raw SQL error hoặc stack trace.

---

## 4. Quản lý Giao dịch (Database Transactions)

Các hành động liên quan đến ví tiền (Wallet) và giao dịch Coin (nạp tiền, mua chương Premium) hoặc các hành động ghi đồng thời nhiều bảng bắt buộc phải sử dụng **Prisma Transaction** để đảm bảo tính toàn vẹn dữ liệu:
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Trừ tiền độc giả
  await tx.wallet.update({ ... });
  // 2. Cộng tiền tác giả
  await tx.wallet.update({ ... });
  // 3. Ghi nhận lịch sử giao dịch
  await tx.transaction.create({ ... });
});
```

---

## 5. File Storage & Uploads

- Toàn bộ ảnh bìa truyện (`Novel.cover_url`) và avatar người dùng (`User.avatar_url`) khi upload phải được xử lý qua một lớp **Storage Provider Interface**.
- Giao diện này cung cấp các phương thức cơ bản: `upload(file): Promise<string>`, `delete(fileKey): Promise<void>`.
- Giai đoạn V1: Triển khai Storage Provider lưu trữ local trong thư mục tĩnh (`public/uploads`) của backend.
- Cổng tích hợp sẵn sàng để khi cần chuyển sang AWS S3 hoặc Cloudflare R2, ta chỉ cần viết lại một file Provider mới mà không phải sửa logic trong các Service.

---

## 6. Ghi nhật ký (Logging)

- Sử dụng thư viện `winston` hoặc `pino` để ghi log.
- Các log trong môi trường Production phải được xuất dưới dạng JSON cấu trúc (Structured JSON logging) để phục vụ cho việc tracking log sau này.
- **Cấm:** Không log các thông tin nhạy cảm của người dùng (Mật khẩu plaintext, Token, thông tin thẻ ngân hàng...) vào file log.
