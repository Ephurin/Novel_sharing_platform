# Tổng hợp vấn đề giao diện web – bản main `cc1a0a99`

Tài liệu giao cho team dev. Gộp ba bản đánh giá độc lập, đã bỏ trùng và đối chiếu với mã nguồn tại commit `cc1a0a99`.

| Ký hiệu | Nguồn | Cách đánh giá |
|---|---|---|
| **R1** | Review 1 | Xem 35 ảnh trong `Ephurin_giao_dien_main.pdf` |
| **R2** | Review 2 | Đọc mã giao diện tại `cc1a0a99` (không có ảnh) |
| **R3** | Review của Claude | Xem 35 ảnh trong PDF, đối chiếu lại mã nguồn |

- **Số hình** theo số thứ tự ghi trên từng trang PDF (hình 1 = Đăng nhập … hình 35 = Quản lý diễn đàn). Tên file ảnh `h4_xx` ghi kèm.
- **Phạm vi:** desktop 1440×900. **Chưa có ảnh hay đánh giá nào cho khổ điện thoại.**
- **Đường dẫn code** tính từ gốc repo, theo commit `cc1a0a99`. Nhánh hiện tại có thể đã lệch số dòng.

### Không phải lỗi, không cần sửa

- Tên truyện tiếng Anh dạng "Sample Story", tài khoản kiểu "Reader 03 Author": đây là dữ liệu mẫu.
- Giao diện hiện tên "StoryCraft": trang đầu PDF đã giải thích quan hệ với Ephurin (xem thêm UI-22).
- Trang Bookmark và Khiếu nại trống; các bảng AI chưa có lượt sinh nội dung.

### Nên giữ nguyên (cả ba review đều đồng ý)

- Nền kem, màu cam đất và ảnh sách tạo bản sắc rõ.
- Trang chi tiết thảo luận (hình 15) có tiêu đề nổi bật, phần đọc thoáng.
- Khi mở trợ lý AI (hình 22), bản thảo vẫn đủ rộng để đọc và đối chiếu.
- Nút VIP đã ghi giá trên nút ("Mở khóa · 10 xu") và hiện số dư trước khi bấm.
- Trang Ví xu (hình 12), Nhập bản thảo (hình 24), Đăng nhập (hình 1) đã hoàn thiện tốt.

---

## Tiến độ

**P1 (UI-01 → UI-07) đã sửa** trên nhánh `claude/ui-review-p1`. Nhóm Admin của P2 (UI-08, UI-12, UI-17) đã sửa trên nhánh `codex/ui-review-admin`, phụ thuộc PR #218. Các mục P2/P3 còn lại đang chờ.

| ID | Đã làm |
|---|---|
| UI-01 | Thẻ Thư viện có dòng "Đang đọc: Chương N", thanh tiến độ, nút chính "Đọc tiếp" / "Bắt đầu đọc"; "Bỏ theo dõi" vào menu ⋯. |
| UI-02 | Thẻ VIP căn giữa, ghi tên truyện và chương (backend gửi thêm `novelTitle`, `chapterNumber`, `chapterTitle` trong lỗi `PAYMENT_002`); chưa có giá thì chỉ cho "Tải lại giá"; báo "còn thiếu N xu"; nút "Về mục lục truyện"; số có dấu tách nghìn. |
| UI-03 | API hàng đợi trả thêm `targetTitle`, `targetContext`, `excerpt`, `matchedKeywords`, `topReason` (bình luận riêng tư không lộ nội dung). Bảng mở đầu bằng nội dung, có lý do chính, từ khóa khớp, thời gian đã chờ; mã chuyển sang cột phụ. |
| UI-04 | Đổi tên thành "Bộ nhớ cốt truyện"; 11 tab xếp 2 hàng có nhãn nhóm (Thiết lập / Tra cứu), số lượng thành badge; đầu tab Chờ duyệt có trạng thái rõ (kể cả khi không tải được); phần danh sách tên tùy chọn xuống dưới; bỏ "Hồ sơ Codex", "Full auto", huy hiệu phiên bản; "AI Hỗ trợ viết" → "Trợ lý viết". |
| UI-05 | "Bookmark" → "Đoạn đã đánh dấu"; "Thể loại & Tag" → "Thể loại và thẻ"; `VISIBLE` → "Đang hiển thị"; ảnh bìa mặc định hết chữ tiếng Anh; "Xuất file Bible" → "Xuất cẩm nang (JSON)"; ô "Mã thao tác" thành danh sách chọn. |
| UI-06 | "Đặt lại / Xóa bộ lọc" giữ từ khóa; nút riêng "Xóa toàn bộ" để xóa cả từ khóa. |
| UI-07 | Lỗi thật duy nhất: thẻ phía độc giả đếm cả chương nháp (`novels.chapters_count`). Giờ chỉ đếm chương đã xuất bản. Lượt đọc 1/2 và tổng xu 0/500 là do chụp ảnh ở các thời điểm khác nhau (admin 09:47, giao dịch nạp 09:48), không phải lỗi. |
| UI-08 | Khóa tài khoản, duyệt/từ chối rút xu và xóa/gộp danh mục nằm trong menu ⋯. Ẩn thao tác khóa với chính mình và tài khoản quản trị viên. Hộp xác nhận rút xu vẫn hiện người yêu cầu, số xu và tài khoản nhận. Các thao tác phá hủy dùng màu cảnh báo và xác nhận rõ hành động. |
| UI-12 | Diễn đàn dùng chung tiêu đề, bộ lọc, bảng, tùy chọn bảng và phân trang Admin. Có tìm kiếm tiêu đề không dấu trước khi phân trang, nút làm mới và menu ⋯ cho chủ đề. Bình luận vẫn mở ngay dưới chủ đề. |
| UI-17 | Gom Xem nhanh và Chi tiết vào menu ⋯ trên bảng truyện. Thể loại và thẻ có bảng riêng và ô tìm kiếm. Gộp bộ lọc đã lưu và cột hiển thị vào “Tùy chọn bảng”, bỏ các chip lặp giá trị bộ lọc. |

