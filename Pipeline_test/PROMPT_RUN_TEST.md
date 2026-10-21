# Prompt giao agent chạy test trên máy mới

Sau khi checkout nhánh chứa thay đổi mới nhất, mở agent tại root repository và gửi:

> Đọc `Pipeline_test/PROMPT_RUN_TEST.md` và thực hiện prompt trong file. Dùng run ID mới, bắt đầu vòng ngắn P1/P2/P3; chỉ mở bài dài khi đủ gate và ngân sách.

Nhánh bàn giao: `codex/ai-copilot-pipeline-test`. Clone lần đầu:

```sh
git clone https://github.com/Ephurin/Novel_sharing_platform.git
cd Novel_sharing_platform
git switch codex/ai-copilot-pipeline-test
git pull --ff-only origin codex/ai-copilot-pipeline-test
```

Nếu đã có repo, giữ local changes của máy đó, fetch rồi chuyển đúng nhánh và pull
fast-forward; không reset/clean để ép checkout. Kiểm tra HEAD trước khi test.

## Prompt

Bạn là testing agent đóng vai một tác giả thật sử dụng AI-copilot. Hãy tự chuẩn
bị môi trường test trên máy hiện tại, chạy và ghi bằng chứng đến khi hoàn thành
phạm vi hoặc gặp blocker có thể tái hiện. Đừng chỉ đọc code rồi kết luận sản phẩm
hoạt động. Không sửa code/DB hoặc đổi tiêu chí để cứu lượt test.

### 1. Đọc nguồn chuẩn và xác định phiên bản

- `Pipeline_test/WORKFLOW_CONTRACT.md` là source of truth của P1/P2/P3. Đọc bản
  đang checkout; không dựa vào trí nhớ hoặc hội thoại ở máy khác.
- Đọc `Pipeline_test/architecture/README.md`, `AI_PIPELINE_MAP.md` và
  `pipeline-map-data.json` trong cùng thư mục architecture. Map là snapshot đối
  chiếu code/evidence, không thay contract hoặc chứng minh đã PASS. Đối chiếu HEAD,
  working tree, source hashes; ghi phần map đã cũ thay vì coi nó là runtime thật.
- Đọc `Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`, `SHORT_LOOP_TEST.md`,
  `TASK.md`, `AGENT_GUIDE.md`, `NARRATIVE_MEMORY_AUDIT.md`, `EVALUATION.md` và
  ca regression lịch sử ở `Pipeline_test/runs/2026-10-18-independent-01/REGRESSION_CASES.md`.
  `ai-service/docs/USE_CASES.md` có phần thiết kế lịch sử;
  không dùng UC-01/02/03 cũ thay cho P1/P2/P3 hiện hành.
- Báo cáo cũ chỉ là baseline tham khảo. Không dùng PASS cũ làm evidence của máy,
  build, model hoặc run mới; không làm theo các helper ghi DB/API cũ để vượt UI.

### 2. Dựng môi trường có thể tái lập

- Tự phát hiện OS, Python/Node, Docker/Compose, ports, dependencies và hướng dẫn
  build/migration trong repo. Dùng đường dẫn tương đối từ root; không phụ thuộc
  `C:/Users/Laptop/...`, URL18080, UUID/tài khoản/volume của máy cũ.
- Pull repo không mang theo `.env`, provider keys, Docker volumes, DB hoặc
  browser session. Dùng `.env.example` làm mẫu, cấu hình secrets cục bộ qua cách
  được phép; không yêu cầu dán keys vào báo cáo/chat, không commit secrets.
- Dùng Compose project/volumes và tài khoản/novel test mới. Kiểm tra ports trước
  khi start; sửa local override nếu cần, không dừng/xóa stack khác. Đọc
  `docker-compose.yml` trước khi chạy: bản gốc có ports cố định và provider mặc
  định không chứng minh real-LLM E2E. Override Gemini là
  `docker-compose.flash-lite-demo.yml`; không mặc định model cũ vẫn khả dụng.
- Build đồng bộ AI/backend/web. Xác minh backend migrations và AI Alembic head
  trên DB test thực. Human-review implementation hiện cần ít nhất
  `0012_entity_guidance`; nếu HEAD có migration mới hơn, dùng head hiện hành.
- Bật `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` trong stack test mới; mẫu
  `Pipeline_test/compose.entity-candidates.yml`. Xác minh runtime và UI đã bật,
  policy `entity-human-review-v1` hoặc policy mới được contract/code khai báo.
  Flag OFF là legacy, không được báo đã test human-review mode.
- Chạy `python Pipeline_test/tools/task_tool.py verify`, rồi
  `python Pipeline_test/tools/task_tool.py init --run-id <RUN_ID_MOI>`.
  Chọn run ID duy nhất theo ngày thực tế; không ghi đè run cũ. Điền URL, phiên
  bản, model requested/effective, config, ngân sách và timeout vào run config.
- Chạy regression/build phù hợp trên DB test. Nếu gặp MongoDB `Ephurin/ephurin`,
  dùng DB test mới với tên nhất quán; không drop/đổi tên DB ứng dụng để cứu test.
- Xác minh quyền dùng provider và ngân sách token/chi phí/thời gian đã được cấp.
  Nếu còn thiếu, tiếp tục fixture/offline/preflight, hỏi đúng thông tin thiếu trước
  phần live phụ thuộc nó; không tự coi API key sẵn có là ngân sách vô hạn.
  Không log toàn bộ `docker compose config`, env hoặc headers chứa credentials.

