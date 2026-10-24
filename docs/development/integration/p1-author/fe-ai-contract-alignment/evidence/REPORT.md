# P1 Author IDE / AI-service contract integration evidence

Verdict: **P1_FE_AI_CONTRACT_READY_FOR_GPT6_REVIEW** within the backend/API scope.
Draft PR: https://github.com/Ephurin/Novel_sharing_platform/pull/64
No merge, deployment, FE implementation or mounted Author IDE E2E claim.

## Source lineage and publication

- Integration base, re-fetched unchanged: dd2f8003b0ad94e6097819cdca0249aa591f54fa.
- Contract published first: 4654c8cf1c5803d65d2f6fc25f63a0ed245ed500.
- B5 API/validation: 92dbcaa2; DTO/correction/relationship boundary: 2d15d82e.
- Initial tests/handoff: 6a723bfc; frozen-inventory repair: 9fc23b1f.
- Exact final clean source: **4811963d235dd9f79b2efa387152e008f9519e47**.
- Source Git tree: **a72f876e9ce3f35236d71e06339cfa8d19cce3c0**.
- CI PR merge checkout: ef555abb6ccffba90c7d9dc5403998b460f451d9, identical full Git tree.
- Evidence SHA is the commit containing this directory; its exact SHA is published in PR #64
  and the delivery response (a commit cannot embed its own hash).

Only codex/p1-fe-ai-contract-alignment was written. Historical evidence, web production source,
main, integration/p1-author and feat/author-workspace were not modified. PR #57 remains unmerged.
No dependency or migration changes; the existing relationship metadata stores the authoritative
subject/target pair. Feature flag remains OFF by default; no writer/outbox/P3 authority changes.

## Root causes and fixes

**B5:** ProposalGroupAcceptRequest previously ignored undeclared edited_payloads, and the service
never passed them to the repository. The transaction already supported an edit mapping.
The API now declares the mapping, rejects unknown fields and forwards complete replacements.
Service/repository validate edited keys, complete group membership, immutable provenance/reserved
IDs, exact scoped references and payload semantics. The PostgreSQL transaction repeats validation
under the Brain lock before materialization. Narrative labels can change while frozen IDs remain.
Legacy alias/fact name resolution now uses local materialization variables so it does not rewrite
the author's persisted payload. Unedited payloads remain intact.

A final negative test found that same-novel approved IDs outside the frozen inventory could be
selected in an edit. RED on 6a723bfc demonstrated it; 9fc23b1f restricts changed analysis references
to the persisted reviewed inventory. Existing author corrections without that extraction checkpoint
retain scoped approved-ID validation. No machine guess grants a new identity.

**B1:** Raw checkpoint dictionaries omitted initial fields assumed by the UI. An additive response
projection now supplies review_schema_version=1, reviewed_decisions, pending_candidate_ids,
normalized approved known_entities and registry_brain_version. Registry version/entities are read
under the same shared Brain lock. Reads do not mutate durable checkpoints or CAS input. Existing
negative tests now independently assert unchanged raw storage AND unchanged HTTP DTO.

**B4:** Approved memory computed active transitions but omitted them from serialization. It now
returns that persisted filtered list, tied to approved active event/fact IDs. No current-state
history is invented. Correction validates identities, original source chapter and transition
participants before saving proposals; extra provenance fields, stale versions, ambiguous names
and superseded/retired events fail. Approval remains a separate authorized Canon operation.

**B6:** The trusted legacy override lacked a public author/CAS boundary. A narrow Gateway route
now checks active author/ownership and forwards to the trusted tenant/author-scoped Python route.
The existing repository locks the Brain, validates approved exact IDs, preserves relationship
metadata/provenance and atomically increments Brain version. Legacy name-only ambiguity fails
closed. The trusted legacy endpoint is not exposed directly. No parallel relationship model.

**B2/B3:** Existing review, provisional groups, refresh carry-forward, freeze and continue are
specified and tested, not reimplemented. See ../HANDOFF.md and ../contracts.ts for methods,
request/response types, executable decision constructors, lifecycle and 401/403/404/409/422 handling.
Actual response JSON is retained in http-requests.json, including initial/frozen/refreshed audits.

## RED provenance

red-repro.log reruns the original focused tests on an immutable Git export of specification
commit 4654c8cf (production source identical to integration base): **8 FAIL, 1 PASS**, exit 1.
It proves ignored edits and invalid edits accepted, plus missing review DTO fields. The passing
negative is the already-working stale-version guard. RED-test_p1_contract_alignment.py is the
exact test overlay; red-repro-seal.json records its hash, archive hash, commands and source hashes.
Git archive on Windows exports CRLF; the seal separately records canonical Git-blob hashes and
asserts differences are line endings only. Initial live RED is retained in test-red-contract.log.

test-red-inventoryguard.log: **1 FAIL**, exit 1, source 6a723bfc plus only the new regression
test in red-inventory-test.patch. The edit incorrectly returned 200; readbacks retain its durable
effects. The patch hash and base SHA are in source-integrity.json. Final GREEN rejects it with 422
and identical full before/after state. The earlier route-absence RED in test-red-lockboundary.log
is supplemental: it ran on an intermediate working tree and is not presented as a clean SHA seal.
Historical committed evidence was not rewritten. Development failures led to preserving the
accepted entity rename/reserved-ID behavior and testing both raw checkpoint and wire projection.

