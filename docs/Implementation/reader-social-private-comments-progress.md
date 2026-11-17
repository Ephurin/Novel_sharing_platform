# Tiến độ Follow, bình luận bạn bè và góp ý riêng tác giả

Cập nhật: 17/11/2026 (Asia/Bangkok). **Đã hoàn thành mốc 0 và mốc 1.** Xem phần mốc 1 để biết kết quả mới nhất; các ghi chép baseline mốc 0 được giữ làm lịch sử. Mốc 2–5 chưa triển khai.

## Nơi làm việc hiện tại

- Worktree: `F:\Code\Github\Novel_sharing_platform-reader-features`.
- Nhánh: `feat/reader-social-private-comments`.
- Baseline: `0e3c9b0e`, main chứa PR #186 reader-features đã merge.
- Nhánh social được fast-forward từ d1292da0 lên baseline mới; không reset/rebase nhánh reader, không tạo commit code mới.
- Worktree sạch trước khi đổi từ reader sang social. Sau mốc 0, tracked source/package/lockfile không đổi; plan/progress vẫn là hai file untracked. Dependencies mobile, build outputs và bằng chứng cục bộ nằm trong các đường dẫn đã được Git ignore.
- Checkout gốc `F:\Code\Github\Novel_sharing_platform` vẫn ở `feat/ui-polish-round-2`, dành cho phiên UI khác. Không sửa/đổi nhánh/stash/reset ở đó.
- Plan: `docs/Implementation/reader-social-private-comments-plan.md` trong worktree social.
- Progress: chính file này. Khi đổi tài khoản, mở đúng worktree trên và đọc hai file cùng Git diff trước khi tiếp tục.

## Trạng thái các mốc

| Mốc | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Chuẩn bị worktree/nhánh/tài liệu | Đã làm | Reader PR #186 đã merge; worktree social tại main 0e3c9b0e; plan/progress đã lưu |
| 0. Preflight và baseline checks | Hoàn thành, có lỗi baseline | Đã xác minh DB test cô lập và cleanup; backend 52/53 test pass; web 10/10 browser test pass; build/typecheck và Android bundle pass; ghi rõ lỗi author-workflow, lệch patch Expo và giới hạn thiết bị |
| 1. Follow, hồ sơ, API | Hoàn thành | Backend build/typecheck pass; 18/18 test pass, lượt bổ sung notification pass |
| 2. Private comments, anchor, tag, notifications, policy | Chưa làm | Chưa sửa code tính năng |
| 3. Web | Chưa làm | Chưa sửa code tính năng |
| 4. Mobile | Chưa làm | Chưa sửa code tính năng |
| 5. Tích hợp và nghiệm thu | Chưa làm | Chưa có test evidence |

## Mốc 1 — cập nhật mới nhất, thay thế trạng thái baseline bên dưới

Hoàn thành ngày 17/11/2026 theo yêu cầu mới của người dùng. Mốc 2–5 chưa bắt đầu. Các ghi chép mốc 0 phía dưới được giữ làm lịch sử.

