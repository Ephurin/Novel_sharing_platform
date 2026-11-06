# StoryCraft UI/UX — trang chủ thử nghiệm

Ngày kiểm tra: 2026-11-05.

## Chuẩn thiết kế

Ưu tiên ba skill `storycraft-design-system`, `storycraft-dark-mode`, `storycraft-content-density` do chủ project cung cấp. Không sửa nội dung các skill này. Quy tắc ưu tiên được ghi trong `SKILL/FRONTEND_DESIGN.md`; hướng dẫn áp dụng tại `docs/Frontend/ui-ux-workflow.md`.

UI UX Pro Max được cài riêng trên máy phát triển, không được version trong repo. Dữ liệu/scripts và license vẫn được giữ trên máy; commit nguồn dùng khi đánh giá là `b7d5353e0130feb8c5574ef1251f8a1db1873ccb` của `nextlevelbuilder/ui-ux-pro-max-skill`. Animate UI và Motion dùng các phiên bản dependency có sẵn, không nâng cấp thư viện.

## Ảnh đối chiếu

Ảnh dùng dữ liệu API giả lập, không phải số liệu người dùng thật. Bìa mẫu minh họa thuộc fixture kiểm thử; mã ứng dụng vẫn dùng ảnh bìa API trả về.

- [Trước — desktop sáng, 1440px](before-desktop-light.png)
- [Sau — desktop sáng, 1440px](after-desktop-light.png)
- [Sau — desktop tối, 1440px](after-desktop-dark.png)
- [Sau — điện thoại sáng, 375px](after-mobile-light.png)
- [Sau — điện thoại tối, 375px](after-mobile-dark.png)

Đã xem screenshot desktop sáng, tablet 768px và điện thoại tối; đối chiếu navbar, font, nền/card và màu nhấn với screenshot hồ sơ tác giả sáng trong bộ kiểm tra main UI hiện hành.

## Kết quả kiểm tra

Các lệnh chạy tại `web/`:

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | Qua |
| `npm run build` | Qua; Vite có cảnh báo directive `use client` và bundle lớn |
| `npx vite build --logLevel error` | Qua sau chỉnh CSS cuối cùng |
| `npm run test:contrast` | 18/18 qua |
| `node --test tests/reader-home.browser.test.mjs` | Qua; 16 cấu hình khách/độc giả × 4 chiều rộng × sáng/tối, thêm author/admin ở desktop |
| `node --test tests/reader-catalog.browser.test.mjs` | Qua |
| `node --test tests/main-ui-integration.browser.test.mjs` | Qua |
| `git diff --check` | Qua |

Trang chủ được kiểm tra điều hướng theo phiên, tìm kiếm, phân trang, chọn bộ lọc bằng bàn phím, chọn lại mục hiện tại, chờ API trả dữ liệu, trạng thái rỗng, vô hiệu hóa thao tác chưa khả dụng, reduced motion và không tràn ngang. Các bài browser dùng API giả lập, không ghi DB.

## Phạm vi

Đợt này triển khai tại trang chủ `/` và bổ sung shared component `AnimatedChoiceGroup`. Chưa mở rộng thay đổi sang Studio, Admin hoặc ứng dụng React Native; chưa đánh giá toàn bộ accessibility/performance của ứng dụng. Contrast test hiện có chỉ bao phủ các cặp token được khai báo.

## Bổ sung ngày 2026-11-06

- Xem nhanh truyện nổi bật và Khám phá bằng Popover của Animate UI; chỉ dùng dữ liệu danh sách hiện có. Đóng bằng Escape/nút đóng và trả focus về nút mở.
- Chuyển trang nổi bật có hướng, đổi gợi ý giữ key và chuyển vị trí bằng Motion; hỗ trợ reduced motion và thao tác liên tiếp.
- Skeleton theo khu vực, lỗi có Thử lại và thể loại rỗng có Bỏ bộ lọc. Không hiển thị giới thiệu dài thường trực trên card.
- [Xem nhanh — sáng](quick-preview-desktop-light.png) và [xem nhanh — tối](quick-preview-mobile-dark.png). Hai ảnh chụp panel tổng cộng khoảng 30 KB.

Typecheck, build và 18 kiểm tra contrast đã qua. Lệnh browser cuối cùng chạy tuần tự, cả 3 bài đều qua:

```powershell
node --test --test-concurrency=1 tests/reader-home.browser.test.mjs tests/reader-home-recovery.browser.test.mjs tests/reader-catalog.browser.test.mjs
```

Kiểm tra bổ sung gồm API 503 → thử lại, thao tác nhanh, popup với giới thiệu dài, cảm ứng, viewport, keyboard focus và không có request chi tiết truyện phát sinh khi mở xem nhanh. Một lượt chạy nhiều bài song song bị timeout ở thao tác tìm kiếm; lượt chạy riêng trang chủ và lượt cuối chạy tuần tự đều qua.

### Cách thử trên bản chạy cục bộ

Docker web phục vụ bản build tĩnh; sửa source hoặc build `web/dist` trên host không tự cập nhật container. Từ thư mục gốc, cập nhật riêng web bằng:

```powershell
docker compose up -d --no-deps --build web
```

1. Mở `http://localhost:8080/`, bấm Ctrl+F5. Các thay đổi nằm ở trang chủ, không phải route danh sách `/public` hay `/reader`.
2. Bấm nút hình mắt ở truyện nổi bật hoặc Khám phá: xem giới thiệu; bấm Escape hoặc nút đóng. Có thể Tab đến nút rồi Enter.
3. Bấm trước/sau ở truyện nổi bật hoặc Đổi gợi ý ở Khám phá. Giảm chuyển động của hệ thống sẽ giảm/tắt hiệu ứng.
4. Trong DevTools → Network, bật throttling rồi chọn thể loại chưa xem để quan sát skeleton.
5. Chọn Offline rồi chọn thể loại chưa xem; đợi báo lỗi. Chuyển lại Online và bấm Thử lại. Trường hợp thể loại không có truyện có nút Bỏ bộ lọc; kiểm thử tự động đã bao phủ tình huống này.

Đã cập nhật riêng container web và kiểm tra trực tiếp `http://127.0.0.1:8080/` bằng Chrome: có 10 nút xem nhanh, mở/đóng popover thành công, không ghi nhận lỗi JavaScript. Dữ liệu truyện công khai thật được đọc để kiểm tra; không thực hiện thao tác ghi dữ liệu.
