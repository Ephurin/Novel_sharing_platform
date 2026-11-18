# CHƯƠNG 3. PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG

> **Đề tài:** Xây dựng nền tảng chia sẻ và sáng tác tiểu thuyết trực tuyến tích hợp trí tuệ nhân tạo – Ephurin.  
> **Nguồn kiểm chứng tính năng:** mã nguồn nhánh `main`, commit `18182745efcfe99842c4d29b0dd413ade214c42b`, khảo sát ngày 18/11/2026.  
> **Vị trí lưu tài liệu:** nhánh `backup-remote-mixed`; nhánh lưu trữ **không** được sử dụng làm căn cứ kết luận về các tính năng đã triển khai.  
> **Quy ước:** Sơ đồ được viết bằng Mermaid để có thể xem ngay trên GitHub hoặc xuất SVG/PNG. Các biểu đồ lớp và ERD thể hiện **mô hình phân tích đã giản lược**, không sao chép tất cả trường dữ liệu. Phân hệ AI chỉ được mô tả theo những thành phần/API kiểm tra được trong `main`. Những liên kết chức năng thể hiện quan hệ nghiệp vụ, không mặc nhiên là khóa ngoại vật lý.


> **Xem sơ đồ riêng khi GitHub báo “Unable to render rich display”:** [Kiến trúc và Use Case](./chuong-3-so-do/01-kien-truc-use-case.md) · [Biểu đồ lớp](./chuong-3-so-do/02-bieu-do-lop.md) · [Sơ đồ ERD](./chuong-3-so-do/03-erd.md) · [Biểu đồ tuần tự](./chuong-3-so-do/04-bieu-do-tuan-tu.md) · [Hoạt động, trạng thái và triển khai](./chuong-3-so-do/05-hoat-dong-trang-thai-trien-khai.md). Các sơ đồ trong file chính vẫn giữ nguyên dạng mã Mermaid và đã được chuẩn hóa. 

## 3.1. Kiến trúc tổng thể hệ thống

### 3.1.1. Phạm vi phân tích và nguyên tắc thiết kế

Ephurin là nền tảng kết hợp sáng tác, công bố và đọc tiểu thuyết trực tuyến. Hệ thống được chia theo những nhóm chức năng tương ứng với hoạt động của **khách truy cập (Guest)**, **độc giả (Reader)**, **tác giả (Author)** và **quản trị viên (Admin)**. Trong phạm vi đồ án, các nghiệp vụ quản lý tài khoản, tác phẩm, chương truyện, tương tác, đọc truyện, ví Coin mô phỏng và quản trị được xử lý bởi ứng dụng backend. Dịch vụ AI hỗ trợ tác giả quản lý thông tin truyện và đưa ra đề xuất liên quan đến nội dung sáng tác.

Từ mã nguồn nhánh `main`, hệ thống có ba lớp ứng dụng chính:

1. **Lớp trình bày:** ứng dụng web React/Vite dành cho tác giả, quản trị và những giao diện web được triển khai; ứng dụng di động React Native/Expo phục vụ đọc truyện.
2. **Lớp xử lý nghiệp vụ:** backend Node.js/TypeScript/Express được tổ chức theo mô hình *Modular Monolith*. Các module có trách nhiệm riêng nhưng cùng thuộc một ứng dụng backend. Phân hệ AI chuyên sâu chạy bằng Python/FastAPI và được tích hợp qua API.
3. **Lớp dữ liệu:** PostgreSQL cho dữ liệu nghiệp vụ quan hệ và dữ liệu narrative, MongoDB cho một số loại dữ liệu document; PostgreSQL có phần mở rộng pgvector phục vụ bộ nhớ ngữ nghĩa của AI.

Không mô tả Ephurin như một hệ thống gồm nhiều microservice nghiệp vụ độc lập: ở `main`, các module `auth`, `novels`, `reading`, `wallet`, `admin`, `content-control`… cùng được đăng ký trong `backend/src/app.ts`. Dịch vụ AI là một tiến trình triển khai riêng [M1], [M2].

### 3.1.2. Sơ đồ kiến trúc tổng thể

```mermaid
flowchart TB
    Guest["Khách truy cập"]
    Reader["Độc giả"]
    Author["Tác giả"]
    Admin["Quản trị viên"]
    subgraph Clients["Lớp giao diện"]
        WEB["Web React + Vite"]
        MOBILE["Mobile React Native + Expo"]
    end
    subgraph Backend["Backend Node.js / Express - Modular Monolith"]
        AUTH["Auth / Users"]
        NOVEL["Novels / Chapters / Revisions"]
        READING["Reading / Interactions"]
        WALLET["Wallet Coin mô phỏng"]
        CONTROL["Content Control / Admin"]
        GATEWAY["AI Gateway / Copilot"]
    end
    subgraph AI["Dịch vụ AI Python / FastAPI"]
        NARR["Narrative / Story Brain"]
        GENERATE["Writing / Analysis / Context"]
    end
    subgraph Storage["Tầng dữ liệu"]
        PG[("PostgreSQL")]
        MONGO[("MongoDB")]
        NVEC[("PostgreSQL narrative + pgvector")]
    end
    PROVIDER["LLM và Embedding Provider ngoài hệ thống"]
    Guest --> WEB
    Reader --> MOBILE
    Reader --> WEB
    Author --> WEB
    Admin --> WEB
    WEB --> AUTH
    WEB --> NOVEL
    WEB --> READING
    WEB --> WALLET
    WEB --> CONTROL
    WEB --> GATEWAY
    MOBILE --> AUTH
    MOBILE --> READING
    MOBILE --> WALLET
    GATEWAY --> NARR
    GATEWAY --> GENERATE
    NARR --> NVEC
    GENERATE --> NARR
    GENERATE --> PROVIDER
    AUTH --> PG
    NOVEL --> PG
    NOVEL --> MONGO
    READING --> PG
    READING --> MONGO
    WALLET --> PG
    CONTROL --> PG
    CONTROL --> MONGO
```

*Hình 3.1. Kiến trúc tổng thể của nền tảng Ephurin (tổng hợp từ [M1], [M2], [M3]).*

Hệ thống nhận yêu cầu của người dùng qua các giao diện phù hợp với chức năng và vai trò. Backend kiểm tra đầu vào, xác thực, phân quyền và điều phối tới module xử lý. Những nghiệp vụ thuần dữ liệu trả kết quả từ kho lưu trữ tương ứng. Các yêu cầu cần AI được chuyển tới AI Gateway, sau đó đến dịch vụ FastAPI để xử lý ngữ cảnh hoặc sinh kết quả. Kết quả AI mang tính đề xuất, không tự ý ghi đè dữ liệu chính thức đã được tác giả xác nhận.

### 3.1.3. Tổ chức module backend

Mã nguồn backend chia thành các nhóm module: `auth`, `users`, `novels`, `reading`, `interactions`, `wallet`, `content-control`, `admin`, `story-context`, `ai-copilot` và `ai`. Bên cạnh đó, hệ thống có module `media` phục vụ tài nguyên nội dung. Chức năng `ai` chứa lớp gateway và các cơ chế phối hợp với dịch vụ AI chuyên biệt; `ai-copilot` cung cấp một số thao tác hỗ trợ viết và gọi mô hình.

Ở cấp module, luồng xử lý phổ biến là: **Route → Middleware xác thực/kiểm tra dữ liệu → Controller → Service → Repository → Database**. Việc tách lớp hạn chế việc controller trực tiếp thực hiện thao tác dữ liệu và giúp cô lập các quy tắc nghiệp vụ. Trong `main`, có thể đối chiếu nguyên tắc này qua các thư mục `backend/src/modules/novels`, `backend/src/modules/wallet` và các module khác.

## 3.2. Xây dựng biểu đồ Use Case và các kịch bản

### 3.2.1. Xác định tác nhân, mức trừu tượng và các quan hệ

| Tác nhân | Mô tả | Phạm vi nghiệp vụ |
|---|---|---|
| Guest | Khách chưa đăng nhập | Tra cứu, xem thông tin và đọc nội dung công khai |
| Reader | Độc giả | Đọc, lưu vị trí, bình luận, theo dõi, đánh giá, dùng ví Coin |
| Author | Người sáng tác | Quản lý tác phẩm, bản thảo, dữ kiện truyện và AI Copilot |
| Admin | Người vận hành | Tài khoản, danh mục, kiểm duyệt và xử lý nghiệp vụ |
| LLM Provider | Dịch vụ ngoài | Được AI Service gọi, không trực tiếp sửa tác phẩm |

Các hình được tổ chức theo ba lớp: **(1) nhóm chức năng tổng quát**, **(2) mục tiêu nghiệp vụ/Use Case trừu tượng**, **(3) các Use Case cụ thể hoặc hành vi dùng chung**. Mô hình này loại bỏ cách đặt mọi thao tác ngang hàng và tránh nối cả hệ thống về Đăng nhập.

**Quy ước quan hệ trong sơ đồ:**

- **«include»**: Use Case gốc luôn thực hiện hành vi chung được bao gồm (mũi tên từ UC gốc đến UC được bao gồm).
- **«extend»**: UC bổ sung một hành vi tùy chọn có điều kiện vào một UC có thể hoàn thành độc lập (mũi tên từ UC mở rộng đến UC cơ sở).
- **«generalization»**: UC con là cách thực hiện chuyên biệt của một UC cha **trừu tượng** hoặc hành vi chung (mũi tên từ UC con về UC cha). UC cha ở đây dùng để phân cấp phân tích, không nhất thiết tồn tại như một API riêng.
- **Điều kiện tiên quyết / phụ thuộc dữ liệu**: Chỉ ghi trong kịch bản hoặc bảng phụ thuộc; ví dụ phải có truyện trước khi tạo chương. **Không** dùng «include» để thay thế quan hệ tồn tại dữ liệu, các bước điều hướng UI hay yêu cầu phải đăng nhập.

**Giới hạn hiển thị:** Mermaid flowchart có thể thể hiện elip và mũi tên có nhãn nhưng không tạo được đầy đủ ký pháp UML Use Case (đặc biệt đầu mũi tên tam giác rỗng của generalization). Quan hệ được ghi nhãn đúng *ngữ nghĩa*; khi cần bản chuẩn UML để nộp, có thể chuyển sang PlantUML hoặc Visual Paradigm.

