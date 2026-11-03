# P1 SYSTEM TEST — HƯỚNG DẪN CÀI ĐẶT, GEMINI API, KIỂM THỬ VÀ BÁO CÁO

**Ngày ban hành:** 03/11/2026  
**Đối tượng:** Tester 01, Tester 02 và người điều phối QA/operator  
**Repo:** https://github.com/Ephurin/Novel_sharing_platform  
**Nhánh TÀI LIỆU QA duy nhất:** qa/p1-system-test-20261109  
**Mã nguồn P1 được khóa:** integration/p1-demo-20261109 tại commit 21a73167f6877f0f3d178138f00b36ff393c461e  
**Deadline demo:** 09/11/2026  
**Phạm vi:** P1 Manuscript → Story Brain → Author IDE/Canon/HITL → Writing Draft. P2 không nằm trong System Test này.

> Tài liệu QA nằm trên nhánh riêng xuất phát từ commit mã nguồn P1 đã khóa. Không kiểm thử từ main, nhánh P2 hay feature/UI mới. QA branch bổ sung tài liệu, **không tự chứng minh rằng app đã được test trên máy tester**. Mọi kết quả là quan sát thực tế, không được dùng kết quả historical CI thay cho test mới.

## 0. Phân vai, quy định chung

- **Tester 01:** tác giả bình thường; import, Story Brain, chỉnh hồ sơ, Canon, tiếp tục viết, recovery draft.
- **Tester 02:** kiểm thử lỗi và độ bền; phân quyền, hai tab, reload, 409/stale, mất mạng, truy xuất thông tin xuyên chương, UX.
- **Operator (Codex/Argon/người phụ trách máy):** chuẩn bị máy, Compose, credential, fixture hợp lệ, log/DB readback, gateway/quota khi được phép. Tester không dùng SQL để tạo PASS.
- Một tester = một tài khoản AUTHOR riêng + các novel QA riêng. Hai tester dùng chung app trên một máy thì dùng cùng *một* Docker stack, không khởi động hai stack cùng chiếm cổng.
- Không phá dữ liệu QA lịch sử; không chạy docker compose down --volumes; không reset quota, database hoặc migration.
- Real Gemini calls mặc định = 0. Cấu hình API key **không có nghĩa được quyền bật LLM live**. Mọi live run cần người sở hữu project phê duyệt phạm vi, dự toán provider calls, quota và attestation mới.

## 1. Cài công cụ lần đầu trên Windows 10/11

Cần: Git for Windows, Docker Desktop (Linux containers/WSL2), PowerShell, trình duyệt Chrome/Edge, tài khoản GitHub có quyền xem repo và quyền push nhánh kết quả. Không cần cài Node/Python chỉ để chạy UI qua Compose.

1. Cài Git: https://git-scm.com/downloads/win
2. Cài Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/ . Mở Docker Desktop và chờ Engine sẵn sàng, bật Linux containers/WSL2.
3. Mở PowerShell, kiểm tra:
   
   ~~~powershell
   git --version
   docker --version
   docker compose version
   docker info
   ~~~

Nếu docker info lỗi, mở Docker Desktop/khởi động WSL2 trước khi tiếp tục. Hãy đảm bảo máy không có hệ thống khác đang dùng các cổng 8080, 4000, 8000, 5432, 27017. Máy dành riêng cho QA được ưu tiên. Compose mặc định có mật khẩu thử nghiệm và publish cổng, **chỉ dùng trên máy QA tin cậy trong mạng riêng**, không dùng production, VPS công khai hoặc LAN không kiểm soát.

## 2. Pull đúng source và khóa phiên bản

Chạy từ một thư mục làm việc mới. Không sửa main.

~~~powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\EphurinQA" | Out-Null
Set-Location "$env:USERPROFILE\Documents\EphurinQA"
git clone --branch qa/p1-system-test-20261109 --single-branch https://github.com/Ephurin/Novel_sharing_platform.git
Set-Location .\Novel_sharing_platform
git status -sb
git branch --show-current
git log -1 --oneline
git merge-base --is-ancestor 21a73167f6877f0f3d178138f00b36ff393c461e HEAD
$LASTEXITCODE
git diff --name-only 21a73167f6877f0f3d178138f00b36ff393c461e HEAD -- backend ai-service web Pipeline_test
~~~

