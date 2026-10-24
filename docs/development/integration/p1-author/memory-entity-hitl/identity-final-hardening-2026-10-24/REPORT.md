# P1 narrative identity final hardening — executor handoff

Verdict: **P1_IDENTITY_HARDENING_READY_FOR_GPT6_REVIEW**. PR #63 remains Draft / MERGE HOLD. Independent GPT-6 delta review is required; no production-readiness or FE merge permission is granted.

## Source and evidence lineage

- Reviewed base: `0de3fcf63fc6afdd2e1875af06dadddf844ed33f`; previous tested source: `f3f40d9bcbeb247a79f3de6ea1a60a0d91181e21`.
- Source/tests commits: `79bfcebb20059bf372a6d5e7347a15708ec56b93`, then label-stability correction `fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9`.
- Exact final clean tested source: **`fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9`**. Every final suite records this SHA and clean status before execution. The evidence commit containing this report is separate; obtain its exact SHA with `git log -1 --format=%H -- <this-directory>`. A commit cannot contain its own SHA. The PR description records the resulting evidence SHA explicitly.
- Source tree: `2f755420aaf79da5745c11bebb35179099f27215`. GitHub PR merge ref `1a41a3731377dd97f12224e1e016a10c5415a4a1` has the identical tree. Target remains `integration/p1-author` at `7fd6f71b388320e00408b7ea47c0998708c70a2c`.
- Current remote HEAD was fetched before edits and again before the first source commit; both were the reviewed base. Only `codex/p1-memory-entity-hitl` was pushed. The independent review comment 6369698652 and workflow contract v1.4 were read. Historical evidence directories have no delta.

## Root causes and corrections

H-04 grouped unregistered occurrences by casefolded display name before allocating UUIDs. Human decisions now explicitly select an approved canonical ID or a scoped provisional identity key. Machine verification cannot assign that key. Different keys may share a name; repeated occurrences merge only through explicit human membership. Scope binds tenant, novel, immutable revision/hash and checkpoint. Existing review JSON/CAS durably stores membership and the winning reserved UUIDs. Retries/concurrent losers reuse the persisted result. Refresh preserves compatible human choices; changed occurrences require review. A reserved key retains its UUID through a valid human label change; a type change requires a different key. Alias targets use the group key, never an ambiguous label. Legacy implicit unknown multi-occurrence freezes fail closed on continuation rather than silently acquiring extraction authority.

H-05 had two name-based lock checks, in domain projection and PostgreSQL persistence. They now share exact subject/object ID resolution. Author correction also selects and replaces the exact pair, preserves existing provenance and serializes against Canon acceptance/rebuild. Complete metadata ID pairs are authoritative; incomplete/foreign IDs cannot fall back to names. Unique legacy names resolve both endpoints; ambiguous legacy locks remain unchanged and block projection. Existing unlocked system MENTIONED_IN edges retain their structural meaning. Projection validates retained relationships before replacing current state, inside the existing Canon transaction.