## Bảng tóm tắt

| ID | Ưu tiên | Màn hình | Vấn đề | Nguồn |
|---|---|---|---|---|
| UI-01 | **P1** | Thư viện · h9 | Thẻ truyện không có "Đọc tiếp", nút nổi bật nhất là "Bỏ theo dõi" | R1 R3 |
| UI-02 | **P1** | Chương VIP · h8 | Thiếu tên truyện và chương; bấm được khi chưa biết giá; không nói thiếu bao nhiêu xu; bố cục sơ sài | R1 R2 R3 |
| UI-03 | **P1** | Kiểm duyệt · h28, Báo cáo · h30 | Cột đầu là mã băm, các hàng không phân biệt được | R1 R2 R3 |
| UI-04 | **P1** | Story Brain · h21 | 11 tab chen chúc, tab "Chờ duyệt" không nói ngay có việc hay không, thuật ngữ nội bộ | R1 R2 R3 |
| UI-05 | **P1** | h10, h31, h35, h4… | Nhãn tiếng Anh hoặc mã nội bộ hiện cho người dùng | R1 R3 |
| UI-06 | **P1** | Tìm kiếm · h5 | "Đặt lại / Xóa bộ lọc" xóa luôn từ khóa | R2 |
| UI-07 | **P1** | h3, h6, h9, h25 | Số liệu cùng một truyện / ví không khớp giữa các trang (cần xác minh) | R3 |
| UI-08 | P2 | h26, h32, h31 | Hành động nguy hiểm hiện quá nổi bật | R3 |
| UI-09 | P2 | Trang chủ · h3 | Hàng "Đọc tiếp" nhỏ, yếu hơn banner khám phá | R1 R3 |
| UI-10 | P2 | Toàn hệ thống | Định dạng ngày giờ, số, chính tả không thống nhất | R3 |
| UI-11 | P2 | Toàn hệ thống | Màu trạng thái, dropdown, font, độ rộng trang không thống nhất | R3 |
| UI-12 | P2 | Admin diễn đàn · h35 | Lệch khuôn so với các trang admin khác | R3 |
| UI-13 | P2 | Author IDE · h18–22 | Thanh công cụ quá tải, nhiều lối vào AI, hai nút chính cạnh tranh | R2 R3 |
| UI-14 | P2 | Thông báo · h13 | Nội dung chung chung, không gộp thông báo trùng | R3 |
| UI-15 | P2 | Chi tiết truyện · h6 | Thiếu thể loại và tag, mục lục nằm dưới màn hình đầu | R3 |
| UI-16 | P2 | Lịch sử bản thảo · h20 | Chỉ có một dropdown, không xem trước được | R3 |
| UI-17 | P2 | Bảng admin · h27, h31 | Hàng quá cao, danh sách thẻ tốn chỗ, không có tìm kiếm | R3 |
| UI-18 | P3 | Trang chủ, Danh sách, Tìm kiếm | Chương mới lặp truyện, nhãn "Mới" ở mọi thẻ, thể loại và tag trùng, hai kiểu bộ lọc | R3 |
| UI-19 | P3 | Điều hướng | Breadcrumb sai cấp, biểu tượng không có nhãn, ô tìm kiếm bị lặp | R3 |
| UI-20 | P3 | Tác giả | Chữ lặp trong tên chương, quá nhiều nút cam, banner gộp tên mơ hồ | R3 |
| UI-21 | P3 | Toàn hệ thống | Tương phản thấp, chưa kiểm tra mobile | R3 |
| UI-22 | Quyết định SP | Toàn hệ thống | StoryCraft và Ephurin cùng xuất hiện trong giao diện | R3 |

