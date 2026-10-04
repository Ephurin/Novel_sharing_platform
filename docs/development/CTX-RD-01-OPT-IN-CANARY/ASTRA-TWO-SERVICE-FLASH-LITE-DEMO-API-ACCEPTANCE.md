# Astra — Two-service Flash-Lite demo API smoke acceptance / PR #36

## Verdict

**TWO_SERVICE_FLASH_LITE_DEMO_API_SMOKE_ACCEPTED_WITH_QUALIFICATION. PR #36 MERGED.**

The chosen `gemini-3.5-flash-lite` model addresses the user's **practical interactive-demo API allowance constraint**, not literary quality. This is a successful bounded **application-API** demonstration, not a browser UI, sustained availability or high-concurrency acceptance test.

- PR: https://github.com/Ephurin/Novel_sharing_platform/pull/36
- Merge SHA: `10f9bd7b07329fff70d3bcda52a8e41ccc95f8b4`
- Reviewed head: `83cb395bad29b2b55a12866edd7cb66b8cd9607f`
- Local live-tested code: `c3dd37c7ef6bcaa76922ac810cb2a15b92770619`
- Direct-child evidence: `b849bb434bebb61683e7f85d8005a3b3dc3ba782` (only `docs/development/CTX-RD-01-OPT-IN-CANARY/two-service-flash-lite-demo-smoke.json`)
- Original execution handoff: `01fb6fd64a0f7b022ee7eec1ff3a36bd773f0a49`, followed by documentation/scope correction `83cb395bad29b2b55a12866edd7cb66b8cd9607f`.

## Live application evidence (bounded)

The branch reports a real local Docker Compose environment using the opt-in `docker-compose.flash-lite-demo.yml`, a disposable PostgreSQL 16/pgvector DB, MongoDB 7, `gemini-3.5-flash-lite` configured on both the Python AI service and Node backend, and `legacy-v1` context routing.

| Real application path | Attempts / completed | Recorded latency | Output |
| --- | --- | --- | --- |
| Backend `POST /api/v1/ai/copilot/suggestions` | 2/2; HTTP 200 | 2,418.73 ms; 2,501.97 ms | 888 and 993 characters |
| AI-writing `POST /api/v1/ai/writing/generations` → job GET | 2/2; completed jobs | 2,095.56 ms; 2,091.06 ms | 535 and 516-character patches |

Summary: **4/4 successful app-level attempts**, mean reported latency 2,276.83 ms, no recorded 429/503 failures or silent 3.8 fallback. Application-level model identities are recorded as `gemini-3.5-flash-lite`; the Python service reports the SDK model `models/gemini-3.5-flash-lite`. These metrics are **reported by the local app/runner**, not separately verified Google HTTP/billing logs. A four-request sample cannot establish provider reliability, remaining key-specific RPD or simultaneous-user capacity.

**Evidence boundary:** requests were made through authenticated application HTTP APIs. The recorded smoke does not show human clicks through the web/mobile UI or any user-facing UX acceptance trace.

## Real defect repaired and tests

Google's OpenAI-compatible `GET /models` may return IDs prefixed `models/`. The pre-fix backend `checkLlmProviderHealth()` compared that string only with the bare `gemini-3.5-flash-lite` name, incorrectly reporting `ready=false` even when the model was available. PR #36 normalizes both forms when checking availability without changing the outbound generation model. The new `backend/src/modules/ai-copilot/llm-provider.test.ts` includes three deterministic tests (prefixed, unprefixed and unavailable) and is included in P8 backend CI.

**Documentation erratum:** `Settings` has no `llm_local_fallback` attribute. Demo Compose sets `LLM_LOCAL_FALLBACK=false`; the Python `LLMService._local_fallback_enabled()` reads this environment variable. The branch handoff was corrected accordingly. Its JSON reports local fallback disabled but does not contain an independent serialized runtime-method assertion; do not quote a nonexistent settings field as observed runtime proof.

## CI

- [P8 run 37204034219](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37204034219): **SUCCESS**. All six jobs passed: frontend/backend tests, unit, PostgreSQL integration, rollback rehearsal, cleanup gate and Compose smoke.
- [Evaluation Pilot run 37204034258](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37204034258): **SUCCESS**.
- P7 did not trigger on PR #36 because it changes only backend code, a new JSON evidence file and `promt.md`. Earlier [PR #35 P7 run 37197428749](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37197428749) passed its unit, pgvector and Compose checks of the demo override and both 3.5/3.1 model selections. Do not claim a new P7 run for this head.
- CI does not make external Gemini API calls. The live demo observations are recorded in the separate sanitized JSON. No key or full manuscript content is committed by PR #36.

## What remains before a public interactive demo

1. **Browser/UI walkthrough** with a non-sensitive disposable demo story: authenticate, open the author IDE, submit at least one Copilot suggestion and one AI-writing generation, observe completion and rendering, and confirm failure messaging. No UI-level browser interaction is evidenced yet. This check should be scoped to demo functionality and not rerun broad EVAL-01.
2. **Quota-conscious practical load rehearsal** at the expected number of demo participants and requests, within the project's actual API quota. Record remaining-capacity observations when available, 429/503, retries, timeout, latency and lack of 3.8 fallback. Do not infer larger-sample reliability from four successes.
3. Preserve separate content-quality gates. The archived 3.5 Lite unadapted story cases have `automated_content_check=PARTIAL`, `independent_full_draft_review=NOT_ASSESSED` and provider-population stability `INSUFFICIENT`; these do **not** invalidate API/demo feasibility and do **not** prove better prose.

Production/default Compose remains unmodified except the opt-in demo overlay. `CONTEXT_ROUTING_POLICY=legacy-v1` is unchanged; global `balanced-scope-v1` activation is not authorized, and destructive P8-05 cleanup remains `BLOCKED_PENDING_STABILITY`.
