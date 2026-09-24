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
  - merge implementation vào `main` sau khi code review + CI xanh;
  - chuẩn bị local test/evidence contract;
  - không tự tuyên bố ACCEPT thay Supervisor.

- **Gemini / Antigravity = local execution / verification worker**
  - làm việc trực tiếp trên `main` sau merge;
  - pull latest `main` trước khi chạy;
  - chạy test thật trên máy local có Docker;
  - chạy Compose/live integration;
  - ghi lại command + kết quả thật và push evidence trở lại `main`;
  - không tự mở scope;
  - không tự sửa kiến trúc nếu chưa có lỗi tái hiện rõ ràng.

Quy tắc chung:

- Implementation merge != acceptance.
- Test pass != acceptance.
- Workflow mặc định: develop/review on slice branch -> CI xanh -> merge `main` -> local Docker verification trên `main` -> Supervisor ACCEPT.
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

**P8-03 implementation is MERGED to `main`; local verification is ACTIVE.**

---

# 4. PHASE 8 LOCAL VERIFICATION — VERIFIED PASS

Gemini đã push local Docker verification lên `main` tại commit `efb5fd310b70845efa54614146136759d87dcd38`.

Tested commit: `9a49acb9990f82195f3185f9b05a7ed258bcba61`.

Verified evidence:

- static cutover guard: PASS — 58 files, 0 violations;
- web build/assets: PASS;
- backend deterministic/gateway tests: PASS — 20/20;
- mobile typecheck: PASS;
- AI-service regression: PASS — 176 passed, 2 skipped, 34 deselected;
- PostgreSQL + pgvector: PASS — 34 passed, 178 deselected, pgvector 0.8.6;
- P8-01 migration/parity replay: PASS;
- P8-02 gateway cutover replay: PASS;
- root Compose: PASS — isolated `p8_verification` project;
- source JSON unchanged;
- user/prod data modified: NO.

Evidence:

```text
docs/development/P8-LOCAL-FULL-VERIFICATION-report.md
docs/development/P8-LOCAL-FULL-VERIFICATION/
```

This closes the independent local verification gate for accepted P8-01/P8-02.

---

# 5. P8-03 — ACCEPTED

- PR: #7
- implementation merge: `d094b2977abc6e56fcebff222120ee7d276ceb40`
- local verification evidence commit: `4af13876c891a9edf27318862643b4187a7c24aa`
- tested commit: `014cf9f082d498af567f7b4047bcb4a13600f7ed`
- targeted read-only/settings: PASS — 10/10
- full AI-service regression: PASS — 182 passed, 2 skipped, 34 deselected
- PostgreSQL + pgvector: PASS — 34 passed, 184 deselected
- P8-01 migration regression: PASS
- P8-02 cutover regression: PASS
- root Compose production path: PASS
- JSON source unchanged: YES
- user/prod data modified: NO
- Supervisor ACCEPT: 2026-09-24

---

# 6. ACTIVE TASK — P8-04 ROLLBACK REHEARSAL + CLEANUP READINESS

**Development branch:** `astra/p8-04-rollback-cleanup-readiness`

## Goal

```text
accepted PostgreSQL cutover
  -> restorable backup
  -> isolated restore rehearsal
  -> migration/vector parity
  -> canonical Story Brain parity
  -> source unchanged
  -> cleanup inventory only
```

P8-04 proves recoverability. It does **not** perform destructive cleanup.

## Implemented by ChatGPT/Astra

- `scripts/check_p8_cleanup_readiness.py`
  - fails if production config permits JSON canonical writes;
  - confirms production PostgreSQL-only + JSON read-only boundary;
  - confirms legacy writer routes remain deprecated/fail-closed;
  - inventories legacy code/routes/adapters;
  - always keeps P8-05 cleanup permission false until stability gate.
- `.github/workflows/p8-cutover.yml`
  - new isolated `rollback-rehearsal` job;
  - seed synthetic canonical story;
  - capture source canonical snapshot + Alembic + pgvector state;
  - `pg_dump --format=custom`;
  - restore into separate `p8_restore_verify` DB;
  - compare canonical snapshot exactly;
  - compare migration/vector state;
  - prove source DB unchanged.
- runbook:
  `docs/development/P8-04-ROLLBACK-CLEANUP-READINESS-runbook.md`
- report:
  `docs/development/P8-04-ROLLBACK-CLEANUP-READINESS-report.md`

## Safety invariants

- never restore over user/prod DB during rehearsal;
- never drop/truncate source DB;
- never delete legacy JSON;
- never re-enable JSON production writes;
- never delete legacy routes/adapters in P8-04;
- P8-05 remains deferred until explicit post-release stability acceptance.

## Development verification

GitHub CI on this branch must pass:

1. cleanup readiness guard;
2. rollback rehearsal job;
3. P8 cutover regression;
4. P7 semantic regression.

After code review + green CI, merge implementation into `main`.

## Post-merge local verification

Gemini/Antigravity then works on latest `main` and repeats the rollback rehearsal using isolated Docker resources.

Required evidence:

```text
docs/development/P8-04-ROLLBACK-CLEANUP-READINESS/
  environment.txt
  cleanup-readiness.txt
  backup.txt
  restore.txt
  canonical-parity.txt
  migration-vector-parity.txt
  source-unchanged.txt
  regressions.txt
  compose-smoke.txt
```

Evidence must include exact commands, exit codes, timestamps, tested commit, backup SHA-256, source/restore Alembic revisions, pgvector versions and canonical parity result.

## Acceptance gate

P8-04 remains NOT ACCEPTED until:

- implementation merged to `main`;
- local Docker restore rehearsal passes on `main`;
- source DB/data remains unchanged;
- P8-01/P8-02/P8-03 regressions remain green;
- cleanup-readiness inventory is committed;
- Supervisor ACCEPTS.

Do not open P8-05.
