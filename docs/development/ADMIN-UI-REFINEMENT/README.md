# Review và tinh chỉnh Admin hiện có — 26/10/2026

Giữ React 19, TypeScript/Vite, React Router 7, Mantine 7, React Query và cấu trúc 9 route `/admin` hiện có. Dùng lại `AdminShell`, `AdminShared`, `PageStates` và token `--sc-*` từ theme StoryCraft. Không đổi API, backend, cấu trúc route, dependency hoặc seed đang dùng.

## Vấn đề và thay đổi

| File trong `web/src/features/admin/` | Vấn đề phát hiện | Tinh chỉnh |
|---|---|---|
| `AdminShared.tsx`, `admin.css` | Một số nút trong bảng/hộp thoại lệch cỡ; khoảng cách giữa panel bị cộng dồn; UUID dài gây khó quét | Đồng bộ font/line-height, nút 36px và nút bảng 30px, input 40px, badge tối thiểu 22px, hàng bảng tối thiểu 52px có thể giãn theo nội dung; sửa khoảng cách grid; `AdminId` dùng CopyButton/Tooltip của Mantine |
| `AdminNovelsPage.tsx` | Synopsis lặp lại ở mọi dòng; tiêu đề chưa đủ nổi bật | Bỏ synopsis khỏi bảng, tiêu đề 14px/600 tối đa hai dòng và link đến chi tiết; giữ đầy đủ tiêu đề trong tooltip/detail; xuất bản, tiến độ và tình trạng gỡ là các thuộc tính riêng; dùng nhãn “Đã gỡ” cho gỡ mềm |
| `AdminNovelDetailPage.tsx`, `admin-api.ts` | API đã trả `coverImageUrl` nhưng UI chưa dùng; ID/email chiếm vị trí chính | Thêm khai báo kiểu cho trường đã có; ưu tiên bìa 2:3, tiêu đề, tác giả, trạng thái, số chương/lượt đọc; xử lý thiếu/lỗi ảnh bằng trạng thái văn bản; ID và email ở phần thông tin bổ sung; giữ preview giới thiệu 320 ký tự và nút mở rộng có aria-expanded |
| `AdminModerationPage.tsx` | Hai UUID đầy đủ làm bảng rộng và khó đọc | Rút gọn hình thức UUID thành `xxxxxxxx…xxxx`; tooltip, clipboard, data-testid và link vẫn dùng ID nguyên vẹn. Cả queue và reports dùng chung bảng này |
| `AdminModerationDetailPage.tsx` | Metadata lặp; từng keyword gắn nhãn PENDING gây nhiễu; quyết định nằm xa bằng chứng | Đưa nội dung, bằng chứng và quyết định vào vùng chính; metadata có thể mở; hiển thị đủ summary/rules/reasons API cung cấp; nội dung dài vẫn mở đầy đủ; bỏ badge trạng thái giả lặp trên từng rule; thông điệp xác nhận theo loại đối tượng/nguồn; khóa nút khi request chờ |
| `AdminWithdrawsPage.tsx` | SUCCESS/“hoàn tất” có thể bị hiểu thành đã nhận tiền; nút cần khóa trong lúc gửi; lỗi do dữ liệu cũ cần tải lại | Nhãn “Đã duyệt”, giải thích duyệt chưa xác nhận tiền vào ngân hàng; khóa các nút/hộp thoại khi đang gửi; thông báo thành công; tải lại danh sách khi server trả 404/409; giữ lý do từ chối bắt buộc |

## Đối chiếu nghiệp vụ hiện có

Đã đọc `backend/src/modules/admin/admin.routes.ts`, `admin.service.ts`, `backend/src/modules/wallet/wallet.repository.ts` và middleware phân quyền:

- API rút tiền yêu cầu JWT và role ADMIN; request không đăng nhập trả 401, role khác trả 403.
- Duyệt/từ chối dùng transaction PostgreSQL, khóa `withdraw_requests` và ví, kiểm tra PENDING và đủ coin đang giữ.
- Duyệt trừ coin đang giữ và cập nhật request/transaction thành SUCCESS. Không có lời gọi chuyển tiền ngân hàng trong luồng này.
- Từ chối hoàn coin khả dụng, giảm coin đang giữ, lưu lý do và cập nhật FAILED.
- Thao tác lặp bị từ chối; API hiện trả 404 cho yêu cầu không còn PENDING, 409 cho trạng thái ví không hợp lệ. Không đổi các mã lỗi này hoặc quy tắc tài chính.
- Backend hiện có ngữ nghĩa report riêng cho COMMENT: chấp nhận report gỡ bình luận; từ chối report giữ bình luận. Keyword review duyệt bình luận để hiển thị, hoặc duyệt truyện/chương để xuất bản.
- **Giới hạn backend được giữ nguyên:** report NOVEL/CHAPTER đi qua xử lý xuất bản hiện có; review USER chỉ ghi nhận quyết định, không tự khóa tài khoản. UI xác nhận diễn đạt hành vi thực tế, không hứa một thao tác gỡ/khóa chưa có trong API. Lần tinh chỉnh frontend này không thiết kế lại nghiệp vụ report.
- Toàn bộ bằng chứng mà API hiện trả được giữ truy cập đầy đủ. Raw evidence server không được thêm vào API.

## Kiểm chứng

- Web và backend: `npm run typecheck`, `npm run build` PASS. Không có script lint trong hai package.
- `RUN_ADMIN_BROWSER_TESTS=1 npm run test:admin-browser`: **13/13 PASS**, không skip. Runner dùng database PostgreSQL/MongoDB tạm riêng, migrate và seed rồi dọn.
- Hai bộ backend regression kiểm duyệt xuất bản/report bình luận: **22/22 PASS**, không skip, trên database test riêng.
- `npm run test:wallet`: **4/4 PASS**.
- 9 route × 2 theme × desktop 1440px/mobile 390px: **36 ảnh**, không tràn ngang document; bảng rộng cuộn trong vùng riêng. Kiểm tra font Be Vietnam Pro/tiêu đề 24px, menu mobile và lưu lựa chọn theme qua tải trang.
- Test mới: clipboard giữ UUID đầy đủ và route giữ ID gốc; ảnh bìa đúng dữ liệu API, synopsis mở đầy đủ, metadata ID truy cập được; xuất bản và gỡ mềm hiển thị độc lập; loading, empty, lỗi 503 và Retry; nội dung/evidence đầy đủ; keyword approval xuất bản truyện; accept/reject report giữ đúng hành vi.
- Test rút tiền: kiểm tra 401/403 cho cả list/approve/reject; giữ phản hồi API thật để xác minh trạng thái pending khóa nút và Escape; xác nhận thông điệp không hứa chuyển khoản; kiểm tra coin trong DB sau duyệt/từ chối; gửi hai lệnh duyệt đồng thời, chỉ một lệnh thành công và coin không bị trừ lặp.
- Vite còn cảnh báo bundle lớn hơn 500kB. Build thành công; không đổi chiến lược bundling trong đợt tinh chỉnh này.

Kết quả chi tiết ở `browser-checks.json`, `backend-tests.log` và các ảnh cùng thư mục. Dữ liệu ảnh thuộc database kiểm thử; bìa SVG và giới thiệu dài là fixture kiểm tra, không được thêm vào seed/DB local đang sử dụng.

Chạy lại từ `web`:

```powershell
$env:RUN_ADMIN_BROWSER_TESTS='1'
$env:ADMIN_BROWSER_OUTPUT_DIR='F:/Code/Github/Novel_sharing_platform/docs/development/ADMIN-UI-REFINEMENT'
npm run test:admin-browser
```

Các commit tinh chỉnh riêng trên nhánh `feat/admin-ui-redesign`: `462e6aaf` (chung), `1673a8b7` (bảng truyện), `485285f4` (chi tiết truyện), `f536f0af` (queue/reports), `6de73a8d` (chi tiết kiểm duyệt), `bba6d9c1` (rút tiền). Commit bổ sung lưu nhãn gỡ mềm, test và báo cáo.
