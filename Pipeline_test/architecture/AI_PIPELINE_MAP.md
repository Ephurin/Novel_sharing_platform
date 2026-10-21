# AI pipeline — map nguồn và tiêu chí đóng lỗi

> **HISTORICAL GENERATED SNAPSHOT (2026-10-20).** This file's `[ok]`/`[mixed]`/`[bad]` flags and issue statuses were produced from `94d5072 + working tree`, not the newer Wave 1B/1C/1D code. They are **not** current live UI/provider acceptance. Current behavioral source is [WORKFLOW_CONTRACT.md v1.4](../WORKFLOW_CONTRACT.md); see [CURRENT_DELTA_2026-10-21.md](CURRENT_DELTA_2026-10-21.md) and [current architecture](../../ai-service/docs/ARCHITECTURE.md). Preserve historical evidence rather than silently changing old status flags. Regenerate only after independent Wave 1D evidence review.

Snapshot: 2026-10-20T22:59:06.422946+07:00; HEAD 94d5072a5e1bacc1534d84b4ca49ee97c6cfec7f + working tree.

Canonical author workflow: input, revision, extraction, review, canon, context, writing, autonomous control, acceptance; platform publish shown as boundary. Legacy endpoints not individually inventoried.

Không phải cam kết mọi nhánh đã test. live = tái hiện, gap = thiếu từ code/giới hạn suy ra, untested = chưa chạy live, mixed = guard/function test một phần, proposal = chưa triển khai.

Run nguồn: `Pipeline_test/runs/2026-10-19-recovery-ui-01/REPORT.md`. 15/35 là assertions gold, không phải entity recall. Không có guarantee đã tìm mọi defect.

## A · Nguồn vào · P1 / P2

Hai nhánh đầu vào; P3 vào vòng G sau khi có brain/baseline

### A01 · P1 · Nhập/chọn bản thảo [ok]

- Input: Chương nháp hoặc đã xuất bản
- Output: Draft chương; chưa phải memory
- Control: UI lưu; import không tự đồng nghĩa extraction
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Readback khớp fixture và đúng thứ tự chương.
- Source: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`
- Next: A02

### A02 · Bấm trích xuất lần đầu [ok]

- Input: Các chương đã lưu
- Output: Revision manifest cho bootstrap
- Control: UI snapshot purpose=MANUSCRIPT_BOOTSTRAP từng chương; hash và IDs
- Issues: CHUNKING-GAP
- Gate đề xuất: Chỉ lấy nội dung đã lưu; không trùng generic outbox bootstrap.
- Source: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`
- Next: A03

### A03 · Tạo job nhập bản thảo [ok]

- Input: Novel/revision IDs, options
- Output: Job queued; brain importing
- Control: Validate limit/source, identity/idempotency; lưu job durable
- Issues: OBSERVABILITY
- Gate đề xuất: Restart/resume tiếp tục đúng chương, không nhập lại chương completed.
- Source: `ai-service/application/bootstrap_service.py`
- Next: A04

### A04 · Lần lượt phân tích từng chương [mixed]

- Input: Immutable revision manifest
- Output: Proposal groups mỗi revision
- Control: Lần lượt từng revision; flagON dừng waiting_entity_review trước event/fact, resume giữ chương/checkpoint; scene_count chỉ đếm.
- Issues: CHUNKING-GAP, ENTITY-HITL, STATE-OPTIONS
- Gate đề xuất: Đủ toàn bộ chương; schema success tách semantic coverage.
- Source: `ai-service/application/bootstrap_service.py`
- Next: C01

### A05 · P2 · Nhập ý tưởng/thiết lập [code]

