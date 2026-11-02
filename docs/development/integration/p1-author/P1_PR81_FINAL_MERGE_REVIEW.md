# P1-PR81-FINAL-PROMOTION-REVIEW

**Verdict: PR81_READY_TO_MERGE**

**NO_NEW_BLOCKERS.** No unresolved BLOCKER/MAJOR found. Merge into the integration branch is recommended, subject to GPT-6's final decision. This review does not authorize deployment or provider activation. PR #81 has not been merged by this task.

Review date: 2026-11-02, Asia/Ho_Chi_Minh. Report-only branch originates from the exact reviewed HEAD; no source changes or new regression run were needed in this reporting step.

## 1. Exact refs and diff

| Ref | SHA |
|---|---|
| PR #81 head / `codex/p1-live-safety-01` | `94099089d2a5ee2a89a95ccd028b1134c2326b32` |
| Target / `integration/p1-demo-20261109` | `6cbff8829d731704a0e8301fedaa2b1f38dd14c1` |
| Merge base | `6cbff8829d731704a0e8301fedaa2b1f38dd14c1` |
| Prior post-#84 tested tree | `fae6d497fb5a43dd6cb5a47fdb143e5ee3badb8c` |

Fetched refs remain unchanged from the preceding final gate review. Reviewed `integration/p1-demo-20261109...codex/p1-live-safety-01`: 22 commits, 49 files, 11,335 additions / 92 deletions. #83 and #84 are ancestors of HEAD. Full tracked tree comparison between `fae6d497` and HEAD is identical, not merely selected file parity. Target is an ancestor of HEAD; GitHub reports `mergeable=true`. [PR #81](https://github.com/Ephurin/Novel_sharing_platform/pull/81) remains open and Draft.

## 2. Exact-HEAD CI matrix

All jobs are completed/success; none is pending. Results were retrieved from Actions run/job records in the preceding review at this same HEAD, not inferred from the PR body or legacy combined-status API.

| Workflow / run | Job | Result |
|---|---|---|
| [P7 / 41469950848](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41469950848) | unit | SUCCESS |
| P7 | pgvector-integration | SUCCESS |
| P7 | root-compose-smoke | SUCCESS |
| [P8 / 41469950028](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41469950028) | unit | SUCCESS |
| P8 | rollback-rehearsal | SUCCESS |
| P8 | root-compose-cutover-smoke | SUCCESS |
| P8 | final-cleanup-gate | SUCCESS |
| P8 | backend-integration | SUCCESS |
| P8 | frontend-api-cutover | SUCCESS |
| P8 | postgres-integration | SUCCESS |

CI scope: P7 covers semantic/context/pgvector and approved-memory/HITL contracts. P8 covers frontend API boundaries/build, deterministic backend tests, migrations, real database integration, rollback and root Compose smoke. Its backend-integration job explicitly runs the Accept trust-contract suite. Deterministic discovery includes `writing-drafts.test.ts`, but excludes `*.postgres.test.ts`. Neither Writing recovery browser suite nor `writing-drafts.postgres.test.ts` is explicitly invoked by these workflows. Those have separate PC evidence below. Green CI is not claimed as proof of every safety-harness test or live Gemini operation.

## 3. Review of the five change groups

