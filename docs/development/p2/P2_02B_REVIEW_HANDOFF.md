# P2-02B — Author Review & World Setup Materialization

Implements Issue #95 on a separate Draft PR #96, targeting `integration/p2-planning-studio`. No live LLM, deployment, merge, P2-03 or P2-04 work. Historical P2-02A contracts/evidence are unchanged. **Verdict: READY_FOR_REVIEW for P2-02B, at the independent review gate.**

## Source and authority

- Verified base / merged PR #94: `8148ca903c9636a400fff463bd9e3336a85a2de5`.
- Branch: `codex/p2-02b-setup-review-materialization` in the existing clean P2 worktree; no changes to main/P1 demo.
- Tested implementation: `b0abca026824ed4df83aba99df33c8126b8dce50`.
- Actual CI checkout: `426b23e1ee4b2603584eac3eb8801005717bf4c7`; source/checkout tree both `249152b719c51be0ea7d7b3b28b2e68dd77c7cca`.
- Delivery adds documentation, schema examples and evidence only; delivery SHA is recorded in PR metadata to avoid a self-referential SHA.
- This is author review of WORLD SETUP. Future outline remains intent, while historical Canon still requires actual prose and P1 HITL. Review completion does not grant M0, activate a Brain, or enable first-chapter writing.

Read the roadmap, P2-02A source/handoff, immutable RC1 package and draft contract, P1 group accept/reject/projection and entity checkpoint/reservation code, and WORKFLOW_CONTRACT v1.4 at `7e1e8e96`. RC1's manuscript-dependent entity-review shapes cannot be sent to P1 as synthetic occurrences; the bounded setup-only repository adapter shares the existing authoritative tables and locks without invoking the P1 event/transition writer.

## Implemented API and DTO contract

`POST /v1/story-brains/{novel_id}/setup/{snapshot_id}/review`, through Node `POST /api/v1/ai/story-brains/{novelId}/setup/{snapshotId}/review`. Both IDs are UUIDs. Existing authenticated Gateway/current novel ownership applies even to ADMIN; browser identity headers cannot override JWT identity. Python independently requires trusted service credential, configured tenant and immutable source author. This protects against untrusted browser/cross-author access, not a compromised trusted service credential.

[Strict request schema](setup-review-v1/schema.json) and [illustrative request](setup-review-v1/request.json) freeze the additive wire contract. Example IDs/hashes must be replaced by persisted readback values:

```json
{
  "idempotency_key": "owner-review-1",
  "dependency_group_id": "<persisted group UUID>",
  "setup_hash": "<immutable SHA256>",
  "expected_setup_version": 1,
  "expected_review_version": 0,
  "expected_brain_version": 1,
  "decisions": [
    {"proposal_id":"<character UUID>","decision":"accept","identity":{"kind":"new"},
     "edited_entity":{"canonical_name":"Minh","aliases":[]}},
    {"proposal_id":"<location UUID>","decision":"reject","reason":"Not this location"},
    {"proposal_id":"<rule UUID>","decision":"accept",
     "edited_rule":{"fact_key":"no_flight","fact_value":"No flight"}}
  ]
}
```

Success envelope contains `snapshot_id`, setup/review/Brain versions, `status=review_complete|reviewed_with_unresolved`, affected `canonical_artifact_ids`, decisions/audit, unresolved initial-condition IDs and `activation_available=false`. The artifact field retains the existing authority vocabulary; artifacts are setup entities/facts, never narrative events. GET setup overlays persisted statuses, reviewed payload and decision audit on the unchanged original cards, and supplies same-novel approved identity choices. It returns current Brain version, while exact review replay returns the original persisted command result.

Supported edits: entity canonical name and aliases (1–255 characters, normalized lengths also checked); world-rule key (ASCII letters/digits/underscore/hyphen, max100), nonblank string value (max10000), optional exact confirmed/accepted-group subject UUID. Entity type, reserved ID, source/provenance, fact type, priority, profiles, initial conditions and historical fields are not arbitrary writable dictionaries. Reject decisions forbid edits/identity choices. Review accepts 1–500 unique decisions; Gateway body limit remains unchanged. Reasons are optional max2000.

RC1 adaptation: preserve the existing persisted full group and opaque reservations; replace per-card/provisional-label review drafts with a single complete-group envelope and explicit `identity.kind=new|existing`. A new choice uses that card's existing server-reserved UUID, not a client label or injected UUID. Existing choice supplies `approved_entity_id`. No historical fixture or old group membership is rewritten. This also avoids creating fake revision evidence solely to reuse manuscript-only DTOs.

## Transaction, replay and identity rules