No migration or parallel relationship model: existing relationship_metadata JSON already holds both endpoint IDs and transition/event/fact provenance. Full lifecycle rules, API compatibility and the relationship lock matrix are in the [source contract](https://github.com/Ephurin/Novel_sharing_platform/blob/fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9/docs/development/integration/p1-author/memory-entity-hitl/CONTRACT.md#h-04--h-05-final-identity-contract).

## RED and GREEN

| Execution | Actual result |
| --- | --- |
| Original focused RED at reviewed base, production unchanged, only new test file | 3 FAIL, exit 1: provisional field unavailable; ambiguous occurrences silently merged; author lock lacked canonical endpoint metadata. Original test bytes/hash and source status are preserved in red/red-test-snapshot.json. |
| Additional legacy persistence probes | 3 FAIL, exit 1 using the exact base _persist_projection method over the current harness. These are explicitly method counterfactuals, not a claim of testing the whole old checkout. Both homonym sides falsely conflict; legacy ambiguous lock follows the unsafe path. Three real-PG before/after readbacks confirm transaction rollback. |
| Final AI unit | 321 PASS, 6 SKIP; exit 0. |
| Final PostgreSQL P1 HITL | 74 PASS = 43 existing H-01/H-02/H-03 contracts + 31 new identity cases; exit 0. |
| Existing PostgreSQL narrative/semantic/P8 regressions | 31 PASS; exit 0. |
| Focused backend owner/Gateway/CAS/Canon/persistence/outbox | 74 PASS; exit 0. TypeScript typecheck exit 0. |
| Python compile validation | exit 0. |
| Real Node Gateway → Python → platform revision/database HTTP | 1 PASS, 44 recorded requests; exit 0. |

These are **501 distinct passing local parameterized cases** across the final suites, plus six skips. Development runs, preliminary-source acceptance, overlapping counterfactual probes and CI reruns do not add unique counts. Six skips are PostgreSQL-only concurrency/confirmation checks on the memory adapter and SQL tenant checks on memory/JSON; applicable PG/SQL variants execute.

Commands, cwd, timestamps and exits are in test-accept-*-commands.json; test-accept-*-source.json pins clean source. Raw stdout/stderr is retained. Fresh isolated PostgreSQL/pgvector + MongoDB were provisioned specifically for final acceptance, separate from RED/development and preliminary-source resources. Both providers are fake; real provider keys are cleared by the runner. No production resources are involved.

## Required scenario coverage and durable evidence

| Gate | Assertions |
| --- | --- |
| H04-A / combined | Empty Canon, two new Minh, two author groups/UUIDs/proposals; separate explicit Canon action approves both, exact IDs reach events/facts/state and memory. |
| H04-B | Four occurrences explicitly share one group; one frozen and approved identity. |
| H04-C | Raw ambiguous machine choices return 422; entire durable state unchanged; no proposals/extraction. |
| H04-D | Compatible distinct groups retain IDs through guidance refresh; H-01 machine/context changes return to pending. Additional alias and label/type cases preserve identity authority. |
| H04-E | Barrier-forced overlapping freezes return identical persisted inventory/version/IDs; no duplicate durable assignment. |
| H04-F | Foreign tenant/novel/revision/hash/checkpoint namespace rejected with full before/after SQL equality. Dual targeting, arbitrary UUID, type/name/status conflicts and rejected occurrences carrying identity are rejected. |
| H05-A/C | Three approved fixture identities: A/B share Minh, X is Lan. A→X vs B→X and X→A vs X→B remain independent. |
| H05-B/F | Exact locked pair conflicts; full brain/proposals/events/facts/transitions/current state and lock rows unchanged after transaction failure. |
| H05-D | Ambiguous historical name-only lock cannot bind to either homonym; Canon and correction fail without mutation. Invalid/incomplete ID metadata cannot fall back to names. |
| H05-E | Repeated rebuild and reload preserve endpoint IDs, lock and transition provenance. Unique legacy lock resolves both IDs and retains historical metadata. |
| Combined HTTP | Empty-Canon provisional homonyms, freeze, exact-ID proposals, owner-only Canon approval, trusted-service author lock, later revision relationship for the other identity, memory replay/reload. UUIDs survive; pending proposals stay outside memory; only explicit Canon acceptance increments brain version. Anonymous/foreign Canon attempts leave durable state unchanged. |

identity-postgres-readbacks.json contains 51 new SQL stages; existing-semantics-postgres-readbacks.json has 8 existing/new frozen-inventory stages and concurrent-completion-readback.json preserves H-03 cardinality. Raw selected tables include complete relationship metadata and source evidence. gateway-postgres-readbacks.json and http-requests-responses.json capture actual public/trusted-service HTTP and durable platform revisions/Mongo checks. Exact fact-subject and state-target IDs are asserted in real-PG controlled-fake tests; the HTTP fake's generic fact has no subject.

## Exact-source CI

- [P7 run 39990840912](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39990840912): SUCCESS, 3/3 jobs.
- [P8 run 39990840983](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39990840983): SUCCESS, 7/7 jobs.

github-actions-source.json records the source query, run/job IDs, URLs and conclusions. P7 explicitly includes the new PostgreSQL file; P8 discovers all PostgreSQL cases. CI execution counts are not added to local unique counts. This report does not claim completion of any later evidence-only CI run.

## Limits and retained resources

Default ENTITY_CANDIDATE_VERIFICATION_ENABLED remains false. Immutable revision/provenance, extraction-only outbox, CAS/idempotency and author-only Canon approval remain intact. No FE/P3/payment/publication/deployment changes or merge occurred. Real provider quality, mounted FE grouping/locking UX, production rollout and P3/100k remain NOT_RUN. Legacy ambiguous locks require explicit identity remediation; this task never guesses a binding or adds a remediation UI. The existing relationship correction HTTP endpoint is trusted-service only; no new public Gateway correction route is introduced. Concurrent requests may repeat computation but publish only the winning durable inventory/proposal batch.

All six exact task-owned containers are stopped and every volume/destination retained. No old Docker volume was removed. The initial housekeeping verifier compared an unordered Mounts array as a list and exited 1 after docker stop itself succeeded; keyed comparison confirmed all mounts unchanged. Both inspections and the correction are retained. Historical evidence/fixtures and the user's original dirty checkout are untouched.

SHA256SUMS.json hashes committed Git blob bytes, so Windows line endings do not invalidate portable evidence verification. Acceptance orchestration and sealing scripts are copied for reproducibility; adapt their machine-specific ROOT/OUT paths outside the source checkout on another host.
