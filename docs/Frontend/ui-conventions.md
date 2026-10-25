# Quy ước giao diện StoryCraft (web)

Tài liệu này ghi lại các quy ước dùng chung của giao diện web hiện tại (theme StoryCraft, tông cam ấm), áp dụng cho cả màn hình **tác giả**, **độc giả** và **khách**. Đọc trước khi thêm hoặc sửa màn hình, vì nhiều thứ dưới đây là CSS toàn cục: sửa một chỗ sẽ đổi ở mọi trang.

> `design-system.md` mô tả giao diện tối tông tím của giai đoạn trước và **không còn đúng**. Khi hai tài liệu khác nhau, theo tài liệu này.

## 1. Nơi đặt style

| File | Vai trò |
| :--- | :--- |
| `web/src/theme/storycraft.css` | Biến màu `--sc-*` (sáng/tối), class layout (`sc-navbar`, `sc-shell-content`, `sc-novel-overview`, `sc-novel-metrics`, `sc-novel-card`...) |
| `web/src/theme/color-mode.css` | Màu cho component Mantine và form trong theme |
| `web/src/theme/refinements.css` | **Nạp sau cùng** (trong `main.tsx`), ghi đè màu chế độ sáng, chuẩn hoá nút, dropdown, ô nhập và trang hồ sơ tác giả |
| `web/tailwind.config.cjs` | Ánh xạ class Tailwind (`primary-*`, `stone-*`, `surface-*`, `red/amber/emerald-*`) sang biến `--sc-*` |

### Màu đang nằm ở hai nơi
`refinements.css` ghi đè các biến chế độ sáng sau: `--sc-primary-rgb`, `--sc-primary-hover-rgb`, `--sc-primary-text-rgb`, `--sc-on-primary-rgb`, `--sc-control-border`, `--sc-control-border-hover`.

- Muốn đổi màu cam hoặc màu viền ở chế độ sáng: **sửa trong `refinements.css`**. Sửa trong `storycraft.css` sẽ không có tác dụng.
- Chế độ tối vẫn lấy từ `storycraft.css` (riêng viền và màu chữ trên nút cam được chỉnh trong `refinements.css`).
- Việc cần làm sau: gộp các giá trị này về `storycraft.css` để chỉ còn một nguồn.

Màu hiện tại (chế độ sáng): cam `#dc8363`, cam khi rê chuột `#c96f4f`, chữ cam `#b85f42`, chữ trên nút cam màu trắng, viền ô nhập `#ddd8d0`.

Không viết mã màu cứng trong component. Dùng class Tailwind (`bg-primary-600`, `text-stone-500`...) hoặc `var(--sc-*)`.

## 2. Nút

Mọi `button` và link dạng nút (`a` có class `inline-flex`) bên trong theme đều được chuẩn hoá: **cao 34px, chữ 13px đậm vừa, bo góc 8px, không đổ bóng**.

| Kiểu | Class | Dùng khi |
| :--- | :--- | :--- |
| Chính | `sc-button sc-button-primary` | Hành động chính của khu vực. Mỗi khu vực chỉ nên có **một** nút chính. |
| Nhạt | `sc-button sc-button-soft` | Hành động phụ có nhấn (Thêm vào thư viện, Đọc, Bình luận). |
| Thường | `sc-button` | Hành động phụ (Thích, Chương trước, Mục lục). |
| Nguy hiểm | `sc-button text-red-700` | Báo cáo, xoá. Giữ chữ đỏ trên nền trắng. |
| Chỉ icon | `sc-button sc-button-icon` kèm `aria-label` | Chia sẻ, thao tác thu gọn. |
| Ủng hộ | `sc-button sc-button-support` | Ủng hộ tác giả (nền vàng nhạt). |

Icon bên trong nút: `<span className="material-symbols-outlined" aria-hidden="true">tên_icon</span>`, cỡ tự động 17px.

Lưu ý:
- Nút mới **dùng các class trên**, không tự ghép class Tailwind màu cho nút.
- Cần nút nhỏ hơn 34px (tag bấm được, icon trong bảng): phải tự ghi đè `min-height`. Nút trong ô bảng (`td`) đã tự nhỏ còn 30px. Tab lọc `.sc-filter-tabs > button` đã có ngoại lệ 28px.
- Trong `.sc-novel-card`, nút có class `bg-stone-50` sẽ hiển thị **trong suốt** (chỉ icon kèm chữ, như nút "Quản lý"). Muốn nút có viền trong thẻ truyện thì dùng `sc-button`.
- Nút Mantine trong theme dùng cùng bo góc. Kiểu `default` là nút thường, `subtle` là chữ cam.

## 3. Ô nhập và dropdown

