# P3 — Mandatory 100,000-word Novel Acceptance & Comparative Evaluation Protocol

**Status:** evaluation protocol for **new runs under WORKFLOW_CONTRACT.md v1.4 (2026-10-21)**. This document sets up tests; it does not assert any results.  
**Gate order:** P1 S01–S11 LIVE_UI → P2 idea→first saved chapter → P3 functional controller probe (with and without plan) → **P3_HITL_CONTROLLER_100K terminal run**. STOP at any blocker; **no provider calls without a fresh time-limited owner authorization**. Existing expired Wave 1A authorization is not renewed by this document.

## 1. Primary P3 acceptance: P3_HITL_CONTROLLER_100K

The user requires the 100,000-word final novel to be a **mandatory proof artifact for P3**, not an optional afterthought. The primary run uses source-backed baseline and the current Human Entity Review mechanism:

- Isolated run/novel, tested code/config/model SHA, fixture source hashes and **recorded** preapproved provider call/money/deadline budgets.
- Same fictional seed/canon/source as the declared control, fixed evaluation rubric, no rewriting frozen gold after observing generation.
- P3 controller performs objective progression, generation and **save/accept into canonical draft revisions**. A test observer may perform only the contractually required **entity occurrence approval** at `waiting_for_entity_review`; all human decisions count as interventions. If author inserts/replaces prose manually, it becomes an **assisted-rescue or hybrid** run, with a separate verdict (and revised attribution), not a zero-prose-intervention controller PASS.
- Controller waits for actual downstream analysis and canon completion for the correct revision; no advancing objective on `outbox COMPLETED` alone, no generation retry to bypass the human checkpoint, no unapproved publish, no silent repair of persisted narrative history.
- Final narrative read back from **immutable canonical revisions**; count **100,000 to 105,000 inclusive** using the existing NFC/whitespace-counter (`Pipeline_test/tools/task_tool.py`). Count actual accepted chapter **body** and valid narrative prose, not rejected drafts, summaries, outlines, duplicated filler, report metadata or prompt echoes.
- Full beginning/development/climax/resolution/payoffs; independently read and review all chapters. Satisfying word count, controller terminal flag or plan completion **alone is not PASS**.

**Claim wording:** `P3_HITL_CONTROLLER_100K_COMPLETED_WITH_<VERDICT>`. Do not claim `fully_autonomous`. The distinct `P3_UNATTENDED_AUTONOMOUS_100K` remains outside mandatory execution until a versioned author-approved auto entity/canon policy exists and its separate run proves zero human-content interventions.

## 2. Functional readiness gates

| Gate | Test | Required evidence | Stop when |
|---|---|---|---|
| P1 | S01–S11 UI author journey, provider-backed | Actual browser trace/screenshots and persisted IDs/hashes; raw extraction and author review; M0/M-FIRST | UI write is bypassed by API, entity checkpoint fails, source/canon drift |
| P2 | Setup `mode=extract` and first chapter | Explicit setup propositions, separate review/baseline, initial revision, M0/M-FIRST | Blueprint creativity used as setup extraction or future event marked occurred |
| P3 probe | With/without plan, multi objective, retry/stop/restart, HITL | Controller state, source revisions, guard and downstream proof, no publish | Memory incomplete but objective advanced; duplicate generation/accept |
| P3 100k | Complete novel on new project/run | Final exported prose/revision manifest, 100–105k counter, all due audits, objective and ending evidence, independent blind review | Cost/time limit, context/canon leak, hard quality failure, content/word goal unmet |

Each gate's verdict is independent: PASS, FAIL, BLOCKED, PARTIAL, NOT_RUN or NOT_ASSESSED. This protocol never retroactively relabels the original 95–105k assisted task.

## 3. Controlled comparison design for instructor evidence

**Goal:** measure whether source-grounded narrative memory, retrieval and controller coordination improve long-form continuity and completion. **Do not assert superiority before results.**

Proposed minimum arms:

| Arm | Capability | Intervention policy | Interpretation |
|---|---|---|---|
| **E — Ephurin P3 HITL** | Canon entities/events/state + retrieval + P3 controller; author entity gates | Prescribed, measured human entity-review decisions, no prose editing | Primary terminal artifact |
| **C1 — Memory-light baseline** | Same available generation model and as similar prompt/context envelope as feasible, without structured Story Brain (or with explicitly disabled memory) | Match or separately disclose human assistance; otherwise cannot attribute outcome solely to architecture | Isolates long-range-memory contribution imperfectly |
| **C2 — Comparable external system** (optional, only if actually available and authorized) | Document supported features, provider/model/version and API UI limitations | Measure differences, not presume parity | Contextual reference, not a controlled proof unless conditions match |

