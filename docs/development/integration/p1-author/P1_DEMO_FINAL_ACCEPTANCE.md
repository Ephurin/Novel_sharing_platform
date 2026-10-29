# P1 demo final acceptance — offline rehearsal

**Verdict: P1_DEMO_FINAL_ACCEPTANCE_CONDITIONAL_PASS**

Technical gates passed on the locked source. A visible-UI author journey completed without API/SQL fixture writes for its normal author steps. Conditions remain: this is an offline fake-provider demonstration, the presenter must rehearse the entity checkpoint, and several negative-path interactions were automated rather than manually operated. This is not production acceptance or a live-model quality assessment.

## Source, isolation and configuration

- Tested source: `e8f44dfbad7950b5a6b6835ec239ba45b4fb7e6f`, integration branch `integration/p1-demo-20261109`.
- Tested source tree: `d8aaa4cb036153dfb2d3dfade5c2072ffc9ba2e8`.
- Clean source checkout before evidence; QA branch `codex/p1-demo-final-01-qa`. Only these reports and their evidence are added. The evidence commit is separate from the tested source and can be found with `git log -1 --format=%H -- docs/development/integration/p1-author/P1_DEMO_FINAL_ACCEPTANCE.md`.
- Latest remote fetch after runtime cleanup still resolved integration to the locked SHA. No main changes, merges, deployment or P2/P3 work.
- Owned Docker project: `codex-p1-final-5bdacaf501`; separate PostgreSQL, MongoDB, Backend, AI Service, budget gateway and fake upstream. Frontend served the newly compiled production `web/dist` through the reviewed local Gateway proxy, not a Vite development server.
- `web/dist` was absent initially. Typecheck/build exited 0. Build manifest contains file hashes; representative running backend/AI source hashes and topology are included. This is not a full container filesystem/SBOM equivalence claim.
- **Chosen 09/11 demo configuration: `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`.** Container allowlist readback confirms it. Application default false was separately asserted; the false bootstrap path was NOT_RUN on this final source. Earlier Gate-03 results do not substitute for a final-source false rehearsal.
- Runtime `LLM_PROVIDER=openai` selects the protocol adapter; its base URL was local `http://budget-gateway:18090/v1`, routed to the owned fake upstream. Fallback was disabled. Runtime `EMBEDDING_PROVIDER=none`, `SEMANTIC_RETRIEVAL_ENABLED=false`; schema helper processes used fake providers. No live/cloud LLM or embedding calls were executed. Semantic vector retrieval quality is outside this rehearsal.
- Browser rehearsal: visible in-app Chromium UI, desktop viewport 1440×900, restored afterward. An AI operator followed the UI; this is not a naïve human usability study. The temporary tab and frontend server were closed; the owned stack was stopped, volumes retained.

Evidence directory: [p1-demo-final-01](evidence/p1-demo-final-01). Credentials, private notes, raw prompts, raw HTTP bodies and traces remain outside the repository. Screenshots show only fictional public manuscript/Canon or blank note fields.

## Gate A — schema and migrations: PASS

Two independently created complete schema runs passed. The first checked the fresh application database before user data; a second run used a new disposable fresh database to persist full migration console output. Each run also created separate existing-install and NULL-case databases. The second run did not reset or modify the author rehearsal database.

Historical preparation deliberately used `empty → 0014 → 0004 → 0014` before seeding. This removes the current-metadata `0001.create_all()` masking effect, so the tested historical provenance/audit tables genuinely came from migrations 0005/0014.

| Check | Readback |
|---|---|
| Fresh A and upgraded B head | Exactly `0016_entity_profile_audit_timestamp` |
| Both timestamp columns | `is_nullable=NO`, `column_default=now()` |
| Mapped table/column existence | 22 SQLAlchemy-mapped tables / 291 columns; no missing objects |
| All mapped column nullability | No mismatch in A or B |
| Alembic version metadata | Width 35, sufficient for the actual head identifier |
| Existing-install data | 1 profile, 3 audits, 1 provenance row preserved |
| Audit/profile/provenance preservation | Aggregate hashes equal before/after; IDs, actors, request keys, input hashes, snapshots and exact timestamps included in comparisons |
| Audit constraints/indexes | Projection unchanged before/after upgrade |
| Post-upgrade profile mutation/retry | Production repository mutation succeeds; same-key retry creates no duplicate audit |
| Provenance NULL case | 1 NULL; explicit `DATA_REPAIR_DECISION_REQUIRED`; data unchanged, head remains 0014, column remains nullable |
| Audit NULL case | 2 NULLs; explicit `DATA_REPAIR_DECISION_REQUIRED`; data unchanged, head remains 0015, column remains nullable |

