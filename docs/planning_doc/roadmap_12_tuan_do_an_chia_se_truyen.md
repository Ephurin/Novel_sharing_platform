# 📅 ROADMAP 8–12 TUẦN – ĐỒ ÁN NỀN TẢNG CHIA SẺ TRUYỆN (CÓ AI)

> **Phạm vi:** tập trung kỹ thuật & triển khai (đã nắm vững thiết kế UML/ERD/Use Case)

> **Mục tiêu cuối:**
> - Hệ thống web + mobile chạy ổn định
> - Backend có nghiệp vụ rõ ràng (author – editor – reader)
> - AI có chiều sâu (embedding / fine-tuning, không chỉ gọi API)
> - Deploy được để demo & bảo vệ

---

## 🔥 GIAI ĐOẠN 1 – BACKEND CỐT LÕI (TUẦN 1–3)

### 🗓️ Tuần 1 – Django / DRF nền tảng
**Mục tiêu:** xây dựng API chuẩn, kiến trúc rõ ràng

- Django project structure
- Models + ORM (User, Story, Chapter, Comment)
- Django Admin
- Django REST Framework:
  - Serializer
  - ViewSet
  - Router
- Authentication:
  - JWT
  - Role-based permission (Reader / Author / Editor)

**Output:**
- CRUD User / Story / Chapter
- Auth hoạt động ổn định

---

### 🗓️ Tuần 2 – Nghiệp vụ & hiệu năng
**Mục tiêu:** hệ thống giống nền tảng thật

- Workflow truyện:
  - Draft → Pending → Approved → Published
- Editor review & approve logic
- Comment, Rating, Like
- Pagination, Filtering, Search
- Upload ảnh bìa truyện

**Output:**
- API đầy đủ cho web & mobile

---

### 🗓️ Tuần 3 – Backend nâng cao
**Mục tiêu:** sẵn sàng tích hợp AI

- Celery + Redis (task nền)
- Soft delete
- Audit log (theo dõi chỉnh sửa)
- API versioning
- Global exception handling

**Output:**
- Backend có chiều sâu, dễ giải thích khi bảo vệ

---

## 🌐 GIAI ĐOẠN 2 – FRONTEND WEB (TUẦN 4–5)

### 🗓️ Tuần 4 – Next.js cơ bản
**Mục tiêu:** web đọc truyện & quản lý nội dung

- Next.js (Pages/App Router)
- Authentication flow
- Fetch API / Axios
- Trang danh sách truyện
- Trang chi tiết truyện & chương
- SEO cơ bản cho nội dung truyện

---

### 🗓️ Tuần 5 – Dashboard & biên tập
**Mục tiêu:** thể hiện rõ nghiệp vụ

- Author dashboard:
  - Quản lý truyện & chương
- Editor dashboard:
  - Duyệt truyện
  - Góp ý chỉnh sửa
- Responsive UI

**Output:**
- Demo web đầy đủ vai trò người dùng

---

## 📱 GIAI ĐOẠN 3 – MOBILE APP (TUẦN 6–7)

### 🗓️ Tuần 6 – Flutter nền tảng
**Mục tiêu:** app đọc truyện mượt

- Dart cơ bản
- Widget & layout
- Navigation
- REST API integration
- ListView / Infinite scroll
- Login / Register

---

### 🗓️ Tuần 7 – Mobile nâng cao
**Mục tiêu:** giống app thương mại

- Offline reading (cache)
- Bookmark
- Comment
- Dark / Light theme

**Output:**
- App demo chạy trên Android (iOS nếu có)

---

## 🤖 GIAI ĐOẠN 4 – AI (TUẦN 8–9)

### 🗓️ Tuần 8 – AI nền tảng
**Mục tiêu:** AI có logic riêng, không chỉ gọi API

- Dataset truyện tiếng Việt
- Text preprocessing
- Embedding truyện & chương
- Vector database (FAISS / Chroma)
- Recommendation cơ bản (content-based)

---

### 🗓️ Tuần 9 – AI nâng cao
**Mục tiêu:** có thể trình bày fine-tuning / retraining

