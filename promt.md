# Active Project Handoff

## Current state

```text
EVAL-01 / Evaluation-Pilot                 CLOSED
ARCH-CTX-RD-01 proposal                    APPROVED
CTX-RD-01 implementation                   MERGED
Production default                         legacy-v1
Balanced routing activation                NOT YET AUTHORIZED
Next gate                                  LOCAL LIVE ACCEPTANCE SMOKE
P8-05 destructive cleanup                  BLOCKED_PENDING_STABILITY
```

Canonical evaluation closure:

`docs/development/EVAL-01-FINAL-CLOSURE.md`

Canonical architecture proposal:

`docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`

Astra architecture review:

`docs/development/ARCH-CTX-RD-01-ASTRA-REVIEW.md`

Implementation review:

`docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`

Implementation merge:

`739b5f8cceb549fb96e97bbc3565621f9f036031`

Implementation review commit:

`bf6d92af50d0b2451b1da9afc05cfaa13d0dbf06`

## Implemented policy

Feature flag:

```text
CONTEXT_ROUTING_POLICY=legacy-v1
CONTEXT_ROUTING_POLICY=balanced-scope-v1
```

Default remains:

`legacy-v1`

Balanced-v1:

```text
required entity scope =
  locked entities
  + hybrid-resolved query entities
  + semantic top-8 entity IDs
  + normalized participants from newest 5 recent events

then choose minimum full-fit tier:
  12k / 16k / 20k / 24k
```

If no tier full-fits:

```text
CONTEXT_SCOPE_EXCEEDS_MAX_TIER
```

No silent truncation and no automatic >24k growth.

## CI status

Validated implementation tree:

`a403012bb37a98ae8eb99ee0291865e659c23c67`

P7 workflow:

`36808950154` — PASS

Passed:

```text
context-routing unit tests
production/EVAL parity
hybrid regression
benchmark invariants
Phase 6 temporal/writing regressions
full non-Postgres regression
live PostgreSQL + pgvector integration
cutoff/supersede scope integration
production-path Compose smoke
```

Parity:

```text
source_1x cases       7/7
candidate tier        12k 7/7
semantic              exact 8/8
recent                exact 20/20
rules                 exact under canonical packer semantics
drops                 0
protected overflow    0
```

## NEXT — Gemini / Antigravity local live acceptance smoke

Use latest `main`.

Do not change the default environment permanently.

Run both policies explicitly.

### 1. Baseline readiness

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
```

### 2. Start production-path PostgreSQL + pgvector stack

Use the same Docker/Compose environment already accepted by P7/P8.

Verify health before testing routing.

### 3. Legacy smoke

Set:

```text
CONTEXT_ROUTING_POLICY=legacy-v1
```

Verify:

- service starts;
- existing bounded context preview/generation path works;
- routing trace is absent or legacy-compatible;
- no behavior regression.

### 4. Balanced-v1 smoke

Set explicitly:

```text
CONTEXT_ROUTING_POLICY=balanced-scope-v1
```

Use production PostgreSQL repository + semantic/hybrid runtime.

Verify at minimum:

```text
semantic retrieval status          ok
ranking version                    hybrid-v1
hybrid signals resolved            true
chapter cutoff                     present
semantic limit                     8
recent limit                       20
recent participant identity        normalized-event-participants-v1
routing version                    balanced-scope-v1
routing status                     routed
selected tier                      one of 12k/16k/20k/24k
protected overflow                 false
dropped artifacts                  0 on accepted route
```

Capture:

- exact tested commit;
- scope query entity IDs;
- semantic entity IDs;
- recent participant IDs;
- entity/state before and after;
- Story Brain estimated size;
- selected tier;
- semantic/recent/rule IDs retained;
- context hash;
- request/generation success;
- latency if available.

### 5. Temporal safety

Verify recent participant scope does not include:

- future events beyond chapter cutoff;
- superseded events excluded by canonical event resolution;
- cross-tenant identities.

### 6. Fallback / rollback

Verify at least:

```text
semantic/hybrid unavailable
  -> legacy-compatible path

CONTEXT_ROUTING_POLICY=legacy-v1
  -> immediate rollback without migration/rebuild
```

### 7. Acceptance evidence

Write under:

`docs/development/CTX-RD-01-LIVE-ACCEPTANCE/`

Suggested files:

```text
environment.txt
runtime-config.json
legacy-smoke.json
balanced-smoke.json
temporal-safety.json
fallback-rollback.json
summary.md
```

Append:

```text
### Gemini Verification — CTX-RD-01 LIVE ACCEPTANCE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

Legacy-v1:
  smoke: PASS | FAIL

Balanced-scope-v1:
  smoke: PASS | FAIL
  routing status: <status>
  selected tier: <tier>
  entity before/after: <n>/<n>
  semantic retained: <n>/<n>
  recent retained: <n>/<n>
  rules retained: <n>/<n>
  protected overflow: false
  dropped artifacts: 0

Temporal safety:
  future participant leakage: 0
  superseded participant leakage: 0
  tenant isolation: PASS

Fallback/rollback:
  semantic/hybrid failure -> legacy: PASS | FAIL
  flag rollback -> legacy: PASS | FAIL

Production default changed: NO
P8-05: BLOCKED
```

Do not switch the production/default policy after smoke.

Astra reviews the acceptance evidence before any default activation decision.

### Gemini Verification — CTX-RD-01 LIVE ACCEPTANCE

Status: PASS
Tested commit: 7c95d6189d0b9a525718fbc35b906acf9cc50676
Evidence commit: 4d073497c61f5d8a7477c7d7c189ae4a055f090c

Legacy-v1:
  smoke: PASS

Balanced-scope-v1:
  smoke: PASS
  routing status: routed
  selected tier: 12000
  entity before/after: 25/5
  semantic retained: 8/8
  recent retained: 20/20
  rules retained: 4/4
  protected overflow: false
  dropped artifacts: 0

Temporal safety:
  future participant leakage: 0
  superseded participant leakage: 0
  tenant isolation: PASS

Fallback/rollback:
  semantic/hybrid failure -> legacy: PASS
  flag rollback -> legacy: PASS

Production default changed: NO
P8-05: BLOCKED