### 3.2.2. Biểu đồ Use Case tổng quát

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    A["Author"]
    AD["Admin"]
    subgraph SYS["Hệ thống Ephurin"]
        U1(["Khám phá truyện công khai"])
        U2(["Đọc và quản lý thư viện"])
        U3(["Tương tác cộng đồng"])
        U4(["Sử dụng Coin mô phỏng"])
        U5(["Quản lý tác phẩm và chương"])
        U6(["Quản lý ngữ cảnh truyện"])
        U7(["Sáng tác với AI Copilot"])
        U8(["Quản trị và kiểm duyệt"])
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U3
    R --- U4
    A --- U5
    A --- U6
    A --- U7
    AD --- U8
```

*Hình 3.2. Biểu đồ Use Case tổng quát Ephurin.*

Sơ đồ tổng quát chỉ thể hiện các **nhóm mục tiêu chính**. Các UC con và các quan hệ bắt buộc, có điều kiện hoặc chuyên biệt hóa được trình bày trong hình 3.3–3.11. Việc một nhóm được thể hiện ở đây không có nghĩa mọi thao tác thành phần đều độc lập hoặc cùng mức trừu tượng.

### 3.2.3. Use Case của độc giả

#### a) Khám phá, đọc và quản lý dữ liệu đọc

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Khám phá và đọc truyện"]
        U1(["Tìm kiếm truyện"])
        U2(["Lọc kết quả tìm kiếm"])
        U3(["Xem thông tin tác phẩm"])
        U4(["Xem danh sách chương"])
        U5(["Đọc chương"])
        U6(["Kiểm tra quyền đọc"])
        U7(["Tùy chỉnh giao diện đọc"])
        U8(["Quản lý thư viện (trừu tượng)"])
        U9(["Thêm truyện vào thư viện"])
        U10(["Xóa truyện khỏi thư viện"])
        U11(["Lưu hoặc xem tiến độ đọc"])
        U12(["Quản lý dấu trang (trừu tượng)"])
        U13(["Tạo dấu trang"])
        U14(["Xem dấu trang"])
        U15(["Xóa dấu trang"])
    end
    G --- U1
    R --- U1
    G --- U3
    R --- U3
    G --- U4
    R --- U4
    G --- U5
    R --- U5
    R --- U7
    R --- U8
    R --- U11
    R --- U12
    U2 -.->|"«extend»: khi áp dụng bộ lọc"| U1
    U5 -.->|"«include»"| U6
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U13 -.->|"«generalization»"| U12
    U14 -.->|"«generalization»"| U12
    U15 -.->|"«generalization»"| U12
```

*Hình 3.3. Use Case tìm kiếm, đọc và quản lý thư viện/dấu trang.*

**Phân cấp:** Quản lý thư viện và Quản lý dấu trang là các ca sử dụng trừu tượng gom những biến thể trên cùng một tài nguyên; các thao tác thêm/xóa hoặc tạo/xem/xóa là chuyên biệt hóa. **Quan hệ bắt buộc:** Đọc chương luôn kiểm tra quyền truy cập theo trạng thái chương và quyền của người đọc. **Mở rộng:** Lọc chỉ phát sinh khi người dùng chọn bộ lọc trong quá trình tìm kiếm. Việc xem chi tiết truyện trước khi đọc chỉ là luồng điều hướng thông thường, không mặc nhiên là «include». Mã nguồn: `reading.routes.ts`, `reading.service.ts`.

#### b) Bình luận và tương tác cộng đồng

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Tương tác với tác phẩm"]
        U1(["Xem bình luận"])
        U2(["Gửi bình luận"])
        U3(["Trả lời bình luận"])
        U4(["Quản lý bình luận của mình (trừu tượng)"])
        U5(["Sửa bình luận"])
        U6(["Xóa bình luận"])
        U7(["Bày tỏ cảm xúc với bình luận"])
        U8(["Quản lý lượt thích truyện (trừu tượng)"])
        U9(["Thích truyện"])
        U10(["Bỏ thích truyện"])
        U11(["Theo dõi hoặc bỏ theo dõi tác giả"])
        U12(["Theo dõi hoặc bỏ theo dõi truyện"])
        U13(["Thiết lập thông báo truyện"])
        U14(["Đánh giá tác phẩm"])
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U4
    R --- U7
    R --- U8
    R --- U11
    R --- U12
    R --- U13
    R --- U14
    U3 -.->|"«generalization»"| U2
    U5 -.->|"«generalization»"| U4
    U6 -.->|"«generalization»"| U4
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
```

*Hình 3.4. Use Case bình luận, cảm xúc, theo dõi và đánh giá.*

**Phân cấp:** Trả lời là biến thể của gửi bình luận; sửa và xóa là những biến thể của mục tiêu trừu tượng quản lý bình luận của mình. Thích và bỏ thích là những biến thể cập nhật cùng một quan hệ. **Không gán sai phụ thuộc:** Theo dõi truyện và bật thông báo là hai API riêng; mã nguồn không bắt buộc người dùng phải tạo bản ghi follow trước khi thiết lập thông báo, vì vậy không dùng «include» giữa chúng. Xem bình luận cũng không bắt buộc phải phát sinh trước mọi thao tác gửi bình luận ở cấp service. Căn cứ: `comments.routes.ts`, `social.routes.ts`, `novel-engagement.service.ts`.

#### c) Ví Coin và quyền truy cập VIP

```mermaid
flowchart LR
    U["Tài khoản có quyền phù hợp"]
    subgraph SYS["Ví Coin mô phỏng"]
        U1(["Xem số dư ví"])
        U2(["Xem lịch sử giao dịch"])
        U3(["Xem gói nạp Coin"])
        U4(["Tạo phiên nạp mô phỏng"])
        U5(["Sử dụng số dư Coin (trừu tượng)"])
        U6(["Mở khóa chương VIP"])
        U7(["Ủng hộ tác giả bằng Coin"])
        U8(["Yêu cầu rút Coin"])
        U9(["Kiểm tra điều kiện sử dụng Coin"])
        U10(["Xem thông tin thu nhập"])
    end
    U --- U1
    U --- U2
    U --- U3
    U --- U4
    U --- U5
    U --- U10
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U8 -.->|"«generalization»"| U5
    U5 -.->|"«include»"| U9
```

*Hình 3.5. Use Case ví Coin mô phỏng với các biến thể sử dụng số dư.*

**Phân cấp:** Mở khóa, ủng hộ và gửi yêu cầu rút là các nghiệp vụ sử dụng số dư theo những cách khác nhau; đều có bước kiểm tra điều kiện xử lý tương ứng (quyền đã mở khóa, ví và số dư); riêng trường hợp chương đã mở khóa từ trước có thể trả kết quả mà không phát sinh giao dịch trừ Coin mới. Hình dùng lớp trừu tượng Sử dụng số dư Coin để diễn tả điểm chung, không khẳng định tồn tại một endpoint có tên như vậy. **Không gán «include»:** Tạo phiên nạp và xem lịch sử giao dịch không phải bước bắt buộc của việc mở khóa; thiếu Coin là trường hợp ngoại lệ hoặc một lần giao dịch khác. Giao dịch nạp thực tế không được mô tả vì đây là Coin mô phỏng. Căn cứ: `wallet.service.ts`, `wallet.repository.ts`.

### 3.2.4. Use Case của tác giả

#### a) Quản lý tác phẩm, chương và vòng đời công bố

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Tác phẩm, chương và bản thảo"]
        U1(["Quản lý tác phẩm (trừu tượng)"])
        U2(["Tạo tác phẩm"])
        U3(["Cập nhật tác phẩm"])
        U4(["Xóa tác phẩm"])
        U5(["Xem danh sách tác phẩm"])
        U6(["Gửi công bố tác phẩm"])
        U7(["Kiểm tra số chương hợp lệ"])
        U8(["Kiểm tra nội dung theo quy tắc"])
        U9(["Tạo chương truyện"])
        U10(["Lưu nội dung bản thảo"])
        U11(["Lưu revision"])
        U12(["Xem lịch sử revision"])
        U13(["Gửi công bố chương"])
        U14(["Sắp xếp chương"])
        U15(["Lên lịch hoặc hủy lịch công bố"])
        U16(["Lưu trữ hoặc khôi phục chương"])
        U17(["Xem thu nhập theo truyện"])
    end
    A --- U1
    A --- U5
    A --- U6
    A --- U9
    A --- U10
    A --- U12
    A --- U13
    A --- U14
    A --- U15
    A --- U16
    A --- U17
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U4 -.->|"«generalization»"| U1
    U6 -.->|"«include»"| U7
    U6 -.->|"«include»"| U8
    U13 -.->|"«include»"| U8
    U10 -.->|"«include»: khi lưu thay đổi nội dung"| U11
```

*Hình 3.6. Use Case tác giả với phân cấp tác phẩm và các bước công bố bắt buộc.*

**Phân cấp:** Tạo, sửa và xóa tác phẩm là các biến thể của nhóm quản lý tác phẩm. **«include» được kiểm chứng:** Gửi công bố *tác phẩm* bắt buộc kiểm tra số chương hợp lệ và kiểm tra nội dung; gửi công bố *chương* bắt buộc kiểm tra nội dung theo quy tắc. Trong `chapters.service.ts`, lưu thay đổi nội dung gọi chức năng snapshot revision; quan hệ từ Lưu nội dung bản thảo tới Lưu revision áp dụng cho **lưu thay đổi nội dung** (không áp dụng cho chỉ thay đổi giá/metadata). **Điều kiện tiên quyết, không phải «include»:** Tạo chương cần truyện đã tồn tại; gửi công bố truyện cần tối thiểu hai chương hợp lệ. Lên lịch chương là thao tác riêng, không phải bước luôn xảy ra khi xuất bản.