One PostgreSQL transaction acquires the existing scoped bootstrap advisory lock, Brain row, author-scoped source job, full group rows and confirmed identity rows in deterministic order. It checks latest setup version/hash, review version, Brain version, frozen proposal Brain version, exact membership/type/payload/evidence/run/snapshot, and reservation scope before materialization. All validation precedes writes; database integrity collisions roll back and return sanitized409. No provider or Mongo call occurs inside the transaction.

The entire original group must be decided, with per-proposal accept/reject. Omitted, duplicate, mixed, foreign, malformed and stale input cannot partially commit. A successful command adds proposal decisions, materializes accepted supported entities/rules, updates proposal statuses and source review metadata, and increments Brain/review versions exactly once. Raw proposal payload/evidence, original setup/model output, hashes and card reservations remain unchanged. Every decision stores actor, tenant/novel, reason, source refs/hash/version/origin, timestamp, edited payload, explicit identity choice and affected IDs in the existing proposal-decision store; the source result retains the replay response. No new persistence system or migration.

The operation key is scoped to the snapshot. A normalized identical body with the same key (decision set sorted by UUID, DTO defaults normalized) returns the stored result before stale-version checks, including after later source/Brain changes. Changed body/key after a decided group gives409. Concurrent different requests have one winner; concurrent exact-key retries return one durable result without duplicate decisions/artifacts.

Names never resolve identity. Distinct Minh cards retain separate reserved UUIDs; an existing ID must be confirmed in the same tenant/novel and have the equivalent P1 type. Existing P1 `TYPE_MAP` supports PER/LOC alongside character/location; selecting an old ID never retypes/renames it, changes its aliases/provenance, or bypasses author locks. Two accepted cards cannot reuse one target in the same group. Name edits retain the original reservation. All existing rule-key/subject collisions fail closed, including locked records; no implicit overwrite/retire/state projection occurs.

New entity `source_type` is author_setup or model_suggestion, with setup provenance and `mentions=0`; aliases share that origin. Rules use existing confirmed `facts`, `fact_type=world_rule`, correct source type, chapter/revision null. Rule subject references do not create a state transition. Facts retain exact source refs via the immutable proposal/decision linkage and affected fact ID. Existing identities retain their original provenance; the new reference decision has its own setup provenance.

## UX and explicit boundaries

Mounted server-backed controls live in existing SetupFoundationPanel: explicit per-card accept/reject, name/rule-text edits, new-versus-confirmed identity selection with exact IDs, complete-group save, persisted accepted/rejected badges, source origin/ref badges, reload and visible409/reconcile. The UI exposes a subset of API edits (name/rule text, preserving original aliases/key); advanced alias/key/subject edits remain API-only. It does not claim the full Planning Studio. Account/novel/snapshot state is keyed; late responses are ignored after scope changes. Original source and future outline remain separate from reviewed values.

Initial-condition cards remain pending/unresolved with their original source. An initial-condition-only or empty source cannot submit an empty review or imply consent. All-rejected groups can have completed decisions but no materialized World Setup. The setup-v1 activation guard is unchanged in service/repository for empty, rejected, mixed and fully accepted cases. Job stage records review completion; Brain remains pre-M0/importing. A new source is required if the original proposal Brain version has become stale; the service does not silently rebase old proposals.

Private notes/constraints are absent from review/readback/public jobs/model inputs and validation errors. Invalid review bodies use generic422 without rejected input. Setup/job responses are no-store. Existing P2-02A status/SSE/resume/legacy queue fences remain; legacy single/group accept/reject cannot materialize setup. Operational log scans inspect actual fake-runtime logs for synthetic private markers; this bounds the privacy claim to tested paths.

## Files and migrations

Python DTO/auth/routes/service, existing PostgreSQL repository plus setup-only transaction helper; new real-PG review acceptance module; owner-scoped Gateway controller/route and live acceptance; typed frontend client, mounted review panel, Chromium test/screenshot and expanded feature workflow. No migrations, quota changes, production configuration, second Writer/Brain/Canon/Plan store, or P1 demo edits.

## Evidence and test matrix

Final source CI/readbacks and exact commands: see [evidence index](p2-02b-evidence/README.md), `ci-jobs.json`, `verified-summary.json` and artifact verifier in that directory. Separate overlapping suites are reported separately, never summed. Browser HTTP is mocked; real Gateway→Python→PostgreSQL and MongoDB/P1 save are a separate runtime path.

Local affected Python regression: 52 PASS, exit0, fake/none providers. Backend and web typechecks exit0; mounted Edge browser 4 PASS exit0. Initial sandbox browser launch could not open its profile (environment-only); the host run succeeded. Local Docker daemon was unavailable (named pipe missing): local database acceptance NOT_RUN_ENVIRONMENT, replaced by actual disposable-service CI evidence, not by mocks.

