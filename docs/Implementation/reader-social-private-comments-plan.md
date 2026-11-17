# Kế hoạch Follow, bình luận bạn bè và góp ý riêng tác giả — chạy toàn bộ

Ngày chốt: 17/11/2026. Repository đã khảo sát: `F:\Code\Github\Novel_sharing_platform`.

Trạng thái: **Đã hoàn thành mốc 0 và mốc 1 ngày 17/11/2026. Mốc 2–5 chưa triển khai.** Kết quả chi tiết và lệnh tái hiện nằm trong progress; các ghi chép chuẩn bị/mốc 0 được giữ làm lịch sử.

## Chuẩn bị đã hoàn thành

- Worktree dùng cho toàn bộ tính năng: `F:\Code\Github\Novel_sharing_platform-reader-features`.
- Nhánh đã checkout tại worktree này: `feat/reader-social-private-comments`.
- Nhánh social đã fast-forward tới `origin/main` ở commit `0e3c9b0e`, chứa PR #186 reader-features đã merge. Không reset/rebase/force-update lịch sử nhánh reader.
- Tên thư mục reader-features được giữ nguyên; nó hiện là worktree của nhánh social. Không tạo lại worktree hoặc chuyển về nhánh reader khi bắt đầu.
- Worktree reader sạch trước khi chuyển nhánh; các sửa reader đã commit và merge. Không mang thay đổi chưa commit sang social.
- Checkout gốc `F:\Code\Github\Novel_sharing_platform` vẫn ở `feat/ui-polish-round-2`, dành cho phiên UI khác. Không sửa, đổi nhánh, stash/pop hoặc reset tại đó.
- Hai file plan/progress được lưu tại `docs/Implementation/reader-social-private-comments-plan.md` và `docs/Implementation/reader-social-private-comments-progress.md` trong worktree social.
- Chưa triển khai code hoặc migration chức năng mới. Mốc 0 đã chạy build/test baseline và migration hiện có chỉ trên DB test tạm; đây không phải bằng chứng hoàn thành tính năng mới.
- Bản này tự chứa toàn bộ quyết định và checklist; thay thế hai prompt session cũ.

## Lệnh giao việc để bắt đầu trong chat

> Đọc plan và progress tại F:\Code\Github\Novel_sharing_platform-reader-features\docs\Implementation. Triển khai toàn bộ mốc 0 tới 5 trên nhánh feat/reader-social-private-comments đang checkout tại worktree này: backend, web, mobile và kiểm thử. Cập nhật progress sau mỗi phần việc để đổi tài khoản vẫn tiếp tục được. Giữ các tính năng reader/bookmark đã merge; không thao tác checkout UI gốc, không dừng sau backend, không push/deploy production; báo trung thực kết quả kiểm chứng.
## 1. Mục tiêu và hiện trạng

Đã đọc Graphify và đối chiếu code backend, web, mobile. Hệ thống dùng Express/TypeScript, PostgreSQL, MongoDB; web React/Vite; mobile Expo/React Native.

Đã có follow tác giả, bình luận truyện/chương, paragraphOffset trong dữ liệu, trả lời một cấp, reaction, kiểm duyệt và thông báo. Web có component bình luận khá đầy đủ. Mobile hiện mới có bình luận chương cơ bản, chưa có replies và điều hướng thông báo tới đúng luồng.

Triển khai đủ các chức năng mới trên **web và mobile**, với ba kênh:

| Kênh | Vị trí | Ai được xem và trả lời |
| --- | --- | --- |
| PUBLIC | Tổng thể truyện và chương | Mọi người đọc được; tài khoản đăng nhập, đang hoạt động được viết/trả lời; hỗ trợ tag bạn mutual |
| FRIENDS_ALL / FRIENDS_SELECTED | Chỉ tại đoạn trong nội dung chương | Người viết và những người thuộc danh sách chia sẻ, còn follow hai chiều với người viết gốc |
| AUTHOR_PRIVATE | Tổng thể truyện, chương hoặc đoạn | Người gửi và tác giả sở hữu truyện; tác giả được trả lời |