- Input: Setup, constraints; outline/preferences tùy mode
- Output: Nguồn setup riêng
- Control: UI gọi mode=extract; backend còn blueprint mode
- Issues: P2-UNTESTED
- Gate đề xuất: Không biến future outline thành history.
- Source: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`
- Next: A06, A07

### A06 · Extract setup đã cung cấp [code]

- Input: Idea + constraints + optional guidance
- Output: Tên nhân vật/địa danh explicit
- Control: Hints hỗ trợ tìm tên; nguồn setup mới chứng minh presence; không invent event/rule. P2 vẫn entity proposals → review, không phải chunk pipeline của revision.
- Issues: P2-UNTESTED, ENTITY-COVERAGE
- Gate đề xuất: Tách prior death/uncertain; preservation các trường setup; P2 live riêng.
- Source: `ai-service/application/bootstrap_service.py`
- Next: A08

### A07 · Blueprint generation tùy API mode [code]

- Input: Idea/outline/preferences/constraints
- Output: Premise/world rules/entities đề xuất
- Control: Chỉ nhánh mode=blueprint; có đường fallback nếu cấu hình cho phép
- Issues: P2-UNTESTED, OBSERVABILITY
- Gate đề xuất: Phân biệt invented/author-supplied; UI extract không được chạy nhầm nhánh này.
- Source: `ai-service/application/bootstrap_service.py`
- Next: A08

### A08 · Setup proposals → review → baseline [code]

- Input: Entities + premise/constraints/facts theo mode
- Output: Brain đã duyệt; còn thiếu prose đầu tiên
- Control: Setup không có chapter quote như P1; lưu provenance dạng nguồn idea
- Issues: P2-UNTESTED
- Gate đề xuất: Duyệt xong mở writing chương đầu; kiểm tra M0/M-FIRST riêng.
- Source: `ai-service/application/bootstrap_service.py`
- Next: D06, F01

## B · Lưu chương · revision · outbox

P1/P2 sau baseline và AI accept; nguồn bền vững trước extraction

### B01 · Editor và autosave [ok]

- Input: Title/content/access fields
- Output: PATCH draft sau debounce
- Control: UI debounce1200ms; save serial theo chapter; owner/auth
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Expired session có lỗi rõ; UI đã lưu phải khớp server.
- Source: `web/src/features/author-ide/AuthorWritingIde.tsx`
- Next: B02

### B02 · Lưu draft Mongo + metadata [ok]

- Input: PATCH nội dung tác giả
- Output: Draft version và chapter metadata
- Control: Owner check; draft và published content phân biệt
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Đọc draft thật, không coi PostgreSQL content null là mất văn.
- Source: `backend/src/modules/novels/chapters.service.ts`
- Next: B03

### B03 · Brain active + baseline? [ok]

- Input: Novel brain state
- Output: Có→snapshot tự động; chưa→chỉ draft
- Control: snapshotSavedChapter chỉ chạy khi active và có baseline_revision_id
- Issues: P2-UNTESTED
- Gate đề xuất: Import đầu cần explicit bootstrap; sau baseline save content tự phân tích.
- Source: `backend/src/modules/novels/chapter-revisions.service.ts`
- Next: B04

### B04 · Chốt revision và content hash [ok]

- Input: Nội dung nguồn chuẩn
- Output: Immutable revision/latest pointer
- Control: Hash/no-op dedup; transaction/lock; bootstrap purpose riêng
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Hash/Unicode đúng; hai saves không mất head; cùng body không nhân revision.
- Source: `backend/src/modules/novels/chapter-revisions.service.ts`
- Next: B05

### B05 · Ghi durable outbox [ok]

- Input: Revision mới sau active
- Output: INCREMENTAL_ANALYSIS event
- Control: Revision/event uniqueness; trigger worker; AI accept có source_generation_id
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Crash sau commit vẫn còn job; không tạo canon trước review.
- Source: `backend/src/modules/novels/chapter-revisions.service.ts`
- Next: B06

### B06 · Worker claim + gọi analysis [mixed]

- Input: Pending outbox; claim token/lease
- Output: HTTP analysis; completed hoặc retry
- Control: Tick5s; một batch handler; Idempotency-Key=analysis-revision; max_retries mặc định5
- Issues: PROVIDER-503-001, SNAPSHOT-GAP
- Gate đề xuất: Stale claim không overwrite; retry/backoff/recovery quan sát được.
- Source: `backend/src/jobs/outbox-processor.ts`
- Next: C01, J04

### B07 · Mongo sync fallback khi cần [code]

- Input: Revision đã commit nhưng draft sync lỗi
- Output: MONGO_DRAFT_SYNC retry
- Control: Conditional sync tránh đè draft tác giả mới hơn
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Fault injection sync lỗi; phục hồi không mất newer draft.
- Source: `backend/src/modules/novels/chapter-revisions.service.ts`
- Next: B02

## C · Extraction nội dung · nhiều lượt LLM

Flag ON: discovery entity chia đoạn và human gate X trước event/fact; event/fact/coverage vẫn toàn chương. Flag OFF: legacy.

### C01 · Đọc revision, kiểm tra hash [ok]

- Input: Tenant/novel/chapter/revision/hash
- Output: Prose và provenance chuẩn
- Control: Không đọc editor mutable; SHA256/ownership/source_scope
- Issues: SNAPSHOT-GAP, OBSERVABILITY
- Gate đề xuất: Wrong source/hash bị từ chối; call trace gắn đúng revision.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: C02

### C02 · Analysis run và khóa idempotency [mixed]

- Input: Operation/options/key/input hash
- Output: Run/group IDs hoặc proposals đã có
- Control: Nếu run đã có proposals thì trả deduplicated; manual reanalyse key mới
- Issues: GATEWAY-KEY
- Gate đề xuất: Retry action không duplicate; reanalysis mới phản ánh canon mới.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: C13

### C03 · Legacy: LLM trích entity toàn chương [mixed]

- Input: TOÀN prose chương
- Output: PER/LOC/ORG/ITEM/SKILL + confidence/status
- Control: Chỉ đường flagOFF; một lượt LLM + parse/schema/score; flagON đi X08→X01→X02→X03→X09.
- Issues: ENTITY-COVERAGE, ENTITY-HOMONYM, CHUNKING-GAP
- Gate đề xuất: Gold entity/mention riêng, đo omission và false positives.
- Source: `ai-service/services/entity_pipeline/pipeline.py`
- Next: C04

### C04 · Ground tên và status [mixed]

- Input: Tên/quote status từ LLM
- Output: Entity proposals có evidence
- Control: Legacy dùng find_mention; human-review dùng verified occurrence offsets. Status không Unknown phải có quote; entity vẫn proposal, chưa canon.
- Issues: ENTITY-HOMONYM, GROUNDING-GUARD
- Gate đề xuất: Xét occurrence/context, không gắn An vào an toàn; status có nguồn.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: C05

### C05 · Tạo danh sách known entities [mixed]

- Input: Legacy proposals hoặc inventory đã được tác giả review
- Output: Names cấp cho event/fact extractor
- Control: FlagON chỉ names/aliases đã review; unknown downstream mở lại entity gate, không tự sinh entity; registry không query từng tên.
- Issues: ENTITY-HITL, EXTRACT-SUBJECT-UNRESOLVED-001
- Gate đề xuất: Tên sai không lan xuống facts/events; alias/canonical IDs rõ.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: C06

### C06 · LLM trích sự kiện [mixed]

- Input: TOÀN prose + known entity names
- Output: Event/participants/location/summary/consequences
- Control: Schema; significant events involving supplied entities; quote grounding; quote lỗi có thể skip event
- Issues: MEM-CRITICAL-001, GROUNDING-GUARD
- Gate đề xuất: Event bỏ qua được thống kê; participants có mặt thật; negation/report preserved.
- Source: `ai-service/services/event_summarizer.py`
- Next: C07, X10

### C07 · LLM trích atomic facts [bad]

- Input: TOÀN prose + names
- Output: Subject/key/value/certainty/quote
- Control: Tuổi/số lượng/identity/possession/limits/history; typed values
- Issues: MEM-CRITICAL-001, EXTRACT-ROLE-CONFUSION-001, EXTRACT-SUBJECT-UNRESOLVED-001
- Gate đề xuất: Đúng subject/certainty/knowledge boundary; mọi critical assertion có evidence.
- Source: `ai-service/services/prose_facts.py`
- Next: C08, X10

### C08 · LLM rà facts còn thiếu [bad]

- Input: TOÀN prose + extracted facts
- Output: Bổ sung facts thiếu, không lặp
- Control: review_fact_coverage; cùng chuỗi provider, không phải reviewer độc lập
- Issues: MEM-CRITICAL-001, ENTITY-COVERAGE
- Gate đề xuất: Coverage đủ theo gold; không gọi bước này là entity coverage review.
- Source: `ai-service/services/prose_facts.py`
- Next: C09

### C09 · Ground facts + loại trùng exact [mixed]

- Input: Fact quote + original prose
- Output: Span/hash/quote chuẩn; distinct facts
- Control: Exact/unique whitespace match; tối đa2 quote repairs; unresolved fact fail analysis
- Issues: GROUNDING-GUARD, MEM-CRITICAL-001
- Gate đề xuất: Unicode offsets và unique span; cùng nghĩa khác câu chưa được coi auto dedup.
- Source: `ai-service/services/source_grounding.py`
- Next: C10

### C10 · Đóng gói proposals và certainty [bad]

- Input: Entities/events/facts; optional explicit rules
- Output: Group cùng analysis/source/version
- Control: Confirmed+subject có subject_entity_name; uncertain value giữ attribution; regex Luật:/Rule: tùy option
- Issues: EXTRACT-SUBJECT-UNRESOLVED-001, EXTRACT-ROLE-CONFUSION-001
- Gate đề xuất: Resolve subject trước materialize; không nâng hypothesis thành state.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: D01

### C11 · LLM trích state transitions tùy mode [mixed]

- Input: Event mới/thay đổi + event source quotes
- Output: State-transition proposals cùng group
- Control: Bootstrap bật; incremental default tắt; skip reuse/retired events
- Issues: STATE-OPTIONS, EXTRACT-ROLE-CONFUSION-001
- Gate đề xuất: Đồng nhất contract mode; không suy diễn defaults; chỉ participant chính xác.
- Source: `ai-service/services/state_transition_proposals.py`
- Next: C12

### C12 · Lưu proposals cuối analysis [mixed]

- Input: Toàn nhóm đã qua reconciliation/transition
- Output: Pending proposals trong DB
- Control: save_proposals ở cuối; upstream unresolved không lưu partial group
- Issues: REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Fault ở giữa không để partial canon/proposals; success rỗng có lý do.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: D05

### C13 · Chọn đường legacy hay human review [code]

- Input: Flag + extract_entities option + immutable revision
- Output: OFF→legacy; ON→entity review gate
- Control: Mặc định OFF; UI báo rõ khi server chưa bật. P2 setup có hints và review entity riêng; P1/P3 revision dùng gate X
- Issues: ENTITY-HITL
- Gate đề xuất: Migrations/code/config phải đồng bộ; outbox delivered không đồng nghĩa downstream analysis completed.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: C03, X08

## D · Đối chiếu canon · review · quyết định

Canon comparison trước persist; human approval mặc định, auto approval chỉ P3

### D01 · Lấy canon cũ của cùng chương [mixed]

- Input: Active approved facts/events + source cũ
- Output: Approved targets và evidence so sánh
- Control: Không có prior cùng chương thì đánh dấu empty base, bỏ qua LLM comparison
- Issues: REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Không nhầm occurrence từ chương khác; provenance cũ giữ được.
- Source: `ai-service/services/canon_reconciliation.py`
- Next: D02

### D02 · LLM chọn new / reuse / replace / remove [bad]

- Input: Current prose + candidates + prior targets
- Output: Decision cho từng event/fact candidate
- Control: Phải đủ mỗi candidate; reuse cùng occurrence; remove không vì missed extraction
- Issues: REANALYSIS-LIVE-UNRESOLVED-001, MEM-CRITICAL-001
- Gate đề xuất: Repeated action distinct không merge nhầm; same occurrence không nhân đôi.
- Source: `ai-service/services/canon_reconciliation.py`
- Next: D03

### D03 · Validate decision + bounded repair [mixed]

- Input: Decision IDs/type/target claims
- Output: Valid mapping hoặc actionable422 attempts3
- Control: Many-reuse cùng target được phép; conflicting replace/reuse/removed bị chặn
- Issues: REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Không tự đổi invalid comparison thành new; tests guard và live feature tách verdict.
- Source: `ai-service/services/canon_reconciliation.py`
- Next: C11, C12, J04

### D04 · Phân tích lại qua UI/gateway [mixed]

- Input: Latest saved revision + thao tác mới
- Output: Analysis mới theo canon hiện tại
- Control: Key scoped/hash; retry cùng action giữ key; content saved required
- Issues: GATEWAY-KEY, REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Không thiếu header; key đúng scope; nguyên nhân error hiển thị actionable.
- Source: `backend/src/modules/ai/ai-gateway.controller.ts`
- Next: C01

### D05 · Hiện queue / quote / revision / reuse [ok]

- Input: Pending proposals; extraction status
- Output: Nhóm chờ review, tách official tabs
- Control: Queue0 không có nghĩa extraction COMPLETED; hiển thị outbox status
- Issues: SNAPSHOT-GAP, PROVIDER-503-001
- Gate đề xuất: Nhóm và nguồn cũ/mới rõ; không UI success khi latest analysis còn pending.
- Source: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`
- Next: D06

