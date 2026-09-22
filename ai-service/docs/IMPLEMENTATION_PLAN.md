# Implementation Plan — Narrative Memory MVP

> Status: Ready for implementation. Pre-implementation review hoàn tất ngày 2026-08-27; kế hoạch ưu tiên migration tăng dần, không rewrite pipeline hiện tại.

## Mục tiêu MVP

Hoàn thành vòng lặp:

```text
Import immutable revisions
→ Generate proposals
→ Author review
→ Materialize Story Brain
→ Generate continuation with context
→ Create new revision
→ Incremental analysis
→ Update Story Brain
```

## Ngoài phạm vi MVP

- Multi-agent orchestration.
- Neo4j hoặc vector database riêng.
- Fine-tuning writing model.
- Auto-publishing/moderation/payment.
- Full planning suite và AI beta reader.
- Tự động accept mọi AI inference.

## Technical baseline đề xuất

| Concern | Đề xuất |
|---|---|
| API | FastAPI + Pydantic v2 hiện tại |
| ORM | SQLAlchemy 2.x |
| Migration | Alembic |
| PostgreSQL driver | psycopg 3 |
| Validation | Pydantic schema versioned |
| Job queue | Interface trước; chọn Celery/Dramatiq sau ADR review |
| Vector | pgvector, chỉ bật ở phase retrieval |
| Tests | pytest + FastAPI TestClient + fake LLM |

Giữ sync SQLAlchemy trong MVP để phù hợp các route/service hiện tại; worker xử lý concurrency qua process/job thay vì chuyển toàn code sang async ngay.

## Kiến trúc package đích

```text
ai-service/
├── api/
│   ├── routes/
│   │   ├── story_brains.py
│   │   ├── analyses.py
│   │   ├── proposals.py
│   │   ├── writing.py
│   │   └── jobs.py
│   ├── schemas/
│   └── deps.py
├── application/
│   ├── bootstrap_story_brain.py
│   ├── analyze_revision.py
│   ├── decide_proposal.py
│   ├── build_context.py
│   └── generate_writing.py
├── domain/
│   ├── entities.py
│   ├── events.py
│   ├── facts.py
│   ├── proposals.py
│   ├── state.py
│   └── errors.py
├── infrastructure/
│   ├── db/
│   │   ├── models.py
│   │   ├── repositories.py
│   │   └── session.py
│   ├── json_repository.py
│   ├── jobs/
│   └── llm/
├── services/
│   └── existing extraction/reasoning services
└── migrations/
```

Không bắt buộc di chuyển toàn bộ file ngay. Cấu trúc được hình thành dần theo phase.

## Phase 0 — Stabilize current pipeline

> **Status:** Completed on 2026-09-06. Centralized settings, typed entity/event/state outputs, explicit provider/parsing failures, dependency cleanup, and 19 fake-provider unit tests satisfy the Phase 0 exit criteria.

### Tasks

- Chuẩn hóa `Settings` cho provider, database, CORS, timeout và feature flags.
- Loại dependency ML/Neo4j không còn dùng sau khi xác minh.
- Đổi entity pipeline để phân biệt empty result và provider/parsing failure.
- Định nghĩa typed structured outputs cho entity/event/state.
- Thêm fake LLM và unit tests cho pipeline hiện tại.
- Bổ sung `pipeline_version`, `model_name`, `prompt_version` vào internal result.

### Files ảnh hưởng chính

```text
main.py
core/llm_service.py
services/entity_pipeline/pipeline.py
api/schemas.py
requirements.txt
tests/
```

### Exit criteria

- Test không cần API key thật.
- Provider error trả explicit error.
- Cùng fixture tạo output schema ổn định.
- Config không hard-code model/origin/endpoint.

## Phase 1 — Domain và repository boundary

> **Status:** Completed on 2026-09-06. Domain models no longer depend on API schemas; repository contracts have in-memory and JSON implementations; storage-oriented legacy routes use `NarrativeApplicationService`. The compound confirm/interaction orchestration remains a compatibility path until the proposal workflow replaces its direct aggregate mutation in Phase 3.

### Tasks

- Tạo domain models không phụ thuộc Pydantic API schemas.
- Định nghĩa repository protocols:

```python
class NarrativeRepository:
    def get_story_brain(...): ...
    def list_entities(...): ...
    def append_event(...): ...
    def save_proposals(...): ...
    def decide_proposal(...): ...
    def get_current_state(...): ...
```

- Bọc `StoryKBManager` thành `JsonNarrativeRepository`.
- Chuyển route logic sang application services.
- Route cũ vẫn gọi application service để giữ compatibility.

