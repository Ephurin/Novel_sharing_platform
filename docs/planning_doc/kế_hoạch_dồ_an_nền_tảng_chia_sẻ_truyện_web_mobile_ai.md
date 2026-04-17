# KẾ HOẠCH ĐỒ ÁN TỐT NGHIỆP
## Nền tảng chia sẻ truyện tự sáng tác (Web + Mobile + AI)

---

## 1. Tổng quan đề tài

### 1.1. Tên đề tài (đề xuất)
**Xây dựng nền tảng chia sẻ truyện tự sáng tác với hỗ trợ AI cho quá trình sáng tác và trải nghiệm đọc trên thiết bị di động**

### 1.2. Mục tiêu
- Xây dựng một hệ thống cho phép người dùng **sáng tác, chia sẻ và đọc truyện**.
- Tách biệt rõ ràng:
  - **Web**: phục vụ soạn thảo, biên tập, quản lý nội dung.
  - **Mobile**: phục vụ đọc truyện và tương tác cộng đồng.
- Tích hợp **AI (fine-tuning)** để hỗ trợ sáng tác, đáp ứng yêu cầu học thuật của đồ án tốt nghiệp.

### 1.3. Đối tượng sử dụng
- **Tác giả**: viết và quản lý truyện.
- **Người đọc**: đọc, bình luận, tương tác.
- **Quản trị viên**: kiểm duyệt và quản lý hệ thống.

---

## 2. Phân tích kiến trúc tổng thể

### 2.1. Mô hình kiến trúc

```
Web App (Author / Editor)
        │
        │ REST / GraphQL API
        ▼
Backend Core (Auth, Story, Comment, Statistic)
        │
        ├──────── AI Service (NLP Model - Fine-tuned)
        │
        └──────── Mobile App (Reader)
```

### 2.2. Nguyên tắc thiết kế
- Backend dùng chung cho Web và Mobile.
- AI được tách thành service riêng.
- Giao tiếp thông qua API chuẩn REST.
- Dễ mở rộng và bảo trì.

---

## 3. Phân chia chức năng theo nền tảng

### 3.1. Web Application (Soạn thảo & Biên tập)
**Mục tiêu:** hỗ trợ tác giả sáng tác và quản lý nội dung.

**Chức năng chính:**
- Đăng ký / đăng nhập (JWT, phân quyền).
- Quản lý truyện:
  - Tạo, chỉnh sửa, xóa truyện.
  - Quản lý chương.
  - Trạng thái: Draft / Published.
- Trình soạn thảo nâng cao:
  - Rich Text / Markdown.
  - Tự động lưu (Auto-save).
  - Lịch sử phiên bản (version history – mở rộng).
- AI hỗ trợ sáng tác:
  - Gợi ý thể loại truyện.
  - Gợi ý tag.
  - Phân tích văn phong.
- Thống kê:
  - Lượt xem, lượt thích, bình luận.

---

### 3.2. Mobile Application (Đọc & Tương tác)
**Mục tiêu:** mang lại trải nghiệm đọc thuận tiện trên thiết bị di động.

**Chức năng chính:**
- Đăng nhập / sử dụng với tư cách khách.
- Đọc truyện:
  - Danh sách truyện mới / nổi bật.
  - Tùy chỉnh font chữ, chế độ tối.
- Tương tác:
  - Bình luận.
  - Like / Bookmark.
- Theo dõi tác giả.

---

## 4. Thành phần AI trong hệ thống

### 4.1. Mục tiêu AI
- Không chỉ gọi API AI bên ngoài.
- Có **dataset**, **mô hình**, và **fine-tuning** rõ ràng.
- Đáp ứng yêu cầu học thuật của đồ án tốt nghiệp.

### 4.2. Bài toán AI đề xuất
- **Phân loại thể loại truyện (Text Classification)**.
- **Gợi ý tag tự động (Multi-label Classification)**.

### 4.3. Dataset
- Corpus tiếng Việt công khai (Wikipedia, news, web text).
- Truyện do người dùng tạo trong hệ thống (sau khi ẩn danh).
- Tiền xử lý: làm sạch, tách câu, chuẩn hóa văn bản.

### 4.4. Mô hình và kỹ thuật
- Mô hình nền: PhoBERT / viBERT.
- Framework: PyTorch + HuggingFace Transformers.
- Kỹ thuật: **Fine-tuning mô hình pretrained**.

### 4.5. Quy trình huấn luyện
1. Chuẩn bị dataset.
2. Fine-tune mô hình trên server remote (Google Colab).
3. Đánh giá mô hình (Accuracy, F1-score).
4. Lưu model và deploy để inference.

---

## 5. Công nghệ sử dụng

