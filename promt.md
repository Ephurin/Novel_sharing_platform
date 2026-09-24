# Active Handoff — Ephurin Novel Platform

> Repo: `Ephurin/Novel_sharing_platform`  
> Branch of truth: `main`  
> File này chỉ giữ **active context**. Không nhét lịch sử phase dài vào đây.
>
> Lịch sử/acceptance/evidence đã có dưới `docs/development/` và các tài liệu kiến trúc trong `ai-service/docs/`.

---

## 1. Workflow hiện tại

- **User = Supervisor / final decision maker**
  - điều hướng scope;
  - quyết định ACCEPT cuối cùng;
  - mở phase/slice mới.

- **ChatGPT/Astra = developer / architect / reviewer**
  - thiết kế;
  - sửa code;
  - review;
  - chuẩn bị test/evidence contract;
  - không tự tuyên bố ACCEPT thay Supervisor.

- **Gemini = local execution / verification worker**
  - chạy test thật trên máy local có Docker;
  - chạy Compose/live integration;
  - ghi lại command + kết quả thật;
  - không tự mở scope;
  - không tự sửa kiến trúc nếu chưa có lỗi tái hiện rõ ràng.

Quy tắc chung:

- Test pass != acceptance.
- Không reset/clean/force-push.
- Không xóa dữ liệu người dùng.
- Không commit secret/key/local credential.
- Không gọi mock/unit test là live integration evidence.
- Không fabricate PASS.
- Nếu test fail: giữ nguyên log, xác định command fail + lỗi đầu tiên có ý nghĩa, rồi handoff cho ChatGPT/Astra xử lý.
- `promt.md` chỉ chứa active state + active task.

---

## 2. Frozen architecture invariants

### Phase 6 / 6.5 — ACCEPTED

Giữ nguyên:

- Browser/Mobile -> Node Platform API / AI Gateway -> FastAPI AI Service.
- Browser/mobile không gọi FastAPI trực tiếp.
- Node gateway giữ auth/role/ownership boundary.
- Protected FastAPI fail closed.
- Canonical revision/chapter provenance.
- Temporal cutoff chống future leakage.
- Context hash + generation trace.
- Accept-time freshness.
- Transactional outbox + lease/fencing.
- Mongo reconciliation.
- PostgreSQL là production narrative repository.

### Phase 7 — ACCEPTED / CLOSED

Giữ nguyên:

- canonical Story Brain là authoritative truth;
- semantic memory là derived/rebuildable;
- embedding:
  - model: `gemini-embedding-2`
  - dimension: `768`
  - explicit L2 normalization
  - cosine distance `<=>`
  - version: `gemini-embedding-2-768-v1`;
- temporal filter chạy trước semantic ranking;
- stale/wrong-version/future semantic rows không được vào candidate set;
- hybrid rank = deterministic rerank;
- context packing = deterministic whole-artifact selection/dedup;
- protected canonical artifacts không silent truncate;
- không ANN/specialized vector DB trong accepted MVP.

Chi tiết xem:

- `ai-service/docs/ADR-012-EMBEDDING-MODEL.md`
- `docs/development/P7-*/`

---

## 3. Phase 8 — CUTOVER AND CLEANUP

Safety invariant:

```text
cut over only after parity evidence
retain rollback path through stability window
delete legacy write paths only after explicit final cleanup gate
```

Không tự động xóa JSON source hoặc PostgreSQL data.

### P8-01 — ACCEPTED

JSON -> PostgreSQL dry-run migration + canonical snapshot parity.

- PR #5
- merge commit: `d639979f59b7867ee4863e886afb6065214b4f7d`
- evidence:
  - `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY-report.md`
  - `docs/development/P8-01-JSON-POSTGRES-MIGRATION-PARITY/`

### P8-02 — ACCEPTED

Frontend/API canonical cutover verification.

- PR #6
- merge commit: `12a0dc57186472c72c5318d8f3bde5185d33f307`
- accepted boundary:

```text
Browser / mobile
  -> Platform API (/api/v1)
  -> Node AI Gateway (/api/v1/ai/*)
  -> service-authenticated FastAPI
```

- evidence:
  - `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER-report.md`
  - `docs/development/P8-02-FRONTEND-API-CANONICAL-CUTOVER/`

### Remaining slices

```text
P8-03  legacy deprecation + JSON read-only production mode
P8-04  rollback rehearsal + cleanup readiness
P8-05  destructive legacy removal — deferred until post-release stability gate
```

**P8-03 is NOT ACTIVE yet.**

---