No timestamp backfill was performed. Expected NULL-case errors were caught and asserted, not skipped. Data preservation compares the entire selected row representation by hashes, with public timestamp scalars only; no private audit snapshots are published.

Readbacks and exact timestamps: [schema-gate-rerun.json](evidence/p1-demo-final-01/schema-gate-rerun.json). Full migration output: [schema-gate-logged.txt](evidence/p1-demo-final-01/schema-gate-logged.txt). Original independent run: [schema-gate.json](evidence/p1-demo-final-01/schema-gate.json).

Scope of schema comparison: all mapped table/column existence and nullability; the two requested defaults; audit constraints/indexes. No claim of global default/index/constraint equivalence or production NULL counts. No additional mapped nullability mismatch was found in the tested databases.

## Gate B — actual author journey

The following normal steps used visible UI controls on the compiled frontend and real Gateway/API/DB. Independent SQL reads verified results; SQL/API writes did not create or repair this author's novel, manuscript, identities or profile.

| Scenario | Actual result and evidence |
|---|---|
| B1 onboarding | UI registration → Profile → “Trở thành tác giả” → create novel “Vân Sơn Ký — Tổng duyệt P1” |
| B1 manuscript/bootstrap | UI created chapter 1 and typed 57 Vietnamese fantasy words; waited for saved state; Story Brain extraction started |
| B1 entity review/HITL | 27 span decisions over six pages; three identity groups; freeze; continue event/fact extraction; approve four proposals atomically; activate Brain |
| B1 persistence | Reload retained active Brain, three entities and one event |
| B2 profile | Lâm Phong appearance/personality/background saved at cutoff 1; profile v1, Brain v3; close drawer, leave Studio, return and read all fields back |
| B2 private note | UI note save produced profile v2; Brain remained v3; approved Canon hash unchanged; two audits, correct owner actor and non-null timestamps; private note readback matched |
| B3 temporal setup | Another confirmed character received a baseline background at cutoff 10 through the UI; Brain v4 |
| B3 generation | UI created chapter 2, entered prose, chose Story Bible scope and requested natural writing continuation; no Context Preview or injected test correlation token required |
| B3 prompt/job | Real completed writing job, persisted revision and context hash matched the captured local fake-provider request; updated Lâm Phong profile present; note and cutoff-10 profile absent at chapter 2 |
| B4 failed generation | Rejected the canned completed draft; intentionally stopped only owned fake upstream; another UI request failed; Canon hash/Brain v4 and manuscript remained intact; fake upstream restored |
| B4 account isolation | UI logout, register/promote second author, load/reload first author's Studio URL; note absent, author data denied, second dashboard empty |
| B4 concurrency/retry | Supplemental production-stack automated tests: two independent browser contexts got 409 with draft retained; same-key API replay produced no duplicate audit |

Manual novel: `51100c57-c7a5-453f-8879-8207049542c9`. Confirmed Lâm Phong UUID: `e85afebe-62df-4377-9445-eee30a3cb299`.

The note-only Canon SHA-256 stayed `8a8be5059cfdccc5c649a7e87c1477bb832331cef104f3d94039b125fe8f707e`. See [manual-b2-db-readback.json](evidence/p1-demo-final-01/manual-b2-db-readback.json).

Actual UI generation binding:

- Job `8a3b8773-d7b7-50b8-8c65-5e62305309ae`, completed; chapter 2 `98af857f-1c6c-454c-855a-16a85c10d59e`.
- Revision `e3eb10ef-67ad-40b6-8085-e46bb1808480`.
- Provider request SHA-256 `f01c5be32b28ac30b76b05009567f3df9a2493fa688afa899ea8e681abf79797`.
- Persisted `writing_generations.context_summary.context_hash` and recomputed prompt context hash both `438846b9fbdf9d64c56430707ebf58966297f266cca8d139c03f03af97de2d6d`.
- Readback: [manual-b3-generation-binding.json](evidence/p1-demo-final-01/manual-b3-generation-binding.json). It publishes hashes/booleans, not the prompt.

The fake output used unrelated canned names; it was rejected, not inserted. This demonstrates transport/context/persistence, not prose quality. Baseline profile is background knowledge; an in-story change still belongs in existing event/state correction. Whole-snapshot cutoff is not historical reconstruction.

The persistent fake ledger contains **23 received requests** across the intentional process restart. The last in-memory snapshot alone contained 14 and was not used as the total. Both known private-note sentinels were absent from all captured prompts. The deliberately failed request did not reach the unavailable fake upstream. See [fake-provider-ledger.json](evidence/p1-demo-final-01/fake-provider-ledger.json).

### Supplemental reviewed technical suite

External QA harness source: `0e001e396cfc6745c0efc8595922da9ae389a6f4`; kept outside the application checkout, with only source-root/sanitizer-path adapters. [Harness provenance](evidence/p1-demo-final-01/harness-provenance.json) records source/file hashes.

