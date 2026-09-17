# Test and Evaluation Strategy

> Status: Accepted evaluation baseline. Quality gate phải đo được cả software correctness và AI behavior.

## Nguyên tắc

1. Deterministic logic dùng deterministic tests.
2. Default test suite không gọi provider thật.
3. LLM evaluation không thay thế schema, invariant và integration tests.
4. Human-labeled evidence là chuẩn chính; LLM-as-judge chỉ là tín hiệu phụ.
5. Mọi regression gắn pipeline/model/prompt/dataset version.

## Test pyramid

```text
           Provider smoke tests
          End-to-end workflows
       API + repository integration
    Domain / projection / contract tests
Normalization / parsing / rule unit tests
```

## Unit tests

### Entity

- Normalize dấu/case/khoảng trắng.
- Alias resolution.
- Không merge hai entity trùng tên thiếu evidence.
- Pronoun/generic word filtering.
- Locked canonical entity không bị đổi loại.

### Event

- Pydantic/schema validation.
- Participant mapping.
- Source span validation.
- Narrative ordering.
- Supersedes/correction behavior.

### State projection

- Apply transition đúng thứ tự.
- Replay deterministic.
- Duplicate transition không apply hai lần.
- Invalid transition tạo finding hoặc rejection.
- Optimistic locking conflict.

### Consistency rules

- Dead character appears.
- Impossible location jump.
- Item used without ownership.
- Injury/action conflict.
- Timeline contradiction.
- Locked world-rule violation.

## Repository contract tests

Chạy cùng test suite cho:

```text
FakeNarrativeRepository
JsonNarrativeRepository
PostgresNarrativeRepository
```

Contract gồm:

- tenant isolation;
- idempotent insert;
- pagination order;
- proposal decision transaction;
- brain version conflict;
- event append/supersede;
- state rebuild;
- rollback khi materialization lỗi.

## API contract tests

- Request validation và error envelope.
- Authentication/authorization.
- `Idempotency-Key` reuse với cùng payload.
- Conflict khi cùng key nhưng payload khác.
- Cursor pagination.
- Job lifecycle và cancellation.
- Proposal accept/reject/edit.
- Stale revision/content hash.
- SSE reconnect và terminal event.

## Integration workflows

### Import flow

```text
Create revisions
→ Bootstrap job
→ Proposals
→ Review decisions
→ Activate baseline
→ Query Story Brain
```

### Continuous writing flow

```text
Build context
→ Generate draft
→ Validate
→ Preview/apply
→ Create revision
→ Analyze delta
→ Accept proposals
→ Verify new state
```

### Replay flow

```text
Delete projections
→ Replay facts/events
→ Compare expected snapshot
```

## Golden datasets

Fixture structure:

```text
tests/fixtures/narrative/
├── stories/
│   ├── short_fantasy/
│   └── long_fantasy/
├── labels/
│   ├── entities.json
│   ├── events.json
│   ├── transitions.json
│   ├── consistency.json
│   └── retrieval_queries.json
└── expected/
    ├── baseline_snapshot.json
    └── final_state.json
```

Mỗi label cần:

- story/chapter/revision ID;
- source span;
- annotator;
- label version;
- ambiguity flag;
- adjudication status.

## AI metrics

### Entity extraction/resolution

- Precision/recall/F1 theo entity type.
- Exact span và relaxed span F1.
- Canonical resolution accuracy.
- False merge và missed merge rate.

### Event extraction

- Event factuality.
- Participant/role accuracy.
- Duplicate event rate.
- Consequence/state-transition accuracy.
- Evidence coverage.

### State và consistency

- Replay correctness.
- Finding precision/recall.
- False-positive rate theo severity.
- Evidence correctness.
- Locked-fact violation rate.

### Retrieval

- Recall@K.
- MRR hoặc nDCG trên labeled queries.
- Context precision.
- Token efficiency: relevant tokens / total context tokens.

### Writing

- Author acceptance rate.
- Edit distance sau accept.
- Consistency pass rate.
- Hallucinated fact rate.
- P50/P95 latency và token cost.

## Release gates đề xuất

