# ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS) - EPHURIN NOVEL PLATFORM

## CHƯƠNG I: GIỚI THIỆU CHUNG

### 1.1 Mục đích tài liệu
Tài liệu Đặc tả Yêu cầu Phần mềm (SRS) này nhằm mục đích mô tả chi tiết các yêu cầu chức năng, yêu cầu phi chức năng, các ràng buộc kỹ thuật và giao diện người dùng cho dự án "Ephurin Novel Platform". Tài liệu đóng vai trò là:
- **Căn cứ kỹ thuật**: Hướng dẫn cho đội ngũ phát triển (Frontend, Backend, AI Engineer) trong quá trình triển khai mã nguồn.
- **Bản cam kết**: Thống nhất phạm vi công việc và các tính năng giữa các bên liên quan (Stakeholders) và nhóm phát triển.
- **Tài liệu nền tảng**: Cung cấp cơ sở để xây dựng kịch bản kiểm thử (Test Cases) và tài liệu hướng dẫn sử dụng sau này.

### 1.2 Phạm vi dự án
Ephurin Novel Platform được thiết kế như một hệ sinh thái toàn diện hỗ trợ việc sáng tác, chia sẻ và thưởng thức tiểu thuyết trực tuyến. Dự án bao gồm các thành phần cốt lõi:
- **Hệ thống Web (Author & Admin Portal)**: 
    - Cung cấp trình soạn thảo chuyên nghiệp (Rich Text/Markdown), công cụ quản lý tác phẩm và dashboard phân tích dữ liệu cho Tác giả.
    - Cung cấp bảng điều khiển quản trị toàn diện cho Admin/Editor để kiểm duyệt nội dung, quản lý người dùng và giao dịch tài chính.
- **Hệ thống Mobile (Reader App)**: Tập trung vào trải nghiệm đọc cá nhân hóa (Personalization), hệ thống tương tác cộng đồng (Inline comment, Vote, Bookmark) và thông báo đẩy (Push Notification).
- **Dịch vụ AI (Intelligent Engine)**: 
    - Tự động phân loại thể loại và tag nội dung.
    - Kiểm duyệt tự động các vi phạm về ngôn từ và bản quyền.
    - Trợ lý sáng tác (Author Assistant) hỗ trợ gợi ý ý tưởng và kiểm tra tính nhất quán của cốt truyện.
- **Admin Dashboard**: Hỗ trợ quản trị viên kiểm duyệt nội dung, xử lý báo cáo vi phạm, quản lý người dùng và theo dõi các chỉ số vận hành.
- **Phạm vi loại trừ**: 
    - Xuất bản sách giấy.
    - Marketplace mua bán bản quyền phức tạp.
    - Hệ thống hợp đồng tác giả đầy đủ ở mức pháp lý thực tế.
    - Quy trình kế toán, quyết toán và thuế chi tiết như một hệ thống thương mại hoàn chỉnh.
    - Hệ thống không chịu trách nhiệm về nội dung bản quyền do người dùng tự ý đăng tải trái phép, nhưng cung cấp cơ chế báo cáo và xử lý (DMCA).

### 1.3 Đối tượng sử dụng tài liệu
Tài liệu SRS hướng đến các nhóm đối tượng sau:

| Đối tượng | Mục đích sử dụng |
| :--- | :--- |
| **Giảng viên hướng dẫn** | Đánh giá mức độ đầy đủ, logic và tính phù hợp của tài liệu phân tích yêu cầu. |
| **Nhóm phân tích yêu cầu** | Thống nhất phạm vi, tác nhân, chức năng và luồng nghiệp vụ của hệ thống. |
| **Nhóm thiết kế hệ thống** | Dựa vào yêu cầu để xây dựng kiến trúc, cơ sở dữ liệu và giao diện. |
| **Nhóm phát triển** | Hiểu rõ chức năng cần triển khai, điều kiện xử lý và quy tắc nghiệp vụ. |
| **Nhóm kiểm thử** | Xây dựng test case, acceptance criteria và kịch bản kiểm thử chức năng. |
| **Chủ dự án/Đơn vị vận hành** | Nắm được mục tiêu, giá trị và phạm vi vận hành của nền tảng. |