| Group | Review conclusion |
|---|---|
| A — Live Safety | Guarded Python LLM clients, Gemini embedding and Node Copilot require validated proxy configuration in the P1 `live_free_tier` profile; no direct-provider fallback was found in that profile. Gateway defaults both live enable/forwarding flags to false, authenticates workers/operator separately, restricts live HTTPS origin, rejects redirects/private-note payloads and persists emergency admission disable. Existing legacy direct modes are not represented as globally removed. |
| B — Free Tier | Explicit per-model RPM/TPM/RPD/headroom/concurrency and operator attestation are required; missing/expired state fails closed. Durable ledger/locking, provider error settlement and Pacific-day reset remain. No reset of active QA counters was performed. Approved primary text/embedding models and 768-dimension finite-vector validation match the acceptance contract. Model candidates do not silently switch to another Gemini alias; P1 fallback is disabled. |
| C — AA-01 | Authenticated chapter/novel ownership plus SQL actor/tenant scope bound recovery; DTO omits raw private context. Recovery uses authoritative revision pointer, hash and Brain drift checks. Dismiss persists under the same chapter writer lease as Accept. Accepted provenance prevents resurrection; stale response/session guards prevent chapter/account UI contamination. No automatic insertion or acceptance occurs. |
| D — Schema/data | No backend/AI-service migration is added or changed in this diff. Existing job status/stage are string fields supporting `dismissed`; no destructive migration or dependency manifest change. Accept keeps immutable revision/outbox transaction and idempotency guards, adds authoritative pointer validation under lock, and retains existing stale/hash/Brain checks. No unrelated Canon/HITL behavior change was found. |
| E — Integration | Current target ancestry and GitHub mergeability show no conflict. Frontend recovery/dismiss routes match authenticated backend DTO/route contracts. CI applies current backend and Alembic migrations with PostgreSQL/Mongo. Required Free Tier/operator configuration is documented and intentionally not supplied as tracked secrets. Merge alone does not activate this opt-in runtime. |

Source reviewed includes `p1_live_safety_gateway.py`, `quota_controller.py`, the P1 Compose profile, Python LLM/embedding adapters, Node Copilot provider, Writing review routes/service/client/UI and existing Accept service changes. Canon approval remains a human action; no new proposal autoapproval path was introduced.

## 4. Evidence provenance and regression mapping

| Evidence | What was actually verified | Limits |
|---|---|---|
| Exact-HEAD GitHub P7/P8 above | 10 successful jobs, including real PostgreSQL/pgvector/Mongo-backed integration and Accept trust-contract | Not a live provider test; new recovery SQL/browser suites are not CI-invoked |
| PC post-#84 and postmerge database gate | 31/31 backend checks, including DB01–DB12: recovery/dismiss persistence, actor/chapter isolation, stale hash/Brain/pointer, duplicate Accept and concurrent Accept/Reject | Real PostgreSQL/Mongo; trusted AI job read boundary uses a SQL fixture adapter |
| PC real-database browser acceptance | Production IDE + authenticated Express + actual SQL/Mongo: reload recovery, Reject/reload, valid fresh Accept/reload, revision/outbox/manuscript readback and stale disabled Accept | No generation worker or provider; existing analysis outbox processing deliberately denied locally |
| PC mocked browser suite | Reload/session/chapter/account response-race and review-control behavior | Mock HTTP; not claimed as database persistence proof |
| Actual QA runtime after #84 merge | `sol61` login, historical draft recovery/stale warning, unchanged 346-word manuscript, saved profile/event Canon readback across reload | Fresh candidate decisions not repeated because historical queue was empty; no QA mutation to fabricate PASS |
| Earlier Canon/HITL acceptance | Real UI manual proposal reject/approve, profile saves, event correction, reload/login persistence; Brain reached v7 | Historical acceptance, not a fresh Gemini extraction at this gate |
| Earlier real Gemini smoke | Exactly 6 successful dispatches: text, structured JSON, document/query 768-dimension embedding and Writing; isolated pgvector retrieval | Historical, not this review; Writing used an empty Brain, populated-Canon semantic recall was NOT_RUN |
| Preceding PR81 final gate offline tests | 10/10 selected gateway tests PASS (22, 23, 24, 26, 31, 36, 38, 39, 49, 53); 45 deselected | Fake/mocked upstream only, 9.25 seconds; not a repeat of all 136 historical tests |

The tested tree is byte-identical to HEAD, so no database/browser rerun was needed merely for the #83 merge commit. Docker Engine is currently unavailable/stopped; it was not restarted for this review. That does not invalidate exact-HEAD CI or the earlier real-database evidence on the identical tree.