Ngoại lệ đã được người dùng đồng ý: quản trị viên có quyền kiểm duyệt có thể xem nội dung riêng khi bị hệ thống gắn cờ hoặc có báo cáo, thông qua quy trình kiểm duyệt có ghi lịch sử. Vai trò admin không tự cấp quyền duyệt mọi luồng riêng qua API người dùng thông thường.

## 2. Quyết định sản phẩm đã chốt

### 2.1 Follow và mutual

- Follow một chiều, không cần duyệt. Có cả hai cạnh ngược nhau thì được gọi là bạn bè/mutual.
- Dùng chung quan hệ follow hiện có, không tạo hai nút follow tác giả và follow bạn đọc độc lập.
- Reader chuyển thành tác giả vẫn giữ bạn bè. Tác giả vẫn sử dụng được các chức năng đọc và tương tác như reader.
- Có hồ sơ reader, tìm tài khoản theo username/tên hiển thị và danh sách following/followers/mutual.
- Nút hiển thị Theo dõi / Theo dõi lại / Đang theo dõi / Bạn bè theo quan hệ thực tế.
- Không tự follow, không tạo cạnh trùng; tài khoản khóa/xóa không tạo tương tác mới.
- Follow tác giả vẫn giữ số follower và hành vi thông báo chương mới hiện có.

### 2.2 Public và tag

- Giữ nguyên thảo luận công khai ở trang truyện và cuối chương. Khách đọc được; đăng nhập mới viết/trả lời.
- Cả bình luận gốc và reply công khai đều có thể nhập @ để chọn bạn đang mutual với người viết.
- Chỉ lựa chọn có cấu trúc từ gợi ý mới là tag thật; @ gõ dạng văn bản thông thường không tạo notification.
- Lưu định danh người được tag theo userId, không dùng tên hiển thị làm khóa.
- Máy chủ xác thực tag tương ứng nội dung và quan hệ mutual tại lúc gửi/sửa. Tag không thay đổi quyền xem công khai.
- Chỉ thông báo sau khi được duyệt; không gửi trùng do retry, sửa bài hoặc đồng thời nhận notification reply.
- Nếu sau đó không còn mutual, nội dung/tag public cũ vẫn là public. Không gửi thêm thông báo mới khi không còn đủ điều kiện.
- Bản này chỉ bổ sung tag ở PUBLIC; không mở thêm tag trong hai kênh riêng.

### 2.3 Bình luận bạn bè tại đoạn

- Bấm/nhấn giữ **đoạn văn**, không xây chọn chính xác câu/từ trong bản đầu.
- Chọn Tất cả bạn bè hoặc Chọn bạn bè; hiện rõ phạm vi trước khi gửi.
- Tất cả bạn bè nghĩa là tất cả mutual **tại lúc đăng**. Danh sách người nhận được máy chủ chốt lúc tạo bình luận gốc, không chốt lại lúc được duyệt.
- Bạn mới sau thời điểm đăng không tự thấy bài cũ. Người không còn mutual với người viết gốc mất quyền xem/trả lời.
- Nếu người đã nằm trong snapshot trở lại mutual thì được đọc lại; chưa xây lịch sử thu hồi vĩnh viễn.
- A chia sẻ cho B và C thì cả ba ở cùng một luồng. B/C xem được replies của nhau, không cần mutual với nhau. Quyền dựa trên quan hệ với A.
- Reply kế thừa quyền từ root; không có audience độc lập. Người mất quyền không tiếp tục truy cập qua reply do chính họ từng viết.
- Những replies đã chia sẻ vẫn thuộc luồng của root và được các thành viên còn quyền đọc.
- Không có mutual hoặc không chọn được người nhận thì không gửi được bình luận bạn bè; hiện hướng dẫn kết nối.
- Tác giả truyện không tự xem/xóa kênh bạn bè chỉ vì sở hữu truyện. Nếu được chia sẻ như một người bạn thì tuân theo quyền của người nhận.

