# Báo Cáo Bàn Giao Sửa Lỗi UX-01 & UX-04 — Story Planning Studio

**Ngày:** 2026-11-09  
**Người thực hiện:** Frontend Developer (Gemini)  
**Nhánh công việc:** `gemini/p2-07a-ux01-ux04-navigation`  
**Nhánh cơ sở (Baseline):** `integration/p2-planning-studio` (Commit SHA `c50b57a886d6db2eb3b409c30b91eb3f63876b09`)  
**Tham chiếu Issue:** [#104](https://github.com/Ephurin/Novel_sharing_platform/issues/104)  
**Báo cáo Audit liên quan:** [`docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md)

---

## 1. Tổng Quan & Phạm Vi Triển Khai

Báo cáo này ghi lại kết quả khắc phục 2 khiếm khuyết trải nghiệm người dùng (UX) quan trọng được phát hiện trong đợt kiểm toán P2-07A của Story Planning Studio:

1. **UX-01 (P1): Mobile Sidebar che khuất thanh chuyển chế độ (Mode Switcher) & chặn thao tác con trỏ (Pointer Events Interception)**  
   - *Hiện tượng cũ:* Trên màn hình mobile (viewport 390px), khi mở Sidebar danh sách chương trong chế độ Viết bản thảo, sidebar vươn ra chiếm toàn bộ chiều cao màn hình (`top: 0`), che khuất nút "Lập kế hoạch" và chặn mọi thao tác chuột/cảm ứng, khiến tác giả bị "mắc kẹt" trong chế độ viết nếu không phát hiện nút thu nhỏ.
   - *Giải pháp:*
     - Giới hạn phạm vi tuyệt đối của Sidebar bên trong `.sc-studio-body` bằng thuộc tính `position: relative` (cả desktop lẫn mobile `@media (max-width: 900px)`).
     - Nâng z-index thanh chuyển chế độ `<Group aria-label="Chế độ Author IDE">` lên `z-20` với nền solid `bg-surface` và viền phân cách, đảm bảo Mode Switcher luôn nằm trên lớp nội dung soạn thảo.
     - Bổ sung lớp phủ làm mờ nền `.sc-sidebar-backdrop` (`z-25`) khi Sidebar mở trên mobile, hỗ trợ đóng Sidebar ngay khi chạm/click ra vùng trống bên ngoài.
     - Tự động đóng Sidebar trên mobile khi người dùng chuyển sang chế độ "Lập kế hoạch" (`openPlanning`) hoặc bấm chọn một chương bất kỳ trong danh sách điều hướng.

2. **UX-04 (P1): Tác phẩm mới có 0 chương bị khoá vô hình không hướng dẫn (Zero-Chapter Dead State)**  
   - *Hiện tượng cũ:* Khi tác giả tạo novel mới chưa có chương nào và chuyển sang "Viết bản thảo" (bỏ qua dàn ý), trình soạn thảo bị đặt thuộc tính `readOnly={true}` mà không có bất kỳ thông báo hay nút hành động nào, gây hiểu nhầm hệ thống bị treo.
   - *Giải pháp:*
     - Bổ sung Empty State trực quan trong không gian soạn thảo (`.sc-editor-workspace`) khi `chaptersQuery.data.length === 0`:
       - Biểu tượng `auto_stories` nổi bật.
       - Tiêu đề: *"Chưa có chương nào trong tác phẩm"*.
       - Hướng dẫn: *"Tác phẩm của bạn chưa có chương nào. Bạn có thể bắt đầu sáng tác ngay bằng cách tạo chương đầu tiên."*.
       - Nút kêu gọi hành động (CTA): *"Tạo chương đầu tiên"*.
     - Nút CTA kích hoạt trực tiếp `createChapterMutation.mutate()` (API tạo chương hiện có), tự động sinh Chương 1 và chuyển ngay vào trình soạn thảo có thể gõ nội dung tức thì.
     - Khi chưa có chương, khu vực soạn thảo hoàn toàn không tự động gửi API tạo chương ngầm hoặc tạo revision vô căn cứ; mọi hành động đều do tác giả chủ động quyết định.

---

## 2. Danh Sách Tệp Đã Sửa Đổi & Bổ Sung

| Phân loại | Đường dẫn tệp | Mô tả thay đổi |
|---|---|---|
| **Styling** | [`web/src/theme/storycraft.css`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/web/src/theme/storycraft.css) | Thêm `position: relative` cho `.sc-studio-body`, định nghĩa `.sc-sidebar-backdrop` và elevated `z-index` cho sidebar trên mobile |
| **Logic Giao Diện** | [`web/src/features/author-ide/AuthorWritingIde.tsx`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/web/src/features/author-ide/AuthorWritingIde.tsx) | Thêm backdrop mobile, auto-close sidebar trên mobile khi chuyển mode/chọn chương, hiển thị Zero-Chapter Empty State & CTA tạo chương đầu tiên |
| **Kiểm Thử** | [`web/tests/p2-07a-ux01-ux04-regression.browser.test.mjs`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/web/tests/p2-07a-ux01-ux04-regression.browser.test.mjs) | Bộ hồi quy Playwright Chromium chuyên biệt kiểm tra 3 kịch bản: Mobile Sidebar, Desktop Sidebar không ảnh hưởng, Zero-chapter Empty State & creation |
| **Bằng Chứng** | `docs/development/p2/evidence/p2-07a/ux01-*.png` & `ux04-*.png` | Bộ 8 ảnh chụp màn hình minh chứng trạng thái thực tế trước và sau khắc phục |
| **Tài Liệu** | `docs/development/p2/P2_07A_UX01_UX04_FIX_HANDOFF.md` | Báo cáo bàn giao kỹ thuật |

---

## 3. Ảnh Chụp Bằng Chứng Trước & Sau

### UX-01: Mobile Sidebar & Mode Switcher

| Trạng thái | Hình ảnh minh chứng | Mô tả |
|---|---|---|
| **Trước (Lỗi)** | [`s4-switched-to-writer.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/s4-switched-to-writer.png) | Sidebar trùm lên đỉnh màn hình, che mất thanh Mode Switcher ("Lập kế hoạch" / "Viết bản thảo") |
| **Sau (Khởi tạo)** | [`ux01-mobile-writer-initial.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-writer-initial.png) | Giao diện Viết bản thảo trên Mobile 390px, Mode Switcher nằm riêng biệt trên đầu trang |
| **Sau (Mở Sidebar)** | [`ux01-mobile-sidebar-open.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-sidebar-open.png) | Sidebar mở dạng trượt, có backdrop mờ `z-25`, thanh Mode Switcher phía trên hoàn toàn lộ rõ |
| **Sau (Chuyển Planning)** | [`ux01-mobile-switch-to-planning-success.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-switch-to-planning-success.png) | Click nút "Lập kế hoạch" thành công không bị chặn con trỏ; sidebar tự động thu gọn |
| **Sau (Đóng Backdrop)** | [`ux01-mobile-backdrop-closed.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-backdrop-closed.png) | Chạm ra vùng ngoài sidebar đóng sidebar êm ái, trở lại văn bản soạn thảo |
| **Sau (Desktop giữ nguyên)** | [`ux01-desktop-writer-unaffected.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-desktop-writer-unaffected.png) | Trên Desktop 1280px, layout dạng cột 2 bảng song song vẫn hoạt động nguyên vẹn |

---

### UX-04: Writer Khi Chưa Có Chương

| Trạng thái | Hình ảnh minh chứng | Mô tả |
|---|---|---|
| **Trước (Lỗi)** | [`s1-author-write-chapter1.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/s1-author-write-chapter1.png) | Trình soạn thảo trống trơn, con trỏ bị khoá không gõ được, không có chỉ dẫn nào |
| **Sau (Empty State)** | [`ux04-zero-chapters-empty-state.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux04-zero-chapters-empty-state.png) | Hiển thị màn hình hướng dẫn rõ ràng: *"Chưa có chương nào trong tác phẩm"* kèm nút *"Tạo chương đầu tiên"* |
| **Sau (Sau khi tạo chương)** | [`ux04-chapter-created-and-writable.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux04-chapter-created-and-writable.png) | Chương 1 được sinh ra, tự động mở vào trình soạn thảo, thanh công cụ xuất hiện và gõ văn bản thành công |

---

## 4. Kết Quả Kiểm Thử & Mã Thoát (Exit Codes)

Tất cả các khâu kiểm tra chất lượng đều vượt qua với mã thoát `0`:

### 4.1. TypeScript Typecheck
- **Lệnh:** `npm --prefix web run typecheck`
- **Kết quả:** `0 errors`
- **Mã thoát:** `0`

### 4.2. Frontend Production Build
- **Lệnh:** `npm --prefix web run build`
- **Kết quả:** `tsc -b && vite build` thành công trong ~15s; bundle tạo thành công.
- **Mã thoát:** `0`

### 4.3. Story Planning Studio Browser Tests
- **Lệnh:** `node --test web/tests/planning-studio.browser.test.mjs`
- **Kết quả:** Vượt qua toàn bộ các bài test S1, S2, S3, S4 của Planning Studio.
- **Mã thoát:** `0`

### 4.4. Bộ Hồi Quy Chuyên Biệt UX-01 & UX-04
- **Lệnh:** `node --test web/tests/p2-07a-ux01-ux04-regression.browser.test.mjs`
- **Kết quả:**
  ```text
  --- TEST 1: UX-01 Mobile Sidebar & Mode Switching (390px) ---
  ✓ UX-01: Successfully switched Planning from mobile while sidebar open without pointer interception!
  ✓ UX-01: Backdrop tap closed sidebar smoothly!
  ✓ UX-01: Sidebar toggle button works cleanly!
  --- TEST 2: UX-01 Desktop Verification (1280x900) ---
  ✓ UX-01: Desktop sidebar toggle and layout unaffected!
  --- TEST 3: UX-04 Zero-Chapter Empty State & Creation ---
  ✓ UX-04: Empty state explaining zero chapters rendered cleanly with CTA button!
  ✓ UX-04: Chapter 1 created via existing API and editor is fully unlocked for writing!
  === ALL REGRESSION TESTS PASSED (0 ERRORS) ===
  ✔ P2-07A Regression: UX-01 Mobile Sidebar pointer safety & UX-04 Zero-chapter Empty State (35232.8397ms)
  ℹ tests 1
  ℹ suites 0
  ℹ pass 1
  ℹ fail 0
  ```
- **Mã thoát:** `0`

---

## 5. Ranh Giới Kỹ Thuật (Guardrails Compliance)

- [x] Không can thiệp `AuthGate`, `RoleGuard` hoặc tầng backend/database/schema API.
- [x] Không can thiệp cơ chế `useDraftPersistence` hay giải quyết xung đột UX-02 (đã được phân lập sang nhánh riêng).
- [x] Không redesign lại Author IDE ngoài phạm vi của 2 lỗi UX.
- [x] Không tự merge vào nhánh `integration/p2-planning-studio`. Sẵn sàng ở trạng thái Draft Pull Request để bàn giao cho GPT-6 review.