Evidence: [AA-01 database gate](P1_AA01_DRAFT_RECOVERY_CODEX.md), [Author acceptance](P1_AUTHOR_ACCEPTANCE_SOL61.md), [Canon/HITL summary](evidence-sanitized/canon-hitl-summary.md), [real smoke](P1_REAL_SMOKE_SOL61.md), and the separate [postmerge demo report](https://github.com/Ephurin/Novel_sharing_platform/blob/codex/p1-postmerge-demo-gate-01/docs/development/integration/p1-author/P1_POSTMERGE_DEMO_GATE_CODEX.md).

## 5. Security, migration and manual configuration gates

The preceding review scanned the 49 changed files directly from the final Git ref: no real credential pattern, active credential, runtime environment file, HAR or raw request dump was found. Exact matches limited to the explicitly declared non-secret tokens in `.env.free-tier.example`; they do not match effective P1 container credentials. Existing sanitized images/evidence are unchanged from their reviewed publication. No raw logs, database dumps, private notes or credentials are added by this report.

Migration compatibility is supported by both exact-HEAD CI and PC database acceptance: PostgreSQL 16.15 / pgvector 0.8.6, MongoDB 7.0.39, backend migrations through `017_transactional_moderation_evidence.sql` and AI-service Alembic `0016_entity_profile_audit_timestamp`. No new migration or dependency package is needed for AA-01.

Operator prerequisites are documented in `.env.free-tier.example`, [Free Tier runbook](P1_LIVE_FREE_TIER_01.md), [environment handoff](P1_ENV_UNBLOCK_CODEX.md) and the smoke shutdown/authorization procedure. Provision real local-only worker/operator credentials, gateway reachability/durable state, actual project quotas and a freshly verified key/project attestation before any separately approved live run. Template quota placeholders are not usable defaults. Keep `LIVE_FREE_TIER_ENABLED=false`, `LIVE_UPSTREAM_FORWARDING=false` and fallback disabled for offline rehearsal; verify effective processes, not only files. Historical attestation is expired and was not renewed or used here.

## 6. Findings and release limitations

**NO_NEW_BLOCKERS. Open BLOCKER: 0. Open MAJOR: 0.** No source patch is requested.

| ID | Severity | File/line and evidence | Impact / smallest remedy |
|---|---|---|---|
| DOC81-01 | MINOR | `P1_LIVE_FREE_TIER_01.md:182–189` lists five user operations as requests and audits `<=5`. Actual smoke recorded two provider dispatches for one Writing operation (embedding + generation). | Historical runbook wording is not a reliable future call-cap procedure. Use actual ledger/outbound counts and the controlled-smoke hard cap, not click counts. This report explicitly supersedes that interpretation; update the old paragraph in a future docs cleanup. No live activation is authorized, so this does not block disabled-runtime integration. |

Known non-blocking demo limitations remain disclosed: prepare disposable pending candidates and valid Writing fixtures for fresh approval/Accept/Reject; preserve the correctly stale historical draft. Use Story Brain for approved Canon because the legacy Cẩm nang drawer is empty. AA-02's source label remains backlog. The demo gate was PARTIAL for that rehearsal scope, not because of an unresolved AA-01 or data-integrity defect. No claim is made that populated Canon semantic retrieval has been live-accepted.

## 7. Final promotion decision

**PR81_READY_TO_MERGE** at `94099089d2a5ee2a89a95ccd028b1134c2326b32` into `integration/p1-demo-20261109`.

The final tree contains #83/#84, exact-HEAD CI is green, no unresolved blocker/major was found, migration/security gates pass within the evidence described, and limitations are explicit. No additional source commit, architecture work or provider call is required to make this integration decision.

**Real Google/Gemini calls in this review: 0.** Slot 4 unused; forwarding not enabled; QA databases/ledgers/secrets unchanged. No merge, deployment, force-push or new feature work performed. The documentation-only branch/report is handed to GPT-6 for independent final review; merge remains a separate authorized decision.