- Fine-tuning hoặc LoRA (mức demo)
- Tóm tắt chương truyện
- Keyword extraction
- AI hỗ trợ biên tập viên:
  - Gợi ý chỉnh sửa
  - Flag nội dung nhạy cảm

**Output:**
- AI service độc lập, backend gọi qua API

---

## 🚀 GIAI ĐOẠN 5 – DEPLOY & BẢO VỆ (TUẦN 10–12)

### 🗓️ Tuần 10 – Deploy hệ thống
- VPS
- Docker
- Nginx
- HTTPS
- Environment variables

---

### 🗓️ Tuần 11 – Tối ưu & kiểm thử
- Fix bug
- Tối ưu hiệu năng
- Logging
- UX polish

---

### 🗓️ Tuần 12 – Chuẩn bị bảo vệ
- Kịch bản demo
- So sánh với Wattpad / Webnovel / Netflix / Spotify
- Slide & báo cáo
- Chuẩn bị Q&A hội đồng

---

## ⏱️ PHƯƠNG ÁN RÚT GỌN 8 TUẦN

- Tuần 1–2: Backend
- Tuần 3–4: Web
- Tuần 5: Mobile
- Tuần 6–7: AI
- Tuần 8: Deploy + báo cáo

---

> **Nguyên tắc:**
> Không cần làm quá nhiều công nghệ – chỉ cần hệ thống chạy tốt, có chiều sâu và giải thích được.

📅 TUẦN 2 – NGHIỆP VỤ HỆ THỐNG & API NÂNG CAO
🧠 Mục tiêu kỹ thuật

Hoàn thiện workflow đăng truyện

Xây dựng hệ thống duyệt truyện (Editor)

Thêm tính năng tương tác (comment, rating, like)

API đủ mạnh cho web & mobile sử dụng

🗂️ KẾ HOẠCH THEO NGÀY
🗓️ Ngày 1 – Story Workflow (Quy trình xuất bản)

Việc cần làm

Thêm trạng thái truyện:

Draft (bản nháp)

Pending (chờ duyệt)

Approved (đã duyệt)

Published (đã xuất bản)

Checklist

 Thêm field status trong Story model

 Chỉ Author được gửi duyệt

 Chỉ Editor được duyệt

 Published → cho phép public API đọc

📌 Kết quả:
Backend có quy trình giống nền tảng thật

🗓️ Ngày 2 – Editor Review System

Việc cần làm

API cho Editor:

Duyệt truyện

Từ chối truyện

Gửi phản hồi chỉnh sửa

Checklist

 API approve / reject

 Lưu review_note

 Permission cho Editor

 Log người duyệt

📌 Kết quả:
Có thể demo quy trình Author → Editor → Publish

🗓️ Ngày 3 – Comment System

Việc cần làm

Người dùng bình luận truyện & chương

Checklist

 Comment model

 Nested comment (reply)

 API CRUD comment

 Chỉ user đăng nhập mới comment

📌 Kết quả:
Hệ thống có tương tác người dùng

🗓️ Ngày 4 – Rating & Like

Việc cần làm

User đánh giá truyện

User thích truyện

Checklist

 Rating model (1–5 sao)

 Tính điểm trung bình

 Like story

 Không cho like trùng

📌 Kết quả:
Có thể hiển thị truyện phổ biến / đánh giá cao

🗓️ Ngày 5 – Search, Filter, Pagination

Việc cần làm

Tối ưu API cho frontend

Checklist

 Pagination DRF

 Search theo tên truyện

 Filter theo:

Thể loại

Trạng thái

Rating

 Order theo lượt xem / mới nhất

📌 Kết quả:
API chuyên nghiệp như sản phẩm thật

🗓️ Ngày 6 – Upload ảnh bìa truyện

Việc cần làm

Upload & quản lý media

Checklist

 ImageField

 MEDIA_URL / MEDIA_ROOT

 Validate ảnh

 API upload ảnh

📌 Kết quả:
Truyện có ảnh bìa hiển thị đẹp

