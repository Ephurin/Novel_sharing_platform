# Báo cáo Pipeline test — 2026-10-17-author-01

## 1. Kết quả chính

**Overall: BLOCKED do lỗi sản phẩm tại narrative memory M0.** Chế độ AUTHOR_ASSISTED_HYBRID. Ngân sách không giới hạn và quyền gửi bản thảo/blueprint/văn bản phát sinh tới Google Gemini API đã được người dùng xác nhận. Các blocker preflight đã giải quyết.

Bản xuất canonical: final/novel.md, **4.747 từ**, bốn chương seed hoàn chỉnh và chương5 dở. **0 từ văn xuôi mới được accept**. Mục tiêu giữ nguyên 100.000 (95.000–105.000), còn 95.253 từ đến100k. Đây là bản xuất tiến độ, không phải tiểu thuyết hoàn chỉnh.

| Trục | Verdict | Bằng chứng / giới hạn |
|---|---|---|
| Artifact completion | PARTIAL | Canonical seed readback, chưa đạt độ dài/kết thúc |
| Pipeline functionality | FAIL phần đã chạy | P1 extraction JSON; P2 current state; P3 proposal persistence |
| UI coverage | PARTIAL | UI login/create/rename; nhiều thao tác tác giả dùng public API |
| Autonomy | NOT_ASSESSED | Controller chưa chạy vì baseline thất bại |
| Literary quality | NOT_ASSESSED | Đọc đầy đủ seed, chưa có toàn văn cuối |
| Review independence | NOT_ASSESSED | SELF_REVIEW_ONLY; không có reviewer độc lập |

Không sửa production code, DB, validator, system prompt hoặc fixture. Không đưa gold vào Story Brain, không publish/xóa project. Harness chỉ nằm trong thư mục run.

## 2. Môi trường và đầu vào

Fixture PT-CV-001 v1.0.0, task revision1.1. Verify trước/sau PASS. Manifest SHA256: 7abef96ba77bef7a8bd520207b7abc43c94e339f2c5d4a7f86dce87da96fa255. Seed thực4747 từ, không phải nửa truyện.

Live SHA: 390b09fd043ec29db84519a9d195b59b76eec003; dirty vì Pipeline_test untracked. SHA lúc đọc task đầu là af20712; preflight đã ghi SHA mới trước live. Không pull/reset checkout. API_ADAPTER.checked.md là bản sao adapter; đã kiểm tra route/schema dùng trong run, không claim verify mọi route chưa dùng.

Backend http://localhost:4000/api/v1; web http://localhost:8080; AI http://localhost:8000. Stack demo build/start theo runbook qua Compose plugin có sẵn, Docker cần escalation ngoài sandbox. Không đổi global config. Volume demo có sẵn được giữ, ba novel test riêng không đụng truyện có sẵn. Timestamp evidence ISO+07:00; log container UTC, cộng7 giờ khi đối chiếu. Live request khoảng22:58–23:03 ngày17/10/2026; giờ chính xác trong từng evidence và checkpoint.

AUTHOR đã login, /auth/me xác nhận ID86c6646a-5c29-478e-89bb-74c7a9326ce0. Không ghi JWT/password/cookie/full headers vào evidence.

- Main: 8bfd205f-c055-45e4-beda-e81a24b7854b.
- P2: 38efd972-da60-4c19-a967-5ef8c62e230a.
- P3: 2bb31f80-4a5c-4eba-a5b9-6d936fd76986.

Runtime Gemini3.5 Flash-Lite; HTTP generateContent route thực có200. Node Copilot dùng Google OpenAI-compatible endpoint chính thức; label response openai-compatible-ngrok là nhãn cũ, không dùng để suy đích provider. Không expose response-model ID, provider call IDs, token usage/chi phí.

LLMService max_output_tokens512; routing legacy-v1; local fallback false. Fallback_provider=openai nhưng fallback key không cấu hình. Không thấy rotation bốn key trong đường runtime đã đọc; không thay key/config để làm pass. Semantic provider none, retrieval disabled trong runtime Compose; cấu hình .env development khác không được coi là runtime thật. Semantic NOT_ASSESSED; structured memory vẫn audit.

Ngân sách người dùng: không trần tiền/call/thời gian, tuân thủ từng API15RPM/250KTPM/500RPD, bốn API được báo độc lập. Quan sát9 AI-service generateContent +1 Node smoke, không thấy429. Không có key pool được xác minh; không giả2.000RPD khả dụng. Chi phí/tokens/remaining quota UNKNOWN. Không có generation chạy ngầm tại checkpoint cuối.