- Thêm `users/connections.service.ts`, `connections.routes.ts`, `connections.integration.test.ts`; tích hợp users routes/controller/service. Dùng chung bảng `follows`; mutual là hai cạnh ngược nhau.
- Generic follow dùng chung repository với author follow; chỉ AUTHOR/ADMIN nhận AUTHOR_FOLLOW notification, reader không nhận link tới author workspace. Wrapper author DELETE nay cũng kiểm tra active account và target AUTHOR/ADMIN. Response legacy vẫn `{authorId,following}`. Counts và thông báo chương mới tiếp tục dùng cùng cạnh, không double count/event.
- Search theo substring username/displayName không phân biệt hoa thường, ký tự `%` được coi là literal. Search/connections lọc active/chưa deleted trước phân trang; một SQL snapshot trả cả page và total, kể cả trang rỗng.
- Migration additive `028_social_follow_reverse_index.sql`: index `(author_id,follower_id)` với IF NOT EXISTS. Chỉ apply trên DB test, chưa apply runtime/demo; không thêm env/feature flag.
- Sửa fixture `author-workflow.integration.test.ts` thêm migrations 022/023 trong schema test. Lỗi baseline khóa ngoại chapter_reads đã hết, test pass.
- Backend `npm run build` và `npm run typecheck`: pass. Bốn file connections/author-workflow/reader-social-comment-preferences/comments integration: **18/18 pass, 0 skipped**. Sau bổ sung assertions dedup notification và chốt migration 028, chạy lại connections: **1/1 pass, 0 skipped**. `git diff --check` pass.
- Test HTTP mới bao phủ auth, self-follow, duplicate/concurrent follow, locked/deleted actor/target, mutual, phân trang và trang rỗng, validation, private fields, reader chuyển AUTHOR, generic/legacy chia sẻ cạnh/count, author-follow notification và new-chapter notification không gửi trùng.
- DB tạm: `ephurin_test_admin_backend_1794934528098` và `ephurin_test_admin_backend_1794934587376`; cả hai runner báo `cleanedUp:true`. Ports reader 5433/27018. Logs local: `.vscode/reader-social-m1-tests.log`, `.vscode/reader-social-m1-final.log`.
- Tái hiện: dùng env cô lập ở mốc 0, bật RUN_AUTHOR_WORKFLOW_TESTS=1, RUN_COMMENT_TESTS=1 và AI_SERVICE_URL trỏ cổng 9; từ backend chạy `node scripts/run-isolated-tests.mjs src/modules/users/connections.integration.test.ts src/modules/interactions/author-workflow.integration.test.ts src/modules/interactions/reader-social-comment-preferences.postgres.test.ts src/modules/interactions/comments.integration.test.ts`. AI unreachable/projection failure logs thuộc kịch bản test, không phải failed assertions.
- Không đổi dependencies/lockfile, UI web/mobile hoặc private comments; chưa commit/push/deploy. Cảnh báo patch Expo và giới hạn native-device của mốc 0 vẫn còn.

### Contract API mốc 1

Prefix `/api/v1`, envelope `{success,data,error,meta}` hiện có.

| Endpoint | Contract |
| --- | --- |
| POST/DELETE `/users/:userId/follow` | Active auth bắt buộc, không cần body; data `{targetUserId,following,followedBy,mutual}` |
| GET `/users/search?q=...&page=1&limit=20` | Optional auth; array `{userId,username,role,displayName,avatarUrl,following,followedBy,mutual}` |
| GET `/users/me/connections?type=MUTUAL` | Active auth; type bắt buộc FOLLOWING/FOLLOWERS/MUTUAL; cùng query q/page/limit và array contract |
| GET `/users/:userId/profile` | Optional auth; giữ public fields cũ, thêm followersCount/followingCount/mutualCount/following/followedBy/mutual; không email/settings |

Ví dụ POST thành công: `{targetUserId:"<uuid>",following:true,followedBy:false,mutual:false}`. Follow ngược lại tạo mutual. Guest có các relationship flags=false. UI dùng mutual trước, rồi following, rồi followedBy để hiển thị Bạn bè/Đang theo dõi/Theo dõi lại/Theo dõi.

Pagination meta `{page,limit,totalItems,totalPages}`. q mặc định rỗng (liệt kê active accounts), trim, tối đa 100 ký tự; page 1..100000; limit 1..100, mặc định 20. Counts followers/following đếm cạnh lưu trữ để tương thích legacy; mutualCount và connection lists chỉ gồm đối tác active/chưa deleted.

Lỗi: UUID/query sai 400; thiếu auth 401; actor inactive 403; target missing/inactive 404 NOT_FOUND_001; self/duplicate 409 INTERACTION_001; unfollow cạnh không tồn tại 404 INTERACTION_002. Target inactive cũng 404 ở public profile. Author wrapper giữ giới hạn AUTHOR/ADMIN.

**Bước tiếp theo: mốc 2**, triển khai audience/snapshot/anchor/policy/mentions/notifications riêng. Các chỉ dẫn “việc tiếp theo” ở phần mốc 0 dưới đây đã được phần cập nhật này thay thế.

## Chuẩn bị đã thực hiện

- Khảo sát Graphify/backend/web/mobile ban đầu, chốt đầy đủ quyết định sản phẩm trong plan với người dùng.
- Tạo nhánh social ban đầu từ d1292da0; giữ các thay đổi UI ở đúng checkout UI. Stash GitHub Desktop trước đó được giữ làm dự phòng, không apply vào worktree social.
- Sau khi PR reader merge: xác nhận reader worktree sạch, reader HEAD là ancestor main, social chưa có commit riêng; fetch origin main, checkout social và fast-forward an toàn tới 0e3c9b0e.
- Cập nhật plan cho triển khai toàn bộ trong một chat; worktree đã sẵn, không cần tạo lại hoặc dùng hai prompt session cũ.
- Đối chiếu nhanh reader mới: có selected passage, line bookmarks, bookmark library/restore và keyboard focus. Phải giữ các regression đã merge khi thêm menu comment/anchor.