### 5.1. Backend
- NestJS (TypeScript) hoặc Django + Django REST Framework.
- Authentication: JWT.
- Database: PostgreSQL.
- Cache: Redis.

### 5.2. Web Frontend
- React / Next.js.
- Rich Text Editor: TipTap / Quill.
- UI Framework: Tailwind CSS / MUI.

### 5.3. Mobile Frontend
- Flutter (đa nền tảng) hoặc React Native.

### 5.4. AI & Training
- Python.
- PyTorch.
- HuggingFace Transformers.
- Google Colab (GPU miễn phí).

---

## 6. Kế hoạch thực hiện (12 tháng)

| Thời gian | Nội dung |
|---------|----------|
| Tháng 1–2 | Phân tích yêu cầu, thiết kế hệ thống (SRS, ERD, Diagram) |
| Tháng 3–4 | Xây dựng Backend cơ bản, Auth, CRUD truyện |
| Tháng 5–6 | Web App (Editor, quản lý truyện) |
| Tháng 7–8 | Mobile App (Đọc, bình luận) |
| Tháng 9 | Thu thập dataset, tiền xử lý |
| Tháng 10 | Fine-tuning mô hình AI |
| Tháng 11 | Tích hợp AI, tối ưu hệ thống |
| Tháng 12 | Viết báo cáo, demo, bảo vệ |

---

## 7. Điểm mạnh của đề tài
- Phân tách Web và Mobile hợp lý theo hành vi người dùng.
- Có kiến trúc backend + AI service rõ ràng.
- Ứng dụng AI thực sự (fine-tuning), không chỉ gọi API.
- Phù hợp xu hướng công nghệ hiện đại.

---

## 8. Hướng phát triển mở rộng
- Gợi ý truyện cá nhân hóa.
- Tóm tắt truyện bằng AI.
- Hệ thống đề xuất (Recommendation System).
- Triển khai microservice hoàn chỉnh.

---

## 9. Kết luận
Đề tài đáp ứng tốt yêu cầu của đồ án tốt nghiệp: có **web**, **mobile**, **AI**, kiến trúc rõ ràng và khả năng mở rộng. Việc áp dụng fine-tuning giúp nâng cao giá trị học thuật và khả năng được đánh giá cao khi bảo vệ.


---

# 📊 Mô Tả UML – Use Case / ERD / Sequence Diagram

Phần này dùng để **vẽ sơ đồ UML** phục vụ báo cáo và bảo vệ đồ án. Nội dung mô tả đủ chi tiết để triển khai bằng **Draw.io, StarUML, Visual Paradigm**.

---

## 1️⃣ Use Case Diagram

### 🎭 Actors
- **Guest**: người dùng chưa đăng nhập
- **Reader**: người dùng đã đăng nhập để đọc truyện
- **Author**: người sáng tác truyện
- **Editor/Admin**: quản trị hệ thống
- **AI Service**: hệ thống AI hỗ trợ (actor phụ)

---

### 📌 Use Case cho Guest
- Xem danh sách truyện
- Xem chi tiết truyện
- Tìm kiếm truyện
- Đăng ký tài khoản

---

### 📌 Use Case cho Reader
- Đăng nhập / đăng xuất
- Đọc truyện
- Bình luận truyện
- Like / Bookmark truyện
- Theo dõi tác giả
- Quản lý hồ sơ cá nhân

---

### 📌 Use Case cho Author
- Tạo truyện mới
- Soạn thảo chương truyện
- Lưu bản nháp
- Xuất bản truyện
- Chỉnh sửa truyện
- Xem thống kê lượt đọc
- **Nhận gợi ý từ AI**
  - Gợi ý tiêu đề
  - Gợi ý tag
  - Phân loại thể loại

---

### 📌 Use Case cho Admin
- Quản lý người dùng
- Duyệt / ẩn truyện
- Quản lý bình luận
- Quản lý danh mục / tag

---

### 🤖 Use Case cho AI Service
- Phân tích nội dung truyện
- Gợi ý metadata (tag, thể loại)
- Đánh giá sơ bộ nội dung (độ dài, mức độ lặp)

📐 **Khi vẽ**: đặt AI Service ở ngoài hệ thống, kết nối với Author.

---

## 2️⃣ ERD – Entity Relationship Diagram

### 📦 Các Entity chính

#### 👤 User
- user_id (PK)
- username
- email
- password_hash
- role (guest / reader / author / admin)
- created_at

---

#### 📚 Story
- story_id (PK)
- title
- description
- status (draft / published / hidden)
- author_id (FK → User)
- created_at

---

#### 📄 Chapter
- chapter_id (PK)
- story_id (FK → Story)
- title
- content
- order_index
- created_at

---

#### 💬 Comment
- comment_id (PK)
- chapter_id (FK → Chapter)
- user_id (FK → User)
- content
- created_at

---

