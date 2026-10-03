# CTX-RD-01 — Astra Guarded Live Mixed-Provenance Acceptance Review

## Decision

**MIXED_PROVENANCE_PROVIDER_PATH_ACCEPTED_WITH_QUALIFICATION — UNADAPTED NARRATIVE E2E AND STABILITY PENDING**

Reviewed on `main` after Gemini's targeted local execution report of 2026-10-03, with tested code SHA `ece073840545bd3b27fb4dc7c509735b85a4d39d`, evidence child commit `f8f8b578f49361f6594cb3e98d58e4d2673b8cfa`, and execution-only handoff commit `5439910050c5c4d68266877cf7cbf9e3407a67e1`.

This decision accepts the *narrow* integrated path: frozen-source memory embedding using a genuine Gemini provider, isolated PostgreSQL/pgvector semantic retrieval and hybrid ranking, opt-in balanced scoping/packing of fixture-supplied structured context, and genuine Gemini generation. It does **not** validate production `PostgresNarrativeRepository.get_structured_context()` for the structured-context lane, independent narrative-quality parity, steady-state provider availability, or global default activation.

## Evidence and lineage

- Manifest: `docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json` on `main`.
- Methodology: `real_provider_pgvector_semantic_with_fixture_structured_context`.
- Attested mode: `live`; verdict: `MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED`; source: `eval01g_fixture_via_repo_adapter`.
- The evidence commit is a **direct child** of the declared tested code SHA. The code SHA contains the guardrails merged through PR #32. Prior PR #32 P7/P8 CI runs `36993160724` and `36993160746` were SUCCESS; no external Gemini calls were performed by CI. There is no new PR-specific CI for the evidence-only commit, nor is it needed to prove an external call.
- Offline evidence validation is reported PASS (0 errors) and the manifest satisfies the corrected guardrail fields; this validator checks declared evidence consistency, not an independently retrieved Gemini API audit.

## Observed results

```text
embedding model/version           gemini-embedding-2 / gemini-embedding-2-768-v1
dimension / normalization         768 / explicit L2
document adapter calls           11 (216 canonical chunks)
query adapter calls              6
LLM effective model              models/gemini-3.8-flash
generation jobs                  2 completed, 2 nonempty outputs
model attempts                   5 total: 2 success; 3 failed with 503
local fallback                   disabled (reported)
```

| Case | Cutoff | Tier | Entities | Raw/packed semantic | Recent | Rules | Drops / overflow | Job/preview hash | Latency |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- | ---: |
| `core_gold:rq-0011` | 32 | 12k | 63 -> 15 | 8/8 exact | 20/20 | 6/6 same IDs | 0 / false | equal | 14,528.4 ms |
| `challenge:rq-0025` | 49 | 12k | 68 -> 18 | 8/8 exact | 20/20 | 12/12 same IDs | 0 / false | equal | 31,103.8 ms |

The script independently retrieves raw IDs via `SemanticRetrieverService.retrieve()` before the packer/preview and compares them against the packed semantic IDs. The two case arrays in the manifest match exactly. Rule identity/multiplicity are preserved even when the packer canonically reorders them.

`rq-0011` retrieved `mem-000089` (Ch 27) and `mem-000110` (Ch 32) at ranks 1 and 2. For `rq-0025`, none of the pivotal `mem-000167` (Ch 45), `mem-000174` (Ch 47), `mem-000177` (Ch 49) is among semantic top 8; all three are supplied by the **fixture-derived world-rule lane**. The correctly generated chronology is evidence of multi-lane context retention and generation, not semantic top-8 recall of those memories.

Both manifest checklists report PASS on their **automated lexical/structural checks**. Future narrative leakage and unsupported claims remain `NOT_ASSESSED`; the evidence contains only short draft snippets, not the complete newly generated text needed for an independent source-based quality audit.

## Qualifications / metadata issue

1. The Gemini execution report names staging PostgreSQL at `localhost:5433/ephurin`, while manifest `database` says `localhost:5432/ephurin`. The runner writes this manifest field as a hard-coded string even when `DATABASE_URL` points to another port. This does not reverse the observed functional smoke, but **the manifest's database field is not reliable environment provenance**. Fix it in the next harness revision by recording a credential-redacted actual database endpoint and verify it against runtime configuration. Preserve the current raw evidence unchanged.
2. The embedding counts are instrumented **adapter invocations**, not the total underlying HTTP requests/retries or an independently verified provider billing audit.
3. The code under test still uses `RepoAdapter` to inject `eval01g.build_package()` structured entities/events/rules. Although source records and embeddings were materialized in PostgreSQL, the full production narrative repository's structured-context assembly was not exercised.
4. The two functional cases selected 12k. Prior deterministic 16k/20k stress evidence is separate; these two runs do not establish live real-source high-tier behavior.
5. Two completed jobs required five LLM model attempts, including three 503 failures. Latency and error rates need a small bounded stability window; do not extrapolate reliability statistics from two jobs.

## Acceptance boundary and next gate

```text
guarded real provider + pgvector semantic smoke   ACCEPTED (qualified)
mixed-provenance balanced packing/generation      ACCEPTED (qualified)
unadapted PostgreSQL narrative context assembly  NOT DEMONSTRATED
independent new-generation content review         NOT DEMONSTRATED
provider stability / latency canary               PENDING
global balanced default activation                NOT AUTHORIZED
production default                                legacy-v1
P8-05                                              BLOCKED_PENDING_STABILITY
```

**Next:** implement one narrowly scoped unadapted source-derived `PostgresNarrativeRepository.get_structured_context()` integration on a disposable database, with persisted entities, current states, events/participant links and world rules/facts. Reuse previously accepted embedding/version contracts; do not rerun all 216 document embeddings solely because of a metadata correction. Record true per-lane provenance and independently validate chapter cutoff, supersession and tenant isolation. Include a small source-based audit of full generated output and then a bounded opt-in stability check. Commit implementation/tests before live execution, open a PR for CI, and commit new non-sensitive evidence separately with exact tested SHA.

Do not reopen sealed EVAL-01O, change hybrid weights/packer policy, change global `CONTEXT_ROUTING_POLICY=legacy-v1`, or unblock P8-05 for this gate.