## Kiểm thử và contract

Các kết quả sau kiểm tra baseline `0e3c9b0e`, trước khi có bất kỳ thay đổi code tính năng nào. Không có API/contract, migration hoặc feature flag mới; contract trong plan vẫn là dự kiến.

Phạm vi phiên hiện tại do người dùng chốt: hoàn thành mốc 0, lưu kết quả để tiếp tục mốc 1 sau; không tự bắt đầu mốc 1–5. Không sửa/checkout/stash/reset checkout UI gốc, không push/deploy.

### Môi trường và giới hạn

- Đã kiểm tra instructions ở worktree và các thư mục cha: không có `AGENTS.md` áp dụng; `SKILL/AGENTS.md` chỉ thuộc thư mục con đó, không thuộc phạm vi thay đổi hiện tại. Đã đọc plan/progress và xác nhận Git branch/HEAD/diff.
- Node `v24.22.0`, npm `11.19.1`, Docker `29.8.1`, Compose `v5.5.1`; npm registry truy cập được.
- Stack reader đang chạy riêng: PostgreSQL `127.0.0.1:5433`, MongoDB `127.0.0.1:27018`, backend `4001`, web `8081`, AI service `8001`. Không restart/rebuild/stop stack nào trong mốc này, không dùng cổng DB `5432`/`27017` của stack UI để test.
- `backend/node_modules` và `web/node_modules` là junction sang dependencies ở checkout gốc. Chỉ sử dụng để chạy công cụ; `npm ls --depth=0` của cả hai pass. Không chạy install/update qua hai junction này. Nếu cần đổi dependencies ở mốc sau, chuẩn bị dependencies riêng trong worktree social trước để không ghi vào checkout UI.
- `mobile/node_modules` đã được cài riêng bằng `npm ci --no-audit --no-fund` (688 packages); package.json và package-lock.json không thay đổi. Có cảnh báo deprecated từ dependencies hiện tại, chưa nâng phiên bản.
- Playwright khởi chạy Chrome `157.0.8103.79` được. Expo CLI `54.0.26`, package Expo `54.0.36`, SDK config `54.0.0` đọc thành công.
- Không thấy `adb`, `emulator`, `java`, `xcodebuild` trên PATH; thư mục Android SDK mặc định trong LocalAppData cũng không có. Chưa chạy ứng dụng trên Android/iOS/emulator/Expo Go; bundle export không thay thế bằng chứng runtime native.

### Kết quả checks

| Check | Kết quả thực tế |
| --- | --- |
| `backend`: `npm run typecheck` | Pass ở bước đánh giá trong cùng chat, cùng HEAD; `npm run build` của mốc 0 cũng compile TypeScript thành công |
| `backend`: `npm run build` | Pass |
| `web`: `npm run typecheck` | Pass ở bước đánh giá trong cùng chat, cùng HEAD; build mốc 0 cũng chạy `tsc -b` thành công |
| `web`: `npm run build` | Pass; có cảnh báo `use client` bị bỏ qua trong dependencies và chunk lớn hơn 500 kB |
| `backend`: runner cô lập, 8 file bên dưới | **53 test: 52 pass, 1 fail, 0 skipped**, exit 1; tất cả migration hiện có chạy thành công trên DB test mới |
| `backend`: chạy lại riêng author-workflow trên DB mới | **1 test fail**, cùng lỗi tại dòng 46; xác nhận tái hiện độc lập |
| `web`: 5 file browser bên dưới | **10 test pass, 0 fail, 0 skipped**, Chrome headless; khoảng 113 giây |
| `mobile`: `npm run typecheck` | Pass |
| `mobile`: `node node_modules/expo/bin/cli config --type public --json` | Pass, platforms `ios` và `android` |
| `mobile`: `node node_modules/expo/bin/cli install --check` | **Exit 1**: `expo@54.0.36` cần `~54.0.37`, `expo-asset@12.0.13` cần `~12.0.14` theo Expo check tại thời điểm chạy |
| `mobile`: Android export qua Metro/Hermes | Pass, 814 modules, xuất `.hbc` khoảng 2.29 MB; không cần Android SDK cho bước bundle này |

