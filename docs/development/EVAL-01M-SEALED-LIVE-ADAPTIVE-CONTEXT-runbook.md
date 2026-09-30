# EVAL-01M — Sealed Live Adaptive Context Validation Runbook

## Purpose

EVAL-01M is the first live-generation validation of the context-budget architecture supported offline by EVAL-01G through EVAL-01L.

It does **not** change production configuration.

The question is:

> Does the EVAL-01L adaptive Story Brain context policy improve actual Gemini narrative-evidence handling versus the current fixed broad@12k behavior?

## Preconditions

Required accepted/verified evidence:

- EVAL-01C-PROV provenance propagation verified;
- EVAL-01E sealed blind protocol proven;
- EVAL-01H production-limit context scope diagnostic verified;
- EVAL-01I context budget scaling verified;
- EVAL-01J adaptive breadth stress verified;
- EVAL-01K multi-lane failure frontier verified;
- EVAL-01L secondary scoped frontier verified and Astra-reviewed.

Production policy must remain unchanged during the experiment.

P8-05 destructive cleanup must remain blocked.

## Conditions

### CONTROL — `fixed_broad_12k`

Production-shaped broad entity/current-state package with:

```text
semantic limit = 8
recent limit   = 20
compact provenance
ContextBudgetPacker maximum = 12000
```

### CANDIDATE — `adaptive_eval01l`

Use EVAL-01L routing based only on deterministic estimated Story Brain package size:

```text
BROAD

<=20k       -> broad@20k
20k..24k    -> broad@24k
>24k        -> retrieval scope

SCOPED

<=12k       -> scoped@12k
12k..16k    -> scoped@16k
16k..20k    -> scoped@20k
20k..24k    -> scoped@24k
>24k        -> unresolved
```

Gold labels never participate in routing. EVAL-01G..L's critical-memory-derived experimental entity locks are also stripped before EVAL-01M packing so query gold cannot influence live package priority/order. Source-derived world-rule locks remain.

## Held constant

For every A/B row:

```text
same case query
same chapter cutoff
same source-derived base package
same de-golded entity lock policy
same semantic top-8 order
same recent limit=20
same compact provenance
same task prompt
same production LLM prompt renderer
same author constraints
same model
same temperature
same output max_tokens
```

The intended difference is only the context packing/scoping/budget policy.

## Live strata

EVAL-01M keeps normal quality and synthetic stress resilience separate.

### NORMAL

`source_1x` for all seven fixed EVAL-01E cases.

Expected rows:

```text
7
```

### STRESS_RESILIENCE

Use `combined_4x`, but include only case/scenario rows where EVAL-01L package-size routing enters a scoped tier.

Selection uses only estimated package size.

Expected current rows:

```text
5
```

This stratum intentionally contains noncanonical structural stress load. It is not representative normal prose/context. It exists only to test resilience of the scoped fallback under the failure shape found by EVAL-01K.

Never pool NORMAL and STRESS_RESILIENCE into one aggregate winner.

## Default live contract

```text
model               gemini-3.5-flash-lite
temperature         0.0
max output tokens   512
repeats             3
rows                12
conditions          2
planned calls       72
fixed key slot      one slot for full capture
key rotation         forbidden
fallback model       none
inter-call delay     5.0 s default
quality scoring      blind review required
```

Provider token usage is not currently exposed by the project LLM client. The harness records:

- Story Brain estimated-before size;
- Story Brain tokens-used estimate;
- context tier/budget;
- full prompt character count proxy;
- latency;
- backoff count.

Do not label these as exact provider token usage.

## Secret setup

Use the existing local-only setup from EVAL-01E.

Required ignored files:

```text
key.txt
.env.eval.local
```

Accepted variable names:

```text
GEMINI_API_KEY_SLOT_1
GEMINI_API_KEY_SLOT_2
GEMINI_API_KEY_SLOT_3
GEMINI_API_KEY_SLOT_4
```

Never print, echo, screenshot, log, or commit key values.

Choose one fixed slot before capture.

Default:

```text
--key-slot 1
```

If that slot cannot complete the capture after same-key retry/backoff, stop with PARTIAL/BLOCKED. Do not rotate to another key mid-experiment. A retry with another slot must restart the full capture from a clean EVAL-01M state.

## Stage 1 — dry-run

No provider calls.