## 3. Coverage ba pipeline

| Gate | Kết quả | Evidence |
|---|---|---|
| P1 import/snapshot/readback | Exact body5/5 đạt phần persistence | import-revisions.json; p1-chNN-readback.json; final-chNN-readback.json |
| P1 bootstrap/review/activate | FAIL: initial entity JSON, retry event JSON;0/5 chương xong | p1-bootstrap-poll01/02.json |
| P1 writing/reject/accept/outbox | NOT_RUN vì M0 chưa đạt | checkpoint.json |
| P2 idea/review/activate | Model thật,11 outputs đọc hết; reject3trùng, accept8; brain1→2 | memory/P2-M0/raw-queue.json; p2-accept-reviewed-group.json |
| P2 memory | FAIL: Lâm Alive cạnh rule đã chết | memory/P2-M0/context-mai-lam.json |
| P2 first prose/accept/M-FIRST | NOT_RUN, giữ critical memory gate | P2-001 |
| Main Story Plan | Create/activate36objectives ch5–40, version1; context5/6 chỉ current objective trong planning | main-plan-create/activate.json; main-plan-context-ch06.json |
| Plan edit/version change | NOT_RUN; không sửa plan trong nhánh đang bị chặn | T11 PARTIAL |
| P3 baseline độc lập | FAIL: confidence10.0 overflow numeric(5,4) | p3-bootstrap-poll01.json |
| P3 controller/stop/resume/terminal | NOT_RUN vì baseline chưa đạt | P3-001 |
| Autonomous100k | NOT_ASSESSED | Assisted run không chứng minh tự động100k |

| Test | Verdict / phạm vi |
|---|---|
| T01 | PARTIAL: import/readback đạt, extraction/canon gate fail |
| T02 | NOT_RUN: reject proposal P2 không thay reject writing draft |
| T03 | NOT_RUN: chưa có accepted generation để thử idempotency |
| T04 | NOT_RUN: stale-draft probe chưa chạy |
| T05 | PARTIAL: fresh login/readback5seed revisions đạt; chưa có generated acceptance |
| T06 | NOT_RUN: hai scene controller bị chặn baseline |
| T07 | PARTIAL: natural HTTP200 followed by JSON/persistence failure; long writing/timeout chưa chạy |
| T08 | NOT_RUN: không có controller run để stop/step |
| T09 | PARTIAL: phục hồi harness encoding sau snapshot commit, không duplicate; writing resume chưa chạy |
| T10 | PARTIAL: idea/review/activation chạy thật; first prose chưa chạy |
| T11 | PARTIAL: create/activate plan, context5/6; chưa edit version; lịch sử rỗng nên chưa chứng minh giữ canon khi đã đủ memory |
| T12 | NOT_RUN: chưa chạy controller |
| T13 | BLOCKED: chỉ4747 từ, không có novel/full review |
| T14 | FAIL M0; M-FIRST NOT_RUN cả ba |
| T15 | Early-stop final audit tại M0 đã lưu; dài hạn chưa đến mốc |

Không fault injection hay force_gate_failure. Các lỗi quan sát là tự nhiên qua model/application thật.

### Narrative memory

Xem memory_checkpoints.csv, memory_items.csv, memory_probes.csv và ba evidence/memory/P*-M0/MEMORY_AUDIT.md. Gold P1:35assertions nguồn đóng băng trước extraction. P3 dùng cùng seed gold nhưng map revisions độc lập, không mượn extraction P1. P2 gold dựa idea/constraints trước blueprint; không giả là prose extraction.

| Mốc | Gold/usable output | Execution/quality | Memory/context | Overall |
|---|---|---|---|---|
| P1 M0 + final alias |0/35 usable proposal coverage;precision0/0 NOT_ASSESSED |HTTP200 nhưng JSON extraction không hoàn tất; raw model text thiếu |Chưa activate; historical context rỗng;4positive fail,1negative chỉ chứng minh absence |FAIL |
| P2 M0 + final alias |Raw constraints3/3;11/11 blueprint outputs supported,3duplicates,đọc hết |Blueprint generation khác prose extraction;call-source trace chưa đủ |8artifact IDs materialize;operative constraints2/3 vì Lâm Alive;context4/5 trong phạm vi mẫu |FAIL |
| P3 M0 + final alias |0/35 usable proposals;precision0/0 NOT_ASSESSED |Provider real;raw stage không expose đầy đủ |Confidence10.0 persistence fail;baseline/controller không chạy tiếp;positive context không có memory |FAIL |