Các số dưới đây là mục tiêu review, cần hiệu chỉnh sau baseline đầu tiên.

| Capability | Gate MVP |
|---|---|
| Schema-valid structured output | ≥ 99% sau bounded retry trên eval set |
| Entity precision | ≥ 0.85 cho canonical candidate được đề xuất |
| Canonical false merge | ≤ 2% trên labeled aliases |
| Event evidence coverage | 100% proposal có revision/span/hash |
| State replay | 100% deterministic fixtures |
| Duplicate on retry | 0 |
| Tenant isolation | 100% authorization cases |
| High-severity finding precision | ≥ 0.85 |
| Locked-fact violation in accepted generation | 0 trên golden cases |

Không release dựa trên aggregate score nếu một invariant cứng thất bại.

## LLM test doubles

Fake provider phải hỗ trợ:

```text
valid_response
empty_response
malformed_json
schema_invalid
timeout
rate_limit
provider_5xx
quota_exhausted
fallback_success
```

Provider contract test xác minh adapter chuyển các tình huống này thành error taxonomy đúng.

## Prompt/model experiments

Mỗi experiment lưu:

```json
{
  "dataset_version": "narrative-eval-v1",
  "pipeline_version": "2.0.0",
  "prompt_version": "event-v3",
  "model": "provider-model",
  "temperature": 0.1,
  "metrics": {},
  "cost": {},
  "started_at": "..."
}
```

Không thay prompt/model production nếu:

- không chạy regression dataset;
- làm giảm invariant metric;
- tăng cost/latency vượt budget mà không có quality gain được chấp nhận.

## Human evaluation

Mẫu review tối thiểu:

- Hai annotator độc lập cho facts/events quan trọng.
- Adjudication khi bất đồng.
- Tách correctness khỏi writing preference.
- Blind comparison khi đánh giá hai prompt/model.
- Ghi lý do reject/override từ UI làm feedback data.

## Performance tests

Kịch bản:

- Import 10, 100 và 500 chapters.
- Query state/entity/event ở các kích thước khác nhau.
- 10/50/100 concurrent analysis jobs.
- Projection rebuild toàn novel.
- Hybrid retrieval P95.
- SSE reconnect trong job dài.

Đo:

- queue wait;
- worker processing time;
- database query P95;
- provider latency;
- tokens/cost;
- memory/CPU;
- lock/contention rate.

## Failure and recovery tests

- Worker chết giữa extraction.
- Worker chết sau ghi proposal nhưng trước completed status.
- Database disconnect.
- Provider timeout/rate limit.
- Duplicate platform event.
- Proposal accept song song.
- Projection rebuild bị gián đoạn.
- Migration rollback.
- Restore database backup.

## CI suites

### Mỗi PR

```text
format/lint
unit tests
repository contract tests với PostgreSQL ephemeral
API contract tests
small golden regression set
```

### Scheduled/nightly

```text
full golden dataset
provider smoke tests
retrieval benchmark
cost/latency report
long-story replay
```

Provider smoke tests cần secret riêng, budget thấp và không block mọi PR vì external outage.

## Definition of Done cho evaluation

- Dataset/version được ghi lại.
- Baseline và candidate cùng chạy trên một dataset.
- Metrics, latency và cost được so sánh.
- Failure examples được lưu dưới dạng sanitized artifact.
- Gate cứng không thất bại.
- Reviewer chấp nhận trade-off nếu metric mềm giảm.

## Quyết định evaluation

1. Nhóm đồ án annotate golden set; author/domain reviewer adjudicate trường hợp bất đồng.
2. Benchmark đầu tiên dùng truyện dài tiếng Việt thuộc fantasy/mystery, sau đó mới mở rộng genre.
3. High-severity consistency finding phải đạt precision tối thiểu 0.85, tương ứng false-positive tối đa 0.15 trên golden set đã chốt.
4. Rejected proposal payload được dùng cho evaluation trong retention 90 ngày; không dùng train nếu chưa có consent và dataset version rõ ràng.
5. Mọi run phải ghi token/cost. Budget số được thiết lập sau baseline measurement và trước khi bật external provider cho workspace; regression vượt budget không có quality gain bị reject.