🗓️ Ngày 7 – Tổng hợp & ghi chép báo cáo

Việc cần làm

Ghi lại:

Workflow xuất bản

Phân quyền Author / Editor

Các API chính

Cơ chế tương tác người dùng

📌 Phần này đưa thẳng vào:

Chương: Phân tích & thiết kế nghiệp vụ hệ thống


🗓️ Tuần 3 – Backend nâng cao (Chi tiết từng ngày)
🚀 Ngày 1 – Tổng quan & setup nền tảng async

Mục tiêu: hiểu async task + chuẩn bị môi trường

Hiểu concept:

Task queue là gì? Vì sao cần (email, AI processing, crawl…)

So sánh sync vs async

Cài đặt:

Celery

Redis

Kết nối Celery với Django

Tạo task đơn giản:

@shared_task
def add(x, y):
    return x + y

✅ Output:

Chạy được worker

Gọi task thành công từ Django shell

⚙️ Ngày 2 – Celery thực chiến

Mục tiêu: dùng Celery cho feature thật

Làm các use-case:

Gửi email async

Delay task (countdown)

Retry task khi fail

Logging task

Lưu trạng thái task (optional: database hoặc Redis)

💡 Gợi ý áp dụng đồ án:

Upload truyện → xử lý AI (tóm tắt / phân loại) bằng task nền

✅ Output:

1 API trigger task nền

Có thể demo “task chạy sau 5s”

🧹 Ngày 3 – Soft delete (Xóa mềm)

Mục tiêu: tránh mất dữ liệu thật

Hiểu:

Hard delete vs soft delete

Implement:

Thêm field is_deleted

Custom manager:

objects = ActiveManager()
all_objects = models.Manager()

Override delete()

Filter mặc định không trả dữ liệu đã xóa

💡 Nâng cao:

Cho phép “restore”

Cascade soft delete (truyện → chương)

✅ Output:

API delete không xóa thật

Có thể restore

📜 Ngày 4 – Audit log (theo dõi thay đổi)

Mục tiêu: tracking để “ăn điểm đồ án”

Hiểu:

Audit log vs history

Thiết kế bảng:

user

action (CREATE/UPDATE/DELETE)

object_id

changes (JSON)

Middleware hoặc signal:

post_save

post_delete

💡 Bonus:

So sánh before/after

✅ Output:

Mỗi lần update truyện → có log

Có thể query lịch sử chỉnh sửa

🔀 Ngày 5 – API versioning

Mục tiêu: backend “chuẩn production”

Hiểu:

Vì sao cần versioning

Implement:

URL versioning:

/api/v1/
/api/v2/

Tách serializer / view cho v2

Thử thay đổi response giữa v1 và v2

💡 Ví dụ:

v1: trả title

v2: trả title + summary AI

✅ Output:

Có 2 version API chạy song song

🚨 Ngày 6 – Global exception handling

Mục tiêu: backend sạch, dễ debug

Tạo custom exception:

class AppError(Exception):
    pass

Custom handler trong Django REST Framework

Chuẩn hóa response:

{
  "error": "INVALID_DATA",
  "message": "...",
  "status": 400
}

Handle:

Validation error

Not found

Permission

💡 Bonus:

Log lỗi ra file

✅ Output:

API luôn trả format lỗi thống nhất

🧪 Ngày 7 – Tích hợp + demo mini system

Mục tiêu: “đóng gói” thành sản phẩm có thể bảo vệ

Build flow hoàn chỉnh:

User upload truyện

API nhận request

Gọi Celery task:

AI xử lý nội dung

Lưu kết quả

Ghi audit log

Có thể delete/restore

API versioning trả dữ liệu khác nhau

Demo kịch bản:

Upload truyện → “đang xử lý”

5s sau → có summary

Xóa → vẫn restore được

Xem log chỉnh sửa

✅ Output cuối tuần:

Backend:

Async processing (Celery)

Không mất dữ liệu (soft delete)

Có tracking (audit log)

Có versioning

Có error handling