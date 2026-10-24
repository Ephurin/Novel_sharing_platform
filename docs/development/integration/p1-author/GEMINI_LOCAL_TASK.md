# GEMINI LOCAL EXECUTION PROMPT — Integration P1 + Author Workspace

Vai trò: Gemini là người triển khai và chạy kiểm thử LOCAL cho integration branch. GPT-6 là reviewer độc lập. Đây là công việc mới do chủ repo ủy quyền nhằm kiểm thử bản kết hợp; KHÔNG phải thay đổi nhiệm vụ đang hoạt động trên nhánh pipeline-test.

## 0. Điểm bắt đầu đã được GPT-6 tạo trên GitHub
Repository: Ephurin/Novel_sharing_platform
NHÁNH ĐƯỢC PHÉP GHI DUY NHẤT: integration/p1-author
Integration baseline ban đầu: PR #54 + PR #55 (author-workspace) commit 3100c46f46cd071467d762dff4ffa1fc4efe07f2
Nguồn Core P1 để THAM KHẢO/chọn port: codex/ai-copilot-pipeline-test @ 2279b41d2dcd90fb47a2c4886379510c6564fee5 tại thời điểm bàn giao; luôn ghi lại HEAD mới thực tế trước khi làm
main baseline: 390b09fd043ec29db84519a9d195b59b76eec003
Hướng dẫn gate: docs/development/integration/p1-author/INTEGRATION_GATE.md

QUAN TRỌNG: nhánh integration mới chưa có Core pipeline composite; chính bạn phải hòa giải contract, chỉ port phần tương thích và thực thi kiểm thử. Không nói đã merge P1 chỉ vì nhánh đã tồn tại.

