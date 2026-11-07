# PR #94 owner-scope hardening — current review handoff

**Verdict: READY_FOR_OWNER_REVIEW for bounded P2-02A.** No merge, deployment, live provider call, or P2-02B implementation. The original handoff below remains historical evidence.

## Exact source and CI

- Base: `9a8032dfe17ed42cd4935c09240760c23035eeb8`; previous delivery: `264e99d2e5f6e17abe4d94553664fcfea5af2c08`.
- Branch: `codex/p2-02-setup-provenance`; tested source: `2f8ce3ac82a1c438a3d5ae402a32f394af70b8e5`.
- Actual CI checkout: `76fb22105f633dbd6ab22fa6293269ad37a5cb9c`; identical source/checkout tree: `d05da2742635df48e0842d3aaf26fa795c8aa39f`.
- Delivery adds documentation/evidence only; its SHA is recorded in PR metadata. Do not pool intermediate-source results.
- [P7: 3/3 SUCCESS](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42376170960), [P8: 7/7 SUCCESS](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42376170966), [feature: 1/1 SUCCESS](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42376170948).
- Feature focused tests: 46 PASS. Real SQL selection: 31 PASS, zero SKIP (16 existing A16, 9 setup, 6 author-scope). Full AI non-PostgreSQL: 415 PASS/32 SKIP/237 deselected. Full PostgreSQL: 229 PASS/8 SKIP/447 deselected. These are separate overlapping suites, not additive totals.
- Gateway forwarding: 19 PASS; real P1 save: 1 PASS; real setup Gateway: 1 PASS with 37 HTTP outcomes; browser: 3 PASS with mocked HTTP. P8 backend guard/accept/persistence/lifecycle suites: 11/15/5/25 PASS respectively. Typechecks/build and P7/P8 required jobs succeeded.

## Security contract and changed paths

Gateway derives identity from verified JWT and active account, overwrites browser identity headers, and requires actual current novel ownership even for ADMIN. Python setup requests independently require a configured service credential, canonical UUID tenant/author, configured tenant match and consistent actor/user headers. Setup-specific auth remains enforced when generic service auth is disabled. There is no Python/repository ADMIN override.

The immutable source creator is `bootstrap_jobs.result.author_id`. Repository queries bind source creator, tenant, novel and source/job ID. Replay and admission check author before version/input conflicts and before provider dispatch; cross-author appends to an existing source chain fail closed. Gateway supplies current novel authority; the AI database does not duplicate public users/novels. Trusted service credential holders remain trusted internal callers: this does not defend against a compromised Gateway credential. Ownership transfer grants neither party automatic source delegation: the former creator fails current ownership, the new owner fails creator scope.

Affected paths: new `api/setup_auth.py`; narrative setup/create/readback, generic job GET/SSE/resume/activation; SetupService public DTO and repository scoped reads/admission; legacy proposal/review list filtering; Gateway ownership and no-store; keyed setup/AuthorMemoryPanel state and nested account-scoped query caches; PostgreSQL/Gateway/browser regressions and feature workflow log scan. No migration or Canon materialization was added.

Readback requires the scoped source query; generic jobs expose only an allowlisted setup result. SSE authorizes before sending bytes, resume before scheduling, and activation before its existing disabled response. Unknown and unauthorized jobs return equivalent status/body for GET/SSE/resume. Setup cards are excluded from legacy generic proposal/review queues. The raw repository `get_bootstrap_job` remains a privileged worker/internal port, not a new user-facing source readback. Setup review/materialization/activation stay unavailable.

Malformed setup dictionaries, arrays and nested bodies return a generic 422 without Pydantic rejected input/context. Responses use no-store where private setup/job content could be returned. Private notes and author constraints remain persisted source fields, excluded from readback/public jobs and extraction provider input. Tests scan actual service and Gateway logs for seeded private markers; this is evidence for tested paths, not a universal proof about every possible log/input.