#### b) Quản lý ngữ cảnh tác phẩm thủ công

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Dữ kiện do tác giả quản lý"]
        U1(["Quản lý hồ sơ nhân vật (trừu tượng)"])
        U2(["Xem hồ sơ nhân vật"])
        U3(["Tạo nhân vật"])
        U4(["Sửa hoặc xóa nhân vật"])
        U5(["Quản lý quan hệ nhân vật (trừu tượng)"])
        U6(["Xem quan hệ nhân vật"])
        U7(["Tạo, sửa hoặc xóa quan hệ"])
        U8(["Quản lý sự kiện timeline (trừu tượng)"])
        U9(["Xem dòng thời gian"])
        U10(["Tạo, sửa hoặc xóa sự kiện"])
        U11(["Quản lý tóm tắt (trừu tượng)"])
        U12(["Xem tóm tắt"])
        U13(["Tạo, sửa hoặc xóa tóm tắt"])
        U14(["Đồng bộ Story Bible"])
    end
    A --- U1
    A --- U5
    A --- U8
    A --- U11
    A --- U14
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U4 -.->|"«generalization»"| U1
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U12 -.->|"«generalization»"| U11
    U13 -.->|"«generalization»"| U11
```

*Hình 3.7. Use Case quản lý ngữ cảnh thủ công với các ca sử dụng trừu tượng.*

**Phân cấp rõ ràng:** Bốn nhánh độc lập quản lý nhân vật, quan hệ, timeline và tóm tắt; mỗi nhánh có các thao tác chuyên biệt. Các nhánh cùng liên quan đến một truyện nhưng **không** phải bước bắt buộc của nhau. Chẳng hạn, tạo hồ sơ nhân vật không tự động bao gồm tạo sự kiện timeline. Đồng bộ Story Bible là thao tác riêng, không giả định mọi thay đổi hồ sơ tự động gọi đồng bộ. Nguồn: `story-context.routes.ts`.

### 3.2.5. Use Case hỗ trợ sáng tác bằng AI

#### a) Khởi tạo Story Brain và phê duyệt dữ kiện

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Story Brain và phê duyệt đề xuất"]
        U1(["Khởi tạo Story Brain (trừu tượng)"])
        U2(["Khởi tạo từ ý tưởng"])
        U3(["Khởi tạo từ bản thảo"])
        U4(["Theo dõi trạng thái job"])
        U5(["Rà soát dữ kiện Story Brain (trừu tượng)"])
        U6(["Xem hàng đợi review"])
        U7(["Rà soát thực thể"])
        U8(["Hợp nhất thực thể trùng"])
        U9(["Ra quyết định về đề xuất (trừu tượng)"])
        U10(["Chấp nhận đề xuất"])
        U11(["Sửa và chấp nhận"])
        U12(["Từ chối đề xuất"])
        U13(["Kiểm tra quyền và trạng thái đề xuất"])
        U14(["Kích hoạt baseline"])
        U15(["Xem bộ nhớ đã phê duyệt"])
    end
    A --- U1
    A --- U4
    A --- U5
    A --- U9
    A --- U14
    A --- U15
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U8 -.->|"«extend»: khi phát hiện thực thể trùng"| U7
    U10 -.->|"«generalization»"| U9
    U11 -.->|"«generalization»"| U9
    U12 -.->|"«generalization»"| U9
    U9 -.->|"«include»"| U13
```

*Hình 3.8. Use Case Story Brain với các biến thể khởi tạo, rà soát và quyết định.*

**Phân cấp:** Khởi tạo từ ý tưởng và từ bản thảo là hai biến thể của cùng mục tiêu tạo Story Brain. Chấp nhận, chỉnh sửa–chấp nhận và từ chối là các biến thể quyết định về đề xuất, không phải ba thao tác bắt buộc trong một lần review. Cả ba nhánh đều được kiểm tra quyền và trạng thái đề xuất; kiểm tra **brain version** là yêu cầu riêng trên nhánh chấp nhận (và một số quyết định nhóm), không áp dụng như bước bắt buộc của mọi lần từ chối. **«extend»:** Hợp nhất thực thể chỉ xuất hiện trong quá trình rà soát thực thể khi phát hiện trùng danh tính. **Điều kiện tiên quyết:** Kích hoạt baseline cần kết quả chuẩn bị/rà soát phù hợp; không «include» thao tác khởi tạo mỗi lần kích hoạt. Căn cứ: `ai-gateway.routes.ts`, `narrative_service.py`.

#### b) AI hỗ trợ viết và quản lý kế hoạch

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["AI Copilot trong quy trình viết"]
        U1(["Yêu cầu sinh bản thảo AI"])
        U2(["Chuẩn bị ngữ cảnh đầu vào"])
        U3(["Xem bản thảo AI đã tạo"])
        U4(["Áp dụng kết quả vào bản thảo"])
        U5(["Bỏ qua kết quả"])
        U6(["Xem trước ngữ cảnh"])
        U7(["Phân tích lại chương đã lưu"])
        U8(["Xem tiến độ trích xuất"])
        U9(["Gửi đề xuất dữ kiện thủ công"])
        U10(["Đề nghị chỉnh sửa sự kiện"])
        U11(["Quản lý quy tắc thế giới"])
        U12(["Quản lý kế hoạch truyện (trừu tượng)"])
        U13(["Tạo kế hoạch"])
        U14(["Sửa mục tiêu kế hoạch"])
        U15(["Kích hoạt kế hoạch"])
        U16(["Yêu cầu brainstorm"])
    end
    A --- U1
    A --- U3
    A --- U6
    A --- U7
    A --- U8
    A --- U9
    A --- U10
    A --- U11
    A --- U12
    A --- U16
    U1 -.->|"«include»"| U2
    U4 -.->|"«extend»: khi tác giả chấp nhận"| U3
    U5 -.->|"«extend»: khi tác giả bỏ qua"| U3
    U13 -.->|"«generalization»"| U12
    U14 -.->|"«generalization»"| U12
    U15 -.->|"«generalization»"| U12
```

*Hình 3.9. Use Case AI Copilot với ngữ cảnh bắt buộc và các lựa chọn hậu sinh.*

**«include»:** Yêu cầu AI viết cần bước chuẩn bị ngữ cảnh đầu vào từ tác phẩm/văn bản hiện hành, ngay cả khi bộ nhớ semantic tùy cấu hình chưa được bật. **«extend»:** Sau khi xem bản thảo sinh, tác giả có thể áp dụng hoặc bỏ qua; hai hành động này chỉ phát sinh theo quyết định của tác giả. **«generalization»:** Tạo, sửa và kích hoạt là các thao tác chuyên biệt đối với kế hoạch truyện. **Không «include»:** Xem trước ngữ cảnh là tùy chọn của tác giả, không phải thao tác giao diện bắt buộc trước mỗi yêu cầu sinh. Kích hoạt kế hoạch cần một kế hoạch hợp lệ đã tồn tại. Nguồn: `ai-gateway.routes.ts`, `writing_service.py`.

### 3.2.6. Use Case của quản trị viên

#### a) Kiểm duyệt và xử lý nội dung

```mermaid
flowchart LR
    AD["Admin có quyền kiểm duyệt"]
    subgraph SYS["Kiểm duyệt và xử lý báo cáo"]
        U1(["Xem danh sách review"])
        U2(["Xem chi tiết yêu cầu review"])
        U3(["Xem bằng chứng kiểm duyệt"])
        U4(["Ra quyết định kiểm duyệt (trừu tượng)"])
        U5(["Phê duyệt nội dung"])
        U6(["Từ chối nội dung"])
        U7(["Kiểm tra trạng thái và quyền xử lý"])
        U8(["Quản lý báo cáo (trừu tượng)"])
        U9(["Xem báo cáo vi phạm"])
        U10(["Giải quyết báo cáo vi phạm"])
        U11(["Quản lý trạng thái truyện (trừu tượng)"])
        U12(["Gỡ truyện"])
        U13(["Khôi phục truyện"])
        U14(["Xem chi tiết truyện hoặc chương"])
    end
    AD --- U1
    AD --- U2
    AD --- U3
    AD --- U4
    AD --- U8
    AD --- U11
    AD --- U14
    U5 -.->|"«generalization»"| U4
    U6 -.->|"«generalization»"| U4
    U4 -.->|"«include»"| U7
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U12 -.->|"«generalization»"| U11
    U13 -.->|"«generalization»"| U11
```

*Hình 3.10. Use Case kiểm duyệt với quyết định chấp nhận hoặc từ chối.*

**Phân cấp quyết định:** Phê duyệt và từ chối là hai biến thể loại trừ của mục tiêu giải quyết review; **không** dùng «include» bởi một lần xử lý không thực hiện cả hai. Backend luôn kiểm tra quyền, trạng thái review và điều kiện hợp lệ trước khi ghi quyết định, nên mô hình hóa phần kiểm tra chung bằng «include». Xem hàng đợi/chi tiết hỗ trợ thao tác UI, nhưng không được áp thành «include» bắt buộc khi một API xử lý có thể nhận trực tiếp ID review. Nguồn: `content-control.service.ts`, `admin.service.ts`.

#### b) Quản trị tài khoản, phân loại và Coin

```mermaid
flowchart LR
    AD["Admin có quyền tương ứng"]
    subgraph SYS["Quản trị và vận hành"]
        U1(["Xem danh sách người dùng"])
        U2(["Quản lý trạng thái tài khoản (trừu tượng)"])
        U3(["Khóa tài khoản"])
        U4(["Mở khóa tài khoản"])
        U5(["Xem danh sách truyện"])
        U6(["Quản lý phân loại (trừu tượng)"])
        U7(["Thêm thể loại"])
        U8(["Thêm tag"])
        U9(["Xem yêu cầu rút Coin"])
        U10(["Giải quyết yêu cầu rút Coin (trừu tượng)"])
        U11(["Phê duyệt rút Coin"])
        U12(["Từ chối rút Coin"])
        U13(["Xem thống kê vận hành"])
    end
    AD --- U1
    AD --- U2
    AD --- U5
    AD --- U6
    AD --- U9
    AD --- U10
    AD --- U13
    U3 -.->|"«generalization»"| U2
    U4 -.->|"«generalization»"| U2
    U7 -.->|"«generalization»"| U6
    U8 -.->|"«generalization»"| U6
    U11 -.->|"«generalization»"| U10
    U12 -.->|"«generalization»"| U10
