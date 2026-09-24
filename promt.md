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

### Phase 8 status

```text
P8-03  ACCEPTED
P8-04  ACCEPTED
P8-05  FINAL CLEANUP GATE ACTIVE; destructive removal BLOCKED
```

**Current active slice: P8-05 final cleanup gate.**

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

# 6. P8-04 — ACCEPTED

- PR: #8
- implementation merge: `50fe44621bc9a7251055e3acb07cd49509839f72`
- corrected local evidence commit: `b5fe119e591dcec5ec5e769860d23e6b40531410`
- tested commit: `10e7cc591d717433891fcb244bea606714400736`
- cleanup-readiness guard: PASS
- pg_dump/pg_restore isolated rehearsal: PASS
- canonical snapshot parity: PASS
- Alembic parity: PASS — `0007_semantic_memory_foundation`
- pgvector parity: PASS — `0.8.6`
- embedding schema: PASS — `VECTOR(768)`
- HNSW/IVFFlat: absent as required
- source DB unchanged: PASS
- targeted P8-03 tests: PASS — 10
- full AI-service regression: PASS — 182 passed, 2 skipped, 34 deselected
- PostgreSQL integration: PASS — 34 passed, 184 deselected
- root Compose /api/v1/ai boundary: PASS
- user/prod data modified: NO
- Supervisor ACCEPT: 2026-09-24

P8-05 final cleanup gate may now open.

Important: opening P8-05 does **not** itself authorize destructive removal. The post-release stability gate still requires explicit Supervisor acceptance before deleting legacy write paths, JSON data, routes or adapters.


---

# 7. ACTIVE TASK — P8-05 FINAL CLEANUP GATE

**Development branch:** `astra/p8-05-final-cleanup-gate`  
**Destructive cleanup:** BLOCKED

## Goal

Prepare a machine-checkable final cleanup gate and an exact dependency manifest. Do not delete legacy runtime code or data until the post-release stability gate is explicitly accepted by the Supervisor.

## Current implementation

- `scripts/check_p8_final_cleanup_gate.py`
  - `--expect-blocked`: CI passes only while cleanup remains blocked;
  - `--require-open`: future destructive cleanup may proceed only when every stability condition is satisfied.
- `docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json`
  - intentionally initialized BLOCKED;
  - no fabricated release/stability evidence.
- `docs/development/P8-05-FINAL-CLEANUP-GATE/cleanup-manifest.json`
  - separates production runtime removal candidates from migration/archive/test tooling that must be retained by default.
- `.github/workflows/p8-cutover.yml`
  - P8-05 branch trigger;
  - asserts cleanup-readiness still green;
  - asserts P8-05 destructive gate still blocked;
  - validates manifest safety contract.
- report:
  `docs/development/P8-05-FINAL-CLEANUP-GATE-report.md`
- runbook:
  `docs/development/P8-05-FINAL-CLEANUP-GATE-runbook.md`

## Runtime candidates after gate opens

- `/v1/ai/kb/confirm`
- `/v1/ai/sync-story`
- `/v1/ai/suggest-next`
- `/v1/enhanced/process-interactions`
- route-only schemas/imports
- `get_story_kb` if runtime dependency count becomes zero
- `app.state.story_kb` after all runtime dependencies are removed

## Retain by default

Do not remove merely because they contain legacy JSON support:

- `core/story_kb_manager.py`
- `infrastructure/json_narrative_repository.py`
- `infrastructure/json_postgres_cutover.py`
- `application/migrate_json_to_postgres.py`

They remain useful for archive reads, repository contracts, migration replay and recovery and are not production canonical writers under P8-03.

## Stability gate required before destructive cleanup

Real operational evidence must establish:

- concrete release identifier;
- completed observation window;
- production JSON writes remained zero;
- rollback path retained;
- error budget status `within_budget`;
- zero open rollback incidents;
- non-empty evidence references;
- explicit Supervisor cleanup-gate acceptance.

ChatGPT/Gemini must **never** set `supervisor_cleanup_gate_accepted=true` by inference.

## Current expected verification

Before the stability gate is accepted:

```bash
python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
```

Expected:

```text
cleanup readiness: PASS
final cleanup gate: BLOCKED
cleanup_allowed: false
```

That BLOCKED result is correct and is not a failure.

## Development workflow

1. GitHub P7/P8 regression CI must stay green.
2. Final-cleanup-gate CI must prove destructive cleanup remains blocked.
3. Merge this gate-preparation implementation to `main`.
4. Gemini/Antigravity may locally verify the gate/manifest on `main`.
5. Wait for real post-release stability evidence.
6. Only after explicit Supervisor final cleanup acceptance may destructive runtime removal begin.

Do not remove JSON files, routes, adapters, backups or PostgreSQL data in this preparation slice.
