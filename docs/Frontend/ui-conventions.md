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
`refinements.css` ghi đè các biến chế độ sáng sau: `--sc-primary-rgb`, `--sc-primary-hover-rgb`, `--sc-primary-text-rgb`, `--sc-primary-text-strong-rgb`, `--sc-control-border`, `--sc-control-border-hover`.

- Muốn đổi màu cam hoặc màu viền ở chế độ sáng: **sửa trong `refinements.css`**. Sửa trong `storycraft.css` sẽ không có tác dụng.
- Chế độ tối vẫn lấy từ `storycraft.css`. Riêng viền ô nhập và `--sc-primary-text-strong-rgb` được chỉnh trong `refinements.css`.
- Màu chữ trên nút cam (`--sc-on-primary-rgb`, màu tối `#241915`) chỉ đặt trong `storycraft.css` và dùng cho cả hai chế độ.
- Việc cần làm sau: gộp các giá trị này về `storycraft.css` để chỉ còn một nguồn.

Màu hiện tại (chế độ sáng):
- Cam `#dc8363`, cam khi rê chuột `#c96f4f`.
- Chữ cam `#a9573a`; chữ cam của nút nhạt khi rê chuột `#9b4930`.
- Chữ trên nút cam dùng màu tối `--sc-on-primary`, **không dùng chữ trắng**.
- Viền ô nhập `#ddd8d0`.

Không viết mã màu cứng trong component. Dùng class Tailwind (`bg-primary-600`, `text-stone-500`...) hoặc `var(--sc-*)`.

### Độ tương phản
- Chữ thường phải đạt **≥ 4,5:1** so với nền (WCAG AA).
- Chữ trắng trên nền cam `#dc8363` chỉ đạt khoảng 2,8:1. Vì vậy nút cam và mọi nền cam đặc dùng chữ tối `--sc-on-primary`: đạt 6,1:1, và 4,8:1 khi rê chuột.
- Mọi phần tử `.bg-primary`, `.bg-primary-500/600/700` bên trong theme đều bị ép sang chữ tối, kể cả khi markup ghi `text-white`. Điều này áp dụng cho số đếm, avatar và tab đang chọn.
- `npm run test:contrast` (trong `web/`, file `web/tests/contrast.test.mjs`) đọc token từ `storycraft.css` rồi `refinements.css` và kiểm 9 cặp chữ/nền ở cả sáng lẫn tối. **Đổi token màu nào thì chạy lại**; thêm cặp mới vào `pairs` nếu bạn tạo nhãn trên một nền mới.
- Test chưa kiểm `--sc-muted-rgb`. Xem mục 8.

## 2. Nút

Mọi `button` và link dạng nút (`a` có class `inline-flex`) bên trong theme đều được chuẩn hoá: **cao 34px, chữ 13px đậm vừa, bo góc 8px, không đổ bóng**.

| Kiểu | Class | Màu chữ / nền | Dùng khi |
| :--- | :--- | :--- | :--- |
| Chính | `sc-button sc-button-primary` | Chữ tối `--sc-on-primary` trên cam (6,1:1; rê chuột 4,8:1) | Hành động chính của khu vực. Mỗi khu vực chỉ nên có **một** nút chính. |
| Nhạt | `sc-button sc-button-soft` | Chữ cam `#a9573a` trên cam nhạt (4,6:1); rê chuột chữ đậm hơn `#9b4930` | Hành động phụ có nhấn (Thêm vào thư viện, Đọc, Bình luận). |
| Thường | `sc-button` | Chữ thường trên nền trắng | Hành động phụ (Thích, Chương trước, Mục lục). |
| Nguy hiểm | `sc-button text-red-700` | Chữ đỏ `--sc-danger` trên nền trắng | Báo cáo, xoá. |
| Chỉ icon | `sc-button sc-button-icon` kèm `aria-label` | Như nút thường | Chia sẻ, thao tác thu gọn. |
| Ủng hộ | `sc-button sc-button-support` | Chữ `--sc-warning` trên nền vàng nhạt | Ủng hộ tác giả. |