P1 = nên xong trước khi trình bày Chương 4. P2 = nên làm trong đợt chỉnh giao diện kế tiếp. P3 = làm khi tiện.

---

## P1: chi tiết

### UI-01 · Thẻ truyện trong Thư viện thiếu "Đọc tiếp" (hình 9, `h4_06_thuvien`)

**Hiện trạng:**
- Nút duy nhất có nhãn trên thẻ là "Bỏ theo dõi", kiểu nút soft màu đỏ.
- Thẻ không có tiến độ đọc. Người quay lại thư viện thường muốn đọc tiếp.

**Đề xuất:**
- Đặt nút "Đọc tiếp · Chương N" ngay dưới tên truyện. Nếu chưa đọc chương nào thì ghi "Bắt đầu đọc".
- Thêm thanh tiến độ, dùng lại cách trình bày ở Lịch sử đọc (hình 11) và trang chủ (hình 3).
- Chuyển "Bỏ theo dõi" vào menu ⋯ của thẻ.

**Nghiệm thu:**
- Nút chính của mỗi thẻ là "Đọc tiếp" hoặc "Bắt đầu đọc", dẫn đúng chương.
- "Bỏ theo dõi" chỉ xuất hiện trong menu ⋯.

**Code:** `web/src/features/reader/ReaderPage.tsx` khoảng dòng 218–235 (`extraAction` của `NovelCard`). Cần dữ liệu chương đang đọc cho từng truyện, lấy từ API lịch sử đọc hoặc bổ sung vào API thư viện.

### UI-02 · Màn hình chương VIP đang khóa (hình 8, `h4_05_chuong_vip`)

**Hiện trạng:**

| | Vấn đề | Nguồn |
|---|---|---|
| a | Tiêu đề chỉ ghi "Chương VIP đang khóa". Không có tên truyện và số chương, người đọc không kiểm tra được mình sắp mở gì. | R1 R3 |
| b | Khi API không trả `priceCoins`, nút đổi thành "Mở khóa chương" nhưng **vẫn bấm được**. Code chỉ vô hiệu nút khi `unlock.isPending \|\| notEnough`. | R2 |
| c | Khi thiếu xu, giao diện chỉ ghi "chưa đủ để mở khóa chương này", không nói thiếu bao nhiêu. | R2 |
| d | Nút "Danh sách truyện" về `/reader`, mất ngữ cảnh truyện đang đọc. | R1 |
| e | Thẻ dính góc trên bên trái, phần dưới trống. Ba nút dính liền nhau, không có khoảng cách. Số dư hiện "1480 xu" (không tách nghìn), trong khi Ví ghi "1.480". | R3 |

**Đề xuất:**
- Thêm "Tên truyện · Chương N: Tiêu đề" phía trên nút.
- Vô hiệu nút mở khóa cho tới khi có giá. Nếu không lấy được giá, hiện lỗi kèm nút "Thử lại".
- Khi thiếu xu: "Bạn còn thiếu N xu", nút chính là "Nạp thêm xu" (đã có).
- Đổi "Danh sách truyện" thành "Về mục lục truyện", dẫn tới trang chi tiết truyện.
- Căn giữa thẻ, cách khoảng giữa các nút (`gap`), định dạng số bằng `toLocaleString('vi-VN')`.

**Nghiệm thu:**
- Màn hình hiện tên truyện và chương.
- Không bấm được mở khóa khi `price === null`.
- Thiếu xu thì hiện đúng số xu còn thiếu.
- Nút quay lại về trang truyện.
- Số dư có dấu chấm tách nghìn.

**Code:** `web/src/features/reader/ChapterReader.tsx` dòng 50–90. Hiện `lockDetails` của lỗi `PAYMENT_002` chỉ có `priceCoins`. Để có tên truyện và chương, cần **backend bổ sung vào `details`** (gợi ý: `novelId`, `novelTitle`, `chapterNumber`, `chapterTitle`) hoặc gọi thêm API metadata truyện.