## Runtime evidence and limitations

Disposable PostgreSQL 16.15 and MongoDB 7.0.45, database `p2a`, fake/offline providers only. No P1 QA or shared production database. Final artifact verifier confirms 30 durable setup readbacks, 12 exact before/after negative-state hash pairs, 18 immutable snapshot metadata records, and zero setup historical events. Six real PostgreSQL author-scope cases exercise 45 negative HTTP requests across five route paths and nine identity cases; additional activation, historical source, malformed-body, and known/unknown equivalence assertions run in the same suite. Six zero-dispatch markers and armed provider tripwires validate denial before generation.

Gateway tests include same-tenant author A/B, spoofed browser identity headers, ADMIN own versus foreign novels, generic setup jobs, and a reversible disposable novel ownership transfer. Browser tests mount the real parent and nested components: account/novel changes clear source/cards/operation keys and private guidance caches; late successful POST/GET results are discarded. Reload and 409 behavior remain covered. Browser HTTP is mocked: this is not browser-to-database E2E.

P1 readbacks preserve the original immutable revision, create the changed AUTHOR_MANUAL revision with hash `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1`, link the completed outbox, persist Mongo v2 and leave approved Canon/Brain unchanged. Rollback verifies 23 tables, exact restored source parity and unchanged original source; migration `0016_entity_profile_audit_timestamp`, vector 0.8.7. PG17 mismatch is deliberately reproduced with exit 1; matched PG16 backup/restore succeeds.

Historical failures retained: source edf1397e had 13 SQL failures/17 passes because generic JSON comparator lacked `.astext`; `.as_string()` fixed the query without weakening scope or changing schema. Its privacy scan reached zero files and is NOT a privacy PASS. One local browser fixture initially returned the wrong unrelated guidance DTO; corrected fixture now tests the actual parent. Local sandbox TestClient hung during Windows asyncio socketpair initialization before route execution (NOT_RUN_ENVIRONMENT); an authorized host run passed 52 affected Python tests. No sandbox result is substituted for PostgreSQL CI acceptance.

## Reproduce and inspect

See [evidence index](p2-02a-owner-scope-evidence/README.md), [verified readbacks](p2-02a-owner-scope-evidence/verified-summary.json), [CI jobs](p2-02a-owner-scope-evidence/ci-jobs.json), and [artifact verifier](p2-02a-owner-scope-evidence/verify_artifacts.py). The workflow at tested SHA contains exact service environment, fixture lifecycle, commands and exit propagation. `python docs/development/p2/p2-02a-owner-scope-evidence/verify_artifacts.py` exits 0. Original evidence below is not rewritten.

## P2-02B checklist — only after PR #94 approval AND merge

- Design author-bound review endpoint and full setup/review/Brain optimistic concurrency inside the authoritative PostgreSQL transaction.
- Reuse P1 identity/HITL and homonym protection; preserve raw proposal versus edited/accepted audit evidence.
- Resolve pending initial conditions with explicit author authority; no accepted-but-unmaterialized status.
- Keep WORLD SETUP, FUTURE STORY PLAN and narrative history separate; no synthetic chapter revisions or historical events.
- Add real PostgreSQL negative/concurrent review tests, account-switch UI coverage and P1 regression before activation/M0 claims.

---

# Historical initial delivery (unchanged below)

# P2-02A — setup extraction, immutable provenance and readback

**Verdict: READY_FOR_REVIEW for the bounded P2-02A foundation. P2-02 as a whole is not complete.** Draft PR #94 targets integration/p2-planning-studio. Stop for independent review; no self-merge/deploy/live provider call. Owner explicitly authorized P2-02 after merging #89; the historical P2-01 Argon gate is not inferred to block this newly authorized work.

## Source provenance

