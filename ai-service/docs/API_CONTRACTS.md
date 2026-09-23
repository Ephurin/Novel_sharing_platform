# API Contracts — Narrative Memory and Writing

> Status: Accepted design baseline. Các endpoint là API đích đã review; API hiện hành vẫn được mô tả tại [API_DOC.md](API_DOC.md).

## Các quyết định đã chấp nhận

1. Tác vụ import/analyze là asynchronous job và trả `202 Accepted`.
2. Analysis/import chỉ stream progress; writing generation stream provisional token và kết thúc bằng final validated draft.
3. Mọi state-changing request cần `Idempotency-Key`.
4. Platform cấp JWT hoặc service token chứa tenant/user context.
5. Author review thao tác trên proposal nguyên tử.
6. API không cho AI client ghi trực tiếp event/state canonical.
7. Proposal được review nguyên tử và accept atomic theo dependency group; MVP không partial success.
8. Platform internal revision API là provider mặc định; signed URL và standalone repository là adapter thay thế.
9. Full analysis chạy tại explicit/debounced checkpoint, không chạy theo mọi autosave.

## Base conventions

```text
Base path: /v1
Content-Type: application/json
Identifier: UUID string
Timestamp: RFC 3339 UTC
Pagination: cursor-based
```

### Required headers

```http
Authorization: Bearer <token>
X-Tenant-Id: <uuid>
X-Request-Id: <uuid>
Idempotency-Key: <opaque-string>   # required for mutations
```

`author_id` lấy từ verified token, không tin giá trị do client tự gửi trong body.

### Response envelope

