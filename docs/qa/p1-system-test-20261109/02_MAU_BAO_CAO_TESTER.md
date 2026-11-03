# TEMPLATE — BÁO CÁO SYSTEM TEST P1 (mỗi tester tạo bản sao)

> Điền trực tiếp kết quả quan sát. Không sửa template gốc trên branch QA. Trạng thái ban đầu **NOT_RUN**; không ghi PASS nếu chưa thật sự thực hiện. Với mock/fake, ghi rõ giới hạn.

## A. Thông tin phiên kiểm thử

- Tester: **01 / 02**
- Run ID: P1-TESTER__-YYYYMMDD-__
- Ngày/giờ bắt đầu → kết thúc (UTC+7):
- Machine ID không định danh cá nhân:
- OS / Browser + version:
- Repository: Ephurin/Novel_sharing_platform
- QA docs branch: qa/p1-system-test-20261109
- App source SHA: **21a73167f6877f0f3d178138f00b36ff393c461e**
- Tester report branch:
- Report commit SHA:
- Frontend URL: http://localhost:8080 hoặc URL QA operator xác nhận
- Backend/AI service health: PASS / FAIL / NOT_RUN
- Mode: OFFLINE_FAKE / APPROVED_GUARDED_LIVE
- Live flags thực tế: disabled / enabled by operator / NOT_VERIFIED
- Fallback: disabled / NOT_VERIFIED
- Real Gemini dispatch trước/sau: before __, after __, diff __ / NOT_VERIFIED
- Provider models đúng phiên: text __, embedding __ / NOT_RUN
- Tài khoản mã hóa: QA-A/QA-B, tuyệt đối không ghi email/mật khẩu
- Novel aliases / chapter ids đã rút gọn:
- Dataset ZIP SHA256: b8b49dc647ef84fa870f1731cefda5e294efb1f60595a81b254940794fe3e820
- Báo cáo này có trích xuất dữ liệu private? Không / Có (nếu Có phải ẩn trước push)

## B. Môi trường khởi động

| Check | PASS / FAIL / NOT_RUN | Quan sát / bằng chứng |
|---|---|---|
| Git branch, source ancestor, diff source sạch | NOT_RUN | |
| Docker Engine/Compose | NOT_RUN | |
| PostgreSQL/MongoDB healthy | NOT_RUN | |
| AI-service /health = 200 | NOT_RUN | |
| Backend /api/v1/health = 200 | NOT_RUN | |
| Frontend HTTP 200 và đăng nhập AUTHOR | NOT_RUN | |
| API key cất ngoài Git, không có trong report | NOT_RUN | |
| Operator xác nhận live forwarding OFF khi offline | NOT_RUN | |
| Dữ liệu 2 tester tách novel/account | NOT_RUN | |
| Không có quota/ledger reset | NOT_RUN | |

## C. Tester 01 — Hành trình tác giả

Chỉ Tester 01 điền; Tester 02 dùng NOT_APPLICABLE.

| ID | Mục tiêu | Kết quả | Evidence/tóm tắt |
|---|---|---|---|
| A-01 | AUTHOR login, mở workspace, tạo novel | NOT_RUN | |
| A-02 | Tạo/import chương, reload nội dung/thứ tự | NOT_RUN | |
| A-03 | Bootstrap/AI extraction job nếu fake/provider được kiểm chứng | NOT_RUN | |
| A-04 | Entity candidates, nguồn, sửa tên/identity | NOT_RUN | |
| A-05 | Human entity review checkpoint và Continue | NOT_RUN | |
| A-06 | Approve/Reject groups, pending không vào Canon | NOT_RUN | |
| A-07 | Activate baseline, reload đúng trạng thái | NOT_RUN | |
| A-08 | Entity profile appearance/personality/notes persist | NOT_RUN | |
| A-09 | Event correction có proposal/approve, giữ history | NOT_RUN | |
| A-10 | Viết/sửa chương, autosave, reload chính xác | NOT_RUN | |
| A-11 | Reopen persisted valid Writing draft, không auto insert | NOT_RUN | |
| A-12 | Accept valid draft, revision/outbox idempotent | NOT_RUN | |
| A-13 | Reject valid draft khác, manuscript không đổi | NOT_RUN | |
| A-14 | Ít nhất 3 UX findings, đường đi người mới | NOT_RUN | |

## D. Tester 02 — Độ bền, bảo mật, lỗi, UX

| ID | Mục tiêu | Kết quả | Evidence/tóm tắt |
|---|---|---|---|
| B-01 | Foreign account không đọc được novel/chapter private | NOT_RUN | |
| B-02 | Logout/back không lộ nội dung và mutation | NOT_RUN | |
| B-03 | Undo A→B→A→B trước debounce, readback đúng | NOT_RUN | |
| B-04 | Save while switching chapter không leak content | NOT_RUN | |
| B-05 | Hai tab conflict: không silent overwrite | NOT_RUN | |
| B-06 | Unsaved entity profile không bị báo saved giả | NOT_RUN | |
| B-07 | Invalid proposal edit không mutate Canon | NOT_RUN | |
| B-08 | Dependency group reject atomic | NOT_RUN | |
| B-09 | Stale Brain version ở tab 2 bị chặn | NOT_RUN | |
| B-10 | Async response/context switch không leak novel | NOT_RUN | |
| B-11 | Stale Writing draft disabled Accept | NOT_RUN | |
| B-12 | Reject draft không resurrect sau reload | NOT_RUN | |
| B-13 | Offline browser/save retry không giả trạng thái saved | NOT_RUN | |
| B-14 | Double-click Accept không nhân đôi revision/outbox | NOT_RUN | |
| B-15 | Story Brain vs Cẩm nang legacy UI không hiểu nhầm data loss | NOT_RUN | |
| B-16 | Nhãn nguồn AA-02 có/không tái hiện | NOT_RUN | |
| B-17 | Ít nhất 3 UX/robustness findings | NOT_RUN | |