```

*Hình 3.11. Use Case quản trị với các biến thể khóa, mở khóa và duyệt yêu cầu rút Coin.*

**Phân cấp:** Khóa/mở khóa tài khoản là các biến thể thay đổi trạng thái; thêm thể loại/tag là hai hình thức cập nhật danh mục; chấp thuận/từ chối rút Coin là hai kết quả lựa chọn của nghiệp vụ duyệt rút. **Điều kiện tiên quyết:** Mở khóa chỉ có nghĩa với tài khoản đang bị khóa; xử lý yêu cầu rút cần yêu cầu đang chờ và quyền finance. Xem danh sách không phải là một bước «include» của thao tác thay đổi trạng thái, vì API có thể được gọi khi đã biết ID. Nguồn: `admin.routes.ts`, `admin.service.ts`.

### 3.2.7. Mô tả kịch bản các ca sử dụng chính

#### UC-01. Đăng nhập

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Người dùng có tài khoản |
| Mục đích | Xác thực và thiết lập phiên làm việc |
| Điều kiện trước | Tài khoản đã tồn tại, người dùng cung cấp thông tin đăng nhập |
| Kích hoạt | Gửi yêu cầu đăng nhập |
| Luồng chính | (1) Nhập định danh và mật khẩu; (2) API kiểm tra dữ liệu; (3) Auth Service tìm tài khoản; (4) so khớp mật khẩu và trạng thái; (5) phát hành access token và refresh token; (6) trả thông tin phiên |
| Luồng ngoại lệ | Sai thông tin, tài khoản không được phép hoạt động, yêu cầu không hợp lệ |
| Điều kiện sau | Người dùng có phiên hợp lệ; refresh token được quản lý để phục vụ làm mới hoặc thu hồi |

#### UC-02. Gửi công bố chương truyện

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Author |
| Mục đích | Chuyển chương đã biên tập sang trạng thái xuất bản thích hợp |
| Điều kiện trước | Người dùng đăng nhập, có quyền sở hữu truyện; chương có nội dung |
| Kích hoạt | Chọn gửi công bố chương |
| Luồng chính | (1) Kiểm tra quyền và trạng thái chương; (2) lấy bản thảo cần công bố; (3) chạy kiểm tra nội dung theo quy tắc; (4a) nếu không cần review thì cập nhật chương công bố; (4b) nếu cần review thì chuyển sang chờ kiểm duyệt |
| Luồng ngoại lệ | Chương không tồn tại, không có quyền, nội dung trống, trạng thái không hợp lệ |
| Điều kiện sau | Chương được công bố hoặc được đưa vào hàng đợi kiểm duyệt |

#### UC-03. Sinh bản thảo bằng AI và xem xét kết quả

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Author |
| Mục đích | Nhận kết quả hỗ trợ viết từ dịch vụ AI dựa trên thông tin truyện |
| Điều kiện trước | Tác giả có quyền thao tác với truyện/chương và yêu cầu hợp lệ |
| Kích hoạt | Yêu cầu tạo bản thảo hoặc gợi ý nội dung |
| Luồng chính | (1) Gateway xác thực phạm vi; (2) AI Service xây dựng ngữ cảnh; (3) gọi mô hình được cấu hình; (4) nhận và kiểm tra kết quả; (5) trả bản thảo/đề xuất; (6) tác giả xem và quyết định áp dụng hoặc bỏ qua |
| Luồng ngoại lệ | Provider không khả dụng, vượt giới hạn, job lỗi, phiên bản chương thay đổi, đề xuất bị từ chối |
| Điều kiện sau | Kết quả được ghi nhận theo vòng đời tương ứng; chỉ hành động chấp nhận hợp lệ mới cập nhật dữ liệu bản thảo/chính thức |

#### UC-04. Mở khóa chương VIP bằng Coin

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Reader |
| Mục đích | Được phép đọc một chương yêu cầu Coin |
| Điều kiện trước | Người dùng đã đăng nhập; chương tồn tại, có yêu cầu mở khóa |
| Kích hoạt | Chọn mở khóa chương |
| Luồng chính | (1) Gửi yêu cầu; (2) kiểm tra quyền và tình trạng đã mở khóa; (3) xác định giá Coin; (4) kiểm tra số dư; (5) thực hiện transaction ghi giảm/tăng số dư theo nghiệp vụ và ghi ledger/mở khóa; (6) trả kết quả |
| Luồng ngoại lệ | Không đủ Coin, chương không hợp lệ, giao dịch thất bại, yêu cầu lặp |
| Điều kiện sau | Quyền truy cập được ghi nhận và giao dịch nhất quán, hoặc không phát sinh thay đổi khi thất bại |

#### UC-05. Xử lý yêu cầu kiểm duyệt

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Admin |
| Mục đích | Đưa ra quyết định đối với nội dung cần kiểm duyệt |
| Điều kiện trước | Đăng nhập với vai trò quản trị; có yêu cầu review hợp lệ |
| Kích hoạt | Mở danh sách kiểm duyệt và chọn một mục |
| Luồng chính | (1) Xem nội dung và bằng chứng; (2) lựa chọn quyết định; (3) backend kiểm tra quyền, trạng thái và ghi quyết định; (4) cập nhật trạng thái nội dung liên quan; (5) trả kết quả |
| Luồng ngoại lệ | Review đã xử lý, thiếu quyền hoặc trạng thái không hợp lệ |
| Điều kiện sau | Yêu cầu kiểm duyệt và đối tượng liên quan phản ánh quyết định mới |

#### UC-06. Đọc và lưu dấu trang

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Reader |
| Mục đích | Đọc chương được phép truy cập và lưu một vị trí trong văn bản |
| Điều kiện trước | Chương tồn tại; người dùng đã đăng nhập để lưu dấu trang |
| Luồng chính | (1) Mở truyện và chương; (2) chọn vị trí; (3) yêu cầu lưu dấu trang; (4) hệ thống kiểm tra dữ liệu và ghi dấu trang |
| Ngoại lệ | Chương VIP chưa được mở khóa; vị trí không hợp lệ; yêu cầu lưu thất bại |
| Điều kiện sau | Dấu trang có thể tra cứu ở lần đọc sau |

#### UC-07. Tạo phiên bản chương truyện

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Author |
| Mục đích | Lưu một revision để truy vết nội dung |
| Điều kiện trước | Tác giả có quyền chỉnh sửa chương và bản thảo hợp lệ |
| Luồng chính | (1) Mở và sửa bản thảo; (2) yêu cầu lưu/snapshot; (3) backend kiểm tra phiên bản và quyền ghi; (4) ghi revision kèm mã băm nội dung |
| Ngoại lệ | Xung đột phiên bản, sai quyền sở hữu hoặc lỗi lưu |
| Điều kiện sau | Revision xuất hiện trong lịch sử chương |

#### UC-08. Khởi tạo Story Brain từ bản thảo

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Author |
| Mục đích | Xây dựng dữ kiện ngữ cảnh từ bản thảo |
| Điều kiện trước | Tác giả có quyền với truyện và có nguồn nội dung hợp lệ |
| Luồng chính | (1) Tạo yêu cầu bootstrap; (2) hệ thống xử lý và tạo kết quả; (3) tác giả kiểm tra thực thể/đề xuất; (4) chấp nhận hoặc từ chối; (5) kích hoạt baseline khi hợp lệ |
| Ngoại lệ | Job lỗi, dữ liệu trùng, đề xuất không hợp lệ |
| Điều kiện sau | Dữ liệu đã duyệt được phân biệt với dữ liệu đang đề xuất |

#### UC-09. Đánh giá tác phẩm

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Reader |
| Mục đích | Cập nhật đánh giá cho truyện |
| Điều kiện trước | Đăng nhập và có quyền đánh giá |
| Luồng chính | (1) Mở thông tin truyện; (2) chọn mức đánh giá, có thể nhập nhận xét; (3) gửi và kiểm tra đầu vào; (4) ghi kết quả |
| Ngoại lệ | Thông tin không hợp lệ, thiếu quyền hoặc truyện không tồn tại |
| Điều kiện sau | Đánh giá được cập nhật hoặc giữ nguyên khi xử lý thất bại |

#### UC-10. Xử lý một yêu cầu kiểm duyệt

| Thuộc tính | Nội dung |
|---|---|
| Tác nhân | Admin có quyền kiểm duyệt |
| Mục đích | Giải quyết yêu cầu kiểm duyệt |
| Điều kiện trước | Review tồn tại và chưa hoàn tất |
| Luồng chính | (1) Xem hàng đợi; (2) chọn yêu cầu; (3) đọc nội dung và bằng chứng; (4) quyết định chấp nhận hoặc từ chối; (5) lưu quyết định và cập nhật trạng thái liên quan |
| Ngoại lệ | Thiếu quyền, trạng thái review không hợp lệ |
| Điều kiện sau | Review và trạng thái nội dung phản ánh quyết định |

### 3.2.8. Ma trận truy vết Use Case và mã nguồn

| Hình | Nhóm chức năng | Mã nguồn đối chiếu trên nhánh main |
|---|---|---|
| 3.3 | Khám phá và đọc | `backend/src/modules/reading/reading.routes.ts` |
| 3.4 | Bình luận và theo dõi | `backend/src/modules/interactions/comments.routes.ts`, `social.routes.ts`, `novel-engagement.routes.ts` |
| 3.5 | Ví Coin mô phỏng | `backend/src/modules/wallet/wallet.routes.ts` |
| 3.6 | Tác phẩm và chương | `backend/src/modules/novels/novels.routes.ts`, `chapters.routes.ts` |
| 3.7 | Ngữ cảnh tác phẩm | `backend/src/modules/story-context/story-context.routes.ts` |
| 3.8 | Story Brain và proposal | `backend/src/modules/ai/ai-gateway.routes.ts`, `ai-service/api/narrative_routes.py` |
| 3.9 | AI Writing Copilot | `backend/src/modules/ai/ai-gateway.routes.ts`, `ai-service/application/writing_service.py` |
| 3.10 | Kiểm duyệt | `backend/src/modules/content-control/content-control.routes.ts`, `backend/src/modules/admin/admin.routes.ts` |
| 3.11 | Quản trị và vận hành | `backend/src/modules/admin/admin.routes.ts` |

Sơ đồ phản ánh các khả năng nghiệp vụ có mã nguồn/route trên nhánh chính. Việc một API tồn tại **không đồng nghĩa** tất cả luồng end-to-end đã được kiểm thử thành công.

### 3.2.9. Đánh giá quan hệ phụ thuộc giữa các Use Case

| Quan hệ thực tế | Ví dụ của Ephurin | Cách biểu diễn và lý do |
|---|---|---|
| Hành vi bắt buộc được dùng chung | Công bố truyện và công bố chương đều quét nội dung | **«include» → Kiểm tra nội dung theo quy tắc**; mã nguồn thực sự gọi bước này trong luồng công bố |
| Hành vi bắt buộc theo dữ liệu | Công bố truyện cần kiểm tra tối thiểu số chương hợp lệ | **«include» → Kiểm tra số chương hợp lệ** |
| Hành vi xuất hiện theo lựa chọn | Lọc kết quả khi đang tìm kiếm truyện | **«extend» → Tìm kiếm truyện**; tìm kiếm có thể hoàn tất khi không lọc |
| Hành vi xuất hiện theo lựa chọn | Áp dụng hoặc bỏ qua kết quả AI sau khi xem bản sinh | **«extend» → Xem bản thảo AI đã tạo**; không phải hai bước bắt buộc |
| Biến thể của cùng một mục tiêu | Khởi tạo Story Brain từ ý tưởng / từ bản thảo | **«generalization» → Khởi tạo Story Brain (trừu tượng)** |
| Biến thể của cùng một quyết định | Chấp nhận hoặc từ chối đề xuất; duyệt hoặc từ chối kiểm duyệt | **«generalization» → UC quyết định (trừu tượng)**; một lần xử lý chỉ có một quyết định hợp lệ |
| Phụ thuộc đối tượng đã tồn tại | Tạo chương phải có tác phẩm, sửa bình luận phải có bình luận | **Precondition**; không dùng «include» đến tạo tác phẩm/tạo bình luận |
| Phụ thuộc trạng thái dữ liệu | Mở khóa tài khoản cần đang khóa, kích hoạt plan cần có plan hợp lệ | **Precondition**, không phải lúc nào cũng chạy UC tạo đối tượng |
| Bước điều hướng không bắt buộc | Xem chi tiết truyện rồi mới đọc, xem danh sách rồi chọn mục để sửa | Không vẽ «include» vì có thể truy cập trực tiếp bằng ID |
| Hai tính năng liên quan nhưng không bắt buộc nhau | Theo dõi truyện và bật thông báo cho truyện | **Hai UC độc lập**; không áp đặt quan hệ phụ thuộc mà backend không yêu cầu |

**Kết luận đánh giá:** Use Case là **mục tiêu đạt được từ góc nhìn tác nhân**, không phải một danh sách endpoint đồng cấp. Một số bước kiểm tra nội bộ được dùng làm UC được bao gồm chỉ khi là hành vi bắt buộc và có ý nghĩa tái sử dụng; những thao tác CRUD được nhóm bằng UC cha trừu tượng để thể hiện mức độ chuyên biệt. Tình huống cần dữ liệu đầu vào tồn tại hoặc trạng thái hợp lệ được mô tả trong bảng kịch bản, tránh dùng sai quan hệ UML.

## 3.3. Biểu đồ lớp thực thể

Biểu đồ lớp trong phần này tập trung vào **lớp miền nghiệp vụ**, không phải biểu diễn trực tiếp mọi controller, DTO hoặc file của hệ thống. Tên lớp và quan hệ được tổng hợp từ mã nguồn, migration và các đối tượng API ở `main`. Cần phân biệt quan hệ lớp với khóa ngoại vật lý trên cơ sở dữ liệu.

### 3.3.1. Biểu đồ lớp tài khoản và tác phẩm

```mermaid
classDiagram
    class User {
      +UUID userId
      +string email
      +string username
      +UserRole role
      +UserStatus status
    }
    class UserProfile {
      +UUID userId
      +string displayName
      +string avatarUrl
    }
    class RefreshToken {
      +UUID refreshTokenId
      +UUID userId
      +datetime expiresAt
      +datetime revokedAt
    }
    class Novel {
      +UUID novelId
      +UUID authorId
      +string title
      +NovelStatus status
      +string serialStatus
    }
    class Chapter {
      +UUID chapterId
      +UUID novelId
      +int chapterNumber
      +string title
      +ChapterStatus status
      +boolean isVip
      +int priceCoins
    }
    class ChapterRevision {
      +UUID revisionId
      +UUID chapterId
      +string contentHash
      +string sourceType
      +datetime createdAt
    }
    User "1" --> "0..1" UserProfile : sở hữu
    User "1" --> "0..*" RefreshToken : có
    User "1" --> "0..*" Novel : sáng tác
    Novel "1" --> "0..*" Chapter : gồm
    Chapter "1" --> "0..*" ChapterRevision : lịch sử