**Kỳ vọng:** nhánh là qa/p1-system-test-20261109; lệnh merge-base trả 0; lệnh diff cuối *không in file source nào*. SHA HEAD sẽ là commit tài liệu mới, **không nhất thiết bằng 21a73167**. Nếu khác source hoặc merge-base trả 1: dừng, báo operator. Không chạy git pull tùy tiện khi đang kiểm thử; tester dùng cùng một snapshot. Không nhập token GitHub vào repo hoặc file cấu hình.

Trường hợp repo đã clone từ trước:

~~~powershell
git fetch origin
git switch --create qa/p1-system-test-20261109 --track origin/qa/p1-system-test-20261109
~~~

Nếu báo branch đã tồn tại, dùng git switch qa/p1-system-test-20261109 và kiểm tra lại HEAD.

## 3. Lấy dữ liệu kiểm thử 21.512 từ / 10 chương

Bộ ZIP được người phụ trách chia sẻ riêng, tên: P1_Long_Context_10_Chapters_21512_Words_QA.zip; không chứa API key. Đặt **ngoài thư mục Git**, ví dụ Documents\EphurinQAInput.

~~~powershell
$qaInput = "$env:USERPROFILE\Documents\EphurinQAInput"
New-Item -ItemType Directory -Force $qaInput | Out-Null
# Tự đặt file ZIP đã nhận vào thư mục trên, sau đó:
Get-FileHash "$qaInput\P1_Long_Context_10_Chapters_21512_Words_QA.zip" -Algorithm SHA256
Expand-Archive "$qaInput\P1_Long_Context_10_Chapters_21512_Words_QA.zip" -DestinationPath "$qaInput\extracted" -Force
~~~

**Checksum ZIP đúng:** 915e14652b2a0b9a2d6e078cb37e89a99148324ee9668f31574f0dd67d057c8b.

Trong bộ giải nén:
- MANUSCRIPT_FIRST_05_CHAPTERS.txt: 5 chương (novel QA-05 riêng).
- MANUSCRIPT_FIRST_08_CHAPTERS.txt: 8 chương (novel QA-08 riêng).
- MANUSCRIPT_FULL_10_CHAPTERS.txt: 10 chương, khoảng 21.512 từ (novel QA-10 riêng).
- P1_LONG_CONTEXT_STRESS_PROTOCOL.md: kịch bản đo độ dài.
- GOLD_RETRIEVAL_QUESTIONS.md: câu hỏi cho Tester 02.
- GOLD_RETRIEVAL_CASES.csv/json: **đáp án gold; điều phối giữ riêng, không đưa vào prompt hoặc Story Brain trước test**.

Để đánh giá đúng tăng trưởng 5→8→10: tạo **ba novel độc lập**, không gọi bootstrap mới trên một Story Brain đã active. Các dữ liệu này chưa từng được hệ thống chạy nghiệm thu đầy đủ; không mặc định import/extract sẽ PASS.

## 4. Lấy Gemini API key: chuẩn bị, KHÔNG tự động kích hoạt

Dành cho người vận hành hoặc tester được phân quyền quản lý project.

1. Mở https://aistudio.google.com/apikey ; đăng nhập Google.
2. Trong Google AI Studio, chọn đúng project QA. Nếu project không hiện, mở Dashboard → Projects → Import projects. Chọn **Create API key** hoặc key đã được cấp trong project đó.
3. Xác nhận project và trạng thái billing/quota trên AI Studio. Free Tier tùy project/model, không sao chép con số từ tài liệu cũ làm quota chắc chắn.
4. Kiểm tra model *trong chính project*: text gemini-3.5-flash-lite, embedding gemini-embedding-2, đầu ra embedding 768 chiều theo contract P1. Nếu không có model, đánh PROVIDER_CONFIG_INCOMPLETE, **không âm thầm đổi model**.
5. Lưu API key vào vị trí **ngoài repo**, không gửi bằng email/chat GitHub/ảnh chụp màn hình và không ghi vào log:

   ~~~powershell
   $private = "$env:USERPROFILE\.ephurin-private"
   New-Item -ItemType Directory -Force $private | Out-Null
   notepad "$private\p1-gemini.env"
   ~~~

   Trong Notepad, nhập GEMINI_API_KEY=<key thật> và lưu. Không commit file. Không dùng key chung giữa tester nếu operator đã có một project quota được cấp riêng.
