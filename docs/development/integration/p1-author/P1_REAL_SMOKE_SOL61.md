# P1-REAL-SMOKE-01 — Sol 6.1

**Verdict: P1_REAL_SMOKE_PARTIAL**

2026-10-31, Asia/Ho_Chi_Minh. Native LLM, structured extraction, document/query embedding, isolated pgvector retrieval and one real Author IDE AI Writing operation succeeded. Exactly **6/6 real provider dispatches**, all successful, no retry. The planned second independent Author AI operation was NOT_RUN_CALL_BUDGET_GUARD: the first UI Writing operation consumed two dispatches (query embedding + generation). Full Canon/HITL acceptance is not established by this smoke run. No reproducible application blocker was found in executed tests.

## Identity, authorization and preflight

- Repository Ephurin/Novel_sharing_platform; checkout `C:\Users\Laptop\OneDrive\Documents\testproject\.gemini-p1-free`.
- Branch gemini/p1-live-free-tier-01; SHA `59b0fcb54863391081cbf6d0ed5b5c56e441e487`.
- Fixed credential slot 4. Runtime matched local slot 4 without displaying credential material. Key/project association and Free billing tier were explicitly confirmed by the operator, not independently obtained from Google billing metadata.
- Project fingerprint `prj-sha256:7e98f20c1626`.
- Attestation valid throughout; expires **2026-11-01 22:31:02 Asia/Ho_Chi_Minh**, exact epoch 1793547062.7826653. No renewal or extension performed.
- PostgreSQL 16 / vector 0.8.6 ready; backend, ai-service, frontend and gateway health HTTP 200. Previous Free Tier ledger had 0 real dispatches. Fallback disabled. Both worker tokens rejected for operator emergency action; operator disable succeeded.
- No parallel requests, benchmark, key/model switch, paid-tier change, source modification, PR, merge, deployment or global cleanup.

Published operator project settings remained unchanged in quotas.json:

| Model | RPM | TPM | RPD |
|---|---:|---:|---:|
| gemini-3.5-flash-lite | 15 | 250000 | 500 |
| gemini-embedding-2 | 100 | 30000 | 1000 |

These are operator-provided limits. No USD budget was applied; the run does not independently establish a billing invoice or the project's external remaining daily usage.

## Six-call hard cap and controlled activation

The exact-SHA quota_controller.reserve checks a shared rpd_call_count against the current model's effective RPD and increments it durably for every reservation. A separate offline proof ledger, using the existing valid operator attestation, admitted six sequential reservations alternating models and finalized them without network dispatch; the seventh reservation was refused with RPD_LIMIT_EXCEEDED for EACH model. No old ledger was reset.

A separate smoke ledger `/state/real-smoke-01.json`, run p1-real-smoke-01, was initialized once at 0. Each model's test-only RPD=7, headroom=0.10, effective RPD=floor(7*0.9)=6, max concurrency=1. RPM/TPM remained at their actual project values, with 10% headroom. This temporary acceptance cap did not change quotas.json or published project quotas. Ledger reset time was 2026-11-01 14:00 Asia/Ho_Chi_Minh, well after this short run. No reset occurred during the run.

Only ONE gateway was running. Backend and ai-service were stopped during direct calls 1–4. They were restarted while the smoke ledger was disabled to prepare the UI. Before the sole AI Writing click, source-path inspection established one semantic query embedding plus one LLM generation, deterministic validations and SDK attempts=1. Guard-denied errors exit the LLM retry path; query embedding uses retry_rate_limits=false. No document materialization/HITL operation was invoked. One click was deliberately budgeted as TWO calls.

Activation used an ignored local Compose overlay and no source edit. A dedicated smoke-egress network was attached only to the gateway; worker networks remained internal. Gateway effective startup logged mode live_free_tier, live enabled true and forwarding true. Exact upstream resolved by the existing CLI to https://generativelanguage.googleapis.com; existing NoRedirect/verified TLS and strict origin checks applied. Operator disable was executed before the first request, then authenticated enable admitted this controlled session. No gateway port was published.

