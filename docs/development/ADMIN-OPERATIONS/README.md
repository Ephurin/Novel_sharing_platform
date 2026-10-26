# Admin operations

Triển khai đầy đủ các nhóm chức năng quản trị đã thống nhất, mở rộng trên React/Mantine/React Query và Express/PostgreSQL/MongoDB hiện có. Không thêm dependency ứng dụng; giữ khung Admin, token ivory/terracotta, font và theme chung. Áp dụng `storycraft-design-system`, `storycraft-content-density`, `storycraft-dark-mode` trong `.agents/skills`.

## Chức năng

| Nhóm | Kết quả |
| --- | --- |
| Báo cáo vi phạm | Tách `USER_REPORT` khỏi duyệt xuất bản `KEYWORD_FILTER`. Tiếp nhận báo cáo cho phép cảnh báo, ẩn truyện/chương/bình luận hoặc khóa tài khoản theo quyền; bác báo cáo giữ nguyên đối tượng. Không xuất bản lại nội dung khi xử lý báo cáo. |
| Nhật ký | Lưu người thao tác, thời gian, đối tượng, người bị ảnh hưởng, lý do và dữ liệu trước/sau. Quyết định mới và nhật ký cùng transaction PostgreSQL. Lịch sử có trigger chặn sửa/xóa bản ghi. |
| Hồ sơ người dùng | Thông tin tài khoản, truyện, lịch sử vi phạm và thao tác liên quan; cảnh báo, khóa/mở khóa; quản trị viên toàn quyền có thể đổi vai trò và nhóm quyền. |
| Bảo vệ thao tác | Bắt buộc lý do cho khóa/mở khóa, gỡ/khôi phục, sửa/gộp/xóa danh mục, xử lý báo cáo và khiếu nại. Chặn tự khóa/tự đổi quyền; giữ ít nhất một admin toàn quyền, kể cả khi thao tác đồng thời. Chỉ admin toàn quyền quản lý tài khoản admin khác. |
| Khiếu nại | Người bị ảnh hưởng xem quyết định của mình và gửi một khiếu nại cho mỗi quyết định. Admin chấp nhận hoặc bác có lý do. Chấp nhận thu hồi hạn chế do đúng quyết định đó tạo ra, giữ nguyên trạng thái xuất bản và các hạn chế riêng khác. |
| Danh mục | Số truyện sử dụng, đổi tên/mô tả, gộp thể loại/tag và xóa danh mục chưa dùng. Gộp giữ liên kết nhiều thể loại/tag, cập nhật thể loại chính và loại bỏ liên kết trùng. |
| Phân quyền | `SUPER_ADMIN`: toàn quyền; `MODERATOR`: nội dung; `USER_MANAGER`: người dùng; `FINANCE`: tài chính. Mọi admin xem nhật ký của chính mình; chỉ toàn quyền xem nhật ký chung và tác vụ đồng bộ. |
| Rút tiền | Giữ nguyên quy tắc duyệt/từ chối, khóa ví và cập nhật ledger hiện có. Bổ sung đối soát thủ công riêng: chưa xác nhận → đang chuyển → đã thanh toán/thất bại; có mã giao dịch, chứng từ, ghi chú, phiên bản và lịch sử. Đối soát không chuyển tiền và không thay đổi số dư. |

Trạng thái tài khoản, role và scope được đọc từ database cho các yêu cầu xác thực; token cũ không vượt qua lệnh khóa hoặc thay đổi quyền. Các đường truy cập nội dung qua API tác giả/độc giả/bình luận cũng kiểm tra quyền Admin phù hợp.

Phiên đăng nhập khiếu nại riêng hết hạn sau 15 phút, cho phép tài khoản bị khóa sử dụng `/appeals`; token này không được phép dùng API thông thường. Có giới hạn số lần đăng nhập theo IP. Thông báo và thay đổi bình luận dùng tác vụ PostgreSQL bền vững, thử lại định kỳ và không tạo thông báo trùng. Admin toàn quyền có thể xem và thử lại tác vụ đang chờ ở trang nhật ký.

## Các trang và file

