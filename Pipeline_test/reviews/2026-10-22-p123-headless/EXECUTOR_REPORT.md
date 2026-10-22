# P1 headless core — bounded delivery for GPT-6 review

2026-10-22, Asia/Saigon. Branch: `codex/ai-copilot-pipeline-test`.
Assignment read at fetched, fast-forwarded HEAD `eca4a000d1bd114d16af0b77871a45a26e777a21`.
Executor: Codex. No independent acceptance or CI/merge decision is asserted here.

**Handoff: `P1_CORE_SLICE_READY_FOR_GPT6_REVIEW`.**
The first durable supported-API slice passed; **full `P1_CORE_OFFLINE_PASS` is not granted**.
P2/P3 remain NOT_RUN pending review of this P1 slice and the remaining gates below.

## Tested tree and actual runtime

Final tested source: **`b5c9c8db6bfd976f37d8811c2db45ad40691fd99`**.
Final run: [final-run-05/validation.json](final-run-05/validation.json), exit **0**, **33/33 checks**.
Source directories were clean at start; newly generated evidence was untracked until sealing.
Evidence commit is the commit containing this report; resolve it with:

```text
git log -1 --format=%H -- Pipeline_test/reviews/2026-10-22-p123-headless/EXECUTOR_REPORT.md
```

Unique final project: `p123-core-19b78b27ae`, DB `p123_core_19b78b27ae`.
Real Docker PostgreSQL/pgvector + MongoDB + production backend + production AI Service.
Both migration runners executed on new empty volumes. AI schema readback is
`0012_entity_guidance`; backend applied migrations 001–012. No substitute schema fixture.
See [containment](final-run-05/containment.json), [migration readback](final-readback-audit/migrations.json).
Image identities are captured there. Historical databases, ledgers, gold and reports are unchanged.

Workers/database/fake upstream use only project-owned internal Docker networks. A separate
fixed-destination HTTP ingress exposes backend API calls and fake receipt reads to the host;
it contains no provider keys and is not an open proxy. Config assertions check real keys empty,
proxy routing to the budget gateway, gateway destination fake-upstream, embeddings disabled,
and local fallback false. Actual source-capture requests traveled backend → AI Service →
LLMService/Gemini SDK → gateway → fake HTTP upstream. No application/repository mocks in E2E.

## Supported API workflow actually executed

1. Register two new accounts through HTTP, grant AUTHOR only to those new test accounts
   through a documented scoped infrastructure SQL fixture, then log in normally. No SQL
   inserts/updates create manuscripts, decisions, canon, plans, generations or outbox work.
   The second authenticated author receives **403** for the same novel's memory route.
   This proves that ownership boundary; it is not a claim that two distinct production tenants
   were provisioned. The backend uses its configured default tenant for both accounts.
2. Create a novel and five chapters through authenticated backend HTTP. Take supported
   `MANUSCRIPT_BOOTSTRAP` snapshots before baseline activation, then read immutable revisions.
   [Source manifest](final-run-05/source-manifest.json) freezes chapter/revision IDs, full fixture
   hashes, title/body conversion and canonical body hashes. All five readback hashes match.
3. Bootstrap all five revisions through the backend gateway. Each chapter stops at the actual
   entity gate. Capture raw machine candidate/decision inventories; script API review to retain
   checked fake decisions and reject unresolved occurrences, then continue and resume bootstrap.
   This actor is **SIMULATED_HUMAN_VIA_API**, never actual human/UI acceptance. Official memory
   is checked unchanged through entity review and before canon approval.
4. Accept proposal dependency groups via authenticated API and activate baseline. M0 is
   **15 entities, 5 events, 6 facts; brain version 6**. Read-only PostgreSQL evidence captures
   entities, analysis runs, proposals, facts/events and revision provenance. Stop/restart both
   backend and AI process; the approved memory readback is identical.
