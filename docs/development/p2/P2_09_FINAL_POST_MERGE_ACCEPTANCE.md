# P2-09 Final Post-Merge Acceptance

**Decision: `P2_FINAL_ACCEPTANCE_PARTIAL`.** The functional milestones passed. Dependency security disposition is pending before release.

## Source manifest

- Repository `Ephurin/Novel_sharing_platform`, branch `integration/p2-planning-studio`.
- Tested merge `00925084a9f48379d39db5d0a7c5fa3d494f3096`, tree `cb8c5b27529b0e912da14c29c80c50c59707d185`.
- Parents `7a01fa8650b14e889f3a631bee19b66940711b6b` and `333c1e0579ac5b17406d9dd5a080059ea3268f89`. PR #130 merge includes the earlier #128 and #129 acceptance work. Git diff against the second parent is empty.
- Clean isolated worktree. Backend and web installed with `npm ci`. Git blobs for backend lockfile, web lockfile and AI requirements are `9073e09f4089c0ff7d6254e15edc75a42fd082b1`, `a1ff1c21791df271f6b5f6ed03e7124cf7248893` and `5846445ed481b29c20b73f80312c05c9d038ba26`.
- Evidence PR CI definition commit `fa3a5eadb1bed92b0417210d848129cdb99fc394`. The report commit is the next commit on [Draft PR #131](https://github.com/Ephurin/Novel_sharing_platform/pull/131). The three workflow changes pinned checkout to the merge only for the evidence branch.

### Tested source vs report head

| Item | SHA | Role |
|---|---|---|
| Tested product source | `00925084a9f48379d39db5d0a7c5fa3d494f3096` | Immutable integration merge. All acceptance and regression evidence below was produced from this tree. |
| Temporary CI pin | `fa3a5eadb1bed92b0417210d848129cdb99fc394` | PR head that triggered the pinned runs. Every job log (P2 2 jobs, P7 3 jobs, P8 7 jobs) shows `HEAD is now at 0092508`. |
| Report PR head | the latest commit of PR #131 | Documentation only. It is **not** itself tested as product source. |

The temporary workflow pins were removed after capturing evidence. The final PR diff against `integration/p2-planning-studio` contains only this report. Because P2/P7/P8 workflows use path filters (`ai-service/**`, `backend/**`, `web/**`, scripts, compose and the workflow files), a documentation-only diff does not trigger product CI. That is expected: the exact-source evidence above stays valid for the immutable merge `00925084` and must not be read as a test of the report commit.

## Integrated scenarios

`python scripts/p2_07a_acceptance.py --suite p2-08b --output <fresh-directory>` exited 0 locally and in pinned CI. Each row ran one Node test with zero skips, failures or cancellations. Evidence paths are relative to the [integrated artifact](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43398289676/artifacts/14024790403).

| Scenario | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| S1 | No-plan Setup to first chapter and P1 | M0 has zero revisions/events, explicit approval yields one event | PASS | S1/ |
| S2 | Future Plan persists through M0 and P1 | Active plan and future event survive; authored Canon stays separate | PASS | S2/ |
| S3-5 | Durable ordered objectives | Five survive reload, M0 and first chapter | PASS | S3-5/ |
| S3-10 | Durable ordered objectives | Ten survive the same checkpoints | PASS | S3-10/ |
| S3-21 | Durable ordered objectives | All 21 survive the same checkpoints | PASS | S3-21/ |
| S4 | Reviewed homonyms and provenance | Distinct IDs; chapter 1 approval has three verified mentions, recurring identity verified in chapter 2 | PASS | S4/ |
| S5 | Chapter 8 contradicts future betrayal | Eight immutable revisions and four approved events. Chapter 4 rejection and future betrayal stay out of history | PASS | S5/ |
| S6 | Plan/Canon CAS and stale response isolation | One winner on each contested write, stale 409, delayed responses preserve current draft | PASS | S6/ |
| S7 | Owner scope, privacy, provider errors and mounted draft lifecycle | Denials and replays preserve state. Preview/accept/dismiss/reload leave two revisions and one explicitly approved historical event | PASS | S7/ |

Each directory contains browser steps, HTTP summaries, PostgreSQL/MongoDB readbacks, trace and screenshot manifest. The gate receipt records backend, AI, PostgreSQL and Mongo image IDs, web asset digests, commands and exit counts. Local cleanup reported no remaining owned containers.

## Functional readiness

| Gate | Verdict | Evidence |
|---|---|---|
| P2_M0_READY | READY | S1/S2 plus Setup regressions. Plan optional, explicit activation, no synthetic revision, scoped replay. |
| P2_M_FIRST_READY | READY | S1/S4/S7 plus P1 Writer and Accept Draft regressions. Immutable source hashes, Mongo CAS, outbox, HITL and explicit approval. |
| P2_PLANNING_STUDIO_READY | READY | S2–S7 plus plan lifecycle regressions. Durable plans, nonhistorical authority, identity separation, CAS and workspace isolation. |

## Regression runs

| Suite | Commands and evidence | Result |
|---|---|---|
| P1/P2 | P2 workflow runs the nine-process runner, mounted `node --test tests/author-ide.browser.test.mjs tests/draft-persistence.browser.test.mjs`, Setup/Plan/Brainstorm pytest and the PostgreSQL identity suite. JUnit and logs record counts and results. [Run](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43398289676) · [Regression artifact](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43398289676/artifacts/14024441104) | PASS |
| P7 | Semantic memory unit and pgvector pytest plus Compose smoke. [Pinned run and commands](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43398289889) | PASS, 3 jobs |
| P8 | Backend and Python regressions, `npx tsx --test src/modules/novels/accept-draft-contract.test.ts`, migration, rollback and cleanup gates. [Pinned run and commands](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43398289978) | PASS, 7 jobs |

## Security and residual risks

The integrated runtime uses built-in FakeLLM, disabled fallback and internal AI networks. Its fake-upstream counter reports zero requests. Embeddings are disabled in the browser stack; PostgreSQL embedding regressions run separately in P7. The P2 recorder tests verify protected-field exclusion at dispatch and inclusion of approved setup context and FUTURE_PLAN authority. S7 covers owner denials, scoped replay and explicit Canon approval. Evidence is generated from synthetic fixtures with sanitized HTTP and trace output.

- Release blocker for this recommendation: `npm audit --omit=dev --json` reports one critical backend dependency advisory, two high and one moderate; web reports four high. The critical advisory is [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) for proxy-addr. A source search found no explicit Express trust-proxy setting under backend/src. Production reachability is unverified. Assess applicability and update the lockfile where required, then rerun from the corrective merge.
- Non-blocking scope limitation: integrated browser scenarios use authenticated Gateway calls for some setup and HITL actions. Mounted P1 AI draft preview/accept/dismiss is exercised in S7.
- Environmental limitation: no live-provider or production-topology validation was performed.
- Future enhancement outside P2: none required by functional acceptance.

Functional acceptance is green at the merge. Dependency security disposition remains open. Keep this PR Draft for independent review.

## Functional acceptance vs production readiness

- **Functional acceptance (this report):** the three P2 milestones are READY at `00925084` with fake providers and isolated local/CI topology.
- **Release disposition:** `P2_FINAL_ACCEPTANCE_PARTIAL`. Production readiness is **not** claimed. Open items: dependency security (tracked separately as SEC-01, not in this PR), no live-provider validation, no production-topology validation.
- Independent review comments on this PR, including follow-up issues #132–#138 from a separate P2-07 browser run, are not resolved by this report.

Report status: `READY_FOR_INDEPENDENT_REVIEW`. Draft; do not merge without owner decision.