### 2.4 Góp ý riêng tác giả

- Có entry Gửi riêng tác giả ở trang truyện, chương và menu đoạn văn.
- Chỉ người gửi và chủ truyện xem/trả lời trong UI thông thường, không cần follow nhau.
- Web thêm tab Góp ý riêng vào khu quản lý bình luận tác giả; thêm nơi người gửi xem lại góp ý đã gửi.
- Mobile thêm Góp ý gửi tôi cho chủ truyện và Góp ý đã gửi cho người gửi, cùng màn thread gọn. Không xây IDE tác giả trên mobile.
- Backend xác thực sở hữu truyện; không dựa riêng vào role AUTHOR ở UI.

### 2.5 Nội dung và vòng đời

- Giữ giới hạn 2.000 ký tự và replies một cấp hiện có.
- Kênh không công khai chỉ chữ, emoji và định dạng cơ bản trong bản đầu. Chặn ảnh/GIF ở server cho create/edit/reply, bao gồm đường nhúng media không được phép.
- Public giữ tính năng ảnh/GIF, spoiler, reaction, báo cáo và kiểm duyệt hiện có.
- Người viết được sửa nội dung hoặc xóa phần của mình theo policy. Xóa root làm luồng không còn hiển thị cho người dùng thông thường.
- Audience, anchor gốc và snapshot người nhận bất biến sau đăng; sửa chữ không được đổi phạm vi hoặc mở quyền của replies.
- Tái sử dụng reaction/report hiện có cho nội dung mà người thao tác thực sự có quyền truy cập.
- Không mở rộng sang chat riêng, feed xã hội, đồng tác giả, media riêng, bôi chọn câu/từ hoặc đọc offline nội dung riêng trong đợt này.

## 3. Thiết kế kỹ thuật

### 3.1 Follow và hồ sơ

- Mở rộng bảng PostgreSQL `follows` hiện có cho tài khoản đích active; giữ tên cột `author_id` legacy trong đợt này, ở service/API dùng tên mang nghĩa targetUserId.
- Mutual lấy từ hai cạnh ngược nhau; không thêm bảng friend cần đồng bộ.
- Bổ sung index `(author_id, follower_id)` phù hợp truy vấn ngược. Giữ PK và ràng buộc không tự follow.
- Endpoint author cũ là wrapper chỉ nhận AUTHOR/ADMIN và giữ contract cũ; generic endpoint và endpoint cũ thao tác cùng một cạnh, không double count/notification.
- Mở rộng public profile với trạng thái quan hệ theo người xem, counts; chỉ trả trường công khai, không email/settings.

### 3.2 Comment và chính sách quyền

- Mở rộng Mongo comments với audience, snapshot người nhận cho root bạn bè, anchor và mentions. Reply tham chiếu root và kế thừa policy.
- Comment thiếu audience là PUBLIC để tương thích dữ liệu cũ. Không sửa dữ liệu cũ thành riêng, không reset DB.
- Tách moderation eligibility khỏi audience: APPROVED không đồng nghĩa PUBLIC.
- Một policy dùng chung cho list/detail/thread/replies/reaction/edit/delete/report/author management/notification.
- Query phải lọc tập có quyền **trước** skip/limit/count. Kiểm tra mutual theo lô để tránh N+1. Không lọc bỏ từng item sau phân trang rồi trả tổng sai/lộ count.
- Đường đọc private bắt buộc auth; ID ngoài quyền trả cùng cách xử lý resource không tồn tại, không tiết lộ nội dung/metadata.
- Pending/rejected chỉ hiển thị cho chủ nội dung tương ứng và workflow kiểm duyệt; người nhận chỉ thấy phần đã được duyệt.
- Truyện/chương chưa xuất bản, bị xóa hoặc không còn readable không được lộ qua comment riêng.
- Tách helper kiểm tra quyền đọc chương/VIP không có side effect để tái sử dụng. Không gọi `getReaderChapter` chỉ để kiểm quyền vì nó ghi reading history/views.
- Nội dung riêng gắn chương, đặc biệt anchor/trích đoạn, tuân theo quyền đọc chương. Luồng public cũ giữ chính sách access hiện có.
- Report COMMENT phải kiểm tra quyền xem trước khi nhận báo cáo.
- Quản lý bình luận công khai của tác giả không được vô tình gom cả FRIENDS_*.
- Chỉ content admin phù hợp được vào review riêng; ghi lịch sử xem/xử lý review. Nội dung riêng không đưa vào public search/log payload.