### UI-03 · Hàng đợi kiểm duyệt và báo cáo khó chọn hồ sơ (hình 28 `h4_19`, hình 30 `h4_23`)

**Hiện trạng:**
- Bảng có hai cột cho mã băm: "Mã kiểm duyệt" ở cột đầu và "Mã đối tượng".
- Tên nội dung chỉ nằm ở dòng phụ, và trong ảnh chỉ hàng đầu tiên có tên ("Mùa Hạ Không Tên").
- Ở hình 30, cả bốn hàng đều ghi "Bình luận · 3 báo cáo · Chờ xử lý", không phân biệt được.
- "Nguồn: Từ khóa" không nói từ khóa nào bị bắt.

**Đề xuất:**
- Cột đầu: tên truyện hoặc chương, hoặc trích đoạn bình luận khoảng 80 ký tự.
- Ngay bên dưới: loại nội dung, lý do hoặc từ khóa bị bắt, số lượt báo cáo.
- Thêm cột "Đã chờ" (thời gian từ lúc tạo).
- Hai mã chuyển về trang chi tiết, hoặc gom vào một cột phụ thu gọn có nút sao chép.
- Trang chi tiết (hình 29) nên hiện thêm thể loại, độ tuổi, ảnh bìa, danh sách chương. Nút "Từ chối" cần ô nhập lý do. *(R3)*

**Nghiệm thu:**
- Nhìn danh sách là phân biệt được từng hồ sơ mà không cần mở chi tiết.
- Mã không còn là cột đầu.

**Code:** `web/src/features/admin/AdminModerationPage.tsx` dòng 110–146. Giao diện đã hiển thị `targetTitle || summary || reason`, nhưng **dữ liệu trả về thiếu các trường này cho bình luận và mục bị bắt theo từ khóa**. Cần backend trả `targetTitle` hoặc `excerpt` và `matchedKeyword`.

### UI-04 · Bảng Story Brain (hình 21 `h4_24`, nút ở hình 19 `h4_13`)

**Hiện trạng:**
- Bảng rộng khoảng nửa màn hình nhưng có 11 tab. Nhãn như "Quan hệ (0 khóa)", "Sự kiện (47)" phải xuống 2–3 dòng.
- Tab đang chọn là "Chờ duyệt (0)", nhưng phần nổi bật đầu tiên lại là ô nhập "Danh sách tăng cường" (tùy chọn). Tác giả không biết ngay mình có việc cần xử lý hay không.
- Thuật ngữ nội bộ hiện ra cho người dùng: "Hồ sơ Codex", "Full auto", "BỘ NHỚ CHÍNH THỨC V29".
- Tên nút "Story Brain" khác tiêu đề bảng "Bộ nhớ và định hướng tiểu thuyết". Người xem ảnh tĩnh khó phân biệt nút này với "AI hỗ trợ viết". Phần giải thích tiếng Việt chỉ hiện khi rê chuột.

**Đề xuất:**
1. Đầu tab "Chờ duyệt": trạng thái rõ ràng, ví dụ "Không có đề xuất chờ duyệt" kèm nút "Phân tích lại chương đang mở". Thu gọn "Danh sách tăng cường" và "Khai báo thực thể" vào mục mở rộng.
2. Gom 11 tab thành 3–4 nhóm, hiện số lượng bằng huy hiệu:
   - **Chờ duyệt**
   - **Tra cứu**: Nhân vật, Quan hệ, Địa danh, Vật phẩm, Dữ kiện, Sự kiện
   - **Thiết lập**: Trích xuất, Định hướng, Tự động
3. Đổi tên nút và tiêu đề cho khớp nhau. Dùng hai nhãn song song: **"Bộ nhớ cốt truyện"** (dữ kiện của tác phẩm) và **"Trợ lý viết"** (gửi yêu cầu cho AI).
4. Việt hóa "Hồ sơ Codex" và "Full auto". Ẩn số phiên bản bộ nhớ hoặc chuyển vào tooltip.

**Nghiệm thu:**
- Không còn nhãn tab nào xuống dòng ở 1440px.
- Mở bảng là thấy ngay có hay không có việc chờ duyệt.
- Không còn chữ tiếng Anh hay số phiên bản nội bộ trên giao diện.

**Code:**
- `web/src/features/ai-copilot/AuthorMemoryPanel.tsx` dòng 499–516 (danh sách tab), dòng 475 (huy hiệu phiên bản).
- `web/src/features/author-ide/AuthorWritingIde.tsx` dòng 1186–1200 (nút `btn-story-brain`).