Record study preregistration BEFORE runs: seed SHA, start canon, story outline availability, model ID/provider/version and effective output limits, prompt strategy, sampling settings, available input tokens, maximum calls/spend/duration, available UI/automation features, intervention rules, stopping rules, rubric/gold version and blind evaluation procedure.

**Confounds:** if control uses a different model, cannot disable all structured memory, has different context size or human reviewer policy, report this in the comparison table. Do not attribute the entire observed difference to RAG or "agentic architecture" without isolating those variables.

Use the same normalized word-count method and chapter cutoff rules for all arms. Record completion/failure and exact reasons, not only the best successful example. If capped budget prevents an arm from finishing, note censored outcome and compare progress under equal resource window rather than labeling the run unfairly.

## 4. Metrics and evidence schema

### Operational
- `tested_sha`, `run_id`, `pipeline_version`, `provider/model requested`, `effective observed`, `fixture_sha`, `gold_sha`.
- Provider **attempts incl. retries/failures**, token in/out, unknown usage, estimated versus billed cost (if verified), latency count/median/p95, elapsed wall-clock, background worker calls.
- Accepted/rejected draft counts; retry/timeout/provider error rates; outstanding outboxes; duplicate/no-op save and stale prevention outcomes.
- Human entity review count, accepted/rejected/corrected candidates, author-declared entities, time to intervene, interventions to correct memory vs prose; manually changed prose attributed separately.
- Output words/chapter, total count, number of *complete* narrative chapters, ending status, source revision and hash readback, clean resume from mid-run.

### Narrative memory (must audit at all due milestones)
- **M0** after bootstrap, **M-FIRST** after first accepted new revision, **every 10 complete chapters**, deep audits at **20/50 if reached**, **M-FINAL**.
- Raw LLM decisions **before human correction**, distinct from post-review canon and *actual generation* packed context. **35 narrative assertions are NOT entity/alias gold**; maintain separate mention/alias/false merge gold.
- Sample recall ≥90%, precision ≥95%, 100% critical recall/provenance accuracy, zero forbidden future leak/stale current state according to `EVALUATION.md`. Report numerator/denominator, uncertainty, missing/false items and source links.
- Entity/alias precision, entity candidate recall, homonym false merge, uncertainty labels, planned future vs occurred history, source hash/temporal cutoff.

### Full-book literary quality and independent review
- Reviewer(s) who did not generate the prose read the **entire manuscript** blind to arm/score when feasible; score the seven 0–4 rubric dimensions with chapter/revision citations, including hard gates (continuity, POV, plot payoff, credible resolution, nonrepetition, fidelity to supplied canon).
- At least two precise citations per rubric dimension; assess both critical failures and counterexamples. Report `SELF_REVIEW_ONLY` if no independent reviewer actually read entire manuscript; do not write "independent PASS" from random excerpt inspection.
- Freeze sample set and scoring rubric before reviewing outputs, compute inter-reviewer disagreement when 2+ qualified reviewers exist; never retroactively rewrite gold.

## 5. Reproducibility and protected data

- Separate new project/stack/database for each arm. `main`, `UI`, and existing `Pipeline_test/runs/*` / old Docker resources remain untouched. Test source and result commits only to `codex/ai-copilot-pipeline-test`.
- All author actions P1/controlled UI are browser-driven and read back via read-only API; a program creating screenshots/manifests without a browser does not constitute `LIVE_UI`. API mutation control arm evidence must carry `LIVE_API` and cannot substitute UI-coverage PASS.
- Version and store: `run_config.json`, `checkpoint.json`, `actions.csv`, `interventions.csv`, `issues.csv`, `revision_manifest.csv`, `memory_items.csv`, `memory_checkpoints.csv`, `memory_probes.csv`, final chapter files, `novel.md`, counts and reviewer reports. Strip secrets and sensitive headers. Separate code SHA, schema revisions, provider trace and source fixture hashes.
- Once a run or budget window expires, do not reset it to manufacture a new 2h authorization or delete old results. A new run/arm needs separate approved authorization and true isolated resources.

## 6. Verdict

Overall P3 full-book PASS requires **artifact completion + P3 controller functionality + narrative memory critical gates + appropriate UI provenance + quality review + independently verified review scope**, with level of automation stated precisely. Report separate independent axes from `EVALUATION.md`; do not collapse them into a single unqualified “AI superior” badge. A complete output with serious unresolved memory issues is `COMPLETED_WITH_ISSUES` or `PARTIAL`, never `COMPLETED_WITH_ACCEPTANCE`.

**Current status at writing:** P1 live not accepted; P2/P3/100k not yet run as staged v1.4 acceptance. This file authorizes **no new provider requests**.
