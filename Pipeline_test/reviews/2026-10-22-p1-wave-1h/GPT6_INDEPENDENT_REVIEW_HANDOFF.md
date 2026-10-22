# Wave 1H independent review handoff

Date: 2026-10-22 (Asia/Saigon). Branch: `codex/ai-copilot-pipeline-test`.

**Verdict: `WAVE_1H_REVIEW_BLOCKED:CANON_PROVENANCE_AND_TENANT_PLAN_FIXTURE_GAPS`.**
Actual offline HTTP transmission of a synthetic in-memory context is independently reproduced.
The stronger approved, persisted, source-grounded Story Brain provenance claim is not accepted.
No independently reproduced production defect justifies changing production code.

## Provenance

Fetched origin before changes. Initial checkout was clean, and local HEAD equaled remote
`592db1b652372ce57650e902eb454581097ffb21`.
The requested “3 commits since handoff” needs qualification: the reachability range
`62f127d..592db1b` contains four commits, including the new audit assignment itself:

| Commit | Actual role |
|---|---|
| `252ce08c06a1eeb18d0ceeaf37146546d5c35149` | Executor verifier, nine tests, fake upstream changes and original evidence, based on `8a8bb49` |
| `db29ed910cb7e1f8cc0a65e563a80df575a8376b` | Documentation records evidence SHA; no new runtime proof |
| `705df6d07b50694395e86e1c4731e5ca273ef3c8` | Merge joining executor work and handoff `62f127d` |
| `592db1b652372ce57650e902eb454581097ffb21` | Independent audit assignment in `promt.md` |

Thus there were three executor/integration commits before the assignment commit, not three
new sequential runtime executions after the handoff. Inspect with
`git log --format='%H %P %s' 62f127d..592db1b` and `git diff 62f127d..592db1b`.
The executor's tested/evidence SHA fields are declarations; a commit containing its own
evidence does not by itself establish that the committed tree was the tested runtime.

## Independently executed evidence

Final clean-checkout tested SHA: `c23ea4a5c72a35d53ffc03f160f262f2186a4def`.
Evidence commit is the documentation commit containing this handoff; obtain it with
`git log -1 --format=%H -- Pipeline_test/reviews/2026-10-22-p1-wave-1h/GPT6_INDEPENDENT_REVIEW_HANDOFF.md`.
Tests were committed before the final run; the subsequent evidence commit changes only review artifacts.

Reproduce from repository root with Python 3.11.9 and dependencies recorded in
`independent_validation.json`:

```powershell
python -m pytest Pipeline_test/tests/test_wave1h_story_brain_context_delivery.py Pipeline_test/tests/test_wave1h_independent_audit.py -v -ra -s
```

Final result: **17 collected, 17 passed, 0 failed, 0 skipped; exit 0**.
The original nine also independently passed at clean initial HEAD (exit 0).
An earlier restricted-sandbox run had 8 pass / 1 fail because Windows denied loopback
sockets (WinError 10013); this was recorded, then rerun successfully with loopback permission.
Logs, JUnit results and dependency versions are in `independent_test_logs.txt`,
`independent_junit.xml` and `independent_validation.json`.

The original and new positive HTTP tests invoke actual
`WritingService.start_generation/process_generation -> LLMService -> Gemini SDK native HTTP
-> budget gateway -> separate fake upstream`. No alternative context builder or fabricated
HTTP payload substitutes for that path. The repository and approved baseline are synthetic.
Job persistence here means in-memory repository storage, not PostgreSQL durability.

The independent positive control correlates a unique instruction nonce and one upstream
dispatch with the gateway's successful ledger ticket. Its captured context hash is
`be0151f36402f38e4a95b08bbe7a0423152d4d44cad8e32b2d7bf2340585a8ab`, matching the job hash.
The full prompt hash is `04705518cc625be8c87aa7ef762b362493a8a7e9232e139629cf82689d01f9cb`.
These differ because only the canonical JSON Story Brain section is hashed as context;
the full prompt also contains instructions, selected source and formatting.

New fault tests actually execute and require rejection of:

- Post-hash mutation of the dictionary passed into the actual LLM service; altered context
  reaches HTTP but the independent parity assertion raises `CONTEXT_HASH_MISMATCH`.
- Wrong dispatch ID, stale instruction nonce and mismatched persisted hash. Each starts
  with a passing capture before evidence is perturbed, then requires a specific assertion failure.