### D06 · Tác giả sửa / loại / duyệt nhóm [mixed]

- Input: Payload/quote + quyết định tác giả
- Output: Decision audit + edited payloads
- Control: Chỉ xóa staged edits của nhóm vừa approve, giữ nhóm khác; numeric/object edit vẫn cần live retest.
- Issues: REVIEW-EDITS-RESET-001, EXTRACT-SUBJECT-UNRESOLVED-001
- Gate đề xuất: Giữ edits nhóm khác; sửa typed facts an toàn; ghi riêng raw/corrected.
- Source: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`
- Next: D07

### D07 · Guard stale source và version [mixed]

- Input: Proposal IDs + expected brain version
- Output: Accept hoặc409 conflict/stale
- Control: Gateway kiểm source latest; repo lock/version/reconciliation-base refs
- Issues: SNAPSHOT-GAP
- Gate đề xuất: Stale group bị chặn đã live; hoàn tất overlapped saves/dedup regression.
- Source: `backend/src/modules/ai/proposal-evidence.service.ts`
- Next: D08

### D08 · Materialize trong transaction [mixed]

- Input: Approved group, edited values
- Output: Entities/facts/events/transitions + decisions
- Control: Entity normalized-name reuse; canon reuse không insert; replace giữ history; projection resolve subject
- Issues: EXTRACT-SUBJECT-UNRESOLVED-001, ENTITY-COVERAGE
- Gate đề xuất: Unknown/ambiguous subject không partial commit; rollback và feedback sửa được.
- Source: `ai-service/infrastructure/postgres_narrative_repository.py`
- Next: D09, E01

### D09 · Baseline active / brain version tăng [ok]

- Input: Các nhóm đã review; bootstrap job
- Output: Baseline revision và active brain
- Control: Bootstrap chỉ activate sau required review; incremental approval tăng version
- Issues: MEM-CRITICAL-001
- Gate đề xuất: Active không đồng nghĩa semantic quality PASS; M0 audit trước generate.
- Source: `ai-service/application/bootstrap_service.py`
- Next: E01

## E · Memory · embeddings · context

Canon là nguồn; semantic memories là dữ liệu dẫn xuất, không thay thế canon

### E01 · Official structured memory [mixed]

- Input: Canon + projection sau duyệt
- Output: Entities/aliases/facts/events/current states
- Control: Pending không dùng làm truth; active/superseded history phân biệt
- Issues: MEM-CRITICAL-001, ENTITY-COVERAGE
- Gate đề xuất: Đối chiếu source assertions, alias và current-state order; reload còn dữ liệu.
- Source: `ai-service/domain/projection.py`
- Next: E02, E04

### E02 · Derived event chunks + embeddings [code]

- Input: Approved active event summaries
- Output: Memory chunks/vectors theo version/hash
- Control: Refresh nền nếu materializer enabled; reuse embedding hash; retire derived chunks
- Issues: SEMANTIC-UNVERIFIED
- Gate đề xuất: Failure không giả vờ semantic ready; rebuild đúng; đây không phải chunk prose extraction.
- Source: `ai-service/application/semantic_memory_service.py`
- Next: E03

### E03 · Semantic retrieve + hybrid ranking [code]

- Input: Instruction/selected text query + cutoff
- Output: Ranked memories + retrieval/fallback trace
- Control: Tenant/cutoff filter; vector version; optional hybrid; fallback rõ
- Issues: SEMANTIC-UNVERIFIED, CONTEXT-COVERAGE
- Gate đề xuất: Trace candidates/retrieved vs selected; future/other-tenant không rò.
- Source: `ai-service/application/semantic_retriever.py`
- Next: E05

### E04 · Lấy structured context theo cutoff [mixed]

- Input: Chapter/character + approved memory
- Output: Entities/states/recent events/rules/plans
- Control: Cutoff và active canon; plans/current objective giữ trường riêng
- Issues: CONTEXT-COVERAGE, MEM-CRITICAL-001
- Gate đề xuất: Temporal/knowledge boundaries, plan không thành history; cutoff5/6 khác request.
- Source: `ai-service/application/writing_service.py`
- Next: E03, E05

### E05 · Chọn legacy pack hoặc balanced scope [code]

- Input: Structured package + semantic signals
- Output: Scoped package/routing path
- Control: Balanced chỉ khi đủ policy/signals, default request shape; fallback legacy khi không eligible
- Issues: CONTEXT-COVERAGE, SEMANTIC-UNVERIFIED
- Gate đề xuất: Log effective routing; không áp kết quả fixed4k probe cho mọi generation.
- Source: `ai-service/application/writing_service.py`
- Next: E06

### E06 · Token packing và budget tiers [mixed]

- Input: Scoped artifacts và budget
- Output: Whole selected artifacts + dropped IDs/estimates
- Control: Legacy default12000; balanced thử12/16/20/24k full-fit, quá24k thì fail
- Issues: CONTEXT-COVERAGE
- Gate đề xuất: Query-specific critical context không bị bỏ âm thầm; estimator không phải billed token.
- Source: `ai-service/application/context_budget.py`
- Next: E07

### E07 · Đóng prompt context và context hash [mixed]

- Input: Selected context + brain version
- Output: Payload đưa writing LLM + trace IDs/hash
- Control: Hash exact packed context; selected/dropped/route metadata
- Issues: OBSERVABILITY, CONTEXT-COVERAGE
- Gate đề xuất: Chứng minh prompt đã gửi, tách context preview với actual request; che secrets.
- Source: `ai-service/application/writing_service.py`
- Next: F05

### E08 · Memory tabs + reload + audit [mixed]

- Input: Official DB/context + source gold
- Output: M0/M-FIRST/FINAL findings
- Control: 35 gold đã audit;70 rows trên2 context requests; không independent review
- Issues: MEM-CRITICAL-001, CONTEXT-COVERAGE
- Gate đề xuất: Mỗi checkpoint có raw/persisted/context/provenance và issue IDs; không count-only.
- Source: `Pipeline_test/runs/2026-10-19-recovery-ui-01/MEMORY_AUDIT.md`
- Next: H02

## F · Định hướng · viết · kiểm tra · accept

Vòng tác giả dùng chung P1/P2, P3 gọi cùng các service

### F01 · Gợi ý future events từ canon [ok]

- Input: Approved memory + direction
- Output: Future suggestions, chưa thành history
- Control: author_operation suggest_events; không lấy pending proposals
- Issues: P2-UNTESTED
- Gate đề xuất: P1 đã sửa1/bỏ1; canon count không tăng do gợi ý.
- Source: `ai-service/application/author_workflow.py`
- Next: F02

### F02 · Tác giả chỉnh/lưu/activate plan [ok]

- Input: Selected future events + target/min words/ending
- Output: Versioned plan/objectives
- Control: Có UI add/drop/edit; active run hạn chế sửa plan
- Issues: P3-UNTESTED
- Gate đề xuất: Plan version và current objective bền sau reload; chưa thành fact đã xảy ra.
- Source: `web/src/features/ai-copilot/author-memory-api.ts`
- Next: F03

### F03 · Yêu cầu viết / sửa / tiếp diễn [ok]

- Input: Instruction/style/constraints + selection/revision
- Output: Writing job queued
- Control: Saved-source/hash/idempotency; pin expected brain/version; offset selection
- Issues: WRITE-INVALID-JSON-001, SNAPSHOT-GAP
- Gate đề xuất: Chỉ dùng revision tương ứng nội dung editor; no-op/duplicate action xử lý đúng.
- Source: `ai-service/application/writing_service.py`
- Next: F04

### F04 · Recheck brain + chuẩn bị context [mixed]

- Input: Queued writing job
- Output: Pinned context hoặc STALE_BRAIN_VERSION
- Control: Không dùng brain mới âm thầm; query từ instruction+selected text
- Issues: CONTEXT-COVERAGE, OBSERVABILITY
- Gate đề xuất: Thay memory khi job chờ phải conflict; đủ trace source/request.
- Source: `ai-service/application/writing_service.py`
- Next: E04

### F05 · LLM sinh draft + patch [bad]

- Input: Selected prose + packed memory + instructions
- Output: Draft text/patch/model info
- Control: Writing có nhánh unstructured; parse JSON thất bại có thể fallback raw
- Issues: WRITE-INVALID-JSON-001, PROVIDER-503-001, OBSERVABILITY
- Gate đề xuất: Invalid/truncated output fail-closed, không nhận JSON envelope thành prose.
- Source: `ai-service/core/llm_service.py`
- Next: F06

### F06 · Validation draft và patch [bad]

- Input: Draft/patch + context
- Output: Validation list/status, completed job
- Control: Bounds/empty + dead-action/world-rule heuristics; không phải full literary verifier
- Issues: WRITE-INVALID-JSON-001, VALIDATION-SCOPE
- Gate đề xuất: Parse/finish/schema/patch/semantic checks có verdict riêng; Unicode offsets; no false assurance.
- Source: `ai-service/application/writing_service.py`
- Next: F07

### F07 · UI xem / bỏ / chấp nhận AI draft [bad]

- Input: Completed job + validations
- Output: Reject hoặc accept request
- Control: Run đã reject output lỗi; accept branch của run NOT_RUN
- Issues: WRITE-INVALID-JSON-001, VALIDATION-SCOPE
- Gate đề xuất: Không accept khi output invalid; wording nói đúng validator đã chạy.
- Source: `web/src/features/ai-copilot/WritingAssistantPanel.tsx`
- Next: F08

### F08 · Server verify rồi apply patch [code]

- Input: Generation ID, latest chapter revision
- Output: AI_DRAFT_ACCEPT revision + source_generation_id
- Control: Fetch trusted generation; validation/freshness/chapter/bounds/no-op/idempotency guards
- Issues: WRITE-INVALID-JSON-001, SNAPSHOT-GAP
- Gate đề xuất: Fault injection + live valid accept; same generation không apply2lần; lỗi parse không lọt server.
- Source: `backend/src/modules/novels/chapter-revisions.service.ts`
- Next: B05, F09

### F09 · Extraction sau lưu → review memory [mixed]

- Input: Manual save hoặc accepted AI revision
- Output: New pending proposals → updated canon
- Control: Chung B/C/D; P1 human review, P3 auto review
- Issues: MEM-CRITICAL-001, REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Latest prose phản ánh vào memory; không nhầm author text với AI output.
- Source: `ai-service/application/writing_service.py`
- Next: B01, E08

### F10 · Consistency check riêng [ok]

- Input: Saved draft + approved memory
- Output: Findings quote + revision ID, không sửa canon
- Control: Ground findings bằng exact quote/revision; run An40→19 đã positive/negative pass
- Issues: PROVIDER-503-001, VALIDATION-SCOPE
- Gate đề xuất: Không báo quá khả năng; test thêm negation/reported/alias/temporal contradictions.
- Source: `ai-service/application/author_workflow.py`
- Next: B01

### F11 · Tác giả đề xuất sửa memory/history [code]

- Input: Source revision/quote hoặc event correction
- Output: Reviewable correction proposal
- Control: Không sửa DB trực tiếp; source/quote/expected version; replacement giữ history
- Issues: EXTRACT-SUBJECT-UNRESOLVED-001, SNAPSHOT-GAP
- Gate đề xuất: Sai canon sửa qua UI và reproject không che contradiction nguồn.
- Source: `web/src/features/ai-copilot/AuthorMemoryRepair.tsx`
- Next: D05

## G · P3 · Full auto orchestration

Có code nhưng recovery run P3 NOT_RUN; không dùng quyền publish

### G01 · Bật full auto + tìm/tạo plan [code]

- Input: Active brain + optional plan
- Output: Durable autonomous run/plan
- Control: Nếu thiếu plan: suggest through ending, validate future chapter, save/activate
- Issues: P3-UNTESTED
- Gate đề xuất: Có/không có direction đều có live paths; không ép người dùng nhập plan.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: G02

### G02 · Server worker / run lease / stop guard [code]

- Input: Run running + ownership
- Output: Một step serialized hoặc terminal return
- Control: Max iterations/retries; durable progress; stop kiểm lại trước accept
- Issues: P3-UNTESTED, PROVIDER-503-001
- Gate đề xuất: Rời browser vẫn tiến triển; crash/stop không duplicate, restart lease đúng.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: G03

### G03 · Pin plan version, chọn objective [code]

- Input: Sorted objectives/current status
- Output: Pending/in_progress objective
- Control: Plan conflict409; hết objectives không tự suy hoàn tất nếu chưa review
- Issues: P3-UNTESTED
- Gate đề xuất: Không skip objective hoặc âm thầm theo plan mới.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: G04

### G04 · Chọn/tạo chương và phục hồi accept [code]

- Input: Objective target chapter + latest revision
- Output: Chapter/revision + possible existing gen
- Control: Crash recovery kiểm sourceGenerationId, last accepted revision
- Issues: P3-UNTESTED, SNAPSHOT-GAP
- Gate đề xuất: Đã accept nhưng crash không generate/accept lại cùng prose.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: F03, G05

### G05 · Đợi writing và quality gate [code]

- Input: Writing job/patch/version
- Output: Accept allowed hoặc bounded retry
- Control: Completed + validation passed + patch nonempty/no-op/bounds + brain freshness
- Issues: P3-UNTESTED, WRITE-INVALID-JSON-001
- Gate đề xuất: Guard không đủ nếu writing đã mislabeled passed; test parse failure xuyên fullauto.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: F08, G06

### G06 · Đợi extraction thật hoàn tất [code]

- Input: Accepted revision + outbox
- Output: Wait / failure / COMPLETED analysis
- Control: Kiểm tra outbox delivery và entity checkpoint riêng. waiting_for_entity_review: giữ objective, không tăng retries/advance, break loop; sau human continue mới tiếp tục auto.
- Issues: P3-UNTESTED, ENTITY-HITL
- Gate đề xuất: Fault memory step: giữ objective, recover không viết lại.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: G07, X09

### G07 · Auto-approve đúng revision [code]

- Input: Proposal groups của accepted revision
- Output: Advanced brain hoặc memory_update_incomplete
- Control: Chỉ P3; current source check; expected version qua từng group
- Issues: P3-UNTESTED, MEM-CRITICAL-001, EXTRACT-SUBJECT-UNRESOLVED-001
- Gate đề xuất: Auto không có sửa tay cứu; wrong source và semantic wrong không silently accepted.
- Source: `backend/src/modules/ai/autonomous-memory.service.ts`
- Next: G08

### G08 · Đánh giá objective theo prose [code]

- Input: Actual prose + min_words + objective
- Output: achieved + ending_resolved
- Control: Word floor trước LLM; terminal cần ending_resolved=true
- Issues: P3-UNTESTED, FINAL-QUALITY
- Gate đề xuất: Outline/lời hứa/lặp không đạt; đủ chữ chưa đủ kết thúc.
- Source: `backend/src/modules/ai/autonomous-memory.service.ts`
- Next: G09

### G09 · Advance hoặc viết thêm / stop [code]

- Input: Objective evaluation + remaining objectives
- Output: Updated run/checkpoint/stop reason
- Control: Chưa đạt→same objective thêm prose; đạt→complete objective; bounds/terminal quyết định
- Issues: P3-UNTESTED, FINAL-QUALITY
- Gate đề xuất: Terminal semantic gate và total manuscript acceptance độc lập; no infinite loop.
- Source: `backend/src/modules/ai/autonomous-controller.service.ts`
- Next: G03, H01

## H · Kiểm thử · hoàn thành · xuất bản boundary

Acceptance của task, không đồng nhất với job completed

### H01 · S01–S11 và gate vòng ngắn [bad]

- Input: UI actions + source/evidence
- Output: Step verdict + blockers
- Control: Run hiện PARTIAL_GATE_FAILED; S09 unfinished; S10 pass sau retry
- Issues: MEM-CRITICAL-001, WRITE-INVALID-JSON-001, REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Sửa blockers rồi run mới, giữ gold/evidence cũ; không API write cứu UI.
- Source: `Pipeline_test/AGENT_GUIDE.md`
- Next: H02

### H02 · M0 / M-FIRST /10/20/50/FINAL [mixed]

- Input: Raw proposals/canon/context/manifest
- Output: Memory audit riêng cho P1/P2/P3
- Control: Recovery có M0/M-FIRST/FINAL;10/20/50 và P2/P3 NOT_RUN
- Issues: MEM-CRITICAL-001, SEMANTIC-UNVERIFIED
- Gate đề xuất: Đủ source→raw→persisted→packed trace; critical/uncertainty/provenance đúng; đo entity riêng.
- Source: `Pipeline_test/AGENT_GUIDE.md`
- Next: H03

### H03 · Đọc và đánh giá bản thảo cuối [code]

- Input: Prose thực + blueprint/objectives
- Output: Completeness/literary/continuity judgments
- Control: Không lấy completed jobs, objective count hoặc số chữ làm toàn bộ verdict
- Issues: FINAL-QUALITY
- Gate đề xuất: 95–105k theo test; ending/payoffs/POV/pacing/repetition/knowledge audited độc lập.
- Source: `Pipeline_test/AGENT_GUIDE.md`
- Next: H04

### H04 · Export readback + attribution [mixed]

- Input: Latest saved revisions
- Output: Text files + SHA256/word counts/lineage
- Control: Test tooling export; không khẳng định product có full-book export UI
- Issues: FINAL-QUALITY, OBSERVABILITY
- Gate đề xuất: Mọi file khớp source bytes; AI/manual attribution rõ; không ghép output chưa accept.
- Source: `Pipeline_test/AGENT_GUIDE.md`
- Next: H05

### H05 · Báo cáo/checkpoint/issues + quyết định [ok]

- Input: Evidence và kết quả thực
- Output: PASS/PARTIAL/FAIL, resume chính xác
- Control: 5 outbox unfinished; backend/AI riêng đã dừng, không reset DB
- Issues: OPS-RECOVERED, PROVIDER-503-001
- Gate đề xuất: Không ghi NOT_RUN thành PASS; resolved guard khác feature success; reviewer độc lập rõ.
- Source: `Pipeline_test/AGENT_GUIDE.md`
- Next: H06

### H06 · Publish là hành động tác giả riêng [code]

- Input: Tác giả chủ động chọn xuất bản
- Output: Moderation/published platform state
- Control: Fullauto chỉ draft; publish ngoài quyền tự duyệt memory
- Issues: P3-UNTESTED
- Gate đề xuất: Kiểm chứng không publish trong mọi AI/test path; không cần publish để đạt test.
- Source: `backend/src/modules/novels/chapters.service.ts`
- Next: boundary/end

## J · Provider · hạ tầng · quan sát lỗi

Các bước dùng chung, không phải một phase chỉ chạy cuối cùng

### J01 · Preflight stack/source/schema/auth [mixed]

- Input: Code fingerprint/ports/migrations/provider
- Output: Môi trường ready hoặc blocked
- Control: Đối chiếu source/schema/config; luồng mới cần migration0011/0012; không restart stack cũ có5 durable retries chưa xử lý.
- Issues: OPS-RECOVERED
- Gate đề xuất: Read-only preflight trước run; provider health không đồng nghĩa mọi call sẽ200.
- Source: `Pipeline_test/runs/2026-10-19-reanalysis-recovery/REPORT.md`
- Next: A01, A05, G01

### J02 · Structured call/schema/trace [mixed]

- Input: Operation/system/user/source scope
- Output: Provider response + metadata
- Control: Source/hash/model/finish/usage tracing; validate schemas tại từng service
- Issues: OBSERVABILITY, PROVIDER-503-001
- Gate đề xuất: Malformed/truncated/timeout phân loại; tất cả writing/extraction có source trace.
- Source: `ai-service/core/structured_call.py`
- Next: J03

### J03 · Định tuyến model/limits/fallback [mixed]

- Input: Requested model/provider + config
- Output: Effective model và output
- Control: Runtime Gemini flash-lite observed cho extraction; fallback phụ thuộc config
- Issues: OBSERVABILITY, PROVIDER-503-001
- Gate đề xuất: Không silent simulated success; output-limit/model change được report đúng.
- Source: `ai-service/core/llm_service.py`
- Next: J04

### J04 · Repair tại chỗ và retry outbox [mixed]

- Input: Schema/grounding/reconciliation/provider error
- Output: Repair / delayed retry / terminal failure
- Control: Quote max2 repairs; canon3 total; outbox max5 mặc định; backoff riêng
- Issues: PROVIDER-503-001, REANALYSIS-LIVE-UNRESOLVED-001
- Gate đề xuất: Semantic invalid không bắn lại tốn phí vô hạn; counters/traces không lẫn.
- Source: `ai-service/core/structured_call.py`
- Next: J05, B06

### J05 · Ngân sách / cancel / durable resume [mixed]

- Input: Jobs/calls/time/stop request
- Output: Checkpoint với source/version/queue
- Control: 104 HTTP responses observed; stop2 isolated services để không retry ngầm
- Issues: OBSERVABILITY, OPS-RECOVERED, P3-UNTESTED
- Gate đề xuất: Cap quan sát được; stop không publish/mất data; lần resume đọc DB trạng thái thật.
- Source: `Pipeline_test/runs/2026-10-19-recovery-ui-01/checkpoint.json`
- Next: boundary/end

## X · Ứng viên · tác giả duyệt entity

Có implementation opt-in; mặc định OFF. X05/X06 vẫn là thiết kế. Chưa có live provider retest cho luồng mới.

### X01 · Chia đoạn cho entity discovery [code]

- Input: Prose gốc + paragraph/whitespace boundaries
- Output: Chunks khoảng4000 ký tự, overlap256; absolute Unicode offsets
- Control: Tối đa32 chunks; chỉ discovery chia đoạn, không phải event/fact
- Issues: CHUNKING-GAP, ENTITY-HITL
- Gate đề xuất: Unicode/overlap/cap đã có offline tests; live source dài chưa chạy.
- Source: `ai-service/services/entity_pipeline/candidates.py`
- Next: X02

### X02 · Gom ứng viên recall cao + tên tăng cường [code]

- Input: Chunks + canonical registry/aliases + hints + patterns + LLM discovery
- Output: Occurrences có offsets/context/origins; tên vắng không thành mention
- Control: Tên/danh xưng/mã; max1024 candidates; vượt cap fail rõ; registry bulk2 queries, không query từng tên
- Issues: ENTITY-HITL, ENTITY-COVERAGE
- Gate đề xuất: Đo recall và chi phí với gold riêng; hints sai/vắng không tạo sự kiện.
- Source: `ai-service/services/entity_pipeline/candidates.py`
- Next: X03

### X03 · LLM xét từng occurrence có ngữ cảnh [code]

- Input: Candidate + context + known IDs + guidance không phải chứng cứ
- Output: entity / not_entity / unresolved + reason, alias/status quote
- Control: Batch24; đúng1 quyết định mỗi ID; tối đa2 attempts/batch; không auto materialize xung đột danh tính
- Issues: ENTITY-HITL, ENTITY-HOMONYM
- Gate đề xuất: Offline negative control An/an toàn và malformed PASS; cần live kiểm precision/recall.
- Source: `ai-service/services/entity_pipeline/verification.py`
- Next: X09

### X04 · Đóng băng inventory đã duyệt [code]

- Input: Tất cả occurrence đã được tác giả quyết định + canonical registry
- Output: entities_reviewed; identity/alias/type/spans, source hash và guidance/review version
- Control: Không unresolved; alias phải có bằng chứng; canonical ID/type phải khớp; chặn merge sai và identity lạ
- Issues: ENTITY-HITL, ENTITY-COVERAGE
- Gate đề xuất: Tiếp tục dùng checkpoint, không gọi lại entity LLM; nguồn cũ bị gateway409.
- Source: `ai-service/application/entity_review_service.py`
- Next: C04, X10

### X05 · Extract event/fact theo chunks [proposal]

- Input: Verified entity inventory + context-overlap
- Output: Grounded source-bound assertions
- Control: Dùng inventory chung; giữ modality/subject; đoạn phụ trợ không thành event mới
- Issues: CANDIDATE-PROPOSAL, MEM-CRITICAL-001
- Gate đề xuất: Cross-chunk coreference, repeated scenes và knowledge constraints có gold.
- Source: `ai-service/application/entity_review_service.py`
- Next: X06

### X06 · Hợp nhất/dedup + coverage audit [proposal]

- Input: Chunk results + absolute spans
- Output: One chapter proposal inventory
- Control: Dedup occurrence/meaning, không chỉ exact text; rà lại source coverage
- Issues: CANDIDATE-PROPOSAL, CHUNKING-GAP
- Gate đề xuất: So sánh cùng35 gold + entity gold trước/sau; đo chi phí/latency, không chỉ count.
- Source: `ai-service/application/entity_review_service.py`
- Next: D01

### X07 · Rollout có cờ và regression gates [code]

- Input: Candidate/verified results + offline tests + live benchmark chưa chạy
- Output: Flag OFF mặc định; cần migration0011/0012 và isolated retest
- Control: ENTITY_CANDIDATE_VERIFICATION_ENABLED=true mới bật gate cho revision; legacy endpoints không tự đổi
- Issues: ENTITY-HITL, P2-UNTESTED, P3-UNTESTED
- Gate đề xuất: S01–S11 +35 gold, M0/10/20/50 và 100k chưa được mở chỉ vì unit tests PASS.
- Source: `Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`
- Next: C13

### X08 · Danh sách tăng cường tùy chọn [code]

- Input: Tác giả nhập tên; API hỗ trợ type/alias/notes và hint/declared
- Output: Guidance version riêng, không vào approved memory/context
- Control: UI mỗi dòng1 tên; optimistic version; tối đa256 entries/512 names; tên chỉ là chỉ dẫn tìm kiếm
- Issues: ENTITY-HITL
- Gate đề xuất: Tên sai/vắng không tạo entity/occurrence/event; mất cập nhật bị409.
- Source: `web/src/features/ai-copilot/EntityExtractionReview.tsx`
- Next: X01, X11

### X09 · Dừng để tác giả duyệt entity [code]

- Input: Inventory + machine decisions + source offsets/context
- Output: waiting_entity_review; chưa extract event/fact, chưa lưu partial proposals
- Control: Nhóm cùng tên/identity/verdict; xem từng occurrence; giữ/loại/sửa type/name/alias; unresolved bắt buộc xử lý
- Issues: ENTITY-HITL
- Gate đề xuất: P1 job dừng đúng chương; P3 không approve/advance; đủ decision mới freeze.
- Source: `web/src/features/ai-copilot/EntityExtractionReview.tsx`
- Next: X04, X10

### X10 · Bổ sung tên hoặc gặp identity mới [code]

- Input: Guidance version đổi hoặc event/fact nhắc identity ngoài inventory
- Output: Quay lại checkpoint entity; giữ quyết định còn hợp lệ
- Control: Hint đổi: rerun riêng entity, không chạy event/fact; ID/context/machine decision còn khớp mới giữ author decision; downstream unknown không tự tạo
- Issues: ENTITY-HITL
- Gate đề xuất: Source/hash/novel/policy/version độc lập; không mất review hợp lệ sau reload, không lưu group dở.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: X01, X09

### X11 · Tác giả trực tiếp khai báo entity [code]

- Input: Tên + loại do tác giả xác nhận; không cần quote chương
- Output: Proposal source_type=author_declaration, initial_status Unknown
- Control: Duyệt qua queue bình thường mới thành canon; không gắn chapter occurrence/event; tên đã có yêu cầu correction riêng
- Issues: ENTITY-HITL
- Gate đề xuất: Không overwrite/auto-merge entity đã duyệt; sau approve registry hỗ trợ LLM normalization bằng proposal.
- Source: `ai-service/application/revision_analysis_service.py`
- Next: D05

## Issue registry

### MEM-CRITICAL-001 · Bỏ sót hoặc sai nghĩa facts gold [live]

35 assertions gồm facts/events/uncertainty, KHÔNG phải 35 entities. Raw:15 PASS/16 FAIL/4 PARTIAL. Sau review:13 PASS/19 FAIL/2 PARTIAL/1 author wording. Chưa đo precision toàn187 proposals.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/m0-gold-manual.json`

