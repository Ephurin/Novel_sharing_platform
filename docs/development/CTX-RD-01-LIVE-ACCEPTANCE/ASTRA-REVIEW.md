# ASTRA REVIEW — CTX-RD-01 Live Acceptance

## Verdict

**INTEGRATION_SMOKE_PASS — REAL_PROVIDER_STAGING_VALIDATION_REQUIRED**

Gemini's `PASS` is supported for the tested live PostgreSQL/pgvector + deterministic-fake-embedding integration scope. It is **not** proof of production-provider end-to-end readiness and does not authorize default activation.

Evidence commit: `4d073497c61f5d8a7477c7d7c189ae4a055f090c`
Tested code commit: `7c95d6189d0b9a525718fbc35b906acf9cc50676`

Reviewed source artifacts:
- `environment.txt`
- `runtime-config.json`
- `legacy-smoke.json`
- `balanced-smoke.json`
- `temporal-safety.json`
- `fallback-rollback.json`
- `summary.md`

## Confirmed evidence

- PostgreSQL 16 + pgvector/Compose stack ran.
- Legacy path: preview and generation completed, legacy-compatible routing trace.
- Balanced path: hybrid-v1 status `ok`; hybrid signals resolved; chapter cutoff 35.
- Balanced route selected 12k; entity breadth 25 -> 5; 5 current states retained.
- Semantic 8/8, recent 20/20, rules 4/4; zero packer drops and no protected overflow.
- Story Brain estimate 5,251; final context hash recorded; generation completed.
- Future/superseded/cross-tenant participant leakage reported as zero.
- Semantic-unavailable fallback, >24k fail-closed behavior and legacy flag rollback reported PASS.
- Default configuration remained `legacy-v1`; P8-05 remained blocked.

## Evidence boundary

The execution environment explicitly specifies:

```text
embedding provider   DeterministicFakeEmbeddingProvider
embedding version    fake-embedding-768-v1
ranking              hybrid-v1
```

Therefore this was **not** a live `gemini-embedding-2-768-v1` provider-path test.

The evidence does not identify an actual generation-model/provider invocation. The recorded 76.68 ms latency is a smoke measurement, not verified real-LLM latency or cost.

The balanced smoke records one normal-sized package (5,251 estimated Story Brain tokens) selecting 12k. It does not establish live route selection at 16k/20k/24k for pressured production-shaped requests. CI unit/stress checks provide separate offline evidence, but should not be represented as local live stress coverage.

The artifact JSON files report passing checks; they do not include independently replayable raw execution logs for every assertion. This is acceptable for a functional smoke handoff, but limits claims about independent reproduction.

## Decision

```text
implementation integration     ACCEPTED
production default switch     NOT AUTHORIZED
staging opt-in                NEXT GATE
legacy-v1 default            RETAIN
P8-05                        BLOCKED_PENDING_STABILITY
```

No new sealed generation A/B experiment is required.

## Narrow next gate

Run a small opt-in staging smoke with the **actual configured production providers**, while retaining `legacy-v1` as the default:

1. Verify real `gemini-embedding-2-768-v1` query path, explicit L2, hybrid-v1 status/signals and cutoff.
2. Run at least one successful balanced context preview and generation using the configured real generation provider; record model/version and provider-call evidence without exposing keys or unnecessarily committing manuscript text.
3. Verify entity scope, retained semantic/recent/rule IDs, chosen tier, drops, overflow and context hash against the production trace.
4. Exercise a production-shaped pressured package requiring tier escalation above 12k (16k/20k/24k as applicable); if no real novel fixture is available, use a clearly labelled deterministic stress fixture and report this limitation.
5. Recheck failure-to-legacy, >24k fail-closed, and immediate legacy flag rollback.
6. Restore `CONTEXT_ROUTING_POLICY=legacy-v1` after the smoke.

Only after a reviewed PASS should a separate decision consider staged default activation. Never infer authorization for P8-05.