6. Không chạy lệnh in biến GEMINI_API_KEY, không gọi API để “thử key” khi chưa được duyệt; không dán key vào AI Copilot chat hoặc report.

**Cực kỳ quan trọng:** file docker-compose.flash-lite-demo.yml trong repo nối trực tiếp backend/AI service đến Google; **KHÔNG dùng file này cho QA mặc định** vì không chứng minh bypass safety/quota gateway đã được kiểm soát. File .env.free-tier.example chỉ là *template*, gồm quota placeholder, không phải cấu hình sẵn dùng. Trên máy mới không có các file riêng .eval-private của operator cũ, việc thêm key vào .env không làm hệ thống guarded live tự sẵn sàng.

Với live cần xác nhận: gateway running, worker/operator token tách biệt, model/quota thực theo project, durable ledger không bị reset, attestation còn hạn, LIVE_FREE_TIER_ENABLED và LIVE_UPSTREAM_FORWARDING bật **chỉ sau phê duyệt riêng**. Cấu hình chuẩn được giải thích ở docs/development/integration/p1-author/P1_LIVE_FREE_TIER_01.md và P1_ENV_UNBLOCK_CODEX.md. Operator triển khai local Compose overrides và preflight; tester không tự lắp đường bypass.

**Báo cáo preflight:** KEY_PRESENT / MODEL_ACCESS_NOT_VERIFIED / QUOTA_OPERATOR_CONFIRMED / GATEWAY_DISABLED / LIVE_PROVIDER_NOT_VERIFIED là trạng thái hợp lệ khi test offline. Không biến “health 200” thành “Gemini hoạt động”.

## 5. Tạo cấu hình OFFLINE, mặc định không có Gemini calls

Từ root repo tạo file .env.qa.offline (đã được .gitignore che do pattern .env.*). Không bỏ API key vào file này.

~~~powershell
@'
LLM_PROVIDER=fake
AI_LLM_BASE_URL=http://127.0.0.1:9/v1
AI_LLM_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
EMBEDDING_PROVIDER=none
SEMANTIC_RETRIEVAL_ENABLED=false
LIVE_FREE_TIER_ENABLED=false
LIVE_UPSTREAM_FORWARDING=false
LLM_FALLBACK_PROVIDER=disabled
LLM_FALLBACK_MODEL=disabled
LLM_LOCAL_FALLBACK=false
'@ | Set-Content -Path .env.qa.offline -Encoding utf8
git check-ignore .env.qa.offline
~~~

Kỳ vọng git check-ignore trả về .env.qa.offline. Các biến được đưa vào Compose bằng --env-file; trong cấu hình này LLM service dùng fake, backend AI Copilot endpoint direct được gán một địa chỉ loopback không có provider để tránh gửi tới ngrok fallback của base Compose. Vì vậy những nút generation ở backend có thể báo lỗi không có model: ghi NOT_RUN_OFFLINE_PROVIDER, không coi là lỗi Gemini.

**Cảnh báo:** Base Compose không phải một profile sandbox an ninh tuyệt đối; nó có default demo seed, HTTP ports và cấu hình test. Chỉ dùng cho máy QA cô lập. Muốn chạy offline fake có kiểm soát egress chặt hơn hoặc kiểm thử an ninh chống bypass, **operator** phải dùng compose.p1-live-safety.yml và override nội bộ đã kiểm tra, không tự đổi host/port.

## 6. Khởi động ứng dụng

~~~powershell
# Chạy tại root repo. Nếu máy có Docker project khác, thống nhất một project QA duy nhất:
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml up -d --build
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml ps
~~~

Chờ tất cả service healthy/running. Mở bằng trình duyệt:
- Frontend: http://localhost:8080
- Backend: http://localhost:4000/api/v1/health
- AI-service: http://localhost:8000/health

Kiểm tra nhanh:

~~~powershell
(Invoke-WebRequest 'http://localhost:8080' -UseBasicParsing).StatusCode
(Invoke-WebRequest 'http://localhost:4000/api/v1/health' -UseBasicParsing).StatusCode
(Invoke-WebRequest 'http://localhost:8000/health' -UseBasicParsing).StatusCode
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml ps
~~~