### 1.4 Thuật ngữ và Từ viết tắt
| Thuật ngữ/Viết tắt | Ý nghĩa |
| :--- | :--- |
| **SRS** | Software Requirements Specification - Đặc tả yêu cầu phần mềm. |
| **UI/UX** | User Interface / User Experience - Giao diện và Trải nghiệm người dùng. |
| **AI** | Artificial Intelligence - Trí tuệ nhân tạo. |
| **Guest** | Người dùng vãng lai, chưa đăng nhập hệ thống. |
| **Reader** | Độc giả, người dùng chính của Mobile App. |
| **Author** | Tác giả, người sáng tạo và quản lý truyện. |
| **Admin** | Quản trị viên, người quản lý hệ thống và kiểm duyệt nội dung. |
| **KYC** | Know Your Customer - Quy trình xác thực danh tính người dùng. |
| **SSO / OAuth 2.0** | Cơ chế đăng nhập một lần thông qua bên thứ ba (Google, Facebook). |
| **RBAC** | Role-Based Access Control - Kiểm soát truy cập dựa trên vai trò. |
| **JWT** | JSON Web Token - Phương thức xác thực người dùng qua chuỗi mã hóa. |
| **CDN** | Content Delivery Network - Mạng phân phối nội dung giúp tăng tốc độ tải tài nguyên. |
| **DMCA** | Digital Millennium Copyright Act - Đạo luật bản quyền kỹ thuật số. |
| **MVP** | Minimum Viable Product - Sản phẩm khả thi tối thiểu. |
| **Dashboard** | Bảng điều khiển hiển thị dữ liệu và thao tác quản trị. |
| **Coin** | Đơn vị tiền tệ nội bộ dùng để mở khóa chương hoặc tặng quà. |

### 1.5 Tài liệu tham khảo
1. **IEEE Std 830-1998**: Tiêu chuẩn quốc tế về thực hành đặc tả yêu cầu phần mềm.

### 1.6 Tổng quan (Benchmarking)
Để xây dựng một hệ thống vượt trội, Ephurin đã thực hiện phân tích các nền tảng hàng đầu hiện nay:
- **Wattpad**: Ưu điểm là tính cộng đồng cực cao và hệ thống Tag linh hoạt. Ephurin kế thừa khả năng tương tác "Inline Comment" (bình luận theo dòng) để tăng sự gắn kết.
- **Webnovel (Qidian)**: Xuất sắc trong việc thương mại hóa nội dung (Micro-transaction). Ephurin áp dụng mô hình nạp Coin và mở khóa chương nhưng tối ưu hóa quy trình thanh toán minh bạch hơn cho tác giả Việt.
- **Tapas/Radish**: Tập trung vào mô hình serial/episode ngắn, tối ưu cho thiết bị di động.
- **Waka/TruyenFull**: Các nền tảng nội địa mạnh về kho nội dung nhưng trải nghiệm công cụ hỗ trợ sáng tác cho tác giả còn hạn chế.
- **Netflix & Spotify**: Được dùng làm tham chiếu cho mô hình phân phối nội dung, cá nhân hóa trải nghiệm (Recommendation) và quản lý thư viện ở quy mô lớn.
- **Lợi thế cạnh tranh của Ephurin**: Việc tích hợp **AI như một người cộng sự** (không chỉ là bộ lọc) giúp giảm 70% khối lượng kiểm duyệt thủ công cho Admin và tăng hiệu suất sáng tác cho tác giả thông qua các gợi ý thông minh, điều mà các nền tảng hiện nay chưa thực hiện đồng bộ.

## CHƯƠNG II: TỔNG QUAN HỆ THỐNG

### 2.1 Kiến trúc hệ thống
Ephurin Novel Platform được xây dựng dựa trên kiến trúc **Microservices**, cho phép hệ thống hoạt động ổn định, dễ dàng bảo trì và mở rộng độc lập cho từng phân hệ (Web, Mobile, AI).

#### 2.1.1 Sơ đồ kiến trúc tổng quát
Dưới đây là sơ đồ mô tả luồng dữ liệu và sự tương tác giữa các thành phần chính trong hệ thống:

```mermaid
graph TD
    User((Người dùng)) --> Gateway[API Gateway / Nginx]
    Gateway --> AuthService[Auth Service]
    Gateway --> NovelService[Novel & Chapter Service]
    Gateway --> ReaderService[Reading & History Service]
    Gateway --> InteractionService[Interaction & Social Service]
    Gateway --> PaymentService[Payment & Wallet Service]
    Gateway --> AIService[AI Moderation & Assistant]
    
    AuthService --> UserDB[(PostgreSQL)]
    NovelService --> NovelDB[(PostgreSQL)]
    ReaderService --> RedisCache[(Redis)]
    PaymentService --> TransactionDB[(PostgreSQL)]
    AIService --> VectorDB[(Vector DB)]
    
    InteractionService --> MongoDB[(MongoDB)]
```