| Item | Exact SHA |
|---|---|
| Fetched approved base / #89 merge | `9a8032dfe17ed42cd4935c09240760c23035eeb8` |
| Working branch | `codex/p2-02-setup-provenance` (fresh managed worktree, not P2-01 branch) |
| Tested implementation | `1780aaf2619e83a5d0896ef4daa655df65069da2` |
| Actual P7/P8/feature CI checkout | `3d8479c6d7285b7a69d5469a0fa12c4568ba1619` |
| Identical source/checkout tree | `4144e442657ebb9ac3cace827323bd5c83d864ec` |
| RC1 reference | `f2267643af6cf38224008ce7661af923b847e641` |

Normal ancestry checks exited0; #89 is confirmed closed/merged. Only `setup-v1-rc1/` and the implementation-contract draft were restored path-by-path from RC1. Their Git content remains byte-identical to that reference. #93 was not merged/cherry-picked; its temporary `.github/workflows/p2-combined-verification.yml` is absent. A new permanent feature regression workflow tests this implementation on disposable services. Final delivery adds this report/evidence only; delivery SHA and any subsequent exact-head CI are recorded in PR metadata separately.

Mandatory roadmap, RC1 shapes/fixtures, P1 identity/HITL/group authority contracts and pinned WORKFLOW_CONTRACTv1.4 at7e1e8e96 were read. Old proposed-contract wording/NOT_RUN flags remain historical; this document defines the implemented subset without rewriting evidence.

## Implemented versus explicitly deferred

| Capability | P2-02A status |
|---|---|
| Strict nested setup-v1 DTO and legacy dispatch | Implemented. Unknown fields/aliases fail422, required operation key, UUID scope, explicit mode, no prose/chapter/plan minimum. Legacy DTO/hash path is unchanged. |
| Structured characters/locations/rules | Deterministic offline source parsing. Declared cards remain pending/author_declared with exact immutable field/declaration references. |
| Free-text extraction | Dedicated grounded provider interface; exact Unicode-codepoint offsets/quotes and exact names/rules validated. Hints/outline/private fields are never evidence or outbound extract inputs. Unavailable/empty/fabricated output fails visibly; no creative fallback. |
| Creative blueprint | Separate interface; existing explicitly fake adapter supplies pending/model_proposed suggestions with retained original output and snapshot reference. No live adapter dispatch or quality claim. Author declarations retain their separate origin. |
| Immutable snapshot/version | Existing scoped bootstrap_jobs.result; exact setup/text hashes, author/tenant/novel, settings in separate fields, winning IDs and source metadata. New source creates a new job/version. Same-key replay precedes stale-version checks. |
| Concurrency/CAS | Shared bootstrap advisory→Brain lock serializes scoped version allocation and admission. Changed keyed input/mode409; stale expected version409; one version winner. Provider work occurs after reservation transaction releases its locks. Existing finalization transaction commits proposals/run/job together. |
| Homonyms | Separate opaque candidate identity reservations for two Minh declarations, stable proposal/identity UUIDs on replay, snapshot/version-bound provisional namespace. **These are not author-reviewed Canon identities.** |
| Readback | Owner-authorized Gateway GET plus trusted Python service/tenant/author boundary; latest or scoped snapshot_id, read-only (missing sources404), reload persists IDs/provenance. Private notes/constraints are omitted from this response and generic job DTOs. |
| Minimal Author IDE | Mounted in existing AuthorMemoryPanel setup tab: explicit extract/blueprint, declaration cards, rules, optional prose/outline, real submit/readback, source badges, conflict/reload and genuine unavailable states. No full Studio/chapter board. |
| Review accept/reject/edit, approved-ID selection, full review CAS/materialization | **NOT_IMPLEMENTED in P2-02A; P2-02B.** Legacy group/single approval/rejection paths cannot bypass this boundary (409 SETUP_REVIEW_NOT_AVAILABLE). No fake review controls or accepted-but-unmaterialized status. Proposed setup review POST is not mounted. |
| Initial conditions | Immutable source and pending/unmaterialized cards only. No unsupported Canon/profile/state mapping or fabricated chapter cutoff. |
| Empty/all-rejected activation / M0→M-FIRST | All setup-v1 activation fails closed in service and repository (409 SETUP_ACTIVATION_NOT_AVAILABLE). Empty save/no-plan entry works; all-rejected review cannot yet be constructed. Consent/review are future work; actual first chapter bridge remains P2-04. |