### 3.3 Neo đoạn văn

- API đọc chương trả thêm contentVersion và danh sách đoạn có định danh do server tạo; cùng quy tắc tách đoạn cho backend/web/mobile.
- Tính phiên bản từ nội dung thực đang được xuất bản trong `chapters.content`, không dùng latest revision nếu đó có thể là nháp.
- Anchor gồm phiên bản nguồn, định danh/chỉ số đoạn, trích đoạn và ngữ cảnh đủ đối chiếu. Server xác thực đoạn tồn tại trong nội dung mà người gửi được đọc; không tin quote do client tự khai.
- Không dùng dòng hiển thị hoặc chỉ số đoạn đơn lẻ làm khóa lâu dài.
- Khi thay đổi chương, chỉ re-anchor nếu khớp đoạn/ngữ cảnh chắc chắn, duy nhất. Nếu sửa/xóa/khớp mơ hồ, đánh dấu detached và hiện Đoạn gốc đã thay đổi cùng quote cũ cho người còn quyền.
- Định dạng và footnotes phải được xử lý thống nhất; không chọn divider/footnote thành đoạn văn một cách vô ý.
- `paragraphOffset` cũ vẫn tương thích. Không biến bình luận public cũ có offset thành private và không thay đổi luồng đọc cũ.

### 3.4 Contract API dự kiến

Mọi path dùng `/api/v1`, envelope/pagination hiện có. Ở mốc Backend, agent phải ghi contract triển khai thực tế, payload ví dụ và validation/error vào tài liệu repo trước khi tích hợp web/mobile. Nếu cần điều chỉnh kỹ thuật nhỏ thì giữ toàn bộ semantics đã chốt và cập nhật tài liệu này, không tự đổi quyết định sản phẩm.

| Nhóm | Giao diện |
| --- | --- |
| Follow tài khoản | POST /users/:userId/follow; DELETE /users/:userId/follow |
| Tìm tài khoản | GET /users/search?q=... với phân trang |
| Hồ sơ | Mở rộng GET /users/:userId/profile bằng optional auth, quan hệ và counts |
| Kết nối của tôi | GET /users/me/connections?type=FOLLOWING/FOLLOWERS/MUTUAL&q=... với phân trang |
| Tạo root | Mở rộng POST comments của novel/chapter: audience, recipientUserIds cho FRIENDS_SELECTED, anchor, mentionedUserIds/metadata tag đã xác thực |
| List | Endpoint comments hiện có mặc định PUBLIC; thêm channel tường minh và filter đoạn cho private, kiểm quyền trước phân trang |
| Reply/edit/reaction/report | Tái sử dụng endpoint cũ, thêm validation/policy và mention PUBLIC |
| Góp ý riêng | GET /author-feedback?box=sent/received&novelId=...&chapterId=... với phân trang |
| Mở thread | GET /comments/:commentId/thread, tải root và trang replies chứa comment cần focus |
| Nội dung đọc | Mở rộng response chương với phiên bản và đoạn/anchor dùng chung |

