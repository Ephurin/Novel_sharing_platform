# P2-06B — AI Brainstorming UI Handoff

- **Task:** P2-06B AI Brainstorming UI (Interactive brainstorming assistant for World Rules, Characters, and Future Events within Planning Studio)
- **Baseline:** HEAD of `integration/p2-planning-studio` after PR #126 merge (`f1ed34cd76582e8a1d641ef54fe57f28523e2114`)
- **Branch:** `gemini/p2-06b-ai-brainstorming-ui`
- **Target:** `integration/p2-planning-studio` (Draft PR, do **NOT** merge)
- **Reviewer:** GPT-6 Review Team

---

## 1. Executive Summary & Design Compliance

P2-06B seamlessly brings AI brainstorming capabilities into the author's Planning Studio IDE. Authors can prompt the AI assistant for creative seeds across **World Rules**, **Character Identities**, and **Future Chapter Events**, while strictly retaining 100% human-in-the-loop control over what enters their project.

### Core Architecture & Invariants:
1. **Draft-Only Invariant (Zero Canon Mutation):**
   - AI suggestions are always returned with explicit status `model_proposed` and origin `model_proposed`.
   - Suggestions are NEVER directly written to Canon tables (`facts`, `narrative_events`).
   - Selecting / adopting suggestions ("Chọn dùng vào bản nháp") ONLY injects structured content into the author's local editable drafts (`usePlanningDraft`), setting `dirty = true`.
   - Never triggers M0 activation or bypasses existing post-M0 amendment controls (UX-05).
2. **Inline Editing & Full Author Agency:**
   - Suggestion cards render with distinct `AI đề xuất (model_proposed)` and `Chưa vào Canon` badges.
   - Authors can modify suggestion texts, character names/descriptions, or chapter numbers directly on the cards before adopting or dismissing them.
   - Individual suggestions can be dismissed ("Bỏ qua") or cleared in bulk ("Bỏ tất cả gợi ý").
3. **Resilience, Concurrency & Idempotency:**
   - Every request is guarded with a unique client `idempotency_key`.
   - In case of 429 (Rate Limit), 502 (Provider Error), or 503 (Store/Lease Unavailable), the UI provides an actionable "Thử lại an toàn" (Safe Retry) button reusing the exact same idempotency key and request payload.
   - Existing author drafts in `SetupFoundationPanel` and `StoryPlanEditor` remain completely intact during and after brainstorming operations.
4. **Device-Local Draft Persistence:**
   - Reuses `usePlanningDraft` backed by `localStorage` (with graceful fallback to in-memory store).
   - Adopted content safely survives browser refresh, navigation between planning steps, and application restarts.
5. **Privacy & Protected Notes:**
   - Author private notes (`private_notes`, `private_author_notes`) are strictly quarantined and never included in outbound brainstorming requests.

---

## 2. File Changes Overview

| File | Change Description |
|---|---|
| `web/src/features/ai-copilot/brainstorm-api.ts` | **New file:** Fully typed API client and DTO contracts for `brainstorm-v1` (`BrainstormRequest`, `BrainstormResponse`, `ProposedWorldRule`, `ProposedCharacter`, `ProposedFutureEvent`, `requestBrainstorm`). |
| `web/src/features/ai-copilot/BrainstormingModal.tsx` | **New file:** Interactive modal component providing scope selection (`all`, `world_rules`, `characters`, `future_events`), instruction input, inline editable suggestion cards, safe retry, draft adoption, and dismissal. |
| `web/src/features/ai-copilot/SetupFoundationPanel.tsx` | Integrated `BrainstormingModal` for World Rules and Characters: replaced legacy disabled button at line 48 with functional AI suggestion trigger, added contextual triggers for rules and characters, wiring adopted items into local draft via `local.edit(...)`. |
| `web/src/features/ai-copilot/StoryPlanEditor.tsx` | Integrated `BrainstormingModal` for Future Chapter Events: added contextual brainstorming triggers on chapter objectives and plan toolbar, adopting suggested events into active chapter objectives via `events(...)`. |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | **New file:** Full end-to-end browser regression test suite (7 scenarios covering launch, inline editing, draft adoption, dismissal, persistence across reload, error handling & safe retry, and zero Canon mutation invariant). |

---

## 3. Verification Matrix

| Suite / Test File | Scope | Invariant / Focus Area | Result |
|---|---|---|---|
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 1 | Modal launch, scope selection (`all`), `model_proposed` and `Chưa vào Canon` badges | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 2 | Inline editing on cards & adopting into Setup draft (rules & characters), `dirty = true` | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 3 | Brainstorm future events & adopt into chapter objective | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 4 | Suggestion dismissal (single item and dismiss-all) | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 5 | Draft persistence across page reload (`localStorage` / `usePlanningDraft`) | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 6 | Network error handling (429/503) & Safe Retry with identical Idempotency-Key | **PASS** (100%) |
| `web/tests/p2-06b-brainstorming.browser.test.mjs` | Scenario 7 | Zero Canon mutation, zero `/narrative_events`, zero `/facts`, zero M0 activation, no private notes leakage | **PASS** (100%) |
| `web/tests/p2-07f-ux05-world-amendment.browser.test.mjs` | Regression | Full UX-05 World Rule Amendment Manager regression suite | **PASS** (100%) |
| `web/tests/p2-07a-ux01-ux04-regression.browser.test.mjs` | Regression | Mobile sidebar (UX-01) & zero-chapter empty state (UX-04) | **PASS** (100%) |
| `backend/src/modules/ai/ai-gateway.test.ts` | Backend Gateway | 14 test cases including P2-06A brainstorming forwarding & novel ownership | **PASS** (14/14) |
| `ai-service/tests/test_brainstorm_service.py` | Python AI Service | 29 test cases covering lease heartbeat, crash recovery, fail-closed ownership, and fake LLM | **PASS** (29/29) |
| `npm --prefix web run build` | Frontend Build | TypeScript check (`tsc -b`) and Vite production bundle | **PASS** (Exit 0) |

---

## 4. Invariant Checklist

- [x] **Zero Canon Mutation:** Brainstorming never writes to `narrative_events` or `facts`.
- [x] **No Auto-M0:** Brainstorming never activates Story Brain M0.
- [x] **Draft-Only Adoption:** Adopting suggestions only mutates client-side drafts (`usePlanningDraft`), requiring deliberate author submission.
- [x] **Post-M0 Protection:** Post-M0 rules continue to require formal amendment proposals (UX-05).
- [x] **Zero Provider Leakage:** Private notes are stripped from provider prompts.
- [x] **Safe Retry:** 429/502/503 errors preserve author drafts and retry with identical idempotency keys.
- [x] **Fake Providers Only:** Tested with `LLM_PROVIDER=fake`, zero live external API calls.