## E. Long-context 5/8/10 chương (novel độc lập)

| Chỉ số | 5 chương | 8 chương | 10 chương |
|---|---|---|---|
| Novel QA alias | | | |
| Parser phát hiện đúng số chương? | NOT_RUN | NOT_RUN | NOT_RUN |
| Thời gian import (giây) | | | |
| Số chương tạo thành công/đã chọn | | | |
| Nội dung sau reload khớp tại đầu/giữa/cuối? | NOT_RUN | NOT_RUN | NOT_RUN |
| Duplicate chapter sau retry? | | | |
| Immutable revisions readback (operator) | NOT_RUN | NOT_RUN | NOT_RUN |
| Bootstrap job status + thời gian | NOT_RUN | NOT_RUN | NOT_RUN |
| Entities verified/pending/approved | NOT_RUN | NOT_RUN | NOT_RUN |
| Events/facts extracted/pending/approved | NOT_RUN | NOT_RUN | NOT_RUN |
| M0 và current Brain version | NOT_RUN | NOT_RUN | NOT_RUN |
| Model/fake semantics | | | |
| Tổng provider dispatch thực | NOT_VERIFIED | NOT_VERIFIED | NOT_VERIFIED |
| Câu hỏi gold có thể chấm | | | |
| Đúng / sai / một phần / NOT_RUN | | | |
| Latency p50/p95 (nếu có nhiều mẫu) | NOT_RUN | NOT_RUN | NOT_RUN |
| Context budget/route/dropped artifacts (nếu exposed) | NOT_RUN | NOT_RUN | NOT_RUN |
| Lỗi lớn nhất / điểm gãy | | | |

**Quan trọng:** không ghi 48/48 PASS nếu chỉ hỏi bằng mắt; phải đối chiếu Gold sau test, có câu trả lời, nguồn, model/profile và tỷ lệ. Không trộn chất lượng fake với Gemini real. Không import Gold vào app.

## F. Phiếu lỗi (copy khối này cho từng finding)

- BUG-ID: P1-TESTER__-001
- Severity: BLOCKER / MAJOR / MINOR / UX / QUALITY_OBSERVATION
- Test ID / run ID:
- Tiểu thuyết/chương (alias, không dữ liệu nhạy cảm):
- Preconditions:
- Steps to reproduce (1,2,3…):
- Expected:
- Actual:
- Reproduced: x/y lần
- HTTP status/error code / context (không có token):
- Có mất nội dung / ghi nhầm Canon / auth leak không?:
- Screenshot/video redacted hoặc link evidence:
- DB/revision/Brain readback do operator cung cấp (nếu có):
- Workaround có sẵn?
- Owner gợi ý:
- Trạng thái: OPEN / FIXED_NEEDS_RETEST / CLOSED

## G. UX feedback

1. [Màn hình/bước] Tôi không biết bấm gì tiếp theo vì… ; ảnh:
2. [Màn hình/bước] Tôi hiểu nhầm proposal là Canon hoặc ngược lại vì… ; ảnh:
3. [Màn hình/bước] Trạng thái save/loading/error không rõ… ; ảnh:

## H. Giới hạn nghiệm thu và cleanup

- Test có tình trạng NOT_RUN: liệt kê mã và lý do cụ thể.
- AI extraction provider real có được chạy? YES / NO / NOT_VERIFIED.
- Retrieval embedding real có được chạy? YES / NO / NOT_VERIFIED.
- Các fixture Writing được tạo bằng phương pháp nào? REAL_UI / FAKE_PROVIDER / OPERATOR_ISOLATED_FIXTURE / NOT_RUN.
- Regression không chạy lại: nêu rõ.
- Project Docker QA: __ ; volumes preserved: YES / NO / UNKNOWN.
- Không đụng historical QA, source, keys, quota: CONFIRMED / NOT_VERIFIED / ISSUE.
- Có BLOCKER hay MAJOR chưa xử lý?:
- **Verdict:** P1_SYSTEM_PASS / P1_SYSTEM_PARTIAL / P1_SYSTEM_FAIL / P1_SYSTEM_ENV_BLOCKED.
- Tester xác nhận, ngày:
- Link branch báo cáo / Draft PR:
- Commit SHA báo cáo:

**Nhắc lại:** Không đưa mật khẩu, key, quota attestation JSON, JWT, cookie, raw HAR hoặc DB dump lên GitHub. Không ghi “0 calls” chỉ vì không bấm nút nếu chưa kiểm tra ledger của operator.
