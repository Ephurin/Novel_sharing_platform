# 06. Phân tích thực thể liên quan (Data Modeling)

Tài liệu này mô tả cấu trúc dữ liệu và mối quan hệ giữa các thực thể cốt lõi trong hệ thống Ephurin.

## 1. Sơ đồ Quan hệ Thực thể (Entity Relationship Diagram - ERD)

```mermaid
erDiagram
    USER ||--o{ NOVEL : "sáng tác"
    USER ||--o{ COMMENT : "viết"
    USER ||--o{ TRANSACTION : "thực hiện"
    USER ||--o{ READING_HISTORY : "có"
    
    NOVEL ||--o{ CHAPTER : "bao gồm"
    NOVEL ||--o{ TAG : "có"
    NOVEL }|--|| CATEGORY : "thuộc"
    
    CHAPTER ||--o{ COMMENT : "có"
    CHAPTER ||--o{ UNLOCK_RECORD : "được mở khóa"
    
    USER {
        int id PK
        string username
        string email
        string password_hash
        string role "READER/AUTHOR/ADMIN"
        decimal coin_balance
        datetime created_at
    }
    
    NOVEL {
        int id PK
        string title
        string description
        string cover_url
        int author_id FK
        int category_id FK
        string status "ONGOING/COMPLETED"
        int total_views
    }
    
    CHAPTER {
        int id PK
        int novel_id FK
        string title
        text content
        int order_index
        boolean is_premium
        decimal price
        datetime published_at
    }
    
    TRANSACTION {
        int id PK
        int user_id FK
        decimal amount
        string type "DEPOSIT/UNLOCK/DONATE"
        datetime created_at
    }
```

## 2. Từ điển dữ liệu (Data Dictionary)

### 2.1 Thực thể: USER (Người dùng)
| Trường dữ liệu | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | Integer | PK, Auto Increment | Định danh duy nhất cho người dùng. |
| `username` | String | Unique, Not Null | Tên đăng nhập. |
| `role` | Enum | Not Null | Phân quyền: Độc giả, Tác giả hoặc Quản trị viên. |
| `coin_balance` | Decimal | Default 0 | Số dư tài khoản hiện có. |

### 2.2 Thực thể: NOVEL (Tác phẩm)
| Trường dữ liệu | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | Integer | PK | Định danh tác phẩm. |
| `author_id` | Integer | FK (USER.id) | ID của tác giả sáng tác. |
| `status` | Enum | Default 'ONGOING' | Trạng thái: Đang tiến hành hoặc Hoàn thành. |

### 2.3 Thực thể: CHAPTER (Chương truyện)
| Trường dữ liệu | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `is_premium` | Boolean | Default False | Xác định chương có thu phí hay không. |
| `price` | Decimal | Default 0 | Giá mở khóa chương (nếu là premium). |
| `order_index` | Integer | Not Null | Thứ tự chương trong tác phẩm. |

## 3. Phân tích thực thể phụ trợ
- **TAG**: Các từ khóa để phân loại truyện chi tiết hơn (ví dụ: #XuyenKhong, #HeThong).
- **READING_HISTORY**: Lưu vết chương truyện cuối cùng người dùng đã đọc để tính năng "Tiếp tục đọc" hoạt động.
- **UNLOCK_RECORD**: Bảng trung gian xác nhận người dùng đã mua chương nào để tránh trừ tiền nhiều lần.