Đóng khi: Retest cùng35 gold cố định; critical assertions đúng nội dung/certainty/provenance; báo raw và sau sửa riêng, không dùng đếm records làm recall.

### ENTITY-COVERAGE · Chưa chứng minh entity recall và alias [mixed]

Đã có candidate inventory/chunk discovery/verification + human gate dưới flagOFF. Chưa đo live candidate recall/verified recall/alias precision; không suy ra coverage từ số records hoặc15/35 gold.

Evidence: `ai-service/services/entity_pipeline/pipeline.py; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/m0-after-review/official-memory.json`

Đóng khi: Tạo gold entity/mention/alias riêng; đo candidate recall, verified recall và false merge; cover tên lạ, vật phẩm có mã và danh xưng.

### ENTITY-HOMONYM · An bị bám vào chữ “an” trong “an toàn” [live]

Có span thật nhưng ngữ cảnh không phải người An; tác giả đã loại proposal tương ứng. Grounding hình thức không chứng minh nghĩa.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s02-raw/proposals-pending.json`

Đóng khi: Negative control an toàn/an tâm không tạo mention của An; quyết định theo từng occurrence có offset/ngữ cảnh.

### EXTRACT-SUBJECT-UNRESOLVED-001 · Subject không phân giải được [live]

INVALID_PROJECTION với Unknown/generic subjects. M0 cần28 unique fact edits và3 numeric rejections; subject prompt chưa được ràng buộc đủ trước review.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s03-applied-repairs-ui.json`

