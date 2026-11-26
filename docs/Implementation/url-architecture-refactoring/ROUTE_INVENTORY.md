# Bảng chuyển đổi route

Giữ nguyên bảng route đã duyệt. Mặc định, alias cũ chuyển hướng SPA bằng `replace`. Các route yêu cầu phiên hoặc vai trò giữ guard và kiểm tra quyền tài nguyên qua API. [Router hiện tại](../../../web/src/app/router.tsx#L64) · [AuthGate và RoleGuard](../../../web/src/features/auth/AuthGate.tsx#L54)

## Công khai, độc giả và tài khoản

| URL hiện tại | URL chính thức | Màn hình và truy cập |
|---|---|---|
| `/` | `/` | `ReaderHomePage`, phiên tùy chọn |
| `/public`, `/reader` | `/danh-sach` | `ReaderCatalog`, phiên tùy chọn |
| `/tim-kiem` | `/tim-kiem` | `SearchResultsPage`, phiên tùy chọn |
| `/tim-kiem-nang-cao` | `/tim-kiem-nang-cao` | `SearchResultsPage` nâng cao, phiên tùy chọn |
| `/public/novels/:novelId`, `/reader/novels/:novelId` | `/truyen/:novelSlug` | Chi tiết truyện đã xuất bản, tra UUID cho link cũ |
| `/public/chapters/:chapterId`, `/reader/chapters/:chapterId` | `/truyen/:novelSlug/chuong/:chapterSlug` | `ChapterReader`, phiên tùy chọn, giữ khóa VIP |
| `/public/novels/:novelId/reviews`, `/reader/novels/:novelId/reviews` | `/truyen/:novelSlug/danh-gia` | `ReaderNovelReviewsPage`, phiên tùy chọn |
| `/public/bookmarks`, `/reader/bookmarks` | `/danh-dau` | `ReadingBookmarksPage`, local cho khách và API cho tài khoản |
| `/reader/library` | `/thu-vien` | `ReaderLibraryPage`, yêu cầu phiên |
| `/reader/history` | `/lich-su` | `ReaderHistoryPage`, yêu cầu phiên |
| `/reader/connections` | `/ket-noi` | `ConnectionsPage`, yêu cầu phiên |
| `/reader/feedback` | `/gop-y` | `FeedbackPage`, yêu cầu phiên |
| `/notifications` | `/thong-bao` | `NotificationsPage`, yêu cầu phiên |
| `/profile/me` | `/tai-khoan` | `MyProfilePage`, yêu cầu phiên |
| `/account/nominations` | `/de-cu-cua-toi` | `MyNominationsPage`, yêu cầu phiên |
| `/appeals` | `/khieu-nai` | `AccountAppealsPage`, công khai |
| `/login` | `/dang-nhap` | `AuthLanding`, đăng nhập và đăng ký |
| `/verify-email` | `/xac-thuc-email` | `AuthLanding`, giữ alias và nguyên fragment |
| `/wallet` | `/vi` | `WalletPage`, yêu cầu phiên |
| `/wallet/vnpay-return` | `/vi/ket-qua-thanh-toan` | `VnpayReturnPage`, giữ alias đầu vào, query ký và yêu cầu phiên |

## Cộng đồng và sáng tác

| URL hiện tại | URL chính thức | Màn hình và truy cập |
|---|---|---|
| `/discussions` | `/thao-luan` | `DiscussionListPage`, phiên tùy chọn |
| `/discussions/mine` | `/thao-luan/cua-toi` | `MyDiscussionsPage`, yêu cầu phiên |
| `/discussions/new` | `/thao-luan/tao-moi` | `DiscussionEditorPage`, yêu cầu phiên |
| `/discussions/:topicId` | `/thao-luan/:topicSlug` | `DiscussionTopicPage`, chủ đề `VISIBLE` và danh mục hoạt động |
| `/discussions/:topicId/edit` | `/thao-luan/:topicSlug/chinh-sua` | `DiscussionEditorPage`, giữ kiểm tra phiên, chủ sở hữu và trạng thái khóa |
| `/readers/:userId` | `/thanh-vien/:publicKey` | `ReaderProfilePage`, hồ sơ tài khoản hoạt động |
| `/authors/:authorId` | `/tac-gia/:publicKey` | `AuthorProfilePage`, một route phiên tùy chọn, giữ điều kiện hồ sơ tác giả |
| `/author`, `/author/projects` | `/sang-tac` | `AuthorProjectsPage`, `AUTHOR`, `ADMIN`, `MODERATOR` |
| `/author/ide` | `/sang-tac/viet` | `AuthorWritingIde`, dùng `tac-pham` và `chuong` theo slug, tiếp nhận query ID cũ |
| `/author/import/:novelId` | `/sang-tac/tac-pham/:novelSlug/nhap-ban-thao` | `ManuscriptImportPage`, giữ quyền tác phẩm |
| `/author/context/:novelId` | `/sang-tac/tac-pham/:novelSlug/boi-canh` | `AuthorStoryContextPage`, giữ quyền tác phẩm |
| `/author/novels/:novelId` | `/sang-tac/tac-pham/:novelSlug` | `AuthorNovelMetadataPage`, giữ quyền tác phẩm |
| `/author/novels/:novelId/comments` | `/sang-tac/tac-pham/:novelSlug/binh-luan` | `AuthorNovelCommentsPage`, giữ quyền tác phẩm |
| `/author/novels/:novelId/reviews` | `/sang-tac/tac-pham/:novelSlug/danh-gia` | `AuthorNovelReviewsPage`, giữ quyền tác phẩm |
| `/author/novels/:novelId/chapters/:chapterId` | `/sang-tac/viet?tac-pham=:novelSlug&chuong=:chapterSlug` | `AuthorChapterDeepLink`, lấy ID từ path cũ và giữ tham số còn lại |
| `/author/profile` | `/tac-gia/:publicKey` | Shortcut hồ sơ của người đang đăng nhập, giữ kiểm tra phiên |

## Kiểm duyệt và quản trị

| URL hiện tại | URL chính thức | Màn hình và truy cập |
|---|---|---|
| `/moderator`, `/moderator/reviews` | `/kiem-duyet/hang-doi` | `ModeratorReviewsPage`, `MODERATOR`. `/kiem-duyet` cũng mở hàng đợi. |
| `/moderator/reviews/:reviewId` | `/kiem-duyet/hang-doi/:reviewSlug` | `ModeratorReviewDetailPage`, `MODERATOR` |
| `/moderator/history` | `/kiem-duyet/lich-su` | `ModeratorHistoryPage`, `MODERATOR` |
| `/moderator/selections` | `/kiem-duyet/de-cu` | `ModeratorSelectionsPage`, `MODERATOR` |
| `/moderator/selections/:caseId` | `/kiem-duyet/de-cu/:caseId` | `ModeratorSelectionDetailPage`, `MODERATOR` |
| `/moderator/placements` | `/kiem-duyet/lich-gioi-thieu` | `PlacementPage`, `MODERATOR` |
| `/moderator/discussions` | `/kiem-duyet/thao-luan` | `ModeratorDiscussionsPage`, `MODERATOR` |
| `/admin` | `/quan-tri` | `AdminOverviewPage`, `ADMIN` |
| `/admin/users` | `/quan-tri/nguoi-dung` | `AdminUsersPage`, `ADMIN` |
| `/admin/users/:userId` | `/quan-tri/nguoi-dung/:userId` | `AdminUserDetailPage`, `ADMIN` |
| `/admin/novels` | `/quan-tri/tac-pham` | `AdminNovelsPage`, `ADMIN` |
| `/admin/novels/:novelId` | `/quan-tri/tac-pham/:novelSlug` | `AdminNovelDetailPage`, `ADMIN` |
| `/admin/taxonomy` | `/quan-tri/the-loai-va-nhan` | `AdminTaxonomyPage`, `ADMIN` |
| `/admin/moderation` | `/quan-tri/kiem-duyet` | `AdminModerationPage`, `ADMIN` |
| `/admin/moderation/:reviewId` | `/quan-tri/kiem-duyet/:reviewSlug` | `AdminModerationDetailPage`, `ADMIN` |
| `/admin/escalations` | `/quan-tri/chuyen-cap` | `AdminEscalationsPage`, `ADMIN` |
| `/admin/reports` | `/quan-tri/bao-cao` | `AdminReportsPage`, `ADMIN` |
| `/admin/audit` | `/quan-tri/nhat-ky` | `AdminAuditPage`, `ADMIN` |
| `/admin/appeals` | `/quan-tri/khieu-nai` | `AdminAppealsPage`, `ADMIN` |
| `/admin/selection-reconsiderations` | `/quan-tri/xet-lai-tuyen-chon` | `AdminReconsiderationsPage`, `ADMIN` |
| `/admin/placements` | `/quan-tri/lich-gioi-thieu` | `PlacementPage`, `ADMIN` |
| `/admin/discussions` | `/quan-tri/thao-luan` | `AdminDiscussionsPage`, `ADMIN` |
| `/admin/withdraws` | `/quan-tri/rut-tien` | `AdminWithdrawsPage`, `ADMIN` |
| `/admin/withdraws/:requestId` | `/quan-tri/rut-tien/:requestId` | `AdminReconciliationPage`, `ADMIN` |
| `*` | `/` | Giữ fallback chung. Route tài nguyên đã khớp nhưng không phân giải được hiển thị trạng thái không tìm thấy. |