## Model policy — OWNER CONFIRMED 2026-10-23
- **Text output, extraction, suggestion, consistency and writing:** Google Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) is the PRIMARY for any separately authorized real-model acceptance. Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`) is an OPTIONAL *explicit operator-selected* fallback; capture real model ID in trace/evidence. Never use Gemini 2.5 models for this project/demo. Do not resurrect 1.5/2.0 aliases or silently switch to OpenAI.
- The repository's flash-lite demo override already uses `DEMO_LLM_MODEL=gemini-3.5-flash-lite` for both AI service and backend; `ai-service/core/settings.py` now defaults Gemini to 3.5. Check `docker compose config` + effective `LLM_MODEL` and backend `AI_LLM_MODEL` to avoid root Compose's unrelated legacy `qwen3:8b` default. For 3.1 manual fallback, change `DEMO_LLM_MODEL` to `gemini-3.1-flash-lite` in an **approved future** real-model run, not offline integration.
- **NO AUTHORIZATION FOR REAL CALLS IN PR #57.** G0–G4 remain offline fake LLM/fake embedding or disabled semantic lane only. Configuration verification does not entail sending provider requests. Separate owner approval, budget, quota and egress gate required before any real call.
- Embedding is an independent provider: use fake or disabled during #57; `gemini-embedding-2` in a future approved quality run only. Do not confuse Gemini 3.5 text outputs with embedding vectors.

## 1. Bảo vệ Git và evidence
- Lấy git fetch origin trước, chụp git status --short và git rev-parse HEAD của main, feat/author-workspace, integration/p1-author và codex/ai-copilot-pipeline-test. Nếu refs khác số đã pin, ghi delta mới rồi đánh giá lại; đừng âm thầm dựa tài liệu cũ.
- Làm trong một git worktree riêng checkout tracking origin/integration/p1-author. Nếu máy có working tree đang dirty, không reset --hard, stash, clean, checkout đè, force push hoặc xóa file; tạo worktree mới an toàn hoặc báo BLOCKED.
- Chỉ commit và push integration/p1-author. KHÔNG push/cherry-pick/merge vào main, feat/author-workspace, feat/ui-ephurin-theme, codex/ai-copilot-pipeline-test. Không merge nguyên nhánh Core vào integration; không merge ngược integration về Core. Không sửa, di chuyển, xóa hoặc ghi đè Pipeline_test/runs, reviews, lịch sử RED, golden corpus, old databases hoặc volumes.
- Không tạo auto-merge PR vào main. Nếu cần PR, chỉ được tạo DRAFT PR đối chiếu integration/p1-author với feat/author-workspace và ghi rõ DO NOT MERGE; đừng yêu cầu tự động hoàn tất.
- Nếu xảy ra xung đột phải viết decision matrix trước khi resolve, tuyệt đối không dùng chọn toàn bộ ours/theirs trong modules nhạy cảm.

## 2. Đọc tài liệu và lập contract matrix trước khi sửa
Đọc trên P1 source branch bằng git show hoặc worktree read-only:
- Pipeline_test/WORKFLOW_CONTRACT.md (v1.4) và SHORT_LOOP_TEST.md.
- Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/FE_BACKEND_DELTA_MATRIX.md, MIGRATION_COLLISION_MATRIX.md, P123_INTEGRATION_GATE_MATRIX.md.
- Pipeline_test/reviews/2026-10-22-p1-wave-1g/FE_PATCH_HANDOFF.md và issue #56.
- Pipeline_test/ACTIVE_GEMINI_TASK.md chỉ để hiểu Core đang chạy độc lập; KHÔNG đổi con trỏ nhiệm vụ bên pipeline.
- Source thật của Author IDE, useDraftPersistence, revisions, chapters.service, draft-chapters.repository, chapter-writer, AI gateway auth, entity HITL, P2/P3 consumers trên cả 2 refs.

Viết SOURCE_MATRIX.md / CONTRACT_DECISIONS.md trong docs/development/integration/p1-author/evidence/ với từng đường dẫn/commit SHA, contract cũ/mới, lựa chọn giải pháp, ai sở hữu, test case, kết quả. Ghi CHANGE_REQUIRED/NOT_TESTED trung thực. Không tự cho rằng mọi API tương thích vì TypeScript PASS.

## 3. Ghép Core và FE CÓ CHỌN LỌC trên integration branch
Mục tiêu: FE mới của #54/#55 hoạt động với các invariant Core được kiểm chứng trên pipeline; giữ các nghiệp vụ Author/Reader/Admin đã phát triển. Không lấy toàn bộ backend chapters.service từ #54 để thay thế Core writer, cũng không thay toàn bộ UI mới bằng editor cũ.

Giữ bắt buộc:
A. chapter GET/LIST: owner/active-account authorization; anonymous 401, foreign 403; public reading DTO chỉ công khai dữ liệu đúng quyền, VIP 402 đúng contract.
B. chapter PATCH: thống nhất API expectedVersion (không lặng lẽ bỏ version), 428 missing-version policy nếu chốt REQUIRED, stale 409, lost-response retry và version 0; writer serialize, preserved chapter-writer admission lease trên P1, Mongo CAS + PG guards.
C. Sau baseline Story Brain đã activate, mọi save nội dung thực sự thay đổi phải liên kết đúng immutable revision và outbox tự động; pre-baseline save chỉ draft. Accepted replay/idempotent, latest-revision guard, source hash, tenant scope, immutable history và crash reconciliation không được suy giảm.
D. Hook useDraftPersistence và full AuthorWritingIde: rapid B→A→B, in-flight A→B, local backup scoped user+chapter, restore, router blocker, Strict Mode, đổi tài khoản, 2 tab/409, status “saved” chỉ khi server đúng.
E. Job ownership / resume UUID + current user/tenant, author-only draft access, active role; P1 entity-before-event/fact HITL freeze/continue; preserve P2 future planning isolation, P3 stop/step/intent/version fences. Nếu FE thiếu P2/P3 controls, ghi NOT_IMPLEMENTED_FOR_BROWSER, KHÔNG bịa UI hay tuyên bố E2E.
F. Publication/moderation transaction + SQL017, schedule, reader comments, wallet, author profile, media và notifications của #54/#55 không bị mất.

Quyết định rõ C04 missing-version 428 vs optional, C05 retry same-value, C07 writer lease, C08 automatic outbox; đây là các giao điểm P0/P1. Nếu không thể port an toàn mà vẫn giữ kết quả Core, tạo targeted failing regression và ghi BLOCKED_WITH_EVIDENCE; không workaround bằng direct SQL hay tắt guards.

## 4. Migration / môi trường LOCAL, tuyệt đối cách ly
- Dùng NEW Docker Compose project và NEW PG/Mongo databases/volumes/credentials cho lượt này. Kiểm tra docker compose config, tên volumes, mapped ports, domain/namespace trước khi chạy. Không dùng DB demo đang có dữ liệu, không dùng volume test lịch sử, không chạy docker system prune, compose down -v trên các project có sẵn.
- Không đọc/đưa key.txt/API keys vào log. **ZERO** real Gemini/OpenAI/embedding/provider calls, kể cả free tier; fake provider loopback only và chặn outbound egress của integration stack nếu có thể. Nếu không bảo đảm isolation, dừng với BLOCKED_EGRESS.
- Kết hợp đầy đủ backend SQL migration từ hai nhánh: 001–011 chung; giữ đồng thời 012_novel_engagement.sql và 012_reports_unique_open.sql (hai file khác nhau), rồi 013_novel_review_text.sql, 014_novel_editorial_metadata.sql, 015_author_workflow.sql, 016_author_launch_checklist.sql, 017_transactional_moderation_evidence.sql; AI Alembic qua 0013_objective_intent thuộc hệ migration KHÁC. Kiểm tra latest migration head và SHA trước khi chạy, không sao chép nguyên SQL cũ nếu đã thay đổi.
- Chạy migration trên DB trống mới, rerun để kiểm tra full-filename IDs và idempotent skip, đọc lại schema_migrations. Ghi riêng PASS_EMPTY_DB / POPULATED_UPGRADE_NOT_RUN / DOWNGRADE_NOT_RUN; không claim production ready.

## 5. Test thật theo thứ tự, không fake PASS
G0 source/build: git diff --check, backend+web+AI typecheck/build/tests hiện có; nêu rõ skip flags và test count, không suy từ CI của #54.
G1 API/DB: novel/chapter CRUD, owner/nonowner, required expectedVersion 428, stale 409, concurrent writer, active-baseline automatic revision/outbox, accept replay, outbox claim/recovery, migration smoke.
G2 browser full AuthorWritingIde E2E với React/router/auth/backend mới:
 - Fresh Story Brain active; save B, edit A, Undo B trong <1200ms: 0 PATCH A, editor=server=B, revision/outbox không sinh A.
 - A đang in-flight → B: sau khi settled, server/author/analysis newest source B; không silent stale revision; kiểm hash và sequencing.
 - A→C trước debounce: chỉ full buffer C với title/content/VIP/price; chapter/account switch; route/reload; double-tab version conflict 409 và local recovery.
 - S09 contract gồm hai quick saves/retry; chụp browser request, server draft, latest immutable revision/outbox, active Story Brain source provenance.
 Chạy test từ mounted app thật, không chỉ isolated hook fixture. Hook fixture test với RUN_DRAFT_BROWSER_TESTS=1 vẫn chạy như baseline bổ sung.
G3: chỉ nếu S09 GREEN mới chạy S10 theo SHORT_LOOP_TEST.md: consistency checker với mâu thuẫn cài có chủ đích, hiển thị evidence, tác giả sửa qua UI và retry; S11: reload, continue writing, verify memory/context/browser tabs, chapter vẫn DRAFT. Ghi riêng fake-provider correctness và provider real NOT_RUN.
G4: smoke Reader/Author/Admin, screen 375/390/desktop, Light/Dark, permissions, VIP, comments/replies, wallet, profile, moderation, notification, media và schedule; ghi regression/CI mới.
Không chạy P3 100k, không tự publish, không auto-approve entity/canon, không bật provider thật để né lỗi giả lập.

## 6. Evidence, commit, push và STOP
Đưa evidence MỚI vào docs/development/integration/p1-author/evidence/: SOURCE_MATRIX.md, CONTRACT_DECISIONS.md, MIGRATION_RUN.md, S09_S11_MATRIX.md, SMOKE_MATRIX.md, commands-and-exits.json, test-summary.json, FINAL_HANDOFF.md, links trace/screenshot/log, hash source/draft/revision/outbox, timestamp và exact tested SHA.
- Tách commit source/test fix khỏi commit evidence; sau mỗi commit source chạy lại test tối thiểu, bằng chứng phải gắn SHA đã test. Sanitization: không token, personal data, raw key, secrets.
- Mọi case gán PASS/FAIL/BLOCKED/NOT_RUN; nêu observed vs expected; test lỗi vẫn giữ evidence. Không xóa hoặc ghi đè run cũ.
- Push chỉ origin/integration/p1-author, không merge vào main; mở DRAFT PR về feat/author-workspace nếu có thay đổi code đáng review và muốn giữ discussion.
- Báo cáo cuối theo cấu trúc: BRANCH; SOURCE SHA; PIPELINE SOURCE SHA; source commits; G0–G4 matrix; exact commands/exits; blockers & owners; evidence GitHub links; recommendation READY_FOR_GPT6_REVIEW hay BLOCKED. Không tự phê duyệt merge.

Bắt đầu ngay bằng checkout worktree mới + inventory và contract matrix; tiếp tục triển khai và chạy local trong phạm vi trên mà không cần hỏi lại. Nếu thiếu hạ tầng/không an toàn, dừng đúng bước và báo lý do, không báo PASS suy đoán.