Đóng khi: Mọi confirmed subject có canonical ID hoặc trạng thái unresolved rõ; không tự tạo Unknown entity; numeric/general fact sửa được và không mất assertion.

### REVIEW-EDITS-RESET-001 · Duyệt nhóm làm mất edits nhóm khác [mixed]

Đã sửa code: approve nhómA chỉ xóa editsA. Chưa có live UI regression chứng minh giữ editsB qua refetch/reload; hạn chế typed editing vẫn còn.

Evidence: `web/src/features/ai-copilot/AuthorMemoryPanel.tsx; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s03-current-group-93.json`

Đóng khi: Hai nhóm cùng có edits; approve nhómA chỉ xóa editsA, editsB giữ nguyên sau refetch và có cơ chế tránh mất do reload.

### WRITE-INVALID-JSON-001 · JSON dang dở vẫn được coi là prose [live]

Generation completed với JSON chưa đóng; parse fallback sang raw; UI ghi đã kiểm định và cho accept. Tester đã bỏ qua, không thực hiện accept bản lỗi.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s07-generated-before-accept/writing-generations.json`

Đóng khi: Malformed/truncated/empty output phải failed có lý do, không accept được ở UI/server; output prose hợp lệ vẫn qua. Không khẳng định MAX_TOKENS khi thiếu finish-reason.

### EXTRACT-ROLE-CONFUSION-001 · Nhầm vai trò và trạng thái [live]

Nhóm người rời trạm bị chuyển thành trạm Bốn status=Rời đi; tác giả loại. Một số phát biểu chưa xác nhận bị nâng thành confirmed.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s08-author-edits.json; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/m0-gold-manual.json`

