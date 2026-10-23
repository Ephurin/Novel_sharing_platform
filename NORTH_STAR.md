# Ephurin — Project North Star

> **Loại tài liệu:** tri thức chung cấp sản phẩm, dùng cho người phát triển, reviewer và AI coding agents.  
> **Snapshot cập nhật:** 2026-10-23 (Asia/Bangkok).  
> **Repository:** `Ephurin/Novel_sharing_platform`.  
> **Trạng thái:** living document; phần định hướng ổn định, phần release snapshot phải đối chiếu GitHub mỗi lần quyết định.  
> **Cảnh báo:** tài liệu này KHÔNG phải bằng chứng đã triển khai, không tự cấp quyền merge/deploy/chạy provider thật, không thay thế contract chi tiết hoặc ADR.

## 0. Cách đọc / nguồn sự thật

Không được đánh đồng ý tưởng sản phẩm, contract, source code và bằng chứng nghiệm thu.

| Câu hỏi | Nguồn ưu tiên |
| --- | --- |
| Mục đích, người dùng, giá trị sản phẩm | [AI Copilot Product](ai-service/docs/PRODUCT.md) và North Star này |
| Quyết định kỹ thuật đã chấp nhận | [AI ADRs](ai-service/docs/ADRS.md), [techstack](docs/techstack.md) |
| Hành vi chuẩn P1/P2/P3, HITL, trình tự test | [WORKFLOW_CONTRACT.md v1.4](https://github.com/Ephurin/Novel_sharing_platform/blob/codex/ai-copilot-pipeline-test/Pipeline_test/WORKFLOW_CONTRACT.md); ưu tiên contract này khi tài liệu lịch sử mâu thuẫn |
| Contract FE/Core trên nhánh tích hợp | [INTEGRATION_GATE.md](https://github.com/Ephurin/Novel_sharing_platform/blob/integration/p1-author/docs/development/integration/p1-author/INTEGRATION_GATE.md) và source thực tế tại commit được test |
| Một tính năng đã PASS hay chưa | Code/diff + command/exit + CI + durable readback + evidence gắn **exact tested SHA**; PASS chỉ trong phạm vi test đã chạy |
| Đích release hiện thời | North Star này (định hướng) + trạng thái PR/CI hiện tại (sự thật thời điểm kiểm tra) |

`promt.md` là **historical active-task handoff**, có các verdict và chỉ thị cũ; không dùng một mình để kết luận readiness hiện tại. `promt_.md` trên pipeline-test là prompt test cũ; `Pipeline_test/runs/*` là evidence của từng lần chạy, không phải contract chuẩn. Không viết đè hoặc sửa hồi tố historical RED/gold/evidence.

## 1. North Star — chúng ta xây dựng điều gì?

**Ephurin là nền tảng chia sẻ và sáng tác tiểu thuyết; giá trị khác biệt của AI Writing Copilot là một Author IDE có bộ nhớ truyện dài hạn, có cấu trúc, có provenance và đặt tác giả ở vị trí quyết định cuối cùng.**

Không chỉ là cửa sổ chat sinh văn bản. Hệ thống phải giúp tác giả:
- Khởi tạo từ **bản thảo có sẵn (P1)** hoặc **ý tưởng/thiết lập (P2)**.
- Phát hiện nhân vật, địa danh, tổ chức, quan hệ, sự kiện, trạng thái và quy tắc thế giới; tách **đề xuất chưa duyệt** khỏi **canon đã duyệt**.
- Duy trì Story Brain xuyên nhiều chương; truy xuất context phù hợp với chapter, timeline và kiến thức nhân vật, không nhồi toàn bộ tiểu thuyết vào prompt.
- Lập kế hoạch, tự viết/chỉnh sửa hoặc duyệt gợi ý AI; phát hiện mâu thuẫn có dẫn chứng, sửa rồi tiếp tục trên cùng bản thảo.
- Lưu an toàn và có khả năng phục hồi: không mất sửa đổi do debounce, race, retry, chuyển chapter/account, reload hoặc lỗi mạng.

**Persona AI chính:** tác giả tiểu thuyết dài tập. Reader/Admin/Moderator/Wallet/Publication là phần quan trọng của nền tảng, nhưng không được nhập nhằng acceptance của họ với nghiệm thu AI Copilot.

**North-star user outcome (đích sản phẩm):** một tác giả có thể viết tiếp một truyện dài từ baseline đáng tin cậy, nhìn được bằng chứng cho mọi thay đổi tri thức, duyệt/loại đề xuất và tiếp tục làm việc mà không bị mất bản thảo hay sai lệch Canon âm thầm.

## 2. Những invariant không được phá

1. **Author is source of truth.** AI extraction, suggestions và consistency findings là proposals; generic outbox worker **không có quyền tự phê duyệt Canon**. P3 controller chỉ được ra quyết định trong policy/mode và revision scope được phê duyệt.
2. **Một Story Brain / một writing path được chia sẻ.** P1/P2/P3 hội tụ về cùng revision, writing service, memory và context. Không tạo writer thứ hai, P3-only memory hoặc một kho canon shadow.
3. **Future plan != historical canon.** Outline/objective/gợi ý và author hints không chứng minh sự kiện đã xảy ra; setup extraction không tự tạo fact/event ngoài nguồn.
4. **Entity-before-event/fact khi bật human review.** Hints không phải sightings. Xác minh occurrence từ immutable revision + hash; author review/freeze entity inventory rồi mới event/fact; sau đó vẫn cần Canon review riêng. Checkpoint phải source/tenant/version scoped.
5. **Immutable provenance.** Phân tích/generation gắn `novel_id`, `chapter_id`, `revision_id`, `content_hash`, owner/tenant, pipeline/model/policy version. Không để stale/same-prose replay ghi đè bản nháp mới hoặc accepted-revision identity.
6. **Draft safety.** Ordered chapter writer, Mongo compare-and-swap, expectedVersion/409/428 contract, readback authoritative; UI không báo “saved” chỉ vì local debounce/response cũ.
7. **Async/transactional correctness.** Revision + outbox được gắn bền vững; retry/idempotency, lease và crash recovery. `outbox COMPLETED` trong extraction-only flow nghĩa là giao việc đã hoàn tất, **không mặc nhiên nghĩa là Brain đã được tác giả duyệt/tăng version**.
8. **Fail closed.** Thiếu auth/owner/scope, source hash mismatch, invalid structured output, migration/test DB guard failure hoặc evidence readback lỗi không được đổi thành empty success/PASS.
9. **Không công bố hoặc thanh toán thực vì một lần demo PASS.** P3 controller lưu nháp, không được tự publish. Mock coins/payment không đại diện real-money safety.

## 3. Kiến trúc logic

```text
Novel Platform (identity, author/editor, chapter/revision, publication)
  | canonical IDs, immutable revisions, source hash, ownership
  v
AI Gateway / orchestration  --> durable jobs, service auth, version fences
  |
  v
Narrative AI Service
  |-- P1 manuscript bootstrap / P2 setup extraction
  |-- entity discovery + human entity review checkpoint
  |-- event/fact/state proposal extraction
  |-- author-authorized Canon decisions
  |-- Story Brain event history + approved state projections
  |-- hybrid/structured retrieval + context builder
  |-- planning, generation, consistency, validation
  v
Author IDE --> edit/save --> revision + transactional outbox --> extraction
          --> pending proposal --> authorized review --> approved memory
          --> reload/context --> next author action
```

**Storage responsibility:** Platform sở hữu canonical user/novel/chapter/revision/publishing trong PostgreSQL; MongoDB phục vụ editable drafts; AI narrative data nằm trong PostgreSQL narrative schema, có thể dùng pgvector; Redis nếu có chỉ là cache. Confirmed narrative event/fact là nguồn để dựng projection; projection phải rebuild/versioned. Một thao tác đa DB **không được tuyên bố atomic** khi chưa có cơ chế và bằng chứng tương ứng.

**Stack hiện được tài liệu hóa:** Web React + Vite + Mantine; Reader mobile React Native; backend Node.js; AI-service Python; PostgreSQL/pgvector và MongoDB; Docker/Compose; GitHub Actions. Chỉ thay stack khi có quyết định/benchmark rõ ràng, không vì muốn “giống agent framework”.

**Chiến lược sản phẩm:** ưu tiên workflow typed/orchestrated, đúng memory/retrieval và author control trước khi mở rộng multi-agent. Cấp độ autonomous cao hơn là cột mốc riêng.

## 4. Ba use case AI — không được tráo claim

### P1 — Manuscript / ongoing authoring

```text
Manuscript -> immutable revisions/hash -> entity discovery/verification
 -> author entity review -> event/fact/state proposals
 -> author Canon review -> M0 audit -> activate Story Brain
 -> save new chapter -> incremental extraction -> pending proposals
 -> author review -> approved memory/context -> continue writing
```

Sau baseline active, một thay đổi nội dung được lưu thật phải tuân thủ policy revision/outbox; pre-baseline save chỉ là draft. Phân biệt automatic **extraction** với automatic **Canon acceptance**.

### P2 — Idea/world setup

```text
Explicit setup + optional hints -> explicit entities proposed
 -> author review/approve baseline -> M0 -> Story Plan / future intent
 -> first saved/accepted chapter -> entity gate -> proposals -> Canon
 -> M-FIRST -> same P1 writing loop
```

`mode=extract` không lấy sáng tạo từ `mode=blueprint` làm bằng chứng entity/event đã tồn tại. Future outline không trở thành ký ức quá khứ.

### P3 — Controller and long-form acceptance

```text
Approved baseline + optional plan -> objective -> context -> generate/validate
 -> preview/accept as DRAFT -> revision/extraction
 -> (HITL on) waiting_for_entity_review -> human review + continue
 -> downstream proposals -> authorized Canon decision
 -> objective advancement / stop / next loop
```

Phải phân biệt:
- **`P3_HITL_CONTROLLER_100K`**: gate cuối bắt buộc theo v1.4, có human checkpoints được định lượng; phải hoàn chỉnh **100.000–105.000 đơn vị từ** theo canonical revision readback (NFC + whitespace counter), có ending, provenance, memory audit và blind literary review.
- **`P3_UNATTENDED_AUTONOMOUS_100K`**: claim/nghiệm thu **khác**; chưa có policy auto-review được phê duyệt để thay con người. Không tắt HITL rồi gọi run assisted là fully autonomous.

**P1 MVP release không nhất thiết chờ P3 100k.** Nếu release hẹp, disable/hide P3 chưa đạt và mô tả rõ phạm vi; nếu quảng bá P3 full, giữ gate 100k bắt buộc.

## 5. Chính sách model/context và đánh giá chất lượng

- **Text generation/extraction (target cho future approved live acceptance):** primary `gemini-3.5-flash-lite`; fallback `gemini-3.1-flash-lite` chỉ khi operator chọn minh bạch. **Không dùng Gemini 2.5**, không silent cross-provider/legacy fallback. Đây là chính sách/cấu hình đã xác nhận của dự án, **không phải bằng chứng provider/model hiện có hay chất lượng literary đã PASS**.
- **Embedding:** luồng độc lập với text LLM; target `gemini-embedding-2`, 768-d normalized theo tài liệu hiện hành; đổi embedding model cần đánh giá tương thích index/dữ liệu, versioning và rebuild nếu cần.
- **Context routing:** `CONTEXT_ROUTING_POLICY=legacy-v1` vẫn là baseline production/default lịch sử; thử nghiệm semantic/hybrid/packing mới cần evidence riêng trước khi đổi global default.
- **Vì sao Flash-Lite:** quota/demo practicality, **không phải** mặc định chất lượng văn học cao nhất.
- **Test sequencing:** fake/deterministic providers cho contract & integration; gọi provider thật **chỉ với approval/budget/egress/secrets gate riêng**. S10 UI mock PASS không chứng minh chất lượng consistency của real model.
- **Narrative evaluation:** nguồn truyện/corpus được freeze là ground truth; không nâng suy đoán thành canonical fact. Đo retrieval relevance, entity identity, future leakage, consistency precision/recall, intervention, cost/latency và quality review độc lập.

## 6. Snapshot triển khai & release (2026-10-23; KHÔNG phải evergreen fact)

**Các PR liên quan hiện còn Draft và chưa merge** (cần fetch HEAD lại trước mọi action):

| PR | Branch / HEAD tại snapshot | Đã được chứng minh trong phạm vi riêng | Chưa chứng minh |
| --- | --- | --- | --- |
| [#57](https://github.com/Ephurin/Novel_sharing_platform/pull/57) | `integration/p1-author` — `4c8bd3e` | Selected Core + Author Workspace ports; báo cáo local S09 browser, S10 mocked UI/offline Gateway, S11 reload; P7 CI PASS | P8 trên integration HEAD FAIL; full updated composite + live P1 acceptance chưa PASS |
| [#58](https://github.com/Ephurin/Novel_sharing_platform/pull/58) | `gemini/p1-ci-isolation` — `29b029a` | CI isolation, F-06/F-09/F-10, cleanup guard; lifecycle 17/17, latest P8 GitHub CI 7/7 PASS | Chưa hợp nhất với #59/#60; reviewer còn yêu cầu strict malformed readback và outbox-only ownership/verification (F-11/F-12) |
| [#59](https://github.com/Ephurin/Novel_sharing_platform/pull/59) | `codex/p1-core-reconciliation` — `a41d8ba` | Stale semantic replay/CAS/provenance repair; tested source 137 PASS/3 FAIL | Ba Canon policy HTTP rows vẫn FAIL trên riêng nhánh này; kết quả combined chưa có |
| [#60](https://github.com/Ephurin/Novel_sharing_platform/pull/60) | `codex/p1-canon-hitl-gate` — `6008fd4` | Worker extraction-only; pending proposals và explicit review; offline root-compose smoke 62/62 checkpoint PASS | P8 riêng nhánh FAIL do test setup/CI isolation; HITL entity routes, /memory và combined #59 chưa đóng |

**CI examples at snapshot:** #58 P8 success [39922125240](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39922125240); #57 P8 failure [39902374069](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39902374069); #60 P8 failure [39917857204](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39917857204). **Không cộng PASS từ các SHA khác nhau thành combined PASS.**

**Blockers kỹ thuật đã thấy:** (a) gom PR #58/#59/#60 trên cùng source SHA và rerun P7/P8/DB/browser, (b) AI-layer `/memory` và entity candidate audit/review/continue routes còn 404 trong PR60 audit, (c) `waiting_for_entity_review`/resume controller HITL state chưa được chứng minh trên integration, (d) S09–S11 end-to-end trên *combined source* chưa đạt, (e) bounded real-model/embedding acceptance chưa chạy, (f) production ops: backups/restore, observability/alerts, rate limits, quota failure, secret handling, rollback/upgrade, isolation/security và pilot chưa được nghiệm thu toàn diện.

**Production-readiness interpretation:** P1 architecture/implementation có tiến triển đáng kể; **production approval = NOT_GRANTED**. Các con số phần trăm readiness được thảo luận chỉ là ước lượng chủ quan, không phải test coverage, KPI hay release criterion. Các PASS trước đây trên `main` và các nhánh lịch sử thuộc đúng scope/date/code của chúng; không chứng minh contract HITL mới.

## 7. Lộ trình release ưu tiên theo dependency

1. **Khép PR #58:** strict malformed PG readback must fail closed; quyết định contract outbox-only ownership; negative tests + source SHA + evidence + P8 7/7. Independent review rồi mới được xét hợp nhất với integration.
2. **Tích hợp thử riêng PR #59 + #60:** selective ports, conflict matrix và regression kết hợp; không full-merge 300+ files/evidence. Chứng minh persistence + Canon policy trên một source.
3. **Ghép vào `integration/p1-author`** sau khi source review; combined fresh PG/Mongo + AI Alembic/backend SQL (bao gồm cả hai filename 012) + P7/P8, 401/403/409/428, provenance/hash, outbox, retries.
4. **Hoàn thiện route/state P1/HITL:** memory export DTO; entity guidance/audit/review/continue và checkpoint freeze/resume. Không thay bằng direct SQL, context-preview alias hoặc bypass flag.
5. **Full mounted Author IDE S09–S11:** rapid Undo B→A→B, in-flight, 409/two tabs, account/chapter isolation; bootstrap, entity gate, proposals, explicit Canon review, live DB readback, consistency correction, reload/continue. Tách UI-mocked, offline-Gateway và real-provider evidence.
6. **Security & operations:** browser Reader/Author/Admin, VIP/privacy/moderation; tenant isolation; migration upgrade/replay, restore/rollback, load/quota/error/secret handling; thực hiện controlled pilot.
7. **Bounded live quality acceptance** với model text & embedding được phê duyệt trước khi công bố AI capability thực; nếu chỉ launch P1 thì khóa P3 unfinished feature flags. P3 100k terminal gate triển khai riêng khi P1/P2 functional đủ chuẩn.

**Release stages:** `INTERNAL_OFFLINE_CANDIDATE` -> `CONTROLLED_LIVE_P1_BETA` -> `LIMITED_PUBLIC_P1` -> `FULL_P3_100K_ACCEPTANCE`. Không tự nâng cấp stage theo tỉ lệ test pass hoặc lời khai agent.

## 8. Quy tắc giao việc giữa người và AI

| Vai trò | Sở hữu công việc phù hợp | Không được tự làm |
| --- | --- | --- |
| Codex (model operator chọn, ví dụ Sol 6.1) | Cross-module source reasoning: CAS, revision/outbox, provenance, Canon authority, HITL state/API architecture | Merge/deploy hoặc sửa source/branch ngoài phạm vi |
| Gemini local (model operator chọn, ví dụ Flash 3.8) | Docker, DB isolation, CI, Playwright, reproducible E2E, fault injection và evidence | Gọi real provider thiếu approval; sửa production policy chỉ để test xanh |
| GPT-6 reviewer | Diff/commit, contract/source review, GitHub Actions/logs, xác định scope & gate, phân công tiếp | Tự coi local PASS = CI PASS; tự phê duyệt merge khi chưa có bằng chứng |
| Chủ dự án | Sản phẩm, ngân sách, policy, data/privacy, risk tolerance và quyết định release cuối | Không áp dụng |

**Worktree/branch safety:** một agent/branch, chỉ commit được phép; no `main`/shared resource mutation ngoài phạm vi; không `reset --hard`, force push, destructive cleanup, hoặc overwrite historical evidence. Tách commit code/test khỏi commit evidence. Không gửi API keys, JWT, cookies, secrets trong log/PR.

**Mẫu báo cáo bắt buộc:** branch & parent/base SHA; tested source SHA; changed files & contract decisions; exact commands/exits; PASS/FAIL/BLOCKED/NOT_RUN; CI run URL/conclusion; PG/Mongo/Canon authoritative readbacks; provider/model thực dùng (fake vs live); resource cleanup; blockers/owners; verdict. Reviewer kiểm chứng trên GitHub độc lập.

## 9. Definition of Done cho một feature / gate

Chỉ đánh `PASS` nếu:
- Contract đúng và test đỏ/trắng có khả năng bắt regression; không sửa test để che lỗi.
- Code chạy trên đúng source SHA và môi trường được khai báo; migration/secret/provider và scope được kiểm chứng.
- Tests thực sự chạy (không skip/cancel/parent failure), kết quả liên quan có readback bền vững; UI PASS chỉ nếu thao tác UI đã được thực thi.
- Security/authz/fail-closed, retry/replay và negative cases không suy giảm.
- Evidence có thể lần lại từ commit -> command -> CI/job/run -> resource IDs/hash.
- Reviewer độc lập phê duyệt đúng phạm vi. `READY_FOR_REVIEW` và `MERGED` **không** đồng nghĩa `PRODUCTION_READY`.

## 10. Quy tắc duy trì tài liệu này

- Chỉ cập nhật **snapshot** khi đã đọc HEAD/PR/CI mới; ghi ngày và pin nguồn, không ghi status vô thời hạn.
- Contract chi tiết thay đổi phải có owner approval/ADR hoặc cập nhật `WORKFLOW_CONTRACT.md`, rồi mới tóm tắt ở North Star.
- Khi có bằng chứng trái chiều, ghi cả hai SHA/run, ưu tiên kết quả đúng nhánh/phiên bản/môi trường. Không “hợp thức hóa” lịch sử bằng sửa verdict cũ.
- Những thay đổi không liên quan AI Copilot (ví dụ Reader/Wallet) có thể phát triển riêng; vẫn phải giữ security, privacy, migration và release gate chung.
- North Star là **bản đồ tri thức + ý định**, không phải nguồn giả lập trạng thái thực thi. Luôn kiểm tra code và evidence trước khi giao việc hay ra quyết định.
