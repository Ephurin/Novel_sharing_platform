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

# 7. ACTIVE TASK — P8-05 POST-RELEASE STABILITY GATE

**Gate-preparation status:** MERGED  
**PR:** #9  
**Merge commit:** `160f2f4a1ac879dce528854cb49e6899a8d192c2`  
**Execution branch:** `main`  
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

## Gate-preparation verification — COMPLETE

Implementation head `166c3cc183bc65ce0c26504c5019b1abbeffc211` passed:

- P8 Cutover and Migration run #76: SUCCESS;
- final-cleanup-gate: SUCCESS;
- blocked-state assertion: SUCCESS;
- synthetic OPEN/BLOCKED state transition test: SUCCESS;
- cleanup manifest safety contract: SUCCESS;
- rollback rehearsal: SUCCESS;
- PostgreSQL integration: SUCCESS;
- frontend/API cutover: SUCCESS;
- root Compose cutover smoke: SUCCESS;
- P7 Semantic Memory Foundation run #84: SUCCESS.

## Gemini / Antigravity responsibility on main

Gemini may verify the **gate preparation only**:

```bash
python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
```

Also inspect:

```text
docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json
docs/development/P8-05-FINAL-CLEANUP-GATE/cleanup-manifest.json
```

Expected result is:

```text
cleanup readiness = PASS
final cleanup gate = BLOCKED
cleanup_allowed = false
```

Do not fabricate a release identifier, observation window, error-budget result or operational evidence. Do not set `supervisor_cleanup_gate_accepted=true`.

A local PASS only verifies that the **gate works**. It does not ACCEPT P8-05 destructive cleanup.

## Blocking external condition

Destructive removal cannot begin until real post-release evidence is available and the Supervisor explicitly accepts the final cleanup gate.

Until then:

- do not remove JSON files;
- do not remove legacy runtime routes;
- do not remove adapters/tooling;
- do not delete rollback backups;
- do not drop/truncate PostgreSQL data.

P8-05 remains ACTIVE / BLOCKED_PENDING_STABILITY.

---

### Gemini Verification — P8-05 GATE PREPARATION

Status: PASS (GATE OPERATIONAL / CLEANUP BLOCKED)
Tested commit: e9208b8ba80205e7241207fb39062236fe4dcce6

- Cleanup-readiness guard (`check_p8_cleanup_readiness.py`): PASS
  * production_write_boundary: postgres-only
  * legacy_json_mode: read-only
  * p8_05_cleanup_allowed: false
- Final cleanup gate (`check_p8_final_cleanup_gate.py --expect-blocked`): PASS (status: BLOCKED, cleanup_allowed: false)
  * release_identifier: null
  * observation_window_completed: false
  * production_json_writes_zero: null
  * supervisor_cleanup_gate_accepted: false
  * 7 blockers verified active
- Stability gate contract (`docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json`): Verified initialized BLOCKED with zero fabricated operational evidence
- Cleanup manifest (`docs/development/P8-05-FINAL-CLEANUP-GATE/cleanup-manifest.json`): Verified separation of runtime removal candidates from retained migration/archive tooling
- Destructive cleanup attempted: NO
- Legacy JSON source files / routes / PostgreSQL data modified: NO
- P8-05 state: ACTIVE / BLOCKED_PENDING_STABILITY

---

# 8. ACTIVE PHASE — EVALUATION / PILOT

**Development status:** core architecture, migration, cutover and rollback foundations are complete through accepted P8-04.  
**P8-05 destructive cleanup:** still BLOCKED_PENDING_STABILITY and runs in parallel as an operational gate.  
**Primary mode now:** evidence-first evaluation on real-novel workloads, not feature-first development.

## 8.1 Phase intent

The system now moves from:

```text
design -> implementation -> migration -> cutover -> rollback rehearsal
```

to:

```text
real novel workload
  -> ingestion/materialization
  -> retrieval evaluation
  -> context evaluation
  -> generation evaluation
  -> failure classification
  -> evidence-driven architecture changes only when justified
```

Do **not** open a new architecture/coding slice merely because an optimization is possible.

The default action is now:

```text
measure first
reproduce failure
classify failure
only then propose code/architecture change
```

## 8.2 Gemini / Antigravity role

Gemini is the **local execution / measurement worker** for this phase.

Gemini should:

- work on latest `main`;
- run real Docker/PostgreSQL/pgvector workloads where applicable;
- preserve exact tested commit SHA;
- record commands, configs, model/version identifiers, latency, token/cost data when available, and raw/derived metrics;
- commit evidence and reports, not speculative architecture changes;
- keep evaluation inputs immutable;
- separate runtime behavior from offline proxy behavior;
- stop and report a reproducible blocker instead of silently changing architecture.

Gemini must **not**:

- change embedding model/version/dimension without a separate reviewed decision;
- change accepted hybrid weights merely to improve the same calibration set;
- add ANN/HNSW/IVFFlat or a specialized vector DB;
- loosen temporal cutoff/future-leak safety;
- silently alter corpus gold labels;
- delete legacy JSON, routes, adapters, backups or PostgreSQL data;
- set `supervisor_cleanup_gate_accepted=true`;
- fix a quality failure before first preserving reproducible evidence.

## 8.3 Frozen production contract — do not drift during evaluation

Phase 7 accepted contract remains:

- embedding model: `gemini-embedding-2`;
- dimension: `768`;
- explicit L2 normalization;
- cosine distance: `<=>`;
- embedding version: `gemini-embedding-2-768-v1`;
- semantic memory is derived/rebuildable, never canonical truth;
- temporal cutoff occurs before semantic ranking;
- stale / wrong-version / future rows are excluded;
- hybrid rank is deterministic `hybrid-v1`;
- context packing is deterministic;
- protected canonical artifacts are not silently truncated;
- no ANN/HNSW/IVFFlat in accepted MVP.

Accepted `hybrid-v1` recipe:

```text
0.75 * semantic_rank_score
+ 0.03 * entity_overlap
+ 0.08 * temporal_relevance
+ 0.10 * importance
+ 0.04 * relationship_relevance
```

Do not tune these weights on the same calibration set and then report the result as unbiased generalization quality.

## 8.4 Evaluation corpora — keep the versions distinct

### Frozen P7 benchmark

Source report:

`docs/development/P7-01-EMBEDDING-BENCHMARK-ADR-report.md`

Contract:

- corpus: `aethelgard-retrieval-eval-v1.0.0`;
- 216 canonical memories;
- 21 core-gold queries;
- 10 Vietnamese cross-lingual diagnostic queries.

Accepted semantic-only @10 baseline:

```text
Recall  = 0.674717
MRR     = 0.902381
nDCG    = 0.709746
```

Accepted `hybrid-v1` offline proxy @10:

```text
Recall  = 0.718556
MRR     = 0.906349
nDCG    = 0.721033
```

These numbers are regression/calibration references, **not** unbiased held-out quality claims.

### Whole-story working corpus

Current source:

`.data/Batch_7/dataset_report.md`

State after chapter-by-chapter extraction:

- all 61 Aethelgard chapters processed;
- working retrieval set expanded to 40 queries;
- includes long-range setup/payoff, object lifecycle, relationship supersession, ambiguity, and future-leak traps;
- next required corpus task is cross-story consolidation before freezing the next evaluation version.

Do not call the 40-query working set a frozen benchmark until consolidation/audit produces an explicit versioned freeze.

## 8.5 First active experiment — EVAL-01 Aethelgard runtime baseline

**Goal:** establish the first end-to-end baseline of the accepted production stack on a real novel before changing architecture.

This experiment must distinguish:

```text
A. frozen offline benchmark/proxy
B. actual production-runtime retrieval/context path
```

Never substitute A for B.

### Required EVAL-01 work

1. Pull latest `main`; record exact SHA.
2. Verify P8-05 remains BLOCKED:
   - `python scripts/check_p8_cleanup_readiness.py`
   - `python scripts/check_p8_final_cleanup_gate.py --expect-blocked`
3. Inventory the exact Aethelgard corpus artifacts used.
4. Do not mutate gold labels or source novel files.
5. Run the accepted runtime stack with PostgreSQL + pgvector.
6. Materialize/rebuild semantic memory only through accepted production tooling.
7. Record actual memory counts by memory type and embedding version.
8. Run retrieval queries with chapter cutoffs.
9. Compare at minimum:
   - recent-only reference where available;
   - semantic-only;
   - accepted `hybrid-v1`.
10. Record retrieval metrics where gold labels support them:
    - Recall@5/@10/@20;
    - MRR@5/@10/@20;
    - nDCG@5/@10/@20;
    - hit rate;
    - candidate counts;
    - latency p50/p95 when available.
11. Run explicit future-information leakage audit:
    - future candidates before cutoff filter: diagnostic only if observable;
    - future candidates surviving final retrieval: MUST be 0;
    - stale/wrong-version candidates surviving final retrieval: MUST be 0.
12. Evaluate long-range categories separately:
    - old-but-important memory;
    - setup -> payoff;
    - relationship evolution/supersession;
    - important-object lifecycle;
    - world-rule retrieval;
    - low lexical overlap;
    - multi-memory reasoning;
    - future-leak trap.
13. Evaluate context packing:
    - selected artifact IDs;
    - dedup behavior;
    - token-budget usage;
    - protected canonical artifact truncation count;
    - deterministic repeatability/context hash;
    - relevant-memory retention.