Đóng khi: Kiểm tra subject–predicate–value và certainty; station không nhận human action/life status; phủ định/đồn đoán không đổi confirmed state.

### REANALYSIS-LIVE-UNRESOLVED-001 · Reconciliation không ra quyết định hợp lệ [live]

UI và outbox trả CANON_RECONCILIATION_UNRESOLVED, attempts=3; canon target/kind không hợp lệ. Guard đã chặn partial group nhưng chức năng vẫn FAIL.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/reanalysis-result-ui.txt; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/final/outbox.json`

Đóng khi: Reanalyse cùng revision ra nhóm đúng; many-reuse giữ IDs; replace/removed có nguồn; không đổi thành new để né lỗi; lỗi vẫn atomic/actionable.

### GROUNDING-GUARD · Quote mơ hồ: guard đã sửa, live case chưa đủ [mixed]

Unique span và bounded quote repair đã có test. Facts grounding unresolved làm fail analysis; event quote không ground được có thể bị bỏ qua, entity status có thể hạ Unknown.

Evidence: `ai-service/services/source_grounding.py; Pipeline_test/runs/2026-10-19-recovery-ui-01/../2026-10-19-reanalysis-recovery/REPORT.md`

Đóng khi: Quote lặp cần mở rộng ngữ cảnh đúng; bảo toàn Unicode offset/hash. Báo rõ số event bị bỏ qua, không coi schema success là coverage pass.

### GATEWAY-KEY · Reanalysis Idempotency-Key đã sửa [mixed]

UI tạo khóa mới cho action, gateway scoped/hash và forward. Live đã qua gateway tới reconciliation; chưa có reanalysis thành công end-to-end.

Evidence: `backend/src/modules/ai/ai-gateway.controller.ts; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/reanalysis-result-ui.txt`

Đóng khi: Retry cùng action không tạo duplicate; action phân tích lại mới có run mới đúng canon; route không thiếu header, không tràn chiều dài key.

### PROVIDER-503-001 · Gemini quá tải và retry [live]

503 high demand; consistency cần retry. Kết thúc run còn5 outbox unfinished; backend/AI stack test riêng đã được dừng có chủ đích.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/stopped-checkpoint.json; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/provider-http-attempts.json`

