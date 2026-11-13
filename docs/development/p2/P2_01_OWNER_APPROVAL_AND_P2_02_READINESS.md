# P2-01 owner gate and P2-02 readiness

2026-11-07 Asia/Saigon. **Final verdict: BLOCKED — ARGON_PENDING.** Combined automation is verified; no owner decision accepting equivalent CI runtime evidence or approving P2-01 has been supplied. No PR merge, deployment, production P2-02 change or new implementation branch.

## Current state and exact inputs

| Item | Latest verified state / SHA |
|---|---|
| integration/p2-planning-studio | `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627`, unchanged after fetch |
| #89 Bootstrap Foundation | OPEN/Draft, unmerged, mergeable; `a2aeb9a0cf74d2ec21b5993574ee8e03b621a181` |
| #92 CI rollback | OPEN/Draft, unmerged, mergeable; `6ef2333058e2cc2f16bff44abb654f0a988dfe54` |
| #93 verification, DO NOT MERGE | OPEN/Draft, unmerged; input delivery `f6f911b6cfbaf3a36728b666330d855f7caf5ad0`; this task adds preparation documents only, new delivery SHA recorded in #93 metadata |
| #91 Argon | OPEN, zero comments, no delivered evidence: **ARGON_PENDING** |
| Reviewed combined runtime source | `4829acd7ce6403d34bc0eb819c9d50059fd4d5a2`; CI checkout `2ff9f237915b7f58b0825b5c8eef0e470624b43d`, identical tree `74ede9a05f9e8926b20d940cd44181fdc3af41d4` |

No reconciliation commit to #89 was appropriate because #92 has not merged. Both product PRs remain untouched in this task. #93 reports/ZIPs/historical evidence are preserved; it is neither closed nor approved for merging.

## Confirmed source equivalence and CI

- `git diff --exit-code 4829acd7 f6f911b6 -- ai-service backend web scripts .github` => 0: prior delivery is docs/evidence-only after the runtime-tested source.
- Product source at current combined HEAD equals #89; shared scripts/P8 workflow equal #92 (both scoped diffs exit 0).
- Read-only `git merge-tree --write-tree #89 #92` => 0, candidate union tree `b3f99e80bc82a55f027d3460ad58318b8cc4e937`. Relative to f6f911b6, only docs/evidence and `.github/workflows/p2-combined-verification.yml` differ. No non-verification production divergence, branch merge, index rewrite or force push.
- Current #92 exact head: [P7 42341774673](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42341774673) **3/3 SUCCESS**, [P8 42341774664](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42341774664) **7/7 SUCCESS**. Its raw source equality flag and five comparison tests remain intact; no new observed regression.
- Current #93 input delivery f6f911b6: [P7 42342964396](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342964396) **3/3 SUCCESS**, [P8 42342964345](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342964345) **7/7 SUCCESS**, [isolated runtime 42342964366](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342964366) **1/1 SUCCESS**. Actual individual job conclusions were read, not inferred from a summary badge.

The detailed counts/readbacks below remain attributed to **4829acd7**, where they were independently downloaded/verified. They are not pooled with #89, #92 or a later delivery. No completed production component was rewritten or manually retested here; current CI was inspected and scoped source equivalence rechecked. Original exact-command/JUnit/readback package: [P2_01_FINAL_INTEGRATION_REVIEW.md](P2_01_FINAL_INTEGRATION_REVIEW.md). Status snapshot: `owner-gate-readiness/github-state.json`.

## P2-01 acceptance matrix for the owner

“Verified” below means technical evidence available, **not owner-accepted functionality**.

| Functionality | Combined source evidence | Owner acceptance / limitation |
|---|---|---|
| Active Brain protection, scoped replay/concurrency, activation review | 23 focused PASS; 15 real A16 PASS/0 SKIP; 28 PG snapshots/12 exact rejection pairs | Verified; owner acceptance pending; crash-running reservation recovery is still fail-closed without a lease |
| Gateway auth/tenant/ownership | 18 contracts PASS, 1 real Gateway round-trip PASS; 16 real 401/403/404/409 negatives and 4 exact PG/Mongo rejection pairs | Verified; configured single-tenant deployment, not dynamic multi-tenancy |
| P1 immutable revision/outbox/Mongo CAS | Original revision unchanged, new AUTHOR_MANUAL hash recomputed, one completed linked outbox, Mongo version 2, approved Canon unchanged at Brain version 5 | Verified; outbox completion is not M-FIRST or automatic Canon acceptance |
| Rollback and migration/vector/source integrity | P8 rollback PASS, 23-table parity, explicit raw source-before/after equality, PG16.15/vector0.8.7; PG17 mismatch intentionally fails | Verified; no restore errors stripped or suppressed |
| P1 regression/full suites | Same-source 392 AI PASS/32 SKIP; 213 SQL PASS/8 SKIP; P1 persistence/accept/lifecycle and root composition PASS | Executed SKIPs remain SKIP; no sum of overlapping suites or source SHAs |
| Argon independent runtime evidence | No #91 report, SHA, identities or readbacks returned | **ARGON_PENDING**; equivalent GitHub Actions evidence is supplemental until owner explicitly accepts it |
| P2-02 extract/UI/first-chapter completion | Not implemented; legacy mounted extract remains explicit 422 on unreleased P2 branch | Not accepted/claimed; setup provenance and M0/M-FIRST/Studio are later scoped stages |