Splitting is permitted by the task. A complete review adapter must fence setup/review/Brain versions and author-selected canonical/provisional IDs in the same P1 authoritative group transaction; adding that safely would substantially expand this PR. The executable foundation and mounted submit/readback are ready to review independently. Do not describe this PR as completed author planning/Canon usability.

## Storage, privacy and authority

No migrations/new persistence system. Existing PostgreSQL bootstrap lifecycle supports scoped JSON snapshots and transaction locks; version allocation scans scoped jobs under the existing admission lock. Existing writes additionally refuse immutable setup-source/hash/version changes. This guarantees admitted API writes, without claiming a new recovery lease, unique SQL index or large-history performance benchmark. JSON/in-memory production setup dispatch fails503 before provider work.

The snapshot retains raw structured setup (including omitted-vs-explicit alias fields/null initial values), separate hints/outline/public preferences/private notes/constraints, normalized envelope defaults, mode, actor UUID, hashes and stable IDs. UTF-8 hashing uses sorted compact JSON, array order preserved, no Unicode normalization; exact text SHA256 is separate. Request identity also binds mode/settings/private changes and expected version. Scope UUIDs are canonicalized; display names never identify an entity. Finalization and save guards prevent source overwrite.

Strict outbound allowlists: extract sends only exact text+locale; blueprint sends setup+labelled future outline+public preferences+locale. Private notes/constraints/hints do not enter either provider call. They are persisted owner-scoped but are not returned in default readback/job responses, public context or operational logs. An owner private-note editor/read API is not implemented in this slice. Existing Gateway1MB limit is unchanged. No supplied live credentials or real Gemini/API calls; fake LLM/embeddings only. Unsupported natural-language extraction returns503 rather than an empty success. The fake-only extractor's literal fixture grammar `[character:Minh]`/`[location:An Thành]` is documented in the UI and is not an NLP model claim.

WORLD SETUP cards and FUTURE OUTLINE remain pending source data. No narrative.entities/facts/events/state_transitions/entity_mentions/revision_provenances are created by setup. No chapter revision/outbox is fabricated. CANON HISTORY and accepted memory remain the existing P1 authority. Approved setup-rule materialization, cross-novel existing Canon-ID selection and edit auditing are deliberately NOT_RUN_NOT_IMPLEMENTED until P2-02B; passing candidate tests do not prove those future behaviors.

## Files and API examples

- Python: `api/setup_schemas.py`, setup-v1 dispatch/readback in `api/narrative_routes.py`, `application/setup_service.py`, two-line activation preflight in bootstrap_service, existing PostgreSQL lifecycle/readback/authority guards, explicitly fake adapter methods in core/fake_llm.
- Gateway: existing controller/routes accept versioned payload after ownership checks; new owner-scoped setup GET with no-store, UUID validation and unchanged trusted headers.
- Frontend: typed setup-api and SetupFoundationPanel mounted in AuthorMemoryPanel; legacy manuscript import/Writer remain intact.
- Tests: test_setup_v1, test_setup_v1_postgres, setup-provenance.live, mounted browser fixture/test; permanent p2-setup-provenance workflow.
- Documents: selected unchanged RC1 package/draft, this report and new p2-02a-evidence. No historical evidence/migration/P1 demo/main edits.

Public route (existing active AUTHOR/ADMIN JWT and owned novel required):

```http
POST /api/v1/ai/story-brains/bootstrap/from-idea
Content-Type: application/json
```