P2 origins: premise/constraints author_supplied; entity proposals model_proposed và author_accepted; generic protagonist được chấp nhận trong blueprint probe. Rejected3constraint duplicates, không sửa payload. Không gọi mọi sáng tạo blueprint là hallucination. Lỗi Alive không có trong raw entity payload, xuất hiện khi materialization/projection; không kết luận LLM đã hồi sinh Lâm.

Provenance accuracy tổng thể NOT_ASSESSED: không đủ source links/provider call-to-input trace từ gateway/context để tính n/N. Không biến ID/count/brain_version thành provenance PASS. P3 job error có analysis_run484e25f2-37e6-41b1-a12c-e9e26582647f và proposalb0ae9ab0-176a-59a0-9969-78f78b0eee46 liên quan revision đầu; đây là failure evidence, không thay raw extraction đầy đủ.

World-rule lane manuscript dùng regex theo code; không ghi LLM extraction PASS cho lane đó. Output512 có thể góp phần lỗi JSON nhưng thiếu raw response/finish reason nên chưa chứng minh truncation. Không coi smoke hoặc HTTP200 là extraction PASS.

M0 và M-FINAL dùng cùng snapshot/cutoff khi dừng sớm, alias ghi rõ. M-FIRST NOT_RUN vì không có new accepted prose. Main10/20/30/40 NOT_RUN vì chưa đến; M50 NOT_APPLICABLE cho40chương. P2/P3 probe không có coverage dài hạn. Post-correction NOT_ASSESSED, không sửa memory tay.

## 4. Hành trình tác giả và can thiệp

UI: login AUTHOR, New Project, metadata rename, xem Import. New Project tự tạo chapter1 mẫu. Import hiển thị file/sáu chương mẫu trước upload và target nối từ2; không confirm nhập sample. Bằng chứng UI là ghi chép DOM session trong ui-observation.txt; chưa persist screenshot, không claim screenshot coverage hoặc đã kiểm tra mọi UI.

API thay UI: thay samplech1 bằng seed1, tạo2–5; snapshot/readback; Copilot smoke; bootstrap/poll/queue; P2 create/idea/reject/accept/activate; main plan create/activate; P3 project/import/bootstrap; context probes/final readback. Lý do: hybrid đã khai báo, giữ chapter numbering và thu source hashes/request-response để audit. Không suy các tính năng đều thiếu UI. actions.csv index từng public request. Không internal FastAPI mutation/service-token bypass.

Seed conversion: bỏ dòng Markdown title, trim whitespace ngoài, giữ paragraph trong. Không sửa prose. Harness lỗi stdout encoding sau snapshot1 đã commit; sửa encoding rồi đọc snapshot/server state, không duplicate. Proposal review P2 là author intervention,0prose words changed. Không sửa canonical memory để chữa Lâm Alive; giữ before/after snapshots.

| Chỉ số | Giá trị / cách đo |
|---|---|
| Copilot smoke |1thành công,không accept vào novel |
| Writing drafts/accepted/rejected |0/0/0;proposals không tính là drafts |
| P1 bootstrap |2attempts:initial+1retry cùng manifest/job |
| P2 idea |1call tới waiting_review rồi activate |
| P3 baseline |1attempt,failed persistence |
| Provider generate requests observed |10=9AI SDK HTTP200+1Node smoke;không tính models/health metadata |
| Provider429/timeouts |Không quan sát;parse/persistence failure là downstream |
| P2 proposals |11reviewed;3duplicate rejected;8accepted;payload edits0 |
| Canon reminders/manual prose edits |0/0;không có prose mới |
| Tokens/cost/remaining quota |UNKNOWN,không ghi0USD |
| Latency |latency_ms từng API;response202 không phải async end-to-end;p50/p95 provider NOT_ASSESSED |
| Reading/editing time |UNKNOWN,không có timer tách đáng tin cậy |
| Controller completed |Không có controller run |

## 5. Đánh giá toàn truyện

Đã đọc toàn bộ5seed chapters; chưa có tiểu thuyết cuối. Rubric7chiều, hard gates1–6 và payoffPF01–PF12 đều NOT_ASSESSED cho toàn truyện; không chấm seed thay100k. chapter_reviews.csv xác nhận ch1–4complete seed và ch5chưa đạt objective.