Kỳ vọng HTTP 200 cho 3 endpoint, Compose không crash loop. Nếu lỗi, chỉ xem logs đã lọc và **KHÔNG** đăng raw log có cookie/JWT/env:

~~~powershell
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml logs --tail=40 backend
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml logs --tail=40 ai-service
~~~

Chỉ lưu mã lỗi và đoạn thông báo đã che bí mật vào report. Không upload docker inspect, compose config, .env hay HAR thô.

**Cổng bị chiếm:** Không tự chạy 2 Compose project cùng cổng. Nếu 8080/4000/8000/5432/27017 bận, nhờ operator chọn port-override đúng contract WEB_ORIGIN trước khi bắt đầu; không tắt dịch vụ khác hoặc xóa volume vô chủ.

**Đăng nhập:** Mở /login; đăng ký account QA hoặc dùng account AUTHOR được operator cấp qua kênh riêng. Nếu mới tạo account là READER, dùng luồng “Trở thành tác giả” được app hỗ trợ hoặc nhờ operator tạo AUTHOR. Không INSERT/UPDATE trực tiếp vào DB, không dùng admin tài khoản thật. Đặt tên tài khoản và novel rõ tester/cấp độ.

## 7. Kiểm thử System Test P1 — thao tác theo thứ tự

### 7.1 Pre-check, chuẩn bị evidence

Ghi: local time, Windows/Browser, Git HEAD, base SHA, docker compose ps, novel alias, model mode OFFLINE_FAKE, flag real calls 0. Chụp ảnh giao diện sau đăng nhập (che tên/email nếu cần).

### 7.2 Tester 01 — Hành trình tác giả (A-01 đến A-14)

1. **A-01:** đăng nhập AUTHOR riêng → /author/projects, tạo novel QA-A; không thấy dữ liệu QA-B.
2. **A-02:** tạo/import chương mẫu → reload; nội dung và thứ tự giữ nguyên. Dùng novel ngắn riêng để kiểm thử nhanh.
3. **A-03:** truy cập /author/import/<novelId>; chọn file TXT, kiểm tra preview/chia chương. Bật bootstrap AI **chỉ khi fake LLM đã được operator xác minh**. Không tạo request Gemini thật khi offline.
4. **A-04/A-05:** quan sát entity discovery/checkpoint nếu có; review tên, ID, nguồn, trường hợp giả/dư; Continue chỉ khi đã duyệt entity. Không có fixture => NOT_RUN_FIXTURE.
5. **A-06:** sửa và Approve 1 proposal/group, Reject group khác (qua UI), kiểm tra pending không tự thành Canon.
6. **A-07:** Activate baseline nếu hệ thống hiển thị và đủ điều kiện; reload để thấy active version. Nếu chưa có proposals, không tạo PASS giả.
7. **A-08:** Story Brain / Hồ sơ Codex: chỉnh ngoại hình, tính cách, ghi chú → Save → reload/login, còn nguyên.
8. **A-09:** xem event, thử chỉnh summary bằng proposal/correction; trước khi duyệt event chính thức không đổi.
9. **A-10:** vào /author/ide, sửa chapter → chờ lưu → reload; so sánh đoạn văn từng chữ. Nếu có auto extraction, proposal mới là pending.
10. **A-11:** khôi phục completed/passed Writing draft hợp lệ theo fixture operator (không phải draft stale lịch sử), reload vẫn hiện mà không tự chèn vào bản thảo.
11. **A-12:** Accept draft hợp lệ một lần, reload; operator đối chiếu revision/outbox/Brain, không nhân đôi.
12. **A-13:** trên draft khác Reject, reload; manuscript giữ nguyên, draft không phục hồi lại.
13. **A-14:** ghi ít nhất 3 UX observations về khả năng tự sử dụng, từ ngữ Canon/Brain, thông báo và thao tác kế tiếp.

**Chú ý:** A-11/12/13 cần fixture writing job đã passed và còn đúng source hash / brain version. Nếu app không tạo được fixture offline an toàn, ghi NOT_RUN_FIXTURE; tester không seed SQL.

### 7.3 Tester 02 — Lỗi, an toàn, tính bền (B-01 đến B-17)

