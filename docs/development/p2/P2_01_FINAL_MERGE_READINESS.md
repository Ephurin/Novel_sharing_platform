# P2-01 final merge readiness

2026-11-07 Asia/Saigon. **Verdict: ENV_BLOCKED** for final acceptance: **ARGON_PENDING** and no owner decision accepting alternative CI evidence. Technical fix and exact-source automation are ready for independent review. No PR was merged by this agent.

## Exact source and integration

- Previous #89 head: `a2aeb9a0cf74d2ec21b5993574ee8e03b621a181`.
- Verified #92 owner merge / current integration base: `c0bacfb18a24701caf3dada6b6963c397eb9c7b0` (PR closed/merged).
- Normal integration-into-#89 merge: `13e6f02bc59e9a93ca0eee8bb2aedb24abb33c3d`, no conflicts; tree `b3f99e80bc82a55f027d3460ad58318b8cc4e937`.
- New tested #89 source: `5b5da637b014de925fb0b357275ccfb60ad7c984`; tree `1a66e49e760711cf929fd03b06e9392baafd881f`.
- Actual #89 P7/P8 checkout: `0ca1cfd7adec10b327350e5f3a04f164cf7fc52c`, identical tree to tested head. Final delivery adds this report/evidence only; its SHA is recorded in PR metadata, not relabelled as the tested source.
- Temporary #93 verification source: `3263327685ce205c98231d4407a5985ce15952e6`; actual checkout `1a2585aed5a8e3311e0a7b473821b40a6d06af47`; identical tree `ef604e98818fc0cee76d3020a1b688f1ec2b5689`. Never merge #93.

`git diff --exit-code 4829acd7 13e6f02b -- ai-service backend web scripts .github ':!.github/workflows/p2-combined-verification.yml'` exited 0. The integration merge exactly reproduces the historical combined product/CI candidate. New source intentionally differs in six files listed below for the resume fix. `git diff --exit-code codex/p2-01-bootstrap-foundation 32633276 -- ai-service backend web scripts .github ':!.github/workflows/p2-combined-verification.yml'` exited 0 before documentation delivery: runtime scaffolding and documents are the only additional #93 content. PG16 client pin/raw source equality, pacing compatibility, Writer/revision/outbox and authority guards remain intact.

## Resume API correction

Root cause: the route queued any failed job and returned 202, while `resume()` silently returned idea jobs because their blueprint work has no resumable manuscript checkpoints. The author saw successful acceptance without a retry.

`validate_resume(job)` now rejects failed `options.from_idea` jobs with `BootstrapConflictError(IDEA_BOOTSTRAP_RETRY_UNSUPPORTED)`. Both the HTTP route (before enqueue) and direct service entry enforce it. HTTP contract: **409**, `detail.code=IDEA_BOOTSTRAP_RETRY_UNSUPPORTED`. No background task, provider call, status update or new job/proposal/run. Existing terminal idea replay stays side-effect-free; manuscript durable-checkpoint resume remains unchanged. No lease/crash recovery is implemented.

Gateway already propagates upstream errors through AppError/Express rather than its success response; new forwarding regression verifies this 409/code. Author IDE already uses rejected mutation/onError; the shared API error formatter now displays a Vietnamese instruction to begin a new operation. No success toast/refetch occurs after rejection. Real browser interaction is NOT_RUN_ENVIRONMENT; frontend typecheck and full P8 web build passed. Do not claim browser acceptance.

Changed production/test files:

- `ai-service/application/bootstrap_service.py`: shared preflight and direct-service enforcement.
- `ai-service/api/narrative_routes.py`: reject before scheduling.
- `ai-service/tests/test_p2_bootstrap_guard.py`: update obsolete no-op assertion; HTTP scheduling/provider/state and terminal replay regressions.
- `ai-service/tests/test_p2_bootstrap_postgres.py`: actual HTTP409 and exact durable before/after equality.
- `backend/src/modules/ai/ai-gateway.test.ts`: preserve upstream409/code.
- `web/src/shared/api/api-client.ts`: author-facing error message.

No migrations/business-store/auth/Canon changes. Integration also brings #92 files/history unchanged. New report and `p2-01-merge-readiness-evidence/` preserve older evidence instead of editing it.

## Executed source-specific checks

| Source / check | Actual conclusion |
|---|---|
| #89 5b5da637 [P7 42351367491](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42351367491) | **3/3 SUCCESS** |
| #89 5b5da637 [P8 42351367510](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42351367510) | **7/7 SUCCESS**, rollback, web build, backend persistence and root composition included |
| #89 full offline AI | **395 PASS /32 SKIP /222 deselected**; six subtests passed, not added to total |
| #89 full PostgreSQL | **214 PASS /8 SKIP /427 deselected** |
| #89 P1 DB guard/accept/persistence/lifecycle | **11/15/5/25 PASS** respectively; separate invocations, no sum |
| #89 root composition | 01A15/15, 02A13/13, 02B16/16, 03A18/18 PASS |
| Equivalent product on #93 32633276 [runtime 42351383862](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42351383862) | **1/1 SUCCESS**; focused26, real PG A16 **16 PASS/0 SKIP**, Gateway19, real Gateway/P1save1 PASS |
| Local focused / Gateway / frontend | **26 PASS**, **19 PASS**, typecheck exit0 |
| Local archive verification | exit0: hashes, source/tree, durable pairs, revision/outbox/Canon, rollback/source equality |
| Argon #91 / mounted browser | **ARGON_PENDING / NOT_RUN_ENVIRONMENT** |