- FRIENDS_* chỉ hợp lệ trên chapter có anchor đoạn, không hợp lệ ở novel/general chapter comment.
- AUTHOR_PRIVATE có anchor khi góp ý đoạn; không có anchor khi góp ý chung.
- Create API legacy thiếu audience vẫn tạo PUBLIC; create riêng phải có audience tường minh, không tự fallback thành public khi request sai.
- Reply lấy audience/recipients/anchor từ root; client không tự cấp quyền bằng payload.
- Không đưa danh sách người nhận/metadata riêng vào feed public.

### 3.5 Thông báo, điều hướng và cache

- Sửa worker `domain-notifications`: không mặc định mọi root comment đều gửi cho novel.authorId.
- Public giữ thông báo hiện có, thêm COMMENT_MENTION. Bạn bè gửi tới snapshot recipients còn đủ quyền; reply gửi thành viên còn quyền của luồng, trừ người đang viết. Private tác giả gửi bên còn lại.
- Chỉ gửi sau APPROVED, kiểm tra lại active account, publication, mutual và quyền đọc phù hợp trước gửi.
- Idempotency key gồm event/comment và recipientId; hiện notification ID được hash từ eventKey nên thiếu recipientId sẽ làm fan-out chỉ có một người nhận.
- Gộp notification trùng cùng người nhận/comment khi vừa tag vừa reply; sửa/duyệt/retry không spam lại cùng sự kiện.
- Preview notification riêng không chứa nội dung/quote riêng. Payload mang rootCommentId/commentId, novelId/chapterId và route phù hợp.
- Web/mobile mở đúng thread/reply, kể cả root hoặc reply không thuộc trang đầu; recheck quyền khi mở.
- Cache private phân biệt tài khoản/kênh. Xóa trên logout/đổi tài khoản; invalidation khi tự unfollow và revalidation khi mở/foreground/refresh thread. Ẩn nội dung khi server xác nhận mất quyền.
- Không ghi private response vào cache công khai, local reading cache/offline hay persist chung giữa tài khoản.
- Dùng hạ tầng thông báo hiện có; không tự mở thêm dự án push/realtime mới ngoài nhu cầu này.

## 4. Triển khai toàn bộ trong cùng một chat

Đây là một nhiệm vụ liên tục gồm cả backend, web và mobile. Các mốc là checkpoint để kiểm thử và ghi tiến độ, không phải yêu cầu người dùng mở session khác hoặc xác nhận tiếp tục sau từng mốc.

### Mốc 0 — Chuẩn bị và xác lập trạng thái

- [x] Đọc instructions áp dụng, plan này, progress và Git state; xác nhận worktree hiện tại là F:\Code\Github\Novel_sharing_platform-reader-features và nhánh feat/reader-social-private-comments. Worktree này đã chuẩn bị xong, không tạo lại hoặc chuyển nhánh checkout UI gốc.
- [x] Chỉ sửa trong worktree social; mọi thay đổi chưa commit của phiên UI ở checkout gốc được giữ nguyên. Không apply stash UI hoặc đưa thay đổi ngoài phạm vi vào tính năng.
- [x] Xác minh PostgreSQL/MongoDB test cô lập và công cụ web/Expo; ghi lại baseline checks và lỗi có sẵn.
- [x] Đọc/cập nhật plan và progress đã lưu trong docs/Implementation của worktree social, giữ chúng đồng bộ với triển khai. Dùng làm nguồn sự thật khi chat dài/đổi tài khoản.

Kết quả mốc 0 (17/11/2026): backend/web typecheck và build pass; backend baseline 52/53 test pass, 1 lỗi author-workflow tái hiện độc lập; web 10/10 browser test pass; mobile cài theo lockfile, typecheck và Android Metro/Hermes export pass. Expo dependency check chưa đạt do lệch patch `expo`/`expo-asset`; chưa kiểm thử native trên emulator/thiết bị. Hai DB test tạm đã được dọn và kiểm tra không còn tồn tại. Xem progress để biết nguyên nhân, phạm vi bằng chứng và lệnh tái hiện.