```json
{
  "contract_version":"setup-v1",
  "novel_id":"<owned-novel-uuid>",
  "mode":"extract",
  "idempotency_key":"setup-operation-1",
  "expected_setup_version":0,
  "setup":{
    "text":"",
    "declarations":[
      {"declaration_id":"keeper","entity_type":"character","display_name":"Minh"},
      {"declaration_id":"city","entity_type":"location","display_name":"An Thành"}
    ],
    "world_rules":[{"declaration_id":"rule","text":"Không ai bay được."}],
    "initial_conditions":[]
  },
  "outline":"",
  "preferences":{},
  "private_author_notes":["owner only"]
}
```

A supported call returns202 with data.job_id/status=waiting_review, not accepted Canon. `GET /api/v1/ai/story-brains/<owned-novel-uuid>/setup` returns snapshot_id/job_id, setup_version1, review_version0, Brain version, exact hashes/source and pending cards with stable IDs/origin/source_refs. Optional `?snapshot_id=<job-uuid>` loads an older immutable version; foreign-novel IDs404. Private notes/constraints are omitted. For a new creative operation choose mode=blueprint, a new key and expected_setup_version1; source declarations remain author_declared and generated additions are model_proposed. Missing provider503 stores an auditable failed version; same-key replay returns that saved failed job without retry. No-plan/empty-outline entry is valid.

## Exact-source tests and evidence

All following CI conclusions are for **1780aaf2**, checkout/tree above, not pooled with P2-01 or intermediate commits:

| Execution | Actual result |
|---|---|
| [P7 42363038504](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42363038504) | **3/3 SUCCESS** |
| [P8 42363038508](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42363038508) | **7/7 SUCCESS**, rollback and root composition included |
| Full AI unit | **415 PASS /32 SKIP /231 deselected** (six subtests not added to total) |
| Full PostgreSQL | **223 PASS /8 SKIP /447 deselected** |
| [Feature 42363038550](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42363038550) | **1/1 SUCCESS** |
| Feature focused Python/P1 | **46 PASS** |
| Real selected PostgreSQL | **25 PASS /0 SKIP** = existing16 A16 + new9 setup SQL cases; not added to full suite |
| Gateway forwarding | **19 PASS** |
| New real Gateway→Python→PG/Mongo setup | **1 PASS /0 SKIP** (18 actual HTTP outcomes) |
| Existing real P1 changed-save/revision/outbox | **1 PASS /0 SKIP** |
| Mounted UI browser | **1 PASS** in Chromium CI and Edge locally, **mocked HTTP** (not full browser→database E2E) |
| P1 backend guard/accept/persistence/lifecycle | **11/15/5/25 PASS** in separate invocations, not summed |
| Root 01A/02A/02B/03A | **15/15,13/13,16/16,18/18 PASS** |
| RC1 preserved validator | **22 shape expectations**,1 hash,2 spans; original proposed runtime flags remain untouched |
| Deferred review/approved-ID/accepted-rule/first-save cases | **NOT_RUN_NOT_IMPLEMENTED** for this slice; no mock PASS substituted |

Local commands/exits and source attribution are in p2-02a-evidence/local-commands.json. Backend/web typechecks exit0. Local Docker version command exit1: Docker Desktop Linux engine named pipe absent; local SQL is NOT_RUN_ENVIRONMENT. The SQL results above are actual independent disposable GitHub Actions services, not local/fake/in-memory substitutions.

Reproduction on fresh disposable p2a PG/vector + Mongo (workflow pins/configures services and applies existing migrations):

```bash
# ai-service/, fake providers and service authentication enabled
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py
# backend/, live AI process with fake providers, TEST_P2A_LIVE=1
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p202/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
P202_EVIDENCE_FILE="$RUNNER_TEMP/p202/setup-gateway-readbacks.json" npx tsx --test src/modules/ai/setup-provenance.live.test.ts
# web/, installed Chromium
PLAYWRIGHT_CHANNEL=chromium node --test tests/setup-foundation.browser.test.mjs
# repository root; downloaded artifacts only, no database/provider calls
python docs/development/p2/p2-02a-evidence/verify_artifacts.py
```