Backend HTTP tests chạy Express trên cổng tạm với PostgreSQL/MongoDB thật. Các test DB guard/lifecycle có cả unit harness; Giphy và những dịch vụ ngoài trong fixtures được giả lập. Browser tests dùng Vite preview của build social và API routes giả lập: đây là bằng chứng hồi quy UI hiện tại, chưa phải acceptance tích hợp của tính năng social mới. Chưa chạy toàn bộ test suite của repo, kiểm thử AI/live service hoặc native device tests.

### Cách chạy lại baseline và bằng chứng cô lập DB

Từ worktree social, trong PowerShell, cấu hình runner bằng credentials đọc trực tiếp từ container reader, không ghi secrets vào file:

```powershell
$readerPgConfig = @{}
$readerPgEntries = docker inspect storycraft-reader-postgres-1 --format '{{json .Config.Env}}' | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect reader PostgreSQL configuration' }
foreach ($entry in $readerPgEntries) {
    $entryParts = $entry -split '=', 2
    $readerPgConfig[$entryParts[0]] = $entryParts[1]
}
$env:ADMIN_TEST_POSTGRES_URL = 'postgresql://{0}:{1}@127.0.0.1:5433/postgres' -f [uri]::EscapeDataString($readerPgConfig['POSTGRES_USER']), [uri]::EscapeDataString($readerPgConfig['POSTGRES_PASSWORD'])
$env:ADMIN_TEST_MONGO_URL = 'mongodb://127.0.0.1:27018'
$env:RUN_COMMENT_TESTS = '1'
$env:RUN_AUTHOR_WORKFLOW_TESTS = '1'
$env:AI_SERVICE_URL = 'http://127.0.0.1:9'
$env:EXPECTED_TEST_DB_NAME = ''
$testFiles = @(
    'src/core/database/test-db-guard.test.ts'
    'src/core/database/test-db-guard-lifecycle.test.ts'
    'src/modules/interactions/reader-social-comment-preferences.postgres.test.ts'
    'src/modules/interactions/comments.integration.test.ts'
    'src/modules/interactions/author-workflow.integration.test.ts'
    'src/modules/content-control/comment-user-report-admin-moderation.postgres.test.ts'
    'src/modules/reading/reader-workspace.postgres.test.ts'
    'src/modules/reading/reading-bookmark-entries.postgres.test.ts'
)
Push-Location backend
try { node scripts/run-isolated-tests.mjs @testFiles } finally { Pop-Location }
```

- Runner cấp `NODE_ENV=test`, `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, `EPHURIN_EXPECTED_TEST_DB` và DB URLs cho đúng DB tạm; dùng `.env.example` thay vì `.env` làm cấu hình mặc định. Guard kiểm tra identity DB thật trong các suite service; HTTP fixtures tạo schema và Mongo DB riêng rồi cleanup.
- Lượt baseline: `ephurin_test_admin_backend_1794910634944`; lượt tái hiện: `ephurin_test_admin_backend_1794910743257`. Cả hai runner báo `cleanedUp: true`, kể cả khi test fail.
- Sau chạy, truy vấn `pg_database` và Mongo `listDatabases` trên container reader cho **0 DB còn tồn tại** trong hai tên trên. Không chạy migration/reset/seed vào DB demo; không xóa dữ liệu người dùng để test pass.
- Tái hiện lỗi riêng: giữ cấu hình trên và chạy từ `backend`: `node scripts/run-isolated-tests.mjs src/modules/interactions/author-workflow.integration.test.ts`.

Browser baseline, chạy từ `web` sau build:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
node --test --test-concurrency=1 tests/reader-comments.browser.test.mjs tests/reader-comment-moderation.browser.test.mjs tests/reader-chapter-workspace.browser.test.mjs tests/reader-bookmark-regressions.browser.test.mjs tests/comment-notification-links.browser.test.mjs
```

Mobile bundle, chạy từ `mobile`:

```powershell
$env:EXPO_NO_TELEMETRY = '1'
$env:CI = '1'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4001/api/v1'
node node_modules/expo/bin/cli export --platform android --output-dir ../.vscode/reader-social-m0/mobile-android-export --max-workers 2
```

API URL loopback ở trên dùng cho kiểm tra bundle trên máy này; thiết bị thật cần URL LAN tương ứng. Export không gửi request tới backend.

