# Demo API Testing (5-10 phút) cho dự án Story Platform

## 1) Mục tiêu buổi demo
- Chứng minh API test không chỉ test `happy path`, mà còn test được:
- Authentication (`401`)
- Authorization theo role (`403`)
- API versioning (`v1` vs `v2`)
- Chuẩn hóa lỗi toàn cục (`error`, `message`, `status`)

---

## 2) Phạm vi endpoint dùng trong demo
- Auth JWT: `POST /api/token/`
- Story list/create:
- `GET /api/v1/stories/`
- `GET /api/v2/stories/`
- `POST /api/v1/stories/`

---

## 3) Chuẩn bị trước khi demo (2-3 phút)

### 3.1. Seed user role
Chạy trong thư mục project:

```powershell
python manage.py shell < seed_users.py
```

Tạo sẵn 3 user:
- `reader1 / reader123`
- `author1 / author123`
- `editor1 / editor123`

### 3.2. Chạy server
```powershell
python manage.py runserver
```

Base URL: `http://127.0.0.1:8000`

---

## 4) Kịch bản thuyết trình 5 phút (siêu gọn)

## Phút 0-1: Test 401 (chưa đăng nhập)
Request:
```http
GET /api/v1/stories/
```
Expected:
- HTTP `401`
- Body dạng chuẩn:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication credentials were not provided.",
  "status": 401
}
```
Thông điệp khi nói: "Đây là negative test đầu tiên: không token thì fail có kiểm soát."

## Phút 1-2: Lấy JWT cho author
Request:
```http
POST /api/token/
Content-Type: application/json

{
  "username": "author1",
  "password": "author123"
}
```
Expected: `200`, có `access` token.

## Phút 2-3: Happy path tạo story
Request:
```http
POST /api/v1/stories/
Authorization: Bearer <AUTHOR_ACCESS_TOKEN>
Content-Type: application/json

{
  "title": "Demo API Testing Story",
  "description": "Noi dung demo cho buoi thuyet trinh",
  "genre": "Demo"
}
```
Expected: `201`, response có `id`, `title`, `author`.

## Phút 3-5: Test versioning v1 vs v2
Dùng cùng token author, gọi:

1) `GET /api/v1/stories/`
- Expected: item story KHONG có trường `ai_summary`

2) `GET /api/v2/stories/`
- Expected: item story CÓ trường `ai_summary`

Thông điệp khi nói: "Cùng business data nhưng schema thay đổi theo version, giúp backward compatibility cho client cũ."

---

## 5) Kịch bản thuyết trình 8-10 phút (đầy đủ hơn)

Sau bước 5 phút ở trên, thêm 3 case:

## Case A: Authorization theo role (`403`)
1. Lấy token `reader1`.
2. Gọi `POST /api/v1/stories/` bằng token reader.

Expected:
- HTTP `403`
- Body chuẩn:
```json
{
  "error": "FORBIDDEN",
  "message": "You do not have permission to perform this action.",
  "status": 403
}
```
Ý nghĩa: test phân quyền nghiệp vụ chứ không chỉ test đăng nhập.

## Case B: Validation (`400`)
Gọi endpoint token sai payload:
```http
POST /api/token/
Content-Type: application/json

{}
```
Expected: `400` với format lỗi chuẩn `{error, message, status}`.

## Case C: Not Found (`404`)
Dùng token author gọi:
```http
GET /api/v1/stories/999999/
Authorization: Bearer <AUTHOR_ACCESS_TOKEN>
```
Expected: `404` với format lỗi chuẩn.

---

## 6) Bộ test script có sẵn để backup khi live demo gặp sự cố
Nếu Postman/Internet chập chờn, chạy script local:

```powershell
python test_day5_api_versioning.py
python test_day6_exception_handling.py
```

Hai script này đã assert sẵn các tiêu chí chính của buổi trình bày.

---

## 7) Slide nói nhanh (gợi ý 1 trang)
- Why API testing:
- đảm bảo đúng hợp đồng API
- chống regression
- xác thực security rule
- Demo coverage hôm nay:
- AuthN: `401`
- AuthZ: `403`
- Validation: `400`
- Not found: `404`
- Versioning: `v1` vs `v2`
- Kết luận:
- "Một API tốt không chỉ chạy đúng khi dữ liệu đẹp, mà còn fail đúng cách khi dữ liệu xấu."

---

## 8) Checklist trước giờ thuyết trình
- Đã chạy migrate
- Đã seed user
- Có sẵn 3 token (reader/author/editor)
- Mở sẵn 2 tab request v1 và v2
- Chuẩn bị fallback bằng script `test_day5` và `test_day6`
