# Admin UI redesign — 26/10/2026

Nhánh: `feat/admin-ui-redesign`. Mẫu thiết kế: `docs/design/admin/`.

## Giao diện và file

Khung admin dùng chung nằm ở `web/src/features/admin/AdminShell.tsx`, các thành phần bảng/phân trang/hộp thoại ở `AdminShared.tsx`, CSS giới hạn trong khu vực admin ở `admin.css`. Dùng lại token sáng/tối và font Be Vietnam Pro của ứng dụng. `AdminPage.tsx` giữ các export tương thích; nội dung từng trang đã tách riêng.

| Route | File trong `web/src/features/admin/` |
|---|---|
| `/admin` | `AdminOverviewPage.tsx` |
| `/admin/users` | `AdminUsersPage.tsx` |
| `/admin/novels` | `AdminNovelsPage.tsx` |
| `/admin/novels/:novelId` | `AdminNovelDetailPage.tsx`, `AdminChapterPreview.tsx` |
| `/admin/taxonomy` | `AdminTaxonomyPage.tsx` |
| `/admin/moderation` | `AdminModerationPage.tsx` |
| `/admin/reports` | `AdminReportsPage.tsx`, dùng chung bảng kiểm duyệt |
| `/admin/moderation/:reviewId` | `AdminModerationDetailPage.tsx` |
| `/admin/withdraws` | `AdminWithdrawsPage.tsx` |

## API và hành vi

- Dashboard bổ sung hoạt động 7 ngày theo Asia/Bangkok, số tài khoản/truyện mới và số mục cần xử lý. Tổng coin đã nạp cộng giao dịch `DEPOSIT/SUCCESS`; giữ `mockRevenueCoins` làm alias tương thích cho client cũ.
- Danh sách dùng metadata phân trang từ backend; bộ lọc người dùng theo role/status và truyện theo xuất bản/tiến độ độc lập. `includeDeleted=false` được đọc đúng kiểu boolean; các danh sách có khóa phụ để thứ tự phân trang ổn định.
- `GET /admin/chapters/:chapterId`: xem nội dung chương, kể cả nháp/đã gỡ; yêu cầu role ADMIN. Bảng chương lọc và phân trang trên danh sách chương đã tải trong chi tiết truyện.
- Taxonomy kiểm tra tên rỗng/trùng; việc tạo trùng trả `409`, không ghi đè danh mục hiện có.
- Chi tiết review bổ sung nội dung đối tượng, phiên bản đã gửi kiểm duyệt nếu có, thống kê lý do báo cáo, lý do và thời điểm xử lý. Không đưa raw evidence document vào trình duyệt.
- Giữ nghiệp vụ kiểm duyệt hiện có: duyệt report bình luận gỡ bình luận, từ chối report giữ bình luận; xử lý lại bị từ chối. Không tự áp dụng cơ chế khóa tài khoản/gỡ truyện mới cho report loại khác.
- Yêu cầu rút tiền có lọc trạng thái, phân trang, duyệt/từ chối và lý do từ chối thực tế; hiển thị coin và đích nhận khi xác nhận. Không suy diễn tỷ giá VNĐ hoặc thực hiện chuyển tiền ngân hàng.
- Các thông tin tĩnh không có nguồn trong mẫu (`Super Admin`, `Online`, `Prod`, phiên bản, nhật ký/khẳng định xác minh bản quyền) đã được bỏ hoặc thay bằng dữ liệu tài khoản thực tế.

## Seed local

Từ thư mục `backend`, cung cấp biến môi trường database/JWT như `.env.example`, rồi chạy:

```powershell
npm run db:seed:admin
```

Nếu dùng đúng database local mặc định của `.env.example`, có thể đặt `$env:DOTENV_CONFIG_PATH='.env.example'` trước lệnh trên.

Script đã chạy trên PostgreSQL/MongoDB local: 25 tài khoản, 12 truyện/144 chương, 12 review, 18 report và 12 yêu cầu rút tiền. Dữ liệu thuộc namespace `admin_seed`, ID cố định. Chạy lại không reset dữ liệu tác giả cũ, số dư hoặc quyết định admin đã xử lý. Chỉ chạy ở development/test.

Đăng nhập admin seed: **`admin_seed` / `AdminDemo@2026`**.

## Kiểm chứng

- Build backend/web và kiểm tra TypeScript thành công.
- Hai bộ backend regression xuất bản/kiểm duyệt và report bình luận: **22/22 PASS**, không skip, trên database test riêng.
- API/browser regression mới: **9/9 PASS**. Tự tạo PostgreSQL/MongoDB test, migrate, seed hai lần để kiểm tra tính chạy lại; dọn database sau chạy.
- Kiểm tra cả 9 route ở desktop sáng 1440px và mobile tối 390px: đúng font/cỡ tiêu đề, không tràn ngang document; bảng rộng cuộn ngang trong vùng riêng.
- Kiểm tra thao tác khóa/mở tài khoản, thêm danh mục/trùng tên, xem chương, gỡ/khôi phục truyện, chấp nhận/từ chối report, duyệt/từ chối rút tiền và thay đổi số dư/coin giữ trong database; menu mobile, đổi theme và giữ tùy chọn qua tải trang.
- Ảnh từng trang ở thư mục này; `browser-checks.json` ghi các nhóm kiểm tra và database test đã dọn. Dữ liệu trong ảnh là seed của database test riêng.

Chạy lại từ `web` (cần PostgreSQL/MongoDB local, dependency backend/web và Chrome):

```powershell
$env:RUN_ADMIN_BROWSER_TESTS='1'
npm run test:admin-browser
```

Có thể đặt `ADMIN_TEST_POSTGRES_URL` và `ADMIN_TEST_MONGO_URL` để chọn máy chủ test. Runner luôn tạo database mới với tiền tố `ephurin_test_admin_ui_`, dùng cổng API 4110 và Vite 5174, rồi dọn sau chạy.

## Commit theo trang

| Commit | Nội dung |
|---|---|
| `a21a256e` | Khung chung, seed, mẫu HTML |
| `dd4911db` | Tổng quan |
| `94cf9a05` | Người dùng |
| `a6cc84dc` | Danh sách truyện |
| `9c764ecd` | Chi tiết truyện |
| `88319a54` | Thể loại & Tag |
| `d314f6bf` | Hàng đợi kiểm duyệt |
| `c5c3260c` | Báo cáo người dùng |
| `bdca5350` | Chi tiết kiểm duyệt |
| `7ca3d62b` | Yêu cầu rút tiền |

Commit kiểm chứng cuối bổ sung bộ browser test, ảnh, tài liệu và các chỉnh sửa tính nhất quán sau kiểm tra.