Windows PowerShell:

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage dry-run
```

Dry-run must prove:

```text
provider calls                       0
normal rows                          7
scoped stress rows                   5
total rows                          12
planned live calls                  72
routing uses gold                false
query gold used for locking      false
evaluation entity locks removed  true
same system prompt                true
same source-package identity      true
control protected overflow       false
candidate protected overflow     false
candidate unresolved            false
```

Any row-count or route drift is a stop condition until Astra reviews the change.

## Stage 2 — capture

Use latest merged `main`.

```powershell
.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage capture --key-slot 1
```

Public evidence created by capture:

```text
docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  capture-contract.json
  sealed-state.json
  summary.md
```

Private local state:

```text
.eval-private/eval01m-private.json
```

The private state contains:

- random blind/order salts generated at capture time;
- X/Y condition mapping derived from those private salts;
- labelled raw generations;
- prompt/context hashes;
- detailed packing audit;
- latency split by real condition.

It must not be committed before blind review.

### Capture evidence rules

Commit only the public reviewer-safe files above plus a concise handoff in `promt.md`.

Do **not** commit:

```text
condition-key.json
raw-generations.json
prompt-diff-audit.json
latency-cost.json
reveal-verification.json
.eval-private/eval01m-private.json
```

Capture handoff reports execution only. Gemini must not declare a winner.

## Stage 3 — Astra blind review

Astra reviews only:

```text
reviewer-blind.json
review-rubric.md
```

Do not inspect:

- private blind/order salts;
- private state;
- condition mapping;
- prompt hashes;
- detailed packing audit;
- condition-labelled latency.

Score each X/Y output on:

```text
canonical/source-status correctness
chronology/causality
ambiguity handling
future leakage
unsupported claims
completeness
```

Do not reward verbosity.

Freeze the blind judgments in:

```text
docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/ASTRA-BLIND-REVIEW.md
```

Commit that review before reveal.

Report NORMAL and STRESS_RESILIENCE separately.

## Stage 4 — reveal

Reveal requires:

- same local workspace containing `.eval-private/eval01m-private.json`;
- committed `ASTRA-BLIND-REVIEW.md`;
- unchanged public sealed-state commitment.

Run:

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage reveal
```

Reveal must make zero provider calls.

It writes:

```text
condition-key.json
raw-generations.json
prompt-diff-audit.json
latency-cost.json
reveal-verification.json
```

Required:

```text
commitment match              true
blind review present          true
provider calls during reveal  0
```

## Stage 5 — final interpretation

Astra maps the frozen X/Y review to real conditions only after reveal.

Evaluate separately:

### NORMAL

Does adaptive context improve or preserve:

- canonical correctness;
- chronology;
- ambiguity handling;
- completeness;
- unsupported-claim rate?

What input-size and latency cost is observed?

### STRESS_RESILIENCE

When broad context is too large and the adaptive candidate enters retrieval scope, does it preserve answer quality better than fixed broad@12k?

Do not extrapolate synthetic stress rows into normal-user quality.

## Production decision boundary

EVAL-01M never auto-promotes the candidate.

Possible final outcomes:

```text
SUPPORTED_FOR_IMPLEMENTATION_PROPOSAL
DIRECTIONAL_ONLY
NO_MEASURABLE_BENEFIT
REGRESSION
INCONCLUSIVE
```

Even `SUPPORTED_FOR_IMPLEMENTATION_PROPOSAL` means only that Astra may prepare a narrow production implementation contract for Supervisor review.

It does not authorize production changes by itself.

## Frozen boundaries

Do not change during EVAL-01M:

- embedding model/version/dimensions;
- hybrid-v1 weights;
- temporal cutoff;
- semantic limit=8;
- recent limit=20;
- provenance projection;
- `ContextBudgetPacker` algorithm;
- frozen corpus/gold labels;
- P8-05 cleanup state.

## Expected Gemini handoff after capture

```text
### Gemini Verification — EVAL-01M SEALED LIVE ADAPTIVE CONTEXT

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

Preflight:
  P8 cleanup readiness: PASS
  P8-05 cleanup gate: BLOCKED
  fixture contract: PASS

Dry-run:
  normal rows: 7
  scoped stress rows: 5
  planned calls: 72
  routing uses gold: false

Capture:
  fixed key slot: <slot label>
  model: gemini-3.5-flash-lite
  successful calls: <n>/72
  backoff events: <n>
  sealed state SHA256: <sha>
  condition mapping committed: false
  raw labelled outputs committed: false
  quality: BLIND_REVIEW_REQUIRED

P8-05: BLOCKED
```
