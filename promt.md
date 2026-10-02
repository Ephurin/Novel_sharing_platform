# Active Project Handoff — CTX-RD-01

## Canonical current state

```text
EVAL-01                             CLOSED
CTX-RD-01 implementation            MERGED
Real-provider staging               ACCEPTED
Synthetic provider-path canary      FUNCTIONAL PASS
Frozen-source replay                ACCEPTED WITH QUALIFICATION
Full source-provider end-to-end     NOT YET DEMONSTRATED
Balanced-v1 opt-in staging          AUTHORIZED
Global production default           legacy-v1 (UNCHANGED)
Global balanced-v1 activation       NOT AUTHORIZED
P8-05 destructive cleanup           BLOCKED_PENDING_STABILITY
NEXT                                SOURCE E2E + TARGETED CONTENT REVIEW
```

Canonical docs:

- `docs/development/EVAL-01-FINAL-CLOSURE.md`
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`
- `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`
- **Latest Astra review:** `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FROZEN-SOURCE-REPAIR-FINAL-REVIEW.md`

Latest review commit: `c210c60ab1e4d9b764040d00bb1f169e60a17446`.

## Accepted frozen-source replay

Corrected runner/validator code was committed first: `2dabf3e4d921ccbc6538720bb8997d0bf585357a`.

Evidence was committed separately as direct child: `f18c561a05af14c407da0b4044f0d5e39360319f`.

PR #31 merged into `main`: `406ab3fe5f2a18dae90a9a5dd652cd83df191b36`.

P7 CI run `36989210006`: SUCCESS (validator self-test + evidence contract, full non-Postgres regressions, live PostgreSQL/pgvector integrations, Compose smoke, runner compilation). CI makes no external Gemini model calls.

Evidence directory: `docs/development/CTX-RD-01-OPT-IN-CANARY/`.

```text
methodology                frozen_source_replay_with_retrieval_adapter
core_gold:rq-0011          12k / entities 63 -> 21 / checklist PARTIAL
challenge:rq-0025         12k / entities 68 -> 20 / lexical checklist PASS
both                       semantic 8/8; recent 20/20; rules 6/6 and 12/12
both                       zero drop; zero protected overflow; hash match
Gemini generation          2 jobs completed / models/gemini-3.8-flash
model attempts             7 total: 2 success; 5 failures 429/503
aggregate content verdict  PARTIAL
```

World-rule IDs are identity/count preserved, but canonical packer ordering may differ from input order. `rq-0025` lexical checks mention the chapter 45 -> 47 -> 49 contradiction. `rq-0011` chronology/causality remains PARTIAL. Future narrative leakage and unsupported generation claims are NOT_ASSESSED in this replay.

**Important:** source data came from `Frozen_v1` and accepted EVAL fixtures, but retrieval used preconstructed `SemanticMemoryMatch` through `SourceRetrieverAdapter`. This replay **does not** demonstrate genuine query/document embedding + pgvector retrieval on the original corpus. Previously accepted staging/synthetic tests separately established that provider/DB path works.

## NEXT — Gemini / Antigravity: focused remaining gate

1. **Content review:** independently examine the full `rq-0011` generated draft against frozen canonical facts, deciding why chronology/causality is PARTIAL and whether a narrow correction is needed. Review `rq-0025` chapter 45 -> 47 -> incompatible chapter 49 beyond mere lexical mention. Report source references and avoid inventing canonical facts; do not modify frozen EVAL judgments.
2. **Full-source E2E:** if claiming end-to-end readiness for default activation, populate an isolated disposable PostgreSQL/pgvector staging database with the accepted source-derived memories and genuine document embeddings `gemini-embedding-2-768-v1` (768d, explicit L2). Query with the same embedding version through real production `SemanticRetrieverService` + `hybrid-v1`, then `WritingService` + opt-in `balanced-scope-v1` + real generation provider. Do not use `SourceRetrieverAdapter` or preselected benchmark matches for the E2E claim.
3. Independently record source IDs, retrieved IDs, initial-vs-retained semantic/recent/rule IDs, actual job context hash/tier, chapter cutoff, superseded/tenant boundaries, provider attempts/errors and completion. Confirm fallback, >24k fail-closed and immediate flag rollback where applicable.
4. Commit runner and test changes on a new focused branch, obtain CI via PR, execute on the clean tested SHA, and commit non-sensitive evidence separately. If API quota blocks the live run, mark BLOCKED or PARTIAL instead of substituting fake embeddings.
5. Review a small opt-in stability window and only then propose a separate default-activation decision.

Keep production config `CONTEXT_ROUTING_POLICY=legacy-v1` by default. Neither this handoff nor any technical smoke authorizes global activation, embedding/hybrid changes, EVAL-01 reopening or P8-05 cleanup. Do not commit API keys, raw auth headers or unnecessary manuscript text.