### UI-05 · Nhãn tiếng Anh hoặc mã nội bộ hiện cho người dùng

| Vị trí | Hiện tại | Đề xuất | Code (`cc1a0a99`) |
|---|---|---|---|
| Admin diễn đàn · h35 | Huy hiệu `VISIBLE` (in thẳng `topic.status`) ngay dưới bộ lọc "Hiển thị" | "Đang hiển thị" / "Đã ẩn" / "Đã xoá" | `web/src/features/discussions/AdminDiscussionsPage.tsx` dòng 160, 297. `AdminShared.tsx` dòng 55 đã có bảng nhãn nhưng trang này không dùng |
| Bookmark · h10 và menu | "Bookmark" | "Đoạn đã đánh dấu" | `reader/ReaderCollectionsLayout.tsx:5`, `reader/HomeSidebar.tsx:159`, `reader/ChapterReadingWorkspace.tsx:105` |
| Admin · h31 | "Thể loại & Tag" | "Thể loại và thẻ" | `admin/AdminShell.tsx:20`, `admin/AdminTaxonomyPage.tsx:44` |
| Ảnh bìa mặc định · h4 | "STORYCRAFT · ORIGINAL", "A STORY TO DISCOVER" | Bỏ, hoặc Việt hóa | `reader/ReaderCatalog.tsx:473–479` |
| Story Brain · h21 | "Hồ sơ Codex", "Full auto" | Xem UI-04 | `ai-copilot/AuthorMemoryPanel.tsx` |
| Cẩm nang · h23 | "Xuất file Bible" | "Xuất cẩm nang" | – |
| Nhật ký quản trị · h33 | Ô nhập tự do "Mã thao tác", ví dụ `USER_LOCK` | Dropdown nhãn tiếng Việt (bảng nhãn đã có ở `AdminShared.tsx:71`) | `admin/AdminAuditPage.tsx:163` |

**Nghiệm thu:** rà toàn bộ các chuỗi trên; không còn chữ tiếng Anh hay mã enum hiện ra ở 35 màn hình đã chụp.

### UI-06 · Đặt lại bộ lọc xóa luôn từ khóa (hình 5, `h4_27_timkiem`)

**Hiện trạng:**
- `handleReset()` đặt lại toàn bộ trạng thái về mặc định, kể cả `keywords`.
- Ví dụ: độc giả tìm theo tên truyện, bỏ lọc thể loại, thì phải nhập lại tên.
- Hàm này gắn vào ba nút: "↻ Đặt lại bộ lọc" (dòng 389–391), "Xóa bộ lọc" trên thanh chip (dòng 444–445), "Đặt lại bộ lọc" (dòng 520–521).

**Đề xuất:**
- "Đặt lại bộ lọc" và "Xóa bộ lọc" chỉ xóa tình trạng, thể loại, tag; giữ từ khóa; cập nhật kết quả ngay.
- Nếu cần xóa cả từ khóa, dùng nút riêng tên "Xóa toàn bộ".

**Nghiệm thu:** nhập từ khóa, chọn thể loại, bấm "Đặt lại bộ lọc" → từ khóa còn nguyên, kết quả lọc theo từ khóa.

**Code:** `web/src/features/reader/SearchResultsPage.tsx` dòng 146–149.

### UI-07 · Số liệu không khớp giữa các trang (cần xác minh)

| Đối tượng | Trang A | Trang B |
|---|---|---|
| "Hành Trình Của Mây": số chương | Chi tiết truyện (h6): **9** | Thư viện (h9), BXH trang chủ (h3): **12** |
| "Hành Trình Của Mây": lượt đọc | Chi tiết (h6): **1**; BXH (h3): **1** | Thư viện (h9): **2** |
| Tổng xu đã nạp | Admin tổng quan (h25): **0** | Ví độc giả (h12): giao dịch nạp **+500**, "Tổng Xu đã nạp 500" |

Bên đánh giá dễ coi đây là lỗi. Cần xác định mỗi chỉ số đếm theo cách nào: chỉ chương đã xuất bản hay cả bản nháp; lượt đọc lưu trong bộ nhớ đệm hay số thực; nạp thử nghiệm có tính vào tổng không. Sau đó thống nhất cách đếm, hoặc ghi rõ ý nghĩa (ví dụ "Tổng Xu đã nạp (không gồm nạp thử nghiệm)").

**Nghiệm thu:** cùng một chỉ số cho ra cùng một giá trị ở mọi trang, hoặc nhãn nói rõ vì sao khác.

---

## P2: chi tiết