### Lỗi có sẵn và việc còn lại

1. **Author-workflow fixture lỗi schema**: `backend/src/modules/interactions/author-workflow.integration.test.ts:46` kỳ vọng GET chapter của chủ truyện trả 200 nhưng nhận 500. Log PostgreSQL `23503`, constraint `chapter_reads_user_id_fkey`, schema `public`. Fixture tạo user/chapter trong schema riêng và dùng `search_path=<schema>,public`, nhưng danh sách migration ở dòng 21 thiếu `022_chapter_reads.sql` và `023_verified_chapter_reads.sql`. Lệnh ghi `recordChapterRead` tại `reading.repository.ts:427` rơi về bảng `public.chapter_reads`, có FK trỏ `public.users`, không có user của fixture. Đây là nguyên nhân suy ra từ log và code hiện tại, tái hiện trên hai DB độc lập; chưa sửa fixture/code trong mốc 0. Cần xử lý và chạy lại trước khi dùng suite author-workflow làm gate xanh.
2. **Expo dependency check chưa đạt**: lệch hai patch nêu ở bảng; typecheck và bundle vẫn pass. Chưa cập nhật dependencies/lockfile. Cần đồng bộ và kiểm tra lại trước nghiệm thu mobile; không coi export thành công là bằng chứng mọi chức năng native đã chạy.
3. **Warnings baseline**: Vite bỏ qua các directive `use client` của dependencies, bundle/chunk lớn; npm báo một số package deprecated. Chưa sửa các vấn đề ngoài phạm vi mốc 0.
4. **Giới hạn kiểm chứng**: chưa có Android/iOS native runtime hoặc thiết bị thực; chưa kiểm thử quyền riêng tư mới vì chưa triển khai mốc 1–5. Không có bằng chứng cho phép đánh dấu các mốc đó hoàn thành.

### Bằng chứng cục bộ và Git handoff

- Logs/artifacts nằm tại `.vscode/reader-social-m0/` (Git ignore): `backend-isolated.log`, `backend-author-workflow-repro.log`, `web-baseline.log`, `expo-public.json`, `mobile-export.log`, `mobile-android-export/`. Không dùng các file cục bộ này làm nguồn handoff duy nhất; kết quả, lệnh tái hiện và lỗi đã được ghi đầy đủ tại đây.
- Screenshot paths do browser tests in trong `web-baseline.log`, nằm ở thư mục Temp của tài khoản Windows; fixtures kiểm tra desktop và viewport mobile, không phải app native.
- Chỉ chỉnh hai file plan/progress; không đổi source, package/lockfile, API contract hoặc migrations; không tạo commit/push/deploy. Backend/web dist và mobile dependencies/export là artifacts cục bộ đã ignore.
- Mốc 0 hoàn thành nghĩa là đã kiểm tra và lưu baseline trung thực; **không có nghĩa toàn bộ checks đều xanh**. Kết thúc ở checkpoint theo yêu cầu chỉ thực hiện mốc 0.

## Việc tiếp theo

1. Khi tiếp tục, đọc instructions/plan/progress và Git diff tại worktree social, xác minh nhánh/HEAD; giữ nguyên checkout UI và reader/bookmark đã merge.
2. Xử lý lỗi baseline author-workflow fixture trước khi dùng suite này làm regression gate; nếu cần đổi dependencies backend/web thì chuẩn bị bản cài riêng, không install qua junction sang checkout UI.
3. Bắt đầu mốc 1 khi được giao tiếp: follow generic, mutual, hồ sơ, tìm tài khoản và connections; giữ API follow tác giả cũ. Chưa có code hoặc contract mới để nối UI.
4. Theo dõi lệch patch Expo và khả năng kiểm thử native trước mốc mobile. Khi người dùng giao triển khai toàn bộ, làm liên tục mốc 1–5 và cập nhật progress sau mỗi phần việc có ý nghĩa.

## Quy tắc bàn giao

Ghi việc đã xong/đang dở/còn lại; file/symbol đã sửa; contract API thực tế; migrations/env/flags; lệnh test/kết quả; lỗi tái hiện; bước tiếp theo và đường dẫn worktree. Agent/tài khoản tiếp theo phải kiểm code/diff để xác minh trước khi tiếp tục. Không nhận các test chưa chạy là pass, không ghi secrets và không push/deploy production ngoài chỉ dẫn riêng của người dùng.
