# P1 Entity HITL semantic hardening — executor handoff

Verdict: **P1_ENTITY_SEMANTICS_READY_FOR_GPT6_REVIEW**. Keep PR #63 Draft / merge HOLD. This is source/API/automated evidence, not full mounted P1 UI or production readiness.

## Provenance and scope

- Reviewed starting HEAD: `07007f2aeae496f70516345614d309675a2daa57`; prior tested source `8a1dab633e3eb47cc1b7e565b46d39187218b6d8`.
- Final exact clean tested source: `f3f40d9bcbeb247a79f3de6ea1a60a0d91181e21`.
- Source commits: `8859021e` implements H-01/H-02/H-03; `f3f40d9b` preserves continuation of previously frozen human reviews through a CAS format upgrade.
- Writable branch only: `codex/p1-memory-entity-hitl`; Draft PR https://github.com/Ephurin/Novel_sharing_platform/pull/63 targets `integration/p1-author`.
- Integration base remains `7fd6f71b388320e00408b7ea47c0998708c70a2c`. Workflow v1.4 was read from the reference SHA recorded in provenance.json; full GPT-6 comment 6367641759 was read before changes.
- Source/tests were committed before the final acceptance rerun. Five per-suite source records and final-source-seal.json confirm a clean checkout of the exact SHA. This evidence is a separate commit; its SHA is supplied in the PR/final handoff.
- Historical acceptance evidence, main/integration/other PR branches, web and P3 controller source were not changed.

## Findings resolution matrix

| Finding | Executor resolution | Tests and durable proof |
| --- | --- | --- |
| H-01 | IMPLEMENTED / GREEN. Partial author save, entity-only refresh, compatible author carry-forward, explicit pending candidates, CAS/replay safety. | Repeated occurrences + missing lowercase name, human rejection preserved against unchanged positive machine output, changed context/verdict/canonical ID re-review, source/hash/Canon/tenant fences, new ambiguous alias pending, forced refresh overlap and replayed review. H01 SQL stage retains author decisions and zero proposals/Canon version 1. |
| H-02 | IMPLEMENTED / GREEN. Reviewed identity IDs are authoritative end-to-end. | Distinct approved homonyms and shared aliases, occurrence-level ID choices, ambiguous event/location/fact/state/relationship references refused, exact IDs succeed through separate Canon approval. New opaque IDs survive inventory growth. Canon edits cannot change reserved identity IDs. SQL entity/event/fact/state records preserve both IDs. |
| H-03 | IMPLEMENTED / GREEN. Repository outcome distinguishes commit from reuse. | Barrier-forced parallel continue returns exactly one deduplicated=false and one true; authoritative proposal count equals the one saved ID set. Serial retry remains true. |

## Root causes and contract compatibility

H-01 previously rejected changed guidance and offered only a new analysis, discarding saved author decisions. The added POST entity-reviews/{run_id}/refresh uses expected_version, retains all original source/tenant/novel/Canon fences, and permits changed guidance only for this operation. It reruns discovery/verification only and always returns waiting_entity_review. Compatible author choices remain separate from fresh machine decisions; new/changed candidates remain pending. Review finalize:false saves resolved partial choices, while the default finalization retains the existing full-coverage requirement. No event/fact/state extraction or Canon write occurs during refresh.

H-02 previously keyed the downstream dictionary by display phrase. The replacement inventory keys opaque identity IDs and indexes each name/alias to a set of possible IDs. Exact IDs are authoritative; a unique old label remains compatible, an ambiguous label produces 409, an unknown reference 422. Known IDs and immutable occurrence evidence remain attached to each reviewed identity. New identities get random UUIDs once at human freeze, and valid refresh/replay preserves them. Names and positions do not determine those IDs.

Existing event participant/location list-of-string fields now contain IDs in the verified path. Facts use existing subject_entity_id. State subjects and relationship targets normalize to reviewed IDs. Exact ID resolution takes precedence in the Canon projector; ambiguous name fallback still fails. New entity proposals reserve their frozen UUID, and Canon materialization honors it without a name upsert. A Canon edit can rename the entity while the server retains its immutable reserved ID. Existing-ID collisions and attempts to replace that ID fail closed. Legacy flag-OFF extraction and legacy entity payloads retain their previous behavior. No migration is added.

Previously completed checkpoints continue returning saved proposals. Previously frozen schema-1 checkpoints upgrade their storage format by CAS from the already-saved human choices on continuation; they do not require a new human decision, rerun the entity LLM, or approve Canon. Unknown future inventory versions fail closed. Full consumer/endpoint compatibility is documented in the updated CONTRACT.md one directory above.

## RED → GREEN and unique counts

RED ran before production source changes at reviewed HEAD 07007f2a: **11 FAIL, exit 1**. The failures reproduce missing refresh/carry-forward, homonym/alias identity loss and incorrect concurrent deduplication response. red-provenance.json proves production source was unchanged; red-test-snapshots.json stores the original test bytes in base64 with original SHA-256, so Windows line endings do not prevent reproduction. The raw RED log/command record is retained.

Final exact-source acceptance:

