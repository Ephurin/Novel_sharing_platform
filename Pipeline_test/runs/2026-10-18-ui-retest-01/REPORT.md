# UI retest 2026-10-18-ui-retest-01 — current checkpoint

**Development follow-up:** S03 repairs deployed to the isolated stack on 2026-10-18.
See [memory-repair/REPORT.md](../2026-10-18-memory-repair/REPORT.md) for changes,
verification and resume instructions. Existing queue/gold were preserved. The test
verdict below remains valid until live UI and extraction are retested.

**PARTIAL / BLOCKED tại S03. P1 chưa đạt; P2/P3 và bài dài NOT_RUN.**
Historical preflight report is preserved in `evidence/before-live-consolidation/REPORT.md`;
previous evidence was not deleted. This update supersedes its UI-not-started status.

## Environment and scope

Isolated stack ephurin-ui-retest: web localhost:18080, backend localhost:14000/api/v1,
AI localhost:18000. Migration 0009, pgvector 0.8.6 and source/runtime fingerprints:
`evidence/rollout-preflight.json`, `rollout-runtime.json`, `ui-resume-preflight.json`.
Source HEAD 390b09fd043ec29db84519a9d195b59b76eec003 plus existing dirty repairs;
fingerprints identify deployed files. Fixture PT-CV-001 v1.0.0 verified unchanged.
No product code/DB modification by testing agent. Old demo stack/data untouched.

Explicit user consent covers manuscript/blueprint/generated prose sent to Google Gemini;
budget unlimited subject to 15 RPM / 250K TPM / 500 RPD per independent key.
Actual observed model models/gemini-3.5-flash-lite, structured output limit 8192.
27 captured structured responses: 21,901 prompt + 7,572 candidate = 29,473 tokens.
All captured finish reasons STOP. Cost unavailable; four-key fallback NOT_VERIFIED.
No prose generation call; no claim of real prose smoke success. No observed 429 in retained evidence.
See `evidence/provider-usage-summary.json`; raw response text is not logged, so trace
hashes and parsed proposals do not establish a full independent raw-LLM-text quality review.

## Actual author journey

Novel `06a979c5-b089-4648-a04e-81383aa7b119`, title
“Thành phố giữ lại tiếng mưa — UI retest 2026-10-18-01”, account reader03.

| Step | Verdict | Evidence / actual result |
|---|---|---|
| S01 | PASS | UI-created project; ch1 editor, ch2–5 bulk paste; automatic import extraction disabled. Five readback bodies match fixture after title/outer-trim conversion. Five revisions/hash bindings, 4,747 words, all drafts. |
| S02 | PASS with issues | Explicit UI extraction, real Gemini. Natural event schema failures at ch2 then ch4 (`consequences` string instead of list). Two UI retries, same job/revisions, completed 5/5 awaiting review; no duplicated revisions. |
| S03 | BLOCKED | Raw 93 proposals preserved before correction. Rejected false “máy phát” item and scan event incorrectly located at trạm Bốn. Approved only 26 checked ch2 entities. Missing critical state/facts and no suitable repair UI; baseline remains importing, not activated. |
| S04 | BLOCKED, partial coverage | After UI relogin/reload, four memory tabs inspected and saved. v2 and 65 pending persist; three approved characters display Unknown/Unknown; events empty. Actual AI writing context NOT_RUN. |
| S05–S11 | NOT_RUN | Baseline prerequisite blocked. No plan, new writing, incremental save, injected contradiction or continuing-writing claim. |

Job `1f60955d-c43a-519c-83b6-2dd4be904491`; brain
`4e798e6e-ebd0-4d1a-87ca-e55e4a97eaee`, version 1 → 2.
Raw: 79 entity, 13 event, one relationship transition. Current decisions:
26 accepted, two rejected, 65 pending. Official: 26 entities, zero events/facts/transitions.
Before any approval official entities/events/facts/transitions were zero: ordinary
mode author gate observed for this bootstrap; this does not prove full-auto gating.

A browser approval-review quota failure interrupted prior tab inspection. Same supported
browser became available in this continuation; it is no longer the active blocker.
An expired product token was observed and captured, reload led to login, and UI login
restored the same project/queue. No API login or alternate control bypass was used.

## Gate failure and narrative audit

See `MEMORY_AUDIT.md`, frozen 35-item gold, raw snapshots, `memory_items.csv` and
`evidence/memory/P1-M0/provenance-span-review.json`. Key missing facts include:
Lâm dead in old flood; Duy left-ear deafness; CV-04 one scan; spectral degradation
and proposed three-scan conservation limit. Named entities alone do not represent them.
Four named-entity evidence spans end/start inside another word; source hashes match
but semantic provenance fails. State relationship UI renders `[object Object]`.
Inspected review UI permits name / event summary / participants edits and rejection;
no suitable critical fact/status/span repair control is available there. Setup offers
extraction from saved chapters or idea, not a fact editor. Using idea input to inject
canon would change the tested source and would not establish correct prose extraction.

Per AGENT_GUIDE section 3.6, missing critical facts must be repaired through an author
feature, or recorded as a gap if absent. No DB/API/code repair or forced approval used.
Baseline deliberately remains incomplete rather than recording a false acceptance.

## P1/P2/P3, literary quality and intervention

| Scope | Verdict |
|---|---|
| P1 UI workflow | BLOCKED at S03; raw memory audit FAIL for critical omissions/provenance |
| P2 rough idea | NOT_RUN, conditional on P1 PASS |
| P3 full auto with/without plan | NOT_RUN, conditional on short loops PASS |
| Stop/resume/extraction failure | Bootstrap UI retry/relogin observed; autonomous stop/resume NOT_RUN |
| Anti-duplicate writing / no auto-publication | Writing/full auto NOT_RUN; five imported chapters remain drafts; no publish action |
| Long novel 95,000–105,000 words | NOT_RUN; unchanged 100,000-word target |
| Generated literary quality | NOT_ASSESSED: zero new generated prose, zero finished novel |

All five seed chapters were read for source comparison and memory review: 1–4 complete
seed chapters, 5 partial. They contain restrained limited-POV investigation, concrete
sound/water imagery, family tension and deliberate uncertainty; these are fixture
observations, not evidence of model literary quality, completed payoff or 100k coherence.
Do not score the seed as a newly authored novel. Product-readback exports:
`final/chapters/`, `final/novel-partial.md`, 4,747 words total (4.747% of 100k).
No repetitive filler/summary added. No publication.

Interventions: fixture copy/import, two extraction UI retries, two proposal rejections,
one group approval of 26 entities, UI relogin. Zero newly handwritten or edited prose
words, zero AI prose accept/reject cycles. API GETs and read-only scoped SQL only
verify persistence; SQL diagnostics use transaction_read_only=on and are declared
separately, never counted as UI operations. `read_ui_diagnostics.py` and offline
`consolidate_checkpoint.py` are run artifacts, not product patches.

## Resume

Retain this project/queue and all pre-correction snapshots. A separate development
change must address critical fact/state extraction, evidence anchoring and inspectable
author repair controls. Retest the repaired UI against original gold; first read live
queue/revisions before deciding actions. Finish S03/P1-M0, then S04 and S05–S11.
Only after short loops pass proceed to P2/P3 then the long task. No new consent or
budget approval is needed for the already authorized test payload/destination.
M-FIRST and 10/20/30/40/final-long audits have NO COVERAGE. Milestone 50 is not reached;
it would not apply to a novel ending at the planned 40 chapters. No completed flag
is treated as proof of success.