- `<select>` trong theme tự có mũi tên riêng (cao 34px, chữ 13px, viền nhạt). **Phần tử `.material-symbols-outlined` đặt ngay sau `<select>` sẽ bị ẩn**, để tránh hai mũi tên chồng nhau.
- Ô nhập, textarea, dropdown và ô Mantine dùng viền `--sc-control-border`. Khi focus: viền cam kèm quầng cam nhạt.
- Thanh lọc theo trạng thái dùng tab: `div.sc-filter-tabs` chứa các `button`. Nút đang chọn: `bg-primary-600 text-white`.

## 4. Khung trang và navbar

- **Khung:** người dùng vai trò `AUTHOR` và `READER` vào các route trong `WebAppShell` đều nhận `AuthorTheme`, `AuthorNavbar` và `main.sc-shell-content` (rộng tối đa 1240px, padding 24px). `ADMIN` vẫn dùng khung cũ.
- **Trang trong khung** (`/reader/...`, `/notifications`, `/profile/me`): **không** tự gắn navbar hay thêm container `max-w-*` có padding. Khung đã có sẵn.
- **Trang ngoài khung** (`/wallet`, `/authors/:id`, `/author/...`, `/public/...`): tự bọc `AuthorTheme` (trong `router.tsx`) và tự gắn `<AuthorNavbar />` một lần.
- **`AuthorNavbar` đổi menu theo vai trò:**
  - Tác giả/Admin: Tác phẩm · Ví & doanh thu · Trang tác giả, cùng nút "Viết tiếp".
  - Độc giả: Khám phá · Thư viện · Lịch sử đọc · Ví xu.
  - Khách: Thư viện công khai, cùng nút Đăng nhập.

  Mục chỉ dành cho tác giả phải đặt trong nhánh `isWriter`.
- Đăng xuất nằm trong menu avatar (`data-testid="shell-logout-btn"`). Script E2E phải mở menu avatar trước khi bấm.

## 5. Thành phần trang

| Thành phần | Cách làm |
| :--- | :--- |
| Tiêu đề trang | Breadcrumb chữ hoa nhỏ (`text-meta uppercase tracking-wider`) kèm `h1` (`font-headline-sm text-2xl md:text-3xl font-bold`) |
| Thẻ (card) | `bg-surface-container-lowest rounded-xl border border-stone-200/80 shadow-2xs` |
| Thẻ truyện | `sc-novel-card`: bìa tỉ lệ 2:3 rộng 76–96px, thể loại, nhãn trạng thái, tiêu đề tối đa 2 dòng, số liệu, chân thẻ có nút |
| Thông tin truyện | `sc-novel-overview`, `sc-novel-identity`, `sc-novel-cover`, `sc-novel-metrics` (mặc định 6 cột; ít số liệu hơn thì đặt `gridTemplateColumns`) |
| Nhãn trạng thái | `sc-novel-status` (thêm `sc-novel-status-public` cho trạng thái xanh), hoặc `span.inline-flex.rounded-full` với `bg-primary-50/emerald-50/amber-50` |
| Thể loại, thẻ | `sc-genre-tag` |
| Đang tải / lỗi / trống | `LoadingState`, `ErrorState`, `EmptyState` trong `shared/components/PageStates.tsx` |

## 6. Component dùng chung giữa tác giả và độc giả

`NovelEngagement` (đánh giá, theo dõi truyện), `CommentsSection` và `CommentThread` (bình luận), `NovelReviews`, `PageStates` và `AuthorNavbar` đều xuất hiện ở cả trang tác giả lẫn trang độc giả. Khi sửa các component này, **kiểm tra cả hai phía**.

## 7. Nội dung và kiểm thử

- Chữ trên giao diện viết bằng **tiếng Việt**.
- Giữ nguyên `data-testid` khi sửa giao diện; script E2E trong `scripts/` dựa vào chúng. Riêng hai option `Serif` và `Sepia` trong tùy chỉnh đọc được script chọn theo chữ, không đổi tên.
- Hiển thị tên chương bằng dạng `Chương N: tên`, bỏ tiền tố "Chương N:" lặp lại nếu dữ liệu đã có sẵn.
- Không hiển thị dữ liệu mà API không trả về (huy hiệu, địa điểm, câu trích dẫn...). Cần thì bổ sung API trước.
- Trước khi mở PR giao diện: chạy `npm run typecheck` trong `web/`, rồi xem thử trên trình duyệt ở desktop và 375px với tài khoản tác giả, độc giả và khách (tài khoản mẫu có trong seed `backend/src/scripts/`).

## 8. Đã biết, chưa xử lý

- Chữ trắng trên nền cam `#dc8363` có độ tương phản khoảng 2,9:1, thấp hơn mức 4,5:1 khuyến nghị cho chữ nhỏ. Cần cân nhắc làm đậm màu cam nếu ưu tiên khả năng đọc.
- Giao diện admin chưa chuyển sang StoryCraft.
- Màu chế độ sáng chưa được gộp về `storycraft.css` (xem mục 1).
