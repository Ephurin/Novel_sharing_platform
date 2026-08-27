# Ephurin Novel Platform Technical Architecture

## 1. Tổng quan Kiến trúc

Kiến trúc của phân hệ **Sáng tác & Đăng truyện trực tuyến (Ephurin)** được thiết kế theo dạng **Modular Monolith** bằng **Node.js (TypeScript)** ở Backend, **React** ở Web Frontend dành cho Tác giả/Admin, và **React Native** ở Mobile Frontend dành cho Độc giả. Kiến trúc này cho phép triển khai đơn giản trong giai đoạn đầu và dễ dàng tách thành các Microservices khi hệ thống scale lớn.

```
Internet
  |
  v
Nginx / Caddy (Reverse Proxy / TLS)
  |
  +-- Web App (React / Vite static build - dành cho Author/Admin)
  +-- Mobile App (React Native - dành cho Reader)
  +-- REST API (Node.js backend)
        |
        +-- PostgreSQL (Prisma ORM) -> Dữ liệu quan hệ, ví dụ: User, Novel, Transaction
        +-- MongoDB (Mongoose ORM) -> Phiên bản nháp chương truyện, logs hoạt động
        +-- Redis -> Cache bảng xếp hạng, views, rate limiting
        +-- File Storage (Local FS / S3-compatible cho ảnh bìa, avatar)
        +-- AI Provider / LLM Adapter (gợi ý metadata, Copilot, consistency checking)
```

---

## 2. Tech Stack

### Backend

| Phân khu | Lựa chọn công nghệ |
|---|---|
| **Language** | TypeScript (Node.js v20+) |
| **HTTP Framework** | Express.js + TypeScript |
| **API Format** | RESTful API (JSON) |
| **Database chính** | PostgreSQL 16+ (Lưu thông tin User, Novel, Chapter, Wallet, Transaction) |
| **ORM PostgreSQL** | Prisma ORM (đảm bảo type-safe và dễ migrations) |
| **Database phụ** | MongoDB 6+ (Lưu trữ các phiên bản nháp `Drafts` của chương, logs hoạt động) |
| **ORM MongoDB** | Mongoose |
| **Caching & Queue** | Redis 7+ (Bảng xếp hạng, lưu session blacklist, đếm view truyện thời gian thực) |
| **Xác thực (Auth)** | Session JWT: AccessToken ngắn hạn và RefreshToken lưu trong cookie `HttpOnly`/`Secure`/`SameSite` |
| **Mã hóa mật khẩu** | Argon2id hoặc bcrypt |
| **Logging** | Winston hoặc Pino (Structured JSON logging) |
| **Lưu trữ file** | Local Filesystem ở V1 (để ảnh bìa truyện, ảnh tác giả), trừu tượng hóa qua một lớp Storage Interface để dễ dàng chuyển sang S3/Bunny CDN sau này |

### Web Frontend (Author & Admin)