- Gateway authorization denial: job fails and no upstream request arrives.
- HTTP 500 transmission failure at the actual fake upstream: job fails and ledger calls
  are not successful. The independent acceptance checker rejects the failed generation.
- Direct external-IP connect is denied before a socket connects, covering a DNS-only guard gap.

These are reviewer evidence checks, not a claim that production detects every post-hash
mutation or rejects tampered audit files automatically. They supplement the original suite,
which only checked the latest capture, hash parity and stale brain version.

## Executor artifacts inspected, independently recomputed

`independent_historical_hash_check.json` records recomputation from the preserved raw
`requests.jsonl`, not from report prose. The actual captured prompt reproduces the recorded
context hash `da363c14...1966dd0d` and full prompt hash `896cd1cd...2c7abad`;
the extracted payload and dispatch also match the historical evidence file.
There is **one** preserved request but **two** ledger calls roughly 61 seconds apart.
The verifier deletes requests.jsonl on rerun while reusing a fixed ledger path, explaining
how cumulative accounting and only the latest capture can coexist. The first dispatch is
not independently reconstructable; do not call this two independently captured generations.
The verifier was not rerun because its fixed paths overwrite historical evidence.

## Claim-by-claim assessment and remaining blockers

| Claim | Independent assessment |
|---|---|
| Real service-to-gateway-to-fake HTTP path and JSON hash parity | Reproduced PASS for synthetic in-memory fixtures |
| Five-chapter frozen source and canon approval/materialization provenance | BLOCKED: helper writes directly into `repo._brains`; no five-chapter immutable source manifest or supported approval flow |
| Cross-tenant isolation | BLOCKED: tenant argument does not scope this fixture repository; foreign data uses a different novel ID. Test proves separation by novel, not same-novel tenant authorization |
| Temporal facts/events cutoff | Synthetic chapter-5 fact and event are actually seeded and excluded; PASS at that level |
| Temporal future-entity exclusion | Unproven: `e_ch5_future` is constructed but deliberately omitted from the baseline |
| Future plan not historical | Unproven: `planning_context` is created locally and never attached to a Story Plan/repository; absence is vacuous |
| Locked rules | Retained in actual context; 150-token pruning assertion passes locally, not a separate tight-budget HTTP capture |
| Superseded facts/states | Seeded old/new facts and transitions exercise actual repository filtering; synthetic PASS |
| Uncertain attribution | Uncertainty wording survives serialization; no model-understanding inference |
| Unapproved proposal | Pending proposal is actually seeded and excluded; synthetic PASS, no approval lifecycle proof |
| Deterministic pruning | Same-input repeated packing passes with dropped event IDs; no cross-process/order-perturbation claim |
| Retrieval/routing | No semantic retriever is supplied. Test permits missing status (`None`) and never exercises max-tier overflow despite its name/report claim |
| Revision integrity | Helper manufactures a revision for unknown keys. Original generation supplies source text directly; no immutable production revision readback proof |

Required follow-up is a fresh isolated run with an immutable five-chapter revision manifest,
supported canon review/materialization and durable readback, a same-novel wrong-tenant negative,
an actually attached future Story Plan and a genuinely seeded future entity. Add explicit
retrieval metadata and routing overflow assertions, or narrow those claims. Preserve this
review and historical ledgers; do not retroactively upgrade the executor's report.

## Containment and boundaries

Fake upstream never forwards requests; gateway points at ephemeral loopback only, with
fake credentials, proxy mode and local fallback disabled. Independent tests additionally
deny non-loopback socket connections; no Gemini/OpenAI/embedding API was called.
No DB, volumes, existing tenant records or real keys were needed or modified in this rerun.
The two historical ledger entries are simulated Gemini-shaped operations. `charged_usd`
`0.021671` is synthetic text-only accounting; actual provider spend for these fake calls is zero.
The ledger itself labels pricing `SYNTHETIC_OFFLINE_TEXT_ONLY`, live authorization false,
and invoice UNKNOWN. This is not evidence of a real-money cost guarantee.

Semantic RAG: **NOT_ASSESSED**. Model quality: **NOT_TESTED**.
S09: **BLOCKED pending reviewed FE patch, issue #56 / PR #55** per task scope;
no fresh remote FE acceptance is asserted. S10/S11: **NOT_RUN**. P1 overall: **not accepted**.
No production source, frontend, Wallet task, active Wave 1G pointer, historical ledger,
gold fixture or prior review report was changed. Stop for final remote review; no PR or merge.