## Exact-source GREEN

All acceptance suites sealed clean HEAD 4811963d immediately before execution. Fresh task-owned
PostgreSQL/pgvector 16 and MongoDB 7 were provisioned for the final source; all data is isolated
from previous task volumes. Only fake text/embedding providers, cleared real keys and loopback
service URLs were used. Commands, UTC timestamps and individual exits are in commands.json and
per-suite command/source JSON; SQL and Alembic migrations both exited 0.

| Suite | Actual result |
|---|---|
| New PostgreSQL contract cases | 22 PASS |
| Full PostgreSQL HITL / H-01–H-05 / contracts | 96 PASS (includes those 22) |
| Other PostgreSQL regressions | 31 PASS |
| AI non-PostgreSQL unit | 339 PASS, 10 SKIP |
| Focused Gateway / ownership / CAS / Canon backend | 74 PASS |
| Actual Node Gateway → Python → PostgreSQL/Mongo HTTP | 1 PASS; 62 HTTP requests |
| Backend TypeScript, contract TypeScript, Python compile validation | exit 0 |

**541 distinct local passing test cases.** The 22 focused PostgreSQL cases repeat inside the
96-case suite and are not counted twice. Repeated candidates, HTTP request counts and CI reruns
are not added. Unit skips are reported rather than counted as passes; PostgreSQL-specific cases
run separately. The HTTP statuses include 401/403/404/409/422 negatives with durable readbacks.

Coverage includes exact summary/fact edits, mixed unchanged items, invalid IDs/evidence/source,
complete group selection, late materialization rollback, stale/retry/concurrent acceptance,
approved same-novel IDs outside review inventory, real foreign-novel identity rejection, DTO
reload/partial/refresh/freeze/completion, correction history, supersession, public exact-pair
locks, ambiguous legacy locks and rebuild/reload. Critical negatives compare persistent Canon,
Brain, proposals, decisions and related state; HTTP readbacks also compare immutable revisions
and Mongo content. contract-postgres-readbacks.json contains 51 complete diagnostic snapshots;
raw suite logs retain all output. http-durable-readbacks.json links the 62 recorded requests to
their PostgreSQL/Mongo snapshots. A scripted author fixture is not a mounted human browser test.

The real HTTP flow starts from empty Canon, separates two new Minh identities through explicit
human groups, refreshes guidance, freezes and continues with exact IDs, accepts edited Canon,
locks one identity through the public owner route, analyzes a subsequent immutable revision,
accepts the other identity's independent relationship, and separately approves an event correction.
Brain versions advance only for authorized Canon actions: 1 → 2 (edited group) → 3 (author lock)
→ 4 (next extraction group) → 5 (correction group). Pending corrections do not appear in memory.

## Exact-source GitHub Actions

- P7: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40048229694 — **3/3 jobs SUCCESS**.
- P8: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40048229705 — **7/7 jobs SUCCESS**.

ci-source.json contains full run metadata, individual job/step conclusions and checkout-tree
verification. P7 explicitly includes the new PostgreSQL contract suite; P8 runs the whole PostgreSQL
suite. Frontend API cutover, backend integration, migration/rollback and cleanup gates all succeed.
The PR synthetic merge checkout has the exact tested source tree; it is not a production merge.

## Remaining owner gates and limits

| Finding | API status | Remaining action |
|---|---|---|
| B1 | BACKEND_READY | FE consumes versioned defaults and UUID registry |
| B2 | FE_ACTION_REQUIRED | Explicit canonical selector and human provisional grouping controls |
| B3 | FE_ACTION_REQUIRED | Partial save, actual refresh endpoint, conflict/reload UX |
| B4 | BACKEND_READY | FE displays approved transition/provenance and separate correction approval |
| B5 | BACKEND_READY | FE sends complete edited payloads and retains unsaved edits on conflict |
| B6 | BACKEND_READY | FE exact-ID lock/correction controls and version refresh |

No FE interaction is marked ACCEPTED on behalf of its developer or independent reviewer.
Mounted S09–S11, screenshots/HAR/Playwright and visual behavior remain NOT_RUN here and belong
to Gemini after FE integrates the missing controls. Live providers, production data, deployment,
load/performance behavior and P3 work are outside this gate. No unsupported interaction is hidden
behind a mock UI. Unsupported payload/provenance edits fail explicitly instead of being ignored.

## Resource ownership and reproduction

resource-cleanup.json records six containers created across development and final validation,
their task labels and preserved mounts. Only those containers were stopped. Every Docker volume
present before cleanup is still present afterward; no old container/volume was deleted or pruned.
The final resources.json identifies the fresh final database and loopback ports (containers stopped).

contract_delivery_runner.py records the exact environment and commands: provision; migrate;
test-accept-unit; test-accept-contract; test-accept-hitl; test-accept-postgres;
test-accept-backend; test-accept-live; test-accept-python; test-accept-typescript.
For reproduction copy it to a new scratch folder and set ROOT to a clean checkout of the source
SHA; never point OUT at historical committed evidence. Run provision/migrate first to allocate
new owned resources. The wrapper clears real provider keys and uses fake providers. Detailed
subcommands/exits remain in commands.json. No production migration/deployment is authorized.

Stop for independent GPT-6 delta review. Do not merge this Draft PR or grant production readiness.