Node test process exited 0. Seven scenario results PASS; homonym scenario PARTIAL_PASS. The production author creation API rejects duplicate canonical names with 422. UUID isolation was therefore tested with a **SYNTHETIC_DB_FIXTURE**, not claimed as a supported author creation journey. No QA branch was merged into application source.

Other passing assertions cover ownership 403 both directions, unauthenticated 401, reader 403, missing key/oversized payload 422, CAS 409/draft preservation, idempotency, temporal exclusion/inclusion, audit persistence and actual generation context/hash. These API/SQL-assisted technical fixtures are separate from the manual journey above. [Results](evidence/p1-demo-final-01/automated-acceptance-results.json), [test log](evidence/p1-demo-final-01/automated-acceptance.txt).

## Gate C — observed UX findings

| Severity / classification | Reproduction and observation | Demo handling |
|---|---|---|
| Medium, UX friction | Open Story Brain bootstrap. Extraction is under “Trích xuất”; the entity checkpoint exists while proposal tab says “Chờ duyệt (0)”. Internal English states/group vocabulary require explanation. | Presenter follows checkpoint panel, not proposal badge alone. |
| Medium, UX friction | Enter provisional group name “Lâm Phong”: validation rejects it; ASCII `lam-phong` succeeds. | Prepare ASCII identity keys; display label remains Vietnamese. |
| Medium, environment + interaction complexity | 57 words generated 27 spans/six pages, including partial words/pronouns. Fake extraction overproduced candidates; explicit review took many actions. | Allow review time; do not advertise extraction accuracy or skip HITL. |
| Medium, operator/review risk | Cồn Vân group was left at default PER despite machine LOC hint. Pre-freeze “Sửa thuộc tính” was available but its correction path was not completed. | Verify identity type before freeze; do not claim this rehearsal proved LOC correction or post-confirm type editing. |
| Low, display defect | Rename chapter 2: editor and DB held the new title, sidebar retained default title until reload. | Wait for autosave then reload if the list label is stale. |
| Medium, visual friction | Dark-theme writing quick actions had low-contrast labels. | Use the clearly visible instruction box and scope selector; no theme workaround was used for acceptance. |
| Medium, environment/communication risk | Canned response names differed from the manuscript while UI displayed the P1 consistency badge. | Explain offline fake transport; reject draft. No live-model quality claim. |
| Low, error-state friction | After injected failure, panel later returned to ready; no persistent explanation remained in the observed screen. A transient toast was not captured. | Check job outcome, preserve manuscript, restore service before retry. Do not claim no feedback ever appeared. |
| Medium, UX friction | Second author opens first-author Studio URL: repeated denied GETs and blank/loading editor rather than a clear durable denial page. | Return to own dashboard. Backend isolation and no note leakage passed. |
| Positive observation | Canon/private-note distinction, explicit whole-snapshot cutoff and save/readback feedback were understandable; edits persisted across navigation. | Demonstrate these controls directly. |

No runtime source fix was required to complete the tested route. These findings are bounded follow-up items, not silently fixed or treated as P2/P3 regressions.

Screenshots: [active Brain](evidence/p1-demo-final-01/ui-b1-active.jpg), [saved Canon profile, note blank](evidence/p1-demo-final-01/ui-b2-saved.jpg), [offline fake result](evidence/p1-demo-final-01/ui-b3-fake-result.jpg). Account-switch screenshot stays private because an account display identifier was visible.

### Failed attempts and evidence limits

- The bulk “apply to every position” control opens a second inline confirmation. The operator navigated away before confirming, so it did not apply globally. Source inspection confirms this is intentional; not a broken button claim. All 27 decisions were subsequently made explicitly.
- Some rapidly batched automation clicks occurred during drawer transitions. Fresh UI inspection and slower single actions succeeded; not evidence of persistence failure.
- An initial read-only SQL probe incorrectly selected a top-level context_hash column; it was corrected to context_summary JSONB. No schema/source changes.
- The first frontend proxy was terminated with Ctrl-C (exit 1) before its HTTP summary flushed. Full initial HTTP/trace coverage is unavailable. Screenshots, persisted DB readbacks and fake-provider binding remain. A resumed proxy finished gracefully (exit 0), recording the account-switch denial checks; its 120 denied responses are repeated navigation/polling, not 120 independent authorization scenarios.
- Initial schema-console output was not persisted, so one logged rerun used entirely new databases (exit 0). No failed migration was hidden.
- Automatic approval review rejected an early evidence utility that could appear to export raw audit rows. It was replaced before execution by hash/count/scalar-only output and accepted. No approval bypass or raw audit publication occurred.

## Commands, exit codes and reproduction