1. **B-01/B-02:** thử truy cập URL private novel QA-A bằng QA-B, sau logout bấm Back; không lộ draft/canon/token.
2. **B-03/B-04:** sửa A→B→Undo→B nhanh, chuyển chương khi đang autosave; reload không sai chương và nội dung cuối cùng là dữ liệu đã lưu.
3. **B-05:** 2 tab cùng một chapter, tab cũ Save sau tab mới; phải xử lý xung đột, không silently overwrite.
4. **B-06:** chỉnh profile nhưng chưa Save; điều hướng và quay lại, UI phải phản ánh đúng trạng thái đã/ chưa lưu.
5. **B-07/B-08:** proposal invalid/partial group, Reject dependency group; chỉ commit nguyên tử theo contract.
6. **B-09:** 2 tab Accept cùng group ở hai version khác nhau; stale version phải bị chặn.
7. **B-10:** chuyển novel/chapter nhanh trong khi API pending; không rò nội dung/response từ context cũ.
8. **B-11/B-12:** stale Writing draft phải disable Accept; Reject hợp lệ phải bền vững qua reload.
9. **B-13:** dùng DevTools Offline mô phỏng browser mất kết nối rồi thử lưu/retry; UI không báo saved giả.
10. **B-14:** double click Accept với fixture hợp lệ; tối đa một immutable revision/outbox.
11. **B-15/B-16:** so sánh Story Brain với Cẩm nang legacy, xác nhận nhãn nguồn manual proposal AA-02; đây là known MINOR nếu chỉ sai nhãn.
12. **B-17:** ghi 3 UX/robustness findings có reproduction.

**Dừng ngay** nếu mất bản thảo, lộ nội dung tài khoản khác, accept stale thành công, Canon tự commit không qua người duyệt, hoặc có mutation sang novel khác.

### 7.4 Long-context stress test: chạy cấp 5, 8, 10 chương

**Không chạy cả ba bootstrap trên cùng novel đã active.**

Mỗi cấp:
1. Tạo novel QA-05 / QA-08 / QA-10 (AUTHOR riêng).
2. Vào /author/import/<novelId>, tải đúng file TXT cấp đó.
3. Đối chiếu parser báo đúng 5/8/10 chương; số chương, tiêu đề, chương đầu/giữa/cuối không thiếu. Ghi thời gian từ click tới hoàn tất.
4. Import rồi reload danh sách; kiểm tra đủ số chương và nội dung đã lưu. Không được có duplicate khi refresh.
5. Nếu fake pipeline được cấu hình: có thể kiểm trạng thái job/HITL/Canon, nhưng **không chấm chất lượng thật của Gemini**.
6. Chỉ khi có provider live được phép qua gateway: chạy extraction/candidate review trên novel cô lập, đếm provider dispatch thực ở ledger; không vượt ngân sách được duyệt, không tự bật fallback.
7. Tester 02 dùng GOLD_RETRIEVAL_QUESTIONS.md hỏi hệ thống tại mốc đúng, ghi câu trả lời, provenance (entity/event/chapter), tình trạng tin đồn vs xác nhận, thứ tự vật phẩm, và identity homonym. Người điều phối chấm bằng GOLD_RETRIEVAL_CASES.csv **sau**, không đưa đáp án vào context.
8. Ghi số câu PASS/PARTIAL/FAIL/NOT_RUN; phân biệt lỗi STORAGE, IMPORT, ENTITY_EXTRACTION, CANON_HITL, SEMANTIC_RETRIEVAL, CONTEXT_PACKING, GENERATION và TEST_ENV.
9. Ghi latencies, progress, số pending proposal, Brain version, số entity/event/fact approved, thiếu đầu ra hay timeout.

**Static guard:** source Bootstrap mặc định max 100 chương / 2.000.000 ký tự; 10 chương 21.512 từ chưa chứng minh pipeline end-to-end. Writing context packer mặc định 12.000 token ước tính và routing có các tier 12k/16k/20k/24k; không đồng nghĩa đưa cả 21k từ thẳng vào prompt. Entity discovery chia chunk 4.000 ký tự overlap 256 và giới hạn 32 chunk *mỗi chương*: nếu vượt giới hạn, ghi chính xác mã lỗi và độ dài chương.