Success:

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid",
    "schema_version": 1
  }
}
```

List:

```json
{
  "data": [],
  "meta": {
    "request_id": "uuid",
    "next_cursor": "opaque-or-null"
  }
}
```

Error:

```json
{
  "error": {
    "code": "REVISION_NOT_FOUND",
    "message": "Chapter revision was not found",
    "details": {},
    "retryable": false
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

## Error taxonomy

| HTTP | Code | Ý nghĩa |
|---|---|---|
| 400 | `INVALID_REQUEST` | Body hoặc query không hợp lệ |
| 401 | `UNAUTHENTICATED` | Token thiếu/hết hạn |
| 403 | `FORBIDDEN` | Không có quyền trên novel |
| 404 | `STORY_BRAIN_NOT_FOUND` | Story Brain không tồn tại |
| 404 | `REVISION_NOT_FOUND` | Revision không tồn tại |
| 409 | `IDEMPOTENCY_CONFLICT` | Cùng key nhưng payload khác |
| 409 | `BRAIN_VERSION_CONFLICT` | Proposal dựa trên brain version cũ |
| 409 | `PROPOSAL_ALREADY_DECIDED` | Proposal không còn pending |
| 422 | `CONTENT_HASH_MISMATCH` | Hash không khớp revision |
| 422 | `BOOTSTRAP_LIMIT_EXCEEDED` | Manuscript vượt giới hạn chapter/ký tự của một job |
| 422 | `MALFORMED_MODEL_OUTPUT` | Output LLM không qua schema validation |
| 429 | `RATE_LIMITED` | Provider hoặc product limit |
| 502 | `MODEL_PROVIDER_ERROR` | Provider lỗi, có thể retry |
| 503 | `MODEL_UNAVAILABLE` | Không có provider khả dụng |
| 503 | `JOB_QUEUE_UNAVAILABLE` | Queue không nhận job |

## Job model

```json
{
  "id": "job_uuid",
  "job_type": "bootstrap_manuscript",
  "status": "queued",
  "progress": {
    "current": 0,
    "total": 10,
    "unit": "chapter"
  },
  "result": null,
  "error": null,
  "created_at": "2026-08-23T10:00:00Z",
  "updated_at": "2026-08-23T10:00:00Z"
}
```

Status:

```text
queued → running → waiting_review → completed
                  ↘ failed
queued/running → cancelled
```

## UC-01 — Bootstrap from idea

### `POST /v1/story-brains/bootstrap/from-idea`

Tạo Story Blueprint proposal từ ý tưởng.

Request:

```json
{
  "novel_id": "uuid",
  "idea": "Một pháp sư mất trí nhớ điều tra cái chết của chính mình.",
  "locale": "vi-VN",
  "preferences": {
    "genre": ["fantasy", "mystery"],
    "tone": "dark",
    "target_length": "long_form"
  },
  "author_constraints": [
    "Không có du hành thời gian"
  ]
}
```

Response `202`:

```json
{
  "data": {
    "job_id": "uuid",
    "story_brain_id": "uuid",
    "status": "queued"
  },
  "meta": {
    "request_id": "uuid",
    "schema_version": 1
  }
}
```

Job result tạo proposal loại:

```text
premise
world_rule
entity
initial_state
relationship
open_question
```

Không tạo historical event hoặc planning object. Baseline chỉ active sau khi tác giả review World Bible bắt buộc.

## UC-02 — Bootstrap from manuscript

### `POST /v1/story-brains/bootstrap/from-manuscript`

Client gửi danh sách immutable revision ID thay vì upload lại raw content vào AI service.

```json
{
  "novel_id": "uuid",
  "revisions": [
    {
      "chapter_id": "uuid",
      "revision_id": "uuid",
      "content_hash": "sha256"
    }
  ],
  "locale": "vi-VN",
  "options": {
    "extract_world_rules": true,
    "build_embeddings": false,
    "require_review_for_all": true
  }
}
```

Response `202` trả job. Worker đọc nội dung revision qua `RevisionContentProvider`:

1. `PlatformRevisionContentProvider`: mặc định, gọi internal API bằng service credential.
2. `SignedUrlRevisionContentProvider`: tùy chọn cho object storage/file lớn; URL có thời hạn ngắn và không được ghi log.
3. `StandaloneRevisionContentProvider`: đọc local revision repository khi chạy độc lập.

Platform tính SHA-256 khi lưu immutable revision; Copilot verify `content_hash` trước khi phân tích.

### Upload adapter

Nếu người dùng import DOCX/Markdown trực tiếp, Platform chịu trách nhiệm:

```text
Upload → Parse → Create Novel/Chapter/Revisions → Call bootstrap API
```

Narrative service không trở thành document storage.

### Bootstrap limits

Mặc định một job nhận tối đa 100 chapter và 2.000.000 Unicode characters sau parse. Limit là cấu hình deployment; request vượt ngưỡng trả `BOOTSTRAP_LIMIT_EXCEEDED` cùng giới hạn và batch size gợi ý. Manuscript lớn được chia batch theo chapter rồi chạy global merge/consistency pass.

## Jobs

### `GET /v1/jobs/{job_id}`

Trả trạng thái, progress và result summary.

### `GET /v1/jobs/{job_id}/events`

SSE stream:

```text
event: progress
data: {"current":3,"total":10,"unit":"chapter"}

event: proposal_batch
data: {"count":25}

event: token
data: {"delta":"Bản nháp tạm thời...","provisional":true}

event: completed
data: {"job_id":"uuid","result_status":"validated"}
```

Event `token` chỉ xuất hiện với writing generation. Analysis/import không stream model output, chỉ stream stage/progress.

### `POST /v1/jobs/{job_id}/cancel`

Cancellation là best effort. Proposal đã ghi vẫn được giữ nhưng đánh dấu `expired` nếu run bị hủy trước review.

## Story Brain queries

### `GET /v1/story-brains/by-novel/{novel_id}`

```json
{
  "data": {
    "id": "uuid",
    "novel_id": "uuid",
    "status": "active",
    "brain_version": 18,
    "counts": {
      "entities": 42,
      "events": 126,
      "pending_proposals": 8,
      "open_findings": 3
    }
  },
  "meta": {}
}
```

### `GET /v1/story-brains/{brain_id}/entities`

Query:

```text
type=character
status=confirmed
query=tieu
cursor=...
limit=50
```

### `GET /v1/story-brains/{brain_id}/events`

Query theo `entity_id`, `chapter_id`, `from_order`, `to_order`, `event_type`.

### `GET /v1/story-brains/{brain_id}/state`

Trả current state projection và `brain_version`.

### `GET /v1/story-brains/{brain_id}/context-preview`

Chỉ dành cho debug/author transparency.

Query:

```text
operation=continue
chapter_id=<uuid>
revision_id=<uuid>
selection_start=100
selection_end=500
```

Response không chứa chain-of-thought. Chỉ trả context artifacts và provenance.

`semantic_memories` là lớp retrieval bổ sung, không thay thế `recent_events` canonical. Writing generation chỉ kích hoạt semantic retrieval khi có query + canonical chapter cutoff; nếu semantic provider/storage không khả dụng thì context quay về Phase 6 SQL deterministically.

P7-04 rerank semantic candidates bằng deterministic hybrid rank sau khi P7-03 đã áp dụng tenant/version/freshness/temporal filters. Trace public/debug có thể chứa `semantic_ranking_version` và các component score bounded; đây là retrieval provenance, không phải chain-of-thought. Nếu hybrid signal resolution lỗi sau khi exact semantic candidates đã có, hệ thống giữ semantic-only ordering thay vì bỏ toàn bộ semantic retrieval:

```json
{
  "data": {
    "brain_version": 18,
    "entities": [],
    "current_states": [],
    "recent_events": [],
    "semantic_memories": [],
    "world_rules": [],
    "author_constraints": [],
    "token_budget": {
      "used": 7200,
      "maximum": 12000
    }
  },
  "meta": {}
}
```

## Revision analysis

### `POST /v1/revisions/{revision_id}/analyses`

```json
{
  "novel_id": "uuid",
  "chapter_id": "uuid",
  "content_hash": "sha256",
  "operation": "incremental_story_analysis",
  "base_revision_id": "uuid-or-null",
  "options": {
    "extract_entities": true,
    "extract_events": true,
    "check_consistency": true,
    "build_embeddings": false
  }
}
```

Response `202`:

```json
{
  "data": {
    "job_id": "uuid",
    "analysis_run_id": "uuid",
    "status": "queued"
  },
  "meta": {}
}
```

Nếu cùng idempotency key đã hoàn thành, trả lại resource cũ thay vì chạy lại.

## Proposal review

### `GET /v1/story-brains/{brain_id}/proposals`

Query:

```text
status=pending
type=event
min_confidence=0.0
sort=priority
cursor=...
limit=50
```

Proposal representation:

```json
{
  "id": "uuid",
  "dependency_group_id": "uuid",
  "materialization_order": 20,
  "proposal_type": "state_transition",
  "payload": {
    "entity_id": "uuid",
    "attribute": "health",
    "previous_value": 100,
    "new_value": 20
  },
  "evidence": [
    {
      "revision_id": "uuid",
      "start": 520,
      "end": 603,
      "text_hash": "sha256"
    }
  ],
  "confidence": 0.94,
  "status": "pending",
  "expected_brain_version": 18
}
```

### `POST /v1/proposals/{proposal_id}/accept`

```json
{
  "expected_brain_version": 18
}
```

Response `200` trả canonical artifact ID và brain version mới.

### `POST /v1/proposals/{proposal_id}/reject`

```json
{
  "reason": "Hai tên này là hai nhân vật khác nhau"
}
```

### `POST /v1/proposals/{proposal_id}/edit-and-accept`

```json
{
  "expected_brain_version": 18,
  "edited_payload": {
    "entity_id": "uuid",
    "attribute": "health",
    "previous_value": 100,
    "new_value": 35
  },
  "reason": "Nhân vật chỉ bị thương nhẹ"
}
```

### Bulk decision

### `POST /v1/proposal-groups/{group_id}/accept`

```json
{
  "expected_brain_version": 18,
  "proposal_ids": ["uuid", "uuid"]
}
```

Proposal là đơn vị review; dependency group là đơn vị commit. Backend lock Story Brain và toàn group, validate cùng tenant/version, materialize theo dependency order rồi tăng `brain_version` đúng một lần. MVP atomic all-or-nothing; không partial success. Endpoint individual accept chỉ dùng cho proposal không có dependency hoặc group một phần tử.

## Lock và author facts

### `POST /v1/facts`

Tác giả tạo canonical fact trực tiếp:

```json
{
  "story_brain_id": "uuid",
  "subject_entity_id": "uuid-or-null",
  "fact_type": "world_rule",
  "fact_key": "magic.resurrection",
  "fact_value": {
    "allowed": false
  },
  "is_locked": true,
  "expected_brain_version": 19
}
```

### `POST /v1/facts/{fact_id}/lock`

### `POST /v1/facts/{fact_id}/unlock`

Unlock cần explicit author action và audit reason.

## Author canonical mutations

Author đã xác thực có thể tạo/sửa canonical entity, fact và relationship trực tiếp với `source_type='author'`; mọi mutation cần `expected_brain_version`, audit reason và `Idempotency-Key`.

```text
POST  /v1/story-brains/{brain_id}/entities
PATCH /v1/entities/{entity_id}
POST  /v1/story-brains/{brain_id}/relationships
PATCH /v1/relationships/{relationship_id}
POST  /v1/story-brains/{brain_id}/events
POST  /v1/events/{event_id}/supersede
```

Historical event không có endpoint update tại chỗ. Sửa event tạo record mới với `supersedes_id`, commit canonical mutation rồi enqueue impact analysis để tạo finding cho revision/source span bị ảnh hưởng.

## Writing generation

### `POST /v1/writing/generations`

```json
{
  "novel_id": "uuid",
  "chapter_id": "uuid",
  "revision_id": "uuid",
  "content_hash": "sha256",
  "operation": "continue",
  "selection": {
    "start": 1200,
    "end": 1600
  },
  "instruction": "Tiếp tục cảnh theo hướng căng thẳng nhưng không giao chiến",
  "constraints": [
    "Không thay đổi địa điểm",
    "Không làm nhân vật A hồi phục"
  ],
  "style": {
    "mood": "tense",
    "length": "medium"
  },
  "expected_brain_version": 19
}
```

Operation:

```text
continue
expand
rewrite
dialogue
brainstorm
generate_scene
```

Response `202` trả job. SSE token là provisional preview; frontend không apply vào editor. Job result cuối cùng đã qua schema/consistency validation:

```json
{
  "generation_id": "uuid",
  "base_revision_id": "uuid",
  "brain_version": 19,
  "draft": "...",
  "patch": {
    "start": 1200,
    "end": 1600,
    "replacement": "..."
  },
  "validations": [],
  "context_summary": {
    "entity_ids": [],
    "event_ids": [],
    "fact_ids": [],
    "memory_chunk_ids": []
  },
  "model": {
    "name": "provider-model",
    "prompt_version": "writing-v1"
  }
}
```

AI service không apply patch. Frontend preview; Platform tạo revision mới sau khi tác giả accept.

## Consistency findings

### `GET /v1/story-brains/{brain_id}/findings`

Filter theo revision, severity, status và finding type.

### `POST /v1/findings/{finding_id}/dismiss`

Dismiss reason được dùng cho evaluation, không tự tạo canonical fact.

### `POST /v1/findings/{finding_id}/resolve`

Gắn `resolved_revision_id` để xác minh correction.

## Events từ Platform

### `ChapterRevisionSaved`

```json
{
  "event_id": "uuid",
  "event_type": "ChapterRevisionSaved",
  "occurred_at": "2026-08-23T10:00:00Z",
  "tenant_id": "uuid",
  "novel_id": "uuid",
  "chapter_id": "uuid",
  "revision_id": "uuid",
  "content_hash": "sha256",
  "actor_id": "uuid"
}
```

Consumer deduplicate theo `event_id` và chỉ enqueue analysis khi revision là latest hoặc được yêu cầu rõ.

### Outbound events

```text
NarrativeAnalysisCompleted
StoryBrainBaselineReady
ProposalAccepted
ConsistencyFindingCreated
WritingGenerationCompleted
```

## Backward compatibility

API hiện tại tiếp tục hoạt động trong migration period:

```text
/v1/ai/extract-entities
/v1/ai/suggest-next
/v1/ai/analyze/chapter
/v1/ai/kb/confirm
/v1/enhanced/process-interactions
```

Chiến lược:

1. Tách application services phía dưới route cũ.
2. Route mới gọi cùng services nhưng dùng revision/proposal contract.
3. Thêm deprecation header cho route ghi JSON trực tiếp.
4. Chỉ xóa route legacy sau khi frontend chuyển hoàn toàn và migration verified.

## Analysis checkpoint policy

- Autosave chỉ lưu draft/revision; không enqueue full LLM analysis cho mọi lần lưu.
- Full analysis chạy khi author yêu cầu, accept AI draft, hoàn thành chapter hoặc sau debounce 30–120 giây không chỉnh sửa theo cấu hình.
- Dedupe theo `revision_id`, `content_hash`, operation và pipeline version; job revision cũ bị cancel hoặc đánh dấu obsolete.
- Thay đổi quá nhỏ có thể chỉ chạy lightweight deterministic checks.

## Quyết định theo phase

- Queue implementation được chọn trước Phase 3; API job contract không phụ thuộc Celery hay Dramatiq.
- Embedding model/dimension được benchmark và chốt trước Phase 7.