Paths below are relative to the QA worktree; private configuration must be freshly provisioned and kept outside Git. Do not run against shared/production databases. [commands-and-exits.jsonl](evidence/p1-demo-final-01/commands-and-exits.jsonl) contains exact expanded argv and working directories. Raw driver log names use .log; sanitized public copies use .txt.

| Executed command/stage | Exit | Evidence |
|---|---:|---|
| `python scripts/p1_final_acceptance.py provision --output ..\demo-final-01-private` | 0 | isolated private config, no credential publication |
| same driver `bridge-config`, `db-up` | 0 | compose DB up, backend `npm.cmd run db:migrate` (18 migrations through 017), AI `python -m alembic upgrade head` |
| `npm.cmd run typecheck` in web | 0 | web-typecheck.txt |
| driver `web-build` / `npm.cmd run build` | 0 | web-production-build.txt; inherited directive/chunk warnings, no cached dist |
| driver `up`, `runtime-proof` | 0 | owned images/containers, runtime hashes/topology/default-flag assertion |
| `python ..\demo-final-01-private\schema_gate.py` | 0 | schema-gate.json |
| `python ..\demo-final-01-private\schema_gate_logged.py` | 0 | schema-gate-command.json, full logged rerun |
| `node --test ..\demo-final-01-private\reviewed-qa\web\tests\p1-ax-integrated-acceptance.browser.test.mjs` (absolute argv in metadata) | 0 | automated-command.json, automated-acceptance.txt |
| driver `provider-before`, `provider-after`, final provider snapshot | 0 | metadata only public; “before” was taken after bootstrap, not a zero-call baseline |
| resumed UI proxy graceful finish | 0 | sanitized resumed HTTP counts/trace summary |
| driver `cleanup-owned` | 0 | owned compose down; no remaining owned containers; volumes retained |

Automated harness environment: `P1_SOURCE_ROOT=<QA checkout>`, `P1_ACCEPTANCE_CONFIG=<outside-repo private-stack.json>`, `P1_EVIDENCE_DIR=<outside-repo automated-acceptance>`. The external helper served compiled assets and forwarded real Gateway/API calls. No runtime mocking of profile/Gateway/repository behavior.

Database helper source is included solely for reproducibility. It imports existing source test utilities, uses actual Alembic revisions and production repositories, creates UUID-named databases on the owned server and drops only those names. Logs redact configured secrets. Do not rerun its historical downgrade setup on an existing user database.

## Exact manual NOT_RUN list and remaining conditions

- In-flight generation cancel button; completed-draft rejection and failed-generation safety were tested.
- Human-operated side-by-side CAS/conflict usability and ambiguous-transport retry button; automated independent browser sessions/API replay passed.
- Accepting/inserting the canned generated draft; publishing/scheduling not part of this rehearsal.
- Identity rename/type correction after confirmation, reopening freeze, completed LOC correction before freeze, and bulk helper second confirmation completion.
- Current-source flag=false end-to-end bootstrap path.
- Mobile, other viewport/theme/accessibility certification, or a naïve human user study.
- Live/paid provider prose quality, production deployment/data, and production NULL counts.
- Global schema default/index/constraint equivalence beyond the explicitly checked scope.

No critical privacy/persistence/schema blocker appeared in the tested configuration. Demo approval remains conditional on independent review accepting the listed UX limitations and the explicit fake-provider scope. The human presenter should rehearse the runbook and identity-type review before 09/11; this report does not assert that a nontechnical first-time author can discover the entire path unaided.

## Secret hygiene

Targeted scanner exited 0 on the new evidence directory; seven negative controls and one clean positive control passed. Both reports had zero findings. An additional exact-value sweep found zero matches for private account credentials, configured secrets and the manual private note. JPEGs were visually inspected; raw traces/prompts remain outside Git. No claim is made about rescanning historical evidence.

Executed scanner: `python ..\demo-final-01-private\reviewed-qa\scripts\verify_secret_hygiene.py --target docs/development/integration/p1-author/evidence/p1-demo-final-01`. See [secret-hygiene.json](evidence/p1-demo-final-01/secret-hygiene.json) and [scanner log](evidence/p1-demo-final-01/secret-hygiene.txt).

## Recovery and handoff

The QA stack is stopped; private volumes/config remain outside Git. Restart only the recorded owned project after reviewing its private configuration. For a clean repeat, provision a new UUID project and fresh databases; never reuse production credentials or backfill unknown timestamps. If a migration encounters NULLs, stop for deterministic data-repair review; do not substitute now(). If generation fails, retain the author draft, restore the local fake service, then retry as a new deliberate request.

No application rollback was needed because no runtime source changed. Do not apply schema downgrades to shared data as rehearsal cleanup. Independent review should use the locked source plus this separate evidence commit. No merge/deploy authorization is implied.
