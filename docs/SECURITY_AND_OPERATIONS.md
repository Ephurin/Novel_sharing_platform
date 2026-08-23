# Security and Operations

> Status: Draft for review. Manuscript là dữ liệu riêng tư có giá trị; mặc định phải xử lý như confidential content.

## Security boundaries

- Novel Platform xác thực user và sở hữu permission model.
- Narrative service xác minh JWT/service token và tenant scope.
- Worker dùng service credential tối thiểu để đọc revision cần xử lý.
- LLM provider chỉ nhận context tối thiểu cần thiết cho operation.
- AI output luôn là untrusted data cho đến khi validate.

## Authorization

Mọi request cần xác minh:

```text
token tenant_id == X-Tenant-Id
user có quyền read/write trên novel_id
revision thuộc chapter/novel đó
proposal/finding thuộc cùng tenant/novel
```

Không chỉ dựa vào UUID khó đoán.

### Role tối thiểu

| Action | Author | Collaborator | Viewer | Service |
|---|---:|---:|---:|---:|
| Read Story Brain | ✓ | theo quyền | ✓ | ✓ |
| Request analysis | ✓ | theo quyền | - | ✓ |
| Generate writing | ✓ | theo quyền | - | - |
| Accept/reject proposal | ✓ | theo quyền | - | - |
| Lock/unlock fact | ✓ | theo quyền | - | - |
| Rebuild projection | - | - | - | ✓ |

## Tenant isolation

- Mọi repository method bắt buộc nhận `tenant_id`.
- Index bắt đầu bằng tenant khi query theo tenant thường xuyên.
- Test negative cross-tenant cho mọi resource route.
- Có thể bật PostgreSQL Row-Level Security như defense-in-depth sau khi repository scoping ổn định.
- Worker payload luôn mang tenant/novel IDs và được validate lại khi consume.

## Manuscript privacy

- Không log raw chapter, prompt hoặc model response mặc định.
- Log ID, hash, length, model, latency và error code.
- Debug capture là opt-in, encrypted và retention ngắn.
- Không dùng manuscript khách hàng cho training/evaluation nếu chưa có consent rõ.
- Evaluation artifacts phải anonymize hoặc dùng synthetic/licensed text.

## LLM provider controls

- Provider allowlist theo environment/workspace.
- API keys nằm trong secret manager/environment, không lưu DB/source.
- Timeout và bounded retry.
- Không gửi toàn novel nếu operation chỉ cần một context package.
- Ghi provider/model và data-policy configuration vào audit metadata.
- Có kill switch theo provider/model.

## Prompt injection và untrusted content

Manuscript có thể chứa câu giống instruction. Context builder phải phân tách:

```text
SYSTEM POLICY
AUTHOR INSTRUCTION
STRUCTURED MEMORY
UNTRUSTED MANUSCRIPT CONTENT
```

- Không cho manuscript thay đổi tool permissions.
- Không thực thi URL/code/command lấy từ manuscript.
- Tool arguments được schema validate.
- Retrieval content luôn được đánh dấu provenance và trust level.

## Data integrity

- Immutable revision + content hash.
- Idempotency key cho mutation/job.
- Optimistic locking bằng `brain_version`/`row_version`.
- Proposal decision + materialization trong cùng transaction.
- Event/fact correction dùng `supersedes_id`, không overwrite history.
- Projection có thể rebuild.

## Rate limits và budgets

Giới hạn theo tenant/user/operation:

```text
requests per minute
concurrent jobs
chapters per bootstrap
tokens per generation
daily token/cost budget
retry count
job execution timeout
```

Khi hết budget, job không tự đổi sang provider đắt hơn nếu workspace chưa cho phép.

## Logging và tracing

Mỗi request/job cần:

```text
request_id
trace_id
job_id
analysis_run_id
tenant_id
novel_id
revision_id
operation
pipeline/model/prompt version
status/error code
latency/token usage/cost
```

Không log access token, API key, raw manuscript hoặc chain-of-thought.

## Metrics

### API

- Request rate/error rate/P50/P95.
- Authorization failures.
- Idempotency conflicts.

### Jobs

- Queue depth/wait time.
- Running/completed/failed/cancelled.
- Retry và dead-letter count.

### AI

- Provider error/rate-limit.
- Malformed/schema-invalid output.
- Input/output tokens và estimated cost.
- Fallback rate.

### Narrative

- Pending proposals.
- Brain version conflicts.
- Projection lag/rebuild failures.
- Findings theo severity.

## Initial SLO proposals

Các số cần review sau khi có baseline:

| Capability | Mục tiêu ban đầu |
|---|---|
| Read Story Brain API | P95 < 500 ms, 99.9% availability |
| Proposal decision | P95 < 1 s, 99.9% availability |
| Interactive generation | P95 time-to-first-progress < 2 s |
| Revision analysis | 95% hoàn thành trong 2 phút/chapter chuẩn |
| Job durability | Không mất accepted job sau process restart |
| Projection lag | < 30 giây sau accepted proposal |

Provider outage được tách khỏi internal API availability nhưng phải phản ánh trong operation success rate.

## Retry policy

Retry chỉ cho transient failures:

```text
network timeout
provider 429/5xx
temporary database/queue errors
```

Không retry tự động:

```text
invalid request
schema-invalid sau max repair
authorization failure
content hash mismatch
brain version conflict
author rejection
```

Retry dùng exponential backoff + jitter và idempotency key giữ nguyên.

## Backup và disaster recovery

- PostgreSQL automated backup + point-in-time recovery.
- Kiểm tra restore định kỳ.
- Embeddings/projections được xem là rebuildable nhưng canonical facts/events/proposals/decisions phải backup.
- Lưu migration version và projection version.
- Rebuild run phải resumable và audit được.

RPO/RTO cần chốt với Novel Platform; đề xuất MVP review:

```text
RPO ≤ 15 phút
RTO ≤ 4 giờ
```

## Data deletion

- Soft delete ở Platform không tự xóa Narrative Memory nếu còn recovery window.
- Hard delete phát `NovelDeleted` với tenant/novel ID.
- Worker xóa canonical và derived data theo transaction/batch có audit.
- Provider-side retention phụ thuộc hợp đồng/cấu hình và phải được document.

## Deployment environments

```text
local: JSON hoặc PostgreSQL local, fake LLM mặc định
test: ephemeral PostgreSQL, fake provider
staging: PostgreSQL + queue + restricted real provider
production: managed PostgreSQL + durable queue + secret manager
```

Không dùng production manuscript trong local/test.

## Operational runbooks cần có trước production

- Provider outage/quota exhausted.
- Queue backlog.
- Failed/stuck job.
- Projection rebuild.
- Database migration rollback.
- Tenant data incident.
- Secret rotation.
- Cost spike.
- Hard-delete request.

## Open questions

1. JWT issuer/audience và permission claims cụ thể?
2. Có workspace nào cấm gửi dữ liệu tới external LLM không?
3. Retention cho rejected proposal/debug artifact?
4. RPO/RTO chính thức?
5. Có bật PostgreSQL RLS trong MVP không?
6. Cost budget mặc định theo plan/workspace?
