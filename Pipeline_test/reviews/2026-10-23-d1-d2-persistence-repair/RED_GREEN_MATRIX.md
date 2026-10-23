# RED/GREEN persistence matrix

Initial source `1394bf66f802bc9b0c4a1bba50cdc1140940353b`; final clean tested source `dace9f9bc92f6b4209b8e6692985cfa8e3f805df`. Every row below was independently executed with real HTTP/PostgreSQL/MongoDB. Provider is fake; no browser or real-provider claim. Exact commands/exits: RED-commands.json (probe exit 1), SEALED-commands.json (probe exit 0). Full per-case provenance is in validation.json.

| Case | RED | Final GREEN |
|---|---|---|
| 01_absent_draft_version_0 | PASS | PASS |
| 02_valid_version_save | PASS | PASS |
| 03_missing_version_legacy_Core_observation | PASS | PASS |
| 04_stale_different_body_409 | PASS | PASS |
| 05_same_body_lost_response_retry | PASS | PASS |
| 06_different_body_stale_retry | PASS | PASS |
| 06b_different_metadata_stale_payload_409 | FAIL | PASS |
| 06c_fresh_metadata_and_identical_semantic_replay | NOT_RUN (new coverage) | PASS |
| 06d_published_pricing_only_compatibility | NOT_RUN (new coverage) | PASS |
| 07_concurrent_writers_CAS | PASS | PASS |
| 08_API_consumer_inflight_A_then_B | PASS | PASS |
| 09_API_chapter_account_isolation | PASS | PASS |
| 10a_active_save_returns_authoritative_version | FAIL | PASS |
| 10b_active_replay_preserves_version | FAIL | PASS |
| 10c_next_save_using_returned_version | NOT_RUN (new coverage) | PASS |
| 10_active_checkpoint_accept_outbox_StoryBrain | PASS | PASS |
| 11_snapshot_failure_is_explicit_and_retry_recovers | NOT_RUN (new coverage) | PASS |

Original rows: RED 10 PASS / 3 FAIL; GREEN 13 PASS / 0 FAIL. Four new API/persistence rows also PASS, final matrix 17 PASS / 0 FAIL / 0 SKIP. New cases were not backfilled as baseline PASS.

- 06b: RED stale pricing was accepted with HTTP200; final HTTP409 DRAFT_CONFLICT, PG and Mongo unchanged.
- 10a: RED response/durable versions 9/10; final 13/13.
- 10b: RED replay 10→11; final 13→13. Final hash before/after `28d6d5eec39da830bc5a80c692d48af1eafdc38963ffe6447ef44c72cd37d4ef`. Immutable revision and outbox identities remain unchanged.

DURABLE_TRANSITIONS.json records exact hashes, versions and PG identities. SEALED-runtime/ contains actual Mongo collection and PostgreSQL readbacks, not fake persistence assertions. next-save-returned-version.json proves the next changed-body PATCH using the earlier response version succeeds. accepted-replay-durable.json proves accepted-generation replay preserves durable identities/draft. snapshot-transaction-failure.json and snapshot-failure-recovery.json record real injected outbox INSERT failure (HTTP500, revision/outbox rollback) and successful retry; the editable draft may have already persisted before the failed snapshot transaction.

Published pricing-only uses one explicitly marked synthetic published chapter status fixture (no payments); Story Brain baseline uses supported bootstrap/review/activation APIs only. Delayed reconciliation and identical-prose/new-revision provenance are also covered by six fresh real-database tests; diagnostic logs contain before/after documents.