#### 🏷️ Tag
- tag_id (PK)
- name

---

#### 🔗 Story_Tag (bảng trung gian)
- story_id (FK → Story)
- tag_id (FK → Tag)

---

#### ❤️ Bookmark
- bookmark_id (PK)
- user_id (FK → User)
- story_id (FK → Story)

---

#### 📊 View_Statistic
- stat_id (PK)
- story_id (FK → Story)
- view_count
- updated_at

---

### 🔗 Quan hệ chính
- User 1–N Story
- Story 1–N Chapter
- Chapter 1–N Comment
- Story N–N Tag
- User 1–N Comment
- User 1–N Bookmark

📐 **Khi vẽ**: dùng crow-foot notation.

---

## 3️⃣ Sequence Diagram (Luồng tiêu biểu)

### 🔁 Sequence 1: Author đăng truyện với AI hỗ trợ **(có Biên tập viên)**

**Actors**: Author, Editor, AI Service

**Luồng**:
1. Author → Web App: Mở trang soạn thảo
2. Author → Web App: Soạn nội dung chương
3. Web App → Backend API: Lưu bản nháp (status = draft)
4. Author → Web App: Gửi yêu cầu hỗ trợ AI
5. Web App → AI Service: Gửi nội dung truyện
6. AI Service → Web App: Trả về gợi ý (tiêu đề, tag, thể loại)
7. Web App → Backend API: Lưu metadata AI
8. Author → Web App: Gửi yêu cầu duyệt truyện
9. Web App → Backend API: Cập nhật trạng thái (status = pending_review)
10. Backend API → Editor Panel: Thông báo truyện cần duyệt
11. Editor → Web Editor Panel: Mở truyện cần biên tập
12. Editor → Web Editor Panel: Đọc, chỉnh sửa nội dung (nếu cần)
13. Editor → Backend API: Gửi phản hồi chỉnh sửa **hoặc** phê duyệt
14. Backend API → Database: Cập nhật nội dung / trạng thái
15. [Nhánh A – Cần sửa]
    - Backend API → Web App (Author): Trả phản hồi chỉnh sửa
    - Author → Web App: Chỉnh sửa và gửi lại (quay về bước 9)
16. [Nhánh B – Được duyệt]
    - Backend API: Cập nhật trạng thái (status = published)
    - Backend API → Database: Lưu trạng thái published

---

### 🔁 Sequence 2: Reader đọc truyện và bình luận (Mobile)

**Actor**: Reader

**Luồng**:
1. Reader → Mobile App: Mở truyện
2. Mobile App → Backend API: Lấy danh sách chương
3. Backend API → Database: Truy vấn dữ liệu
4. Mobile App → Reader: Hiển thị nội dung
5. Reader → Mobile App: Gửi bình luận
6. Mobile App → Backend API: Lưu bình luận
7. Backend API → Database: Insert comment

---

### 🔁 Sequence 3: Admin ẩn truyện vi phạm

**Actor**: Admin

**Luồng**:
1. Admin → Web Admin Panel: Chọn truyện
2. Admin → Backend API: Cập nhật trạng thái
3. Backend API → Database: Update story.status = hidden
4. Backend API → Web Panel: Trả kết quả thành công

---

## 🎯 Gợi ý khi bảo vệ
- Use Case: tập trung vào **Actor khác nhau Web / Mobile**
- ERD: nhấn mạnh **chuẩn hóa dữ liệu**
- Sequence: chọn **có AI** để gây ấn tượng

---

> Phần UML này có thể tách thành chương riêng trong báo cáo: **"Phân tích & Thiết kế hệ thống"**


---

# 🧩 Related Works & Similar Systems

## 1. Mục tiêu so sánh

Trong quá trình thiết kế hệ thống, nhóm tham khảo các **nền tảng phân phối nội dung số** đã được triển khai thành công nhằm:
- Đối chiếu mô hình kiến trúc
- So sánh vòng đời nội dung (content lifecycle)
- Xác định vai trò của AI trong xử lý và phân phối nội dung

Các hệ thống được lựa chọn tham khảo bao gồm **Netflix** và **Spotify**, do có cấu trúc dịch vụ tương đồng ở mức khái niệm với nền tảng chia sẻ truyện đề xuất.

---

## 2. Netflix – Nền tảng phân phối nội dung video theo yêu cầu

Netflix là nền tảng cung cấp dịch vụ xem phim và chương trình truyền hình trực tuyến, với đặc trưng:
- Nội dung được tạo bởi **studio/producer**
- Trải qua quá trình **kiểm duyệt và biên tập** trước khi phát hành
- Phân phối tới người dùng cuối thông qua web và mobile
- Ứng dụng AI trong **phân loại nội dung và gợi ý cá nhân hóa**

