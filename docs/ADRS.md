# Architecture Decision Records

> Status: Proposed. Mỗi ADR cần chuyển sang `Accepted`, `Rejected` hoặc `Superseded` sau review.

## ADR-001 — Narrative Memory là bounded context riêng

**Status:** Proposed
**Decision:** Novel Platform sở hữu user/novel/chapter/revision; Narrative Memory sở hữu dữ liệu AI dẫn xuất.

### Lý do

- Tránh trộn reader/payment/publishing với AI workflow.
- Cho phép scale và triển khai AI service độc lập.
- Giữ canonical manuscript ở Platform.

### Hệ quả

- Mọi AI request cần canonical IDs.
- Cần contract/event giữa Platform và Narrative service.
- Không truy cập tùy ý bảng platform từ AI domain logic.

## ADR-002 — PostgreSQL schema riêng trong cùng cluster cho MVP

**Status:** Proposed
**Decision:** Dùng schema `narrative`; chưa tách database vật lý trong MVP.

### Lý do

- Transaction và migration đơn giản hơn JSON.
- Vận hành ít phức tạp.
- Có thể dùng JSONB, full-text và `pgvector`.

### Hệ quả

- Repository interface vẫn bắt buộc để tránh coupling.
- Cross-schema FK chỉ dùng nếu Platform và AI cùng deployment ownership; nếu không, dùng logical IDs.
- Có đường tách database khi tải/ownership yêu cầu.

## ADR-003 — Event history là source of truth

**Status:** Proposed
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

**Status:** Proposed
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

**Status:** Proposed
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

**Status:** Proposed
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

**Status:** Proposed
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

**Status:** Proposed
**Decision:** MVP dùng application workflows và typed tools; chỉ agent hóa Consistency Review sau khi memory/retrieval ổn định.

### Lý do

- Pipeline hiện tại đã là vertical slice có thể tái sử dụng.
- Multi-agent tăng cost, latency và khó debug.
- Memory correctness quan trọng hơn agent autonomy.

### Hệ quả

- Entity/event/state modules là services/tools, không phải agent.
- Harness chỉ được xây khi có goal loop, checkpoint, budget và approval thực sự cần thiết.

## ADR-009 — Revision-based integration

**Status:** Proposed
**Decision:** Mọi analysis và writing operation gắn immutable `revision_id` + `content_hash`.

### Lý do

- Idempotency và reproducibility.
- Source span ổn định.
- Phát hiện stale proposal/draft.

### Hệ quả

- Platform phải triển khai chapter revisions trước integration production.
- Autosave không nhất thiết tạo analysis job; cần checkpoint policy.

## ADR-010 — Không lưu raw model trace mặc định

**Status:** Proposed
**Decision:** Lưu model/prompt version, usage, structured output và hashes; không lưu raw chain-of-thought hoặc toàn bộ prompt/response mặc định.

### Lý do

- Bảo vệ manuscript và privacy.
- Giảm storage và rủi ro data leakage.
- Structured artifacts đủ cho phần lớn debug/evaluation.

### Hệ quả

- Debug mode có retention ngắn và opt-in.
- Context preview chỉ hiển thị artifacts/provenance, không hiển thị chain-of-thought.

## Review checklist

- [ ] Chấp nhận ranh giới Platform/Narrative.
- [ ] Chấp nhận event sourcing + projections.
- [ ] Chấp nhận proposal-first cho MVP.
- [ ] Chọn shared schema hay separate database.
- [ ] Chọn queue technology.
- [ ] Chọn embedding model/dimension.
- [ ] Chốt policy autosave/checkpoint analysis.
- [ ] Chốt retention và debug trace policy.