```

*Hình 3.12. Biểu đồ lớp tài khoản, tác phẩm và phiên bản chương.*

`User` xác định danh tính và vai trò. `UserProfile` lưu thông tin hồ sơ tách biệt với thông tin đăng nhập. Một tác giả có thể sở hữu nhiều tác phẩm; mỗi tác phẩm có nhiều chương. `ChapterRevision` cho phép lưu bản nội dung bất biến theo `revisionId` và `contentHash`, phục vụ kiểm soát thay đổi và phân tích AI. Nội dung bản thảo đang biên tập có thể được lưu theo mô hình document, không đồng nhất với revision đã chốt.

### 3.3.2. Biểu đồ lớp đọc truyện, tương tác và ví

```mermaid
classDiagram
    class ReadingHistory {
      +UUID userId
      +UUID novelId
      +UUID chapterId
      +int paragraphIndex
      +datetime updatedAt
    }
    class ReadingBookmarkEntry {
      +UUID bookmarkId
      +UUID chapterId
      +int paragraphIndex
      +int startOffset
      +int endOffset
    }
    class Comment {
      +string commentId
      +string chapterId
      +string content
      +string status
    }
    class NovelFollow {
      +UUID userId
      +UUID novelId
    }
    class Wallet {
      +UUID walletId
      +UUID userId
      +int coinsBalance
    }
    class CoinTransaction {
      +UUID transactionId
      +string type
      +string status
      +int amountCoins
    }
    class ChapterUnlock {
      +UUID userId
      +UUID chapterId
      +UUID transactionId
    }
    class User {
      +UUID userId
    }
    class Novel {
      +UUID novelId
    }
    class Chapter {
      +UUID chapterId
    }
    User "1" --> "0..*" ReadingHistory
    User "1" --> "0..*" ReadingBookmarkEntry
    User "1" --> "0..*" Comment
    User "1" --> "0..*" NovelFollow
    User "1" --> "0..1" Wallet
    Wallet "1" --> "0..*" CoinTransaction
    User "1" --> "0..*" ChapterUnlock
    Novel "1" --> "0..*" NovelFollow
    Chapter "1" --> "0..*" ChapterUnlock
```

*Hình 3.13. Biểu đồ lớp đọc truyện, tương tác và giao dịch Coin.*

Điểm đáng chú ý là dữ liệu giao dịch được xử lý theo quy tắc toàn vẹn và cần giao dịch cơ sở dữ liệu khi thay đổi số dư/quyền mở khóa. Hệ thống Coin là **mô phỏng**, chưa được coi là tích hợp thanh toán thương mại thực.

### 3.3.3. Biểu đồ lớp quản lý ngữ cảnh và AI

```mermaid
classDiagram
    class StoryBrain {
      +UUID id
      +UUID novelId
      +long brainVersion
      +string status
    }
    class NarrativeEntity {
      +UUID id
      +string canonicalName
      +string entityType
      +string confirmationStatus
      +boolean isLocked
    }
    class NarrativeEvent {
      +UUID id
      +long narrativeOrder
      +string summary
      +int chapterNumber
    }
    class NarrativeFact {
      +UUID id
      +string factKey
      +string confirmationStatus
      +boolean isLocked
    }
    class NarrativeProposal {
      +UUID id
      +string status
      +string proposalType
    }
    class NarrativeFinding {
      +UUID id
      +string findingType
      +string severity
    }
    class MemoryChunk {
      +UUID id
      +string contentHash
      +string memoryType
    }
    class MemoryEmbedding {
      +UUID id
      +int embeddingDimension
      +string embeddingVersion
    }
    StoryBrain "1" --> "0..*" NarrativeEntity
    StoryBrain "1" --> "0..*" NarrativeEvent
    StoryBrain "1" --> "0..*" NarrativeFact
    StoryBrain "1" --> "0..*" NarrativeProposal
    StoryBrain "1" --> "0..*" NarrativeFinding
    StoryBrain "1" --> "0..*" MemoryChunk
    MemoryChunk "1" --> "0..*" MemoryEmbedding
