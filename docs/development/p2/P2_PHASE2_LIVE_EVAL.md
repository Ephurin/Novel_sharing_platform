# P2 Phase 2 — live LLM evaluation (Gemini free tier)

| Field | Value |
|---|---|
| Source | `integration/p2-planning-studio` @ `1e56fec0` (branch PR #131 targets), plus the two fixes in this branch |
| Model | `gemini-3.5-flash-lite` via the quota gateway (`AI_EXECUTION_MODE=live_free_tier`), no fallback, max concurrency 2, embeddings off |
| Authorization | Owner confirmed in chat on 2026-11-14 that the key's project is free tier with the P1 smoke quotas (15 RPM / 250k TPM / 500 RPD); a new 24 h attestation was written from that confirmation |
| Stack | private local stack `ephurin-p2live` (`Pipeline_test/tools/compose.p1-live-safety.yml` + a git-ignored overlay); only the gateway has egress |
| Usage | 72 provider calls (69 success, 2 upstream failures, 1 stale reservation), ~214k input tokens, **$0.00**; 10 requests refused locally with `RPM_LIMIT_EXCEEDED` |
| Verdict | **`P2_LIVE_PARTIAL`**: the guarded live path works and the memory clearly helps writing, but two P1 defects blocked the default (entity-first) flow and the writer with a real model. Both are fixed here; four more P1/P2 gaps remain open |

Fake-provider CI stays the gating evidence. This run is evaluation only: samples are single runs (n=1), with no blind review.

## Safety checks

| Check | Result |
|---|---|
| Live flags off → AI calls | blocked (`BUDGET_GUARD_DENIED`), ledger 0 calls |
| Gateway live state after restart | stays disabled until an authenticated operator enable (`/api/gateway/emergency/enable`); this step was missing from my first attempt and should be in the runbook |
| Quota | RPM limit enforced (10 local refusals), no provider 429 |
| Plan private notes | not present in writing jobs |
| Shutdown | operator disable + flags false; gateway reports `live_free_tier_enabled: false` |

## Scenarios

| ID | Scenario | Result |
|---|---|---|
| L0 | Setup `extract` with free text; "AI gợi ý ý tưởng & thiết lập" (blueprint) | **FAIL → F-LIVE-01**: `extract_setup_text` / `generate_story_blueprint` exist only in `core/fake_llm.py`; live returns 503 `SETUP_EXTRACT_PROVIDER_UNAVAILABLE`. Manual setup (declarations + rules, no text) works and was used |
| L1 | Brainstorm `all`, target ch.2 (2.6 s, 777 tokens) | PASS with gaps: the future event targets ch.2 and references approved entity IDs; provenance shows the real model. **F-LIVE-02**: "rule" and "character" suggestions only repeat the approved canon |
| L2 | Ch.1 (~170 words) entity candidates (4 calls, ~24 s) | Suggestions are good: 3 known entities linked, 5 new entities found (incl. one ITEM), sentence-initial words rejected. Review burden: **39 rows for 8 real entities** (name fragments and sentence-initial capitals) |
| L3 | Ch.1 event/fact proposals after entity review | **FAIL → F-LIVE-03 (fixed)**: 3/3 attempts failed (extra `importance_score`, missing `quote`, truncation). After the fix: 17 proposals (5 entities, 9 aliases, 3 events) in 3.1 s. Events are grounded with quotes; the key event (deciding to go north) is missing and one location is wrong (F-LIVE-10). **F-LIVE-04**: fragments become aliases (`Lâm`, `Phong`, `Hạ`, `Vy`, `Bích`, `Thủy`) |
| L4 | Ch.2 breaks a world rule (wades into flood water, no jade, keeps all memories); "Kiểm tra nhất quán" | **FAIL → F-LIVE-05**: 0 findings in 50 ms; the check only matches alive/dead phrases and never reads world rules. Extraction stores the violating consequence ("vẫn giữ được ký ức hoàn toàn") without a flag |
| S5 | Active plan: "Hạ Vy phản bội…" at ch.7. Extraction of ch.2 and writing at ch.5 | **PASS**: 0/11 ch.2 proposals contain plan content. The writing context includes the plan (v2), but the draft has no betrayal |
| L5 | Writing "continue" (C2 = with approved memory) vs C0 (no memory), same opening and instruction | **F-LIVE-09 (fixed)**: the cursor-only request sent no chapter text, so 3/3 drafts set the scene at dusk although the opening says night with moonlight. After the fix both keep the night scene. C2 uses the world rule (water takes memories) and the approved entities (Lâm Nguyệt, jade); C0 does not know the rule and invents genre props (a rusty sword, "huyết dịch cổ xưa"). Uplift is visible but n=1 |
| L6 | Background analysis under free-tier RPM | **F-LIVE-06/08**: candidate verification needed retries (ch.2 1 retry; two 2-sentence chapters still failing after 3); retries used RPM so an interactive writing request was refused at once |

## Findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-LIVE-01 | P1 | Setup text extraction and AI blueprint are fake-provider only; with a real model they always return 503 | Open |
| F-LIVE-02 | P2 | Brainstorm rule/character suggestions only repeat approved canon instead of proposing new ideas | Open |
| F-LIVE-03 | P1 | HITL event extraction constrained Gemini to the legacy event schema, but validated a strict schema that requires `quote`: every live extraction failed in the entity-first flow, which is the default since #132 | **Fixed** (`HitlEventBatch` on both sides, `response_schema_for`, tests) |
| F-LIVE-04 | P1 | Accepting suggestions turns name fragments into aliases; the alias `Lâm` was proposed for both Lâm Phong and Lâm Nguyệt | Open |
| F-LIVE-05 | P1 (product) | The consistency check is phrase matching only; it ignores world rules and makes no model call | Open |
| F-LIVE-06 | P2 | Entity candidate verification has 2 attempts per batch, fails intermittently (short chapters repeatedly), and does not log the validation error | Open |
| F-LIVE-07 | P3 | `/ai/writing/generations` with `selection` lacking `start`/`end` returns 400 with a raw Python message | Open |
| F-LIVE-08 | P2 | On free tier, background analysis retries can use the whole RPM budget; interactive writing then fails immediately (no queue/backoff) | Open |
| F-LIVE-09 | P1 | "Viết tiếp" at a cursor sent no preceding chapter text to the model | **Fixed** (preceding text up to 6000 chars, tests) |
| F-LIVE-10 | P3 | Event extraction recall/accuracy: misses the chapter's key decision, wrong location on one event | Open (quality) |

## Fixes in this branch

- `ai-service/core/structured_outputs.py`, `core/llm_service.py`, `application/entity_hitl.py`: the HITL event schema is shared, and `response_schema_for()` picks the constrained schema per operation. Tests: `tests/test_live_structured_schemas.py`.
- `ai-service/application/writing_service.py`: an empty selection sends the text before the cursor (`PRECEDING_CONTEXT_CHARS = 6000`). Tests: `tests/test_writing_preceding_context.py`.
- Both fixes were verified live after a rebuild: 17 proposals instead of a failure, and the night scene is kept.

## Not covered

Embeddings/semantic retrieval (off to save quota), the Memory/IDE UI on the live stack (API-driven, same endpoints), a formal Track B (blind multi-sample A/B), long manuscripts and the rate of 429s from the provider itself (none seen).

## Follow-up: P1 fixes #144–#146 (branch `claude/p2-live-p1-fixes`)

These were verified live on the same stack (19 more calls; the session total is 91 calls, ~286k input tokens, $0.00).

| Issue | Fix | Live result |
|---|---|---|
| #146 (F-LIVE-05) | `services/rule_consistency.py`: the chapter is checked against the effective, author-approved world rules (`rule_consistency` structured operation, schema-constrained). Only violations with a supplied rule ID and an exact chapter quote are kept. `check_consistency` returns `rule_check` (`checked` / `unavailable` / `no_rules`) instead of a silent all-clear; the Memory panel shows when the rule check could not run | Ch.2: 1 `WORLD_RULE_VIOLATION` (flood-memory rule, quoting "Khi lên bờ, Lâm Phong vẫn nhớ rõ mọi chuyện…"), 1.2 s. Control ch.1: 0 findings |
| #145 (F-LIVE-04) | `verification._materializable`: a candidate inside a verified full-name occurrence ("Lâm" in "Lâm Phong") is not proposed as an alias; standalone short-name uses still are | New chapter with "Lâm Phong" ×2 and "Lâm Nguyệt" ×2: no `Lâm`/`Nguyệt` fragment aliases; only "Phong" from "Phong chạm tay…" (a real short-name use) |
| #144 (F-LIVE-01) | `core/setup_extraction.py` + `LLMService.extract_setup_text` / `suggest_setup_blueprint`. The model returns exact names and rule sentences; offsets are computed server-side and non-verbatim items are dropped. The blueprint sends only the idea text and outline. HTML entities that Gemini sometimes returns are decoded | Extract: 6 grounded cards (4 entities, both rules) in 2.1 s. Blueprint: 3 entities and 3 rule suggestions (`model_proposed`); the first run showed `&#xE0;` entities, fixed and rerun clean |

Remaining open: #147, #148, #149, #150. Blueprint wording can contain model typos (flash-lite); the suggestions are labelled `model_proposed` and need author review.

## Follow-up: P2 fixes #147–#149 (branch `claude/p2-live-p2-fixes`)

Covered by offline tests only; not re-run against the live model yet.

| Issue | Fix | Tests |
|---|---|---|
| #147 (F-LIVE-02) | The brainstorm prompt asks for new rules and characters only. The service then drops suggestions that restate an approved rule (same `fact_key`, same normalized text, or ≥ 80% word overlap) or reuse a known entity name or alias, and duplicates within the batch. `provenance.duplicates_removed` counts them; the modal shows "Đã ẩn N gợi ý trùng…" | `test_brainstorm_service.py` (reworded rule, `fact_key`, case-folded name, in-batch duplicate) |
| #148 (F-LIVE-06) | Each failed verification attempt is recorded in the audit (`repair_errors`) and logged with quoted manuscript values removed. After the 2 bounded attempts, valid decisions are kept and only the invalid or missing ones become `unresolved` (never materialized; the author reviews them), listed in `degraded_candidates`. Output that cannot be parsed still fails, now with the reason | `test_entity_verification_salvage.py` |
| #149 (F-LIVE-08) | ai-service marks every gateway call with `X-Request-Priority`: writing drafts, brainstorm, setup extract/blueprint and the rule check are `interactive`; analysis is `background`. Background calls cannot use the RPM slots kept for interactive calls (default `max(1, effective_rpm // 5)`, 2 of 13 on free tier) or the last concurrency slot; unmarked callers keep the full limits. Gateway 429s carry `retry_after`. An interactive call waits up to `INTERACTIVE_RATE_LIMIT_MAX_WAIT_SECONDS` (20 s) and retries; if it still fails, the writing job returns `AI_RATE_LIMITED` with an author-facing "busy, retry in N s" message. Outbox retries after a rate-limit failure wait at least 60 s | `Pipeline_test/tests/test_p2_interactive_priority.py`, `backend/src/jobs/outbox-processor.test.ts` |

Remaining open: #150 (P3), #138 (post-P2).

## Follow-up: multi-key free-tier pool (branch `claude/p2-live-key-pool`)

The owner has 4 keys, each from a separate free-tier Google project with its own limits. On 2026-11-14 the owner confirmed in chat that all 4 projects are free tier with no billing and the P1 smoke quotas, acknowledged Google's terms, and approved a live check.

**How it works**
- `Pipeline_test/tools/quota_key_pool.py` gives each key its own durable `FreeTierQuotaLedger` (own state file `*.kN.json`, own attestation). It exposes the single-ledger interface.
- A call is admitted on the key with the most RPM room. When the provider returns 429, that key cools down for `Retry-After` (default 60 s) and the call moves to the next key.
- The #149 interactive reserve applies per key.
- Gateway option `--upstream-api-keys-file` / `UPSTREAM_API_KEYS_FILE`: one key per line, `#` comments. The attestation file can then be a list with one entry per key.
- One key keeps the old single-ledger behaviour.
- Summaries and logs show key slots (1–4) and project fingerprints, never key values.

**Live check** (gemini-3.5-flash-lite, 29 calls, $0.00, no provider 429)

| Check | Result |
|---|---|
| 2 tiny calls per key | 8/8 OK; every key valid, each slot used twice |
| Burst of 20 calls, 4 parallel, mixed interactive/background | 20/20 OK in 4.3 s, spread evenly (7/7/7/7 calls in the window). A single key allows 13 per minute |
| Brainstorm #147 on the eval novel (2 approved rules, 8 entities) | 2 new rules extending the lore, 1 new character, 1 event at ch.8. None repeats approved canon (`duplicates_removed: 0`, the prompt alone was enough this time) |

**Offline tests:** `Pipeline_test/tests/test_p2_key_pool.py` (12 tests) covers the ledger per key, even spread, the daily limit only when every key is out, cooldown/failover on provider 429, the single-key fallback and CLI initialization. The existing free-tier, live-safety and #149 suites pass (83).

## Live round 2: manuscript import with the 4-key pool (2026-11-14)

Fixture `PT-CV-001` "Thành phố giữ lại tiếng mưa", 5 chapters, 4,747 words (574–1,216 per chapter), entity-first mode (default). It is the only multi-chapter Vietnamese manuscript in the repo; the 61-chapter Aethelgard source is not on this machine. 114 calls, $0.00, no local or provider denials.

**Calls and time per chapter**

| Stage | Calls | Notes |
|---|---|---|
| Entity stage (discovery + verification) | 39 for 5 chapters (11 / 8 / 8 / 10 / 2) | ≈ 8 calls per 1,000 words; 69–167 candidates per chapter; 2 repairs, both fixed on attempt 2, none degraded |
| Event/fact stage (`continue` after entity review) | 19 for 5 chapters (3–6 each) | 110 proposals: 71 entity, 29 fact, 10 event |
| Wall time | 3.5 min for the entity stage | latency-bound (one call at a time, ~6–7 s each); no RPM waits with 4 keys |

So a chapter costs about 12 calls per 1,000 words, roughly twice the earlier estimate (a 2,500-word chapter ≈ 25–30 calls). A 50-chapter, 2,500-word manuscript ≈ 1,300–1,500 calls and ≈ 1.5–2 h, which fits the 4-key daily quota (≈ 1,800) but not a single key (450).

**Findings**

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-LIVE-11 | P1 | Entity discovery used the plain 512-token text call with no JSON schema. On a 1,216-word chapter the name list was cut mid-JSON and the whole import job failed at chapter 2 ("model output is not valid JSON"). The prompt example was also mojibake | **Fixed** in `claude/p2-live-discovery-fix`: schema-constrained `entity_discovery` structured call (8,192-token budget), prompt fixed, and a failed discovery for one chunk is recorded in the audit (`discovery_errors`) instead of failing the chapter. Rerun: 5/5 chapters analysed |
| F-LIVE-12 | P1 | A multi-chapter import cannot be completed in entity-first mode. All chapters are analysed against brain v1 and every proposal stores that version. Accepting one chapter's proposals moves the brain to v2, and then (a) the other chapters' entity reviews and refreshes return `CHECKPOINT_CONFLICT` ("Canon changed; start a new analysis") and (b) their already-produced proposal groups return `BRAIN_VERSION_CONFLICT` (`accept_proposal_group` requires every proposal's `expected_brain_version` to equal the current version). Tried both orders: chapter by chapter (stuck at chapter 2) and review-all-then-accept (1 of 5 groups accepted, 93 proposals stuck). The baseline can never be activated for more than one chapter | Open |
| F-LIVE-13 | P2 | Chapters are reviewed independently, so the same character becomes a new provisional identity in each chapter (71 entity proposals for 5 chapters; 0 candidates linked to a known entity). Linking needs earlier chapters accepted first, which F-LIVE-12 blocks | Open |
| F-LIVE-14 | P3 | Review burden: 69–167 candidates per chapter, of which 46–115 are "not entity" | Open (quality) |

Not covered in this round: #149 (interactive writing during background analysis) and the cross-chapter consistency check, both blocked behind F-LIVE-12.

## Sequential manuscript import (branch `claude/p2-live-sequential-import`, fixes F-LIVE-12/13)

In entity-first mode the bootstrap job now analyses one chapter, pauses (`status: waiting_entity_review`, `stage: chapter_review`, `result.awaiting_chapter`), and analyses the next chapter only after the author has settled the paused one. Settled means no open entity review and no pending proposal from that chapter's run.
- `POST /jobs/{id}/resume` returns 409 `BOOTSTRAP_CHAPTER_REVIEW_PENDING` until the chapter is settled.
- The import page shows the paused chapter, the steps (confirm characters in Memory → Chờ duyệt, accept the chapter's proposals) and a "Phân tích chương tiếp theo" button.
- Each chapter is therefore analysed against the newest canon: its proposals carry the current brain version, and its characters link to the ones already approved.

Two defects surfaced on the way and are fixed in the same branch:
- **F-LIVE-15 (P2):** a single transient upstream 503 failed the whole import. The LLM client now retries upstream 5xx and provider timeouts twice (4 s, 10 s). Auth errors (401/403) and quota denials are not retried.
- **F-LIVE-16 (P1):** once later chapters link to known entities, they can propose an alias that is already approved. Accepting it raised `UniqueViolation` (`uq_entity_alias_normalized`, HTTP 500). Accepting an alias that already exists for the same entity is now a no-op.

**Live result** (same 5-chapter fixture, author accepts the machine's suggestions and rejects unresolved candidates; 84 calls, no denials)

| Chapter | Analysis + continue calls | Candidates | Linked to known entities | Proposals (entity / alias / fact / event) | Accepted |
|---|---|---|---|---|---|
| 1 | 6 + 5 (after one resume on a provider 503) | 168 | 0 | 24 / 0 / 3 / 3 | 30/30 |
| 2 | 8 + 3 | 144 | 34 | 6 / 1 / 5 / 1 | 13/13 |
| 3 | 9 + 4 | 138 | 47 | 0 / 1 / 2 / 2 | 5/5 (after the alias fix) |
| 4 | 9 + 5 | 125 (7 unresolved) | 40 | 2 / 1 / 6 / 3 | 12/12 |
| 5 | 5 + 4 | 74 (3 unresolved) | 26 | 0 / 1 / 9 / 2 | 12/12 |

Baseline activated: **32 entities, 11 events, 0 pending**, brain v6. Before the change, 71 entity proposals were produced, 0 were linked, and only 1 of 5 chapters could be accepted.

Cost: about 11–14 calls per 1,000 words including the event stage, and 45–65 s of model time per chapter. Review burden is still high: 74–168 candidates per chapter, mostly "not entity" (F-LIVE-14).

### Live round 3: import page in the browser, #149, consistency (26 calls, no denials)

| Check | Result |
|---|---|
| Import page while a chapter is paused | Shows "Chương 1/5 đang chờ bạn duyệt", the steps and "Phân tích chương tiếp theo". **Bug found and fixed**: the activate button stayed visible because Tailwind `flex` overrode the `hidden` attribute; it is now rendered only in `waiting_review` |
| "Phân tích chương tiếp theo" before the chapter is settled | `POST /jobs/{id}/resume` → 409; the page shows the Vietnamese "Chương này chưa duyệt xong…" message |
| Same button after the chapter is settled | Job resumes and analyses chapter 2; the page updates to "Chương 2/5 đang chờ bạn duyệt" without a reload (5 s polling) |
| #149: "Viết tiếp" while chapter 2 is analysed in the background | Completed in 4 s, validation passed, draft uses the approved character "Duy" |
| Consistency check on the imported novel | Runs (466 ms) but returns `rule_check: no_rules` |

New findings:

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-LIVE-17 | P2 | Manuscript import never creates world rules from prose. `extract_world_rules` only extracts narrative facts (entity-first path) or lines that start with "Luật:" (legacy path), so an imported novel has 0 world rules and the rule-based consistency check has nothing to check until the author adds rules | Open |
| F-LIVE-18 | P2 | Identity variants become separate entities: "Hòa" / "ông Hòa" / "Ông Hòa" / "Ông tên Hòa", "Mai" / "Mai Linh" / "Chị Mai Linh", "CV-04" / "mã CV-04". Verification keeps honorifics and descriptive phrases in canonical names and rarely proposes them as aliases. Partly amplified by the simulated author, who accepted every suggestion without merging | Open |