Phạm vi yêu cầu chat hiện tại chỉ là mốc 0; dừng tại checkpoint này, chưa bắt đầu mốc 1–5. Khi được giao triển khai toàn bộ, áp dụng luồng liên tục ở các phần còn lại của plan.

### Mốc 1 — Follow, hồ sơ và nền tảng API

- [x] Follow generic, mutual, tìm tài khoản, public profile và danh sách kết nối.
- [x] Wrapper author cũ, số đếm và thông báo chương mới tương thích, không tạo quan hệ follow thứ hai.
- [x] Kiểm thử auth, cạnh trùng, tự follow, tài khoản khóa/xóa, chuyển reader thành author và API cũ/mới.

Hoàn thành ngày 17/11/2026 theo yêu cầu tiếp tục mốc 1. Backend build/typecheck pass, 18/18 test pass; lượt bổ sung assertion dedup notification với migration 028 pass. Contract và handoff cập nhật trong progress. Mốc 2–5 chưa bắt đầu.

### Mốc 2 — Backend bình luận, anchor và quyền riêng tư

- [ ] Anchor/contentVersion từ nội dung xuất bản, helper access/VIP không side effect.
- [ ] Audience, snapshot người nhận, policy root/reply, author feedback/thread APIs, nonpublic text validation.
- [ ] Public tag, phân luồng notification/fan-out/idempotency và payload focus.
- [ ] Policy trên list/detail/reply/reaction/edit/delete/report/moderation/author manage/count/notification.
- [ ] Migration/index additive, dữ liệu cũ PUBLIC, feature flag và quy tắc tương thích app cũ.
- [ ] Typecheck/build cùng unit/integration HTTP với PostgreSQL/MongoDB cô lập cho ma trận quyền cốt lõi.
- [ ] Ghi contract API thực tế, ví dụ request/response/error, migration/env/flag và test evidence trước khi nối UI.

### Mốc 3 — Web

- [ ] Hồ sơ reader, tìm bạn, follow/follow lại/unfollow và danh sách kết nối.
- [ ] Public root/reply ở truyện/chương có tag mutual, giữ tính năng công khai hiện có.
- [ ] Chọn đoạn, composer phạm vi bạn bè/tác giả, marker/count theo quyền và thread/replies.
- [ ] Tab góp ý riêng tác giả và danh sách góp ý đã gửi.
- [ ] Notification mở đúng root/reply ngoài trang đầu; cache theo tài khoản/kênh, xử lý mất quyền và lỗi/empty/loading.
- [ ] Kiểm thử browser tích hợp thật, responsive và các ca account switch/unfollow/VIP/detached.

### Mốc 4 — Mobile

- [ ] Dùng cùng contract/anchor; render chương theo đoạn, nhấn giữ để bình luận.
- [ ] Hồ sơ, tìm bạn, follow, connections; public comment truyện/chương có replies và tag.
- [ ] Thread bạn bè và private tác giả; Góp ý gửi tôi/đã gửi, navigation theo CurrentUser/quyền chủ truyện; không xây IDE tác giả.
- [ ] Notification đi tới đúng nội dung; cache/account/foreground/offline tuân quyền riêng tư.
- [ ] Typecheck và kiểm thử Expo/mobile thật theo công cụ/thiết bị sẵn có; ghi rõ nền tảng nào chưa kiểm chứng.

### Mốc 5 — Tích hợp, nghiệm thu và bàn giao

