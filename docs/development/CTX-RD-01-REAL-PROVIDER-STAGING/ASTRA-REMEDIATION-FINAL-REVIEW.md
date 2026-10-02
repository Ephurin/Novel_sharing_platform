# CTX-RD-01 — Astra Remediation Final Review

## Verdict

**REAL_PROVIDER_STAGING_ACCEPTED — OPT_IN_DEMO_STAGING_AUTHORIZED**

This verdict accepts the corrected provider-path staging smoke and remediation of the three prior evidence blockers. It does **not** authorize switching the global production default to `balanced-scope-v1`. The default remains `legacy-v1`; P8-05 remains `BLOCKED_PENDING_STABILITY`.

## Immutable lineage

```text
code remediation         918ae0b460e25426924f0b5e56f424bee93163c7
tested code commit       019d39222ce0b0d26e130ba57c0fedf92eac453e
evidence commit          d2b50be731590b531a17ae2708af2f389667d5af
handoff commit           068650a8844c793d27f9f8033ea03b826328f1e5
PR                      #29
merge commit            6f4d034bbf3c5857e34a6299f8ea9d736c829ff0
```

The evidence commit's parent is **exactly** the tested code commit. The PR branch and merge commit have the same Git tree (`6dea013d4f22647acacd2f43ebef145a30300643`), so merge did not change tested contents.

The harness now requires a clean working tree before execution; it permits locally generated evidence files and the handoff file to change for evidence capture. This is a code/implementation reproducibility check, not an independent attestation of provider-side requests.

## CI

PR #29 head `068650a...`:

```text
Evaluation Pilot Harness   run 36957124427  SUCCESS
P7 Semantic Memory        run 36957124446  SUCCESS
P8 Cutover/Migration      run 36957124460  SUCCESS
```

P7 includes staging-harness unit tests, production/EVAL parity, evidence-validator self-test, full non-Postgres regression, live PostgreSQL/pgvector integration and Compose smoke. P8 includes rollout/rollback and cleanup-gate checks. These CI tests do not call external Gemini APIs.

## Corrected real-provider evidence

On isolated staging PostgreSQL/pgvector:

```text
embedding model/version     gemini-embedding-2 / gemini-embedding-2-768-v1
embedding dimension         768 / explicit L2
document calls/items        3 / 36
query calls/items           3 / 3
hybrid ranking              hybrid-v1 / signals resolved
chapter cutoff              35
real generation requested   gemini-3.8-flash
real generation effective   models/gemini-3.8-flash
recorded model attempts     1 / success
local fallback              disabled
generation service calls    1
generation duration         16,271.61 ms (single sample, not a latency benchmark)
```

Balanced routing preview:

```text
policy/status          balanced-scope-v1 / routed
entity breadth         25 -> 4
selected tier          12k
semantic IDs           8/8 exact
recent IDs             20/20 exact
rule IDs               4/4 exact after packer canonical ordering
dropped artifacts      0
protected overflow     false
```

The harness now measures unscoped input lanes **separately** from final packed lanes and reads packer drop/overflow metrics rather than hard-coding PASS. The independently recorded final generation job has routing status `routed`, version `balanced-scope-v1`, selected tier 12k and context hash equal to the same-input preview:

`bd0bf01ffdf85c3ac686cedde474c301385534e277bbeba719d6dbed6e212301`.

The previous unreviewed production change that automatically switched model on 503/high demand was reverted. Per-model attempted requests are recorded separately from service-level call counts by an instrumented staging adapter.

Deterministic production-shaped stress selected 16k with exact semantic/recent/rule retention, zero drops and zero protected overflow. This is **not** a real-provider large-novel distribution result.

Safety/fallback artifacts report zero future/superseded/cross-tenant participant leakage, >24k fail-closed, semantic-unavailable legacy fallback and immediate legacy rollback. These are supported within the tested harness and existing PostgreSQL/temporal regression scope; they do not guarantee absolute absence of narrative leakage in every possible novel.

## Residual limitations

- Provider-call evidence is instrumented at the adapter and saved in manifest artifacts; this is not an independently retrieved Gemini billing/API audit log.
- One successful generation is a functional smoke, not statistical quality or latency evidence.
- The 16k escalation used deterministic stress; 20k/24k real-novel coverage remains to be observed.
- The prior EVAL-01O source-grounded results support the scope policy; this synthetic staging smoke does not replace those quality findings.
- The current staging policy uses an opt-in feature flag. Readiness for a global default switch requires its own small stability/canary evidence.

## Decision and next gate

```text
staging evidence remediation      CLOSED
CTX-RD-01 provider-path smoke     ACCEPTED
opt-in demo/staging use           AUTHORIZED with flag
global default switch            NOT AUTHORIZED
default setting                  legacy-v1
legacy rollback                  RETAIN
P8-05                            BLOCKED_PENDING_STABILITY
```

**Next:** run a bounded opt-in demo/staging canary using `balanced-scope-v1` with representative real-novel requests, including a context-pressure request if available. Record chosen tier, protected overflows/drops, semantic/recent/rule preservation, generation success/validation, real-provider model and errors, and immediate rollback behavior. Compare against the existing `legacy-v1` reference without reopening a sealed EVAL experiment. On any unexpected data loss, leakage, unresolved routing or material generation regression, revert the flag to `legacy-v1` and report evidence. Keep production default unchanged until that canary receives a separate Astra review.