### Exit criteria

- API hiện tại vẫn chạy với JSON repository.
- Application service không import `Path` hoặc thao tác file.
- Repository contract có tests dùng in-memory/fake repository.

## Phase 2 — PostgreSQL foundation

> **Status:** Implementation completed on 2026-09-06 and live PostgreSQL validation completed on 2026-09-17. Alembic upgrade/downgrade, data preservation, tenant isolation, idempotency conflicts, optimistic locking and concurrent writes pass against a disposable PostgreSQL 16.4 Compose database.

### Tasks

- Thêm SQLAlchemy, Alembic và psycopg.
- Tạo schema `narrative` và migration theo `DATA_MODEL.md`.
- Triển khai repository cho:
  - story brain;
  - entity/alias/mention;
  - analysis run;
  - proposal/decision.
- Thêm transaction helper và optimistic locking.
- Thêm tenant/novel scoping vào mọi query.
- Feature flag chọn `json` hoặc `postgres` repository.

### Exit criteria

- Migration up/down chạy trên database test sạch.
- Hai tenant không đọc/ghi chéo dữ liệu.
- Idempotency conflict được phát hiện.
- JSON và PostgreSQL repositories vượt cùng contract tests.

## Phase 3 — Revision analysis và proposal workflow

> **Status:** Completed on 2026-09-06. Revision analysis is idempotent and proposal-first; evidence spans are hash-bound to immutable revisions; individual and dependency-group review APIs are available; PostgreSQL materializes entity, alias, fact and event proposals in one row-locked transaction with actor audit and one `brain_version` increment. JSON and in-memory adapters provide equivalent single-write behavior for compatibility and tests. Platform revision content is accessed through an authenticated HTTP adapter.

### Tasks

- Thêm Platform revision client interface.
- Triển khai `POST /revisions/{id}/analyses`.
- Tạo `analysis_runs` theo idempotency key.
- Pipeline tạo proposal thay vì ghi KB trực tiếp.
- Triển khai proposal list/accept/reject/edit-and-accept.
- Materialization transaction cho entity, alias, fact và event.
- Thêm audit actor và brain version conflict.

### Mapping từ code hiện tại

| Hiện tại | Sau migration |
|---|---|
| `EntityPipeline.run` | Extraction tool |
| `entity_resolver` | Resolution service |
| `event_summarizer` | Event proposal generator |
| `interaction_service` | Proposal policy/validation |
| `StoryKBManager.upsert_*` | Repository materializer |
| `/kb/confirm` | Proposal decision adapter |

### Exit criteria

- LLM không ghi canonical table trực tiếp.
- Phân tích lại cùng revision không tạo run/proposal trùng.
- Author lock ngăn proposal conflict được materialize.
- Evidence link mở đúng span trong revision.

## Phase 4 — Event sourcing và state projection

> **Status:** Completed and verified on 2026-09-17 for the revision/proposal API. Confirmed transitions, participant records, deterministic state/relationship projections, atomic correction acceptance, rebuild API/CLI and migration 0002 are implemented. Memory, JSON and SQL compatibility tests pass. Live PostgreSQL migration, rollback, isolation and concurrency tests pass in a disposable Compose database; the HTTP/Newman suite and restart runner also verify proposal/state persistence and correction replay with a later event. See [STATE_PROJECTION.md](STATE_PROJECTION.md) for rollout, rollback and legacy compatibility limits.

### Tasks

- Materialize confirmed events và participants.
- Chuyển state updater thành state-transition proposal generator.
- Tạo projector cập nhật `current_entity_states`.
- Tạo rebuild command từ initial facts + events.
- Chuyển relationship inference thành projection có provenance.
- Thêm correction/supersedes workflow.

### Exit criteria

- Rebuild tạo state giống online projection trên fixtures.
- Failed projection có thể retry idempotently.
- Không có current state không truy ngược được transition.
- Historical event không bị overwrite.

## Phase 5 — Import existing manuscript

> **Status:** Completed and verified on 2026-09-17. The import API now creates durable, idempotent bootstrap jobs from immutable revisions, checkpoints every chapter, segments scenes, extracts explicit world rules, resolves canonical entities across chapters, prioritizes review, gates baseline activation, and supports safe duplicate merges. The author frontend includes import onboarding and a priority review queue. See [MANUSCRIPT_IMPORT.md](MANUSCRIPT_IMPORT.md) for the API flow, recovery behavior, and operational checks.

### Tasks

