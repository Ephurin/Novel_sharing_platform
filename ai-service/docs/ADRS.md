# Architecture Decision Records

> **Architecture source guidance (2026-10-21):** The accepted ADR decisions below remain in force as historical design decisions, but are **not a runtime PASS claim**. Product behavior and mandatory P3 100,000-word HITL acceptance are governed by [WORKFLOW_CONTRACT.md revision 1.4](../../Pipeline_test/WORKFLOW_CONTRACT.md); the current source-inspected topology lives in [ARCHITECTURE.md](ARCHITECTURE.md), with legacy prototype archived separately. The P3 unattended entity-approval policy has **not** been accepted; do not infer it from ADR-008/auto-orchestration text. Review each implementation with exact SHA and evidence.

> Status: Accepted baseline. Các ADR bên dưới đã được author/product owner chấp nhận ngày 2026-08-27.

## ADR-001 — Narrative Memory là bounded context riêng

**Status:** Accepted
**Decision:** Novel Platform sở hữu user/novel/chapter/revision; Narrative Memory sở hữu dữ liệu AI dẫn xuất.

### Lý do

- Tránh trộn reader/payment/publishing với AI workflow.
- Cho phép scale và triển khai AI service độc lập.
- Giữ canonical manuscript ở Platform.

### Hệ quả

- Mọi AI request cần canonical IDs.
- Cần contract/event giữa Platform và Narrative service.
- Không truy cập tùy ý bảng platform từ AI domain logic.

## ADR-002 — PostgreSQL schema riêng trong cùng database cho MVP

**Status:** Accepted
**Decision:** Dùng schema `narrative` trong cùng PostgreSQL database với Platform; chưa tách database vật lý trong MVP.

### Lý do

- Transaction và migration đơn giản hơn JSON.
- Vận hành ít phức tạp.
- Có thể dùng JSONB, full-text và `pgvector`.

### Hệ quả

- Repository interface vẫn bắt buộc để tránh coupling.
- Cross-schema FK chỉ dùng nếu Platform và AI cùng deployment ownership; nếu không, dùng logical IDs.
- Có đường tách database khi tải/ownership yêu cầu.

## ADR-003 — Event history là source of truth

**Status:** Accepted
**Decision:** Confirmed event và author fact là nguồn dựng current state; relationship là projection.

### Lý do

- Giữ lịch sử và causality.
- Replay/debug được.
- Phù hợp consistency và long-term context.

### Hệ quả

- Không sửa historical event tại chỗ.
- Projection cần version và rebuild job.
- Migration từ JSON phải deduplicate event.

## ADR-004 — Proposal-first, author-controlled mutation

**Status:** Accepted
**Decision:** AI tạo proposal; canonical mutation đi qua validation và decision.

### Lý do

- Author là source of truth.
- Giảm silent corruption do hallucination.
- Có dữ liệu feedback cho evaluation.

### Hệ quả

- UI cần review queue.
- Cần proposal/decision tables.
- Có thể tăng friction; auto-accept chỉ được thêm bằng policy rõ ràng.

## ADR-005 — Async jobs cho import và analysis

**Status:** Accepted
**Decision:** Import manuscript, revision analysis, embedding và projection rebuild chạy qua durable job queue.

### Lý do

- LLM latency không ổn định.
- Hỗ trợ retry, cancellation và progress.
- Không giữ HTTP request hoặc DB transaction dài.

### Hệ quả

- Cần job state, worker và SSE/polling.
- Operation phải idempotent.
- Interactive generation vẫn có thể stream qua cùng job abstraction.

## ADR-006 — PostgreSQL + pgvector trước specialized stores

**Status:** Accepted
**Decision:** Dùng relational model + JSONB + `pgvector`; không đưa Neo4j/vector DB riêng vào MVP.

### Lý do

- Query chính xoay quanh novel/entity/event/time và transaction.
- Giảm vận hành nhiều database.
- Graph UI không bắt buộc graph database.

### Hệ quả

- Quan hệ lưu bằng adjacency tables.
- Phải benchmark retrieval trước khi tách vector store.
- Có thể tách khi dữ liệu hoặc latency chứng minh cần thiết.

## ADR-007 — Structured outputs và explicit failure

**Status:** Accepted
**Decision:** Mọi LLM stage trả schema versioned và validate bằng Pydantic; provider/parsing failure không được biến thành kết quả rỗng.

### Lý do

- Phân biệt “không tìm thấy” với “pipeline lỗi”.
- Cho phép retry và observability.
- Tránh ghi dữ liệu sai cấu trúc.

### Hệ quả

- Cần error taxonomy.
- Prompt/model adapter phải hỗ trợ structured output hoặc robust validation.
- Test cần fake malformed response.

