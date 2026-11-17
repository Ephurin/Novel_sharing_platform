# Reader social — contract backend mốc 2

Ngày: 18/11/2026. Prefix `/api/v1`. Envelope hiện có `{success,data,error,meta}`. Mốc 1 đã commit `fedb0474`; các API dưới đây bổ sung trên contract mốc 1 trong progress.

## Kênh, quyền và tương thích

- `PUBLIC` là mặc định khi create không có audience và khi list không có channel. Mongo documents cũ thiếu audience vẫn public; không backfill thành private. APPROVED chỉ là trạng thái kiểm duyệt, không tự cấp quyền public.
- `FRIENDS_ALL` và `FRIENDS_SELECTED` chỉ hợp lệ trên chương có anchor. ALL snapshot mutual tại create; SELECTED xác minh mọi recipient là mutual lúc gửi. Chỉ root writer và người nằm trong snapshot còn mutual với writer được đọc/tương tác. Bạn mới không thấy bài cũ; refollow khôi phục quyền của recipient cũ. Reply kế thừa root, B/C không cần mutual với nhau.
- `AUTHOR_PRIVATE`: người gửi và chủ truyện hiện tại; hỗ trợ góp ý tổng thể truyện, chương, đoạn. Sở hữu truyện/role admin không cấp quyền xem FRIENDS_*.
- Pending/rejected chỉ writer của nội dung tương ứng được xem qua API người dùng. Root không readable thì replies cũng không readable. Xóa root xóa mềm replies. Private edit/delete yêu cầu còn quyền và là writer; chủ truyện không được tự xóa góp ý của người gửi.
- Private gắn chương kiểm tra publication/deletion/VIP bằng helper không tăng views/history. ID ngoài quyền trả 404 như không tồn tại. List private/feedback yêu cầu đăng nhập (401); thread private không auth trả 404. Queries lọc quyền trước skip/limit/count; mutual authors được lấy theo lô.
- Search/list public/author manage không gom private. Comment routes gửi `Cache-Control: private, no-store`. UI web/mobile vẫn cần xóa cache khi logout/đổi tài khoản/unfollow và revalidate khi foreground ở mốc 3/4.

## Đoạn văn và anchor

`GET /reading/chapters/:chapterId` giữ response cũ và thêm:

```json
{"contentVersion":"<sha256 published content>","paragraphs":[{"paragraphId":"<sha256>","paragraphIndex":0,"text":"Nội dung đoạn"}]}
```

Server dùng `chapters.content`, chuẩn hóa newline, tách đoạn theo dòng trống; bỏ divider `---/***/___` và định nghĩa footnote `[^id]:`, giữ chỉ số block nguồn. Client dùng danh sách server để gắn menu; không đổi index bookmark cũ hoặc chọn theo dòng hiển thị.

Anchor input chỉ gồm `{contentVersion,paragraphId}`; server tự lấy quote/ngữ cảnh, không nhận quote do client gửi. ID/version không khớp trả 409 `COMMENT_ANCHOR_STALE`. Anchor output có version/id/index/quote/before/after gốc, thêm `detached` và `currentParagraphId`. Nếu nội dung đổi chỉ nối lại khi quote/ngữ cảnh khớp duy nhất; mơ hồ/sửa/xóa trả detached=true. Anchor gốc bất biến. Filter `paragraphId` của list là ID anchor gốc đã lưu; để dựng marker sau sửa chương, client dùng `currentParagraphId` từ thread/list và bỏ marker detached.

## Create, reply, edit, reaction/report

POST `/chapters/:chapterId/comments` hoặc `/novels/:novelId/comments`:

```json
{"content":"Góp ý cho nhóm bạn","audience":"FRIENDS_SELECTED","recipientUserIds":["<mutual-user-uuid>"],"anchor":{"contentVersion":"<64 hex>","paragraphId":"<64 hex>"}}
```

ALL không nhận recipientUserIds; server tự snapshot. AUTHOR_PRIVATE không nhận recipients; anchor chỉ dùng ở chapter. PUBLIC không nhận anchor/recipients. Private chỉ text/emoji/định dạng cơ bản, tối đa 2000 ký tự; server chặn imageUrl/gifId, markup nhúng ảnh/media và data URI trong create/edit/reply. Không hỗ trợ mentions private.