The existing combined archives identify task PG p2a/16.15 and Mongo p2a/7.0.45, fake LLM/embeddings, zero supplied live-provider credentials and immutable source/tree. They support the technical matrix, but do not constitute Argon delivery or an owner waiver. If Argon later returns evidence, reconcile its exact source/tree, DB identities, 15 actual cases, Gateway negatives, immutable revision/outbox and Canon non-mutation before changing this gate.

## Exact merge recommendation — owner actions only

1. Owner/reviewer can approve **#92 at 6ef23330 first**, including its small raw-source assertion follow-up; its required CI is green. Do not merge it automatically.
2. After the owner actually merges #92, fetch the new integration merge SHA and inspect ancestry/diff. Refresh #89 by a normal merge of that base into its own branch, preserving history; no force push/rebase rewrite.
3. Compare refreshed #89 product/CI tree with the reviewed combined candidate, excluding docs and the temporary verification workflow. Investigate any other difference and run affected tests; record the actual new head and required checks, never reuse candidate CI as exact-head CI.
4. Keep #89 unmerged until #91 is reconciled **or owner explicitly accepts the equivalent CI runtime package**, then explicitly approves the P2-01 gate. CI green alone is not approval.
5. Owner then decides #89 merge. Record the approved resulting integration baseline and required checks. **Never merge #93**; preserve its reports/evidence and leave closing/deletion to the owner.
6. Only after that explicit approval/baseline, create `codex/p2-02-setup-provenance` from a fresh verified integration head. No P2-02/P2-03/04/05 production work starts in this task.

## P2-02 frozen proposal and bounded readiness

New preparation package: [setup-v1-rc1/README.md](setup-v1-rc1/README.md), strict [schemas.json](setup-v1-rc1/schemas.json), synthetic [fixtures.json](setup-v1-rc1/fixtures.json). This is a technically frozen **RC1 for review**, not an active API or owner-approved release. Earlier draft/preparation documents remain unchanged. The README defines legacy compatibility, explicit extract/creative mode, immutable hash/spans/declaration references, three lanes, origin/status separation, homonym IDs, author full-group review/CAS, owner readback/privacy and existing-store reuse.

- Prepared request, readback and review DTOs, including exclusive known-ID/provisional-key choices and exact source references. Server owns authority metadata; request schema rejects it.
- Existing profile code requires a real chapter cutoff; initial conditions cannot fabricate a revision/chapter to satisfy it. Proposed static setup mapping is an explicit owner decision, not an implementation shortcut.
- Private notes/constraints are owner-only and excluded from provider payloads by default. Empty draft/no outline is valid; it does not imply empty baseline activation consent or implement P2-04 writing.
- Source-based migration analysis proposes reuse of bootstrap_jobs.result and scoped Brain/job transactions, **no migration now**. Monotone setup-version allocation and review CAS still need real PG tests in the approved next PR; an index/constraint requires demonstrated need, not a new store.
- Bounded future file/test ownership is listed in README; Codex owns all Python/Gateway/shared-client/test work. No Writing/Canon engine, P1 rewrite, full Studio or Plan engine is introduced.

Unresolved decisions: **D1** P2-01 owner acceptance/start permission; **D2** empty/all-rejected consent; **D3** initial-condition materialization/context allowlist; **D4** any later private-note sharing opt-in; **D5** retention/operational limits beyond existing guards. Defaults remain fail-closed/private-excluded, with existing 1 MB Gateway limit. D1 blocks production start; policy gates must be resolved before claiming their behavior supported.

Documentation-only validation: `jsonschema==4.23.0` installed in host TEMP, no application dependency edits. `python docs/development/p2/setup-v1-rc1/validate_fixtures.py --tools <temporary tools directory>` exits **0**: **22 DTO expectations** (9 valid, 13 intentionally invalid), 1 canonical hash vector and 2 spans verified. Exact schema/fixture/validator hashes are in `validation-result.json`. These are **not P2-02 unit/runtime PASS**: all 12 proposed runtime scenarios remain **NOT_RUN_NOT_IMPLEMENTED**.

Proposed runtime scenarios cover explicit-only extraction, outline/hint/private exclusions, pending blueprint, edits/rejection, homonyms, idempotency/concurrency, stale setup versions, missing/pending activation decisions, rules without history, scoped readback, unchanged P1 and optional/no-plan entry. Actual first-save M0/M-FIRST remains a later P2-04 composition dependency. Production application, database and provider code is unchanged.

**Stop at owner gate: BLOCKED / ARGON_PENDING.** No self-merge, deployment, force push, live LLM call, quota change, Canon auto-approval or claim that P2-01 is accepted.
