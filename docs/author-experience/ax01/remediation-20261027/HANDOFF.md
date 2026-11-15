# AX-01 independent-review remediation handoff

2026-10-27, Asia/Saigon. Implementation/offline verification complete; independent remediation review pending. No live-provider, merge, deployment, P2/P3 work or PR creation.

## Exact source

- Requested reviewed source: `c193dd1c84c17af367c8b384c9d151ae287cb805`.
- Remediation starts from its evidence-only child `21b8caa2286150b9e0507cff4f38b79ccdd4a287`.
- Tested source commit: **`47b194bb1b7783105827c08c27d42dfe7c984e54`**.
- Tested source tree: **`61e689aaef2787f859b7328e83a31c4e2fd69a30`**.
- Same working branch: `codex/p1-ax01-storybrain-core`. Evidence follows in a separate commit; its HEAD/tree are not the tested production code SHA/tree.
- Ancestry check from reviewed source to current branch: exit0. Remote main and integration/p1-demo-20261109 rechecked before publication at original locked `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`. No base change, rebase, PR72/73 cherry-pick or main modification.

## Findings and outcomes

| Finding | Offline verdict | Change / evidence |
| --- | --- | --- |
| H-01 generation profile routing | PASS | WritingService obtains existing canonical semantic query signals before context assembly. The existing semantic resolver now also admits confirmed, applicable baseline knowledge without event history. If embedding runtime is unavailable/disabled, the same resolver is called directly through a narrow PostgreSQL capability; no duplicate matcher, index, memory store or embedding writer. H01 captures prove start_generation -> real repository/resolver/pgvector retrieval -> real routing/packer -> production LLMService serializer -> fake final transport, without character_name or a separate Preview call. Both legacy and balanced with semantic runtime, plus legacy without embedding runtime, are covered. |
| H-02 homonyms | PASS | Scoped canonical UUIDs select profiles. Names and confirmed aliases must be unique across registry, including shared aliases; ambiguous names do not select profile text. Resolved query selection overrides incidental recent/name fallback. Name-based context scope no longer selects multiple identities. H02 captures select FIRST/SECOND individually or neither when ambiguous, with semantic runtime enabled and disabled. The other homonym can remain a protected locked identity with no selected profile; its lock is unchanged. |
| H-03 locked profile budgets | PASS | Profile text is an optional whole addition after existing identity/state/evidence selection. Locked identity/state protection remains intact; dropped profiles are explicit in profile_entity_ids/dropped_profile_entity_ids and dropped-artifact accounting. Existing balanced full-fit routing still escalates/fails closed; legacy protected overflow now also stops generation before provider. Eight locked entities, each with16000 profile characters: legacy keeps all8 identities/states, includes2 profiles, drops6 at11516/12000 estimated tokens. Balanced rejects43646 estimated tokens over24000 maximum, zero provider calls. At200-token identity budget, protected bundle806 tokens also fails before provider. |
| H-04 temporal meaning | PASS | CONTRACT.md explicitly calls baseline profile background knowledge, not an in-story occurrence. In-story change belongs to existing event/state correction and Canon review. Whole-snapshot cutoff is applicability, not historical reconstruction. Updating description and moving cutoff1->10 retains old appearance in durable storage, omits ALL profile fields at chapters3/9, then includes new description+retained appearance at10. No events/facts are created. |

These are automated offline verdicts on the exact source above, not an independent review approval or live quality claim.

## Files and boundaries

- application/writing_service.py: route resolved UUID selection before context assembly; shared resolver fallback; pre-provider protected-overflow guard.
- infrastructure/postgres_narrative_repository.py: optional profile_entity_ids argument and existing-resolver bridge; unique-name/UUID profile inclusion only.
- infrastructure/postgres_semantic_memory_repository.py: extend existing temporal query identity signals to applicable baseline profiles and remove homonym/alias guessing; ranking weights, vector search and storage unchanged.
- application/context_budget.py: detach optional profile text from protected identity/state, attempt bounded reattachment, trace selected/dropped profile IDs.
- application/context_scope.py: ambiguous explicit name cannot choose multiple identities.
- domain/repositories.py, infrastructure/in_memory_narrative_repository.py, infrastructure/json_narrative_repository.py: additive internal selector signature compatibility. No profile persistence is added to these legacy adapters.
- tests/test_entity_profile_remediation.py: seven PostgreSQL tests with production generation and serialized prompt capture.
- docs/author-experience/ax01/CONTRACT.md: updated review candidate semantics, optional profile budgeting and baseline/correction distinction.

Paths above are under ai-service except the contract. No API route/DTO, migration/schema, FE, HITL materializer, Canon approval, writer, immutable source/provenance or private-note storage changes. Historical evidence stays untouched.

## Exact commands and final results

All Python commands ran from `<worktree>/ai-service`, against task-owned local PostgreSQL/pgvector container `ephurin-ax01-remediation-01a178b1`,127.0.0.1:55440, database ax01_review. AX01_TEST_DATABASE_URL and TEST_DATABASE_URL point only to this disposable database. Fake768-dimensional embeddings and a subclass overriding only LLMService._call_llm ensure no external provider call.