Initial CI at cf1941ae: 47 PASS/3 FAIL in SQL selection, caused by new raw-SQL fixture inserts omitting required ORM-default columns is_locked/priority. Corrected fixtures preserve assertions; no schema/business guard was weakened. Privacy runtime scan correctly failed because service logs did not yet exist, not a privacy PASS. Source be249838 later passed SQL/Gateway but its browser fixture locator matched both Mantine input/listbox; narrowed to the textbox, with unchanged product assertions. Initial failure archive is preserved; intermediate successes are not pooled into final counts.

## Final exact-source acceptance results

All results in this table belong to implementation b0abca02; suites overlap and are not added together.

| Acceptance | Actual result | Evidence |
|---|---|---|
| P7 | PASS 3/3 jobs | [run42452436264](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42452436264) |
| P8 including rollback, PostgreSQL, P1 persistence and frontend | PASS 7/7 jobs | [run42452436384](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42452436384) |
| Setup feature workflow | PASS 1/1 job | [run42452436111](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42452436111) |
| Focused setup/P1 manuscript regressions | PASS46 | focused.xml/log |
| Selected real SQL A16/setup/author/review | PASS59, zero SKIP; 28 review cases | a16.xml/log |
| Full real PostgreSQL | PASS257 / SKIP8 / deselected447 | P8 postgres-integration log |
| Full non-PostgreSQL | PASS415 / SKIP32 / deselected265; 6 subtests separately | P8 unit log |
| P1 backend guard/accept/persistence/lifecycle | PASS11 /15 /5 /25 respectively, zero failures | P8 backend-integration log |
| Gateway forwarding | PASS19 | gateway-forwarding.log |
| Real Gateway/Python/PG/Mongo P1 changed save | PASS1 | gateway-a16.log + raw readbacks |
| Real Gateway setup review | PASS1 with 46 HTTP outcomes | setup-gateway.log/readbacks |
| Chromium mounted review/account switching | PASS4, HTTP mocked | setup-browser.log + review-ui.png |
| Artifact verifier | PASS, exit0 | verify_artifacts.py + verified-summary.json |

Disposable services: PostgreSQL16.15, pgvector0.8.7, MongoDB7.0.45, database p2a. Existing migration head0016_entity_profile_audit_timestamp. No new migration. P8 service clients/server are matched PG16; intentional PG17 restore mismatch has exit1, matched backup/restore/parity exit0. Exact image identities are retained in service-images.txt.

The independent verifier reconstructs 53 review durable readbacks, checks 21 exact mutation-negative before/after pairs, source/card/model immutability, accepted-versus-rejected decisions, 2 distinct Minh IDs, explicit approved/P1 PER reuse, character/location/model provenance, subject rules, exactly-once concurrent/replayed decisions, zero history/current-state rows, unresolved conditions and all-rejected artifacts. It also verifies 12 earlier setup negative pairs and 45 existing author-scope negative requests, rather than replacing them. Hashes/counts are in review-readback-hashes.json; raw synthetic rows remain in the source-pinned archive.

Gateway negative before/after hash: `99ca7540086fd8148ca54166b25ab3e767881bac21d46bce1400db8fe926ccd4`. Reviewed and exact-replay hash: `44c07005c6f070fe0aac20ea57a4c6792fc6ae594827d9d492bb3c0902b9e7cc`. Reviewed Gateway rows contain 1 accepted entity and1 world rule; events/transitions/revisions/outbox/Mongo chapter rows stay0. P1's separately changed chapter preserves its original immutable revision, creates AUTHOR_MANUAL hash `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1`, links a completed incremental-analysis outbox, persists Mongo version2 and leaves approved Brain/Canon unchanged.

Both operational logs were present and scanned; private fixture markers/field names were absent. Provider configuration in the artifact is fake/fake. Six existing authorization provider tripwire markers are zero; review negative tests also assert the fake provider count remains0. Source fixtures/logged SQL readbacks contain synthetic PrivateOnly/ConstraintOnly values to prove storage immutability; no real author data was used or published.

Rollback readbacks independently prove all23 table schemas/data match restored source and original source is unchanged. Backup SHA256 `a3d7c0fd69ee4ff2dfdd35b836139447f1804285ef99347e3e31899184bca659` is verified against the retained dump bytes.

[Chromium review screenshot](p2-02b-evidence/review-ui.png) uses only synthetic fixture content. Not browser-to-database E2E. No environmental blocker remains for CI-backed review; local database execution stays NOT_RUN_ENVIRONMENT because Docker Desktop daemon was absent. Unresolved product capabilities (initial-condition mapping, activation/M0, full Studio/advanced edit UX) remain explicitly unsupported.

## Stop gate

Stop for GPT-6 independent review of PR #96. No self-merge or P2-03/P2-04 work. Remaining product work is later M0/first-chapter activation and broader Planning Studio; both remain blocked by their own contracts and review gates.
