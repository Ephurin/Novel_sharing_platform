# PR #74 — review fixes and verification

Ngày kiểm chứng: 29/10/2026. Các review được xử lý: R74-01 (queue starvation), R74-02 (missing Admin entitlement), R74-03 (integration với PR #73), và rehearsal nâng cấp database đã có dữ liệu.

## Source và phạm vi

- Baseline review: `6b5a58fdcb777ad43a5fcfb34237235e1243276b`.
- Implementation/tests: `b9c411090f9026955ba9dfca7f07de4ddeaae4ad`.
- Fixture ledger dùng reviewer tài chính thực: `68d2248daaef4e4efb84d6ec1cdd9425db5531f8` (source cuối của PR #74 được kiểm chứng).
- PR #73 dùng để ghép: `1def52f3c0a5ad665c62c1e0de1f5d88340ce888`.
- SHA ghép cục bộ cuối: `fa287072c52ec29e9b681aa0a602effd78029caa`, có hai parent là source `68d2248d` và PR #73 `1def52f3`.
- Tree ghép: `662a62d6239ec162f18ce4faddc5cc398176b4af`.

Không merge PR vào `main`, không cập nhật container đang phục vụ demo, không chạy seed/migration trên database demo. Chỉ các database PostgreSQL/MongoDB tạm có tên riêng được tạo, migrate, seed và dọn. Commit bằng chứng tách khỏi các commit source/test.

## R74-01 — một job lỗi không chặn hàng đợi

Thêm migration additive `019_admin_job_retries.sql`, giữ nguyên ID/payload/status của job đang có:

- `next_attempt_at`, `last_attempt_at`, `failed_at`, `retry_count`; status thêm `FAILED` để cách ly sau 6 lần lỗi.
- Thử lại giãn dần từ 5 giây, nhân đôi và chặn trên ở 300 giây. Worker chỉ chọn job đến lịch, ưu tiên lịch đến hạn rồi thứ tự job. Lỗi một job không dừng việc xử lý job độc lập phía sau.
- Validate payload `NOTIFY` và `COMMENT_SYNC` trước khi thực thi. Giữ session advisory lock giữa các worker, idempotency key theo `job_id`, và cách đồng bộ bình luận dựa trên quyết định đang có hiệu lực.
- `/admin/jobs` trả cả job chờ lẫn job đã cách ly, kèm lỗi và lịch thử tiếp. `POST /admin/jobs/:jobId/retry` chỉ cho Admin toàn quyền lên lịch lại job `FAILED`; ghi audit, giữ nguyên job ID và tăng số lần retry thủ công.
- Trang nhật ký có trạng thái dừng do lỗi và nút lên lịch thử lại. Endpoint `/admin/jobs/retry` hiện có chỉ xử lý các job đến lịch, không bỏ qua backoff/quarantine.

Kiểm chứng: poison COMMENT_SYNC trước NOTIFY khỏe → NOTIFY DONE; payload NOTIFY lỗi không chặn job sau và không thử lại trước lịch; cách ly sau giới hạn; xem và retry qua API/UI; hai worker ở hai process và khoảng dừng sau Mongo delivery/trước SQL acknowledgement không tạo thông báo trùng.

## R74-02 — thiếu scope phải từ chối

- Bỏ mọi runtime fallback `coalesce(scope,'SUPER_ADMIN')`. `adminAccess`, HTTP authentication và `isContentAdmin` yêu cầu scope rõ ràng; context nội bộ thiếu scope cũng không có quyền Admin nội dung.
- Migration `018` vốn đã backfill toàn bộ Admin legacy, gồm tài khoản bị khóa; giữ nguyên migration này. `019` không cấp lại toàn quyền cho các dòng entitlement bị mất sau `018`.
- Seed Admin và demo seed cấp scope rõ ràng trong cùng transaction tạo/cập nhật tài khoản, dùng `ON CONFLICT DO NOTHING` để giữ scope đã cấp.
- Promotion vẫn ghi role và entitlement trong một transaction. Đếm Admin toàn quyền cuối cùng chỉ tính tài khoản có entitlement thật. Các fixture Admin dùng scope rõ ràng.
- Fixture ledger cũ dùng AUTHOR làm người duyệt rút tiền và dựa vào role claim của JWT. Đã sửa fixture để dùng Admin `FINANCE` có entitlement và kiểm tra role thực trong database; không nới quyền hoặc đổi quy tắc tài chính.

Kiểm chứng: Admin thiếu row trả 403; role/scope mới áp dụng cho token cũ; token có claim cũ không cấp thêm quyền; promotion/demotion và thao tác đồng thời giữ một SUPER_ADMIN hợp lệ; wallet ledger được chạy thật thay vì chỉ skip.

## R74-03 — ghép theo từng phần với PR #73

Source PR #74 giữ menu READER/GUEST và marker `shell-session` theo cùng contract của PR #73, đồng thời giữ link `/appeals`, đường dẫn đọc truyện của tác giả và AdminShell. Marker cũng có trong AdminShell.

Bản ghép cục bộ có ba file cần giải quyết conflict: `router.tsx`, `WebAppShell.tsx`, `AuthorTheme.tsx`. Đã giữ `OptionalSession` cho public author profile, theme của public routes, navbar theo role, marker phiên và toàn bộ Admin/appeal routes. `web/package.json` giữ cả các script Admin và contrast. `ReaderPage.tsx` và `theme/refinements.css` của bản ghép khớp byte với PR #73; không chọn nguyên một phía để đè lên file chung.

`combined-shared-files.patch` là diff ba file đã resolve từ source PR #74 đến tree ghép. Để tái hiện sau khi merge hai SHA trên bằng `--no-commit`: giữ nguyên các file auto-merge khác; khôi phục riêng ba file conflict về source PR #74, áp patch này, stage rồi commit. Kiểm tra tree hash để đối chiếu. SHA ghép là commit kiểm tra local, không được đưa vào lịch sử PR #74 hay merge lên `main`.

## Kết quả

Xem `validation.json` và các log đi kèm để đối chiếu SHA, trạng thái và nguồn dữ liệu:

| Kiểm tra | Source PR #74 | Ghép #73 + #74 |
| --- | --- | --- |
| Type-check/build backend và web | PASS | PASS |
| Backend với `RUN_AUTHOR_DATA_TESTS=1` | 238 PASS, 4 SKIP, 0 FAIL / 242 | 238 PASS, 4 SKIP, 0 FAIL / 242 |
| API + browser thật | 25/25 PASS | 25/25 PASS |
| Wallet frontend | 4/4 PASS | 4/4 PASS |
| Contrast từ PR #73 | Không thuộc source #74 | 18/18 PASS |
| Populated upgrade rehearsal | PASS | PASS |

Bốn bộ opt-in còn skip: live AI Gateway, author launch checklist, author workflow và novel/chapter comment integration. Không gọi AI trả phí. Không có script lint trong hai package. Vite vẫn có cảnh báo bundle lớn sẵn có.

RED chạy trên baseline trước sửa: 8 test, 2 PASS và 6 FAIL đúng kỳ vọng; gồm job khỏe vẫn PENDING, API thiếu scope trả 200 thay vì 403, và thiếu các trường/lifecycle retry mới. GREEN có 9 regression cases cho queue và entitlement; log full backend bao gồm các case này.

Browser runner dùng cổng loopback được cấp riêng cho từng lần chạy, không trộn `localhost`/`127.0.0.1`, và ghi SHA cùng `sourceTreeDirty=false` trong metadata. Kiểm tra các màn hình Admin/portal ở sáng/tối và desktop/mobile; chuyển phiên qua form đăng nhập/logout thật GUEST → READER → AUTHOR → ADMIN → GUEST, marker, menu theo role và link khiếu nại. Trên bản ghép còn kiểm tra navbar guest của Reader UI. Ảnh chọn lọc kèm theo; các runner sinh toàn bộ ảnh trong thư mục output tạm.

Rehearsal bắt đầu bằng schema thực trước `018` và seed baseline: 26 users (gồm thêm một Admin legacy bị khóa), 12 novels, 144 chapters, 25 wallets, 12 withdrawals/transactions, 18 reports và 12 reviews. Chạy `018` rồi `019`; fingerprint các bảng ứng dụng khớp trước/sau, cả 2 Admin legacy được backfill, hai job cũ giữ ID/payload/status. HTTP: legacy active 200, legacy locked 403, Admin mới thiếu scope 403. Cả PostgreSQL/MongoDB tạm đều được dọn.

## Đồng bộ animate UI

Nhánh local `feat/animate-ui-integration` đã được fast-forward đến các sửa lỗi Admin. Giữ AnimatedMenu, AnimatedDisclosure, WorkspaceCommands và các phần WIP khác; lệnh tác giả chỉ hiện với writer. Type-check, browser navigation và author/admin motion đã chạy đạt với `PLAYWRIGHT_CHANNEL=chrome`.

Đã lưu named stash và patch dự phòng trước khi ghép. 36 file tracked không giao nhau và 43 file untracked được đối chiếu nội dung giữ nguyên; ba file chung được ghép có chủ đích. Khôi phục trạng thái index sạch và giữ thay đổi animation ở working tree, không gom WIP của người dùng vào commit PR #74. Các lần test animation đầu cần chọn Chrome có sẵn và gặp timeout khi Vite khởi tạo lạnh; chỉ log lượt chạy cuối PASS được dùng làm bằng chứng.

## CI và điều kiện bàn giao

P8 CI được kiểm tra trên GitHub cho HEAD đã push của PR #74: [checks](https://github.com/Ephurin/Novel_sharing_platform/pull/74/checks). Tại thời điểm tạo commit bằng chứng, lần CI mới sau push là **NOT_RUN_AT_CAPTURE**; không suy ra kết quả CI từ test local hoặc lần green trước. SHA ghép local chưa được chạy GitHub P8 CI (**NOT_RUN**); các kết quả ghép trong bảng là kiểm tra local trên SHA đã ghi, không phải deployment hay phê duyệt merge.

Triển khai cần chạy migration `019` trước backend mới. Admin thiếu entitlement phải được một SUPER_ADMIN hợp lệ cấp lại scope rõ ràng; không dùng fallback toàn quyền. Giữ demo reseeding tắt trong quá trình nâng cấp. Chờ re-review trước khi merge PR.

## Chạy lại

```powershell
$env:RUN_AUTHOR_DATA_TESTS='1'
npm --prefix backend run test:isolated
node backend/scripts/rehearse-admin-upgrade.mjs

$env:RUN_ADMIN_BROWSER_TESTS='1'
$env:ADMIN_BROWSER_OUTPUT_DIR=Join-Path $env:TEMP 'pr74-browser-verification'
# Thêm biến dưới đây khi đang ở worktree ghép với PR #73:
# $env:PR74_COMBINED_READER='1'
npm --prefix web run test:admin-browser
```
