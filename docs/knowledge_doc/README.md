# Dự án chia sẻ truyện – Ngày 5: Role & Permission

## 1. Role trong hệ thống

Model `User` (app `user_accounts`) kế thừa `AbstractUser` và bổ sung field:

- `role`: một trong các giá trị:
  - `reader` (Reader) – chỉ được **đọc** nội dung đã duyệt.
  - `author` (Author) – được **tạo / chỉnh sửa** truyện & chương của **chính mình**.
  - `editor` (Editor) – được **duyệt** chương, xem & chỉnh sửa toàn bộ nội dung.

Cấu trúc chính:

- `user_accounts/models.py`
  - `RoleChoices(models.TextChoices)`
  - `User.role = models.CharField(choices=RoleChoices.choices, default=READER)`
  - Helper: `is_reader()`, `is_author()`, `is_editor()`
- `user_accounts/admin.py`
  - Tuỳ biến `UserAdmin` để hiển thị + chỉnh sửa `role` trong Django Admin.

> Cách dùng: vào Django Admin → Users → chọn user → đặt `role` là `reader` / `author` / `editor`.

---

## 2. Domain Story & Chapter

App `stories` chia logic như sau:

- `Story`: thông tin chung của truyện (title, description, author, timestamps).
- `Chapter`: mỗi chương của một truyện, **mới là nơi chứa trạng thái duyệt**.

### Trạng thái Chapter

Trong `stories/models.py`:

- `ChapterStatus(models.TextChoices)`:
  - `draft` – bản nháp do Author tạo, chưa gửi/duyệt.
  - `pending` – (dự phòng cho tương lai) trạng thái chờ duyệt.
  - `approved` – đã được Editor duyệt.
  - `published` – (dự phòng) trạng thái đã phát hành.
- Field `Chapter.status`:
  - `status = models.CharField(choices=ChapterStatus.choices, default=ChapterStatus.DRAFT)`

### Serializer

Trong `stories/serializers.py`:

- `ChapterSerializer`:
  - `create`: mọi chapter mới luôn được set `status = draft`.
  - `update`: nếu user là **Author** và cố gắng đổi `status` sang `approved/published` → backend sẽ **bỏ qua** field `status` (Author không tự duyệt được).
- `StorySerializer`:
  - Khi create, backend tự gán `author = request.user`.
  - Field `author` là **read-only** (client không gửi được author tuỳ ý).

---

## 3. Permission & phân quyền API

Các permission chính nằm trong `stories/permissions.py`:

- `IsAuthenticatedWithRole`:
  - Chỉ cho phép truy cập nếu user đã đăng nhập **và** có field `role`.

- `StoryPermission`:
  - Đọc (GET/HEAD/OPTIONS): chỉ cần đăng nhập.
  - Ghi (POST/PUT/PATCH/DELETE): chỉ **Author** hoặc **Editor**.
  - Author chỉ sửa/xoá được **story của chính mình**; Editor sửa/xoá **mọi** story.

- `ChapterPermission`:
  - Đọc:
    - Reader: chỉ đọc được chapter có `status` là `approved` hoặc `published`.
    - Author: đọc chapter thuộc story của mình **hoặc** chapter đã duyệt của người khác.
    - Editor: đọc mọi chapter.
  - Ghi:
    - Author: chỉ ghi chapter thuộc story của mình.
    - Editor: ghi mọi chapter.

- `IsEditorOnly`:
  - Dùng cho các action mà **chỉ Editor** được phép gọi (ví dụ: duyệt chương).

---

## 4. ViewSet & API endpoints

Trong `stories/views.py`:

### StoryViewSet

```http
GET /api/stories/
GET /api/stories/{id}/
POST /api/stories/
PATCH/PUT/DELETE /api/stories/{id}/
```

- `permission_classes = [IsAuthenticatedWithRole, StoryPermission]`.
- `get_queryset` lọc theo role:
  - Reader:
    - Chỉ thấy các story có **ít nhất một chapter** đã `approved/published`.
  - Author:
    - Thấy story của chính mình.
    - Thấy thêm story có chapter đã `approved/published` của người khác.
  - Editor:
    - Thấy **tất cả** story.

### ChapterViewSet

```http
GET /api/chapters/
GET /api/chapters/{id}/
POST /api/chapters/
PATCH/PUT/DELETE /api/chapters/{id}/
POST /api/chapters/{id}/approve/
```

- `permission_classes = [IsAuthenticatedWithRole, ChapterPermission]`.
- `get_queryset` theo role:
  - Reader: chỉ chapter `approved/published`.
  - Author: chapter thuộc story của mình + chapter `approved/published`.
  - Editor: tất cả chapter.
- Action `approve`:
  - `@action(detail=True, methods=['post'], permission_classes=[IsAuthenticatedWithRole, IsEditorOnly])`.
  - Endpoint: `POST /api/chapters/{id}/approve/`.
  - Chỉ Editor gọi được, và sẽ set `chapter.status = approved`.

---

## 5. Hướng dẫn test nhanh (Postman / Thunder Client)

1. **Tạo user và gán role** (qua Django Admin):
   - Tạo 3 user, ví dụ:
     - `reader1` – role = `reader`.
     - `author1` – role = `author`.
     - `editor1` – role = `editor`.

2. **Lấy JWT token** cho từng user:
   - Gửi request tới endpoint JWT (ví dụ `/api/token/`) với `username` / `password`.
   - Lưu lại `access` token cho mỗi user.

3. **Với author1 (Author)**:
   - `POST /api/stories/` với body `{ "title": "Truyen A", "description": "..." }`.
     - Kết quả: `author` = `author1`.
   - `POST /api/chapters/` với `{ "story": <id_story>, "title": "Chuong 1", "content": "..." }`.
     - Kết quả: `status` = `draft`.

4. **Với editor1 (Editor)**:
   - `POST /api/chapters/{chapter_id}/approve/`.
     - Kết quả: chapter chuyển sang `approved`.

5. **Với reader1 (Reader)**:
   - `GET /api/chapters/` → thấy các chapter đã `approved/published`.
   - `GET /api/stories/` → thấy story có ít nhất một chapter đã approved.
   - Mọi request POST/PUT/PATCH/DELETE tới stories/chapters → nhận `403 Forbidden`.

---

## 6. Ghi chú

- Ngày 5 tập trung vào **backend API**: role + permission + workflow duyệt nội dung.
- Frontend (web/mobile) có thể đọc README này để biết cần gửi token/role nào và gọi đúng endpoint nào cho từng vai trò.
- Các bước tiếp theo có thể mở rộng:
  - Thêm trạng thái `pending` thực sự (Author gửi duyệt, Editor duyệt/ từ chối).
  - Thêm log hoặc notification khi chương được duyệt.
  - Thêm phân quyền chi tiết hơn cho Comment.