```

*Hình 3.14. Biểu đồ lớp miền ngữ cảnh truyện và AI.*

Mô hình tách biệt thông tin đã xác nhận, thông tin suy diễn và đề xuất đang chờ quyết định. `StoryBrain` là tập hợp thông tin truyện phục vụ tra cứu ngữ cảnh. `NarrativeEntity` đại diện danh tính nhân vật, địa điểm, tổ chức hoặc vật phẩm; `NarrativeEvent` lưu diễn biến; `NarrativeFact` lưu dữ kiện hoặc quy tắc. `NarrativeProposal` không tương đương dữ liệu đã được phê duyệt. `MemoryChunk` và `MemoryEmbedding` phục vụ truy xuất ngữ nghĩa. Mô hình được đối chiếu với các lớp ORM và migration AI trên `main`, không chỉ dựa trên file mô tả thiết kế [M4].

## 3.4. Thiết kế cơ sở dữ liệu

### 3.4.1. Phân chia kho dữ liệu

Ephurin tổ chức dữ liệu theo yêu cầu toàn vẹn và đặc tính lưu trữ:

| Kho dữ liệu | Nội dung chính | Cơ sở lựa chọn |
|---|---|---|
| PostgreSQL, schema nghiệp vụ | Tài khoản, truyện, chương, phiên bản, thư viện, lịch sử đọc, giao dịch và kiểm duyệt | Quan hệ rõ ràng, khóa ngoại và transaction |
| MongoDB | Bản thảo đang biên tập, bình luận, thông báo và các document liên quan | Cấu trúc document linh hoạt |
| PostgreSQL, schema `narrative` | Story Brain, thực thể, sự kiện, dữ kiện, đề xuất, bộ nhớ ngữ nghĩa | Cần ràng buộc, truy xuất theo phiên bản, và tích hợp pgvector |

Mỗi bảng dữ liệu được đặt dưới quyền xử lý của module tương ứng. AI Service không được tự ý thay đổi tài khoản hoặc trạng thái xuất bản của Novel Platform. Các tham chiếu `novelId`/`chapterId`/`revisionId` của Narrative Memory là định danh nghiệp vụ do Platform quản lý; không mặc định là foreign key vật lý xuyên schema.

### 3.4.2. ERD nhóm tài khoản và xuất bản

```mermaid
erDiagram
    USERS {
      uuid user_id PK
      varchar email UK
      varchar username UK
      varchar role
      varchar status
    }
    USER_PROFILES {
      uuid user_id PK, FK
      varchar display_name
      text avatar_url
    }
    REFRESH_TOKENS {
      uuid refresh_token_id PK
      uuid user_id FK
      timestamp expires_at
    }
    NOVELS {
      uuid novel_id PK
      uuid author_id FK
      varchar title
      varchar status
    }
    CHAPTERS {
      uuid chapter_id PK
      uuid novel_id FK
      int chapter_number
      varchar status
      boolean is_vip
      int price_coins
    }
    CHAPTER_REVISIONS {
      uuid revision_id PK
      uuid novel_id FK
      uuid chapter_id FK
      varchar content_hash
      text content
      varchar source_type
    }
    REVISION_OUTBOX_EVENTS {
      uuid event_id PK
      uuid revision_id FK
      varchar event_type
      varchar status
    }
    CHARACTER_PROFILES {
      uuid character_id PK
      uuid novel_id FK
      varchar name
      varchar role
    }
    STORY_TIMELINE_EVENTS {
      uuid event_id PK
      uuid novel_id FK
      uuid chapter_id FK
      int event_order
    }
    PLOT_SUMMARIES {
      uuid summary_id PK
      uuid novel_id FK
      varchar scope
    }
    USERS ||--o| USER_PROFILES : has
    USERS ||--o{ REFRESH_TOKENS : owns
    USERS ||--o{ NOVELS : writes
    NOVELS ||--o{ CHAPTERS : includes
    NOVELS ||--o{ CHAPTER_REVISIONS : records
    CHAPTERS ||--o{ CHAPTER_REVISIONS : versions
    CHAPTER_REVISIONS ||--o{ REVISION_OUTBOX_EVENTS : generates
    NOVELS ||--o{ CHARACTER_PROFILES : describes
    NOVELS ||--o{ STORY_TIMELINE_EVENTS : contains
    NOVELS ||--o{ PLOT_SUMMARIES : summarizes
```

*Hình 3.15. ERD nhóm tài khoản, truyện, chương và ngữ cảnh do tác giả quản lý.*

Từ migrations trên `main` có thể xác định: `users.user_id` là khóa chính người dùng; `novels.author_id` tham chiếu tác giả; `chapters.novel_id` tham chiếu truyện; `chapter_revisions.chapter_id` tham chiếu chương và lưu `content_hash`. Bảng `revision_outbox_events` ghi dấu các sự kiện revision, có trạng thái và trường phục vụ retry. Các bảng `character_profiles`, `story_timeline_events` và `plot_summaries` là dữ liệu ngữ cảnh chính thức do backend quản lý. ERD đã bỏ một số trường phụ để giữ khả năng đọc.

### 3.4.3. ERD đọc truyện, tương tác và ví Coin

```mermaid
erDiagram
    USERS {
      uuid user_id PK
    }
    NOVELS {
      uuid novel_id PK
    }
    CHAPTERS {
      uuid chapter_id PK
      uuid novel_id FK
    }
    READING_HISTORIES {
      uuid user_id FK
      uuid novel_id FK
      uuid chapter_id FK
      int paragraph_index
    }
    READING_BOOKMARK_ENTRIES {
      uuid bookmark_id PK
      uuid user_id FK
      uuid novel_id FK
      uuid chapter_id FK
      int paragraph_index
      int start_offset
    }
    NOVEL_FOLLOWS {
      uuid user_id FK
      uuid novel_id FK
    }
    NOVEL_RATINGS {
      uuid user_id FK
      uuid novel_id FK
    }
    WALLETS {
      uuid wallet_id PK
      uuid user_id FK
      int coins_balance
    }
    TRANSACTIONS {
      uuid transaction_id PK
      uuid wallet_id FK
      int amount_coins
      varchar status
    }
    CHAPTER_UNLOCKS {
      uuid user_id FK
      uuid chapter_id FK
      uuid transaction_id FK
    }
    USERS ||--o{ READING_HISTORIES : reads
    NOVELS ||--o{ READING_HISTORIES : tracked
    CHAPTERS ||--o{ READING_HISTORIES : positioned
    USERS ||--o{ READING_BOOKMARK_ENTRIES : saves
    CHAPTERS ||--o{ READING_BOOKMARK_ENTRIES : bookmarked
    USERS ||--o{ NOVEL_FOLLOWS : follows
    NOVELS ||--o{ NOVEL_FOLLOWS : followed
    USERS ||--o{ NOVEL_RATINGS : rates
    NOVELS ||--o{ NOVEL_RATINGS : rated
    USERS ||--o| WALLETS : owns
    WALLETS ||--o{ TRANSACTIONS : records
    USERS ||--o{ CHAPTER_UNLOCKS : unlocks
    CHAPTERS ||--o{ CHAPTER_UNLOCKS : permitted
    TRANSACTIONS ||--o| CHAPTER_UNLOCKS : evidences
```

*Hình 3.16. ERD nhóm đọc truyện, theo dõi, đánh giá và ví Coin.*

Độc giả có thể lưu tiến độ đọc và nhiều dấu trang tại vị trí cụ thể trong chương. Các bảng follow/rating liên kết người dùng với tác phẩm. Ví Coin lưu số dư; bảng giao dịch phản ánh thay đổi; `chapter_unlocks` lưu quyền mở khóa tương ứng. Mọi số tiền trong phần này là **Coin nội bộ của hệ thống mô phỏng**.

### 3.4.4. ERD dữ liệu Narrative Memory

```mermaid
erDiagram
    STORY_BRAINS {
      uuid id PK
      uuid novel_id
      uuid tenant_id
      bigint brain_version
      varchar status
    }
    ENTITIES {
      uuid id PK
      uuid story_brain_id FK
      varchar canonical_name
      varchar entity_type
      varchar confirmation_status
    }
    ENTITY_ALIASES {
      uuid id PK
      uuid entity_id FK
      varchar alias
    }
    EVENTS {
      uuid id PK
      uuid story_brain_id FK
      bigint narrative_order
      int chapter_number
      text summary
    }
    FACTS {
      uuid id PK
      uuid story_brain_id FK
      varchar fact_key
      varchar confirmation_status
    }
    PROPOSALS {
      uuid id PK
      uuid story_brain_id FK
      varchar status
      varchar proposal_type
    }
    MEMORY_CHUNKS {
      uuid id PK
      uuid story_brain_id FK
      text content
      varchar content_hash
    }
    MEMORY_EMBEDDINGS {
      uuid id PK
      uuid memory_chunk_id FK
      varchar embedding_version
      int embedding_dimension
    }
    STORY_BRAINS ||--o{ ENTITIES : contains
    ENTITIES ||--o{ ENTITY_ALIASES : aliases
    STORY_BRAINS ||--o{ EVENTS : narrates
    STORY_BRAINS ||--o{ FACTS : records
    STORY_BRAINS ||--o{ PROPOSALS : reviews
    STORY_BRAINS ||--o{ MEMORY_CHUNKS : remembers
    MEMORY_CHUNKS ||--o{ MEMORY_EMBEDDINGS : vectorizes
```

*Hình 3.17. ERD tổng quan của schema Narrative Memory.*

Mô hình Narrative Memory được biểu diễn ở mức nhóm bảng quan trọng, dựa trên `ai-service/infrastructure/orm_models.py` cùng thư mục migration Alembic của `main`. Các trường `confirmation_status`, `is_locked`, `revision_id`, `content_hash`, `brain_version` và `embedding_version` giúp hệ thống phân biệt thông tin đã xác nhận với thông tin chưa duyệt, truy vết nguồn và kiểm tra tính hợp lệ khi xử lý.

Không nên hiểu bảng `events` chỉ bao gồm sự kiện hiện tại: các sự kiện có thứ tự nội dung và được sử dụng để dựng lại trạng thái hoặc truy xuất ngữ cảnh theo diễn biến. Một đoạn truyện mới được phân tích chưa mặc nhiên trở thành dữ kiện chính thức chỉ vì mô hình AI đã trích xuất nó.

### 3.4.5. Đối tượng dữ liệu MongoDB

Ngoài các ERD của dữ liệu quan hệ, hệ thống sử dụng những nhóm document như `draft_chapters`, `comments`, `notifications` và `moderation_evidence`. Do MongoDB không dựa trên khóa ngoại theo cùng cơ chế với PostgreSQL, các quan hệ của chúng được thể hiện ở mức tham chiếu logic.

| Collection | Nhóm thuộc tính điển hình | Vai trò |
|---|---|---|
| `draft_chapters` | `chapterId`, `novelId`, `authorId`, `content`, `version`, `autosave` | Bản thảo đang biên tập |
| `comments` | `commentId`, `chapterId`, `novelId`, `userId`, `content`, `status` | Bình luận chương/đoạn |
| `notifications` | `userId`, `type`, `status`, `payload` | Thông báo người dùng |
| `moderation_evidence` | `targetType`, `targetId`, `matchedRules`, `riskLevel` | Bằng chứng phục vụ kiểm duyệt |

Danh sách trên được rút từ thiết kế dữ liệu và những repository tương ứng ở `main`; tùy đường xử lý thực tế, không phải mọi trường trong mô tả tài liệu đều bắt buộc hiện diện ở mọi document.

## 3.5. Sơ đồ tuần tự một số chức năng chính

### 3.5.1. Đăng nhập

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant UI as Web/Mobile
    participant R as Auth Route/Controller
    participant S as Auth Service
    participant DB as PostgreSQL
    U->>UI: Nhập định danh và mật khẩu
    UI->>R: POST /api/v1/auth/login
    R->>S: login(input)
    S->>DB: Tra cứu người dùng
    DB-->>S: Thông tin tài khoản
    S->>S: Kiểm tra mật khẩu và trạng thái
    alt Hợp lệ
        S->>DB: Lưu hash refresh token
        S-->>R: Access token + refresh cookie
        R-->>UI: Đăng nhập thành công
        UI-->>U: Vào không gian phù hợp vai trò
    else Không hợp lệ
        S-->>R: Lỗi xác thực
        R-->>UI: Thông báo lỗi
    end
```

*Hình 3.18. Sơ đồ tuần tự đăng nhập.*

Backend sử dụng access token có thời hạn và lưu hash của refresh token để quản lý vòng đời phiên đăng nhập. Truy vấn quyền và trạng thái người dùng được thực hiện ở lớp nghiệp vụ.

### 3.5.2. Tạo, lưu và gửi công bố chương

```mermaid
sequenceDiagram
    actor A as Tác giả
    participant UI as Author IDE
    participant API as Chapter Controller
    participant S as Chapter Service
    participant PG as PostgreSQL
    participant MO as MongoDB Draft
    participant CC as Content Control
    A->>UI: Soạn hoặc cập nhật nội dung
    UI->>API: PATCH chapter / lưu bản thảo
    API->>S: updateChapter()
    S->>PG: Kiểm tra truyện và quyền sở hữu
    S->>MO: Ghi draft và phiên bản
    MO-->>S: Phiên bản bản thảo đã lưu
    S-->>API: Kết quả cập nhật chương
    API-->>UI: Xác nhận lưu bản thảo
    A->>UI: Gửi công bố
    UI->>API: POST submit-publish
    API->>S: submitChapterPublish()
    S->>PG: Kiểm tra trạng thái chương
    S->>MO: Đọc bản thảo hiện hành
    S->>CC: checkContent()
    alt Không yêu cầu kiểm duyệt
        S->>PG: Ghi nội dung đã công bố
        S-->>UI: PUBLISHED
    else Yêu cầu kiểm duyệt
        CC->>PG: Tạo hoặc sử dụng review
        S->>PG: Chuyển sang PENDING_MODERATION
        S-->>UI: Chờ Admin xử lý
    end
    UI-->>A: Hiển thị kết quả
```

*Hình 3.19. Sơ đồ tuần tự lưu bản thảo và gửi công bố chương.*

Mã nguồn phân biệt việc cập nhật bản thảo và nộp công bố. Khi kiểm tra nội dung không phát hiện yêu cầu review, chương có thể được công bố theo quy tắc của backend; nếu cần review, nội dung được đưa vào trạng thái chờ quản trị viên. Trình tự được xây dựng từ `chapters.service.ts` và `content-control.service.ts` trên `main`.

### 3.5.3. AI sinh gợi ý và tác giả phê duyệt

```mermaid
sequenceDiagram
    actor A as Tác giả
    participant UI as Author IDE
    participant GW as Node AI Gateway
    participant AI as FastAPI Writing Service
    participant NR as Narrative Repository
    participant LLM as LLM Provider
    participant PG as PostgreSQL / Revisions
    A->>UI: Gửi yêu cầu hỗ trợ viết
    UI->>GW: POST /api/v1/ai/writing/generations
    GW->>GW: Xác thực, kiểm tra quyền truyện
    GW->>AI: Gửi yêu cầu có phạm vi novel/chapter
    AI->>NR: Truy vấn Story Brain / memory
    NR-->>AI: Dữ liệu ngữ cảnh phù hợp
    AI->>AI: Chọn, giới hạn và đóng gói ngữ cảnh
    AI->>LLM: Prompt và ngữ cảnh
    LLM-->>AI: Nội dung gợi ý
    AI-->>GW: Job / draft / kết quả xử lý
    GW-->>UI: Kết quả để xem trước
    UI-->>A: Hiển thị bản thảo đề xuất
    alt Tác giả đồng ý áp dụng
        A->>UI: Chấp nhận
        UI->>GW: Yêu cầu áp dụng hoặc lưu revision
        GW->>PG: Ghi thay đổi hợp lệ / revision
        GW-->>UI: Đã ghi nhận
    else Tác giả từ chối
        A->>UI: Bỏ qua kết quả
        UI-->>A: Giữ nội dung hiện tại
    end
```

*Hình 3.20. Sơ đồ tuần tự AI hỗ trợ sáng tác.*

Sơ đồ mô tả **tương tác nghiệp vụ tổng quát** được hình thành từ các route viết, gateway và lớp application AI. Một số yêu cầu sử dụng job, truy vấn trạng thái hoặc phát luồng sự kiện; thời điểm phản hồi chính xác phụ thuộc operation. Nhánh “áp dụng” thể hiện hành động của tác giả thông qua chức năng lưu/nhận bản thảo hợp lệ; **không** có nghĩa mọi kết quả LLM đều được backend tự động ghi thẳng vào bản nháp.

### 3.5.4. Mở khóa chương VIP

```mermaid
sequenceDiagram
    actor R as Độc giả
    participant UI as Mobile/Web Reader
    participant API as Wallet Controller
    participant W as Wallet Service
    participant PG as PostgreSQL
    R->>UI: Chọn mở khóa chương
    UI->>API: POST /api/v1/chapters/:chapterId/unlock
    API->>W: unlockVipChapter()
    W->>PG: Bắt đầu giao dịch và kiểm tra chương
    W->>PG: Kiểm tra đã mở và số dư
    alt Đủ điều kiện
        W->>PG: Cập nhật số dư / transaction / unlock
        PG-->>W: Giao dịch thành công
        W-->>UI: Đã mở khóa
    else Không đủ điều kiện
        PG-->>W: Không ghi thay đổi
        W-->>UI: Thông báo lý do
    end
    UI-->>R: Kết quả mở khóa
```

*Hình 3.21. Sơ đồ tuần tự mở khóa chương bằng Coin mô phỏng.*

Các thao tác thay đổi quyền đọc và số dư phải được xử lý nhất quán. Sơ đồ không thể hiện kết nối ngân hàng hoặc cổng thanh toán thực do không thuộc ý nghĩa của chức năng Coin mô phỏng trong phạm vi đồ án.

### 3.5.5. Quản trị viên xử lý kiểm duyệt

```mermaid
sequenceDiagram
    actor AD as Admin
    participant UI as Admin Dashboard
    participant API as Admin Moderation API
    participant CC as Content Control Service
    participant PG as PostgreSQL
    participant MO as MongoDB Evidence
    AD->>UI: Xem hàng đợi kiểm duyệt
    UI->>API: GET reviews
    API->>CC: listModerationReviews()
    CC->>PG: Đọc trạng thái review
    CC-->>UI: Danh sách review
    AD->>UI: Chọn mục cần xử lý
    UI->>API: GET reviews/:reviewId
    API->>CC: getModerationReview()
    CC->>MO: Đọc bằng chứng nếu có
    CC-->>UI: Nội dung và bằng chứng
    AD->>UI: Duyệt hoặc từ chối
    UI->>API: POST reviews/:reviewId/resolve
    API->>CC: resolveModerationReview()
    CC->>PG: Ghi quyết định và cập nhật trạng thái
    CC-->>UI: Kết quả
    UI-->>AD: Trạng thái mới
```

*Hình 3.22. Sơ đồ tuần tự xử lý kiểm duyệt nội dung.*

Quy trình kiểm duyệt sử dụng kết quả quét từ khóa/quy tắc và thông tin báo cáo để hỗ trợ quyết định của Admin. Không gộp pipeline kiểm duyệt với pipeline sinh văn bản của AI Copilot.

## 3.6. Mô hình hoạt động và trạng thái

### 3.6.1. Quy trình AI phân tích bản thảo và quản lý đề xuất

```mermaid
flowchart TD
    A(["Bản thảo / revision được chọn"]) --> B["Kiểm tra quyền và định danh truyện"]
    B --> C["Tạo hoặc tiếp nhận yêu cầu phân tích"]
    C --> D["Trích xuất thực thể và dữ kiện"]
    D --> E["Chuẩn hóa, đối chiếu thực thể"]
    E --> F["Phân tích sự kiện / trạng thái / quan hệ"]
    F --> G["Tạo finding hoặc proposal có bằng chứng"]
    G --> H{"Cần tác giả quyết định?"}
    H -->|Có| I["Đưa vào hàng đợi review"]
    I --> J{"Tác giả quyết định"}
    J -->|Chấp nhận / sửa| K["Kiểm tra phiên bản và điều kiện hợp lệ"]
    K --> L["Ghi nhận dữ liệu đã xác nhận"]
    J -->|Từ chối| M["Đánh dấu từ chối, không cập nhật canonical"]
    H -->|Không, dữ liệu dẫn xuất an toàn| N["Cập nhật dữ liệu dẫn xuất theo chính sách"]
    L --> O(["Truy vấn ngữ cảnh cho lần viết tiếp theo"])
    N --> O
    M --> O
```

*Hình 3.23. Activity Diagram của quy trình phân tích và phê duyệt ngữ cảnh AI.*

Quy trình kết hợp việc trích xuất dữ liệu và vai trò quyết định của tác giả. Hệ thống cần phân biệt **proposed**, **confirmed/locked** và dữ liệu **derived** có thể tính lại. Các kiểm tra version, quyền sở hữu và tính idempotent giúp hạn chế việc cùng một yêu cầu tạo ra thay đổi trùng lặp. Khả năng này được thể hiện qua các API proposal, logic repository và mã xử lý trên `main`; hiệu quả đo đạc được trình bày riêng ở Chương 4.

### 3.6.2. Vòng đời chương truyện

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Tạo chương
    DRAFT --> DRAFT: Lưu bản thảo / chỉnh sửa
    DRAFT --> PENDING_MODERATION: Có quy tắc cần review
    DRAFT --> PUBLISHED: Qua kiểm tra công bố
    PENDING_MODERATION --> PUBLISHED: Admin chấp nhận
    PENDING_MODERATION --> REJECTED: Admin từ chối
    REJECTED --> DRAFT: Tác giả chỉnh sửa
    PUBLISHED --> ARCHIVED: Lưu trữ chương
    ARCHIVED --> PUBLISHED: Khôi phục theo quy tắc
```

*Hình 3.24. State Machine thể hiện các trạng thái chính của chương truyện.*

Các trạng thái `DRAFT`, `PENDING_MODERATION`, `PUBLISHED`, `REJECTED` và `ARCHIVED` xuất hiện trong migration của backend. Mũi tên là **luồng nghiệp vụ tổng hợp** phục vụ thuyết minh; các chuyển tiếp thực tế phải qua ràng buộc service và có thể thay đổi tùy thao tác/điều kiện. Không được xem hình này là bảng chuyển trạng thái được phép tuyệt đối cho mọi API.

### 3.6.3. Mô hình triển khai ứng dụng

```mermaid
flowchart TB
    subgraph External["Thiết bị và kết nối ngoài"]
      Browser["Trình duyệt Web"]
      Phone["Ứng dụng React Native / Expo"]
      LLM["LLM / Embedding Provider"]
    end
    subgraph Docker["Docker Compose - hệ thống demo"]
      WEB["Web container / HTTP"]
      API["Backend container / Node.js:4000"]
      AI["AI Service container / FastAPI:8000"]
      PG[("PostgreSQL + pgvector")]
      MONGO[("MongoDB")]
      MEDIA[("Volume lưu tài nguyên")]
    end
    Browser --> WEB
    Phone --> API
    WEB --> API
    API --> AI
    API --> PG
    API --> MONGO
    API --> MEDIA
    AI --> PG
    AI --> LLM
```

*Hình 3.25. Sơ đồ triển khai hệ thống theo Docker Compose trên nhánh `main`.*

Ứng dụng web, backend và AI Service được đóng gói thành các thành phần chạy trong Docker Compose cùng PostgreSQL/MongoDB. Ứng dụng di động chạy trên thiết bị hoặc môi trường phát triển, không phải container giao diện web. Bản vẽ nhằm thể hiện thành phần và kết nối; các cổng, biến môi trường và điều kiện health-check chi tiết được kiểm tra trong tệp `docker-compose.yml`.

## 3.7. Đánh giá phương án thiết kế và phạm vi hiện thực

### 3.7.1. Điểm phù hợp

**Thứ nhất, phân chia nghiệp vụ theo module.** Các chức năng xác thực, truyện, chương, đọc, tương tác, Coin và quản trị được triển khai thành các module rõ trách nhiệm. Cách tổ chức này giúp phân tích Use Case, nhận diện dữ liệu sở hữu và xây dựng các lớp xử lý tương ứng.

**Thứ hai, tách nguồn dữ liệu theo mục đích.** Dữ liệu giao dịch và quan hệ được quản lý trong PostgreSQL; một số dữ liệu có cấu trúc document đặt trong MongoDB; bộ nhớ truyện phục vụ AI sử dụng schema `narrative` và dữ liệu embedding. Phương án này hỗ trợ yêu cầu khác nhau của nghiệp vụ nhưng đồng thời đòi hỏi kiểm soát tính nhất quán khi trao đổi giữa các kho dữ liệu.

**Thứ ba, duy trì quyền quyết định của tác giả.** Kết quả phân tích hoặc sinh nội dung AI được đưa về dưới dạng đề xuất hoặc bản thảo. Việc thay đổi dữ liệu đã xác nhận phải tuân thủ cơ chế phê duyệt và xác thực phạm vi.

**Thứ tư, truy vết dữ liệu theo phiên bản.** `chapter_revisions`, `content_hash`, nguồn thay đổi và outbox event cung cấp nền tảng cho việc phân tích nội dung theo từng revision và theo dõi quá trình xử lý.

### 3.7.2. Giới hạn và điều kiện cần kiểm thử

Sự tồn tại của route, bảng dữ liệu và lớp xử lý là bằng chứng về **cấu trúc mã nguồn**, nhưng không tự chứng minh rằng tất cả luồng end-to-end đều hoạt động trong mọi điều kiện. Một số tính năng AI cần cấu hình provider, cơ sở dữ liệu, embedding hoặc chính sách runtime phù hợp. Các tiêu chí như độ trễ, độ chính xác trích xuất, mức độ liên quan của ngữ cảnh và độ tin cậy của hệ thống cần được kiểm tra bằng test case và số liệu thực tế.

Ngoài ra, các sơ đồ ở chương này được giản lược có chủ đích. Không đưa mọi lớp hạ tầng, cột dữ liệu, endpoint hoặc điều kiện ngoại lệ vào cùng một hình để tránh làm mất khả năng đọc. Khi mô tả lớp dữ liệu cụ thể, tên bảng và khóa phải đối chiếu với migration của `main` chứ không lấy từ SRS cũ.

### 3.7.3. Ma trận truy vết sơ đồ – mã nguồn

| Nhóm hình | Thành phần mã nguồn chính để đối chiếu |
|---|---|
| Kiến trúc tổng thể | `backend/src/app.ts`; `docker-compose.yml`; `ai-service/main.py` |
| Use Case độc giả | `backend/src/modules/reading`; `interactions`; `wallet` |
| Use Case tác giả | `backend/src/modules/novels`; `story-context`; `web/src/features/author-ide` |
| Use Case AI | `backend/src/modules/ai`; `ai-service/api`; `ai-service/application` |
| Use Case quản trị | `backend/src/modules/admin`; `content-control` |
| Class/ERD tác phẩm | `backend/src/core/database/migrations/001–010` và các migration bổ sung |
| Class/ERD độc giả | `backend/src/core/database/migrations/006`, `007`, `012`, `021`, `026`, `027` |
| ERD Narrative Memory | `ai-service/infrastructure/orm_models.py`; `ai-service/migrations/versions` |
| Sequence công bố và kiểm duyệt | `chapters.service.ts`; `content-control.service.ts` |
| Sequence AI | `ai-gateway.routes.ts`; `writing_service.py`; `narrative_service.py` |
| Vòng đời chương | `003_chapters.sql`; `chapters.service.ts`; nhóm xử lý lifecycle |

## 3.8. Kết chương

Chương 3 đã trình bày kiến trúc tổng thể của Ephurin, phân tích tác nhân và ca sử dụng, xây dựng các biểu đồ lớp thực thể, thiết kế cơ sở dữ liệu và mô tả luồng tương tác của những chức năng nghiệp vụ tiêu biểu. Nội dung được đối chiếu với hiện trạng mã nguồn trên nhánh `main` nhằm hạn chế sai lệch giữa báo cáo và hệ thống thực tế.

Những biểu đồ cho thấy hệ thống được phát triển theo hướng backend Modular Monolith kết hợp dịch vụ AI chuyên biệt, có cơ chế lưu phiên bản nội dung, phân tách dữ liệu nghiệp vụ với dữ liệu ngữ cảnh AI và duy trì quyền phê duyệt của tác giả đối với những đề xuất sinh tự động. Chương tiếp theo sẽ trình bày giao diện triển khai, môi trường chạy thử, các ca kiểm thử và đánh giá kết quả vận hành để chứng minh mức độ đáp ứng các yêu cầu đã phân tích.

---

## TÀI LIỆU ĐỐI CHIẾU CHO CHƯƠNG 3

**Nguồn chính (mã nguồn nhánh main, commit cố định):**

- **[M1]** Ephurin, [`backend/src/app.ts`](https://github.com/Ephurin/Novel_sharing_platform/blob/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/app.ts), danh sách route và module backend.
- **[M2]** Ephurin, [`docker-compose.yml`](https://github.com/Ephurin/Novel_sharing_platform/blob/18182745efcfe99842c4d29b0dd413ade214c42b/docker-compose.yml), cấu hình triển khai.
- **[M3]** Ephurin, [`backend/src/core/database/migrations`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/core/database/migrations), dữ liệu nghiệp vụ và ràng buộc.
- **[M4]** Ephurin, [`ai-service/infrastructure/orm_models.py`](https://github.com/Ephurin/Novel_sharing_platform/blob/18182745efcfe99842c4d29b0dd413ade214c42b/ai-service/infrastructure/orm_models.py) và [`ai-service/migrations/versions`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/ai-service/migrations/versions), mô hình Narrative Memory.
- **[M5]** Ephurin, [`backend/src/modules/novels`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/modules/novels), xử lý truyện, chương và revision.
- **[M6]** Ephurin, [`backend/src/modules/reading`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/modules/reading), chức năng đọc truyện.
- **[M7]** Ephurin, [`backend/src/modules/wallet`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/modules/wallet) và [`content-control`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/modules/content-control), Coin mô phỏng và kiểm duyệt.
- **[M8]** Ephurin, [`backend/src/modules/ai`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/backend/src/modules/ai) và [`ai-service/application`](https://github.com/Ephurin/Novel_sharing_platform/tree/18182745efcfe99842c4d29b0dd413ade214c42b/ai-service/application), luồng AI và xử lý ngữ cảnh.

**Nguồn bổ trợ về ký pháp và thuật ngữ:**

- **[T1]** Object Management Group, *OMG Unified Modeling Language (OMG UML), Version 2.5.1*. https://www.omg.org/spec/UML/2.5.1
- **[T2]** Mermaid, *Mermaid Diagram Syntax*. https://mermaid.js.org/intro/syntax-reference.html

> **Ghi chú biên tập:** Các mã [M1]–[M8], [T1]–[T2] là mã truy vết nội bộ khi soạn thảo, chưa phải số thứ tự của danh mục tài liệu tham khảo toàn báo cáo. Khi ghép với Chương 1 và 2, chuyển thành đánh số IEEE thống nhất; đồng thời kiểm tra bản render từng sơ đồ trước khi xuất sang Word/PDF.
