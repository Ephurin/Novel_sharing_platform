# Tổng kết kiến thức Tuần 1

> Dự án: Nền tảng chia sẻ truyện web (Backend API)  
> Stack: Django 6 · Django REST Framework · SimpleJWT · SQLite  
> Thời gian: Ngày 1 – 7

---

## 1. Kiến trúc Backend

### 1.1 Tổng quan

```
Client (Mobile / Web)
        │
        │  HTTP Request (JSON)
        ▼
┌───────────────────┐
│    URL Router      │  urls.py – phân phối request tới đúng ViewSet
└───────────────────┘
        │
        ▼
┌───────────────────┐
│    Permission      │  permissions.py – kiểm tra quyền trước khi vào View
└───────────────────┘
        │
        ▼
┌───────────────────┐
│      View          │  views.py – nhận request, gọi Model, trả response
└───────────────────┘
        │         │
        ▼         ▼
┌──────────┐ ┌──────────────┐
│  Model   │ │  Serializer  │
│(ORM/DB)  │ │(chuyển đổi   │
│          │ │ data↔JSON)   │
└──────────┘ └──────────────┘
```

### 1.2 Cấu trúc thư mục

```
testproject/
├── testproject/
│   ├── settings/
│   │   ├── base.py       # config dùng chung mọi môi trường
│   │   └── dev.py        # config local (SECRET_KEY, DEBUG, DB)
│   ├── urls.py           # URL gốc của toàn project
│   ├── wsgi.py
│   └── asgi.py
├── stories/              # App chính: Story, Chapter, Comment
│   ├── models.py
│   ├── views.py
│   ├── permissions.py
│   ├── serializers/
│   │   ├── story.py
│   │   ├── chapter.py
│   │   └── comment.py
│   └── urls.py
├── user_accounts/        # App quản lý User + Role
│   └── models.py
├── requirements.txt
└── manage.py
```

### 1.3 Vai trò từng thành phần

| Thành phần | Trách nhiệm |
|---|---|
| **Model** | Định nghĩa bảng DB, quan hệ giữa các bảng, business rule ở tầng dữ liệu |
| **Serializer** | Chuyển đổi Model object ↔ JSON; validate dữ liệu đầu vào từ client |
| **Permission** | Kiểm tra user có quyền thực hiện action không (trước khi vào View) |
| **View (ViewSet)** | Nhận request → lấy data từ Model → đóng gói qua Serializer → trả response |
| **URL Router** | Map đường dẫn URL tới đúng View |
| **Settings** | Cấu hình toàn bộ project, tách theo môi trường (dev / prod) |

---

## 2. Data Model

### 2.1 Sơ đồ quan hệ

```
User (user_accounts)
 │
 │  1 : N (author)
 ▼
Story
 │
 │  1 : N
 ▼
Chapter  ──── status: DRAFT → PENDING → APPROVED → PUBLISHED
 │
 │  1 : N
 ▼
Comment ◄──── User (1:N, người bình luận)
```

### 2.2 Các model chính

**User** (`user_accounts.User`)
```
- username, password, email   (kế thừa AbstractUser)
- role: reader | author | editor
- created_at, updated_at
```

**Story** (`stories.Story`)
```
- author → FK User
- title, description
- created_at, updated_at
```

**Chapter** (`stories.Chapter`)
```
- story → FK Story
- title, content
- status: draft | pending | approved | published
- created_at, updated_at
```

**Comment** (`stories.Comment`)
```
- user  → FK User
- chapter → FK Chapter
- content
- created_at, updated_at
```

---

## 3. Luồng Authentication (Auth Flow)

Dự án dùng **JWT (JSON Web Token)** thông qua thư viện `djangorestframework-simplejwt`.

### 3.1 Đăng nhập

```
Client                          Server
  │                               │
  │── POST /api/token/ ──────────►│
  │   { username, password }      │
  │                               │ Xác thực credentials
  │                               │ Tạo cặp token
  │◄── 200 OK ────────────────────│
  │   {                           │
  │     "access":  "<JWT>",       │  hết hạn sau ~5 phút
  │     "refresh": "<JWT>"        │  hết hạn sau ~1 ngày
  │   }                           │
```

### 3.2 Gọi API cần xác thực

```
Client                          Server
  │                               │
  │── GET /api/stories/ ─────────►│
  │   Header:                     │
  │   Authorization: Bearer <JWT> │ Giải mã JWT
  │                               │ Lấy user từ token
  │                               │ Kiểm tra Permission
  │◄── 200 OK (JSON) ─────────────│
```

### 3.3 Làm mới token

```
Client                          Server
  │                               │
  │── POST /api/token/refresh/ ──►│
  │   { "refresh": "<JWT>" }      │
  │                               │
  │◄── 200 OK ────────────────────│
  │   { "access": "<new JWT>" }   │
```

### 3.4 Các endpoint Auth