#### 2.1.2 Mô tả các thành phần cốt lõi
1.  **Frontend Clients (Giao diện người dùng)**:
    -   **Web Application (Next.js)**: Nền tảng chính cho Tác giả sáng tác và Admin quản trị. Sử dụng Server-Side Rendering (SSR) để tối ưu hóa SEO cho các tác phẩm.
    -   **Mobile Application (React Native)**: Ứng dụng dành riêng cho Độc giả, tập trung vào trải nghiệm đọc mượt mà và thông báo thời gian thực.
2.  **API Gateway**: Đóng vai trò là điểm tiếp nhận duy nhất cho mọi yêu cầu từ phía Client, thực hiện điều phối (routing) đến các microservices tương ứng, đồng thời xử lý bảo mật lớp ngoài (Rate limiting, SSL).
3.  **Backend Microservices**:
    -   **Auth Service**: Quản lý xác thực (JWT), phân quyền (RBAC) và thông tin tài khoản người dùng.
    -   **Novel & Chapter Service**: Xử lý logic nghiệp vụ liên quan đến việc tạo truyện, quản lý chương, phiên bản nháp và lịch đăng.
    -   **Interaction Service**: Quản lý hệ thống bình luận (inline/chapter), lượt thích, theo dõi và các tương tác xã hội.
    -   **Reader Service**: Tối ưu hóa việc truy xuất nội dung đọc, quản lý lịch sử đọc và đánh dấu trang (Bookmark).
    -   **Payment Service**: Xử lý ví tiền ảo (Coin), giao dịch mở khóa chương và quyết toán doanh thu.
4.  **AI Intelligence Service**: Phân hệ xử lý thông minh tách biệt, sử dụng Vector Database để lưu trữ kiến thức truyện, phục vụ tính năng trợ lý sáng tác và kiểm duyệt nội dung tự động dựa trên học máy.
5.  **Infrastructure Layers (Hạ tầng dữ liệu)**:
    -   **PostgreSQL**: Cơ sở dữ liệu quan hệ chính cho các dữ liệu cần tính nhất quán cao.
    -   **MongoDB**: Lưu trữ các dữ liệu phi cấu trúc như nhật ký hoạt động (logs) và các phiên bản nháp chương truyện.
    -   **Redis**: Bộ nhớ đệm (caching) giúp tăng tốc độ tải các thông tin truy cập thường xuyên như xếp hạng (Ranking) và phiên đăng nhập.

### 2.2 Sơ đồ phân rã chức năng (Functional Tree)
*(Sẽ được bổ sung bởi thành viên phụ trách)*

### 2.3 Biểu đồ Use Case tổng quát
*(Sẽ được bổ sung bởi thành viên phụ trách)*

### 2.4 Danh sách các tác nhân (Actors)
Hệ thống Ephurin bao gồm các nhóm tác nhân chính sau:
*   **Guest**: Người dùng vãng lai, có quyền xem danh sách truyện và đọc các chương miễn phí.
*   **Reader**: Độc giả đã đăng ký, tập trung trải nghiệm trên Mobile với các tính năng cá nhân hóa và tương tác.
*   **Author**: Tác giả, tập trung trên Web để sáng tác và quản lý tác phẩm.
*   **Admin/Editor**: Quản trị viên và Biên tập viên chịu trách nhiệm vận hành và kiểm duyệt.
*   **AI Service**: Tác nhân hệ thống hỗ trợ xử lý dữ liệu và trợ lý sáng tác.

### 2.5 Ma trận phân quyền (Permission Matrix)
*(Sẽ được bổ sung bởi thành viên phụ trách)*


## CHƯƠNG III: YÊU CẦU DỮ LIỆU & QUY TRÌNH

### 3.1 Sơ đồ thực thể liên kết (ERD)
Hệ thống sử dụng cơ sở dữ liệu quan hệ (PostgreSQL) để quản lý thông tin có cấu trúc chặt chẽ và MongoDB cho dữ liệu phi cấu trúc. Dưới đây là mô hình thực thể liên kết cho các thành phần cốt lõi:

