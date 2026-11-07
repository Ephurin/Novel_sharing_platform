# P2-01 final integration review preparation

2026-11-07 Asia/Saigon. **Verdict: ENV_BLOCKED for final P2-01 acceptance — combined automated verification PASS, Argon #91 handoff/owner approval still absent.** No PR was merged, no deployment, no P2-02 implementation. Codex self-verification does not replace independent review.

## 1. Latest verified PR/issue status

- [PR #89](https://github.com/Ephurin/Novel_sharing_platform/pull/89): OPEN, Draft, unmerged, mergeable; head `a2aeb9a0cf74d2ec21b5993574ee8e03b621a181`.
- [PR #92](https://github.com/Ephurin/Novel_sharing_platform/pull/92): OPEN, Draft, unmerged, mergeable. Started at `11ebd57c5927cfe0808c0ab292a6140357b95c40`; current CI-only follow-up head `6ef2333058e2cc2f16bff44abb654f0a988dfe54` adds the requested raw source assertion. Earlier READY_TO_MERGE review should be refreshed for this small delta.
- [Issue #91](https://github.com/Ephurin/Novel_sharing_platform/issues/91): OPEN, zero comments/no Argon evidence at final read. No hardware/Argon acceptance inferred from CI results.
- `integration/p2-planning-studio` still `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627` before work and final fetch.
- [Draft verification PR #93 — DO NOT MERGE](https://github.com/Ephurin/Novel_sharing_platform/pull/93) exists only to execute combined CI and preserve the candidate/report. Original #89 remains unchanged.

## 2. Exact base/source/head and composition

Because #92 had not merged, followed the unmerged-PR path. Created managed worktree/branch `codex/p2-01-combined-verification` from exact #89 head. Locally composed #92's follow-up on this temporary branch only; no GitHub PR merge or integration update.

```text
integration base       3adab5c73636bd4e7c3dbc6578d4ece0a54b5627
PR89 input             a2aeb9a0cf74d2ec21b5993574ee8e03b621a181
PR92 input             6ef2333058e2cc2f16bff44abb654f0a988dfe54
local candidate merge  e48d917d286365d13a444cea78b5aa7446cc32fe
initial harness source 4b86a3b810436f4714442a97634cfd430b8178dc
final tested source    4829acd7ce6403d34bc0eb819c9d50059fd4d5a2
actual CI checkout     2ff9f237915b7f58b0825b5c8eef0e470624b43d
identical source tree  74ede9a05f9e8926b20d940cd44181fdc3af41d4
```

Composition commands: `git switch -c codex/p2-01-combined-verification`; `git merge --no-ff 6ef23330 -m 'test(p2): compose PR89 and PR92 on verification branch only'`. No conflicts; candidate parents are #89 and #92 above. Final source adds only a temporary verification workflow after composition. Delivery/report commit is docs/evidence only; exact delivery HEAD is recorded in #93 description, never substituted for the tested source SHA.

`git diff --exit-code a2aeb9a0 4829acd7 -- ai-service backend web` exits 0. `git diff --exit-code 6ef23330 4829acd7 -- scripts .github/workflows/p8-cutover.yml` exits 0. Product files match #89 exactly; shared CI tools match #92 exactly. No rebase, reset, force push, main/demo change or historical evidence rewrite.

## 3. Changes and conflict review

- On the CI branch only: `scripts/p8_rollback_readback.py`, its comparison tests and `p8-cutover.yml` gain `--require-raw-equality` for source-after. Five comparison tests PASS, including rejecting even an equivalent cast rendering when raw source equality is requested. Restore still uses the existing defined schema comparison.
- On the temporary verification branch only: `.github/workflows/p2-combined-verification.yml` runs focused tests, real PG A16 and opt-in real Gateway/P1 save against task-owned PG/vector + Mongo `p2a` services. It is restricted to this head branch and must not be merged as product work.
- New deliverables: this report, `P2_02_IMPLEMENTATION_CONTRACT_DRAFT.md`, and `p2-01-final-integration-evidence/` (raw ZIPs, JUnit/logs inside them, exact command ledgers, job conclusions, artifact re-verifier and manifest).
- No bootstrap production edits, API changes, migrations, Author/HITL/Writer/Canon changes or new stores. No conflicts between P2 bootstrap and rollback CI were observed.

The extra raw CI assertion is an additive safety check, not a fix that weakens a failing business contract. #92 standalone follow-up also has same-source P7/P8 SUCCESS, but those runs are not used as combined evidence below.

## 4. Combined CI/test matrix — one source only

All rows below refer to **4829acd7 / tree 74ede9a...**, not a sum of independent #89/#92 runs. Overlapping suites/subsets are not added into one total.

| Combined execution | Actual result |
|---|---|
| [P7 42342208852](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342208852) | **3/3 jobs SUCCESS**: unit, pgvector-integration, root-compose-smoke |
| [P8 42342208899](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342208899) | **7/7 jobs SUCCESS**, including rollback, root-compose, backend/PG, frontend, unit and cleanup gate |
| P8 full non-PG AI suite | **392 PASS, 32 SKIP, 221 deselected**; ancillary subtests reported separately by pytest, no failures |
| P8 real PostgreSQL suite | **213 PASS, 8 SKIP, 424 deselected**; not a zero-skip claim |
| [Additional runtime 42342208880](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42342208880) | **1/1 job SUCCESS**, fresh PG/vector and Mongo services |
| Focused P2 guard/pacing/JSON + P1 manuscript service | **23 PASS**, JUnit 0 failures/errors/skips |
| Real A16 PG transaction tests with verbose readbacks | **15 PASS**, JUnit 0 failures/errors/skips |
| Gateway forwarding contract suites | **18 PASS**, 0 skipped/failed |
| Opt-in Gateway → Python → PG/Mongo + ordinary P1 changed save | **1 PASS**, 0 skipped/failed; `TEST_P2A_LIVE=1`, auth remains enabled |
| P1 backend integration | isolation guard 11/11, accept-draft 15/15, persistence 5/5, lifecycle/teardown 25/25; each actual PASS, no failures/skips |
| Existing production-path composition | AI-PIPE-01A 15/15, 02A 13/13, 02B 16/16, 03A verifier + following route/backend tests PASS |
| Local workflow syntax, rollback comparison tests, product/CI equality checks | PASS, exits 0; source checks only |
| Local PG/Mongo/browser runtime | NOT_RUN_ENVIRONMENT; Docker engine unavailable locally, browser not exercised |
| Argon/Issue #91 acceptance | NOT_RECEIVED / ENV_BLOCKED, not substituted by units or CI |

The initial 4b86a3b8 verification-only job had **5 FAIL / 26 PASS**, before runtime tests: legacy route unit fixtures omitted a service token because their standard test setup defaults to a dev auth override, while the new job enforces service auth. This is recorded at [initial run 42341979637](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42341979637) and `initial-4b86a3b8-failure.log`, not relabeled PASS. The harness was corrected to avoid duplicating those legacy fixtures in the authenticated runtime job. They still run in the unchanged full P7/P8 unit suites (including P1 manuscript routes); no product test/assertion or auth guard was edited. Real service/Gateway checks keep SERVICE_AUTH_DISABLED=false. Only final-source results above are accepted here.

## 5. PostgreSQL rollback evidence

Combined rollback artifact ID `13562045976`; committed copy: `p2-01-final-integration-evidence/combined-4829acd7/rollback.zip`. ZIP SHA-256 `4508f647d555b9dfd18ff5dc297fe311bfb82522124d6b4e6d73565bb4f4a486` was checked against Actions metadata.

- Matched client/server PG16.15; incompatible PG17.11 control still returns expected exit 1 at transaction_timeout. No restore error is ignored; --exit-on-error/pipefail and original parity gates remain.
- Actual backup hash `f7cd71fc91e77d95f9a32a8b622e46883c35b0f6462636fb3327f52af5158185`, verified against archived bytes.
- Original canonical equality, migration/version diff, pgvector diff and source snapshot equality PASS.
- Full 23-table raw source-before/source-after equality now explicitly enforced by CI (`raw_comparison=PASS`). Raw source hash `21f582be5859ddccf53a654a11f3905cafc03ec73005ae817ee096e209fd2ff6`.
- Restored source/schema comparison digest `e9e42e22f658a2a5172de76c0126738bb492d31bfc786848b521af95a8e9fa33`; narrow equivalent varchar-array cast normalization applies only to restored catalog definitions, never row data/raw source comparison. Negative tests still reject schema/data changes.
- Source/restored Alembic `0016_entity_profile_audit_timestamp`; vector extension `0.8.7`; equal-vector distance probe 0.

## 6. Durable P2/P1 runtime readbacks

Runtime artifact ID `13561622948`; committed copy `combined-4829acd7/runtime.zip`, SHA-256 `59b4e502f44d6065deaedaa5632936b0b653c4bdcd8bd4b8bdf331b36c563c22`. Source/tree inside archive matches the exact CI checkout/tree above. Actual task DB identities: `p2a` PostgreSQL **16.15** and `p2a` MongoDB **7.0.45**; image IDs/digests are retained. Explicit extension version is measured in the combined rollback artifact; do not mislabel it as a separate Mongo/Gateway-job extension-version query.

Downloaded archive re-verification (`verify_artifacts.py`, exit 0) checks:

- 15 A16 JUnit cases and 23 focused cases, no hidden skip/error/failure.
- **28 full scoped PG readbacks**, including **12 exact before/after negative pairs**. Active Brain never demotes; same-key replay and distinct-key/worker concurrency gates, missing/pending review and foreign tenant/novel rejection preserve scoped state. Concurrent finalization produces one job/run/proposal group. All setup readbacks have 0 historical events.
- **17 real Gateway requests**: four each 401 anonymous, 403 foreign owner, 404 missing novel and 409 owned active Brain, then one 200 changed-body save. **4 exact full PG/Mongo before/after pairs** preserve state on rejected idea/manuscript bootstrap with real or null baseline.
- Saved prose preserves the original immutable revision byte-for-byte, creates one new `AUTHOR_MANUAL` revision (2 total), and one completed `INCREMENTAL_ANALYSIS` outbox event linked to the exact new revision/hash. New content SHA-256 `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1` recomputes correctly; chapter head and Mongo body agree. Mongo version becomes 2.
- Approved entities/events/facts/transitions/relationships/current-state/decisions remain unchanged; Brain remains active at version 5. Extraction/outbox completion is not author Canon acceptance or M-FIRST proof.

These are real disposable CI database/readback results on combined source, not inherited in-memory PASS. Fake LLM/embedding selection and absence of supplied paid-provider secrets are recorded; no real Gemini calls or quota changes. This task's CI runner evidence is not an Argon-authored delivery or blanket live-egress/network audit. No shared QA/production resources were used.

## 7. Exact commands and reproduction

- Actual workflow commands/cwd/exits: `runtime-command-exits.json`; every final runtime step exit 0. Rollback commands are in the same-source workflow and log; intentional PG17 process exit 1 is asserted as EXPECTED_FAIL, normal restore exits 0.
- A16 invocation: `pytest -o addopts= -vv -s -m postgres_integration --basetemp=<task temp> --junitxml=<artifact>/a16.xml tests/test_p2_bootstrap_postgres.py`.
- Gateway: `npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts`; then `P2A_EVIDENCE_FILE=<artifact>/gateway-readbacks.json npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts` with explicit TEST_P2A_LIVE=1 and fake-only real AI service.
- Reverify committed ZIPs without database/provider calls: `python docs/development/p2/p2-01-final-integration-evidence/verify_artifacts.py` (requires repository Python dependencies). It checks ZIP hashes, JUnit, identities, before/after equality, revision hashes/linkage, Canon invariance and rollback raw equality. Result: `combined-4829acd7/verified-summary.json`.
- Local Bash/workflow syntax, five rollback comparison tests and product/CI source equality checks: exact commands/exits in `local-commands.json`; local Docker probe exit 1 is explicitly NOT_RUN_ENVIRONMENT.
- Job IDs/conclusions, source-specific excerpts and artifact hashes are committed. Manifest hashes committed Git blob bytes to avoid Windows checkout newline ambiguity. Original #89/#92 evidence remains unchanged and is not pooled with this execution.

## 8. Argon status and remaining merge gates

Issue #91 was read at start and immediately before final report: OPEN, 0 comments, no returned Argon evidence. Required Argon checks remain pinned source/tree, independent PG/vector+Mongo identity, 15 A16 cases, Gateway round-trip, P1 changed save/revision/outbox, durable negatives and fake-provider/egress evidence. New combined CI artifacts can be reviewed as supplemental evidence; they do not close #91 or infer owner approval.

Remaining blockers:
1. Argon must hand off #91 (or owner explicitly accepts an alternative runtime evidence source) and independent review must assess it. Until then, **ENV_BLOCKED** persists as requested.
2. Owner decides integration of #92 and #89. No PR is auto-merged. #92's small 6ef23330 assertion delta needs review relative to the earlier READY_TO_MERGE checkpoint.
3. Actual eventual integration SHA must be compared with this candidate and checks refreshed if code differs. This temporary PR is not an instruction to merge all verification scaffolding.
4. Mounted human browser acceptance remains unrun; no Planning Studio/M0/M-FIRST completion claim. Existing process-crash reservation and transitional extract422 limits remain disclosed.

## 9. P2-02 readiness checklist and review handoff

Read roadmap, prior preparation document and pinned WORKFLOW_CONTRACT v1.4. New [P2_02_IMPLEMENTATION_CONTRACT_DRAFT.md](P2_02_IMPLEMENTATION_CONTRACT_DRAFT.md) specifies proposed typed setup-v1/legacy compatibility, explicit extraction versus creative proposals, immutable snapshot/hash/spans, world rules/characters/initial conditions, identity-safe homonyms, author review/version/CAS, three authority lanes, privacy and owner readback. It reuses existing stores and forbids fake revisions/history.

- [x] Combined source and current PR status pinned; automated CI/DB evidence collected and verified.
- [x] P2-02 implementation contract prepared as an unimplemented proposal.
- [ ] Argon #91 delivery accepted and owner approves P2-01.
- [ ] Freeze next-PR DTO/alias/limits, privacy policy, review/CAS and empty/all-rejected setup consent before implementation.
- [ ] Fresh approved integration base, separate P2-02 branch/PR and independent review gate.

**Stop at review gate.** P2-01 is not declared complete; P2-02 has no production implementation. No merge, deployment, force push, live forwarding, paid provider calls, Canon auto-approval, new Brain/Canon/Writer store or P1 reimplementation.
