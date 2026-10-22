# P2 core headless — executor handoff, 2026-10-22

**P2_CORE_BOUNDED_OFFLINE_PASS_EXECUTOR_READY_FOR_GPT6_REVIEW**: 27 checks, exit 0, source `1dc7dfa38267c9eb176f56f070380930d1887d85`, clean at start. This is fake-provider functional evidence, subject to independent review. UI_BLOCKED_FE and REAL_PROVIDER_NOT_TESTED remain.

Own fresh project/DB/Mongo/ledger: `p123-core-4f32e288c8`; novel `13baa49a-277a-4cc7-a090-21bc05910db7`. Evidence: `final-p2/` and read-only durable tables in `final-p2-readback/`. No manuscript import/bootstrap extraction was invoked.

| Step | Actual supported route/action | Result |
| --- | --- | --- |
| Source setup | `POST /ai/story-brains/bootstrap/from-idea`, explicit `mode=extract`; literal Mai Linh, Duy, Cồn Vân | PASS; idea and SHA256 in `idea-source.json`; fake setup extractor returns source names only |
| Review/baseline | Read raw queue, accept explicit proposal groups, `POST /ai/story-brains/:novel/baseline/activate` | PASS; only entity proposals, no canon before approval; M0 3 entities / 0 events / 0 facts survives process restart |
| First writer base | Create empty chapter then supported snapshot `purpose=MANUSCRIPT_BOOTSTRAP` | Empty immutable writer checkpoint only; no supplied manuscript and no from-manuscript extraction call. Label retained because the API requires an immutable accepted base |
| Future plan | Create, activate and read durable versioned Story Plan | PASS; plan attached in actual outbound context, absent from historical events |
| Tenant/owner | Same owner works; different authenticated author memory read | PASS; foreign author HTTP 403 |
| P2-specific failure | Unique instruction `fault:500` reaches real gateway/fake upstream | Failed writing job; unchanged canon and immutable base; accept-draft rejects failed job HTTP 400 |
| Recovery | New supported generation on same unchanged immutable base/brain | PASS; distinct failed/success job IDs and hashes in generation captures. This is safe regeneration, not resuming a failed writing job in place. Generic `/jobs/:id/resume` supports bootstrap jobs, so no fabricated writing-resume API was used |
| Accept first chapter | `POST /chapters/:id/revisions/accept-draft` using actual completed job `f815ecb3-4903-4af7-b35a-ebdeafd80376` | PASS; revision `4b046d91-8694-4791-97fa-f53b8b78b5f8`, source `AI_DRAFT_ACCEPT`, Mongo draft sync, identical replay same revision, one outbox, DRAFT status |
| HITL/canon | Wait real chapter entity checkpoint; scripted API review/freeze/continue, then proposal approval | PASS; accept alone does not canonize. M-FIRST 3 entities / 1 event / 2 facts survives restart |
| Second writing request | Latest accepted revision + fresh brain version | PASS; actual HTTP sees M-FIRST recent history, persisted context hash matches transmitted context; future objective absent from historical events, retrieval explicitly disabled |

Accepted chapter content SHA256: `7131e1f2324531a815f700a997a925c6d6228e6f21f489c6ccefb07b1cef39a6`. Full lineage, outbox/proposal/canon IDs, current tables, schema migration versions and captures are committed. Migrations are existing backend 001–012 and AI `0012_entity_guidance` in the new DB; no PR #55 migrations were copied.

All human decisions are SIMULATED_HUMAN_VIA_API. Fake text and extraction labels test plumbing only; setup quality, real model reliability, literary quality, semantic retrieval quality, ordinary-save after idea baseline, UI workflows and controller P3 remain unaccepted/NOT_TESTED. The selected first-chapter branch is actual accept-draft. No publication calls or FE edits occurred.
