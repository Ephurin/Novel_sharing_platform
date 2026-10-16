# Engineering Development History — Ephurin Novel Platform

> **Mục đích:** Ghi lại quá trình phát triển theo chuỗi **vấn đề → lựa chọn/giới hạn kiến trúc → thay đổi → kiểm chứng → bài học**, để người mới, người review hoặc giảng viên hiểu *vì sao* hệ thống tiến hóa như hiện tại. Đây là chỉ mục dẫn đến chứng cứ gốc, **không thay thế** Git log, PR, runbook hay acceptance report.
>
> **Snapshot được đối chiếu:** 2026-10-16; baseline main trước khi tạo tài liệu này: [de68cae](https://github.com/Ephurin/Novel_sharing_platform/commit/de68cae9bb766365ec88286080a10d440c875adb). Branch comment-report được quan sát tại [7bf26fd](https://github.com/Ephurin/Novel_sharing_platform/commit/7bf26fd5b3415038b172dcaa25f609287f4ce907).
>
> **Quy ước nguồn:** [PR #n] = PR/merge trên GitHub; đường dẫn docs = báo cáo trong repo; SHA = commit định danh. “Đã merge” khác “đã chạy live trên production”; “local PASS” khác “CI PASS”; một gate chuẩn bị cleanup đã merge **không** có nghĩa cleanup phá hủy dữ liệu được phép chạy. Những nhận định về lý do thiết kế bên dưới được tổng hợp từ các báo cáo/PR liên kết; nếu báo cáo chỉ chứng minh local thì tài liệu này không nâng lên thành remote acceptance.

## 1. Bức tranh toàn cảnh

| Giai đoạn | Câu hỏi kỹ thuật chủ đạo | Hướng giải quyết được ghi nhận | Chứng cứ mở đầu |
|---|---|---|---|
| 17/09 — P4 | Narrative Memory có nhất quán qua revision, correction, rebuild và restart không? | Kiểm thử Docker/PostgreSQL, mock platform, Newman và orchestration; chú trọng persistence | [P4 report](P4-DOCKER-POSTMAN-01-report.md) |
| 17/09 — P5 | Import truyện dài thế nào mà không trộn dữ liệu tạm với canon? | Bootstrap job có checkpoint/resume, review queue, baseline activation | [P5 report](P5-MANUSCRIPT-IMPORT-report.md) |
| 17–20/09 — P6/P6.5 | Từ context đến viết/accept bản nháp có fail-closed và giữ chuẩn xác thực, provenance không? | Review P1 blockers, Node AI Gateway, version pinning, outbox, temporal cutoff, reconciliation | [P6 report](P6-CONTEXT-WRITING-01-report.md), [P6.5 report](P6.5-INTEGRATION-HARDENING-01-report.md) |
| 21–23/09 — P7 | Truy xuất trí nhớ ngữ nghĩa vượt ngữ cảnh gần nhất, nhưng không rò rỉ thông tin tương lai? | Frozen real-novel corpus, embedding benchmark, pgvector, retriever, hybrid reranker và deterministic packer | [P7 benchmark](P7-01-EMBEDDING-BENCHMARK-ADR-report.md), [PR #1–4](https://github.com/Ephurin/Novel_sharing_platform/pulls?q=is%3Apr+is%3Amerged+P7) |
| 23–24/09 — P8 | Chuyển JSON → PostgreSQL mà vẫn có parity và rollback? | Dry-run-first migration, API gateway boundary, JSON read-only, restore rehearsal; destructive cleanup giữ BLOCKED | [P8-01](P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md), [P8-05](P8-05-FINAL-CLEANUP-GATE-report.md) |
| 26/09–01/10 — EVAL/CTX-RD | Khi prompt quá lớn, nên tăng budget hay chọn context có liên quan hơn? | Corrected evaluation harness, controlled A/B, relevance-density scope-first, adaptive tiers sau feature flag | [PR #10](https://github.com/Ephurin/Novel_sharing_platform/pull/10), [PR #26](https://github.com/Ephurin/Novel_sharing_platform/pull/26), [PR #27](https://github.com/Ephurin/Novel_sharing_platform/pull/27) |
| 02–05/10 — Live staging/demo | Làm sao phân biệt test giả/lite smoke với live provider path, tránh đụng quota demo? | Evidence validator, source-faithful staging, Flash-Lite demo opt-in, runbook; chưa kết luận chất lượng văn chương rộng | [PR #32–38](https://github.com/Ephurin/Novel_sharing_platform/pulls?q=is%3Apr+is%3Amerged+demo) |
| 09–11/10 — AI-PIPE | Tái sử dụng một writing loop cho idea, plan và bounded automation được không? | Production persistence P1, Story Brain bootstrap, future-plan separation, resumable controller | [PR #39](https://github.com/Ephurin/Novel_sharing_platform/pull/39), [#40](https://github.com/Ephurin/Novel_sharing_platform/pull/40), [#41](https://github.com/Ephurin/Novel_sharing_platform/pull/41), [#42](https://github.com/Ephurin/Novel_sharing_platform/pull/42) |
| 13–15/10 — Product browser E2E | UI có thật sự thực thi contract đã có thay vì chỉ render mock không? | UI merge, browser acceptance có DB correlation cho import, publish/moderation, Reader discovery/state, social/comment/preferences | [PR #43–49](https://github.com/Ephurin/Novel_sharing_platform/pulls?q=is%3Apr+is%3Amerged) |
| 15–16/10 — Comment user report (đang review) | Báo cáo bình luận + Admin decision + notifications có toàn vẹn và test an toàn không? | Functional E2E, review lặp về destructive cleanup, DB isolation, opt-in, collision/refusal & fixture ownership | [Branch đang làm](https://github.com/Ephurin/Novel_sharing_platform/tree/astra/comment-user-report-admin-moderation-e2e) |

**Giới hạn:** Bảng này bắt đầu từ các báo cáo P4 có thể kiểm tra rõ trong snapshot. Lịch sử thiết kế P1–P3 trước đó, các phiên brainstorming và mọi thử nghiệm local không có artifact **chưa được tái dựng đầy đủ**; xem commit history gốc trước khi kết luận về các mốc ấy.

## 2. Engineering decision log (các quyết định có dấu vết)

### EDR-01 — Canon phải được review/accept, không suy từ bản nháp chưa duyệt

- **Vấn đề:** Import và generation có thể tạo phân tích, proposal hoặc bản nháp chưa được tác giả xác nhận; tự đưa chúng vào Story Brain tạo trạng thái sai.
- **Lựa chọn:** Durable manuscript bootstrap, per-chapter checkpoint/resume, priority review, baseline activation; writing accept phải vượt validation và freshness/idempotency; accepted revision mới đi qua canonical persistence/outbox.
- **Không chọn:** Coi output phân tích hoặc failed/unaccepted draft là canonical fact; tự động kích hoạt baseline không qua review.
- **Review đã thay đổi điều gì:** P6 ban đầu mô tả quá mức “hoàn thành end-to-end”, sau review ghi 7 lỗi P1, gồm accept failed validation, stale revision, thiếu service auth và UI mismatch. Đây là ví dụ sớm về việc cần phân biệt **implementation** với **acceptance**.
- **Nguồn:** [P5](P5-MANUSCRIPT-IMPORT-report.md), [P6](P6-CONTEXT-WRITING-01-report.md), [P6.5 R5](P6.5-R5-FINAL-VERIFICATION-01-report.md), [AI-PIPE-01B](AI-PIPE-01B-MAIN-E2E-report.md).

### EDR-02 — Gateway và context/provenance boundary đặt trước gọi LLM

- **Vấn đề:** Browser từng có đường gọi FastAPI trực tiếp; stale Story Brain, temporal leakage và sự lệch giữa Mongo draft/SQL canon là rủi ro xuyên dịch vụ.
- **Lựa chọn:** Browser/mobile → Node Platform API → service-authenticated FastAPI; pin context version, kiểm tra cutoff, dùng transactional outbox và reconciliation có điều kiện.
- **Không chọn:** Đưa service token/API FastAPI nội bộ ra frontend; đồng nhất “lần sinh ra cuối” với “bản canonical cuối”.
- **Nguồn:** [P6.5 hardening](P6.5-INTEGRATION-HARDENING-01-report.md), [P8-02](P8-02-FRONTEND-API-CANONICAL-CUTOVER-report.md), [PR #6](https://github.com/Ephurin/Novel_sharing_platform/pull/6).

### EDR-03 — Corpus thực, nhãn cấm thông tin tương lai và benchmark embedding trước rollout

- **Vấn đề:** Recent-only retrieval dễ bỏ sót setup xa; benchmark không có gold/cutoff dễ đo nhầm.
- **Lựa chọn:** Freeze Aethelgard corpus từ 61 chương; 216 canonical memories, 21 core-gold queries, 19 challenge queries. Quy ước nhãn -1 là future/invalid/prohibited, không xem tài liệu unjudged là negative.
- **Kết quả được báo cáo:** P7-01 chọn gemini-embedding-2, 768 dimensions, L2 normalization và query/document instruction riêng. Benchmark core-gold ghi Recall@10 0.4095 → 0.6747, nDCG@10 0.3160 → 0.7097 (đo trên split nêu trong report).
- **Không chọn:** 1536 dimensions chỉ vì vector lớn hơn; báo cáo dimension sweep không thấy lợi ích chất lượng tương xứng và tăng chi phí lưu trữ.
- **Nguồn:** [P7-01A](P7-01A-CORPUS-CONSOLIDATION-report.md), [P7-01](P7-01-EMBEDDING-BENCHMARK-ADR-report.md).

### EDR-04 — Memory content và embedding tách vòng đời; semantic là bổ trợ, canon SQL có thẩm quyền

- **Vấn đề:** Thay model embedding hoặc tái materialize không được làm hỏng canonical memories; similarity không đủ để phát hiện contradicted/superseded/future facts.
- **Lựa chọn:** Tách canonical Story Brain → memory_chunks có provenance → memory_embeddings có version; pgvector exact retrieval với scope tenant/novel/brain, content-hash freshness, temporal cutoff, active-event checks. Sau đó hybrid-v1 rerank dựa entity, temporal, importance, relationship.
- **Không chọn:** Đưa vector vào canonical memory hoặc dùng semantic ranking thay thế SQL context; bỏ temporal filter sau cosine.
- **Chứng cứ:** [PR #1](https://github.com/Ephurin/Novel_sharing_platform/pull/1), [#2](https://github.com/Ephurin/Novel_sharing_platform/pull/2), [#3](https://github.com/Ephurin/Novel_sharing_platform/pull/3), [P7-02](P7-02-MEMORY-PGVECTOR-FOUNDATION-report.md), [P7-03](P7-03-SEMANTIC-RETRIEVER-report.md), [P7-04](P7-04-HYBRID-RANKER-report.md).

### EDR-05 — Context budget cuối cùng là deterministic packing, không phải LLM rewrite

- **Vấn đề:** Gom mọi thứ vào prompt có thể vượt budget hoặc làm mất locked world rules/current-state.
- **Lựa chọn:** Áp dụng một packing stage cuối trên canonical + semantic candidates; dedup recent/semantic, ưu tiên artifact; giữ nguyên protected facts/rules/current-state ngay cả khi protected overflow, báo flag thay vì cắt lặng lẽ.
- **Không chọn:** Cho LLM thứ hai tự viết lại/rút gọn canon trong P7-05; silently truncate các artifact được khóa.
- **Nguồn:** [PR #4](https://github.com/Ephurin/Novel_sharing_platform/pull/4), [P7-05](P7-05-CONTEXT-COMPRESSION-TOKEN-BUDGET-report.md).

### EDR-06 — Cutover theo từng mức, khả năng phục hồi quan trọng hơn xóa legacy sớm

- **Vấn đề:** JSON legacy và PostgreSQL có thể lệch canonical state; xóa compatibility/data khi chưa chứng minh parity/rollback gây mất đường phục hồi.
- **Lựa chọn:** P8-01 dry-run-first và explicit apply; P8-02 canonical API boundary; P8-03 production JSON read-only (vẫn giữ archive/adapters); P8-04 backup/restore vào DB riêng; P8-05 chỉ thêm **gate kiểm soát**.
- **Không chọn:** Tự động overwrite target có dữ liệu, bật JSON read-write lại trên production, hoặc xóa legacy ngay khi PR cleanup-gate merge.
- **Ranh giới cực kỳ quan trọng:** P8-05 report ghi **MERGED — DESTRUCTIVE CLEANUP BLOCKED**. Muốn mở gate cần release/stability/error-budget/rollback evidence và explicit supervisor acceptance. Không được gọi P8-05 “cleanup hoàn tất”.
- **Nguồn:** [PR #5](https://github.com/Ephurin/Novel_sharing_platform/pull/5), [#6](https://github.com/Ephurin/Novel_sharing_platform/pull/6), [#7](https://github.com/Ephurin/Novel_sharing_platform/pull/7), [#8](https://github.com/Ephurin/Novel_sharing_platform/pull/8), [#9](https://github.com/Ephurin/Novel_sharing_platform/pull/9); [P8-01](P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md), [P8-05](P8-05-FINAL-CLEANUP-GATE-report.md).

### EDR-07 — Evidence là dữ liệu đo thực, không phải PASS được hardcode

- **Vấn đề:** EVAL attempt ban đầu gộp sai query splits và tạo những khẳng định không được đo; staging sau đó từng có nguy cơ dry-run tự nhận là live E2E PASS.
- **Lựa chọn:** EVAL-01 sửa split 21/19/10, corpus 216/232, phân biệt measured/not_measured, generation quality thành REVIEW_REQUIRED khi chưa có blind review. A/B provenance khóa các biến control, tách scoring độc lập. Staging validators buộc live provider path và source-faithful evidence.
- **Không chọn:** Hardcode chất lượng 5/5, tuyên bố token/cost đã đo khi chưa có provider usage; dùng synthetic adapter làm bằng chứng end-to-end production path.
- **Nguồn:** [PR #10](https://github.com/Ephurin/Novel_sharing_platform/pull/10), [#14](https://github.com/Ephurin/Novel_sharing_platform/pull/14), [#32](https://github.com/Ephurin/Novel_sharing_platform/pull/32), [#33](https://github.com/Ephurin/Novel_sharing_platform/pull/33).

### EDR-08 — Relevance density trước mở context window vô điều kiện

- **Vấn đề:** Full-context pressure và multi-lane Story Brain có thể đẩy prompt lên rất cao nhưng không cải thiện độ liên quan.
- **Lựa chọn:** Sau EVAL-01 series, đề xuất cân bằng breadth theo query entities, semantic-top và recent participants; chọn **minimum full-fit** tier từ 12k/16k/20k/24k với fail-closed trên giới hạn, nằm sau flag balanced-scope-v1.
- **Không chọn:** Áp dụng mặc định strategy mới ngay sau một micro-benchmark; thay đổi retrieval candidate IDs/semantic ordering tùy tiện trong A/B; mặc nhiên 24k là tốt hơn 12k.
- **Trạng thái:** Implementation được merge nhưng PR nêu **default CONTEXT_ROUTING_POLICY=legacy-v1**. Các live trials có phạm vi riêng, không đồng nghĩa global activation.
- **Nguồn:** [PR #17](https://github.com/Ephurin/Novel_sharing_platform/pull/17), [#25](https://github.com/Ephurin/Novel_sharing_platform/pull/25), [#26](https://github.com/Ephurin/Novel_sharing_platform/pull/26), [#27](https://github.com/Ephurin/Novel_sharing_platform/pull/27).

### EDR-09 — Flash-Lite cho demo vì quota/capacity, không suy ra chất lượng văn chương cao hơn

- **Vấn đề:** Lo ngại số requests/ngày của model 3.8 gây demo thực tế khó chạy.
- **Lựa chọn:** Flash-Lite demo Compose overlay cấu hình cả Node Copilot và Python writing; tránh fallback sang 3.8; ghi nhận các smoke live phạm vi nhỏ, khóa model cho defense runtime; giữ routing legacy-v1.
- **Không chọn:** Đổi toàn hệ thống sang model mới rồi tuyên bố chất lượng tốt hơn; xem 2 lần generation thành chứng cứ reliability/rate-limit dài hạn.
- **Nguồn:** [PR #34](https://github.com/Ephurin/Novel_sharing_platform/pull/34), [#35](https://github.com/Ephurin/Novel_sharing_platform/pull/35), [#36](https://github.com/Ephurin/Novel_sharing_platform/pull/36), [#38](https://github.com/Ephurin/Novel_sharing_platform/pull/38). Các giới hạn quota là động cơ được nêu trong PR, không phải thông số provider được tài liệu này kiểm chứng lại vào ngày hiện tại.

### EDR-10 — Một canonical writing loop, không xây writer/brain thứ hai cho P2/P3

- **Vấn đề:** Ý tưởng, outline và autonomous loop dễ tạo thêm store/canonical path song song hoặc làm lộ future plot thành historical facts.
- **Lựa chọn:** P1 acceptDraft + outbox là core; P2A bootstrap premise/world bible rồi dùng lại P1; P2B lưu versioned future Story Plan **tách khỏi canon**; P3A bounded resumable controller gọi lại P1, có concurrency/idempotency/retry/stop/recovery.
- **Bất biến:** **FUTURE PLAN != HISTORICAL CANON**; rejected/unaccepted draft không đẩy Story Brain hoặc plan progress.
- **Không chọn:** Tạo P2-only memory store, tự nhận mọi future plot là established past, hoặc autonomous generation vô hạn/không thể resume.
- **Nguồn:** [PR #39](https://github.com/Ephurin/Novel_sharing_platform/pull/39), [#40](https://github.com/Ephurin/Novel_sharing_platform/pull/40), [#41](https://github.com/Ephurin/Novel_sharing_platform/pull/41), [#42](https://github.com/Ephurin/Novel_sharing_platform/pull/42).

### EDR-11 — Product UI acceptance phải theo mutation thật, auth thật và database correlation

- **Vấn đề:** UI mock hoặc component render không đủ chứng minh request chính xác; import có nguy cơ sai provenance/double-analysis; Admin/Reader state phải có persisted consequences.
- **Lựa chọn:** Browser CDP đi qua rendered login/logout và hành động giao diện, ghi API request/response IDs, so sánh PostgreSQL/Mongo. Import sửa bootstrap ownership; Author publish kiểm thử publish→moderation→public discover; Reader kiểm thử library/history và social/comment/preferences.
- **Phát hiện production thực:** Khi review Reader Social, comment create/list trước đó chỉ dựa chapter existence. Chuyển sang reader-visible published chapter lookup để draft/unpublished target fail-closed.
- **Không chọn:** Chỉ chụp screenshot rồi kết luận E2E PASS; inject auth token hoặc tạo mutation bằng test DB thay cho thao tác UI quyết định.
- **Nguồn:** [PR #43](https://github.com/Ephurin/Novel_sharing_platform/pull/43), [#44](https://github.com/Ephurin/Novel_sharing_platform/pull/44), [#45](https://github.com/Ephurin/Novel_sharing_platform/pull/45), [#46](https://github.com/Ephurin/Novel_sharing_platform/pull/46), [#47](https://github.com/Ephurin/Novel_sharing_platform/pull/47), [#48](https://github.com/Ephurin/Novel_sharing_platform/pull/48), [#49](https://github.com/Ephurin/Novel_sharing_platform/pull/49). Báo cáo: [AI UI E2E](AI-PIPE-01B-MAIN-E2E-report.md), [Manuscript](MANUSCRIPT-IMPORT-UI-E2E-report.md), [Author](AUTHOR-PUBLISH-ADMIN-MODERATION-E2E-report.md), [Reader state](READER-DISCOVERY-READING-STATE-E2E-report.md), [Reader social](READER-SOCIAL-COMMENT-PREFERENCES-E2E-report.md).

### EDR-12 — PASS chức năng không đảm bảo test teardown và provisioning an toàn

- **Vấn đề phát hiện sau local PASS:** Test comment-report từng dùng xóa toàn bộ COMMENT reports/reviews; browser runner xóa comments/notifications theo seeded user; guard cho phép CI/npm-script tự vượt qua; migration standalone tự bật opt-in; CREATE test database từng có pre-DROP làm rủi ro collision.
- **Lựa chọn sau nhiều lượt review:** ID-scoped teardown; test database guard; external opt-in; DB identity preflight; full-span sentinel readback sau suite và browser; preflight migration 012; random run DB name + ownership tracking + collision refusal.
- **Bài học:** 17/17 domain invariants hoặc 123/123 backend tests không tự chứng minh an toàn dữ liệu ngoài fixture. Evidence phải ghi phạm vi chứng minh chính xác; fingerprint của 5 sentinel chỉ xác nhận **5 bản ghi đó** không đổi trong cửa sổ quan sát, không chứng minh bất kỳ record nào khác cũng an toàn.
- **Dấu vết review trên main:** [1b49d94](https://github.com/Ephurin/Novel_sharing_platform/commit/1b49d94577500c4456cfa4c7871b4c9fc713b2cc) → [3d51838](https://github.com/Ephurin/Novel_sharing_platform/commit/3d51838e758ed86b68795d6d3af0b0daa66b3c8f) → [de68cae](https://github.com/Ephurin/Novel_sharing_platform/commit/de68cae9bb766365ec88286080a10d440c875adb).
- **Dấu vết sửa code trên branch:** [736ff1d](https://github.com/Ephurin/Novel_sharing_platform/commit/736ff1d7566e1a113c4931035727649df63a2bb4) → [fb40e2a](https://github.com/Ephurin/Novel_sharing_platform/commit/fb40e2a210b6f0627d0022a0af31fcb27ed59ec0) → [8925247](https://github.com/Ephurin/Novel_sharing_platform/commit/89252479f047bd372bc0e19b39463905d866f383) → [7bf26fd evidence](https://github.com/Ephurin/Novel_sharing_platform/commit/7bf26fd5b3415038b172dcaa25f609287f4ce907).
- **Không chọn:** Cleanup theo loại entity/user thay vì run-owned ID; dùng tên có chữ test hoặc biến CI=true làm chứng cứ cách ly; ghi PASS collision test bằng điều kiện lặp lại nhưng không invoke đúng failure path.
- **Trạng thái tại snapshot:** local report trên branch ghi COMMENT_USER_REPORT_ADMIN_MODERATION_PASS; **chưa có PR/P7-P8 CI/merge**. Static review đã lưu ý Mongo collision negative test kiểm tra condition/listDatabases thay vì đi xuyên đường provision chính. Vì vậy không tự nâng trạng thái sang remote accepted.
- **Báo cáo branch:** [Comment-report acceptance report](https://github.com/Ephurin/Novel_sharing_platform/blob/astra/comment-user-report-admin-moderation-e2e/docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md). 

## 3. Mốc merge và acceptance có thể truy ngược

| Mốc | PR | Trạng thái truy vết |
|---|---|---|
| Semantic-memory PostgreSQL/pgvector → retrieval → hybrid → budget | [#1](https://github.com/Ephurin/Novel_sharing_platform/pull/1) – [#4](https://github.com/Ephurin/Novel_sharing_platform/pull/4) | Các PR đã merge; báo cáo P7-02..05 ghi ACCEPTED |
| JSON parity, canonical API, read-only, rollback, cleanup **gate** | [#5](https://github.com/Ephurin/Novel_sharing_platform/pull/5) – [#9](https://github.com/Ephurin/Novel_sharing_platform/pull/9) | Đã merge; destructive cleanup vẫn BLOCKED |
| Evaluation harness/provenance/context diagnostics | [#10](https://github.com/Ephurin/Novel_sharing_platform/pull/10) – [#25](https://github.com/Ephurin/Novel_sharing_platform/pull/25) | PR đã merge; mỗi experiment có gate/bounds riêng, không đồng nghĩa global model/routing swap |
| Relevance-density rollout/staging | [#26](https://github.com/Ephurin/Novel_sharing_platform/pull/26) – [#33](https://github.com/Ephurin/Novel_sharing_platform/pull/33) | Architecture proposal, opt-in implementation và live evidence controls đã merge; default legacy-v1 |
| Flash-Lite demo/defense | [#34](https://github.com/Ephurin/Novel_sharing_platform/pull/34) – [#38](https://github.com/Ephurin/Novel_sharing_platform/pull/38) | Đã merge; functional/demo feasibility ≠ narrative-quality/reliability guarantee |
| P1/Idea/Outline/Bounded autonomous AI | [#39](https://github.com/Ephurin/Novel_sharing_platform/pull/39) – [#42](https://github.com/Ephurin/Novel_sharing_platform/pull/42) | Đã merge; tái sử dụng canonical P1 loop |
| Author IDE/Story Bible UI | [#43](https://github.com/Ephurin/Novel_sharing_platform/pull/43), [#44](https://github.com/Ephurin/Novel_sharing_platform/pull/44) | Đã merge; UI availability riêng với system E2E |
| Writing loop browser UI | [#45](https://github.com/Ephurin/Novel_sharing_platform/pull/45) | CI_PASS / MERGED theo report |
| Manuscript import UI | [#46](https://github.com/Ephurin/Novel_sharing_platform/pull/46) | CI_PASS / MERGED theo report |
| Author publish → Admin moderation → public | [#47](https://github.com/Ephurin/Novel_sharing_platform/pull/47) | CI_PASS / MERGED theo report |
| Reader discovery/library/history | [#48](https://github.com/Ephurin/Novel_sharing_platform/pull/48) | CI_PASS / MERGED theo report |
| Reader social/comments/preferences | [#49](https://github.com/Ephurin/Novel_sharing_platform/pull/49) | CI_PASS / MERGED theo report |
| Comment user report → Admin review → notifications | [Active branch](https://github.com/Ephurin/Novel_sharing_platform/tree/astra/comment-user-report-admin-moderation-e2e) | **LOCAL_PASS_CI_PENDING** theo branch report; chưa mở PR tại snapshot |

**GitHub Actions tham chiếu:** [P7 Semantic Memory workflow](https://github.com/Ephurin/Novel_sharing_platform/actions/workflows/p7-semantic-memory.yml), [P8 Cutover workflow](https://github.com/Ephurin/Novel_sharing_platform/actions/workflows/p8-cutover.yml), [Evaluation Pilot Harness](https://github.com/Ephurin/Novel_sharing_platform/actions/workflows/eval-pilot.yml). Muốn xác nhận trạng thái mới hơn ngày snapshot, phải đọc đúng workflow run cho PR-head SHA, không suy từ tên branch hay PASS của lần trước.

## 4. Quy tắc ghi lịch sử từ các gate tiếp theo

Tài liệu này là **decision log cô đọng**, không chép lại toàn bộ acceptance report. Khi một gate đã có kết luận remote chính thức, bổ sung một record với cấu trúc:

~~~text
EDR-XX — [Tên quyết định/gate]
Ngày (UTC hoặc local + timezone):
Vấn đề quan sát được:
Nguồn gốc / negative evidence:
Các lựa chọn đã cân nhắc:
Quyết định và lý do:
Phương án không chọn:
Thay đổi production (hoặc chỉ test/docs):
Boundary: LOCAL / CI / MERGED / BLOCKED:
Tested code SHA:
Evidence SHA:
PR, merge SHA, CI run URLs:
Rủi ro còn lại và điều kiện mở gate tiếp theo:
~~~

Quy tắc:
1. Dẫn đường đến PR/commit/report/evidence có thật; không tự tạo SHA hoặc link giả.
2. Không dùng “PASS” chung chung; viết rõ phần nào được đo và phạm vi local/CI/live/staging/demo.
3. Giữ nguyên lỗi phát hiện, các phương án không chọn và lý do không chọn. Review tạo giá trị chính ở những điểm này.
4. Không chỉnh report cũ để xóa dấu vết failed attempt; khi cần, viết erratum hoặc một record mới chỉ đến phiên bản trước.
5. Các gate về migration, destructive cleanup, authentication, provider/API keys cần mô tả riêng mức độ an toàn và approval.
6. Tránh đưa secrets, session/token, nội dung private ngoài những chứng cứ đã được phép lưu vào tài liệu.

## 5. Giới hạn tính đầy đủ của Git

**Git lưu rất tốt những gì đã commit; không tự động lưu những gì đã xảy ra nhưng chưa commit.** Còn thiếu hoặc chưa được kiểm toán toàn diện:

- P1–P3 và một số mốc trước P4: cần lịch sử commit/tag/review bổ sung nếu muốn viết biên niên sử từ lúc dự án khởi tạo.
- Những thử nghiệm local không push, terminal logs bị mất, phiên thất bại trước khi có evidence.
- Quyết định thảo luận trong chat không chuyển thành ADR/report/PR.
- Quá trình ngoài GitHub (ví dụ hồ sơ UI mockup hay khóa học) nếu chưa nằm trong repo.
- GitHub Actions logs/artifacts có chính sách retention riêng; có run URL không đảm bảo log còn xem được mãi.

Khi tái dựng mốc cũ, phân biệt rõ **source-backed fact** với **diễn giải kỹ thuật**. Không điền khoảng trống bằng suy đoán rồi biến thành “official project history”.

---

**Nguồn chuẩn để đào sâu:** [Repository commits](https://github.com/Ephurin/Novel_sharing_platform/commits/main/), [Merged PRs](https://github.com/Ephurin/Novel_sharing_platform/pulls?q=is%3Apr+is%3Amerged), [Development reports](https://github.com/Ephurin/Novel_sharing_platform/tree/main/docs/development), [Current execution handoff](https://github.com/Ephurin/Novel_sharing_platform/blob/main/promt.md).