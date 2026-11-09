# Báo Cáo Bàn Giao Sửa Lỗi UX-03: World Setup Review Accessibility (PR Draft)

**Ngày hoàn thiện:** 2026-11-09  
**Người thực hiện:** Frontend Developer (Gemini)  
**Nhánh nguồn (Head Branch):** `gemini/p2-07b-world-review-ux03`  
**Head Commit SHA:** `7762e9374092b3bc3ff6838a0a6ee0ebfdf68615`  
**Nhánh đích (Target Base):** `integration/p2-planning-studio`  
**Base Commit SHA:** `242afc82b131804f3780362c1615cb38ecf1ebc6` (Merge PR #106)  
**Tham chiếu Issue:** [#104](https://github.com/Ephurin/Novel_sharing_platform/issues/104)  
**Báo cáo Audit liên quan:** [`docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md)

---

## 1. Tóm Tắt Khắc Phục Kỹ Thuật (UX-03)

### 1.1. Hiện Tượng Lỗi Ban Đầu
- Tại Bước 2 "Thế giới" (`planningStep === 'rules'`), form duyệt `SetupReviewGroup` bị ẩn hoàn toàn bởi điều kiện `<div hidden={!people}>` (với `people = planningStep === 'characters'`).
- Tác giả khi chỉ nhập hoặc sửa quy tắc thế giới ở bước 2 buộc phải tự điều hướng sang bước 3 ("Nhân vật") mới nhìn thấy nhóm duyệt để phê duyệt quy tắc của mình.
- Dòng chú thích ở bước 2 trước đây ghi: *"Sau khi lưu, duyệt toàn nhóm ở bước Nhân vật, kể cả khi chỉ có quy tắc"*, làm đứt gãy luồng sáng tác và gây khó hiểu nghiêm trọng.

### 1.2. Giải Pháp Hoàn Thiện
1. **Truy cập trực tiếp `SetupReviewGroup` từ Bước Thế giới:**
   - Thay đổi điều kiện hiển thị thành `<div hidden={!(world || people)}>` tại `web/src/features/ai-copilot/SetupFoundationPanel.tsx`.
   - `SetupReviewGroup` xuất hiện ngay khi có đề xuất chờ duyệt ở cả Bước 2 ("Thế giới") lẫn Bước 3 ("Nhân vật").
   - Cập nhật dòng hướng dẫn tại bước 2: *"Bạn có thể để trống. Sau khi lưu và xử lý, bạn có thể duyệt quy tắc trực tiếp tại đây hoặc ở bước Nhân vật."*
2. **Bảo toàn tính nguyên khối (Atomic Whole-Dependency-Group):**
   - Giữ nguyên hợp đồng review toàn bộ dependency group trong 1 request duy nhất: `reviewSetup(novelId, snapshotId, body)`. Tuyệt đối không tạo API review riêng lẻ hoặc tách rời cho quy tắc thế giới.
   - Nút "Lưu quyết định toàn nhóm" chỉ mở khoá khi toàn bộ các thẻ trong dependency group đã có quyết định (Duyệt hoặc Loại).
3. **Giải thích rõ ràng về nhóm phụ thuộc hỗn hợp (Mixed Group):**
   - Khi dependency group có cả quy tắc thế giới và nhân vật/địa danh (`isMixed = hasRules && hasEntities`), giao diện hiển thị `<Alert color="blue" title="Nhóm phụ thuộc hỗn hợp (Quy tắc & Nhân vật)">`:
     *"Nhóm thiết lập này bao gồm cả quy tắc thế giới và nhân vật/địa danh. Theo quy chuẩn nguyên khối (atomic dependency group), quyết định duyệt áp dụng đồng thời cho toàn bộ nhóm; bạn cần chọn duyệt hoặc loại cho tất cả các thẻ trước khi lưu."*
   - Khi nhóm chỉ có quy tắc thế giới: hiển thị thông báo hướng dẫn ngắn gọn phù hợp.
   - Thêm nhãn `<Badge>` phân biệt rõ loại thẻ: `Quy tắc thế giới` vs `Nhân vật / Địa danh`.
4. **Không mount form trùng lặp & Giữ nguyên bản nháp khi chuyển bước:**
   - `SetupReviewGroup` duy nhất được mount trong `ScopedSetupPanel`, không tạo thêm instance thứ hai.
   - Khi tác giả chuyển qua lại giữa các bước (Thế giới ↔ Nhân vật), `ScopedSetupPanel` và `SetupReviewGroup` không bị unmount. Mọi lựa chọn quyết định, danh tính, và nội dung chỉnh sửa chưa lưu đều được bảo toàn nguyên vẹn trong `usePlanningDraft` và React state.
5. **Xử lý xung đột phiên bản (HTTP 409 Conflict):**
   - Nếu API trả lỗi 409 `SETUP_REVIEW_VERSION_CONFLICT`, giao diện hiển thị Alert thông báo lỗi. Mọi lựa chọn đã nhập của tác giả trong draft được giữ nguyên trên màn hình, không bị xoá hay ghi đè ngầm.
6. **Ngăn chặn gửi trùng (No Duplicate Submit):**
   - Sau khi lưu quyết định thành công, `snapshot.review` hiển thị trạng thái đã duyệt ("Đã lưu quyết định duyệt") và nút submit được gỡ bỏ hoàn toàn.
7. **Cách ly bản nháp theo người dùng & tiểu thuyết:**
   - Khóa lưu trữ bản nháp review tuân thủ cấu trúc định danh: `ephurin-planning:${scope.actor}:${snapshot.novel_id}:review:${snapshot.snapshot_id}`.

---

## 2. Danh Sách Tệp Thay Đổi

| STT | Tệp thay đổi | Phân loại | Mục đích |
|---|---|---|---|
| 1 | `web/src/features/ai-copilot/SetupFoundationPanel.tsx` | Component | Cho phép hiển thị `SetupReviewGroup` ở cả `world` và `people`, thêm thông báo nhóm phụ thuộc hỗn hợp, phân loại badge thẻ, cập nhật hướng dẫn |
| 2 | `web/tests/p2-07b-ux03-world-review.browser.test.mjs` | Test Suite | Bộ test Playwright kiểm tra toàn diện 6 kịch bản của UX-03 |
| 3 | `.github/workflows/p2-setup-provenance.yml` | CI Workflow | Tích hợp bài test hồi quy UX-03 vào pipeline CI của P2 |
| 4 | `docs/development/p2/evidence/p2-07b/*.png` | Evidence | 6 ảnh chụp màn hình minh chứng các kịch bản |
| 5 | `docs/development/p2/P2_07B_UX03_FIX_HANDOFF.md` | Tài liệu | Báo cáo bàn giao chi tiết cho PR |

---

## 3. Bằng Chứng Thực Tế & Ảnh Chụp Màn Hình

| Kịch bản | Hình ảnh minh chứng | Kết quả |
|---|---|:---:|
| **Rule-only review tại Bước Thế giới** | [`ux03-world-step-review-visible.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-step-review-visible.png) | `SetupReviewGroup` hiển thị trực tiếp ngay dưới ô nhập quy tắc tại Bước 2 |
| **Đọc lại kết quả duyệt tại Bước Thế giới** | [`ux03-world-review-accepted-readback.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-review-accepted-readback.png) | Thẻ quy tắc hiển thị badge "Đã duyệt", alert hoàn tất và nút kích hoạt M0 sẵn sàng |
| **Alert nhóm phụ thuộc hỗn hợp** | [`ux03-world-step-mixed-group-alert.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-step-mixed-group-alert.png) | Cảnh báo rõ ràng tính nguyên khối khi nhóm có cả nhân vật và quy tắc; nút lưu bị vô hiệu hoá đến khi chọn đủ |
| **Bảo toàn quyết định khi chuyển bước** | [`ux03-step-switch-preserves-decisions.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-step-switch-preserves-decisions.png) | Chuyển Thế giới ↔ Nhân vật giữ nguyên toàn bộ lựa chọn chưa gửi |
| **Giữ nguyên draft khi gặp 409 Conflict** | [`ux03-stale-409-conflict-retained.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-stale-409-conflict-retained.png) | Hiển thị thông báo 409, không làm mất các lựa chọn của tác giả |
| **Hoàn tất duyệt, không gửi trùng** | [`ux03-review-completed-no-duplicate.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-review-completed-no-duplicate.png) | Hiển thị alert xanh đã lưu quyết định, nút gửi biến mất hoàn toàn |

---

## 4. Bảng Kết Quả Kiểm Thử (PASS / SKIP / NOT_RUN)

| Tình huống kiểm thử | Trạng thái | Ghi chú & Exit Code |
|---|:---:|---|
| **TypeScript Typecheck** (`tsc -b --noEmit`) | **PASS** | Exit code `0` (0 errors) |
| **Frontend Production Build** (`vite build`) | **PASS** | Exit code `0` (~11.8s) |
| **Planning Studio Browser Suite** (`planning-studio.browser.test.mjs`) | **PASS** | Exit code `0` (vượt qua tất cả hành trình S1, S2, S3, S4 trong 37.8s) |
| **P2-07A UX-01 & UX-04 Regression Suite** (`p2-07a-ux01-ux04-regression.browser.test.mjs`) | **PASS** | Exit code `0` (vượt qua tất cả kịch bản Mobile Sidebar & Empty State trong 12.7s) |
| **P2-07B UX-03 World Setup Review Suite** (`p2-07b-ux03-world-review.browser.test.mjs`) | **PASS** | Exit code `0` (6/6 kịch bản pass trong 7.8s) |
| - *Kịch bản 1: Rule-Only Setup visible & reviewed in World step* | **PASS** | Exit code `0` |
| - *Kịch bản 2: Mixed Character & Rule atomic dependency group alert* | **PASS** | Exit code `0` |
| - *Kịch bản 3: Decision preservation across World ↔ Characters steps* | **PASS** | Exit code `0` |
| - *Kịch bản 4: 409 Version Conflict retaining local choices* | **PASS** | Exit code `0` |
| - *Kịch bản 5: Atomic review payload submission & no duplicate submit* | **PASS** | Exit code `0` |
| - *Kịch bản 6: Account and Novel storage key scoping isolation* | **PASS** | Exit code `0` |
| **Setup Foundation Browser Suite** (`setup-foundation.browser.test.mjs`) | **PASS** | Exit code `0` (8/8 tests pass trong 34.5s) |
| **P1 Writer Persistence Regression** (`author-ide.browser.test.mjs`) | **SKIP** | Exit code `0` (1 skipped: yêu cầu isolated Postgres/Mongo test container) |
| **Real PostgreSQL / Gateway Test** | **NOT_RUN** | Môi trường cục bộ không có container Docker DB; được kiểm tra trong CI Actions |

---

## 5. Ranh Giới Kỹ Thuật & Giới Hạn Còn Tồn Tại

- **Tuân thủ nghiêm ngặt các ranh giới:**
  - Không thay đổi backend, database, migration, hoặc review API contract.
  - Không thay đổi cơ chế sinh source hashes, `review_version`, Brain CAS, identity reservation, M0 activation authority, hay Canon.
  - Không gọi real LLM hay phá vỡ hạn mức quota.
  - Không sửa đổi mã nguồn ngoài phạm vi UX-03 (chỉ chỉnh sửa UI/UX của review group và bài test đi kèm).
- **Giới hạn còn tồn tại:**
  - Bộ kiểm thử browser cục bộ sử dụng Playwright Chromium với HTTP mocks để mô phỏng phản hồi API. Việc kiểm thử toàn trình trên cơ sở dữ liệu thật được đảm nhiệm bởi CI pipeline `.github/workflows/p2-setup-provenance.yml`.
