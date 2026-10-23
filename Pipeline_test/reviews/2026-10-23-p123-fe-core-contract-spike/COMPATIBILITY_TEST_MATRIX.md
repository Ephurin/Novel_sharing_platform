# Compatibility test matrix

Tested source `a2ec488035728e4135d65e664838044f0ec41646`; backend/AI/web trees identical to `3cf18c93b74d62f1f2a3b13f8f034d9d107c6049`. Final driver exit **1**, deliberately preserving three genuine failures. All new rows are fresh isolated persistence/API execution, not browser or real-provider proof. Source/test paths were clean; the new evidence directory was untracked.

| Test | Result | Command / exit | Proof and durable evidence |
|---|---|---|---|
| 01_absent_draft_version_0 | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 02_valid_version_save | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 03_missing_version_legacy_Core_observation | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 04_stale_different_body_409 | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 05_same_body_lost_response_retry | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 06_different_body_stale_retry | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 06b_different_metadata_stale_payload_409 | FAIL | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 07_concurrent_writers_CAS | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 08_API_consumer_inflight_A_then_B | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 09_API_chapter_account_isolation | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. No browser claim. |
| 10a_active_save_returns_authoritative_version | FAIL | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. FAKE HTTP provider for canonical path. |
| 10b_active_replay_preserves_version | FAIL | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. FAKE HTTP provider for canonical path. |
| 10_active_checkpoint_accept_outbox_StoryBrain | PASS | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. FAKE HTTP provider for canonical path. |

The shared nonzero process exit does not convert successful row assertions into failures or failed rows into PASS. Per-row SHA, cleanliness, exact argv, process exit, proof type and inherited/new attribution are explicit in validation.json. The authoritative version counterexamples are active-save-response-versus-durable-draft.json (response 9, Mongo 10) and active-retry-readback.json (before 10, response 10, after 11).

| Additional proof/gate | Status | Provenance / limit |
|---|---|---|
| PR55_missing_version_428_valid_save_stale_409 | PASS inherited | `7b15c078c1ffe2fca96c4e66c96577e3ff007c3c`; original command exit 0; Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/pr55-api-contract/validation.json; NOT independently rerun |
| PR55_mounted_hook_Undo_inflight_switch_recovery_409 | PASS inherited | `7b15c078c1ffe2fca96c4e66c96577e3ff007c3c`; original command exit 0; Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/browser-runtime.json; NOT independently rerun |
| PR55_same_payload_and_active_Core_composite_runtime | NOT_RUN | No executed command/exit or tested SHA; No composite backend or FE integration authorized; source differs in replay and automatic snapshot |
| S09_full_AuthorWritingIde_all_required_scenarios | BLOCKED | No executed command/exit or tested SHA; Requires FE-owned editor/auth/router/cache changes and D1/D2 approval; existing hook fixture is insufficient |
| S09_active_baseline_queued_B_via_returned_version_browser | BLOCKED | No executed command/exit or tested SHA; Core response version mismatch is proven; effect on actual editor is inferred, not browser-executed |
| S10_S11 | NOT_RUN | No executed command/exit or tested SHA; Separately gated after independently accepted S09 |
| Populated_database_upgrade | NOT_RUN | No executed command/exit or tested SHA; No approved combined migration or populated target |
| REAL_PROVIDER | NOT_RUN | No executed command/exit or tested SHA; Explicitly prohibited |

S09 checklist remains unexecuted in the full editor: saved B→temporary A→Undo B, in-flight A→B, rapid chapter/account switch, navigation/recovery, concurrent-tab 409, active canonical checkpoint provenance and no cross-user/chapter writes. API analogues and the inherited mounted-hook fixture do not close those editor requirements.

Ordered lease/crash semantics and broader P123 acceptance are inherited from prior reviewed evidence and inspected unchanged source; not independently stress/crash-tested again. Three new resources are stopped with twelve volumes retained. No combined schema or populated upgrade, publishing, wallet/payment, full P123 suites or 100k run.