An ignored audit-only launcher used Python audit events to record each outgoing HTTP POST attempt's route and timestamp immediately before send, never headers, credentials or prompt payloads. Connection events rejected any host other than generativelanguage.googleapis.com:443. It did not alter provider implementation. After every direct call, audit count, ledger count and zero in-flight were checked; after the UI click the two new dispatches were reconciled immediately. No model discovery was forwarded to Google. No unexpected outbound, redirect or worker bypass was observed.

Proof: `evidence/p1-real-smoke-01/six-cap-proof.txt`, `before-live.txt`, `outbound-audit.jsonl`, `final-smoke-ledger.json`.

## Results per actual provider call

Native routes have prefix https://generativelanguage.googleapis.com/v1beta/models/.

| Call | Test / actual model | HTTP | Latency seconds | Prompt tokens | Result |
|---|---|---:|---:|---:|---|
| 1 | generateContent / gemini-3.5-flash-lite | 200 | 1.450 client; 1.388 gateway | 32 | Vietnamese narrative; modelVersion matches; 37 output / 69 total tokens |
| 2 | structured generateContent / gemini-3.5-flash-lite | 200 | 1.114 client; 1.080 gateway | 40 | Valid JSON/schema; 90 output / 130 total tokens |
| 3 | document embedContent / gemini-embedding-2 | 200 | 0.858 client; 0.822 gateway | 27 | 768 finite values, nonzero |
| 4 | query embedContent / gemini-embedding-2 | 200 | 0.656 client; 0.627 gateway | 13 | 768 finite values, nonzero |
| 5 | UI Writing semantic query batchEmbedContents / gemini-embedding-2 | 200 | 0.630 gateway | 51 | Semantic query stage succeeded; part of same UI operation as call 6 |
| 6 | UI Writing generateContent / gemini-3.5-flash-lite | 200 | 1.516 gateway | 222 | Draft displayed in real Author IDE; persisted job completed/passed |

Calls 5/6 status 200 is established by gateway SUCCESS finalization (that branch runs only on HTTP 200), persisted job and rendered draft. Their full provider response usage metadata was not retained by the application; output/total tokens are unavailable. Gateway durations include preparation/network/ledger finalization, not pure model inference time. No retries or speculative seventh provider call were made. No 401/403/404/429/5xx/timeout occurred from Google. Local authentication/disabled checks returning 401/403/503 are control checks, not provider errors or provider calls.

Call 2 returned entities Trấn Thanh Phong, Lâm Phong, Huyết Ngọc Bội and Tô Mặc; events correctly captured finding the pendant, Tô Mặc witnessing it and their agreement to hide the secret. JSON keys entities/events are arrays of strings matching the requested schema. This was a native gateway extraction test, not an Author HITL approval.

Per-call trace IDs and timestamps are preserved in final-smoke-ledger.json and shutdown-verified.txt. Native request/response evidence is call-1.json through call-4.json. No F-19 endpoint failure reproduced on these native routes.

## pgvector persistence and retrieval

Saved the real document vector in disposable schema/table `qa_p1_real_smoke_01.memories`, source ID chapter-1-source, story Huyết Ngọc Bội. Queried it from another database connection using the real query vector and pgvector cosine distance:

- Retrieved source explicitly names Lâm Phong finding the pendant at Trấn Thanh Phong and Tô Mặc witnessing/keeping the secret.
- vector_dims=768; cosine distance **0.22084157342656185**.
- Source text and ID match the inserted fictional document.

Evidence: pgvector-retrieval.txt. This proves isolated database vector persistence/operator retrieval, not Author Canon memory materialization, ranking quality across a corpus or populated end-to-end semantic recall. No synthetic vector was substituted.

## Author IDE evidence

Used the actual UI in the in-app browser at http://127.0.0.1:18080, signed in as the disposable AUTHOR account sol61. No private author notes or real personal data were entered.

