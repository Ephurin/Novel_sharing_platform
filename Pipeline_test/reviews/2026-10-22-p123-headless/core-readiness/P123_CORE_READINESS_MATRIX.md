# P1/P2/P3 bounded core readiness

Candidate gate: `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW`, subject to the new post-accept executor validation and independent source/evidence review. This is not product E2E or release acceptance. Current exact tested source: `3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99`; source authority: `0582f05`.

| Pipeline / stage | Actual supported backend API (prefix /api/v1) | Verdict and evidence | Tested source / remaining risk / owner |
|---|---|---|---|
| P1 manuscript bootstrap → official canon | POST /novels/:id/chapters; POST /chapters/:id/revisions/snapshot; POST /ai/story-brains/bootstrap/from-manuscript; entity-reviews/:analysis/review and /continue; proposal-groups/:id/accept; baseline/activate | PASS_BOUNDED_EXECUTOR, earlier headless source/canon traces; current writer setup repeats supported bootstrap | Earlier a7081c6 lineage in ../p3-intent-fence/; current ../post-accept/green-03/p1-writer/. No new broad P1 build or UI claim. Backend/AI owner. |
| P1 write / immutable revision / outbox | POST /ai/writing/generations; POST /chapters/:id/revisions/accept-draft; versioned PATCH /chapters/:id | PASS_BOUNDED_EXECUTOR, previous full shared loop and current ordered writer/crash sanity | Current source and ../post-accept/green-03/p1-writer/; previous a7081c6 full gates. Advisory lease and explicit CAS reload/retry bounds; no Mongo/PG distributed transaction or general lease-loss recovery. |
| P2 explicit idea extraction / reviewed baseline | POST /ai/story-brains/bootstrap/from-idea with mode=extract; review queue/group accept; baseline/activate | PASS_BOUNDED_EXECUTOR, ../post-accept/green-03/p2/ | Current source; extraction fixtures prove routing/persistence, not real model factual/literary quality. |
| P2 future plan / first accept / M-FIRST | POST /ai/story-plans; /:id/activate; writing/generations; accept-draft; revision review and next generation | PASS_BOUNDED_EXECUTOR, current 27-check p2 sanity and prior accepted evidence | Current source. Future intent remains distinct from official historical canon; human decisions simulated via API. |
| P3 existing and automatic no-plan entry / 2 objectives | POST /ai/autonomous/runs with/without plan_id; /:id/run and /step; GET run/plan | PASS_BOUNDED_EXECUTOR only for final successful validation artifacts under ../post-accept/green-03/; retain any failed attempts separately | Current source. P3_SCHEDULING_CONTENTION_LIMIT: native worker/manual step may return 409 RUN_STEP_BUSY; caller contract in cutover document. Test-side adapters are not a product feature. |
| P3 pre-accept skip/stop and ABA | PATCH /ai/story-plans/:plan/objectives/:objective; POST /ai/autonomous/runs/:id/stop; accept-draft | PASS_BOUNDED_EXECUTOR / prior bounded source-evidence acceptance, ../p3-intent-fence/ 7 cases/45 checks | a7081c6; cancellation-first has no accepted revision/outbox, accept-first retains history. Existing protection remains in current source. |
| P3 post-accept cancel/stop / canon / progress | Same author mutation APIs; controller guarded proposal-group accept and objective completed PATCH | PASS_BOUNDED_EXECUTOR only if ../post-accept/validation.json final verdict permits; original RED and final traces retained | Current source. Transactional run → plan → objective fence in each PG canon/progress write. Earlier committed groups/revisions retained; no cross-service or multi-group ACID claim. |
| P3 HITL / replay / crash / plan replacement | entity review freeze/continue; step/stop; supported plan activation; owned SIGKILL and restart | PASS_BOUNDED_EXECUTOR only for passing corresponding post-accept artifacts | Current source. Stale author continue can materialize pending proposals for explicit reconciliation; no cancelled automatic canon/progress. Arbitrary admin mutation, load and mixed-version cutover untested. |
| P3 terminal and draft-only | GET chapters; GET run/plan; terminal step replay | PASS_BOUNDED_EXECUTOR for two-objective fixtures | Current source happy paths. All chapters DRAFT; no publication. A tiny scripted terminal fixture is not the final 100k novel/ending acceptance. |

Prior independent GPT-6 reviews are separate from executor runtime: ../p1-race-p3/GPT6_P1_P3_INDEPENDENT_REVIEW.md and ../p3-intent-fence/GPT6_P3_INTENT_FENCE_INDEPENDENT_REVIEW.md inspected GitHub source and committed artifacts, without rerunning Docker/pytest/PG/Mongo. The latter verdict is P3_OBJECTIVE_FENCE_BOUNDED_SOURCE_EVIDENCE_ACCEPTED_WITH_POST_ACCEPT_GATE. Current new slice remains pending independent review.

| Separate gate | Status / owner |
|---|---|
| CORE_BOUNDED | Executor evidence only; independent integration review required |
| UI_BLOCKED_FE | Historical S09 RED persists. FE owns Author IDE/autosave; no web changes here |
| FE PR #52/#54/#55 | Read-only compatibility only; #54/#55 pinned source snapshots and FE_BACKEND_CUTOVER_CONTRACT.md; no integration or browser claim |
| REAL_PROVIDER_NOT_TESTED | Zero real Gemini/OpenAI/embedding calls; only isolated fake HTTP provider |
| SEMANTIC_RAG_NOT_ASSESSED | Disabled embeddings/retrieval; outbound context provenance is not semantic retrieval quality |
| LITERARY_QUALITY_NOT_ASSESSED | Canned fixtures cannot establish prose/ending quality |
| P3_HITL_CONTROLLER_100K_NOT_RUN | Contract v1.4 still requires 100,000–105,000 canonical words and a real ending in a separately authorized future run |

No further broad hardening, FE integration, live provider or 100k execution is authorized by this handoff. See the final post-accept report, aggregate validation and exact evidence commit before accepting the candidate integration-review gate.
