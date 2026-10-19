# UI workflow retest — 2026-10-18-ui-retest-01

## Rollout follow-up — 2026-10-18 17:15 +07

**Environment blockers resolved on a new isolated stack; UI journey remains NOT_RUN.**
The original report below remains the historical preflight result on the old stack.

- Docker recovered after restarting its processes/distro and renaming stale runtime socket directories. Backups remain under LocalAppData; no Docker volume or database was deleted. Both `Docker/run/dockerInference` and `docker-secrets-engine/engine.sock` had blocked startup.
- Built current working-tree source into Compose project `ephurin-ui-retest`, with separate PostgreSQL/Mongo volumes. Web: **http://localhost:18080**; backend: `http://localhost:14000/api/v1`; AI: `http://localhost:18000`. Do not resume this run against old port 8080.
- Actual new DB reports `0009_autonomous_runs`, pgvector `0.8.6`, zero running autonomous jobs. Four critical source fingerprints match running images. The live bundle contains the new memory panel; live OpenAPI contains memory/author-operation routes and idea mode default `extract`.
- Provider health GET reports `ready=true`, Gemini `gemini-3.5-flash-lite` listed. AI container uses Gemini with that model. This verifies connectivity/model availability, not extraction quality or generation success. No generation payload was sent in this rollout.
- Runtime retains `EMBEDDING_PROVIDER=none`, semantic retrieval disabled and `legacy-v1` context routing. pgvector installation does not mean semantic retrieval coverage has passed.
- Old demo DB services were restored; its application services remain stopped because the actual demo DB contains **one running autonomous job**. No job status was changed. Inspect that job before restarting old application workers.
- Browser tool in this session fails initialization with `failed to write kernel assets`, OS error 3. This is TOOL-UI-001; no UI click/login/import is claimed on the new stack. An agent with a working browser can now resume S01 at the new URL.

Evidence: `evidence/rollout-preflight.json`, `evidence/rollout-runtime.json`.
Checkpoint and run config now point to the isolated stack. ENV-001/002/003 are
resolved there; original evidence and S01–S11 results were not overwritten.

Recreate/start the same isolated stack from repository root (existing data retained):

```powershell
& 'C:/Program Files/Docker/Docker/resources/cli-plugins/docker-compose.exe' --env-file .env.demo -p ephurin-ui-retest -f docker-compose.yml -f docker-compose.flash-lite-demo.yml -f Pipeline_test/compose.ui-retest.yml up -d --build
```

Next: sign in via UI, create a new test project and start S01. Keep all memory,
review, 10/20/50-chapter and final-quality gates. Do not count rollout as UI PASS.

## 1. Kết quả chính

**Overall: BLOCKED tại preflight, trước S01.** Chế độ UI_ONLY cho mọi thao tác tác giả; API chỉ GET để xác minh. Không dùng API ghi để cứu hành trình, không sửa code/DB/cấu hình global, không xuất bản. Evidence cũ và báo cáo workflow-repair giữ nguyên.

Stack localhost trả health200 nhưng **chưa chạy bản sửa cần kiểm thử**. Live OpenAPI thiếu routes memory/author-operation mới và thiếu trường idea mode=extract; bundle web thiếu memory panel mới. Docker control plane timeout nên không thể xác minh/nâng stack an toàn. Migrations của DB thực sự mà container dùng chưa được xác minh. Provider health không xác nhận được ready. Không gọi extraction hoặc model generation khi các điều kiện này chưa đạt.

| Phạm vi | Verdict | Lý do |
|---|---|---|
| Fixture integrity | PASS | Verify offline, seed4747 từ, không đổi nguồn |
| Runtime version preflight | BLOCKED | Code sửa trong working tree chưa hiện trên stack phục vụ |
| P1 UI S01–S11 | BLOCKED | Chưa nhập fixture; S02–S11 NOT_RUN |
| P2 ý tưởng thô | NOT_RUN | Điều kiện P1 short loop PASS chưa đạt |
| P3 full auto có/không plan | NOT_RUN | Điều kiện P1 chưa đạt; không khởi chạy worker mới trên runtime cũ |
| Raw LLM / proposals / approved memory / context | NOT_RUN | Không có source revisions hoặc extraction của run mới |
| Literary quality | NOT_RUN | Chưa tạo văn xuôi; không đọc lại seed cũ rồi gọi full-novel review |
| UI coverage | BLOCKED | Chỉ login/navigation và quan sát phiên bản; chưa kiểm thử hành trình tác giả |
| Autonomy | NOT_RUN | Không có autonomous run mới |
| Review independence | NOT_ASSESSED | Không reviewer độc lập, không có full text mới |
| 95–105k novel | NOT_RUN | Gate ngắn chưa đạt; target100k giữ nguyên |

## 2. Phiên bản, quyền và môi trường