Hai chi tiết source có ích cho continuity: ch2 ghi lần quét thứ nhất và hai nơi giữ bản sao; ch3 giữ lời Sâm về chuông là lời kể cần biên bản. Ch5chưa giải thích cơ học tiếng gõ, payoff sau đó chưa viết. Đây là fixture unfinished, không gán thành lỗi văn học model. Không bịa điểm rubric, hai điểm yếu văn học hoặc independent review.

## 6. Vấn đề gặp phải

| Issue | Mức | Expected→Actual / tác động | Evidence |
|---|---|---|---|
| P1-001 |S1 |JSON extraction hợp lệ→entity fail rồi retry event fail;main baseline blocked |p1-bootstrap-poll01/02.json |
| P2-001 |S1 |Lâm dead nhất quán→entity/current_states Alive cạnh death rule |memory/P2-M0/context-mai-lam.json |
| P3-001 |S1 |Confidence hợp lệ→Decimal10.0 overflow numeric(5,4) |p3-bootstrap-poll01.json |
| OBS-001 |S2 |Output512,semantic off,no fallback key/keypool;long-form impact chưa đo |runtime-settings.json |
| OBS-002 |S2 |Thiếu raw model/usage/call-source IDs/provenance export |ai-service-live-sanitized.log;audit reports |
| UI-001 |S2 |Initial sample import và autochapter tạo numbering friction;API workaround logged |ui-observation.txt |
| PRE-001/002/003 |Resolved |Ngân sách,môi trường,explicit data transmission approval;giữ lịch sử auto-review rejection |issues.csv;provider-approval-block*.json |

Khả năng correction đã kiểm tra: public profile PATCH có name/role/personality/description/notes,không có canonical status. Proposal edit chỉ pending; Lâm entity đã accepted; baseline không có event để correction. Không thử ghi legacy profile/DB giả repair. Đây là gap ở contract đã đọc,không tuyên bố mọi UI/endpoint đều không thể sửa.

## 7. Artifact và kiểm chứng

- final/chapters/ch01.md–ch05.md và final/novel.md:canonical seed export,title/body,không lẫn báo cáo.
- revision_manifest.csv:chapter/revision/API hash và export-file hash riêng;fresh login/readback final-chNN-readback.json5/5khớp.
- evidence/final-word-count.json:4747từ,không đạt95–105k/chưa40files.Bộ đếm README,không phải tokens.
- run_config.json,checkpoint.json,actions.csv,issues.csv,interventions.csv,chapter_reviews.csv,continuity.csv.
- memory_checkpoints.csv,memory_items.csv,memory_probes.csv;ba audit reports,source/gold/raw/accept/context snapshots.
- ai-service-live-sanitized.log,provider-http-calls.json,provider-smoke.json,job/plan evidence.
- fixture-check.txt/fixture-check-after.txt PASS.Báo cáo lịch sử giữ tại evidence/REPORT-pre-consolidation.md.

## 8. Tiếp tục an toàn

Không có pending generation/acceptance;P1/P3 bootstrap terminal failed.Không retry accept8proposals P2,không nhập lại seed.Chưa có prose mới cần regenerate.

Cần fix sản phẩm riêng:(1) extraction output/schema/parse và raw-response observability;(2) normalize/validate confidence trước persistence;(3) materialize trạng thái canonical nhất quán author constraints và cung cấp correction thích hợp.Output512 là quan sát runtime,chưa phải nguyên nhân được chứng minh.Không đổi validator/DB để làm pass.

Sau fix dùng run/version mới hoặc ranh giới trước/sau rõ,giữ failure evidence.Xác minh SHA/fixture/server state,retetst M0 trước writing;rồi tiếp tụcch5,M-FIRST,audit10/20/30/40/final.P3 cần baseline đạt trước controller;P2 cần death-state đạt trước first prose.Ngân sách và quyền gửi Gemini đã cấp,không cần hỏi lại trong cùng phạm vi.

## 9. Kết luận đúng phạm vi

Đã chứng minh import/readback seed và model thật ở Copilot/idea generation.Chưa chứng minh pipeline hoàn tất tiểu thuyết.Ba lỗi sản phẩm ngăn vượt memory gate ban đầu.Run BLOCKED;không gọi seed là completed100k;giữ nguyên mục tiêu và acceptance thresholds.