1. Fresh task-owned DB initialization: `python -m alembic upgrade head`, successful to0014_entity_profiles. Schema source is unchanged by remediation.
2. `python -m pytest tests/test_entity_profiles.py tests/test_context_budget.py tests/test_context_scope.py tests/test_context_routing.py tests/test_semantic_retriever.py tests/test_hybrid_ranker.py tests/test_narrative_repository_contract.py tests/test_writing_validation_golden.py -q --tb=short --basetemp=.pytest_tmp_remediation_units` — **exit0,120 passed,1 skipped,1 deselected,4 warnings**. evidence/units.txt. Skip is the SQLite row-lock case (its PostgreSQL counterpart runs); deselection is the pre-existing explicitly marked migration case. Warnings are inherited FastAPI on_event deprecations.
3. Set AX01_REMEDIATION_EVIDENCE_DIR to this handoff's evidence directory, then `python -m pytest tests/test_entity_profile_remediation.py tests/test_p1_contract_alignment.py tests/test_c01_canon_group.py tests/test_atomic_group_rejection.py tests/test_p1_memory_entity_hitl.py tests/test_semantic_retriever_postgres_integration.py tests/test_unadapted_narrative_postgres_integration.py -m postgres_integration -q --tb=short --basetemp=.pytest_tmp_remediation_pg` — **exit0,106 passed,43 deselected**. evidence/postgres.txt. Includes7 remediation tests,88 existing P1 approval/correction/HITL cases,5 semantic PostgreSQL and6 unadapted temporal/scope cases.43 non-PostgreSQL parameter cases deliberately excluded.
4. `python ../docs/author-experience/ax01/remediation-20261027/evidence/readback_generation_prompts.py` — **exit0**.15 captures checked through fresh SQL sessions:13 actual serialized provider-bound prompts match durable context hashes;2 fail-closed jobs have no provider-bound prompt; all scoped fixture novels have zero event/fact creation. evidence/readback.json records durable job IDs/statuses/hashes, current profile versions, selected UUIDs and prompt token estimates, without private note contents.
5. `git diff --check`; `git diff --exit-code 47b194bb1b7783105827c08c27d42dfe7c984e54 -- ai-service backend web`; immutable historical-path diff and ancestry checks — **exit0**. Source remained unchanged while final evidence was collected. The source-only whitespace check passed; raw units.txt preserves upstream warning whitespace verbatim, so a full staged-evidence whitespace check reports9 trailing-whitespace lines in that raw log. It is retained as captured evidence. No backend/FE changes require a new build in this slice.

Final logs/captures are from source47b194b. Earlier focused execution exposed a fixture issue: repeated generation requests used an empty idempotency key, correctly hitting the existing unique constraint (3 failed,2 passed). The helper now supplies a unique key per independent request; no production uniqueness/version guard was relaxed. A standalone readback initially needed the service import path; the committed script supplies it. Initial wrong-directory shell/encoding discovery errors were corrected before final source, with no partial historical evidence changes. The session interruption required restarting only the task-owned stopped container; tests were rerun after recovery.

## Reading the evidence

- H01-*.json: first generation request, no recent events, author update and unrelated profile omission; no separate Preview prerequisite.
- H02-uuid-*.json: exactly one selected UUID profile, with the other profile absent. H02-ambiguous-*.json: no selected profile despite same-name identities and shared alias. A locked identity may remain in context without its profile.
- H03-*.json: optional-profile trimming and two explicit pre-provider failures. Canon identity/state are never dropped to make long profiles fit.
- H04-before-cutoff-*.json and H04-at-cutoff.json: entire-snapshot cutoff behavior, including retained old field.

Each successful capture stores the **actual system/user prompt strings built by production LLMService**, plus the hash of the Story Brain JSON inside that user prompt. Only the final network call is faked. The capture contains the latest prompt for its labeled request; provider_call_count is cumulative within that fixture's request sequence. Fictional private-note sentinel is asserted absent; no actual private/user data is used. The context hash is independently recomputed and compared to persisted WritingGenerationRecord readback, not just a mocked DTO.

## Remaining limits / delivery gate

- Independent remediation review remains PENDING; do not label AX01_APPROVED from these tests alone.
- No live provider, browser, full Gateway->Python deployment E2E, merge or deployment. No P2/P3 work. No new migration or retrieval engine.
- Baseline profile text is author knowledge. Arbitrary prose cannot be semantically proven free of future assertions; explicit cutoff and existing corrections remain the authority. Earlier profile versions are not reconstructed from the private audit ledger.
- Balanced full-fit policy intentionally fails if all selected profiles cannot fit by24k; legacy can omit optional text while reporting IDs. Identity/state protection never becomes optional.
- No Draft PR yet: user requires remediation review first. After approval, target remains integration/p1-demo-20261109.
- CI/PR validation is NOT_RUN here; no PR URL is claimed. Review the source and attached offline evidence first.

After evidence/readback, container ownership label was verified as ax01-remediation-01a178b1 and `docker stop ephurin-ax01-remediation-01a178b1` returned exit0. Data is retained in that stopped task-owned container for reviewer replay; no other container was modified. Source/test commit and evidence commit remain separate on the same branch.