5. Create/activate/read a real versioned future Story Plan targeting chapter 6. Canonical memory
   is unchanged. Generate on chapter 5, then separately chapter 1, through real HTTP.
   Both captures correlate unique instructions to a single request and match the context hash
   stored in PostgreSQL `writing_generations.context_summary`. Full prompt hashes differ because
   instructions/selection wrap the canonical Story Brain JSON.
   See [chapter 5 capture](final-run-05/outbound-capture.json) and
   [chapter 1 capture](final-run-05/outbound-cutoff-1.json).
6. Duy and Nguyễn Vũ/Vũ genuinely exist in approved durable canon from later source revisions.
   They are absent from chapter 1's **actual outbound** context. A separate service-auth,
   read-only HTTP audit joins accepted proposals to the immutable revision manifest and checks
   all five cutoffs: **15 source identities, zero future-entity leaks**. The same audit before
   the repair found **7 leaks**; neither the pre-fix DB nor its evidence was rewritten.
7. Preview generation is followed by an ordinary authenticated `PATCH /chapters/:id` that
   appends a source sentence about a micro-check note to chapter 5. This is a scripted author
   continuation, **not acceptance of the fake-generated prose**. No manual snapshot rescues
   this save. It produces a new immutable revision, one incremental outbox item and a real
   human entity-review checkpoint. Repeating the identical save reuses that revision/outbox.
   Reanalysis of the old revision returns **409**; generation with stale brain version returns **409**.
8. Continue entity review and approve new source-scoped proposals via API. M-FIRST is
   **15 entities, 5 events, 7 facts; brain version 7**. The old five events and six facts are
   reused; only the new note fact is added. The outbox is COMPLETED and memory survives
   another backend/AI restart. Outbox completion alone is never used as proof of canon;
   final memory and proposal readbacks supply that evidence.

## Reproduced core defects and scoped repairs

| Defect | Before evidence | Repair / validation |
|---|---|---|
| Nullable/omitted writing selection | final-run-01: valid schema default becomes `None < int` and HTTP 400 | Normalize absent/null offsets before hashing/bounds; canonical explicit-default replay test; real stale-brain request now reaches 409 |
| Approved entity lacks temporal origin | readback-audit-02: 7 early-cutoff leaks on actual approved records | Bulk-load scoped revision provenance when accepting entity groups; persist minimum first_chapter regardless of review order; SQL regression and final early outbound + 5-cutoff audit |
| Second unkeyed generation violates unique index | final-run-04: actual PostgreSQL uq_writing_gen_tenant_idempotency collision on empty string | Generate unique durable identity only when client key absent; retain explicit replay semantics; SQL regression and two successful final HTTP generations |

Temporal repair applies to newly materialized source-backed entities and entities already
carrying first_chapter. It intentionally does **not** backfill legacy/author-declared entities
with unknown temporal origin or migrate production data. That remains a review consideration.

Fake/harness repairs: distinguish canonical reconciliation schema from entity decisions;
compare both wrapped and unwrapped fact values so append-only fake extraction reuses old canon;
wait for the matching revision checkpoint rather than an old async job status; never turn an
empty exception string into PASS; read ledger from its owning gateway's HTTP status rather than
opening its exclusively locked file. These are separately labeled test infrastructure changes.

## Commands and regression results

| Execution | Tested SHA | Result / scope |
|---|---|---|
| Final headless runner | b5c9c8d | Exit 0, 33 checks; actual HTTP + PostgreSQL/Mongo |
| Final readback audit | b5c9c8d | Exit 0; all five cutoffs, 15 source identities, zero leaks |
| AI final targeted suite | b5c9c8d | **111 passed, 0 skipped**, exit 0; [args/versioned scope](ai-final-validation.json), [JUnit](ai-final-junit.xml) |
| Backend targeted suite | 0512fa6 | **29 passed, 0 skipped**, exit 0; gateway, revision/patch, outbox, proposal evidence, autonomous memory. Backend source is unchanged in subsequent commits |
| Harness + Wave 1H suite | 6d73bce | **21 passed, 0 skipped**, exit 0; [log](harness-tests.txt) |
| Final focused harness suite | b5c9c8d | **4 passed, 0 skipped**, exit 0; includes wrapped-fact comparison and empty-exception failure test; [log](harness-focused-final-tests.txt) |