```mermaid
erDiagram
    USER ||--o{ NOVEL : "sáng tác"
    USER ||--o{ COMMENT : "viết"
    USER ||--o{ TRANSACTION : "thực hiện"
    USER ||--o{ READING_HISTORY : "có"
    
    NOVEL ||--o{ CHAPTER : "bao gồm"
    NOVEL ||--o{ TAG : "có"
    NOVEL }|--|| GENRE : "thuộc"
    
    CHAPTER ||--o{ COMMENT : "có"
    CHAPTER ||--o{ UNLOCK_RECORD : "được mở khóa"
    
    USER {
        int id PK
        string username
        string email
        string password_hash
        string role "READER/AUTHOR/ADMIN"
        decimal coin_balance
        date birth_date
        datetime created_at
    }
    
    NOVEL {
        int id PK
        string title
        string description
        string cover_url
        int author_id FK
        int genre_id FK
        string status "ONGOING/COMPLETED"
        string age_rating "ALL/13+/16+/18+"
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
```

#### Từ điển dữ liệu tóm tắt
- **USER**: Lưu trữ thông tin định danh, vai trò và số dư ví (Coin).
- **NOVEL**: Thông tin tổng quan về tác phẩm, tác giả và trạng thái kiểm duyệt.
- **CHAPTER**: Nội dung chi tiết các chương truyện, hỗ trợ thiết lập thu phí (Premium).
- **TRANSACTION**: Nhật ký giao dịch tài chính (Nạp tiền, Mua chương, Donate).

### 3.2 Các luồng quy trình chính (Workflow)

#### 3.2.1 Quy trình Đăng ký & Xác thực (JWT)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Tài khoản)*

#### 3.2.2 Quy trình Sáng tác & Xuất bản (Draft -> Pending -> Published)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Tác giả)*

#### 3.2.3 Quy trình AI hỗ trợ metadata (Gợi ý Tag/Thể loại)
Đây là quy trình đặc trưng của Ephurin, giúp chuẩn hóa nội dung ngay từ bước đầu:
1.  **Gửi yêu cầu**: Khi tác giả soạn thảo xong nội dung chương hoặc mô tả truyện, hệ thống gửi văn bản về AI Service.
2.  **Trích xuất đặc trưng**: AI sử dụng mô hình NLP (PhoBERT/Transformer) để phân tích từ khóa, ngữ cảnh và văn phong.
3.  **Phân loại & Gợi ý**:
    -   AI so sánh với bộ Taxonomy (thể loại/tag) hiện có để đưa ra Top 5 gợi ý phù hợp nhất.
    -   Phát hiện các chủ đề nhạy cảm để cảnh báo gắn tag độ tuổi (Age Rating).
4.  **Phản hồi & Lựa chọn**: Tác giả xem danh sách gợi ý và chọn áp dụng vào tác phẩm. Kết quả này giúp tăng độ chính xác khi độc giả tìm kiếm.

#### 3.2.4 Quy trình Kiểm duyệt nội dung (Admin Review)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Quản trị)*

## CHƯƠNG IV: ĐẶC TẢ CHI TIẾT CÁC YÊU CẦU CHỨC NĂNG

### 4.1 Module 1: Quản lý Tài khoản & Hồ sơ (User Management)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Tài khoản)*

### 4.2 Module 2: Quản lý Tác phẩm (Novel Management - Web)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Tác giả)*

### 4.3 Module 3: Module AI thông minh (AI Story Assistant)
Module này là điểm nhấn công nghệ của Ephurin, hỗ trợ tối ưu hóa quy trình sáng tác và kiểm duyệt.

#### UC-AI-01: Tự động phân loại thể loại truyện
-   **Objective**: Sử dụng model PhoBERT để phân loại thể loại dựa trên nội dung tóm tắt.
-   **Actor**: Tác giả, Hệ thống AI.
-   **Trigger**: Tác giả hoàn tất bản tóm tắt (Synopsis) và nhấn "Gợi ý thể loại".
-   **Kịch bản chi tiết**:
    1.  Tác giả nhập nội dung mô tả tác phẩm.
    2.  Hệ thống AI xử lý văn bản, trích xuất vector đặc trưng.
    3.  Model trả về xác suất cho các thể loại (Tiên hiệp, Kiếm hiệp, Ngôn tình...).
    4.  Hệ thống hiển thị kết quả có độ tin cậy cao nhất cho tác giả.

