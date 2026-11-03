# GỬI TESTER — LINK NHÁNH P1 SYSTEM TEST CHÍNH XÁC

**CHỈ DÙNG NHÁNH NÀY:** https://github.com/Ephurin/Novel_sharing_platform/tree/qa/p1-system-test-20261109

**KHÔNG dùng main, feat/UI, codex/p2-..., hoặc một branch có tên gần giống.** Nhánh trên được tạo từ **P1 integration code** tại commit 21a73167f6877f0f3d178138f00b36ff393c461e; sau đó chỉ thêm hướng dẫn QA và mẫu báo cáo.

## Tài liệu bắt buộc đọc

1. **Runbook đầy đủ — cài đặt, Gemini API, Docker, test, nộp GitHub:** [01_RUNBOOK_PULL_API_START_TEST_REPORT.md](01_RUNBOOK_PULL_API_START_TEST_REPORT.md)
2. **Mẫu báo cáo từng tester:** [02_MAU_BAO_CAO_TESTER.md](02_MAU_BAO_CAO_TESTER.md)
3. **P1 source branch gốc (chỉ xem; không làm thay đổi):** https://github.com/Ephurin/Novel_sharing_platform/tree/integration/p1-demo-20261109
4. **Contract P1:** https://github.com/Ephurin/Novel_sharing_platform/blob/codex/ai-copilot-pipeline-test/Pipeline_test/WORKFLOW_CONTRACT.md

## Chạy lần đầu — 4 lệnh

Yêu cầu: Git, Docker Desktop Linux containers, PowerShell và quyền đọc GitHub repo. Mở PowerShell:

~~~powershell
git clone --branch qa/p1-system-test-20261109 --single-branch https://github.com/Ephurin/Novel_sharing_platform.git
cd .\Novel_sharing_platform
git branch --show-current
git merge-base --is-ancestor 21a73167f6877f0f3d178138f00b36ff393c461e HEAD
$LASTEXITCODE
~~~

Kỳ vọng: đúng nhánh và $LASTEXITCODE = 0. Sau đó đọc toàn bộ [runbook](01_RUNBOOK_PULL_API_START_TEST_REPORT.md) trước khi cấu hình/khởi động. Không tự copy .env.demo từ máy người khác. Không dán Gemini API key vào Git.

## Phân chia công việc

- **Tester 01:** test hành trình Author (A-01…A-14), import novel 5/8/10 chương, Story Brain/Canon, hồ sơ và Writing draft.
- **Tester 02:** test lỗi và độ bền (B-01…B-17), truy cập chéo account, autosave 2 tab, stale, bảo mật, và câu hỏi nhớ thông tin xuyên chương.
- Dữ liệu long-context: **Cửa Bắc và hồi chuông thứ ba** — 10 chương/21.512 từ. Người phụ trách gửi ZIP P1_Long_Context_10_Chapters_21512_Words_QA.zip **riêng**, không tìm file này trên GitHub. SHA256 ZIP: 915e14652b2a0b9a2d6e078cb37e89a99148324ee9668f31574f0dd67d057c8b.
- Hai tester dùng tài khoản AUTHOR và novel riêng; không truy cập hoặc sửa historical QA.

## Gemini key và phạm vi test

Google AI Studio: https://aistudio.google.com/apikey . Hướng dẫn lấy, lưu key ngoài Git, xem quota và model nằm trong runbook. **Mặc định OFFLINE, real Gemini calls = 0; không bật forwarding, không dùng docker-compose.flash-lite-demo.yml để lách gateway.** Nếu muốn đánh giá chất lượng LLM thật, người điều phối/operator phải cấp phép live call và chuẩn bị guarded gateway, quota, attestation và ngân sách trước; tester không tự bật.

## Gửi báo cáo thế nào?

1. Copy mẫu thành một file riêng: Tester 01 → results/TESTER01_YYYYMMDD.md; Tester 02 → results/TESTER02_YYYYMMDD.md.
2. Tạo nhánh kết quả riêng từ qa/p1-system-test-20261109:
   - Tester 01: qa/p1-results-tester01-20261109
   - Tester 02: qa/p1-results-tester02-20261109
3. Chỉ git add file báo cáo đã che bí mật. Commit và push nhánh của mình theo runbook.
4. Tạo Draft PR **base qa/p1-system-test-20261109**, hoặc gửi URL branch+commit nếu chưa có quyền PR.
5. Báo cáo đủ PASS/FAIL/NOT_RUN, link ảnh đã che, lỗi reproduce, kết quả 5/8/10 chương và **verdict**. Không được điền PASS khi chưa thao tác.

**Nếu gặp mất bản thảo, Canon tự thay đổi, rò nội dung account khác, hoặc Accept stale thành công: dừng ngay, báo người phụ trách, giữ volumes và evidence.**

**Thông điệp cho tester:** Kiểm thử như tác giả thật; không sửa code, không thao tác database, không tự sửa hệ thống để “cho xanh”. Mục tiêu là tìm ra đúng những gì P1 còn chưa dùng được trước buổi demo.