- [ ] Rà toàn bộ ma trận ở mục 5; sửa các lỗi tích hợp, thêm regression test cho lỗi có ý nghĩa.
- [ ] Chạy checks phù hợp backend/web/mobile sau thay đổi cuối; không dùng mock hoặc chỉ typecheck làm bằng chứng hoàn thành quyền truy cập.
- [ ] Rà diff về lộ nội dung, counts, notification, cache, public compatibility và hồi quy reader/bookmark đã merge.
- [ ] Cập nhật tài liệu API/SRS/Database liên quan, hướng dẫn chạy và demo đủ các vai trò/kênh.
- [ ] Báo kết quả thực tế, checks chưa chạy/chưa đạt và rủi ro còn lại; chỉ đánh dấu hoàn thành khi luồng chính và acceptance checks tương ứng đã đạt.

### Quy tắc thực thi và tiếp tục bằng tài khoản khác

- Khi người dùng yêu cầu bắt đầu, triển khai liên tục từ mốc 0 tới mốc 5, tự sửa lỗi trong phạm vi. Không tự dừng sau backend hoặc yêu cầu chuyển sang prompt Session 2.
- Không tự mở rộng sang chat/feed/đồng tác giả/media riêng/chọn câu-từ, không push hoặc deploy production.
- Quyết định kỹ thuật nhỏ theo cấu trúc repo có thể tự chốt và ghi lại; chỉ hỏi khi thiếu quyết định sản phẩm không thể suy ra từ plan/code.
- Progress chính: `docs/Implementation/reader-social-private-comments-progress.md`. Cập nhật sau mỗi phần việc có ý nghĩa, trước khi kết thúc và khi biết sắp bị gián đoạn; không đợi hoàn thành cả mốc mới ghi.
- Progress phải ghi: việc đã xong/đang dở/còn lại; code đã đổi; contract thực tế; lệnh test và kết quả; lỗi có thể tái hiện; migrations/flags; bước tiếp theo. Không ghi secrets.
- Nếu đổi tài khoản, chỉ một agent/session tiếp tục sửa checkout tại một thời điểm. Agent mới đọc plan + progress + Git diff, xác minh bằng code/test rồi tiếp tục đúng chỗ; không phụ thuộc lịch sử chat hay tự làm lại từ đầu.
- Không dùng lại prompt Session 1/Session 2 cũ cho luồng này. Bản toàn bộ này thay thế cách chia hai session trong các tài liệu đã lưu trước đó.
## 5. Ma trận kiểm thử và nghiệm thu

| Nhóm | Trường hợp bắt buộc |
| --- | --- |
| Follow | Một chiều, mutual, tự follow, cạnh trùng, thao tác lặp, locked/deleted, READER chuyển AUTHOR, generic/legacy cùng trạng thái |
| Public | Khách đọc, đăng nhập viết/reply, tính năng cũ giữ nguyên, legacy comments thiếu audience vẫn PUBLIC |
| Tag | Root/reply; mutual/nonmutual; tag giả; đổi tên; edit/approval/retry; gộp mention và reply notification |
| Bạn bè | ALL snapshot/SELECTED; mutual được chọn/không được chọn; follower một chiều; bạn mới; unfollow/refollow; B/C cùng luồng |
| Quyền xuyên suốt | List/detail/thread/reply/reaction/edit/delete/report/count/author manage/notification không vượt policy; ID trực tiếp không lộ dữ liệu |
| Riêng tác giả | Gửi ở truyện/chương/đoạn; chỉ người gửi và chủ truyện; tác giả khác không truy cập; admin chỉ qua review có quyền |
| Kiểm duyệt | Pending/rejected/approved; edit làm review cũ stale; duyệt/retry không đổi audience hoặc gửi sai người |
| Anchor | Đổi font/màn hình; format/footnote; chèn đoạn phía trước; sửa/xóa; đoạn trùng; detached; quote client giả; không đọc draft |
| Quyền nội dung | Truyện/chương không public hoặc deleted; VIP chưa unlock; không tăng views/history chỉ do kiểm quyền |
| Media | Server chặn ảnh/GIF trên mọi thao tác nonpublic; public media tiếp tục tuân moderation hiện có |
| Thông báo | Fan-out đủ người; idempotent theo recipient; không báo private bạn bè cho tác giả; không quote riêng trong preview; focus ngoài trang đầu |
| Client | Account switch/logout/unfollow/foreground; loading/empty/error; cache không lẫn; web responsive; Expo và thiết bị đã ghi nhận |
| Tương thích | Endpoint cũ, app mobile cũ chỉ nhận PUBLIC mặc định; không reset dữ liệu; migration/index lặp an toàn theo cơ chế repo |