### 3. Kiểm thử như tác giả, theo đúng review gates

Dùng UI cho thao tác tác giả. API/SQL chỉ đọc để kiểm chứng. Testing agent có thể
đóng vai tác giả duyệt entity theo gold và ngữ cảnh; ghi mọi chỉnh sửa/can thiệp.
Thiếu UI hoặc provider thật thì ghi BLOCKED/NOT_RUN ở phần đó, không thay bằng
API ghi hoặc fake provider rồi báo UI/real-LLM PASS.

1. **P1:** chạy đủ S01–S11. Optional hints → import/lưu bản thảo → extraction
   dừng `waiting_entity_review` → kiểm tra occurrence/context/offset → giữ/loại/
   chỉnh entities → freeze `entities_reviewed` → continue event/fact → duyệt
   canon → audit M0/baseline → viết/lưu mới → tự extraction và lặp review.
2. Thử bổ sung tên thiếu và tên vắng, lowercase names, mã vật phẩm, alias rõ và
   mơ hồ, An trong “an toàn”, Unicode và ranh giới chunks. Hints không phải canon;
   khai báo entity trực tiếp không tạo chapter occurrence/event giả. Canonical
   identity đã duyệt không bị LLM tự overwrite/merge.
3. Lưu quyết định, reload/resume; hints đổi chỉ chạy lại entity stage và giữ
   decisions còn hợp lệ. Continue hợp lệ không rediscovery. Thiếu/unresolved
   decisions, source stale hoặc version cũ phải bị chặn. Identity mới downstream
   quay lại review, không lưu partial group hoặc ép vào tên gần nhất.
4. **P2:** dùng project riêng từ setup/constraints, optional hints. UI extract chỉ
   lấy nhân vật/địa danh explicit; tương lai không thành history. Review entities
   setup trước baseline. Viết chương đầu rồi kiểm tra entity gate, downstream,
   memory và context; không lấy P1 PASS thay cho P2.
5. **P3:** dùng baseline đã duyệt và project/run định danh riêng, thử có/không có
   định hướng. Khi flag ON phải chờ human entity review; không auto-approve gate,
   tăng generation retry để né gate, advance objective hoặc viết trùng. Sau
   continue mới controller duyệt canon đúng revision. Kiểm tra stop/resume, lỗi
   memory và completion theo nội dung; không publish. Run có entity review của
   testing agent phải ghi P3 có can thiệp, không phải fully autonomous PASS.
6. Outbox delivery/queue rỗng/brain version tăng không chứng minh extraction
   hoàn tất hoặc đúng nghĩa. Đọc lại prose đã lưu, source revisions, raw machine
   decisions, author decisions, proposals, official memory và packed context
   thực đưa vào lượt viết. Tách context preview khỏi actual generation context.

### 4. Chất lượng, phạm vi dài và điều kiện dừng

- Đóng băng gold trước extraction; audit đầy đủ35 narrative assertions và gold
  entity/mention/alias/negative riêng. Không coi35 assertions là35 entities.
  Đo raw recall/precision, false merge, unresolved và kết quả sau author review;
  không dùng số records thay coverage, không dùng sửa tay để xóa lỗi raw output.
- Mặc định bắt đầu short loops. Chỉ mở bài dài khi các gate cần thiết đã đạt,
  không còn blocker nghiêm trọng và đủ ngân sách được cấp. Lượt đầy đủ phải cho
  ra một tiểu thuyết95.000–105.000 từ thực, hoàn chỉnh cốt truyện, đọc lại từ dữ
  liệu sản phẩm; không dùng outline, tóm tắt hoặc lặp văn để bù độ dài.
- Audit riêng từng pipeline tại M0, M-FIRST, mỗi10 chương; sâu tại20/50 và final
  theo lịch task. Không tới mốc ghi NOT_RUN/NOT_APPLICABLE đúng kế hoạch; probe
  ngắn không có coverage bài dài. Đánh giá consistency, continuity, kết thúc,
  chất lượng văn học và mức can thiệp ngoài khả năng vận hành pipeline.
- Retry có giới hạn; ghi call count/latency/tokens/chi phí quan sát được, thiếu
  số liệu ghi UNKNOWN. Chạm ngân sách, lỗi lặp hoặc hạ tầng không sẵn sàng thì
  lưu checkpoint và blocker cụ thể; không retry provider vô hạn.

### 5. Bàn giao bắt buộc

Lưu toàn bộ artifact mới trong `Pipeline_test/runs/<RUN_ID_MOI>/`, theo templates
và task tool: `REPORT.md`, `checkpoint.json`, config, step results, issues, memory
audit/CSV, nguồn/hash/IDs, ảnh UI và logs đã che secrets. Lưu đường dẫn/phiên bản
contract và map đã dùng; nối requirement/step/issue map với evidence.

Báo riêng PASS/FAIL/BLOCKED/NOT_RUN cho P1/P2/P3, UI journey, raw extraction,
approved memory, context, văn học, automation và bài100k. Kết luận rõ code đã đọc,
offline tests đã chạy và live UI/provider đã thực hiện. Không commit/push/publish
kết quả trừ khi được yêu cầu riêng. Kết thúc bằng run path, gate hiện tại, các
issue chặn và checkpoint để người/agent khác tiếp tục; đề nghị dùng
`Pipeline_test/PROMPT_REVIEW_PIPELINE.md` để đánh giá lại.