Đóng khi: Phân loại provider/semantic/schema errors, retry có giới hạn và quan sát chi phí; restart đọc lease/state, không gọi lặp mù.

### CONTEXT-COVERAGE · Context pack chưa chứng minh đủ thông tin cần thiết [live]

70 hàng kiểm tra là35 assertions trên2 request cố định Linh/cutoff5, không phải70 retrieval calls. 4k:3 present/11 dropped/21 upstream gap;8192:6/8/21. Không yêu cầu pack tất cả gold cùng lúc.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/memory_probes.csv; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/m0-after-review/`

Đóng khi: Mỗi tác vụ có expected/forbidden riêng; trace retrieved/selected/dropped và source version; phân biệt thiếu upstream với bị pack bỏ; kiểm chứng prompt thực.

### SEMANTIC-UNVERIFIED · Semantic/embedding chưa chứng minh live [untested]

Code có derived event embeddings, retrieval và fallback. Run này chưa đủ bằng chứng query/candidate/rank/embedding version để kết luận semantic lane đạt.

Evidence: `ai-service/application/semantic_memory_service.py; ai-service/application/semantic_retriever.py`

Đóng khi: Backfill/update/retire embeddings, lỗi provider/fallback, cutoff và tenant isolation phải có live evidence; không đồng nhất semantic chunk với extraction chunk.

### STATE-OPTIONS · Bootstrap và incremental khác cấu hình [gap]

Bootstrap bật state transitions; API incremental mặc định tắt. check_consistency/build_embeddings có schema nhưng RevisionAnalysisService không tự thực thi chỉ vì option=true.

Evidence: `ai-service/api/schemas.py; ai-service/application/revision_analysis_service.py`

Đóng khi: Thống nhất contract từng mode, trả effective options; có test execution trace, không ngầm hứa consistency từ một cờ chưa dùng.

### CHUNKING-GAP · Event/fact chưa chia nhỏ chương [gap]

Entity discovery đã có overlap/absolute offsets dưới flag. Event/fact/coverage vẫn toàn chương; _split_scenes chỉ đếm. Chưa merge assertions theo chunk.

Evidence: `ai-service/application/bootstrap_service.py; ai-service/application/revision_analysis_service.py`

Đóng khi: Nếu bổ sung chunking: offset tuyệt đối, overlap dedup, ngữ cảnh nối đoạn và gold so sánh; không coi chunking tự động bảo đảm đủ entities/facts.

### P2-UNTESTED · Luồng ý tưởng chưa retest live [untested]

UI dùng mode=extract; backend còn mode=blueprint tạo nội dung mới. P2 NOT_RUN trong recovery run; không lấy P1 PASS cục bộ suy ra P2 PASS.

Evidence: `ai-service/application/bootstrap_service.py; Pipeline_test/WORKFLOW_CONTRACT.md`

Đóng khi: Đầu vào setup giữ ràng buộc, chỉ trích phần đã cung cấp; outline chưa thành lịch sử; duyệt/init→chương đầu→M-FIRST có evidence riêng.

### P3-UNTESTED · Full auto chưa chứng minh toàn hành trình [untested]

Controller có planning/generate/accept/auto-approve/evaluate/stop. Recovery run không chạy P3;0 pending proposals không đủ chứng minh extraction hoàn tất.

Evidence: `backend/src/modules/ai/autonomous-controller.service.ts; Pipeline_test/runs/2026-10-19-recovery-ui-01/REPORT.md`

Đóng khi: Nhiều objectives; lỗi memory không advance; crash/resume không sinh/accept trùng; stop/restart/terminal; không publish; 100k có content audit thật.

### VALIDATION-SCOPE · Kiểm định writing còn giới hạn [gap]

Có patch offsets/empty check và quy tắc heuristic (dead action/world rules). Không tương đương full literary/semantic consistency; UI wording có thể nói quá mức đã kiểm tra.

Evidence: `ai-service/application/writing_service.py; web/src/features/ai-copilot/WritingAssistantPanel.tsx`

Đóng khi: Hiển thị validator nào đã chạy; tách parse/patch/consistency/literary verdict; kiểm tra Unicode, flashback, quote, negation; không gắn nhãn đã kiểm định chung.

### FINAL-QUALITY · Chưa hoàn thành hoặc đánh giá tiểu thuyết dài [untested]

Run có4992 từ =4747 fixture +245 tác giả viết,6 drafts, không có chương mới hoàn chỉnh;100k/P2/P3 NOT_RUN. Không có literary score độc lập.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/REPORT.md; Pipeline_test/runs/2026-10-19-recovery-ui-01/revision_manifest.csv`

