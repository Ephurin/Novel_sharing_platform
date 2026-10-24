# PR #63 experimental integration promotion

Verdict: **PR63_MERGED_POST_MERGE_CI_GREEN_E2E_HANDOFF_READY**.

This means MERGED_AND_POST_MERGE_CI_VERIFIED and a technical E2E handoff is ready. It does **not** mean mounted Author IDE S09–S11 passed. The read-only UI audit identifies essential FE/API compatibility blockers below.

| Item | Exact value |
| --- | --- |
| Reviewed source | fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9 |
| Reviewed evidence/PR head | 8b6bd15846cc2fea3cf67459ce94028d5ed49403 |
| Target before merge | 7fd6f71b388320e00408b7ea47c0998708c70a2c |
| Merge commit | **dd2f8003b0ad94e6097819cdca0249aa591f54fa** |
| Resulting tree | **5a60db0f8e5591594902ab0bdd9d3832b663f453** |
| Merge method | Normal merge, expected_head_sha=8b6bd158…; parents exactly target-before + reviewed-head |
| Accepted source tree | 2f755420aaf79da5745c11bebb35179099f27215; later differences are exclusively the reviewed evidence directory |

[Independent acceptance](https://github.com/Ephurin/Novel_sharing_platform/pull/63#issuecomment-6377292480) was read in full. Remote branch/PR leases matched before ready transition and immediately before merge. PR #63 was marked ready and merged through the normal GitHub API with expected-head lease. No bypass, force update or squash was used. No unresolved inline threads or submitted change-request reviews existed. Ten current-head check runs were SUCCESS; all 20 jobs across the four specified source/evidence runs were independently checked. Legacy commit-status API had zero contexts (its empty aggregate says pending, not a failing check). Branch API reported protected=false and rulesets empty; administration-only protection detail returned 403, and no protection setting was changed.

The complete merged tree equals reviewed evidence HEAD. Ten critical production file blobs equal exact tested source: chapter revision CAS/provenance, owner-only Canon, extraction-only outbox, approved memory/audits/guidance, review/freeze/refresh/continue/dedup, provisional identities, exact-ID consumers, relationships, transactional tenant persistence and default-OFF settings. No dependency or migration source changed. The integrated Core base and accepted source are ancestors. `integrity.json`, `integrity-commands.json` and `verify_integrity.py` provide reproducible read-only checks.

## Post-merge CI

| Workflow | Run on head dd2f800… | Jobs |
| --- | --- | --- |
| P7 Semantic Memory Foundation | [40043929597](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40043929597), SUCCESS | unit, pgvector-integration, root-compose-smoke: **3/3 SUCCESS** |
| P8 Cutover and Migration | [40043929636](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40043929636), SUCCESS | unit, postgres-integration, frontend-api-cutover, backend-integration, final-cleanup-gate, rollback-rehearsal, root-compose-cutover-smoke: **7/7 SUCCESS** |

These are new runs, not reused source/evidence-head results. P7/P8 do not subscribe to integration pushes. However PR #57's head is integration/p1-author, so the merge automatically caused its pull_request synchronize runs. Both run records pin head_sha=dd2f800…. Actions checkout used synthetic PR #57 merge ref **82beb667f743c7f10ab9eb13fdea991fd7df3e63**, verified in both P7/P8 checkout logs. Its Git tree is **identical** to dd2f800… and reviewed evidence HEAD, so no additional FE/source code entered these tests. The other PR parent feat/author-workspace at 3100c46f… is already an ancestor. `postmerge-ci.json` records this distinction, all job IDs/conclusions and checkout excerpts. No CI repair or workflow change was needed.

PR #57 remains **Draft/open/unmerged**. Its integration head advancing automatically is not its promotion. feat/author-workspace and main were not modified. No deployment, provider call, local Docker/browser run or P3 work was performed in this promotion task.

## Functional readiness and next owners

See [READINESS.md](READINESS.md) for route/component/API status and exact source references. Main blockers are missing scoped provisional groups, ambiguous name-based canonical selection, missing refresh/partial-review wiring, review DTO defaults/registry mismatch, missing exact-ID lock UI, and incompatible correction/edit payloads. These are static source findings to reproduce in a mounted browser, not observed production incidents. No accepted backend hardening was silently changed.

FE owner owns interaction/DTO wiring and clear identity labels; Core/API owner must agree on correction/edited-group contracts where required. `dto-readonly-probe.json` corroborates the absent top-level transitions field and ignored edited_payloads through a pure schema probe, without HTTP/database execution. Six PowerShell command blocks in the prompt passed syntax parsing; they were not executed. Gemini owns the separate local execution task and must record BLOCKED/FAIL for missing controls rather than replace them with API calls or mocks. [GEMINI_PROMPT.md](GEMINI_PROMPT.md) is one ready-to-paste prompt with exact merge checkout, isolated startup, readbacks and the ten-case acceptance matrix. Full browser acceptance remains **NOT_TESTED / blocked by the listed source gaps** until execution and repairs.

This handoff is published on a separate documentation branch; it is not another integration source promotion. Only PR #63 was merged. Stop here for the separate FE/Gemini work.