#### UC-AI-02: Gợi ý Tag và Tiêu đề
-   **Objective**: Trích xuất các từ khóa (Tags) nổi bật và gợi ý tiêu đề thu hút dựa trên nội dung chương.
-   **Actor**: Tác giả.
-   **Trigger**: Soạn thảo xong chương truyện hoặc cập nhật mô tả.
-   **Hành động**: AI liệt kê danh sách Tags (Ví dụ: #Hệ_thống, #Vô_địch) để tác giả chọn nhanh.

#### UC-AI-03: Phân tích văn phong và độ dài chương
-   **Objective**: Cảnh báo nếu chương quá ngắn hoặc có sự thay đổi văn phong đột ngột (phát hiện đạo văn hoặc thay đổi tác giả).
-   **Actor**: Tác giả, Quản trị viên.

### 4.4 Module 4: Trải nghiệm Đọc (Reading Features - Mobile)
Phân hệ này tập trung vào việc tối ưu hóa giao diện và tính năng hỗ trợ độc giả trong quá trình thưởng thức tác phẩm.

#### UC-RD-01: Cá nhân hóa giao diện đọc
- **Objective:** Độc giả có thể thay đổi font chữ, kích thước, màu nền (Dark/Light mode) để phù hợp với sở thích và môi trường.
- **Actor:** Reader
- **Trigger:** Nhấn vào biểu tượng "Cài đặt hiển thị" trong màn hình đọc.
- **Pre-condition:** Đang ở trong màn hình đọc truyện.
- **Post-condition:** Cài đặt được áp dụng ngay lập tức và lưu lại cho lần đọc sau.
- **Kịch bản chi tiết:**
  | Bước | Basic Flow | Exception Flow |
  | :--- | :--- | :--- |
  | 1 | Hệ thống hiển thị bảng tùy chỉnh (Font, Size, Background). | |
  | 2 | Người dùng kéo slider để chỉnh cỡ chữ hoặc chọn màu nền. | |
  | 3 | Hệ thống cập nhật CSS/Theme trực tiếp trên màn hình đọc. | |
  | 4 | Hệ thống lưu thông tin cấu hình. | Lỗi lưu trữ: Hiển thị thông báo không thể đồng bộ cài đặt. |

#### UC-RD-02: Tìm kiếm, Lọc truyện nâng cao
- **Objective:** Cho phép tìm kiếm tác phẩm theo từ khóa, thể loại, tình trạng, và các bộ lọc kết hợp.
- **Actor:** Reader, Guest
- **Trigger:** Truy cập thanh tìm kiếm hoặc trang danh mục.
- **Post-condition:** Hiển thị danh sách truyện phù hợp, sắp xếp theo độ liên quan/lượt xem.
- **Kịch bản chi tiết:**
  | Bước | Basic Flow | Alternative Flow |
  | :--- | :--- | :--- |
  | 1 | Người dùng nhập từ khóa và chọn các tiêu chí lọc (Thể loại, Tình trạng). | |
  | 2 | Hệ thống gửi request lọc đến Backend. | Nếu không có từ khóa, chỉ lọc theo tiêu chí sẵn có. |
  | 3 | Backend trả về danh sách kết quả. | Nếu không tìm thấy: Báo "Không có kết quả" và gợi ý truyện phổ biến. |
  | 4 | Hệ thống hiển thị kết quả (dạng List/Grid). | |

### 4.5 Module 5: Tương tác & Cộng đồng
Phân hệ này xây dựng không gian tương tác giữa độc giả với nhau và giữa độc giả với tác giả.

#### UC-IN-01: Bình luận (theo chương/đoạn)
- **Objective:** Cho phép độc giả để lại bình luận tại một chương hoặc một đoạn văn bản cụ thể (Inline comment).
- **Actor:** Reader
- **Trigger:** Bôi đen đoạn văn bản hoặc cuộn xuống cuối chương và chọn "Bình luận".
- **Pre-condition:** Đã đăng nhập.
- **Post-condition:** Bình luận được hiển thị công khai hoặc đưa vào diện chờ duyệt.

#### UC-IN-02: Like và Bookmark
- **Objective:** Đánh dấu lưu lại truyện (Bookmark) hoặc thích (Like) để tăng độ phổ biến.
- **Actor:** Reader
- **Trigger:** Nhấn nút "Thêm vào tủ sách" (Bookmark) hoặc "Thích" (Like).
- **Pre-condition:** Đã đăng nhập.
- **Post-condition:** Tác phẩm thêm vào Tủ sách cá nhân; lượt Like tăng.

#### UC-IN-03: Theo dõi tác giả & Thông báo đẩy
- **Objective:** Nhận thông báo khi tác giả yêu thích ra chương mới.
- **Actor:** Reader
- **Trigger:** Nhấn "Theo dõi" tại trang hồ sơ tác giả.
- **Post-condition:** Hệ thống tự động đẩy thông báo (Push Notification) đến thiết bị khi có update.

### 4.6 Module 6: Quản trị & Thống kê (Admin Dashboard)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Quản trị)*

## CHƯƠNG V: THIẾT KẾ GIAO DIỆN (UI/UX)

### 5.1 Sơ đồ điều hướng (Sitemap & Screen Flow)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Quản trị)*

### 5.2 Mockups giao diện Web (Author & Admin)
*(Sẽ được bổ sung bởi thành viên phụ trách Module Tác giả)*

### 5.3 Mockups giao diện Mobile (Reader App)
Giao diện Mobile được thiết kế tối ưu cho trải nghiệm đọc lâu dài với các màn hình chính:

*   **Màn hình Home:** Hiển thị banner đề cử, các tác phẩm đang thịnh hành (top trending) và danh sách "Tiếp tục đọc" giúp người dùng quay lại nhanh chóng.
    <br>![Màn hình Home](<./images/Màn hình Home.png>)
*   **Màn hình Khám phá & Lọc:** Cung cấp thanh tìm kiếm thông minh, danh mục thể loại phong phú và các bộ lọc nâng cao theo trạng thái/độ dài.
    <br>![Màn hình Khám phá](<./images/Màn hình Khám phá.png>)
*   **Màn hình Chi tiết truyện:** Chứa thông tin tổng quan, tóm tắt nội dung, danh sách chương và các bài đánh giá từ cộng đồng.
    <br>![Màn hình Chi tiết truyện](<./images/Màn hình Chi tiết truyện.png>)
*   **Màn hình Đọc truyện (Reader View):** Nội dung chương truyện với khả năng tùy chỉnh font, nền. Tích hợp tính năng bình luận theo dòng (inline comment).
    <br>![Màn hình Đọc truyện](<./images/Màn hình Đọc truyện (Reader View).png>)
*   **Màn hình Tủ sách (Thư viện):** Quản lý các truyện đã Bookmark và lịch sử đọc cá nhân.
    <br>![Màn hình Tủ sách](<./images/Màn hình Tủ sách.png>)
*   **Màn hình Hồ sơ Tác giả:** Hiển thị thông tin tác giả, danh sách tác phẩm sáng tác và nút "Theo dõi" để nhận thông báo.
    <br>![Màn hình Hồ sơ Tác giả](<./images/Màn hình Hồ sơ Tác giả.png>)

## CHƯƠNG VI: CÁC YÊU CẦU PHI CHỨC NĂNG

### 6.1 Hiệu năng (Performance)
- **Thời gian phản hồi**: Các tác vụ đọc truyện và tìm kiếm phải phản hồi dưới 2 giây.
- **Khả năng chịu tải**: Hệ thống đảm bảo phục vụ 10,000 người dùng đồng thời (Concurrent Users) thông qua cơ chế Auto-scaling.
- **Tối ưu hóa AI**: Các yêu cầu phân tích AI (NLP) không được treo quá 5 giây/request.

### 6.2 Bảo mật (Security)
- **Xác thực**: Sử dụng cơ chế JWT với thời gian hết hạn ngắn và Refresh Token để đảm bảo an toàn.
- **Mã hóa**: Toàn bộ mật khẩu người dùng phải được băm bằng thuật toán bcrypt. Dữ liệu giao dịch được mã hóa AES-256.
- **Phân quyền**: Áp dụng chặt chẽ mô hình RBAC để ngăn chặn truy cập trái phép vào trang quản trị.

### 6.3 Độ tin cậy (Reliability)
- **Sao lưu**: Tự động backup dữ liệu hàng ngày (Daily Backup) và lưu trữ đa vùng.
- **Uptime**: Cam kết thời gian hoạt động của hệ thống đạt 99.9%.

## PHỤ LỤC

### Phụ lục A: Danh mục mã lỗi hệ thống
*(Sẽ được bổ sung sau)*

### Phụ lục B: Dataset & Phương pháp huấn luyện AI