| Phân khu | Lựa chọn công nghệ |
|---|---|
| **Framework** | React 19 + Vite 6 |
| **Language** | TypeScript |
| **UI Library** | Mantine UI v7 (https://mantine.dev/) |
| **Server State** | TanStack Query v5 (để fetch và cache dữ liệu API) |
| **Client/UI State** | Zustand |
| **Routing** | React Router v7 |
| **Forms** | Mantine Form hoặc React Hook Form + Zod |
| **Soạn thảo văn bản** | `@mantine/tiptap` hoặc TipTap Editor (Rich-text editor phục vụ viết truyện) |

### Mobile Frontend (Reader)

| Phân khu | Lựa chọn công nghệ |
|---|---|
| **Framework** | React Native (Expo hoặc React Native CLI) |
| **Language** | TypeScript |
| **UI Library** | React Native Paper / Tailwind CSS (NativeWind) |
| **Server State** | TanStack Query v5 (fetch và đồng bộ dữ liệu truyện, lịch sử đọc) |
| **Client/UI State** | Zustand |
| **Local Storage** | AsyncStorage (lưu token JWT, cấu hình giao diện đọc truyện) |
| **Thông báo (Push)** | Firebase Cloud Messaging (FCM) để nhận thông báo chương mới |

### AI & Writing Copilot

| Phân khu | Lựa chọn công nghệ |
|---|---|
| **Approach** | LLM-only cho metadata suggestion, style analysis, Writing Copilot, consistency checking |
| **Integration** | Backend gọi qua `ai-provider.client` hoặc service ngoài sau này |
| **Vector DB** | Future optional cho semantic retrieval; không bắt buộc trong MVP |

---

## 3. Ranh giới các Module (Module Boundaries)

Mặc dù triển khai chung một Backend Node.js, code cần được chia thành các folder module rõ ràng để dễ quản lý:

- `auth`: Đăng ký, đăng nhập, phân quyền, cấu hình JWT, OAuth 2.0 (Google/Facebook).
- `user`: Thông tin cá nhân của tác giả/độc giả, vai trò (Reader, Author, Admin), quản lý ví tiền (Wallet) và số dư Coin.
- `novel`: Thông tin truyện, danh sách chương, quản lý nhân vật (Character), quản lý tuyến cốt truyện (Timeline).
- `chapter`: Chi tiết nội dung chương truyện, trạng thái chương (Draft, Pending Review, Published), cài đặt chương Premium (mở khóa bằng Coin).
- `interaction`: Bình luận (Comments - bình luận chương, bình luận đoạn văn inline), lượt thích, theo dõi truyện.
- `payment`: Nạp tiền (Coin), giao dịch mở khóa chương truyện, phân chia doanh thu cho tác giả.
- `content-control`: Keyword/rule filtering, user reports, moderation queue, moderation evidence và Admin decisions. Không dùng LLM/AI để đánh giá nội dung.
- `ai`: LLM provider calls, metadata suggestions, style analysis, Writing Copilot, plot consistency checking và context proposals.
- `admin`: User management, dashboard, taxonomy, withdraw review.

---

## 4. AI, Writing Copilot và Content Control Boundary

- **AI/Copilot:** Hỗ trợ Author viết truyện bằng LLM: gợi ý tag/thể loại/tiêu đề, phân tích văn phong, gợi ý viết tiếp, đề xuất cập nhật Character/Timeline/Plot Summary, kiểm tra plot consistency.
- **Consistency checking:** Trả về non-blocking `CONSISTENCY_WARNING`; không chặn publish và không tự sửa dữ liệu.
- **Context update:** Mọi cập nhật vào `CHARACTER_PROFILE`, `STORY_TIMELINE`, `PLOT_SUMMARY` phải qua Author approval.
- **Content Control:** Kiểm soát nội dung không dùng LLM/AI. Chỉ gồm keyword/rule filtering + user reports + Admin final decision.
- **Logging:** Copilot logs và consistency warnings có thể lưu MongoDB 90 ngày; không lưu full temporary context nếu không được duyệt.

---

## 5. Triển khai (Deployment)

### Giai đoạn đầu (V1)
- Triển khai bằng **Docker Compose** trên một VPS hoặc Cloud VM.
- Sử dụng **Nginx** hoặc **Caddy** làm Reverse Proxy để giải quyết HTTPS và điều phối request từ cả Web và Mobile.
- PostgreSQL, MongoDB và Redis chạy dưới dạng các container Docker với phân vùng lưu trữ bền vững (Volumes).
- Ảnh bìa truyện và các tài nguyên tĩnh được lưu trữ trực tiếp trên Local Volume của server thông qua lớp Storage Interface.

### Giai đoạn mở rộng (Scale-up)
- Chuyển cơ sở dữ liệu PostgreSQL và MongoDB lên dịch vụ Cloud Database Managed.
- Chuyển lưu trữ file tĩnh sang các dịch vụ Object Storage S3-compatible (như AWS S3, Cloudflare R2) hoặc Bunny CDN mà không cần sửa code nghiệp vụ nhờ có lớp Storage Interface.
- Tách các module backend chạy nặng (như Novel/Chapter hoặc Payment) ra thành các microservice độc lập nếu cần thiết.