| Method | URL | Chức năng |
|---|---|---|
| POST | `/api/token/` | Đăng nhập, nhận access + refresh token |
| POST | `/api/token/refresh/` | Dùng refresh token để lấy access token mới |

---

## 4. Role System (Hệ thống phân quyền)

### 4.1 Các role

| Role | Mô tả |
|---|---|
| `reader` | Chỉ đọc nội dung đã được duyệt |
| `author` | Tạo và quản lý truyện/chương của chính mình |
| `editor` | Duyệt nội dung, toàn quyền xem và chỉnh sửa |

### 4.2 Ma trận quyền

| Hành động | Reader | Author | Editor |
|---|:---:|:---:|:---:|
| Xem Story có chapter đã duyệt | ✅ | ✅ | ✅ |
| Xem Story của chính mình | ❌ | ✅ | ✅ |
| Tạo / sửa / xoá Story | ❌ | ✅ (của mình) | ✅ (tất cả) |
| Xem Chapter đã APPROVED/PUBLISHED | ✅ | ✅ | ✅ |
| Xem Chapter DRAFT/PENDING | ❌ | ✅ (của mình) | ✅ |
| Tạo Chapter mới | ❌ | ✅ | ✅ |
| Sửa / xoá Chapter | ❌ | ✅ (của mình) | ✅ (tất cả) |
| Duyệt Chapter (→ APPROVED) | ❌ | ❌ | ✅ |

### 4.3 Vòng đời của Chapter

```
[Tạo mới]
    │
    ▼
  DRAFT  ──── Author chỉnh sửa nội dung
    │
    │  Author gửi lên review
    ▼
 PENDING ──── chờ Editor xét duyệt
    │
    │  Editor duyệt (POST /api/chapters/{id}/approve/)
    ▼
APPROVED ──── Reader có thể đọc
    │
    │  (Publish chính thức)
    ▼
PUBLISHED
```

### 4.4 Rule bảo vệ trong code

| Rule | Nơi thực thi |
|---|---|
| Author không tự set status = APPROVED/PUBLISHED | `ChapterSerializer.update()` |
| Chapter mới luôn bắt đầu là DRAFT | `ChapterSerializer.create()` |
| Story mới tự gán `author = request.user` | `StorySerializer.create()` |
| Reader chỉ thấy chapter đã duyệt | `ChapterViewSet.get_queryset()` |
| Chỉ Editor được gọi action `approve` | `IsEditorOnly` permission |

---

## 5. API Endpoints

| Method | URL | Quyền | Chức năng |
|---|---|---|---|
| GET | `/api/stories/` | Tất cả (đã đăng nhập) | Danh sách story (lọc theo role) |
| POST | `/api/stories/` | Author, Editor | Tạo story mới |
| GET | `/api/stories/{id}/` | Tất cả | Chi tiết story + chapters |
| PUT/PATCH | `/api/stories/{id}/` | Author (của mình), Editor | Sửa story |
| DELETE | `/api/stories/{id}/` | Author (của mình), Editor | Xoá story |
| GET | `/api/chapters/` | Tất cả | Danh sách chapter (lọc theo role) |
| POST | `/api/chapters/` | Author, Editor | Tạo chapter mới |
| PUT/PATCH | `/api/chapters/{id}/` | Author (của mình), Editor | Sửa chapter |
| DELETE | `/api/chapters/{id}/` | Author (của mình), Editor | Xoá chapter |
| POST | `/api/chapters/{id}/approve/` | Editor only | Duyệt chapter |
| POST | `/api/token/` | Public | Đăng nhập |
| POST | `/api/token/refresh/` | Public | Làm mới token |

---

## 6. Kiến thức kỹ thuật tích lũy

### Django
- Custom User kế thừa `AbstractUser`, thêm field `role`
- Dùng `AUTH_USER_MODEL` để thay thế User model mặc định
- Tách settings theo môi trường: `base.py` / `dev.py`
- Migration workflow: `makemigrations` → `migrate`

### Django REST Framework
- `ModelViewSet`: tự động sinh đủ 5 action (list, create, retrieve, update, destroy)
- `get_queryset()`: lọc data động theo business rule
- `perform_create()` / `create()` trong serializer: gán dữ liệu server-side
- `@action`: tạo custom endpoint ngoài CRUD chuẩn
- `permission_classes`: khai báo danh sách permission, tất cả phải pass mới được vào

### JWT Authentication
- Token gồm 2 loại: `access` (ngắn hạn) và `refresh` (dài hạn)
- Client lưu token, gửi kèm header `Authorization: Bearer <token>` mỗi request
- Server không lưu session — stateless

### Best Practices áp dụng
- Tách `permissions.py` riêng, không viết logic quyền trong View
- Tách `serializers/` thành package khi logic phức tạp
- Validate dữ liệu tại Serializer, không tại View
- `read_only_fields` cho các field do server tự gán (`author`)
- `update_fields=['status']` khi `save()` để chỉ cập nhật đúng field cần thiết