Đã đọc WORKFLOW_CONTRACT.md revision1.2, SHORT_LOOP_TEST.md, AGENT_GUIDE.md, WORKFLOW_GAP_AUDIT.md, NARRATIVE_MEMORY_AUDIT.md và runs/2026-10-18-workflow-repair/REPORT.md. Khi xung đột, áp dụng workflow contract mới; không dùng hybrid adapter cũ để thay UI.

Local Git HEAD390b09fd043ec29db84519a9d195b59b76eec003, working tree dirty với các sửa workflow chưa commit. SHA HEAD không đủ định danh bản sửa: source-version-manifest.json lưu SHA256 các file sửa then chốt; git-status.txt lưu trạng thái. Không pull/reset/build/deploy hoặc sửa source trong run này. Báo cáo regression của lượt repair được đọc như lịch sử; **không rerun tests và không lấy các test/stub PASS làm LIVE_UI PASS**.

Backend http://localhost:4000/api/v1, AI http://localhost:8000, web http://localhost:8080 đều HTTP200 tại kiểm tra đầu. Chỉ số đó chứng minh liveness, không chứng minh đúng code hay provider ready.

LIVE_API_GET:

- Web phục vụ /assets/index-BVL2JlSe.js. Không có marker Bộ nhớ truyện, Trích xuất dữ liệu tiểu thuyết hoặc official-memory trong bundle đã đọc.
- OpenAPI sống không có /v1/story-brains/{novel_id}/memory, author-operation; IdeaBootstrapRequest không có mode. Source mới có các route này và mode mặc định extract. Đây là khác biệt contract thật, không suy chỉ từ timestamp bundle.
- Provider health lần đầu lỗi HTTP, lần sau timeout. Không gọi một ready=false/timeout là lỗi model content, không giả model thật đã xử lý test. Model mong muốn vẫn Gemini3.5 Flash-Lite; model runtime thực dùng để sinh chưa quan sát.

LIVE_UI:

- Browser khởi tạo được, không còn lỗi khởi tạo được mô tả trong báo cáo repair cũ.
- Đăng nhập reader03 qua form UI, thấy trang AUTHOR. Không gọi POST/login bằng script.
- Mở prior-run editor để kiểm tra phiên bản, không sửa prose/title. Editor còn nút Cẩm nang thế giới truyện (Story Bible), không có entry Bộ nhớ truyện mới. Ảnh và DOM được lưu.
- Đây là quan sát stack cũ, **không phải bằng chứng bản sửa mới thiếu UI**. Không tạo project mới khi preflight chưa đạt.

Quyền provider/budget: kế thừa xác nhận trực tiếp trước đó của người dùng cho phép gửi bản thảo, blueprint và văn bản phát sinh Pipeline_test tới Google Gemini API; ngân sách không giới hạn theo quota từng API15RPM/250KTPM/500RPD. Không hỏi lại quyền đã có. Nội dung tài liệu nói approval từng bị chặn là lịch sử, không hủy xác nhận trực tiếp sau đó. Run này không gửi test payload tới provider; generation/extraction calls0. Token/chi phí/remaining quota UNKNOWN, không ghi chi phí0USD. Chưa xác minh rotation bốn API độc lập.

## 3. Migrations và an toàn nâng stack

Docker ps không trả về; probe có timeout12giây rồi hai context default/desktop-linux mỗi7giây đều timeout. Docker context metadata đọc được, nhưng container inventory/runtime environment không đọc được. Lệnh Docker ps đầu bị ngắt sau khi kiểm tra bounded thay thế xác nhận timeout. Không restart daemon hoặc worker dùng chung, không deploy mù khi chưa kiểm tra stored running autonomous tasks.

READ_ONLY_DIAGNOSTICS: kết nối DB demo qua localhost5432 với transaction_read_only=on và statement_timeout; chỉ SELECT/SHOW. Kết quả:

- Server native PostgreSQL18.4 Windows.
- Alembic public version0006_fix_revision_provenance; chưa có0009.
- Không có extension vector; autonomous status counts rỗng tại DB này.
- ::1:5432 cũng trỏ native server. 127.0.0.1:5433 timeout.

**Không gán kết quả DB native thành migrations của container.** Root .env chỉ định POSTGRES_PORT5433, backend .env trỏ native5432, AI .env trỏ5433/novel_platform; đây là cấu hình trên đĩa, không phải bằng chứng environment đã nạp trong container. Các cổng web/AI/backend có Docker/WSL relay. Vì Docker không đọc được, mapping DB runtime thực chưa xác minh. Không suy runtime worker an toàn chỉ từ bảng autonomous rỗng ở native DB. Không tự tạo bảng tối thiểu, chạy migration thủ công, cài pgvector hay sửa trạng thái job để vượt gate.

## 4. S01–S11

Chi tiết máy đọc được: short_loop_results.csv.

