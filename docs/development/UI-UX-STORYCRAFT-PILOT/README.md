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
