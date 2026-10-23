# Controlled RED / bounded GREEN

RED SHA `82579b54b12902589a9690bb686ce55a6eccf72c`: production unchanged; tracked source clean at probe start. Probe exit1: 3 PASS / 4 FAIL / 2 BLOCKED.
Final SHA `d55e9a0332df3511b088b3518b40330f7f3ce441`: tracked source clean at probe start; probe exit0: 14 PASS / 0 FAIL / 0 SKIP / 2 BLOCKED.

| Case | RED | Final | Proof |
|---|---|---|---|
| 01_save_revision_outbox_hash | PASS | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 02_save_pending_proposals | FAIL | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 03_save_canon_unchanged | FAIL | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 07_duplicate_outbox_no_proposals_or_approval | PASS | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 09_wrong_owner_denied | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 10_stale_brain_version_conflict | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 04_author_accept_exactly_once | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 02b_accept_pending_proposals | FAIL | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 03b_accept_canon_unchanged | FAIL | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 13_accepted_generation_replay | PASS | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 05_reject_no_canon | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 06_edit_accept_reviewed_content | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 08_interrupted_extraction_retry_review_preserved | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 14_internal_authorization_real_http | NOT_RUN | PASS | REAL_HTTP_PG_MONGO_FAKE_PROVIDER |
| 11_P3_HITL_waiting_for_entity_review | BLOCKED | BLOCKED | SOURCE_AND_HTTP_ROUTE_AUDIT |
| 12_controller_continue_after_human_checkpoint | BLOCKED | BLOCKED | SOURCE_AND_HTTP_ROUTE_AUDIT |

Baseline Save brain 2→3 and Accept Draft 3→4 without author action; durable proposals accepted with decision_reason incremental_outbox_auto_materialize. AI access logs show actual POST accept paths. Baseline approval before activation is a separate explicitly scripted author action; never counted as worker approval.
Final Save brain 2→2 and Accept Draft 3→3, all associated proposals pending; canon entities/events/facts identical until explicit authorized decisions. Immutable IDs/hashes/outbox identities and Mongo version transitions are preserved in CANON_PROVENANCE_READBACKS.json.

Every HTTP case uses the same exact SHA/cleanliness above and the probe argv/exit in green-02-commands.json; each request/status/body is in green-02-runtime/http-trace.jsonl. Case-level durable before/after JSON files provide PG/Mongo assertions. No historical PASS is counted.

Final aggregate: 180 PASS / 0 FAIL / 0 SKIP; 2 BLOCKED, 6 explicitly NOT_RUN groups. Node 81, Python 61, native DB 24, durable HTTP cases 14. Typecheck/build/migrations exits0 are checks, not extra PASS tests. Existing baseline suites are not full P3/HITL or combined PR59 acceptance.