Create response status 201 có `commentId,novelId,chapterId,audience,status,moderationReviewId,parentCommentId`. Reply POST `/comments/:commentId/replies` nhận content/isSpoiler như hiện có, có thể nhắm reply nhưng luôn nằm dưới root một cấp. PATCH `/comments/:commentId` chỉ sửa nội dung; gửi audience/recipients/anchor/paragraphOffset khi edit/reply private bị từ chối 400 `COMMENT_SCOPE_IMMUTABLE`. Mọi edit làm review đang pending lỗi thời và chạy moderation lại. DELETE giữ 204.

PUT `/comments/:commentId/reaction` và POST `/reports` giữ contract cũ; private phải vượt policy root và approved trước khi thao tác. Report người ngoài trả 404, không tạo record.

## Public mentions

Create/edit root hoặc reply public nhận:

```json
{"content":"@username xem đoạn này","mentions":[{"userId":"<mutual-user-uuid>","start":0,"end":9}]}
```

Offsets là chỉ số UTF-16 trong content đã trim, end exclusive; substring phải bằng `@` + username hiện tại, không chồng lấn. Server xác minh userId là mutual active. Tối đa 30 ranges; sai trả 400 `COMMENT_MENTION_INVALID`. Văn bản @ không có metadata không tạo mention notification. Client cần dùng username từ search/connections khi chèn tag. Đổi tên không thay userId đã lưu; edit mới xác minh username mới. Edit bỏ mentions sẽ xóa metadata cũ.

## List, feedback và thread

| API | Query và kết quả |
| --- | --- |
| GET `/chapters/:chapterId/comments` | `channel=PUBLIC/FRIENDS_ALL/FRIENDS_SELECTED/AUTHOR_PRIVATE`, `paragraphId`, page/limit; default PUBLIC |
| GET `/novels/:novelId/comments` | Cùng channel; private lọc theo novel và quyền chương; public giữ scope NOVEL/ALL |
| GET `/author-feedback` | `box=sent/received` bắt buộc; novelId/chapterId optional, page/limit |
| GET `/comments/:commentId/thread` | Optional auth cho public, private yêu cầu đủ quyền; limit/page; commentId có thể là root hoặc reply |
| GET `/comments/:rootId/replies` | Giữ paging cũ, tự dùng policy audience của root |

Private list/reply/feedback trả array trong data, meta `{page,limit,totalItems,totalPages}`. Item giữ presentation cũ và thêm audience/anchor. Không trả recipient snapshot ra UI/public. Thread trả `{root,replies,rootCommentId,focusCommentId}`, meta là trang replies. Nếu ID được mở là reply thì server chọn đúng trang chứa reply đó dù ngoài trang đầu. Endpoint `/location` legacy không dùng cho private, trả 404; dùng `/thread`.

## Notifications và kiểm duyệt

- Chỉ tạo sau APPROVED. Friend root/reply fan-out tới thành viên snapshot còn quyền, trừ người viết; AUTHOR_PRIVATE gửi bên còn lại. Trước gửi recheck active/publication/mutual/VIP. Public giữ READER_COMMENT/AUTHOR_REPLY/COMMENT_REPLY, bổ sung COMMENT_MENTION; tag+reply cùng recipient/comment chỉ một notification.
- Key mới `comment:<commentId>:<recipientId>`; kiểm tra notification key legacy để tránh gửi lại public notification đã tồn tại. Retry/edit không tạo trùng. Payload mang rootCommentId/commentId/novelId/chapterId/href; private href dùng `threadId` và `commentId`. Preview private chỉ có thông báo chung, không chứa content/quote.
- Admin chỉ đọc private qua review đã tồn tại cho nội dung bị flag/report, có content permission. GET review ghi `PRIVATE_COMMENT_REVIEW_VIEW` vào admin_audit không chứa nội dung; xử lý dùng audit hiện có. Vai trò admin không bypass audience tại API người dùng. Review list chỉ trả metadata.

## Cấu hình, indexes và rollout

- `PRIVATE_COMMENTS_ENABLED=false` trong `.env.example`. Chỉ bật trên môi trường đã chạy toàn bộ backend có policy mới. False chặn create root/reply private; read/edit/delete vẫn giữ policy. Rollback không được quay lại binary cũ không hiểu audience, không chạy mixed instances khi cho phép private writes.
- Mongo indexes additive trong `ensureCommentIndexes`: audience/recipientUserIds/userId/createdAt và audience/novelId/chapterId/anchor.paragraphId. Không xóa/backfill dữ liệu cũ, không có SQL migration mới ở mốc 2.
- Backend tests dùng DB tạm ở reader PostgreSQL 5433/MongoDB 27018. Các thay đổi chưa được deploy vào runtime/demo. Kiểm thử frontend/native và hành vi client cache thuộc mốc 3/4, chưa được chứng minh bởi các tests backend này.