Icon bên trong nút: `<span className="material-symbols-outlined" aria-hidden="true">tên_icon</span>`, cỡ tự động 17px.

Lưu ý:
- Nút mới **dùng các class trên**, không tự ghép class Tailwind màu cho nút. Không thêm `text-white` lên nền cam (xem "Độ tương phản").
- Nút **chỉ có icon**, hoặc nút có chữ bị ẩn ở màn hẹp (`hidden sm:inline`), phải có `aria-label` (nên thêm cả `title`). Ví dụ: Báo cáo, Lưu tiến độ, Đọc từ đầu ở 375px.
- Cần nút nhỏ hơn 34px (tag bấm được, icon trong bảng): phải tự ghi đè `min-height`. Nút trong ô bảng (`td`) đã tự nhỏ còn 30px. Tab lọc `.sc-filter-tabs > button` đã có ngoại lệ 28px.
- Trong `.sc-novel-card`, nút có class `bg-stone-50` sẽ hiển thị **trong suốt** (chỉ icon kèm chữ, như nút "Quản lý"). Muốn nút có viền trong thẻ truyện thì dùng `sc-button`.
- Nút Mantine trong theme dùng cùng bo góc. Kiểu `default` là nút thường, `subtle` là chữ cam.

## 3. Ô nhập và dropdown

- `<select>` trong theme tự có mũi tên riêng (cao 34px, chữ 13px, viền nhạt). **Phần tử `.material-symbols-outlined` đặt ngay sau `<select>` sẽ bị ẩn**, để tránh hai mũi tên chồng nhau.
- Ô nhập, textarea, dropdown và ô Mantine dùng viền `--sc-control-border`. Khi focus: viền cam kèm quầng cam nhạt.
- Thanh lọc theo trạng thái dùng tab: `div.sc-filter-tabs` chứa các `button`. Nút đang chọn: `bg-primary-600`. Chữ tự chuyển sang tối; `text-white` cũ nếu còn sẽ bị ghi đè.

## 4. Khung trang và navbar