### 7.5 Provider/live results không được đánh tráo

- OFFLINE_FAKE_PASS chứng minh wiring/mutation/UI với fake upstream, không chứng minh model thật hiểu truyện.
- LIVE_NOT_APPROVED hoặc PROVIDER_CONFIG_INCOMPLETE: ghi NOT_RUN_LIVE_APPROVAL.
- Không có pending candidate hoặc valid draft: ghi NOT_RUN_FIXTURE, không báo E2E FULL PASS.
- Chỉ người vận hành với phê duyệt riêng mới bật guarded live, xác nhận trước/sau counts, quota và cấp quyền.
- Một thao tác UI có thể phát sinh NHIỀU provider dispatch (embedding + generation); không đo budget bằng số click.

## 8. Viết báo cáo nghiệm thu

Dùng mẫu 02_MAU_BAO_CAO_TESTER.md trên nhánh này. Mỗi tester tạo **một báo cáo riêng**, không chỉnh báo cáo của người kia.

Bắt buộc điền:
- Run ID, UTC+7 time, machine/OS/browser, mode OFFLINE_FAKE hoặc APPROVED_GUARDED_LIVE.
- QA source branch, app source commit 21a73167…, docs branch commit (git rev-parse HEAD), account/novel aliases, fixture checksum.
- Bảng mọi A-01..A-14 hoặc B-01..B-17: PASS/FAIL/BLOCKED/NOT_RUN_ENV/NOT_RUN_FIXTURE/NOT_RUN_LIVE_APPROVAL.
- Long stress 5/8/10: count chương và mốc, thời gian, extraction/canon/retrieval metrics, số câu gold đúng/total (chỉ điền nếu test thật).
- Finding: BUG-ID, Severity BLOCKER/MAJOR/MINOR/UX/QUALITY_OBSERVATION, steps, expected, actual, reproducibility, ảnh đã che, HTTP code an toàn, owner đề xuất.
- Resource/cleanup: stack đang chạy/đã dừng, dữ liệu giữ nguyên, quota ledger trước/sau, số real calls thực hay NOT_VERIFIED.
- Verdict có giới hạn: P1_SYSTEM_PASS, P1_SYSTEM_PARTIAL, P1_SYSTEM_FAIL, P1_SYSTEM_ENV_BLOCKED.

Không upload raw JWT, cookies, thông tin Google project/key, HAR, request body có private note, screenshot chứa email/mật khẩu, full DB dump hoặc path cá nhân nhạy cảm. Chỉ ảnh redacted. Không khẳng định real calls 0 nếu không có bằng chứng operator; dùng PROVIDER_CALLS_NOT_VERIFIED khi cần.

## 9. Đẩy báo cáo lên GitHub — tách branch từng tester

Không commit trực tiếp lên qa/p1-system-test-20261109 hay integration/p1-demo-20261109.

Ví dụ Tester 01 (Tester 02 đổi 01 thành 02 trong tên):

~~~powershell
# tại root repo, sau khi đã test và sửa file report từ mẫu:
git switch qa/p1-system-test-20261109
git switch -c qa/p1-results-tester01-20261109
New-Item -ItemType Directory -Force .\docs\qa\p1-system-test-20261109\results | Out-Null
Copy-Item .\docs\qa\p1-system-test-20261109\02_MAU_BAO_CAO_TESTER.md .\docs\qa\p1-system-test-20261109\results\TESTER01_20261109.md
notepad .\docs\qa\p1-system-test-20261109\results\TESTER01_20261109.md

# đọc lại báo cáo trước khi staging và chỉ add đường dẫn report:
git status --short
git add docs/qa/p1-system-test-20261109/results/TESTER01_20261109.md
git diff --cached --check
git diff --cached --name-only
git commit -m "test(p1): tester01 offline system test evidence"
git push -u origin qa/p1-results-tester01-20261109
~~~

Nếu git status cho thấy .env, database, raw logs, dump, binary/large evidence: **không git add .** và phải giải quyết trước khi commit. Tester chỉ đẩy báo cáo đã ẩn nhạy cảm. Nếu GitHub trả 403, nhờ chủ repo cấp quyền hoặc tạo fork/PR theo chính sách nhóm; không gửi PAT/password cho người khác. Không tự merge báo cáo.