AI unit/repository suites use memory/JSON/SQLite SQL fixtures; these are **not** counted as
real PostgreSQL E2E. Non-loopback DNS is denied for the final host AI suite. Dedicated fresh
pytest temp directories avoid retention cleanup of historical tracked test artifacts.
One container test attempt ended 137 without results; an initial sandbox host attempt had
46 pass / 3 JSON-file replacement permission failures. The permitted rerun passed, and the
final expanded 111-test result is preserved. No failed command is silently relabeled PASS.
Builds use the real Dockerfiles (`npm run build` included); no full backend suite PASS is claimed.

## Reproduce on new resources only

```powershell
python Pipeline_test/tools/prepare_p123_headless.py --manifest NEW_ENV_MANIFEST.json
$m = Get-Content NEW_ENV_MANIFEST.json | ConvertFrom-Json
docker compose --env-file $m.env_file -f Pipeline_test/tools/compose.p123-headless.yml --profile initialize run --rm budget-init
docker compose --env-file $m.env_file -f Pipeline_test/tools/compose.p123-headless.yml up -d --build api-ingress
python Pipeline_test/tools/run_p123_headless.py --env-file $m.env_file --output NEW_RUN_DIRECTORY
python Pipeline_test/tools/audit_p123_readback.py --env-file $m.env_file --run NEW_RUN_DIRECTORY --output NEW_AUDIT_DIRECTORY
```

All manifest/output paths must be new. Generated credential files are gitignored. Do not run
against historical env manifests or reset ledgers. Runtime databases/volumes from this delivery
are retained for review; resource-lifecycle.json records their final process state.

## Acceptance limits and remaining gates

- **No full P1_CORE_OFFLINE_PASS yet:** review this first bounded slice before expanding.
  `expectedVersion` optimistic PATCH concurrency is absent; no stale-write or two-writer
  compare-and-swap guarantee is proven. See [FE contract inventory](FE_BACKEND_CONTRACT_HANDOFF.md).
- Explicit-key replay is regression tested; unkeyed double generation and identical ordinary
  save are HTTP tested. Concurrent writers, interrupted multi-worker resume and real-DB
  materialization-fault injection remain NOT_RUN. Backend fault tests are narrower mocked tests.
- Locked-rule stress/pruning and maximum-tier overflow have component-level regression coverage;
  this run does not seed a locked rule and exercise overflow through the durable HTTP fixture.
  Retrieval is disabled, embeddings are absent, and missing retrieval metadata is reported as
  a remaining observability gap, not retrieval PASS or semantic quality evidence.
- Accept-generated-draft is inventoried but NOT_RUN; this slice uses ordinary author save.
  Context/provenance is tested; scripted outputs do not evaluate extraction, reasoning or prose quality.
- **P2/P3 NOT_RUN**, including no-plan controller behavior, HITL controller safety and terminal
  functional completion. **P3 100k–105k NOT_RUN**; contract v1.4 remains intact.
- **UI P1/P2/P3 BLOCKED_FE**, historical S09 RED unchanged. No web/ edits, FE waits, FE merges,
  publication, main writes, PR creation or real-provider/embedding calls.

Final ledger: **63 simulated calls**, `charged_usd=3.307739`, OFFLINE_ONLY, live_authorized=false,
SYNTHETIC_OFFLINE_TEXT_ONLY. This amount is synthetic accounting; **actual provider spend is zero**.
Do not treat it as an invoice or live-cost guarantee.

Earlier official failed runs and the pre-fix cutoff audit remain committed alongside the final
run. Development-only raw attempts are retained locally under `.eval-private`; their sanitized
summary explicitly corrects the invalid early empty-exception verdict. Stop here for independent
GPT-6 review of this bounded P1 delivery; no P2/P3 acceptance is inferred.