Đóng khi: 95–105k theo task, ending/payoffs/continuity/POV/repetition kiểm tra; source attribution và independent review; word count hoặc completed jobs không đủ.

### SNAPSHOT-GAP · Save và memory có thể lệch thời điểm [mixed]

Revision/outbox/provenance có guard. S08 stale proposal đã bị chặn. S09 saves chồng nhau chưa hoàn tất dedup; cuối run5 jobs chưa xong. Phiên auth hết hạn đã phải đăng nhập lại.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/s08-stale-rejection-ui.txt; Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/stopped-checkpoint.json`

Đóng khi: Save success có readback; latest revision eventual extraction; stale results không apply; duplicate/no-op save không tạo canon trùng; restart phục hồi lease có evidence.

### OBSERVABILITY · Trace chưa phủ đều tất cả các call [gap]

Structured traces có source/hash/model/finish/usage. Writing unstructured chưa có finish reason đủ chứng minh lỗi cắt.104 observed HTTP responses không phải tổng billed calls.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/provider-traces-progress.json; Pipeline_test/runs/2026-10-19-recovery-ui-01/REPORT.md`

Đóng khi: Trace xuyên UI→revision→analysis→proposal→canon→retrieval→generation; request/response hashes +model/effective options/usage/finish, che secrets, không log nguyên prose mặc định.

### CANDIDATE-PROPOSAL · Event/fact chunk merge còn là đề xuất [proposal]

Entity candidates/verification/human gate đã có code opt-in. Phần chưa triển khai: event/fact theo chunk, merge assertions/coreference cross-chunk và coverage audit độc lập.

Evidence: `ai-service/application/revision_analysis_service.py`

Đóng khi: Đo candidate recall và final precision/alias accuracy riêng; mỗi ứng viên có verdict; kiểm tra chunk boundaries/overlap, ambiguous names và chi phí trước rollout.

### OPS-RECOVERED · Docker đã phục hồi; test services đang dừng [mixed]

Socket crash đã được người dùng phục hồi. Cuối run tester chủ động dừng backend/AI stack riêng để chặn retry ngầm; web/DB giữ lại. Đây không phải Engine hiện đang crash.

Evidence: `Pipeline_test/runs/2026-10-19-recovery-ui-01/evidence/stopped-checkpoint.json; Pipeline_test/runs/2026-10-19-recovery-ui-01/REPORT.md`

Đóng khi: Trước live test mới: runtime code fingerprint/migrations/schema/provider/ports/auth; chỉ resume jobs sau đọc checkpoint, không reset volumes hoặc khởi động nhầm stack cũ.

### ENTITY-HITL · Human review đã có code, chưa live retest [untested]

Luồng mới: optional guidance → candidate verification → tác giả accept/reject/edit → frozen inventory → event/fact → review canon. Offline tests không chứng minh đủ35 gold hoặc output100k. Flag mặc định OFF, cần migration0012 và deploy đồng bộ. P2 setup chỉ entities nhân vật/địa danh; event/fact vẫn fullchapter.

Evidence: `Pipeline_test/runs/2026-10-20-human-entity-review/REPORT.md`

Đóng khi: Isolated UI/provider test P1/P2/P3; thử tên thiếu/vắng/alias/homonym, reload/stale/version, resume không rediscovery, unknown downstream và audit35 gold. Chưa mở bài dài trước gate.