# 4. SUPERVISOR NOTE — LOCAL PHASE 8 VERIFICATION

Supervisor đã chỉ đạo tiếp tục sang P8-03.

GitHub hiện **không có** block kết quả Gemini hoặc bộ `P8-LOCAL-FULL-VERIFICATION` đã commit; latest `main` chỉ có task yêu cầu verification. Vì vậy:

- không được cite local Gemini run như GitHub evidence;
- không được tự fabricate PASS;
- nếu Supervisor/Gemini push evidence sau, review và attach vào acceptance record;
- việc mở P8-03 là theo chỉ đạo trực tiếp của Supervisor, không phải do ChatGPT tự suy diễn acceptance evidence.

---

# 5. ACTIVE TASK — P8-03 LEGACY DEPRECATION + JSON READ-ONLY PRODUCTION MODE

**Branch:** `astra/p8-03-legacy-json-readonly`

## Goal

```text
production canonical writes -> PostgreSQL
legacy JSON -> readable archive / migration source
legacy writer APIs -> deprecated
direct JSON writes -> fail closed
```

P8-03 không xóa JSON, không xóa adapter, không làm rollback rehearsal và không làm P8-05 destructive cleanup.

## Implementation currently prepared by ChatGPT/Astra

- production `APP_ENV=production` => JSON mode mặc định `read-only`;
- production reject explicit `JSON_REPOSITORY_MODE=read-write`;
- `StoryKBManager(read_only=True)` chặn disk save trước khi mutate file;
- production composition tạo legacy manager read-only;
- `/v1/ai/kb/confirm` deprecated + fail closed HTTP 409 `LEGACY_JSON_READ_ONLY`;
- `/v1/ai/sync-story` deprecated;
- `/v1/ai/suggest-next` giữ successor Writing Generation;
- `/v1/enhanced/process-interactions` vẫn 403 direct-write-disabled và có deprecation metadata;
- `.env.example` khuyến nghị PostgreSQL + read-only JSON;
- dev/test JSON fixtures vẫn writable để migration/repository tests hoạt động.

Report:

```text
docs/development/P8-03-LEGACY-JSON-READONLY-report.md
docs/development/P8-03-LEGACY-JSON-READONLY/
```

## Gemini responsibility — local Docker verification

Gemini **không phát triển feature** cho slice này trừ khi Supervisor/ChatGPT giao fix cụ thể.

Trên branch P8-03, chạy và ghi evidence thật:

1. P8-03 targeted tests:
   - `tests/test_p8_legacy_json_readonly.py`
   - `tests/test_settings.py`
2. full AI-service regression;
3. live PostgreSQL + pgvector integration;
4. P8-01 migration/parity regression;
5. P8-02 gateway/frontend cutover regression;
6. root Docker Compose production path.

Phải prove:

- production setting không cho JSON read-write;
- legacy JSON existing snapshot đọc được;
- write attempt không đổi source SHA-256;
- `/v1/ai/kb/confirm` read-only trả 409 + deprecation + successor headers;
- root Compose vẫn `NARRATIVE_REPOSITORY=postgres`;
- migration tooling vẫn đọc/replay fixture JSON được;
- không user/prod JSON nào bị sửa;
- PostgreSQL/pgvector/P7 regressions vẫn green.

Evidence cần tạo/update:

```text
docs/development/P8-03-LEGACY-JSON-READONLY/
  environment.txt
  targeted-tests.txt
  ai-service-regression.txt
  postgres-integration.txt
  p8-01-regression.txt
  p8-02-regression.txt
  compose-smoke.txt
  json-source-hash.txt
```

Mỗi file ghi exact command, exit code, test totals, timestamp, tested commit SHA. Không paste secret.

## Failure protocol

Nếu fail:

- không tuyên bố PASS;
- giữ exact command + relevant log;
- không tự sửa rộng;
- handoff failure cho ChatGPT/Astra;
- sau fix rerun gate fail + regressions liên quan.

## Gemini handoff format

Append cuối file này:

```markdown
---

### Gemini Verification — P8-03

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>

- Targeted read-only/settings tests: <result>
- Full AI-service regression: <result>
- PostgreSQL + pgvector: <result>
- P8-01 migration regression: <result>
- P8-02 cutover regression: <result>
- Root Compose: <result>
- JSON source unchanged: <result>
- User/prod data modified: NO
- Report: docs/development/P8-03-LEGACY-JSON-READONLY-report.md
- Evidence: docs/development/P8-03-LEGACY-JSON-READONLY/
- Remaining blocker: none | <exact blocker>
```

Do not open P8-04. Supervisor decides acceptance.