### UI-08 · Hành động nguy hiểm quá nổi bật

- **Người dùng (h26):** nút đỏ "Khóa tài khoản" ở mọi dòng, kể cả tài khoản quản trị viên. Nên chuyển vào menu ⋯ và ẩn với chính mình hoặc với quản trị viên khác.
- **Rút xu (h32):** "Duyệt" và "Từ chối" bấm thẳng trên dòng. Cần kiểm tra đã có hộp xác nhận chưa; nếu chưa, thêm xác nhận ghi rõ số xu, người nhận và tài khoản.
- **Thể loại và thẻ (h31):** "Xóa" là nút xám, trong khi "Sửa" và "Gộp" là link cam; còn ở trang Người dùng, "Khóa" lại màu đỏ. Nên thống nhất một kiểu cho hành động phá hủy.
- **Thư viện:** xem UI-01.

### UI-09 · Hàng "Đọc tiếp" trên trang chủ (hình 3, `h4_02_trangchu`)

"Đọc tiếp" đặt đúng chỗ, nhưng chỉ là một thẻ nhỏ ở đầu hàng rộng, bên phải trống. Hai nút trong banner "Khám phá truyện" lại dễ thấy hơn. Nên biến cả hàng thành một lối quay lại rõ ràng: ảnh bìa, tên truyện, chương đang đọc, thanh tiến độ và nút "Đọc tiếp" trên cùng một hàng. Nếu có nhiều truyện đang đọc dở, hiện 2–3 thẻ ngang. *(R1 R3)*

### UI-10 · Định dạng và chính tả không thống nhất

- **Ngày giờ có ít nhất 4 kiểu:**
  - "3 phút trước" (trang chủ)
  - `09:49:32 26/11/2026` (Lịch sử đọc, Thông báo: có cả giây)
  - `09:48 26/11/2026` (Ví)
  - `17:29 20/11/26` (Admin: năm 2 chữ số)

  → Dùng thời gian tương đối trong danh sách, `HH:mm dd/MM/yyyy` ở chi tiết. Gom vào một hàm định dạng dùng chung.
- **Số:** "1480 xu" và "1.480"; "0/2.000" và "0/10000 ký tự".
- **Chính tả và hoa thường:** "Xóa" và "Xoá" (h31 so với h35); "Xu" và "xu".

### UI-11 · Màu, control và bố cục không thống nhất

- **Trạng thái:** "Chờ duyệt" màu cam ở Danh sách tác phẩm (h16) nhưng xám ở trang quản lý truyện (h17). "Chờ duyệt" và "Đang sáng tác" trùng màu cam.
- **Dropdown:** bên độc giả dùng mũi tên ⌄, bên admin dùng mũi tên lên–xuống mặc định của trình duyệt.
- **Font:** chỉ Diễn đàn (h14, h15) dùng font có chân cho tiêu đề. Diễn đàn còn thêm màu xanh lá và tím nằm ngoài bảng màu (khung "Đáng chú ý", "Đang được quan tâm").
- **Độ rộng trang:** Thông báo khoảng 840px, Diễn đàn khoảng 1220px, Thư viện gần full màn hình. Nên chọn 2 mức rộng chuẩn.

Nếu font có chân ở Diễn đàn là chủ ý, ghi lại vào `docs/Frontend/design-system.md`.

### UI-12 · Trang admin Diễn đàn lệch khuôn (hình 35, `h4_33`)

So với các trang admin khác, trang này có tiêu đề nhỏ hơn, không có khung bộ lọc hay ô tìm kiếm, không có nút "Làm mới dữ liệu". Cột thao tác chứa 2 biểu tượng cộng "Ẩn" và "Xoá" nên bị xuống hai dòng, làm hàng cao gấp đôi. Thanh chọn "Hiển thị / Đã ẩn / Đã xoá" kéo hết chiều ngang. Nên dùng chung khung với `AdminModerationPage` (bộ lọc, bảng, phân trang) và gom thao tác vào menu ⋯. Huy hiệu `VISIBLE`: xem UI-05.

### UI-13 · Thanh công cụ Author IDE quá tải (hình 18–22)

- Ba hàng công cụ với khoảng 35 nút, nhiều biểu tượng không có chữ (🖥, chữ A, lịch sử).
- Hai nút chính màu cam cạnh tranh nhau: "Viết bản thảo" ở hàng trên, "Gửi duyệt chương" ở hàng dưới.
- AI có 4 lối vào: Lập kế hoạch, Viết bản thảo, AI hỗ trợ viết, Story Brain.