14. Run a bounded generation pilot only after retrieval/context evidence is preserved.
15. For generation runs, preserve:
    - prompt/context hash;
    - generation model/version;
    - temperature/settings;
    - retrieved memory IDs;
    - output;
    - latency/tokens/cost if available.
16. Score generation with an explicit rubric, separating:
    - canonical factual consistency;
    - character/state consistency;
    - relationship consistency;
    - temporal/future leakage;
    - unsupported fact introduction;
    - context adherence;
    - continuity across long-range dependencies.
17. Do not use a single opaque LLM-judge score as the only evidence. Preserve per-criterion findings and representative failures.
18. Classify every important failure before proposing a fix.

## 8.6 Failure taxonomy

Use one primary cause per reproduced failure, plus secondary contributors if needed:

```text
CORPUS_GOLD
INGESTION_EXTRACTION
CANONICAL_DATA
EMBEDDING
TEMPORAL_FILTER
CANDIDATE_RETRIEVAL
HYBRID_SIGNAL
HYBRID_WEIGHTING
CONTEXT_PACKING
GENERATION
EVALUATION_HARNESS
LATENCY_COST
UNKNOWN
```

For each failure record:

- query/case ID;
- chapter cutoff;
- expected evidence;
- actual retrieved/context/generated evidence;
- first layer where behavior diverges;
- reproducibility;
- severity;
- proposed next experiment.

Do not jump from “bad generation” directly to “embedding model is bad” without tracing retrieval and packed context first.

## 8.7 Evidence layout

Write EVAL-01 evidence under:

```text
docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
  environment.txt
  corpus-inventory.json
  runtime-config.json
  materialization.txt
  retrieval-raw.json
  retrieval-metrics.json
  future-leak-audit.json
  context-packing.json
  generation-cases.json
  failure-analysis.md
  latency-cost.json
  summary.md
```

If a category cannot be measured, record `not_measured` plus the concrete reason. Do not fabricate zeros or estimates.

## 8.8 Evaluation report requirements

`summary.md` must distinguish:

- **reproduced accepted baseline**;
- **new runtime measurement**;
- **working-corpus diagnostic**;
- **inference/hypothesis**;
- **confirmed defect**.

The final report must answer:

1. Does real runtime semantic retrieval reproduce the expected direction of the frozen benchmark?
2. Does `hybrid-v1` improve useful long-range retrieval without harming temporal safety?
3. Which query archetypes remain weakest?
4. Does context packing preserve the right old-but-important memories under budget?
5. Are any canonical/protected artifacts truncated or lost?
6. Does any future information leak into retrieval, context, or generation?
7. What is the latency/token/cost profile?
8. Is the dominant bottleneck data quality, retrieval, packing, generation, or evaluation harness?
9. Which proposed improvement has the strongest evidence-to-complexity ratio?
10. Is a code/architecture change actually justified?

## 8.9 Change-control rule during pilot

A quality observation alone does not authorize a code change.

Before modifying architecture, Gemini must provide:

```text
reproducible case
+ preserved evidence
+ localized failure layer
+ expected measurable improvement
+ regression risks
```

Then ChatGPT/Astra reviews the proposal and the Supervisor decides whether to open a new implementation slice.

## 8.10 P8-05 continues in parallel

Evaluation/Pilot does not bypass the cleanup gate.

Until real post-release stability evidence exists:

```text
P8-05 destructive cleanup = BLOCKED
Evaluation / Pilot          = ACTIVE
```

Gemini may collect genuine operational stability observations while running the pilot, but must not invent a release identifier, observation period, error budget, incident status or Supervisor acceptance.

## 8.11 Immediate Gemini handoff

On latest `main`:

1. read this entire Evaluation / Pilot section;
2. verify P8-05 remains blocked;
3. inspect the existing Aethelgard frozen benchmark and 61-chapter working corpus;
4. prepare EVAL-01 runtime-baseline evidence directories/files;
5. run measurements before changing code;
6. commit evidence/results to `main`;
7. append a concise handoff:

```markdown
### Gemini Verification — EVAL-01 AETHELGARD RUNTIME BASELINE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Corpus:
- frozen benchmark: aethelgard-retrieval-eval-v1.0.0
- working whole-story corpus: <state/version>

- Materialization: <result>
- Semantic retrieval: <metrics/result>
- Hybrid retrieval: <metrics/result>
- Future leakage: <0 or exact failures>
- Context packing: <result>
- Generation pilot: <result/not_measured>
- Latency/token/cost: <result/not_measured>
- Dominant failure category: <category>
- Confirmed code defect: none | <exact defect>
- Architecture change proposed: NO | <proposal reference>
- P8-05 cleanup gate: BLOCKED
- Evidence: docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
- Remaining blocker: none | <exact blocker>
```

Do not open a new coding phase automatically.

