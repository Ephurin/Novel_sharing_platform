# 🎨 Ephurin Co-Pilot Web UI
Frontend trực quan cho hệ thống hỗ trợ sáng tác thông minh. Thay thế đồ thị phức tạp bằng giao diện **Wiki Drawer** thân thiện, giúp tác giả quản lý nhân vật và bối cảnh dễ dàng.

---

## ✨ Tính năng nổi bật
- **Wiki Drawer**: Giao diện dạng Fandom Wiki hiển thị hồ sơ thực thể (Nhân vật, Địa điểm, Kỹ năng...).
- **Conflict Highlighting**: Tự động cảnh báo mâu thuẫn logic ngay trên giao diện (ví dụ: nhân vật đã chết nhưng vẫn hoạt động).
- **Timeline View**: Theo dõi dòng thời gian sự kiện của từng nhân vật với các chỉ số cảm xúc.
- **Entity Profile**: Quản lý thuộc tính động (Máu, Vị trí, Trạng thái) và quan hệ giữa các nhân vật.
- **Smart Suggestions**: Nhận gợi ý tiếp nối nội dung dựa trên dữ liệu từ Knowledge Base.

---

## 🛠️ Công nghệ sử dụng
- **Core**: React 18, Vite
- **State Management**: Zustand
- **Styling**: Vanilla CSS (Premium Dark Theme)
- **Icons**: Lucide React
- **HTTP Client**: Axios

---

## 🏁 Hướng dẫn khởi động

### 1. Cài đặt
Yêu cầu Node.js 18+

```bash
cd web-ui

# Cài đặt dependencies
npm install
```

### 2. Chạy Dev Server
```bash
npm run dev
```
Mặc định frontend sẽ chạy tại: [http://localhost:5173](http://localhost:5173)

### 3. Cấu hình kết nối Backend
Nếu Backend chạy ở cổng khác 8000, hãy cập nhật `BASE_URL` tại file:
`src/services/api.js`

---

## 📂 Cấu trúc thư mục chính
- `src/components/`: Chứa các thành phần giao diện (WikiDrawer, Timeline, Editor...).
- `src/services/api.js`: Quản lý các cuộc gọi API sang Backend.
- `src/store/useStore.js`: Quản lý trạng thái toàn cục của ứng dụng.
- `src/index.css`: Toàn bộ CSS hệ thống (Dark theme, Animations).

---
© 2026 Novel Sharing Platform Team.