## ADR-008 — Single orchestrated pipeline trước multi-agent

**Status:** Accepted
**Decision:** MVP dùng application workflows và typed tools; chỉ agent hóa Consistency Review sau khi memory/retrieval ổn định.

### Lý do

- Pipeline hiện tại đã là vertical slice có thể tái sử dụng.
- Multi-agent tăng cost, latency và khó debug.
- Memory correctness quan trọng hơn agent autonomy.

### Hệ quả

- Entity/event/state modules là services/tools, không phải agent.
- Harness chỉ được xây khi có goal loop, checkpoint, budget và approval thực sự cần thiết.

## ADR-009 — Revision-based integration

**Status:** Accepted
**Decision:** Mọi analysis và writing operation gắn immutable `revision_id` + `content_hash`.

### Lý do

- Idempotency và reproducibility.
- Source span ổn định.
- Phát hiện stale proposal/draft.

### Hệ quả

- Platform phải triển khai chapter revisions trước integration production.
- Autosave không nhất thiết tạo analysis job; cần checkpoint policy.

## ADR-010 — Không lưu raw model trace mặc định

**Status:** Accepted
**Decision:** Lưu model/prompt version, usage, structured output và hashes; không lưu raw chain-of-thought hoặc toàn bộ prompt/response mặc định.

### Lý do

- Bảo vệ manuscript và privacy.
- Giảm storage và rủi ro data leakage.
- Structured artifacts đủ cho phần lớn debug/evaluation.

### Hệ quả

- Debug mode có retention ngắn và opt-in.
- Context preview chỉ hiển thị artifacts/provenance, không hiển thị chain-of-thought.

## ADR-011 — Platform-first với adapter cho standalone mode

**Status:** Accepted
**Decision:** Demo/MVP ưu tiên tích hợp Novel Platform, nhưng Copilot truy cập identity, revision content và storage qua port/adapter để có thể chạy độc lập.

### Lý do

- Novel Platform là use case triển khai ưu tiên và system of record production.
- Standalone mode cần thiết cho development, test, demo cô lập và khả năng tái sử dụng module.
- Domain pipeline không nên phụ thuộc trực tiếp HTTP route hoặc bảng nội bộ của Platform.

### Hệ quả

- Tích hợp mặc định dùng `PlatformRevisionContentProvider` và canonical ID từ Platform.
- Standalone mode dùng local workspace, local revision repository và một `tenant_id` mặc định do adapter cấp.
- Cùng một application workflow chạy ở cả hai mode; chỉ composition root và adapter thay đổi.
- Không dùng distributed transaction giữa Platform và Copilot; dùng immutable revision, idempotency key và outbox/event để đồng bộ.

## Review checklist

- [x] Chấp nhận ranh giới Platform/Narrative.
- [x] Chấp nhận event sourcing + projections.
- [x] Chấp nhận proposal-first cho MVP.
- [x] Chọn shared database với schema `narrative` riêng.
- [x] Chốt policy autosave/checkpoint analysis.
- [x] Chốt retention và debug trace policy.
- [x] **Phase 3 gate:** chọn queue implementation; không block Phase 0–2 vì domain dùng queue interface.
- [x] **Phase 7 gate:** chọn embedding model/dimension bằng benchmark ([ADR-012](ADR-012-EMBEDDING-MODEL.md)).

## ADR-012 — Embedding Model, Vector Dimension, and Reindexing Strategy

**Status:** Accepted (Astra review, 2026-09-22)  
**Decision:** Chọn `gemini-embedding-2` với vector dimension `768`, chuẩn hóa L2 bắt buộc, cosine distance trong pgvector, instruction prefix phân biệt query/document, và chiến lược parallel reindex không downtime.  
**Tài liệu chi tiết:** [ADR-012-EMBEDDING-MODEL.md](ADR-012-EMBEDDING-MODEL.md)

## 2026-09-15 — Phase 4 deterministic projection

Confirmed event/fact transitions are the source of canonical current state in the revision/proposal workflow. Acceptance and synchronous replay share the PostgreSQL Story Brain row lock and transaction, so failures roll back both review decisions and state. Corrections append events with `supersedes_id` metadata and replay at the original event position. This preserves later narrative effects and allows deterministic retries.

For the MVP, state attributes and per-attribute provenance use JSON columns in `current_entity_states`; a normalized `state_transitions` table and `event_participants` table preserve source links. This increment avoids prematurely freezing the full typed state schema in `DATA_MODEL.md`. Large-story incremental checkpoints and typed query columns can be added after profiling. JSON remains a single-writer compatibility adapter with atomic file replacement. Operational details and rollback limits: [STATE_PROJECTION.md](STATE_PROJECTION.md).