| Trang | Route | File chính dưới `web/src/features/admin/` |
| --- | --- | --- |
| Nhật ký | `/admin/audit` | `AdminAuditPage.tsx` |
| Chi tiết người dùng / quyền | `/admin/users/:userId` | `AdminUserDetailPage.tsx` |
| Khiếu nại Admin | `/admin/appeals` | `AdminAppealsPage.tsx` |
| Đối soát rút tiền | `/admin/withdraws/:requestId` | `AdminReconciliationPage.tsx` |
| Quyết định & khiếu nại cá nhân | `/appeals` | `AccountAppealsPage.tsx` |
| Danh mục | `/admin/taxonomy` | `AdminTaxonomyPage.tsx`, `AdminTaxonomyActions.tsx` |
| Các trang cập nhật | Routes hiện có | `AdminUsersPage.tsx`, `AdminModerationDetailPage.tsx`, `AdminNovelDetailPage.tsx`, `AdminWithdrawsPage.tsx` |
| Khung và dữ liệu dùng chung | — | `AdminShell.tsx`, `AdminShared.tsx`, `admin.css`, `admin-api.ts`, `admin-operations-api.ts` |

Các route cũ được giữ nguyên. Menu Admin chỉ hiển thị mục theo quyền và chuyển đến trang phù hợp khi không có quyền tổng quan. Các màn hình hiện có không được dựng lại từ đầu. Link khiếu nại có ở trang đăng nhập và menu tài khoản tác giả/độc giả.

Backend chính:

- `backend/src/core/database/migrations/018_admin_operations.sql`: bảng scope, audit, quyết định, khiếu nại, tác vụ và đối soát.
- `backend/src/modules/admin/admin-access.ts`: quyền, nhật ký và bảo vệ tài khoản.
- `backend/src/modules/admin/admin-sanctions.ts`: cảnh báo, ẩn, khóa và thu hồi quyết định.
- `backend/src/modules/admin/admin-jobs.ts`: đồng bộ bình luận và thông báo có thể thử lại.
- `backend/src/modules/admin/admin-operations.routes.ts`: audit, chi tiết người dùng, quyền, khiếu nại, danh mục và đối soát.
- `backend/src/modules/admin/account-appeals.routes.ts`: phiên khiếu nại và dữ liệu thuộc người đang đăng nhập.
- `backend/src/modules/content-control/report-resolution.ts`: xử lý báo cáo riêng biệt với xuất bản.
- `backend/src/modules/admin/admin.{routes,schemas,controller,service,repository}.ts`: nối luồng hiện có vào quyền và nhật ký.
- `backend/src/modules/wallet/wallet.repository.ts`: ghi audit trong transaction duyệt/từ chối ví hiện có.
- `backend/src/core/security/auth-{context.ts,middleware.ts}` và các kiểm tra quyền đọc/quản lý nội dung hiện có: ngăn token cũ và nhóm quyền khác vượt qua giới hạn.
- `backend/src/app.ts`, `backend/src/main.ts`: mount API và chạy tác vụ đồng bộ.

API mới có prefix `/api/v1`:

```text
GET   /admin/access
GET   /admin/audit
GET   /admin/jobs
POST  /admin/jobs/retry
GET   /admin/users/:userId
PATCH /admin/users/:userId/access
POST  /admin/users/:userId/warn
GET   /admin/appeals
POST  /admin/appeals/:appealId/resolve
PATCH /admin/taxonomy/:kind/:itemId
POST  /admin/taxonomy/:kind/:itemId/merge
DELETE /admin/taxonomy/:kind/:itemId
GET   /admin/withdraw-requests/:requestId/reconciliation
POST  /admin/withdraw-requests/:requestId/reconciliation
POST  /account/appeal-session
GET   /account/decisions
POST  /account/appeals
```

API resolve kiểm duyệt hiện có nhận thêm `action` cho user report. Để tương thích client cũ, chấp nhận report bình luận không truyền action vẫn là ẩn bình luận; đối tượng khác mặc định cảnh báo. UI mới gửi lựa chọn rõ ràng. Các luồng quan trọng hiện yêu cầu lý do không rỗng.

## Kiểm chứng ngày 26/10/2026

