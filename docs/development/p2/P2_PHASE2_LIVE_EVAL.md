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