| Step | Verdict | Actual |
|---|---|---|
| S01 nhập/lưu ch01–05 | BLOCKED | Preflight code/runtime/migrations/provider chưa đạt, chưa nhập |
| S02 chủ động extraction | NOT_RUN | Không gọi provider trên runtime cũ |
| S03 review/baseline | NOT_RUN | Chưa có proposals mới |
| S04 memory tabs/reload | NOT_RUN | Chưa có approved memory của run mới |
| S05 suggest/edit/remove event | NOT_RUN | P1 baseline chưa dựng |
| S06 plan approve/reload/context | NOT_RUN | Không có plan mới |
| S07 editor save → auto extraction | NOT_RUN | Không viết/save trên dự án cũ để thay bài test |
| S08 queue → author approval | NOT_RUN | Chưa có new revision |
| S09 rapid saves/dedup/stale | NOT_RUN | Không có save sequence mới |
| S10 injected contradiction/consistency | NOT_RUN | Không cài mâu thuẫn vào dữ liệu cũ |
| S11 reload/continue/M-FIRST/final | NOT_RUN | Chưa đến gate |

Không tạo fault injection; không gặp lỗi nội dung model vì chưa gọi model. Không báo FAIL cho tính năng sửa chưa được triển khai lên stack đang chạy.

## 5. Narrative memory và văn học

MEMORY_AUDIT.md và memory_checkpoints.csv ghi rõ NOT_RUN; không tính recall/precision/provenance từ mẫu rỗng. Chưa có raw LLM output, pending proposals, approved records hay packed context của run mới để đối chiếu. Không sao chép kết quả extraction từ run trước làm coverage mới.

M0/M-FIRST/final memory audit chưa thực thi vì chưa import. Preflight cuối run không được giả thành M-FINAL memory audit đã chạy. Mốc10/20/30/40 NOT_RUN; M50 NOT_APPLICABLE với fixture40chương, phải xét lại nếu kế hoạch tương lai>=50. P2/P3 chưa chạy nên không có coverage dài hạn của chúng.

Fixture có4747 từ nguồn. Canonical output của run mới chưa tạo: word count NOT_RUN/null, new-written words0. Prior-run editor hiển thị năm seed chapters nhưng không nhập lại, không xuất sang final rồi gọi đó là output mới. final/chapters/ rỗng; không có revision manifest giả. Không chấm rubric hoặc hard gates văn học khi chưa có novel; không hạ95–105k.

## 6. Vấn đề và mức can thiệp

| Issue | Mức | Expected → actual | Evidence |
|---|---|---|---|
| ENV-001 | S1 | Runtime sửa mới → OpenAPI/bundle/editor đang cũ | version-preflight.json; source-version-manifest.json; ui-old-editor.png/DOM |
| ENV-002 | S1 | Runtime DB0009+pgvector verified → Docker timeout; native0006/no-vector chưa link được với app | migrations-readonly.json; migrations-target-comparison.json; docker-provider-preflight-final.json |
| ENV-003 | S1 | Authorized real provider ready → quyền có, health chưa xác nhận/timeout; chưa gọi generation | provider-authorization.json; provider-health-readonly.json; docker-provider-preflight-final.json |

Can thiệp tác giả: login và navigation/quan sát UI; prose/title/plan edits0, accept/reject0, publish0, API author writes0, manual DB writes0, code fixes0. Nâng cấp stack cũng chưa thực hiện. SQL chỉ read-only metadata. Không lưu secrets; DB URI evidence chỉ host/port/database, không username/password/key. Mọi evidence cũ giữ nguyên.

## 7. Artifact

- run_config.json, checkpoint.json, actions.csv, issues.csv, short_loop_results.csv.
- evidence/fixture-check.txt, git-status.txt, source-version-manifest.json.
- evidence/health-preflight.json, version-preflight.json, config-targets-readonly.json.
- evidence/migrations-readonly.json, migrations-target-comparison.json, docker-provider-preflight-final.json.
- evidence/provider-authorization.json, provider-health-readonly.json, word-count-status.json.
- evidence/ui-old-editor.png, ui-old-editor-dom.txt.
- MEMORY_AUDIT.md; memory_checkpoints.csv. Các template còn lại chưa có dữ liệu thực, không coi header rỗng là test PASS.

## 8. Tiếp tục

Khôi phục Docker control plane, kiểm tra stored running autonomous jobs ở DB thực trước khi nâng worker. Dùng stack/dataset cô lập được nhận diện bằng run ID; build/start đúng dirty source repair, không reset DB chung. Kiểm tra runtime file/build fingerprints, migrations narrative through0009 và pgvector ở DB ứng dụng thật; xác nhận Gemini sẵn sàng.

Sau đó tiếp tục checkpoint cùng run nếu chỉ thay điều kiện môi trường, ghi rõ thời gian/bản rollout. Tạo project mới qua UI và bắt đầu S01; không dùng project2026-10-17 để đại diện retest mới. Không có job/generation/acceptance mới đang pending để retry. Chỉ sau P1 short loop PASS mới P2/P3, và chỉ sau các vòng ngắn đạt mới bài100k. Quyền Gemini và budget đã cấp trong cùng phạm vi vẫn còn hiệu lực.