- **Khung:** người dùng vai trò `AUTHOR` và `READER` vào các route trong `WebAppShell` đều nhận `AuthorTheme`, `AuthorNavbar` và `main.sc-shell-content` (rộng tối đa 1240px, padding 24px). `ADMIN` dùng `AdminShell` (từ PR #74).
- **Trang trong khung** (`/reader/...`, `/notifications`, `/profile/me`): **không** tự gắn navbar hay thêm container `max-w-*` có padding. Khung đã có sẵn.
- **Trang ngoài khung** (`/wallet`, `/authors/:id`, `/author/...`, `/public/...`): tự bọc `AuthorTheme` (trong `router.tsx`) và tự gắn `<AuthorNavbar />` một lần.
- **Trang công khai** (`/public/...`, hồ sơ tác giả `/authors/:id`): khách xem được mà không cần đăng nhập.
  - Hồ sơ tác giả bọc `OptionalSession` thay vì `AuthGate`: có token thì vẫn khôi phục phiên, không có thì hiển thị cho khách.
  - Với khách, mọi link trên trang phải trỏ về `/public/...`. Nút theo dõi và ủng hộ đổi thành "Đăng nhập để theo dõi".
  - API ghi dữ liệu vẫn bắt đăng nhập (401).
- **`AuthorNavbar` đổi menu theo vai trò:**
  - Tác giả/Admin: Tác phẩm · Ví & doanh thu · Trang tác giả, cùng nút "Viết tiếp".
  - Độc giả: Khám phá · Thư viện · Lịch sử đọc · Ví xu.
  - Khách: Thư viện công khai, cùng nút Đăng nhập.

  Mục chỉ dành cho tác giả phải đặt trong nhánh `isWriter`.
- Đăng xuất nằm trong menu tài khoản (`data-testid="shell-logout-btn"`). Nút avatar của `AuthorNavbar` có `data-testid="shell-avatar-btn"`; nút tài khoản của `AdminShell` là `.admin-account-button`. Script E2E phải bấm nút mở menu trước, chờ menu hiện ra rồi mới bấm Đăng xuất.
- **Điểm neo phiên cho E2E:** `SessionMarker` (`AuthorTheme.tsx`) render `<span hidden data-testid="shell-session" data-user-role="…" data-username="…">`.
  - Có mặt trong `AuthorNavbar` khi đã đăng nhập, trong `AdminShell` của admin, và trong topbar cũ của `WebAppShell`.
  - Script đọc vai trò và tên đăng nhập từ đây, không đọc chữ trên topbar. `.web-topbar` chỉ còn ở khung admin.
  - Khung mới nào thay navbar cũng phải giữ điểm neo này.
- Menu avatar là `Menu` của Mantine, dùng được bằng bàn phím:
  - Enter/Space mở menu (`aria-expanded`, `aria-haspopup="menu"`); mũi tên lên/xuống đi vòng qua các mục; Esc đóng menu và trả focus về nút avatar.
  - Tab khi menu đang mở thì focus vẫn nằm trong menu (bẫy focus mặc định của Mantine).

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
- Khung đọc chương có class `sc-reading-surface` và nhận màu nền/chữ từ tùy chỉnh đọc. `.chapter-prose` bên trong kế thừa màu đó, không đặt màu riêng.
- Script E2E có ghi dữ liệu **không được chạy trên DB dùng chung** (`ephurin`):
  - Dùng `scripts/e2e_isolated_stack.py`. Module này tạo DB Postgres/Mongo tạm `ephurin_test_*`, chạy backend và web build trên cổng riêng, rồi xoá DB khi kết thúc.
  - Script từ chối chạy (mã 3) nếu thiếu `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, nếu tên DB không phải DB tạm, nếu DB đã tồn tại, hoặc nếu cổng trùng dev stack (4000/5173).
  - Test cho phần này: `python -m unittest scripts/test_e2e_isolated_stack.py`.
  - Smoke giao diện theo vai trò, kích thước và giao diện sáng/tối: `scripts/run_ui_smoke_matrix_e2e.py`.
  - Kiểm tra theo SRS ở mức API: `scripts/run_srs_acceptance_e2e.py`; danh mục test case ở `docs/testing/srs-test-cases.md`.
  - Chạy toàn bộ và xuất bằng chứng (SHA, lệnh, exit code, DB tạm, fingerprint, ảnh): `python scripts/run_e2e_evidence_suite.py --label <tên> --out docs/development/<thư-mục>`.
  - Các script này chỉ chạy trên Windows (`taskkill`, đường dẫn Edge). Khi chạy phải tắt dev server và không dùng web dev, vì fingerprint DB dùng chung phải giữ nguyên.
- Không hiển thị dữ liệu mà API không trả về (huy hiệu, địa điểm, câu trích dẫn...). Cần thì bổ sung API trước.
- Trước khi mở PR giao diện:
  - Chạy `npm run typecheck` và `npm run test:contrast` trong `web/`.
  - Xem thử trên trình duyệt ở desktop và 375px, cả sáng lẫn tối, với tài khoản tác giả, độc giả và khách. Tài khoản mẫu có trong seed `backend/src/scripts/`.
  - Nếu đổi `:root` hoặc CSS toàn cục, xem thêm `/login` và `/admin`.

## 8. Đã biết, chưa xử lý

- Chữ phụ `--sc-muted-rgb` (`text-stone-400/500/600`, `#77736f`) trên nền trang `--sc-bg` chỉ đạt 4,39:1. Trên nền thẻ màu trắng thì đạt 4,7:1. Token này có từ trước và chưa nằm trong `test:contrast`.
- Giao diện admin và trang `/login` chưa chuyển sang StoryCraft. Nút Mantine `light`/`subtle` và badge ở đó còn chữ cam khoảng 3,2–3,6:1.
- Màu chế độ sáng chưa được gộp về `storycraft.css` (xem mục 1).