Test hiện có có thể mở rộng: backend comments integration, reader-social-comment-preferences, author-workflow, comment-user-report-admin-moderation; web reader-comments, reader-comment-moderation, reader-chapter-workspace. Xác minh tên/path hiện tại trước khi dùng.

## 6. Phát hành và lưu tiến độ

- Migration/index additive, không reset DB hoặc xóa dữ liệu người dùng để làm test pass.
- Mọi backend instance phải hiểu policy audience trước khi bật tạo riêng. Backend cũ có thể bỏ field lạ và tạo public nên không được chạy xen khi cho phép ghi private.
- Feature flag tắt tạo riêng không được làm đường đọc coi dữ liệu riêng đã có là public. Rollback giữ backend bảo vệ private, không quay về binary cũ không hiểu audience.
- Chỉ bật sau khi acceptance gate tương ứng đạt; thay đổi môi trường production/deploy không nằm trong việc lưu plan này.
- Progress lưu: mốc hiện tại; việc đã xong/còn lại; thay đổi contract; file/symbol quan trọng; lệnh test và kết quả; lỗi tái hiện; bước tiếp theo; Git state/commit nếu có.
- Trong mỗi session, cập nhật progress sau mốc có ý nghĩa và trước khi kết thúc; đọc lại khi tiếp tục hoặc sau context compaction.
- Không ghi mật khẩu, token, connection string thật hay dữ liệu người dùng vào tài liệu handoff.

## 7. Bằng chứng khảo sát và lưu ý

- Graphify tại `graphify-out/graph.json` là bản đồ để định hướng; code thực tế hiện tại là nguồn đối chiếu cuối cùng.
- Follow table hiện chỉ bị hạn chế target role trong service, FK trỏ users; có thể mở generic mà không tạo mạng follow thứ hai.
- `approvedCommentFilter` / `isCommentPublic` hiện gắn approved với công khai; đây là điểm phải sửa toàn diện.
- `domain-notifications.ts` hiện đưa root comment tới tác giả; phải phân luồng trước khi tạo private data.
- Public user profile API đã có nhưng web chưa có reader profile UI. Mobile auth đã nhận AUTHOR, không cần xây đăng nhập tác giả mới.
- Màn đọc web tách đoạn theo dòng trống; mobile hiện render cả chương trong một Text. Chưa có stable reader paragraph anchor.
- Đây là kết quả đọc tĩnh ngày 17/11/2026, chưa phải bằng chứng test hoặc triển khai.

## 8. Baseline sau khi reader-features merge

- Baseline triển khai mới là main 0e3c9b0e (PR #186), mới hơn lần khảo sát Graphify ban đầu; đối chiếu lại code trước từng mốc.
- Web hiện đã có chọn passage, line bookmarks, danh sách bookmark, focus/keyboard navigation, restore bookmark và quy tắc bỏ qua separator khi điều hướng. Tái sử dụng điểm tương tác phù hợp, giữ nguyên index/bookmark legacy và không gây hồi quy zoom/layout/keyboard.
- Chọn đoạn cho bình luận bạn bè vẫn là quyết định sản phẩm; không tự đổi thành chọn dòng theo layout chỉ vì bookmark hiện có thao tác theo dòng.
- Giữ các regression tests reader/bookmark hiện tại và bổ sung kiểm thử nơi menu comment giao với bookmark. Đây là yêu cầu tương thích, không mở lại phạm vi tính năng bookmark.