- Triển khai bootstrap job từ danh sách revisions.
- Chunk theo chapter/scene và lưu progress.
- Resolve entity xuyên chương.
- Tạo review priority cho conflict, ambiguity và world rules.
- Thêm baseline activation khi required proposals đã review.
- Cập nhật frontend onboarding và review queue.

### Exit criteria

- Import fixture nhiều chương có thể resume sau worker restart.
- Entity alias không tăng vô hạn khi retry.
- Baseline chỉ active sau review checkpoint.
- Author có thể merge duplicate entity an toàn.

## Phase 6 — Context builder và writing loop

> **Status:** Completed and accepted on 2026-09-21. Structured context, writing generation, revision acceptance, temporal provenance, service-auth boundary, transactional outbox/fencing, Mongo reconciliation, and Platform↔AI integration were hardened through Phase 6.5. The project owner verified the root Compose/web flow and authorized Phase 7.

### Tasks

- Tạo structured context package.
- Retrieval ban đầu dùng SQL filters: entity, recent events, importance và timeline.
- Chuyển `/suggest-next` sang generation application service.
- Trả patch/draft, không tự apply.
- Chạy deterministic validation trước khi trả result.
- Frontend preview diff; Platform tạo revision mới khi accept.

### Exit criteria

- Mỗi generation lưu IDs của context artifacts đã sử dụng.
- Stale brain/revision trả conflict.
- Accept generation tạo revision qua Platform, không ghi editor ngầm.
- Generation không vi phạm locked facts trong golden cases.

## Phase 7 — Semantic retrieval

> **Status:** Active from 2026-09-21. P7-01 embedding benchmark gate accepted on 2026-09-22: `gemini-embedding-2 @ 768`, cosine distance, L2 normalization. Proceed with pgvector/memory foundation before semantic retrieval integration.

### Tasks

- Chọn embedding model/dimension qua ADR.
- Tạo summaries và `memory_chunks`.
- Thêm pgvector migration/index.
- Hybrid rank:

```text
semantic score
+ entity overlap
+ temporal relevance
+ importance
+ relationship relevance
```

- Context compression và token budget.
- Retrieval evaluation offline.

### Exit criteria

- Hybrid retrieval tốt hơn recent-only baseline trên labeled queries.
- Không index rejected/proposed artifacts như canonical memory.
- Embeddings có thể xóa/rebuild theo version.

## Phase 8 — Cutover và cleanup

### Tasks

- Chạy JSON migration tool ở dry-run.
- So sánh entity/event/state snapshots.
- Chuyển frontend sang API mới.
- Route legacy thêm deprecation header.
- Chuyển JSON repository read-only.
- Sau một release ổn định mới xóa direct JSON write paths.

### Exit criteria

- Không còn production write vào JSON.
- Rollback procedure được diễn tập.
- API và migration documentation cập nhật.
- Metrics/error budgets ổn định trong thời gian quan sát đã chốt.

## Dependency graph

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ├→ Phase 5
  └→ Phase 6
       ↓
     Phase 7
       ↓
     Phase 8
```

## Pull request strategy

- Mỗi PR chỉ thay một boundary hoặc vertical slice nhỏ.
- Migration và repository tests nằm cùng PR.
- Không trộn cleanup dependency với thay đổi behavior lớn.
- Route legacy và route mới cùng tồn tại trong migration period.
- Feature flag mặc định giữ behavior cũ cho đến khi integration tests pass.

## Definition of Done cho mỗi capability

- API schema và error contract.
- Domain invariant tests.
- Repository/integration tests.
- Structured logs và metrics.
- Migration/rollback nếu có schema change.
- Security review cho tenant/authorization.
- Documentation và ADR cập nhật.

## Review gates trước khi code

- [x] Chấp nhận `DATA_MODEL.md` và transaction boundaries.
- [x] Chấp nhận `API_CONTRACTS.md`.
- [x] Chọn cùng PostgreSQL database với schema `narrative` riêng.
- [x] Chốt Platform internal revision API làm provider mặc định và standalone adapter làm fallback.
- [x] Chốt proposal auto-materialization và dependency-group acceptance policy.
- [x] Hoãn full planning suite; World Bible review là baseline gate của MVP.
- **Phase 3 gate:** chọn queue implementation; không block Phase 0–2.
- [x] **Phase 7 gate:** embedding model/dimension accepted via ADR-012 (`gemini-embedding-2 @ 768`).

Pre-implementation phase được xem là hoàn tất khi các mục phase-gated có owner và deadline theo phase như trên; không cần khóa sớm công nghệ chưa được dùng ở Phase 0–2.