| Suite | Result | Evidence |
| --- | --- | --- |
| AI unit / non-PostgreSQL | 291 PASS, 5 SKIP, 85 PostgreSQL cases deselected; exit 0 | test-accept-unit.log |
| PostgreSQL P1 HITL + semantics | 43 PASS, 43 memory parameters deselected; exit 0 | test-accept-hitl.log |
| Existing narrative/semantic-memory/P8 PostgreSQL regression | 31 PASS; exit 0 | test-accept-postgres.log |
| Focused backend Gateway/Core/CAS/persistence/extraction-only | 74 PASS; exit 0 | test-accept-backend.log |
| Backend TypeScript | PASS; exit 0 | test-accept-backend-typecheck.log |
| Real Node → Python → immutable platform revision HTTP | 1 PASS; 39 actual request records; exit 0 | test-accept-live.log, http-requests-responses.json |
| P7 on final source | SUCCESS | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39984858341 |
| P8 on final source | SUCCESS | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39984858361 |

Counts are parameterized cases in one final execution of each suite. The 43 PostgreSQL HITL cases comprise 21 existing cases plus 22 semantic cases; the H-03 assertion strengthens an existing case rather than adding a second count. RED, development retries, preliminary source runs and CI reruns are not counted as additional unique tests. Five unit skips are SQL-only checks on non-SQL adapters or real-PostgreSQL-only concurrency/persistence checks on the memory adapter; their applicable SQL/PG variants execute.

All exact commands, cwd, UTC timestamps and exits are in *-commands.json. The RED exit 1 is expected reproduction, not a final acceptance failure. acceptance_runner.py preserves the executor orchestration; its machine-specific ROOT/OUT paths must be adapted outside the source checkout on another host. Final acceptance contains no FAIL or unresolved essential H-01/H-02/H-03 blocker.

## Authoritative readbacks

- semantic-postgres-readbacks.json contains five SQL stages: H01 refreshed choices and H02 pending/approved stages with and without an ambiguous shared alias. readback-index.json provides a compact index of Canon versions, distinct IDs, pending/preserved occurrence IDs, event participants and fact subjects.
- H01 retains the author's not_entity choices while the matching machine still says entity; new lan occurrences remain pending. Brain version stays 1, and there are no proposals, events or facts at refresh.
- H02 preserves two confirmed Minh rows with distinct UUIDs. Pending event/fact/state proposals contain those IDs while Canon stays version 1 and materialized events/facts remain absent. Only explicit group approval increments Canon to version 2; SQL event participants, fact subjects and projected relationship state keep the selected IDs. Source quote/offset/hash/revision evidence remains attached.
- concurrent-completion-readback.json records the exact proposal ID set, SQL cardinality, and false/true outcome pair from forced overlapping continuation.
- Real HTTP also exercises authenticated refresh, compatible carry-forward, new-candidate-only review, owner/anonymous/foreign guards, duplicate refresh/review/continue, unchanged approved memory while pending, a seeded confirmed homonym pair and successful exact-ID Canon approval. gateway-postgres-readbacks.json captures eight durable stages. Its two explicit approvals advance Canon 1→2→3; the second scenario starts from a test-seeded confirmed homonym baseline. No API refresh or continue increments Canon.
- HTTP statuses 200/401/403/404/409/422 are recorded. One homonym-approval diagnostic uses a logical path label; http-path-index.json reconstructs the actual group UUID path from its captured same-run review queue. The raw log and parsed records remain unchanged. JWTs are not logged. Gateway ignores arbitrary browser tenant headers and enforces ownership/latest revision; Python enforces service-token and configured repository tenant/checkpoint scope. Existing invalid internal service-token status 403 is unchanged.

## Isolation, retention and limits

Fresh final PostgreSQL/pgvector and MongoDB resource identities/ports are in resources.json. RED/development and preliminary resources are recorded separately. Text and embedding providers are fake; real provider keys are cleared by the runner. No live Gemini/embedding provider, deployment, merge, publication or payment action was performed.

Alembic remains the pre-existing 0013_objective_intent; no schema weakening or new migration is introduced. Downgrade/re-upgrade compatibility and existing Canon/CAS/provenance regressions pass. Test-owned public fixtures and Mongo drafts are removed by scoped cleanup; surviving narrative fixture counts are recorded rather than reported as an empty database. All task-owned volumes remain retained. Historical evidence/fixtures and the original dirty checkout are preserved.

Real-provider extraction quality, mounted FE refresh/identity UI, S09–S11 and P3 HITL/100k acceptance remain NOT_RUN. New unregistered identity groups receive opaque IDs at freeze; disambiguating already approved homonyms uses their explicit Canon IDs. Unique name references remain a compatibility path, never a way to choose among homonyms. Concurrent requests may duplicate downstream computation but cannot duplicate the durable proposal set; no provider exactly-once claim is made.

Stop for independent GPT-6 delta review. Keep PR #63 Draft / MERGE HOLD; this handoff grants no FE integration or production release permission.

Evidence file hashes in SHA256SUMS.json cover committed Git blob bytes (LF), excluding the manifest itself; use git show when verifying from a Windows CRLF checkout.