- Created novel **Huyết Ngọc Bội**, ID 09167bb0-e6b0-4aca-bf55-20fc94b35e8a.
- Created manuscript/chapter **Chương 1 — Bí mật tại Trấn Thanh Phong**, ID 7144ea09-a77a-43cd-a804-e67a69e6bd82.
- Entered a **346 whitespace-delimited word** fictional chapter featuring Lâm Phong, Tô Mặc, the pendant and their secret.
- Opened the Writing assistant and submitted ONE instruction for an 80–100 word continuation with those characters/location and no new character.
- That one UI operation dispatched calls 5 and 6, not one provider call. It returned a Vietnamese draft rendered with the label “Đã kiểm định nhất quán • P1 Loop” and accept/reject buttons.
- Persisted job d651e39b-f08c-564a-91ca-5c151c83646d: status/stage completed, validation_status passed, brain_version 1. Canon entity/event/fact IDs and semantic_memory_ids were empty; semantic_retrieval_status was ok. Thus the UI used the supplied instruction and an empty Story Brain context, not a populated, HITL-approved Canon. The database model_name field was empty; actual model identity is established by the gateway dispatch route/ledger.

Evidence: author-writing.png, author-writing-dom.txt, author-writing-database.txt, after-ui-dispatch.json. The screenshot records the current narrow in-app browser viewport; it clips the AI draft panel. The complete generated draft and accept/reject controls are captured in author-writing-dom.txt and the persisted database evidence. The visual screenshot alone does not prove the complete draft is visible.

NOT_RUN: second independent Author AI operation (NOT_RUN_CALL_BUDGET_GUARD); UI entity/event extraction and review, HITL Canon approval/edit/reload, Canon-based semantic recall with populated memories, draft rejection/acceptance and full chapter journey. The two remaining provider slots were consumed by one Writing operation; no additional AI click was attempted. The generated draft remains unaccepted for review.

UI observation (NON-BLOCKER for provider smoke): the narrow in-app browser viewport clips the AI draft panel even after collapsing the formatting toolbar. Reproduce by viewing the Author IDE in the same narrow side panel; expected draft and controls to remain readily readable, actual screenshot clips them. This does not establish behavior at a normal desktop browser width. No source fix was attempted.

## Mandatory shutdown

At 6/6: stopped generating requests, authenticated emergency disable returned 200 DISABLED; workers remained unauthorized for that endpoint. Smoke ledger live_free_tier_enabled=false, total/rpd=6, current_in_flight=0. All six entries SUCCESS; audit contains exactly six POST attempts. Full ledger/audit preserved before recreation.

Gateway then restarted using the disabled Free Tier base overlay and original dormant ledger; this is a disabled profile, not live traffic. Runtime flags were checked INSIDE the new process: LIVE_FREE_TIER_ENABLED=false and LIVE_UPSTREAM_FORWARDING=false. Runtime.env and the smoke activation overlay now both contain false startup flags. Gateway no longer attaches to smoke-egress; only workers/upstream networks, both internal=true, remain. No public gateway binding.

An authenticated model-list attempt AFTER shutdown was refused HTTP 503 FREE_TIER_STATUS_UNVERIFIED before any dispatch. Smoke ledger remains preserved at 6 with zero in-flight. Returning to the original dormant ledger did not erase or reset smoke counters. No additional acceptance run or ledger is authorized. Evidence: shutdown-disable.txt, shutdown-verified.txt. A quoting error in the first local verification command was corrected with a file-based checker; it did not affect provider traffic or shutdown.

## Final handoff

1. Real Gemini LLM: **YES**, native generation/extraction and UI Writing succeeded.
2. Real Gemini Embedding: **YES**, native document/query and UI query stages succeeded.
3. pgvector retrieval: **YES in isolated QA storage**; populated Author Canon retrieval NOT_RUN.
4. Author IDE calling real Gemini: **YES**, one rendered Writing draft confirmed by provider ledger and persisted job.
5. Budget used: **6/6**, six successes, zero failed dispatches/retries.
6. Live forwarding disabled: **YES**, effective runtime and startup configuration false, egress detached, zero in-flight.
7. Required Codex fix: **none established by this smoke**. The remaining work is a separately authorized acceptance round for populated Canon/HITL and other Author actions; do not infer an architecture defect from unexecuted coverage.

This verdict is PARTIAL for the requested acceptance scope, despite all executed provider requests passing. No source fix or new development cycle was opened.