These are new executions, not recycled historical4829 evidence. Full suites and focused subsets overlap and are not summed. The extra runtime result belongs to #93 with proved equivalent product source, not an independently executed #89 runtime workflow. No temporary workflow was added to #89.

Commands (exit0 unless explicitly listed):

```powershell
# #89 worktree, after merge; same committed bytes as5b5da637
python -m pytest ai-service/tests/test_p2_bootstrap_guard.py ai-service/tests/test_manuscript_bootstrap.py ai-service/tests/test_p2_bootstrap_pacing_compat.py ai-service/tests/test_p2_json_bootstrap_compat.py -q
# backend/; mocked forwarding, unreachable isolated DB URLs, NODE_ENV=test,
# JWT_ACCESS_SECRET=offline-access-secret JWT_REFRESH_SECRET=offline-refresh-secret
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:1/p2a
# MONGODB_URI=mongodb://127.0.0.1:1/p2a
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
# web/
npm ci --ignore-scripts
npm run typecheck
# repository root
python docs/development/p2/p2-01-merge-readiness-evidence/verify_artifacts.py
git diff --check
```

CI exact commands are pinned in `.github/workflows/p7-semantic-memory.yml` and `.github/workflows/p8-cutover.yml` at5b5da637; temporary runtime command transcript is archived in runtime.zip. Key runtime commands (ai-service/):

```bash
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p2-combined/focused.xml" tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p2-combined/a16.xml" tests/test_p2_bootstrap_postgres.py
# backend/, TEST_P2A_LIVE=1
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p2-combined/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
```

Initial local attempts are not hidden: partial UTF-8 edit failed (exit1), with obsolete assertion producing1FAIL/16PASS; completing the intended test/route edits produced20PASS then26PASS. Gateway first attempt exit1 because required env vars were unset; explicit offline env above produced19PASS. Initial web typecheck exit1 because tsc was absent; locked install exit0, rerun exit0. No contract/test relaxation or live provider call. A too-large log-export command hit Windows process argument limit; compact job/excerpt export succeeded, full runtime/rollback archives remain available.

## Independently verified durable readbacks

`p2-01-merge-readiness-evidence/verified-summary.json` and archives are re-verifiable with the adjacent script. Runtime artifact13565324105 SHA256 `8f7ac4d9c03a3d064b8e84fdfc83ed626bc33a8822ec58a8dd8b9aa7dec8c62e`; rollback artifact13565257940 SHA256 `5f6c5ea07ec0c7c5ea52b16540d0707ed3ad7abf34cbf0382f27e4a1fda86604`.

- Disposable PG16.15 and Mongo7.0.45 both namedp2a, task-only services, fakeLLM/embeddings, no paid-provider credentials. Not P1QA or production.
- 30 PG snapshots /13 exact non-mutation pairs; failed-idea-resume-before equals after across all scoped narrative tables, one persisted failed job, zero analysis runs/proposals, provider count remains1. Real HTTP409 asserted; FastAPI background task would execute under TestClient if wrongly queued.
- Active Brain, exact replay, changed-key/input conflict, concurrent reservation, missing/pending review and JSON failure remain guarded. All setup readbacks have zero historical events.
- Real Gateway17 requests: four each401/403/404/409, one successful200 save; four exact rejected PG/Mongo pairs.
- Original immutable revision unchanged; new AUTHOR_MANUAL revision content hash `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1`, exactly linked completed INCREMENTAL_ANALYSIS outbox, Mongo version2; approved Canon/entity/history unchanged at Brainversion5.
- #89 rollback backup/restore23 tables; source raw before/after equal, restore normalized schema/data parity, migration0016_entity_profile_audit_timestamp/vector0.8.7. PG16 matched clients; incompatiblePG17 restore intentionally exits1. Backup hash `c55428d2dbabb37cf590103ef20f58fcc4eaec2c1f1e054c7816dd1a1ea984ce`. Source raw hash `86ac9ff5ce8d5049b9b6755e27ab14bb39aea3899ca0aaabc32fac029c0935f5`. No timeout filtering or exit suppression.

## Owner/independent review gate

#91 still OPEN with zero comments/no Argon handoff at final read: **ARGON_PENDING**. No policy change/issue closure or owner waiver inferred from green CI. Technical automation found no unexplained remaining regression. Known limits: no crash lease/recovery, configured singletenant deployment, backend-only P2-01, setup extract/M0/Studio not implemented; browser not executed here.

Owner/reviewer should review the six-file resume delta and normal integration merge, then reconcile #91 evidence or explicitly decide whether this new GitHub Actions package substitutes for its automated runtime portion. Owner alone approves acceptance/merge of#89. Preserve#93 DO NOT MERGE and historical reports. P2-02 remains unstarted. **ENV_BLOCKED** refers to final independent runtime/owner gate, not failure of the new real CI database checks. No self-merge/deploy/forcepush/liveLLM/QA-data mutation.