- Backend và web: `npm run typecheck`, `npm run build` **PASS**; Docker build backend/web **PASS**. Không có script lint trong hai package. Vite vẫn cảnh báo bundle lớn; không đổi chiến lược bundling trong đợt này.
- Backend đầy đủ qua runner cô lập: **228 PASS, 0 FAIL, 5 SKIP / 233**. Các bài opt-in được skip là live AI Gateway, author launch, author workflow, novel/chapter comments và author ledger theo điều kiện sẵn có của chúng. Không gọi AI trả phí.
- API/trình duyệt: **23/23 PASS**, không skip; PostgreSQL/MongoDB tạm riêng được migrate, seed hai lần để kiểm tra idempotence, rồi dọn.
- Wallet: **4/4 PASS**.
- **56 ảnh kiểm tra**: 13 màn hình Admin và portal khiếu nại × light/dark × desktop 1440px/mobile 390px. Kiểm tra font, cỡ tiêu đề, menu mobile, lưu theme và không tràn ngang document. Giữ 20 ảnh của các màn hình mới trong thư mục này; 36 ảnh regression của trang cũ có thể tạo lại bằng runner.
- Kiểm tra loading/empty/error/retry, UUID copy đầy đủ, evidence và nội dung đầy đủ, quyết định keyword/report, quyền truy cập, token cũ, cảnh báo, ẩn và khôi phục, khiếu nại của đúng chủ tài khoản, khiếu nại trùng, xử lý lại quyết định, quyền theo scope, bảo vệ admin cuối cùng khi hai người thao tác đồng thời.
- Kiểm tra gộp danh mục giữ cả liên kết chính/phụ, xóa danh mục đang dùng bị chặn, lịch sử không thể sửa, tác vụ không gửi thông báo lặp, đối soát chống version cũ/mã giao dịch trùng và số dư ví không đổi.
- Thao tác trình duyệt thật: cảnh báo trong hồ sơ → đăng nhập portal → gửi khiếu nại → Admin chấp nhận → trạng thái cập nhật; sửa danh mục; xác nhận thanh toán thủ công → lưu mã giao dịch và lịch sử → khóa sửa bản ghi đã thanh toán.
- Local `http://localhost:8080`: migration `018` đã chạy, health OK; API access/audit/appeals/taxonomy/withdraw và route portal trả thành công. Giữ cấu hình runtime backend, không chạy lại demo seed. Fingerprint các bảng users/novels/wallets/withdraw_requests trước và sau migration khớp nhau, trước bước đăng nhập smoke test.

Trong lần chạy thử đầu tiên, một số test cũ chưa chặn database phát triển đã tạo fixture. Đã dọn đúng fixture theo ID và thời điểm của lần chạy đó; thêm guard cho test xuất bản và social. Các lần kiểm chứng cuối đều dùng database tạm riêng. Runner mới giúp chạy toàn bộ backend tests mà không tác động database local.

Log: `backend-tests.log`, `browser-tests.log`, `wallet-tests.log`, `browser-checks.json`, `local-smoke.json`. Mã kiểm thử: `web/tests/admin-redesign.browser.test.mjs`, `web/tests/admin-operations.cases.mjs`, `backend/scripts/run-isolated-tests.mjs`.

Chạy lại:

```powershell
# backend: toàn bộ bộ test trong PostgreSQL/MongoDB tạm
npm --prefix backend run test:isolated

# browser: dữ liệu và server tạm riêng, cần Chrome local
$env:RUN_ADMIN_BROWSER_TESTS='1'
$env:ADMIN_BROWSER_OUTPUT_DIR='F:/Code/Github/Novel_sharing_platform/docs/development/ADMIN-OPERATIONS'
npm --prefix web run test:admin-browser

npm --prefix web run test:wallet
```

## Giới hạn dữ liệu và vận hành

- Nhật ký và quyết định có thể khiếu nại được ghi từ khi tính năng này hoạt động; không dựng lại lịch sử cũ thiếu dữ liệu. Admin hiện có giữ quyền toàn phần khi migrate. Các scope mới được cấp trong hồ sơ người dùng.
- Hồ sơ hiển thị tối đa 50 truyện, 100 quyết định và 50 thao tác gần nhất; portal hiển thị 100 quyết định gần nhất. Trang nhật ký và hàng đợi khiếu nại có phân trang.
- Khôi phục quyết định mới chỉ thu hồi phần hạn chế của chính quyết định đó. Dữ liệu gỡ mềm từ trước migration vẫn dùng cơ chế khôi phục cũ vì không có snapshot riêng.
- Đối soát là ghi nhận kiểm tra thủ công, không tích hợp ngân hàng, không xác nhận tự động tiền đến tài khoản và không tự hoàn coin khi chuyển tiền thất bại. Bản ghi đã thanh toán không có luồng sửa trực tiếp.
- Khi MongoDB chưa cập nhật được, quyết định đã lưu vẫn có hiệu lực trong PostgreSQL; tác vụ tiếp tục thử lại. Chi tiết kiểm duyệt hiển thị trạng thái đang đồng bộ, trang nhật ký toàn quyền hiển thị tác vụ chờ.
