# Báo Cáo Bàn Giao Sửa Lỗi UX-03: World Setup Review Accessibility (PR #108 Follow-up)

**Ngày hoàn thiện:** 2026-11-09  
**Người thực hiện:** Frontend Developer (Gemini)  
**Pull Request:** [#108 (Draft)](https://github.com/Ephurin/Novel_sharing_platform/pull/108)  
**Nhánh nguồn (Head Branch):** `gemini/p2-07b-world-review-ux03`  
**Head Commit SHA:** `56b69b98e3db57c89d84ee2f0e845ecc5037d4e4`  
**Nhánh đích (Target Base):** `integration/p2-planning-studio`  
**Base Commit SHA:** `242afc82b131804f3780362c1615cb38ecf1ebc6` (Merge PR #106)  
**Tham chiếu Issue:** [#104](https://github.com/Ephurin/Novel_sharing_platform/issues/104)  
**Báo cáo Audit liên quan:** [`docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md)

---

## 1. Tóm Tắt Khắc Phục Kỹ Thuật (UX-03 Scope)

Mã nguồn triển khai của UX-03 tại [`SetupFoundationPanel.tsx`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/web/src/features/ai-copilot/SetupFoundationPanel.tsx) đã được chấp thuận tạm thời (provisional acceptance). Đợt cập nhật này tập trung xử lý toàn bộ các yêu cầu bổ sung bằng chứng kiểm thử theo phản hồi review của GPT-6:

1. **Truy cập trực tiếp `SetupReviewGroup` từ Bước Thế giới (`planningStep === 'rules'`):**
   - Điều kiện hiển thị: `<div hidden={!(world || people)}>`.
   - `SetupReviewGroup` xuất hiện ngay khi có đề xuất chờ duyệt ở cả Bước 2 ("Thế giới") lẫn Bước 3 ("Nhân vật").
   - Cập nhật dòng hướng dẫn tại bước 2: *"Bạn có thể để trống. Sau khi lưu và xử lý, bạn có thể duyệt quy tắc trực tiếp tại đây hoặc ở bước Nhân vật."*
2. **Bảo toàn tính nguyên khối (Atomic Whole-Dependency-Group):**
   - Giữ nguyên hợp đồng review toàn bộ dependency group trong 1 request duy nhất: `reviewSetup(novelId, snapshotId, body)`. Tuyệt đối không tạo API review riêng lẻ hoặc tách rời cho quy tắc thế giới.
   - Nút "Lưu quyết định toàn nhóm" chỉ mở khoá khi toàn bộ các thẻ trong dependency group đã có quyết định (Duyệt hoặc Loại).
3. **Cảnh báo nhóm phụ thuộc hỗn hợp (Mixed Dependency Group):**
   - Hiển thị `<Alert color="blue" title="Nhóm phụ thuộc hỗn hợp (Quy tắc & Nhân vật)">` khi nhóm có cả quy tắc và nhân vật.
   - Phân biệt rõ loại thẻ bằng Mantine `<Badge>`: `Quy tắc thế giới` vs `Nhân vật / Địa danh`.
4. **Không mount form trùng lặp & Giữ nguyên bản nháp khi chuyển bước:**
   - Khi chuyển qua lại giữa Thế giới ↔ Nhân vật, `SetupReviewGroup` không bị unmount, bảo toàn nguyên vẹn mọi lựa chọn chưa lưu trong `usePlanningDraft`.
5. **Xử lý xung đột phiên bản (HTTP 409 Conflict):**
   - Khi gặp 409 `SETUP_REVIEW_VERSION_CONFLICT`, hiển thị Alert cảnh báo; giữ nguyên các lựa chọn chưa lưu trên màn hình.

---

## 2. Hoàn Thiện Bằng Chứng Kiểm Thử Theo Yêu Cầu GPT-6

### 2.1. F-01 — Khắc Phục Test Cách Ly Tài Khoản & Đa Tiểu Thuyết (Loại Bỏ Hoàn Toàn Vacuous Assertion)

*Vấn đề ban đầu:* Assertion kiểm tra `reviewKeys.every(...)` có thể trả về `true` một cách vô nghĩa (vacuous truth) nếu mảng rỗng sau khi `draft.clear()`.

*Giải pháp kiểm thử mounted browser thực tế:* Xây dựng kịch bản 6 bước mounted browser hoàn chỉnh trong `p2-07b-ux03-world-review.browser.test.mjs`:
1. **Chuẩn bị bản nháp của Tác giả A trên Novel A:**
   - Đăng nhập phiên `author-A`, mở Novel A, vào bước Thế giới, chọn duyệt và nhập nội dung nháp: `"Quy tắc tác giả A: Bí mật cấm kỵ hoàng gia"`.
2. **Xác minh bản sao lưu cục bộ tồn tại và có dữ liệu thực:**
   - Kiểm tra `localStorage` với tiền tố `ephurin-planning:author-A:${novelA}:review:`.
   - Khẳng định `assert.ok(authorAKeys.length > 0)` và `assert.ok(aChoices.length > 0)`.
   - Khẳng định `assert.equal(aChoices[0].value, authorASecretText)`. Tuyệt đối không chấp nhận tập dữ liệu rỗng.
3. **Chuyển phiên sang Tác giả B (Account Switch):**
   - Chuyển `useAuthStore` sang `author-B` (`token-author-B`), điều hướng sang Novel C thuộc quyền sở hữu của B.
   - Xác minh giao diện của B **không bao giờ** hiển thị nội dung nháp của A (`assert.notEqual(contentValB, authorASecretText)`).
   - Xác minh Tác giả B chưa có khoá draft review nào trong `localStorage` (`assert.equal(authorBReviewKeys.length, 0)`).
   - Xác minh khoá của Tác giả A vẫn được bảo toàn nguyên vẹn trong storage mà không bị rò rỉ hay ghi đè.
   - Xác minh không có request POST `/review` nào được gửi đi trong quá trình chuyển đổi tài khoản (`assert.equal(postSwitchReviewWrites, preSwitchReviewWrites)`).
4. **Chuyển lại về Tác giả A và khôi phục (Recovery):**
   - Chuyển lại về `author-A`, mở Novel A.
   - Bấm nút "Khôi phục quyết định" từ Alert thông báo có bản nháp chưa gửi.
   - Xác minh trường nhập liệu phục hồi chính xác 100% nội dung `"Quy tắc tác giả A: Bí mật cấm kỵ hoàng gia"`.
5. **Cách ly giữa hai tiểu thuyết của cùng một tác giả (Novel A vs Novel B):**
   - Cả Novel A và Novel B đều thuộc `author-A`.
   - Tác giả A điều hướng sang Novel B.
   - Xác minh Novel B không hiển thị lựa chọn nháp của Novel A.
   - Tác giả A nhập nội dung nháp riêng cho Novel B: `"Quy tắc riêng chỉ dành cho Tiểu Thuyết Phụ"`.
   - Xác minh `localStorage` chứa 2 khoá định danh riêng biệt: `ephurin-planning:author-A:${novelA}:review:...` và `ephurin-planning:author-A:${novelB}:review:...` (`assert.notEqual(novelAKeys[0], novelBKeys[0])`).
   - Quay lại Novel A, khôi phục và xác minh nội dung của Novel A vẫn nguyên vẹn.
6. **Bảo vệ request đang bay (In-flight Abort Safety):**
   - Khi request POST `/review` của Novel A đang chờ máy chủ phản hồi (in-flight network delay), người dùng chuyển phiên sang Tác giả B.
   - Cơ chế `usePlanningScope` kích hoạt `AbortController.abort()`.
   - Khi máy chủ trả kết quả về trễ, do tín hiệu đã bị huỷ (`signal.aborted === true`), hàm `draft.clear()` bị bỏ qua, ngăn chặn hoàn toàn việc xoá nhầm bản nháp của Tác giả A.
   - Xác minh khoá bản nháp của Tác giả A trong `localStorage` vẫn được giữ nguyên vẹn (`assert.ok(authorAKeysAfterInFlight.length > 0)`).

### 2.2. F-02 — Củng Cố Bằng Chứng Chống Gửi Trùng & Hợp Đồng Idempotency

Kiểm tra độc lập hành vi hoàn tất duyệt và phản hồi bất định theo đúng hợp đồng CAS hiện có:
1. **Phản hồi bất định (503 Service Unavailable) & Gửi lại giữ nguyên idempotency_key:**
   - Mô phỏng máy chủ trả lỗi 503 khi nhấn "Lưu quyết định toàn nhóm".
   - Giao diện bắt lỗi và hiển thị Alert thông báo lỗi 503; nút lưu được mở lại để tác giả có thể bấm gửi lại (retry).
   - Tác giả bấm gửi lại mà không sửa đổi lựa chọn.
   - Xác minh request lần 1 (thất bại) và request lần 2 (thử lại) mang **chính xác cùng một `idempotency_key`** được sinh ra từ `draft.operationKey(body)` (`assert.equal(failedReq.body.idempotency_key, retryReq.body.idempotency_key)`).
   - Điều này bảo toàn hợp đồng chống trùng lặp của backend mà không tự ý sáng chế một giao thức retry riêng ở frontend.
2. **Khoá giao diện khi đang gửi (In-flight Locking):**
   - Khi request đang xử lý, `pending` chuyển sang `true`, nút lưu chuyển sang trạng thái `loading` và bị vô hiệu hoá (`disabled`).
   - Ngăn chặn triệt để hành động nhấp đúp (rapid double-click) phát tán nhiều request song song.
3. **Phát lại trạng thái đã hoàn tất (Completed-State Replay):**
   - Sau khi duyệt thành công, nút "Lưu quyết định toàn nhóm" bị gỡ bỏ hoàn toàn khỏi DOM (`expect(saveBtn).toHaveCount(0)`).
   - Khi tải lại trang (reload) ở trạng thái đã hoàn tất, alert xanh được hiển thị ngay lập tức, không có nút submit và không có request POST `/review` ngầm nào được phát đi (`assert.equal(newReviewWritesOnMount.length, 0)`).
   - Khi cố ý tiêm bản nháp cũ vào `localStorage` cho snapshot đã duyệt, giao diện hiển thị cảnh báo: *"Máy chủ đã có quyết định. Bản sửa cục bộ không được tự gửi lại."*, cung cấp tuỳ chọn xuất hoặc xoá bỏ bản sửa trên máy mà tuyệt đối không cho phép gửi lại.

---

## 3. Danh Sách Tệp & Minh Chứng Ảnh Chụp Màn Hình

### 3.1. Danh Sách Tệp Thay Đổi

| STT | Tệp thay đổi | Phân loại | Mục đích |
|---|---|---|---|
| 1 | `web/src/features/ai-copilot/SetupFoundationPanel.tsx` | Component | Hiển thị `SetupReviewGroup` ở cả `world` và `people`, thông báo nhóm hỗn hợp, badge phân loại |
| 2 | `web/tests/p2-07b-ux03-world-review.browser.test.mjs` | Test Suite | Bộ test Playwright mở rộng bao phủ F-01 (6 bước) & F-02 (5A, 5B, 5C) |
| 3 | `.github/workflows/p2-setup-provenance.yml` | CI Workflow | Tích hợp bài test hồi quy UX-03 vào pipeline CI của P2 |
| 4 | `docs/development/p2/evidence/p2-07b/*.png` | Evidence | 10 ảnh chụp màn hình minh chứng đầy đủ tất cả kịch bản |
| 5 | `docs/development/p2/P2_07B_UX03_FIX_HANDOFF.md` | Tài liệu | Báo cáo bàn giao chi tiết cho PR #108 |

### 3.2. Bằng Chứng Ảnh Chụp Màn Hình (10/10 Kịch Bản)

| Kịch bản | Hình ảnh minh chứng | Mô tả chi tiết |
|---|---|---|
| **Rule-only review tại Bước Thế giới** | [`ux03-world-step-review-visible.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-step-review-visible.png) | `SetupReviewGroup` hiển thị trực tiếp ngay dưới ô nhập quy tắc tại Bước 2 |
| **Đọc lại kết quả duyệt tại Bước Thế giới** | [`ux03-world-review-accepted-readback.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-review-accepted-readback.png) | Thẻ quy tắc hiển thị badge "Đã duyệt", alert hoàn tất và nút kích hoạt M0 sẵn sàng |
| **Alert nhóm phụ thuộc hỗn hợp** | [`ux03-world-step-mixed-group-alert.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-world-step-mixed-group-alert.png) | Cảnh báo rõ ràng tính nguyên khối khi nhóm có cả nhân vật và quy tắc; nút lưu bị vô hiệu hoá đến khi chọn đủ |
| **Bảo toàn quyết định khi chuyển bước** | [`ux03-step-switch-preserves-decisions.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-step-switch-preserves-decisions.png) | Chuyển Thế giới ↔ Nhân vật giữ nguyên toàn bộ lựa chọn chưa gửi |
| **Giữ nguyên draft khi gặp 409 Conflict** | [`ux03-stale-409-conflict-retained.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-stale-409-conflict-retained.png) | Hiển thị thông báo 409, không làm mất các lựa chọn của tác giả |
| **F-02: Thử lại lỗi 503 giữ nguyên idempotency_key** | [`ux03-f02-uncertain-503-retry.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-f02-uncertain-503-retry.png) | Thông báo lỗi 503 hiển thị, nút bấm mở lại cho phép retry với cùng `idempotency_key` |
| **F-02: Hoàn tất duyệt, gỡ bỏ nút gửi** | [`ux03-review-completed-no-duplicate.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-review-completed-no-duplicate.png) | Hiển thị alert xanh đã lưu quyết định, nút submit bị unmount hoàn toàn |
| **F-02: Cảnh báo bản nháp cũ ở trạng thái đã duyệt** | [`ux03-f02-completed-replay.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-f02-completed-replay.png) | Chặn gửi lại, cảnh báo bản sửa trên máy và cung cấp nút bỏ quyết định cũ |
| **F-01: Cách ly tài khoản giữa Tác giả A và Tác giả B** | [`ux03-f01-account-isolation-author-b.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-f01-account-isolation-author-b.png) | Tác giả B không nhìn thấy bất kỳ nội dung hay khoá lưu trữ nháp nào của Tác giả A |
| **F-01: Cách ly đa tiểu thuyết của cùng tác giả** | [`ux03-f01-novel-isolation.png`](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/p2/evidence/p2-07b/ux03-f01-novel-isolation.png) | Tiểu thuyết B lưu trữ khoá và giá trị hoàn toàn tách biệt với Tiểu thuyết A |

---

## 4. Bảng Kết Quả Kiểm Thử (Phân Loại Chuẩn Xác)

> [!NOTE]
> Bảng kết quả dưới đây tuân thủ nghiêm ngặt chuẩn phân loại bằng chứng:
> - **MOCKED_BROWSER_PASS:** Kiểm thử trình duyệt thực tế mounted Chromium với HTTP API mocks (không khẳng định là database E2E).
> - **PASS:** Kiểm thử cục bộ thực sự được thực thi và vượt qua.
> - **SKIP:** Tạm bỏ qua do yêu cầu hạ tầng môi trường đặc biệt (ví dụ Docker DB test container).
> - **CI_NOT_EXECUTED / INFRA_BLOCKED:** CI trên đám mây không thể chạy do hạn mức thanh toán / spending limit của tài khoản GitHub, không phải lỗi mã nguồn.

| Tình huống kiểm thử | Phân loại kết quả | Thời gian & Lệnh thực thi | Ghi chú & Chi tiết |
|---|:---:|:---:|---|
| **TypeScript Typecheck** | **PASS** | ~7.0s (`npm run typecheck`) | Exit code `0` (0 errors) |
| **Frontend Production Build** | **PASS** | 12.6s (`npm run build`) | Exit code `0` (`tsc -b && vite build`) |
| **P2-07B UX-03 Comprehensive Suite** (`p2-07b-ux03-world-review.browser.test.mjs`) | **MOCKED_BROWSER_PASS** | 17.9s (`node --test ...`) | Exit code `0` (Tất cả các bài test F-01, F-02, UX-03 pass 100%) |
| - *Kịch bản 1: Rule-Only Setup visible & reviewed in World step* | **MOCKED_BROWSER_PASS** | - | Nhóm duyệt hiển thị trực tiếp ở Bước 2, đọc lại HTTP mock thành công |
| - *Kịch bản 2: Mixed Character & Rule atomic dependency group alert* | **MOCKED_BROWSER_PASS** | - | Alert nhóm hỗn hợp hiển thị, nút lưu bị khoá đến khi duyệt đủ các thẻ |
| - *Kịch bản 3: Decision preservation across World ↔ Characters steps* | **MOCKED_BROWSER_PASS** | - | Chuyển bước bảo toàn nguyên vẹn mọi lựa chọn chưa gửi |
| - *Kịch bản 4: 409 Version Conflict retaining local choices* | **MOCKED_BROWSER_PASS** | - | Alert 409 xuất hiện, giữ nguyên dữ liệu trên form |
| - *Kịch bản 5A: F-02 Uncertain response 503 & Idempotent Retry* | **MOCKED_BROWSER_PASS** | - | Request retry tái sử dụng chính xác `idempotency_key` ban đầu |
| - *Kịch bản 5B: F-02 Completed-state replay & unmount button* | **MOCKED_BROWSER_PASS** | - | Nút submit biến mất hoàn toàn, reload không phát request gửi trùng |
| - *Kịch bản 5C: F-02 Stale local draft replay guard* | **MOCKED_BROWSER_PASS** | - | Chặn gửi lại, cảnh báo bản nháp cũ trên máy |
| - *Kịch bản 6.1 - 6.2: F-01 Non-vacuous scoped backup verification* | **MOCKED_BROWSER_PASS** | - | Khẳng định `reviewKeys.length > 0` và giá trị nháp thực tế trong storage |
| - *Kịch bản 6.3 - 6.4: F-01 Account switch isolation & Recovery* | **MOCKED_BROWSER_PASS** | - | Tác giả B không thấy dữ liệu của A; quay lại A khôi phục hoàn hảo |
| - *Kịch bản 6.5: F-01 Multi-novel isolation for same author* | **MOCKED_BROWSER_PASS** | - | Novel A và Novel B có khoá storage và giá trị nháp hoàn toàn độc lập |
| - *Kịch bản 6.6: F-01 In-flight abort safety on session switch* | **MOCKED_BROWSER_PASS** | - | Tín hiệu abort ngăn chặn `draft.clear()`, bảo vệ nháp của Tác giả A |
| **Planning Studio Browser Suite** (`planning-studio.browser.test.mjs`) | **MOCKED_BROWSER_PASS** | 35.8s (`node --test ...`) | Exit code `0` (Hành trình S1, S2, S3, S4 qua 100%) |
| **P2-07A UX-01 & UX-04 Regression Suite** (`p2-07a-ux01-ux04-regression.browser.test.mjs`) | **MOCKED_BROWSER_PASS** | 12.2s (`node --test ...`) | Exit code `0` (Mobile Sidebar 390px, Resize, Empty State & 503 Retry) |
| **Setup Foundation Browser Suite** (`setup-foundation.browser.test.mjs`) | **MOCKED_BROWSER_PASS** | 32.7s (`node --test ...`) | Exit code `0` (8/8 tests pass) |
| **P1 Writer Persistence Regression** (`author-ide.browser.test.mjs`) | **SKIP** | - | Yêu cầu test container PostgreSQL/MongoDB độc lập |
| **Real PostgreSQL / Gateway Test** | **SKIP** | - | Môi trường máy trạm cục bộ không chạy Docker DB daemon |
| **GitHub Actions Cloud CI** (`p2-setup-provenance.yml`) | **CI_NOT_EXECUTED / INFRA_BLOCKED** | - | GitHub Actions bị chặn gán runner do tài khoản hết hạn mức chi tiêu (`spending limit reached / billing failure`) |

---

## 5. Ranh Giới Kỹ Thuật Tuân Thủ

- **Không sửa đổi backend, cơ sở dữ liệu, hay schema hợp đồng:** Mọi thao tác review tuân thủ nghiêm ngặt payload nguyên khối `reviewSetup`.
- **Không thay đổi cơ chế sinh source hashes, `review_version`, Brain CAS, hay Canon:** Hoàn toàn giữ nguyên logic bảo đảm toàn vẹn dữ liệu.
- **Không gọi LLM thực tế hoặc vi phạm ranh giới hệ thống:** Toàn bộ test suite chạy trên local HTTP mocks có kiểm soát.
- **Giữ nguyên trạng thái Pull Request:** PR #108 được duy trì ở chế độ Draft nhắm mục tiêu vào `integration/p2-planning-studio`. Sẵn sàng cho GPT-6 review nghiệm thu (`READY_FOR_REVIEW`).
