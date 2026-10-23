# Controlled RED / partial GREEN

Original integration production `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`; test-only RED SHA `f8be0b3050f1020aba04671a78fb37783af14c8d` has no production delta. Final clean source `990107caa9a915f7ba590d37dce912e7cccf1b09`. All results newly executed; no historical pipeline PASS counted.

Native provenance RED: 5 PASS / 2 FAIL / 0 SKIP (exit1). Probe5 changed accepted provenance without a CAS increment (2 instead of3). Probe7 equal prose with older incoming timestamp bypassed protection and changed lastAcceptedRevisionId/At on a newer draft. After repair: 7 PASS / 0 FAIL / 0 SKIP (exit0). Full before/after documents, revision IDs, timestamps and hashes: DURABLE_READBACKS.json, native logs; source manifests record exact commands.

| API case | Initial RED run | Final status |
|---|---|---|
| 01_absent_draft_version_0 | PASS | PASS |
| 02_valid_version_save | PASS | PASS |
| 03_missing_version_integration_428 | PASS | PASS |
| 04_stale_different_body_409 | PASS | PASS |
| 05_same_body_lost_response_retry | PASS | PASS |
| 06_different_body_stale_retry | PASS | PASS |
| 06b_different_metadata_stale_payload_409 | PASS | PASS |
| 06c_fresh_metadata_and_identical_semantic_replay | FAIL | PASS |
| 06d_published_pricing_only_compatibility | FAIL | PASS |
| 07_concurrent_writers_CAS | PASS | PASS |
| 08_API_consumer_inflight_A_then_B | PASS | PASS |
| 09_API_chapter_account_isolation | PASS | PASS |
| 10a_active_save_returns_authoritative_version | NOT_RUN (baseline stopped) | PASS |
| 10d_save_requires_explicit_canon_review | NOT_RUN (baseline stopped) | FAIL |
| 10b_active_replay_preserves_version | NOT_RUN (baseline stopped) | PASS |
| 10c_next_save_using_returned_version | NOT_RUN (baseline stopped) | PASS |
| 10e_accept_requires_explicit_canon_review | NOT_RUN (baseline stopped) | FAIL |
| 10_active_checkpoint_accept_outbox_StoryBrain | NOT_RUN (baseline stopped) | FAIL |
| 11_snapshot_failure_is_explicit_and_retry_recovers | NOT_RUN (baseline stopped) | PASS |

Final HTTP matrix: 16 PASS / 3 FAIL / 0 SKIP, probe exit1. Three canon-review rows deliberately remain FAIL. No fatal harness failure in final run. Earlier runs retain all real/runtime/schema errors, including missing memory404 and auto-approval failure; they are not retroactively green.

Authoritative active PATCH version 10 equals Mongo 10; replay 10→10. Next response/Mongo 11/11. Active body hash `28d6d5eec39da830bc5a80c692d48af1eafdc38963ffe6447ef44c72cd37d4ef`. Accepted hash `314cb931dd5ee62a446c320598d19bc90a5ec075961f0e9d33fdaf102feb265f`, revision `99e5de66-e170-4871-8ee4-2bc551c83a40`; actual outbox identity and approved-source/context readbacks are embedded in DURABLE_READBACKS.json. Hash consistency PASS does not turn auto-approval into manual-review PASS.

All final native suites: 31 PASS, 0 FAIL, 0 SKIP. Backend unit 65 PASS, AI 25 PASS, typecheck/build exit0. Final-source total 137 PASS / 3 FAIL / 0 SKIP; 6 out-of-scope groups NOT_RUN. Known diagnostic endpoint/key failures are separately disclosed, not counted as successful assertions. Exact argv/CWD/exits: HANDOFF-targeted-commands.json, persistence-runtime-9fac973ed5cb.json, HANDOFF-commands.json. Orchestrator process exit0 is not the probe exit; the recorded probe exit1 is authoritative.
