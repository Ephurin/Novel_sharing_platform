# P2 STORY PLANNING STUDIO — ROADMAP & CODEX IMPLEMENTATION CONTRACT

**Status:** implementation kickoff / plan only; NOT an acceptance or release approval  
**Reviewed baseline (P1):** \`integration/p1-demo-20261109\` @ \`21a73167f6877f0f3d178138f00b36ff393c461e\`  
**P2 integration branch:** \`integration/p2-planning-studio\`, forked from P1 baseline; **no P2 feature code has landed by creation of this plan**.  
**Canonical design reference:** \`Pipeline_test/WORKFLOW_CONTRACT.md\` v1.4 @ \`7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3\` (not present in the P1 integration tree); \`docs/development/p2/P2_00_GAP_AUDIT.md\` in P1 tree.  
**Existing PR reuse:** PR #72 \`codex/p2-01a-active-brain-guard\` @ \`bb0ad38824c2d107929032ae10073d006a2b5851\` is DRAFT, based on outdated \`main\`, and must NOT be merged/cherry-picked blindly.  
**Provider:** Offline fixture/mock by default, real Gemini dispatches = 0, do not start live mode or reset quota.

## 1. Product decision & P2 scope

P2 is a **structured planning workspace for a novel that has not yet been written**, mounted in the existing Author experience rather than a second novel editor.

A writer may start in one of three paths, all of which converge to the existing P1 Writer:
- **A — Idea/setup only (NO PLAN):** one paragraph premise, optional world rules and characters; approved setup baseline M0; write chapter 1 directly; a Story Plan is NOT required.
- **B — Author brings a plan:** premise/setup + imported/pasted chapter outline; store outline as **future intent**, review setup identities separately; optionally edit plan on UI; write chapter 1.
- **C — Plan inside UI:** author starts with idea, builds world/rules/characters and 5–10 chapters (and can add 15, 20 or more), manually or assisted by model; plan is editable/versioned; write chapters one by one.

The UI must provide four cohesive panels/steps (not a second Author IDE):
1. **Ý tưởng & thiết lập**: premise, genre/tone, setting, author constraints and explicit named declarations.
2. **Thế giới & quy tắc**: worldbuilding entry cards, rule definitions and author-review status.
3. **Nhân vật chủ chốt**: names, type, role, goals, initial profile, relationships, ambiguous homonym review.
4. **Dàn ý chương**: chapter board, chapter objectives, future scenes/events, dependencies, key participants, reorder/edit, adjustable starting default 5/10 and unlimited explicit add, then **Bắt đầu viết** → existing Author Writing IDE.

Author can skip planning, can create one chapter at a time, can revisit plan later, and can alter/retire future plans without silently changing written history. **No minimum word count or a hard ten-chapter ceiling is to be enforced by the planning feature**; scalability/limits remain subject to measured acceptance.

## 2. Invariants — data authority boundaries (release blocking)

### 2.1 Distinguish three logical lanes

| Lane | Source & meaning | Storage candidate / current code | May enter historical event history? |
|---|---|---|---|
| WORLD SETUP | Author-declared or explicitly accepted model-suggested premise, static rules, entities and initial conditions | Existing \`narrative.entities\`, reviewed \`narrative.facts\` with \`fact_type=world_rule\` where semantically appropriate; typed, versioned setup snapshot as needed (existing \`bootstrap_jobs.result\` is candidate, not assumed final) | **No** — not an occurrence |
| FUTURE STORY PLAN | Unwritten chapter objectives and proposed future events | \`narrative.story_plans\`, \`narrative.story_plan_objectives\`, \`source_outline\`, \`objective_metadata\` | **Never directly** |
| NARRATIVE CANON HISTORY | Events/facts/states found in actual immutable chapter revisions and accepted by author | Existing P1 \`revision_provenances\`, \`events\`, \`facts\`, \`state_transitions\`, HITL proposals | **Yes, only from verified revision + explicit author approval** |

Proposed plans may mention characters who are NOT yet confirmed World Setup entities. An author's approved setup entity may exist in Story Brain without an \`entity_mention\`, historical event or fictional first chapter.

### 2.2 Source of truth & audit

- Distinguish \`source_kind\` (\`author_setup\`, \`model_suggestion\`, \`future_outline\`, \`manuscript_revision\`), \`origin\`, author decision and stable source hash/plan version. Names are NOT identity keys.
- \`mode=extract\` may only extract explicit entities/places from the immutable **setup input**, never infer occurrences from \`outline\`, hints or future plan. Reject invented names and ambiguous identities; preserve provenance spans or explicit source references. It must not secretly call the blueprint generator.
- \`mode=blueprint\` is an optional creative suggestion flow; every suggested rule/character/plan is \`model_proposed\` until edited/accepted. Review before authority. It is **not** chapter extraction and no chapter revision should be fabricated.
- Pending/rejected suggestions cannot mutate World Setup accepted facts, entity identities, state transitions or history.
- Author-confirmed WORLD RULE can be authoritative as a rule (not an event). Future scene or victory cannot become a historical event until an actual chapter supports it. Respect locking and historical corrections rather than rewriting accepted events.
- Context serving must carry WORLD SETUP, FUTURE PLAN and historical evidence as separate channels with labels; planned chapter 8 betrayal must not appear as an observed betrayal when writing chapter 3.
- Never store future-plan data in \`narrative.events\` or create fake revision/mention to force a baseline check.
- Auth: per-novel owner/tenant checks; no cross-tenant reads; all writes CAS/version/idempotent; reject stale write instead of silent overwrite.
- Defaults remain **offline** and all LLM/embedding outbound must respect shared quota guard after explicit live approval. No direct Gemini calls from frontend.

## 3. Existing engineering evidence to reuse

- **Plan persistence already exists:** \`StoryPlanRecord\` (\`story_plans\`: \`plan_version\`, \`status\`, \`source_outline\`, hash/idempotency) and \`StoryPlanObjectiveRecord\` (\`story_plan_objectives\`: chapter target, title, description, \`objective_metadata\`, \`intent_version\`).
- **World rules exist:** \`FactRecord\` (\`narrative.facts\`, \`fact_type=world_rule\`, JSONB \`fact_value\`, \`is_locked\`, revision optional); accepted rules enter WritingContext world_rules. However the current Postgres context returns \`author_constraints=()\`, so author constraints need distinct typed readback rather than pretending they are historical facts.
- **P2 current FE:** \`web/src/features/ai-copilot/AuthorMemoryPanel.tsx\` has setup form + manual plan events, but its \`mode:'extract'\` request is ignored by current \`IdeaBootstrapRequest\`; backend \`ManuscriptBootstrapService.start_from_idea\` calls \`_generate_blueprint()\` regardless. \`suggest_events\` is a stub returning \`events:[]\`.
- **P1 reusable mechanics:** proposal group review, entity identity gate, Canon/HITL, Author Writing IDE, immutable revision snapshots, writer lease/CAS, outbox and draft accept/reject/recovery.
- **Known release blocker:** P2 setup baseline has \`baseline_revision_id=null\`; existing backend \`checkStoryBrainActive\` requires nonnull and regular first-chapter autosave misses immutable revision/outbox.
- **PR #72** has active-Brain bootstrap guard + idempotency/reservation and JSON compatibility tests; it also intentionally returns \`422 EXTRACT_NOT_IMPLEMENTED\` for UI extract, so direct merge would make setup nonfunctional. Port reviewable parts and explicitly preserve the transitional state on P2-only branch.
- **Version divergence:** current \`main\` and P1 integration have diverged; do not assume P2 can be built against latest main without a separate reconciliation/rebase plan. Do not modify the P1 demo branch for P2.

## 4. PR roadmap (one independent review gate per PR)

### P2-01 — Bootstrap safety, replay, and contract baseline (Codex first)

**Base:** \`integration/p2-planning-studio\`; create \`codex/p2-01-bootstrap-foundation\`, PR back to P2 integration branch.  
**Scope:** Inspect/port PR #72 selectively; protect active Story Brain before new bootstrap or provider call, exact idempotent replay, race-safe scoped PostgreSQL lifecycle, tenant/auth & unsupported JSON behavior; lock/validate activation with required reviews. Freeze additive DTO documentation including typed \`mode\` and origin contract for P2-02.
**Tests:** real PostgreSQL concurrency and active-Brain, same-key replay, 2 different keys collision, failed job resume, no provider dispatch on rejected bootstrap, manuscript P1 regressions, JSON adapter fail closed.  
**Definition of Done:** no active-to-importing demotion; no destructive writes on bad request; explicit 409/422/503 codes; tests and evidence committed; actual P1 Author flow remains healthy. \`mode=extract\` may remain intentionally unavailable ONLY on nonreleased P2 branch until next PR. No new DB schema unless justified.

### P2-02 — Setup extraction / creative blueprint & World Setup provenance

**Base:** after P2-01 reviewed/merged. \`codex/p2-02-setup-provenance\`.  
**Scope:** Implement \`mode=extract\` explicit-only setup parsing separate from \`mode=blueprint\`; strict request validation for idea, setup, outline, hints, author preferences and constraints. Durable source snapshot/hash/version and authorized readback; separate draft author settings from World Canon. Reviewed independent entity/world-rule proposals; author-declared vs model-proposed clear. Reuse P1 identity reservation/validation, ensure homonyms distinct and reject model hallucinated names; source span checks for extract. Handle author-declared rules without fake chapter revision; keep \`source_type\` accurate and review guarded.
**Tests:** without plan / with plan; outline-only named character not extracted from setup; unsupported extra keys/modes; same-name two identities; empty setup baseline only after explicit author consent; rejected setup no Canon/history; unchanged active Brain.

### P2-03 — Story Plan editing engine & chapter objectives

**Base:** P2-02 interface frozen (may develop backend independently on separate feature branch if no overlapping files). \`codex/p2-03-story-plan-core\`.  
**Scope:** Reuse \`story_plans/story_plan_objectives\` for manual draft/create/list/read/update/activate/replan. Chapter-board stores 5/10/20+ chapters via ordered objectives and metadata (future event cards, goals, character references, dependencies), no fixed 10 cap; support zero objectives while author chooses to skip planning; plan version and expected-version, stable idempotency keys; avoid stale save/activation races. Ensure changes don't mutate \`events\` or approved Canon.
**Tests:** create 5/10/20, reorder, retry same idempotency, concurrent saves, plan switch, deleting future event, no event pollution, planning context current objective vs history, account isolation.
**Decision point:** if existing JSONB metadata lacks necessary identity/versioning semantics, prove invariant and propose smallest additive migration. Do NOT redesign plan schema by default.

### P2-04 — First chapter transition M0→M-FIRST (Codex critical backend)

**Base:** after P2-01 and P2-02; can proceed in parallel with P2-03 if scoped to revision Core. \`codex/p2-04-first-chapter-bridge\`.  
**Scope:** Treat an approved setup baseline with null baseline_revision_id as a legitimate M0, not an inactive Brain. First meaningful author save or accepted AI patch must create real immutable chapter revision via existing writer lease/CAS and emit the existing analysis outbox only when authorized. Reuse P1 entity/review/HITL pipeline; no synthetic revision, no planning event as fact, safe reopen and stale conflict.
**Tests:** M0 has approved setup entities/rules but 0 chapter revisions and no event history; M-FIRST after actual chapter1 save/accept has correct revision + incremental analysis event, proposal accepted only after HITL; stale/double accept, outbox idempotency, pre-baseline save behavior, existing P1 manuscript import unchanged.

### P2-05 — Mounted Author Planning Studio UI (Codex or Gemini after DTO freeze)

**Base:** after P2-02 / P2-03 API contracts frozen; branch \`gemini/p2-05-planning-studio-ui\` or \`codex/p2-05-planning-studio-ui\`, one owner per production FE file.  
**Scope:** Add Planning mode to existing Author IDE shell (not a second editor). UX stages Idea → Worldbuilding Rules → Key Characters → Chapter Board → Write. Keep manual plan first, optional input import/paste, inline cards, author-vs-AI labels, review/edit/reject, autosave/reopen. Plan size selector 5/10/15/20 with \"add chapter\" beyond; chapter target, goal, anticipated events, named participants, outcome. Drag-and-drop optional; accessible move controls mandatory. Show Plan versus Canon as distinct sections and optional-ness of plan. M0 activation and Chapter1 go to existing Writer.
**Browser tests:** 0 / 5 / 10 / 20+ outline, reload/login readback, edit rule/character, plan reordering, status badges, disabled AI-button when not implemented, no fake green success, no stale overwrite.

### P2-06 — AI brainstorming assistance, NOT autonomous writing

**Base:** after reliable manual flow. \`codex/p2-06-ai-brainstorming\` for AI-service/API and optionally a FE follow-on.
**Scope:** Replace stub \`suggest_events\` with explicit structured suggestions for world rules, character seeds and future chapter events, output always \`model_proposed\`, never auto-confirmed. Suggestions constrained by confirmed world rules/known entities/chapter plan, validation & idempotency. Use guarded provider, no direct calls. Initial tests deterministic fake provider; if quota exhausted return visible pending/retry or actionable failure, never silently write Canon. Long-running quota-aware queue/resume is separate hardening task unless tests show manual flows blocked. Do not enable live in this PR.
**Tests:** valid proposal, hallucination grounding, protected notes, failed/malformed output, 429/RPM/TPM/RPD, no auto event creation or Canon mutation, cost ledger mock.

### P2-07 — Integrated system acceptance & hardening

**Base:** exact merged P2 integration SHA, independent QA branch.  
**Mandatory scenarios:**
- S1: one-sentence idea, **no Story Plan**, optional verified setup, author writes chapter1 and enters P1 loop.
- S2: author supplies an **existing plan/outline**; plan remains nonhistorical; readback/edit/replan, M0/M-FIRST.
- S3: manual Planning Studio creates 5, 10 and 20+ chapters, rules and character seeds; reload/login persists; future plan changes never alter Canon.
- S4: identical names for distinct entities, invented model suggestions rejected, source span/hint separation; locked rule persists when context budget tight.
- S5: author plans betrayal at chapter8 but writes up to chapter3; historical events contain no betrayal; written chapter8 contradicts plan and Canon follows actual approved revision.
- S6: two tabs modify plan/Brain concurrently; latest expected version wins, stale request 409; no lost writes/duplicates.
- S7: unrelated novel/account cannot access data; no provider calls in offline; unchanged P1 Author P1 system tests and draft acceptance.
**Verdicts:** P2_M0_READY, P2_M_FIRST_READY, P2_PLANNING_STUDIO_READY only with evidence, otherwise precise PARTIAL/FAIL/NOT_RUN.

## 5. Risk controls

- Do not cherry-pick all of PR72 or change historical migrations; patch conflicts expected because PR72 is older and targets \`main\`.
- Do not touch \`integration/p1-demo-20261109\`, \`main\`, historical P1 QA DB/volumes, or PR72 while implementing on P2.
- **No parallel overlapping code edits** on \`AuthorMemoryPanel.tsx\` / \`author-memory-api.ts\`. Gemini may produce UX mock/contract docs before backend DTO is frozen.
- Keep one source of truth for Author Writing, P1 Canon/HITL, query context; planning is a separate data lane.
- Static review/CI is not real PostgreSQL/browser acceptance. Mark NOT_RUN when hardware/runtime absent; delegate hardware-only validation to Argon.
- No Gemini live calls or billing/quota overrides without fresh operator authorization. A single user UI action can dispatch multiple provider calls.

## 6. Deliverables and PR handoff contract

Every PR must contain:
1. Exact **base/head SHA**, updated design/DTO and change scope.
2. Matrix \`TEST → EXPECTED → ACTUAL → PASS/FAIL/NOT_RUN\` with reproducible commands; fixtures and source snapshots where useful.
3. Risk checklist: auth/tenant, idempotency/races, provenance, Canon/event-history boundary, P1 regression, provider egress.
4. Screenshots/video redacted for FE; real PostgreSQL readbacks when claimed; never raw credentials.
5. Files changed (no scope creep), open issues, migration impact, forward-merge/main reconciliation (if applicable).
6. Verdict \`READY_FOR_REVIEW\` / \`FIX_REQUIRED\` / \`ENV_BLOCKED\`; no self-merge without owner review.

**First Codex deliverable (start now):** \`P2-01 Bootstrap foundation\`, focused port/review of PR72 to exact P1 base, typed DTO design brief for \`extract\`/ \`blueprint\` and separate setup vs plan, tests with fake provider, report and Draft PR targeting \`integration/p2-planning-studio\`. **Stop before P2-02 and ask for review; no merge or provider activation.**

## 7. Reference links

- P2 gap audit: https://github.com/Ephurin/Novel_sharing_platform/blob/integration/p1-demo-20261109/docs/development/p2/P2_00_GAP_AUDIT.md
- Maintained P1/P2/P3 contract v1.4: https://github.com/Ephurin/Novel_sharing_platform/blob/7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3/Pipeline_test/WORKFLOW_CONTRACT.md
- PR72: https://github.com/Ephurin/Novel_sharing_platform/pull/72
- Source schema: \`ai-service/api/schemas.py\`; \`ai-service/application/bootstrap_service.py\`; \`ai-service/infrastructure/orm_models.py\`; \`ai-service/infrastructure/postgres_narrative_repository.py\`; \`backend/src/modules/novels/chapter-revisions.service.ts\`; \`web/src/features/ai-copilot/AuthorMemoryPanel.tsx\`
