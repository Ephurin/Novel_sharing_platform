# Quy tắc Phát triển và Thành phần Giao diện (Mantine)

Tài liệu này định nghĩa các quy tắc phát triển giao diện hàng ngày sử dụng thư viện **Mantine UI v7**.

---

## 1. Thành phần Giao diện dùng chung (Shared Components)

Trước khi tự thiết kế một component mới hoặc gọi trực tiếp component gốc của Mantine, hãy kiểm tra và sử dụng các component bọc (wrapper) đã được tối ưu hóa trong `web/src/shared/components/`:

| Tên Component | Mục đích sử dụng | Component Mantine tương ứng |
|---|---|---|
| `AppButton` | Các nút hành động chính, phụ, hoặc nút icon | `Button` hoặc `ActionIcon` |
| `AppTextField` | Ô nhập liệu văn bản ngắn (Tên truyện, Chương...) | `TextInput` |
| `AppTextArea` | Ô nhập văn bản dài (Tóm tắt truyện, cốt truyện...) | `Textarea` |
| `AppSelect` | Chọn từ danh sách thả xuống (Thể loại, Trạng thái...) | `Select` |
| `AppCheckbox` | Ô đánh dấu chọn lựa | `Checkbox` |
| `SearchInput` | Ô nhập tìm kiếm (có sẵn icon kính lúp) | `TextInput` + `leftSection` |
| `ContentCard` | Các khối nội dung lặp lại (Card truyện, Card nhân vật) | `Card` |
| `DataTable` | Bảng hiển thị danh sách (Thống kê, Quản lý truyện) | `Table` |
| `ConfirmModal` | Hộp thoại xác nhận hành động nguy hiểm (Xóa chương, Hủy nháp) | `Modal` |
| `StatusBadge` | Hiển thị trạng thái (Nháp, Đang duyệt, Đã xuất bản) | `Badge` |
| `ImagePicker` | Chọn và tải ảnh bìa truyện hoặc avatar | `FileInput` hoặc `FileButton` |

---

## 2. Quy tắc màu sắc và Theme (Mantine Theme)

- Luôn sử dụng hệ thống màu sắc định nghĩa trong Mantine Theme.
- **Không** sử dụng màu hex cố định trong code. Sử dụng style props của Mantine hoặc hook `useMantineTheme()` để lấy màu động:
  ```tsx
  import { useMantineTheme, Box } from '@mantine/core';

  function MyComponent() {
    const theme = useMantineTheme();
    return (
      <Box style={{ color: theme.colors.blue[6] }}>
        Nội dung văn bản
      </Box>
    );
  }
  ```
- Định cấu hình Dark/Light mode nhất quán bằng cách sử dụng component `ColorSchemeScript` và component điều hướng của Mantine.

---

## 3. Quản lý Forms và Validation

- Ưu tiên sử dụng `@mantine/form` để quản lý trạng thái form vì nó có sự tích hợp rất tốt với các input của Mantine và nhẹ hơn.
- Kết hợp với thư viện `zod` để định nghĩa schema và validate dữ liệu ở phía client:
  ```typescript
  import { useForm, zodResolver } from '@mantine/form';
  import { z } from 'zod';

  const schema = z.object({
    title: z.string().min(5, { message: 'Tiêu đề chương ít nhất 5 ký tự' }).max(100),
    content: z.string().min(500, { message: 'Nội dung chương phải dài hơn 500 ký tự' }),
  });

  const form = useForm({
    initialValues: { title: '', content: '' },
    validate: zodResolver(schema),
  });
  ```

---

## 4. Hộp thoại Tạo mới và Chỉnh sửa (Create/Edit Modals)

Khi form tạo mới và form chỉnh sửa một đối tượng (ví dụ: Tạo/Sửa nhân vật, Tạo/Sửa truyện) có cùng cấu trúc trường dữ liệu, **bắt buộc** phải dùng chung một component:
```typescript
type FormMode = 'create' | 'edit';

interface NovelFormProps {
  mode: FormMode;
  initialValues?: NovelValues;
  onSubmit: (values: NovelValues) => void;
}
```
Xử lý tiêu đề, nút bấm, và giá trị mặc định dựa vào thuộc tính `mode`, tuyệt đối không sao chép (clone) code thành hai component riêng biệt.

---

## 5. Thư viện Icons và Giao diện Layout

- Sử dụng thư viện icon **Tabler Icons** (`@tabler/icons-react`) được khuyên dùng mặc định bởi Mantine.
- **Cấm:** Không dùng biểu tượng cảm xúc (emoji) để làm icon trong JSX, các nút bấm, nhãn hoặc badge.
- Đối với các thanh công cụ (Toolbar) chứa các control hỗn hợp, hãy căn chỉnh baseline (`align="flex-end"`) để giao diện trông cân đối và thẳng hàng.
