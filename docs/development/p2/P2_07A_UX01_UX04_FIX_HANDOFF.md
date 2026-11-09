# Báo Cáo Bàn Giao Sửa Lỗi UX-01 & UX-04 — Final Remediation (PR #106)

**Ngày hoàn thiện:** 2026-11-09  
**Người thực hiện:** Frontend Developer (Gemini)  
**Pull Request:** [#106 (Draft)](https://github.com/Ephurin/Novel_sharing_platform/pull/106)  
**Nhánh nguồn (Head Branch):** `gemini/p2-07a-ux01-ux04-navigation`  
**Nhánh đích (Target Base):** `integration/p2-planning-studio`  
**Base Commit SHA:** `717ef6e7fa7b8a443a2fb37f7a6fa2fcd31c0c89` (Merge PR #105)  
**Tham chiếu Issue:** [#104](https://github.com/Ephurin/Novel_sharing_platform/issues/104)  
**Báo cáo Audit liên quan:** [`docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md)

---

## 1. Tóm Tắt Khắc Phục Kỹ Thuật

### 1.1. UX-01: Mobile Sidebar & Mode Switcher Pointer Safety
- **Hiện tượng lỗi ban đầu:** Trên mobile (viewport 390px), khi mở Sidebar danh sách chương trong chế độ Viết bản thảo, sidebar vươn ra chiếm toàn bộ chiều cao (`top: 0`), che khuất nút "Lập kế hoạch" và chặn mọi sự kiện con trỏ/cảm ứng. Tác giả bị mắc kẹt không thể chuyển sang Planning Studio nếu không thu nhỏ sidebar.
- **Giải pháp hoàn thiện:**
  - Định vị tuyệt đối Sidebar bên trong `.sc-studio-body` bằng thuộc tính `position: relative` (cả desktop lẫn `@media (max-width: 900px)`).
  - Nâng thanh Mode Switcher `<Group aria-label="Chế độ Author IDE">` lên `z-20` với nền solid `bg-surface` và viền phân cách, đảm bảo Mode Switcher luôn nằm trên lớp nội dung soạn thảo.
  - Bổ sung lớp phủ nền `.sc-sidebar-backdrop` (`z-25`) khi Sidebar mở trên mobile, hỗ trợ đóng Sidebar ngay khi chạm vào vùng ngoài.
  - Tự động đóng Sidebar trên mobile khi người dùng bấm "Lập kế hoạch" (`openPlanning`) hoặc bấm vào bất kỳ chương nào trong danh sách điều hướng.
  - Hỗ trợ phím `Escape` toàn cục để đóng Sidebar khi đang mở.
  - Cung cấp thuộc tính trợ năng đầy đủ: `aria-label="Thu gọn danh sách chương"` cho nút đóng và `aria-label="Danh sách chương"` cho sidebar `<aside>`.
  - **Điều hướng phím Tab thực tế (Real Keyboard Navigation):**
    - Kiểm thử tuần tự chuỗi phím `Tab` qua toàn bộ 4 điều khiển trong sidebar: Nút đóng → Ô tìm kiếm chương (`Tìm kiếm chương...`) → Nút "Thêm chương mới" → Mục chương đầu tiên trong danh sách (`Chương 1`).
    - Kiểm thử chuỗi quay lui bằng tổ hợp phím `Shift+Tab` đảo ngược chính xác thứ tự focus.
    - Kích hoạt đóng sidebar bằng phím `Enter` trên nút đóng.
    - Chọn chương và tự động đóng sidebar mobile bằng phím `Enter` trên nút chương.
  - Đảm bảo tính ổn định khi thay đổi kích thước linh hoạt (Resize 1280px → 390px → 1280px trong cùng phiên).

### 1.2. UX-04: Writer Khi Tác Phẩm Chưa Có Chương (Zero-Chapter Empty State & 503 Retry)
- **Hiện tượng lỗi ban đầu:** Khi novel chưa có chapter và tác giả chuyển sang viết (bỏ qua dàn ý), trình soạn thảo bị đặt `readOnly={true}` mà không có bất kỳ hướng dẫn hay nút hành động nào, gây hiểu nhầm hệ thống bị treo.
- **Giải pháp hoàn thiện:**
  - Hiển thị **Empty State** trực quan trong `.sc-editor-workspace` khi `chaptersQuery.data.length === 0`:
    - Biểu tượng `auto_stories` nổi bật.
    - Tiêu đề: *"Chưa có chương nào trong tác phẩm"*.
    - Hướng dẫn: *"Tác phẩm của bạn chưa có chương nào. Bạn có thể bắt đầu sáng tác ngay bằng cách tạo chương đầu tiên."*.
    - Nút CTA: *"Tạo chương đầu tiên"*.
  - Khi người dùng chuyển đổi qua lại giữa Planning và Write, tuyệt đối **không tự động gửi API tạo chương ngầm**.
  - Khi tác giả bấm nút CTA, hệ thống gọi API tạo chương hiện có (`createChapterMutation.mutate()`), tự động sinh Chương 1 và chuyển thẳng vào trình soạn thảo có thể gõ nội dung tức thì.
  - **Xử lý sự cố 503 & Thử lại an toàn (Safe Retry):**
    - Nếu API trả lỗi (503 Service Unavailable hoặc mất kết nối mạng), Empty State hiển thị thông báo lỗi `<Alert color="red" title="Không thể tạo chương">` giải thích rõ ràng và chuyển nút CTA thành *"Thử lại tạo chương"*.
    - Cơ chế `clientRequestId` bền vững (lưu trong `localStorage` và `useRef`) đảm bảo lượt bấm thử lại gửi lại **chính xác cùng một `clientRequestId`** ban đầu, tránh việc sinh chương trùng lặp (idempotent retry).

### 1.3. Tích Hợp CI Workflow
- Đã đưa bài test hồi quy `tests/p2-07a-ux01-ux04-regression.browser.test.mjs` vào workflow CI `.github/workflows/p2-setup-provenance.yml` (chạy tự động trên mọi PR có base là `integration/p2-planning-studio`).

---

## 2. Danh Sách Tệp Đã Thay Đổi (13 files diff)

| STT | Tệp thay đổi | Phân loại | Mục đích |
|---|---|---|---|
| 1 | `web/src/theme/storycraft.css` | Styling | Thêm `position: relative` cho `.sc-studio-body`, định nghĩa `.sc-sidebar-backdrop` và elevate `z-index` cho sidebar trên mobile |
| 2 | `web/src/features/author-ide/AuthorWritingIde.tsx` | Component | Thêm backdrop, auto-close sidebar trên mobile, lắng nghe phím `Escape`, bổ sung trợ năng bàn phím, hiển thị Zero-Chapter Empty State & Alert 503 retry an toàn |
| 3 | `web/tests/p2-07a-ux01-ux04-regression.browser.test.mjs` | Test Suite | Bộ hồi quy Playwright tự động kiểm tra 3 kịch bản: Mobile Sidebar & Real Tab Navigation, Desktop & Dynamic Resize, Empty State & 503 Idempotent Retry |
| 4 | `.github/workflows/p2-setup-provenance.yml` | CI Workflow | Tích hợp bài test hồi quy UX-01 & UX-04 vào pipeline CI của P2 |
| 5-12 | `docs/development/p2/evidence/p2-07a/ux01-*.png` & `ux04-*.png` | Evidence | 8 ảnh chụp màn hình minh chứng trước và sau sửa lỗi |
| 13 | `docs/development/p2/P2_07A_UX01_UX04_FIX_HANDOFF.md` | Tài liệu | Báo cáo bàn giao chi tiết cho PR #106 |

---

## 3. Bằng Báo Minh Chứng Thực Tế & Ảnh Chụp Màn Hình

### 3.1. UX-01: Mobile Sidebar & Navigation

| Kịch bản | Hình ảnh minh chứng | Kết quả |
|---|---|:---:|
| **Lỗi ban đầu** | [`s4-switched-to-writer.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/s4-switched-to-writer.png) | Sidebar trùm lên đỉnh màn hình, che mất thanh Mode Switcher |
| **Giao diện Viết trên Mobile** | [`ux01-mobile-writer-initial.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-writer-initial.png) | Mode Switcher nằm riêng biệt trên đầu trang, không bị che |
| **Sidebar mở có Backdrop** | [`ux01-mobile-sidebar-open.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-sidebar-open.png) | Sidebar trượt ra gọn gàng trong thân editor, Mode Switcher phía trên hoàn toàn lộ rõ |
| **Chuyển Planning khi Sidebar mở** | [`ux01-mobile-switch-to-planning-success.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-switch-to-planning-success.png) | Click nút "Lập kế hoạch" thành công không bị chặn con trỏ; sidebar tự động thu gọn |
| **Đóng Sidebar bằng Backdrop** | [`ux01-mobile-backdrop-closed.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-mobile-backdrop-closed.png) | Chạm ra ngoài backdrop đóng sidebar ngay lập tức |
| **Desktop 1280px giữ nguyên** | [`ux01-desktop-writer-unaffected.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux01-desktop-writer-unaffected.png) | Layout 2 cột song song hoạt động bình thường, backdrop không xuất hiện |

### 3.2. UX-04: Trình Soạn Thảo Khi Chưa Có Chương

| Kịch bản | Hình ảnh minh chứng | Kết quả |
|---|---|:---:|
| **Lỗi ban đầu** | [`s1-author-write-chapter1.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/s1-author-write-chapter1.png) | Soạn thảo trống trơn, con trỏ bị khoá không gõ được |
| **Empty State trực quan** | [`ux04-zero-chapters-empty-state.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux04-zero-chapters-empty-state.png) | Hiển thị màn hình hướng dẫn và nút *"Tạo chương đầu tiên"* |
| **Soạn thảo sau khi tạo** | [`ux04-chapter-created-and-writable.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07a/ux04-chapter-created-and-writable.png) | Chương 1 được sinh ra, thanh công cụ xuất hiện và gõ văn bản thành công |

---

## 4. Bảng Kết Quả Kiểm Thử (PASS / SKIP / FAIL)

> **Lưu ý phân loại:** Các bài test trình duyệt yêu cầu kết nối Docker cơ sở dữ liệu thật (Postgres/Mongo) khi chạy cục bộ mà không có container sẽ được đánh dấu rõ ràng là **SKIP** (không đánh đồng thành PASS) theo đúng quy chuẩn QA.

| Tình huống kiểm thử | Trạng thái | Ghi chú & Exit Code |
|---|:---:|---|
| **TypeScript Typecheck** (`tsc -b --noEmit`) | **PASS** | Exit code `0` (0 errors) |
| **Frontend Production Build** (`vite build`) | **PASS** | Exit code `0` (built in ~17.9s) |
| **Planning Studio Browser Suite** (`planning-studio.browser.test.mjs`) | **PASS** | Exit code `0` (vượt qua tất cả hành trình S1, S2, S3, S4 trong 50.3s) |
| **UX-01 Mobile Sidebar pointer safety (390px)** | **PASS** | Exit code `0` (click Planning khi sidebar mở không bị chặn) |
| **UX-01 Mobile Backdrop dismiss** | **PASS** | Exit code `0` (chạm backdrop đóng sidebar) |
| **UX-01 Mobile Close button collapse** | **PASS** | Exit code `0` (nút close thu nhỏ sidebar) |
| **UX-01 Keyboard Navigation (Escape key)** | **PASS** | Exit code `0` (nhấn phím Escape đóng sidebar) |
| **UX-01 Real Tab & Shift+Tab Navigation** | **PASS** | Exit code `0` (chuỗi Tab tuần tự qua Close → Search → Add → Chapter và Shift+Tab quay lui) |
| **UX-01 Enter Key Activation** | **PASS** | Exit code `0` (nhấn Enter trên Close button để đóng, nhấn Enter trên Chapter để chọn và auto-close) |
| **UX-01 Desktop Workspace Layout (1280px)** | **PASS** | Exit code `0` (sidebar song song, backdrop ẩn) |
| **UX-01 Dynamic Resize (1280 → 390 → 1280)** | **PASS** | Exit code `0` (giao diện co giãn ổn định trong cùng phiên) |
| **UX-04 Zero-Chapter Empty State display** | **PASS** | Exit code `0` (hiển thị thông điệp và nút CTA) |
| **UX-04 Switch Planning → Write zero writes** | **PASS** | Exit code `0` (0 request POST/PATCH gửi lên server khi chuyển view) |
| **UX-04 503 Service Unavailable Error & Safe Retry** | **PASS** | Exit code `0` (hiển thị Alert lỗi, retry gửi lại cùng `clientRequestId`) |
| **UX-04 Chapter Creation & Editor unlock** | **PASS** | Exit code `0` (tạo Chapter 1 thành công, editor mở khoá cho phép gõ) |
| **Theme / Color Contrast Tests** (`color-scheme.test.mjs`) | **PASS** | Exit code `0` (6/6 tests pass) |
| **P1 Writer Persistence Regression** (`author-ide.browser.test.mjs`) | **SKIP** | Exit code `0` (1 skipped: yêu cầu isolated Postgres/Mongo test container) |
| **Writing Recovery Browser Test** (`writing-recovery.browser.test.mjs`) | **SKIP** | Exit code `0` (1 skipped: yêu cầu isolated Postgres/Mongo test container) |
| **Draft Hook Browser Test** (`draft-persistence.browser.test.mjs`) | **SKIP** | Exit code `0` (1 skipped: yêu cầu isolated Postgres/Mongo test container) |

---

## 5. Trạng Thái PR #106 & Tích Hợp CI

- **Trạng thái PR #106:**
  - Base Branch: Đã chuyển đổi thành công sang **`integration/p2-planning-studio`**.
  - Draft State: Đã chuyển đổi sang **Draft PR** để sẵn sàng cho GPT-6 review độc lập.
  - Diff Scope: Giữ nguyên vẹn đúng **13 files** liên quan đến UX-01/UX-04, không lẫn bất kỳ thay đổi ngoài phạm vi nào.
- **Tình trạng CI Pipeline:**
  - **P2 Setup Provenance Foundation (`.github/workflows/p2-setup-provenance.yml`):** Kích hoạt trên PR nhắm vào nhánh `integration/p2-planning-studio` với thay đổi tại `web/**`. Đã tích hợp bài test hồi quy `tests/p2-07a-ux01-ux04-regression.browser.test.mjs`.
  - **P8 Cutover and Migration (`.github/workflows/p8-cutover.yml`):** Kích hoạt trên PR có thay đổi tại `web/**`.
  - **P7 Semantic Memory Foundation (`.github/workflows/p7-semantic-memory.yml`):** Không kích hoạt do path filters chỉ bao gồm `ai-service/**` và scripts liên quan (PR này hoàn toàn thuộc frontend `web/**`).

---

## 6. Ranh Giới Kỹ Thuật & Giới Hạn Còn Tồn Tại

- **Tuân thủ ranh giới:**
  - Không sửa `AuthGate`, `RoleGuard` hay persistence logic của UX-02 (đã được merge an toàn qua PR #105).
  - Không can thiệp backend, database schema hay migration.
  - Không sửa P1 Canon, Writer lease hay HITL.
  - Không can thiệp P2-06 AI brainstorming.
  - Không gọi LLM thật.
- **Giới hạn còn tồn tại:**
  - Bộ kiểm thử browser cục bộ sử dụng Playwright Chromium với HTTP mocks để mô phỏng phản hồi API (bao gồm cả lỗi 503 và kiểm tra tính bất biến của `clientRequestId`). Việc kiểm thử tích hợp trên môi trường Docker Postgres/Mongo thực tế được quản lý bởi pipeline CI `.github/workflows/p2-setup-provenance.yml` trên GitHub Actions.
