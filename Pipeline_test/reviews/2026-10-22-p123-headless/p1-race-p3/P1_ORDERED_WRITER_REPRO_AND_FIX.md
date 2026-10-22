# P1 ordered-writer reproduction and bounded repair

Tested final source: `c34a0251dbc6d15fd2af7a8b1ead787adf892100`. Starting task HEAD `ee6971bc3c9e007cabe5b37e7cae2a3fe3dbf5f0`. Branch `codex/ai-copilot-pipeline-test`. **P1_ORDERED_WRITER_BOUNDED_FIX_READY_FOR_GPT6_REVIEW**, not full P1 acceptance.

## Deterministic RED, not a static hypothesis

`before-clean/` runs the committed clean harness at c34a025 against the original immutable backend/AI images. `before-image-source-proof.json` identifies runtime backend source ee6971b and verifies the four reviewer-named backend files against that Git commit (LF-normalized; unmodified checkout files had CRLF). Its validation `tested_sha` denotes the HOST HARNESS commit; runtime source is separately proven in the image proof. `source_dirty_at_start=false`. Initial development `before/` at ee6971b also preserves the same RED, with uncommitted harness files then present; no production repair existed in that image.

An authenticated A PATCH CAS succeeds, A is paused before SQL, B reads A's advanced Mongo version and performs its own successful CAS, then commits revision/outbox B. A resumes. Both return 200; final Mongo and latest PG revision contain **older A**, also after backend/AI restart. Raw states: `A-after-CAS.json`, `B-before-A-release.json`, `HTTP-results.json`, `final.json`, `after-restart.json`. Exit 1 is EXPECTED_RED. Test-only preload is mounted only by `compose.p123-ordered-test.yml`, requires an explicit flag plus owned project name, matches a configured chapter, and has a bounded 30-second barrier. It is not imported by production code/configuration.

## Repair and protected evidence

Production change in `049e40d`: a PostgreSQL session advisory writer lock spans PATCH Mongo CAS, SQL metadata, immutable revision/outbox and Mongo reconciliation. Snapshot and accept-draft use the same lock. A WeakSet-validated explicit lease allows nested calls only within the live critical section; no ambient async context grants background jobs accidental reentry. A separate bounded pool (max 4) admits writers without occupying the business pool needed by their transactions. Busy writers fail 409 `DRAFT_CONFLICT`; they must reload/retry. Finally unlocks or destroys the admission connection. Process death releases the PostgreSQL session lock.

Delayed reconciliation also takes the writer lock and checks the authoritative latest PG revision before touching Mongo. An obsolete revision is skipped even with a fresh timestamp. This replaces timestamps as the sole protection, rather than treating PG row-lock order as Mongo-CAS order.

| Actual test at final clean SHA | Result / evidence |
| --- | --- |
| A paused after CAS, B uses the advanced valid version | PASS: initial B gets precise 409 while A owns the writer lease; after A completes, B reload/retry 200. Mongo and latest revision B survive restart. `final-writer/` |
| Revision/outbox order | B parent is A; exactly one matching-hash incremental outbox for each. `final-writer-readback/writer-order-proof.json` and SQL tables |
| Inverse logical order B→A | PASS: B is the first paused logical writer (hook marker A is instrumentation only), A conflicts then reload/retry; newest A is Mongo/latest and parent is B. `inverse-order/` |
| Death after Mongo CAS, before PG | PASS: owned backend SIGKILL; old immutable latest remains (no invented A revision), draft A survives; restart releases lease, supported versioned B retry becomes latest. `final-writer/crash-post_cas.json` |
| Death after PG commit, before Mongo reconciliation | PASS: owned backend SIGKILL at first sync read; committed A remains durable, restart + supported B retry becomes latest. `crash-post_pg.json` |
| Delayed obsolete A reconciliation after B | PASS: production recovery primitive in owned backend returns `skipped_newer_draft`; Mongo document including version is unchanged. `delayed-reconciliation/receipt.json` |
| Legacy omission then versioned write | PASS via authenticated HTTP on a new novel; no required-version/428 policy added. `mixed-client-validation.json` |
| P2 shared-path regression | 27 PASS on a new author/novel; real generation, accept, HITL, canon and second HTTP request. `final-p2-regression/` |
| Offline/source regressions | AI 161 PASS / 2 deliberate SKIP; backend focused 42 PASS; typecheck/build PASS. `final-regressions/` |

All repaired final runs report c34a025 and clean source. Fresh writer project `p123-core-ad79e9c8f8`; precursor GREEN at 049e40d is preserved under `after/`, not substituted for final evidence. Read-only migration/ledger/source/canon/outbox captures are separate from API decisions. No direct narrative SQL seeds were used; only scoped new-account author-role fixture and test infrastructure controls.

## Compatibility and limits for review

PR #55 was re-read through GitHub; head remains `0c0b903f4cc86b7f469399ab6e616ffdba7e703b`. Related contract inspection from the preceding slice still applies: schema optional expectedVersion, PR service requires it/428 and has stacked migrations 015/016. No PR code/migration/FE was imported. This branch still allows omitted expectedVersion, but both legacy and versioned writers now share admission; a busy legacy request can receive 409 and must retry. Content-version CAS, authorization and immutable body dedup remain; no FE autosave/UI compatibility pass is inferred.

This is serialization and bounded recovery, **not a distributed Mongo/PG rollback transaction**. Death after CAS can leave an unmaterialized Mongo draft, intentionally preserved; recovery demonstrated here is an explicit supported reload/retry, not automatic replay of the dead request. PG admission-connection loss without process death, rolling deployment against older code, saturation/load behavior, pricing/deletion races and arbitrary direct DB writers are not validated. Background stale revision analysis can remain pending/retryable and must not be silently approved. Timestamp draft protection remains an additional check, not the ordering mechanism. Review these limits before upgrading aggregate P1 safety.

No web changes, publication, real provider/embedding calls or historical evidence/volume deletion. Historical browser S09 RED remains FE-owned. P3's separate in-flight objective cancellation race is still BLOCKED; it is not solved by chapter serialization.