Sau push, vào GitHub → Compare & pull request → base qa/p1-system-test-20261109, compare qa/p1-results-tester01-20261109 → tạo Draft PR với tên "[QA] P1 System Test Tester 01 — yyyy-mm-dd". Gửi link PR, commit SHA, báo cáo và verdict cho điều phối. Tester 02 thao tác tương tự trên nhánh kết quả riêng.

Nếu chưa có quyền PR, gửi link branch + commit URL để điều phối review; không sửa main.

## 10. Dừng stack, khắc phục lỗi phổ biến và bàn giao

Dừng stack QA không xóa dữ liệu:

~~~powershell
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml stop
# Khi cần khởi động lại:
docker compose --env-file .env.qa.offline -p ephurin-p1qa -f docker-compose.yml up -d
~~~

**Tuyệt đối không dùng** down -v, docker volume prune, xóa container/DB project khác. Nếu có lỗi nghiêm trọng, giữ stack/volumes cho operator điều tra.

| Lỗi | Cách phân loại / hướng xử lý |
|---|---|
| Docker Engine không chạy | ENV_BLOCKED; mở Docker Desktop/WSL2 |
| 8080/4000/8000/5432/27017 đang bị chiếm | ENV_BLOCKED; cần operator port config |
| HTTP 200 nhưng không có thao tác Gemini | Không suy ra Gemini sẵn sàng; chỉ LOCAL_RUNTIME_READY |
| AI generate lỗi khi offline | NOT_RUN_OFFLINE_PROVIDER; không tự set live flag |
| 401/403 trên novel của tester khác | Mong đợi theo auth policy nếu không rò dữ liệu |
| 409 draft/Brain version | Kiểm tra stale, readback; không bypass version guard |
| 429 Gemini | Kiểm tra quota PROJECT, không tạo key mới để né RPD/RPM |
| Provider 503/expired attestation | Operator preflight, không tự kích hoạt |
| Entity extraction sai tên | QUALITY_OBSERVATION nếu live thật; fake output không chấm chất lượng |
| Cẩm nang legacy trống / AA-02 source label | Known UX/MINOR, không kết luận Canon mất |
| 5 chương PASS nhưng 10 chương FAIL | Nêu điểm gãy rõ: import/revision/extract/retrieval/context, kèm thời gian và số lượng |

## 11. Tiêu chuẩn kết thúc

**FULL P1 SYSTEM PASS** chỉ khi luồng UI và data integrity cốt lõi chạy thật, không có BLOCKER/MAJOR, các test quan trọng đều có kết quả đúng, và mọi NOT_RUN được công bố (đặc biệt extraction/semantic nếu chưa bật live). PASS offline nên đặt nhãn P1_OFFLINE_SYSTEM_PASS, **không được tuyên bố đã đạt long-context semantic retrieval bằng Gemini**.

QA độc lập không phê duyệt production. Bản P1 này chỉ được thử trên máy cô lập. Sau review Codex/GPT-6 và tổng duyệt thao tác người thật, chủ dự án quyết định có đưa vào demo hay không.

## 12. Nguồn kiểm chứng

- P1 contract: https://github.com/Ephurin/Novel_sharing_platform/blob/codex/ai-copilot-pipeline-test/Pipeline_test/WORKFLOW_CONTRACT.md
- Live safety contract: https://github.com/Ephurin/Novel_sharing_platform/blob/qa/p1-system-test-20261109/docs/development/integration/p1-author/P1_LIVE_FREE_TIER_01.md
- AA-01 recovery evidence: https://github.com/Ephurin/Novel_sharing_platform/blob/qa/p1-system-test-20261109/docs/development/integration/p1-author/P1_AA01_DRAFT_RECOVERY_CODEX.md
- Google official API keys: https://ai.google.dev/gemini-api/docs/api-key
- Google official rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Official Gemini 3.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- Official Gemini Embedding 2: https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2

**Phạm vi tài liệu:** Các lệnh Compose, cổng, endpoint, model và giới hạn code đã đối chiếu từ repository P1. Quy trình nhận/khóa key và xác minh project theo tài liệu Google. Live gateway trên máy mới cần cấu hình operator chưa nằm trong Git; tài liệu này không giả định nó đã được setup hay chạy thử.