All feature commands above exit0; exact argv/env/install/migration/cleanup scripts are committed in the feature workflow at1780aaf2. P7/P8 command definitions are pinned to that source. JUnit, test logs, source/tree, service image identities, PG/Mongo identity and readbacks are inside source-1780aaf2.zip. Verified independent metadata: task-only **p2a PostgreSQL16.15, Mongo7.0.45**;20 new SQL readbacks/7 exact non-mutation hash pairs,11 immutable snapshot metadata identities, setup history/Canon tables empty. Same-key replay preserves IDs/provider count; concurrent keys allocate one version; provider blocked in another thread releases Brain lock (FOR UPDATE NOWAIT succeeds); malformed provider output persists only a failed snapshot, no partial proposals/run.

New Gateway evidence verifies auth401/foreign403, malformed UUID/shape422, source conflict409, foreign snapshot404 and genuine unavailable503, redacted job/readback DTOs, old snapshot readback after failed version2 and unchanged SQL/Mongo after rejection. P1 raw readbacks independently verify original immutable revision unchanged, new AUTHOR_MANUAL revision SHA256 `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1`, completed exact revision/hash INCREMENTAL_ANALYSIS outbox, Mongo version2 and approved Canon unchanged at Brainversion5.

Same-source rollback independently verified23-table restore/schema/data parity, raw source-before/after equality, migration0016_entity_profile_audit_timestamp/vector0.8.7, matched PG16 clients and intentional PG17 incompatible exit1. Backup SHA256 `5b7c964ae47681e002ef38e7c5f40564655a5c37058cd6708c23b28a066a7f38`. No timeout stripping, migration weakening or error suppression.

Archive IDs/SHA256: feature13570790734 `2800a01b38068ff65001dfb45e607e86296b32793b5af10d2903b8fbc32557b8`; rollback13570800564 `767a715c812d52cfb15c0370f6d71ccdcec5981f7ca2e72f8ddf5f4b1cf5a5b6`. The adjacent verifier/summary/manifest make these checks repeatable without runtime access.

## Preserved failures and next review boundary

Initial feature CI [42362437939](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42362437939) at252a8e1e: **1 FAIL /21 PASS**, activation returned BASELINE_REVIEW_REQUIRED before the intended setup guard. Follow-up0994d8a4 inherited that same error before the fix. Fix2fc03690 adds the service preflight before legacy proposal checks, preserving the repository guard and the original assertion. Initial artifact13570048827 (SHA256 d4e5b518fda65265981ddc6d03eb847c34dabb04adafb0958cc287eb3aea6f8c) is retained. Initial whitespace check failed on one workflow trailing space; corrected by a normal commit. Intermediate CI is not summed/relabelled as final PASS. No P1 test/contract was weakened.

Next recommended PR **P2-02B**, after review of this slice: reuse P1 explicit approved UUID/provisional selection and opaque reservation/full-group transaction; validate authorized existing IDs (including cross-novel negatives); fence setup/review/Brain CAS inside materialization, retain raw output and separate edited payload/decision audit; implement setup review POST and mount accept/reject/edit. Materialize only reviewed supported entities/world_rule facts; keep initial conditions pending until static-field mapping is reviewed. Add accepted-rule/no-history, partial-group/stale review and all-rejected consent cases on real PostgreSQL. No fake chapter cutoff, no second Canon store. M0/M-FIRST and full Planning Studio remain P2-04/P2-05, not this task.

No unexplained technical failure remains for P2-02A. Full P2-02 review/materialization and NLP/live-provider quality are deliberately unsupported, not inferred complete from green automation. **READY_FOR_REVIEW (P2-02A only).**