**Đề xuất:**
- Một nút chính duy nhất theo trạng thái chương (bản nháp → "Gửi duyệt chương").
- Gom các lệnh AI vào một nút "Trợ lý viết ▾"; "Bộ nhớ cốt truyện" để riêng (xem UI-04).
- Thêm tooltip và `aria-label` cho mọi nút chỉ có biểu tượng.

### UI-14 · Thông báo (hình 13, `h4_09`)

"Ai đó đã trả lời trong một thảo luận bạn quan tâm" không cho biết ai trả lời, trong chủ đề nào. Hai thông báo giống hệt nhau nằm riêng. Nhãn "MỚI" và viền trái làm cùng một việc. Nên ghi tên người và tiêu đề chủ đề, gộp các thông báo cùng chủ đề ("Mai Linh và 1 người khác đã trả lời…").

### UI-15 · Chi tiết truyện (hình 6, `h4_03`)

- Không hiện thể loại và tag.
- Mục lục chương, thứ độc giả cần nhất, nằm dưới màn hình đầu tiên. Các tab "Đánh giá · Mục lục · Bình luận" nhỏ, trông như link.
- Bên phải hàng nút còn trống nhiều.
- Nhãn "Hoàn thành" và "16+" xếp chồng dọc.

Nên đặt hai nhãn trên một hàng, thêm thể loại và tag dưới tên tác giả, đưa mục lục lên cao hơn hoặc làm tab rõ ràng.

### UI-16 · Lịch sử bản thảo (hình 20, `h4_26`)

Hộp thoại chỉ có một dropdown "Chọn phiên bản". Nên thay bằng danh sách mốc lưu, mỗi mốc có giờ, số từ, nguồn (tự lưu hay lưu tay), kèm xem trước hoặc so sánh với bản hiện tại trước khi khôi phục.

### UI-17 · Mật độ bảng admin

- **Danh sách truyện (h27):** "Xem nhanh" và "Chi tiết →" xếp dọc làm mỗi hàng cao khoảng 90px. Nên đặt trên cùng một hàng hoặc gom vào menu ⋯.
- **Thể loại và thẻ (h31):** mỗi mục là một thẻ cao, một màn hình chỉ thấy 7 trên 52 tag, không có ô tìm kiếm. Nên dùng bảng gọn có tìm kiếm.
- **Mọi bảng admin:** hai dòng "▸ Bộ lọc đã lưu" và "▸ Cột hiển thị" chiếm khoảng 90px chiều cao. Có thể gom vào một nút "Tùy chọn bảng".
- Bộ lọc dạng chip "Chờ xử lý ×" lặp lại giá trị đã chọn trong dropdown ngay phía trên.

---

## P3: ghi nhận để làm khi tiện

### UI-18 · Duyệt truyện
- "Chương mới cập nhật" (h2, h3) lặp một truyện 3–5 dòng liền nhau. Nên gom theo truyện: "Ashenhold – 5 chương mới".
- Nhãn "Mới" ở mọi thẻ danh sách (h4) nên không còn ý nghĩa.
- Thể loại và tag trùng nhau trong bộ lọc: Cultivation/cultivation, Cyberpunk, Đời thường. Đây vừa là việc dọn dữ liệu, vừa nên được cảnh báo ở trang admin.
- Hai kiểu bộ lọc khác nhau: cột checkbox bên phải ở Danh sách (h4), hàng chip ở Tìm kiếm (h5). Trang Tìm kiếm có thêm ô tìm kiếm thứ hai trong khi header đã có sẵn.

### UI-19 · Điều hướng
- Breadcrumb của Thư viện và Lịch sử đọc ghi "Danh sách truyện › …" là sai cấp (`readerHomeCrumb` trong `web/src/shared/components/navigation.ts:12`). Trang Bookmark lại không có breadcrumb.
- Menu phụ Thư viện / Bookmark / Lịch sử nằm bên phải, cách bố trí không phổ biến.
- Header tác giả và admin có cả ô tìm kiếm lẫn biểu tượng 🔍; các biểu tượng 🖥 và ⌨ không có nhãn.
- Trang đọc chương (h7): thanh công cụ nổi chỉ có biểu tượng, không có thanh trên cùng để thoát ra.
- Sidebar admin có link "Xem trang tác giả" (`admin/AdminShell.tsx:140`); với quản trị viên, "Về trang chủ" hợp lý hơn.

