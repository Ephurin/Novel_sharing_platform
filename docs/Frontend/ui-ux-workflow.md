# Quy trình UI/UX StoryCraft

## Thứ tự ưu tiên

Theo yêu cầu của chủ project, ba skill trong `.agents/skills` là chuẩn chính:

1. `storycraft-design-system`: nhận diện warm editorial, Be Vietnam Pro, typography và kích thước component.
2. `storycraft-dark-mode`: ánh xạ màu ngữ nghĩa sáng/tối, trạng thái focus/hover/disabled.
3. `storycraft-content-density`: loại bỏ thông tin lặp, giữ nội dung cần cho quyết định và thao tác.

UI UX Pro Max chỉ bổ sung hướng dẫn UX/accessibility. Không áp dụng tự động bảng màu, font hoặc layout đề xuất khi khác nhận diện StoryCraft. Hai truy vấn design-system về khám phá truyện và thư viện trả về bố cục marketing có testimonials; kết quả này không phù hợp và không được dùng làm chuẩn thiết kế.

UI UX Pro Max là công cụ tùy chọn trên máy phát triển, không phải dependency của ứng dụng. Không đưa bộ dữ liệu/scripts của skill này vào Git. Bản cài tại `.agents/skills/ui-ux-pro-max/` được loại trừ bằng `.git/info/exclude` cục bộ.

Nguồn giao diện hiện hành: `docs/Frontend/ui-conventions.md`, `web/src/theme/storycraft.css`, `web/src/theme/refinements.css`, `web/src/theme/index.ts`. Không tạo thêm hệ theme song song.

## Vai trò của Animate UI

Giữ các phiên bản đã có trong `web/package.json`. Dùng primitive Animate UI thông qua shared components; không chuyển toàn bộ Mantine sang shadcn hay chạy chuyển đổi hàng loạt.

- Menu, tooltip, popover, tab và progress: tái sử dụng wrapper hiện có.
- Nhóm bộ lọc một lựa chọn: `AnimatedChoiceGroup`, dùng ToggleGroup của Animate UI. Có thể chuyển focus bằng phím mũi tên và chọn bằng Enter/Space. Bấm lựa chọn đang chọn không làm mất bộ lọc.
- Nội dung đổi theo bộ lọc: `FeedbackReveal`, fade ngắn và tôn trọng reduced motion. Trạng thái nghiệp vụ cập nhật trực tiếp, không chờ animation kết thúc.
- Vùng bấm được mở rộng trên thiết bị trỏ cảm ứng; kích thước chữ và bố cục thống nhất giữa hai theme.

## Màn hình thử nghiệm: trang chủ `/`

Mục tiêu chính: tìm truyện để đọc.

| Vấn đề | Thay đổi |
| --- | --- |
| Tên truyện nằm trên ảnh và lớp gradient | Đưa tên và trạng thái lên nền card sử dụng semantic tokens, giữ ảnh bìa 2:3 |
| Nhãn thể loại bị khuất trong hàng cuộn hẹp | Cho nhóm bộ lọc xuống dòng, giữ tên thể loại và trạng thái chọn |
| Thiếu ngữ cảnh khi đổi bộ lọc | Thông báo số gợi ý/đang tải, `aria-busy`, vô hiệu hóa đổi gợi ý khi chưa có dữ liệu |
| Bấm lựa chọn nhanh hoặc bằng bàn phím | Dùng shared ToggleGroup, không phụ thuộc sự kiện kết thúc animation |
| Brand, câu giới thiệu và tên truyện trên bìa dự phòng bị lặp | Bỏ dòng brand/subtitle lặp trong header và tên trong bìa dự phòng; tên vẫn nằm ở card/link |
| Metadata quá nhỏ | Dùng cỡ metadata 12px, giữ title trang 24px và font chung |

API, route, quyền truy cập và bộ lọc server dùng cơ chế hiện có. Chưa triển khai mở rộng thiết kế sang Studio, Admin hay ứng dụng React Native trong đợt thử nghiệm này.

## Kiểm tra trước khi mở rộng

Tại `web/`:

```powershell
npm run typecheck
npm run build
npm run test:contrast
node --test tests/reader-home.browser.test.mjs tests/reader-catalog.browser.test.mjs
```

Kiểm thử trang chủ sử dụng API giả lập, không ghi dữ liệu thật. Bao gồm khách/độc giả, sáng/tối, 375/768/1024/1440px, ảnh chụp giao diện, điều hướng, chọn bằng bàn phím, chọn lại mục hiện tại, trạng thái tải/rỗng và reduced motion ở 375px.

Trước khi mở rộng, đối chiếu screenshot với ít nhất một trang StoryCraft hiện có. Các kiểm thử token contrast chỉ bao phủ những cặp màu được khai báo trong test, không thay thế việc kiểm tra trực quan toàn bộ giao diện.