### Điểm tương đồng với đề tài
- Có chuỗi vai trò: *Creator → Editor → Platform → Consumer*
- Nội dung được quản lý theo vòng đời: *draft → approved → published*
- AI hỗ trợ xử lý và phân loại nội dung

### Điểm khác biệt
- Netflix tập trung vào streaming video với yêu cầu hạ tầng lớn
- Hệ thống đồ án chỉ xử lý nội dung văn bản, quy mô đơn giản hơn

---

## 3. Spotify – Nền tảng phát hành và nghe nhạc trực tuyến

Spotify là nền tảng cung cấp nội dung âm nhạc số, trong đó:
- Nghệ sĩ hoặc nhà phát hành đóng vai trò **nhà sáng tạo nội dung**
- Nội dung được tổ chức theo **album, playlist, thể loại**
- AI đóng vai trò quan trọng trong **phân loại và đề xuất nội dung**

### Điểm tương đồng với đề tài
- Mô hình đa vai trò: *Artist / Curator / Listener*
- Nội dung được gắn metadata (tag, thể loại)
- AI hỗ trợ phân tích nội dung và hành vi người dùng

### Điểm khác biệt
- Spotify tập trung vào cá nhân hóa trải nghiệm người nghe ở quy mô lớn
- Đồ án chỉ triển khai AI ở mức hỗ trợ sáng tác và biên tập nội dung

---

## 4. Wattpad – Nền tảng chia sẻ truyện trực tuyến

Wattpad là nền tảng cho phép người dùng tự sáng tác và chia sẻ truyện, với các đặc trưng:
- Người dùng đóng vai trò **tác giả và độc giả**
- Hỗ trợ đăng truyện theo chương
- Bình luận trực tiếp theo từng đoạn nội dung
- Có hệ thống **tag, thể loại** để phân loại truyện
- Có cơ chế kiểm duyệt và biên tập nội dung

### Điểm tương đồng với đề tài
- Cho phép người dùng tự sáng tác và xuất bản truyện
- Có phân quyền tác giả – độc giả – quản trị
- Nội dung trải qua vòng đời: *draft → review → published*
- Có thể tích hợp AI để hỗ trợ phân loại nội dung

### Điểm khác biệt
- Wattpad tập trung mạnh vào yếu tố cộng đồng và mạng xã hội
- Đề tài tập trung nhiều hơn vào kiến trúc hệ thống và AI hỗ trợ sáng tác

---

## 5. Webnovel – Nền tảng truyện chương hồi

Webnovel là nền tảng phát hành truyện chương hồi với mô hình thương mại hóa rõ ràng:
- Tác giả đăng truyện theo chương
- Có **biên tập viên** theo dõi và hỗ trợ từng tác giả
- Nội dung được kiểm duyệt trước khi xuất bản
- Có hệ thống xếp hạng, thống kê lượt đọc

### Điểm tương đồng với đề tài
- Mô hình rõ ràng: *Author → Editor → Reader*
- Có quy trình biên tập và duyệt nội dung
- Nội dung được tổ chức theo chương

### Điểm khác biệt
- Webnovel có cơ chế trả phí và hợp đồng tác giả
- Đồ án không triển khai yếu tố thương mại hóa

---



## 6. So sánh tổng hợp

| Tiêu chí | Netflix | Spotify | Nền tảng truyện (đề tài) |
|--------|---------|---------|--------------------------|
| Loại nội dung | Video | Âm nhạc | Văn bản (truyện) |
| Nhà sáng tạo | Studio | Nghệ sĩ | Tác giả |
| Biên tập / kiểm duyệt | Có | Có | Có |
| AI phân loại nội dung | Có | Có | Có |
| AI cá nhân hóa mạnh | Có | Có | Chưa triển khai |
| Quy mô hệ thống | Rất lớn | Rất lớn | Quy mô học thuật |

---

## 5. Nhận xét và định hướng áp dụng

Từ việc tham khảo các hệ thống tương tự, có thể nhận thấy rằng nền tảng chia sẻ truyện trong đề tài thuộc cùng nhóm hệ thống **phân phối nội dung số**. Tuy nhiên, hệ thống được thiết kế với phạm vi và độ phức tạp được giản lược nhằm phù hợp với mục tiêu nghiên cứu và triển khai trong khuôn khổ đồ án tốt nghiệp.

Việc tham chiếu các mô hình lớn như Netflix và Spotify giúp đảm bảo rằng kiến trúc đề xuất có tính thực tiễn, đồng thời tạo tiền đề cho các hướng mở rộng trong tương lai như hệ thống gợi ý nội dung cho người đọc.

---

> Mục này có thể được sử dụng như một chương độc lập trong báo cáo với tiêu đề: **“Các hệ thống liên quan và mô hình tham khảo”**