### UI-20 · Tác giả
- Chữ lặp: mục lục ghi "CHƯƠNG 2 / Chương 2"; thẻ tác phẩm ghi "Ch. 10: Chương 10: …".
- Danh sách tác phẩm (h16) có 8 nút "Viết tiếp" cam đậm; bảng chương (h17) có nút "Mở Studio" cam ở mỗi dòng. Nên dùng kiểu nút phụ.
- "Gửi duyệt" (h17) bị vô hiệu mà không giải thích vì sao. "Sắp xếp chương" cũng vậy. Cần tooltip.
- Cẩm nang (h23): dải "Gộp hai tên trùng" không rõ là cảnh báo hay nút. Nên ghi tên nào trùng tên nào.
- Bộ lọc "Tuyến chính/phụ/Phản diện" không khớp nhãn vai trò "Quần chúng / Then chốt"; bản thân nhãn này cũng tự mâu thuẫn.

### UI-21 · Khả năng tiếp cận và mobile
- Chữ phụ màu xám trên nền kem, placeholder và nút bị vô hiệu ("Gửi bình luận", "Gửi duyệt") có độ tương phản thấp. Cần kiểm tra theo WCAG AA (4.5:1).
- Huy hiệu chữ 11–12px như "Đang ra", "Chờ xử lý" khó đọc khi thu ảnh vào báo cáo.
- **Chưa có ảnh khổ điện thoại.** Với nền tảng đọc truyện, nên chụp và rà riêng các màn hình độc giả ở 375px.

### UI-22 · Hai tên thương hiệu (cần sản phẩm quyết định)
Trang đầu PDF đã giải thích StoryCraft là tên giao diện của Ephurin (R1 cho là đủ). Tuy vậy, ngay trong giao diện vẫn lẫn cả hai tên: "Nội quy diễn đàn Ephurin" (h14), "Trợ lý sáng tác AI • Ephurin", "EPHURIN AI" (h22), còn các chỗ khác ghi StoryCraft. Nếu không đổi trước Chương 4 thì giữ nguyên; về lâu dài nên chốt một tên.

---

## Chỗ các review khác nhau, đã đối chiếu

| Điểm | R1 / R2 nói | Thực tế khi kiểm tra |
|---|---|---|
| Số dư ở màn hình VIP | R1: "1.480 xu" | Ảnh và code hiện **"1480 xu"** (`{balance}` không định dạng). Đưa vào UI-02e |
| Nhãn nút xóa bộ lọc ở Tìm kiếm | R2: "Xóa bộ lọc" | Có **ba** nút cùng gọi `handleReset()`: hai nút "Đặt lại bộ lọc" và một nút "Xóa bộ lọc" trên thanh chip. Sửa cả ba (UI-06) |
| Story Brain | R1: gom tab, đưa trạng thái chờ duyệt lên đầu. R2: đổi nhãn nút thành "Bộ nhớ cốt truyện" / "Trợ lý viết" | Không mâu thuẫn, đã gộp vào UI-04 |
| Danh sách kiểm duyệt | R2: tên nội dung nằm ở dòng phụ | Đúng, nhưng phần lớn hàng **không có** tên vì dữ liệu thiếu `targetTitle`. Cần sửa cả backend (UI-03) |
| Ảnh mới ở `C:\Users\Laptop\Downloads\Chuong4_anh` | R2 không truy cập được | R1 và R3 đã xem đủ 35 ảnh qua PDF |

---

## Phụ lục: ghi chú cho báo cáo Chương 4 (không phải việc của dev)

- Đặt một câu trước nhóm hình đầu tiên: *"Các hình trong chương được chụp từ phiên bản cc1a0a99 trên dữ liệu thử nghiệm. Giao diện sử dụng tên StoryCraft, còn báo cáo sử dụng tên Ephurin. Một số tác phẩm mẫu có tên tiếng Anh như "Sample Story"."*
- Chú thích ngay dưới hai hình AI (h4_24, h4_25): *"Trạng thái vừa mở công cụ với dữ liệu của tác phẩm thử nghiệm, trước khi tác giả gửi yêu cầu sinh nội dung."*
- Hình 21 (Story Brain) và hình 28 (hàng đợi kiểm duyệt) nên có thêm ảnh cắt phóng to phần tab và vài hàng đầu, vì chữ nhỏ và nhiều nhãn sát nhau.
- Hình 22 (trợ lý AI) giữ nguyên toàn màn hình, vì giá trị của ảnh là thấy bản thảo và trợ lý AI cùng lúc.
- Nếu sửa xong các mục P1 trước khi nộp, cần chụp lại các hình 4, 5, 8, 9, 10, 21, 23, 28, 30, 31, 33, 35 (thêm 3, 6, 12, 25 nếu UI-07 làm thay đổi số liệu).
