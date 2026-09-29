# ACTIVE HANDOFF — EVALUATION / PILOT

> Repo: `Ephurin/Novel_sharing_platform`  
> Source of truth: latest `main`  
> Current mode: **evidence-first real-novel evaluation**  
> Active experiment: **EVAL-01E — Source-Faithful Provenance Generation A/B**  
> Do not change production architecture until the diagnostic is reviewed.

## Current verified baseline

Frozen corpus: `aethelgard-retrieval-eval-v1.0.0`

```text
core-gold              21 queries -> canonical 216 memories
challenge              19 queries -> audit 232 memories
Vietnamese diagnostic  10 queries -> canonical 216 memories
```

EVAL-01 corrected runtime:

```text
core semantic @10
Recall  0.674717
MRR     0.902381
nDCG    0.709746

core hybrid-v1 @10
Recall  0.738964
MRR     0.906349
nDCG    0.731047

future chapter leakage       0
stale/wrong embedding        0
generation execution         4/4
generation manual review     3 clean / 1 temporal-causal error
context budget-pressure      NOT_MEASURED
raw ingestion/extraction     NOT_MEASURED
```

Detailed review:
[ASTRA corrected EVAL-01 review](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-CORRECTED-RERUN-REVIEW.md)

## EVAL-01B — accepted diagnostic findings, not production changes

Machine evidence:
[diagnostic.json](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/diagnostic.json)

Corrected summary:
[summary.md](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/summary.md)

Evidence commit:

`014fb1d22a749b45838e8cda3f67f287ae3e74c2`

Gemini handoff commit:

`ed6aa76d6120023fb0fef38b19d9f268f0ed394b`

Machine-derived EVAL-01B result:

```text
queries_with_grade_minus_one           12
future_grade_minus_one_labels          20
same_or_past_query_conditioned_labels   5
semantic_grade_minus_one_top20_hits     5
hybrid_grade_minus_one_top20_hits       5
semantic_pairwise_failures              3
hybrid_pairwise_failures                3
cross_query_dual_role_memories         12
global_filter_safe                  false
```

Three pairwise failures:

```text
core_gold:rq-0011
  replay mem-000110 ch32      #1
  origin mem-000089 ch27      #2

challenge:rq-0023
  replay mem-000155 ch42      #4 hybrid
  origin mem-000149 ch40      #7 hybrid

challenge:rq-0025
  replay mem-000172 ch47      #1
  first burial mem-000164 ch45 #3
```

Important interpretation:

- grade `-1` is query-conditioned, not a global memory-invalid flag;
- a memory can be positive for one query and prohibited for another;
- therefore global deletion/filtering is unsafe;
- future-cutoff safety itself is working correctly.

Current HybridRanker temporal term is:

```text
age = cutoff_chapter - memory_chapter
temporal_score = 1 / (1 + age / 12)
```

For first/origin queries this recency preference can favor a later replay.

## Provenance finding — corrected layer localization

Do not say that `WritingContextPackage` inherently strips all semantic metadata.

Actual path:

```text
EventRecord.event_metadata
  -> PostgresSemanticMemoryRepository.list_event_memory_sources()
  -> EventMemorySource.metadata
  -> SemanticMemoryMaterializationService
  -> MemoryChunkRecord.memory_metadata
  -> SemanticMemoryMatch.metadata
  -> WritingService._semantic_match_payload()
```

`WritingService` does pass `match.metadata`.

However, `list_event_memory_sources()` currently projects only:

```text
event_type
chapter_number
source_type
importance_score
```

Source tags/review status such as:

```text
narrative_echo
temporal_reset
do_not_use_as_clean_ground_truth
review_status=ambiguous
```

do not currently survive semantic-memory materialization.

This is an EVAL finding, **not yet authorization to patch production**.

## EVAL-01C harness — MERGED

- PR: #12
- merge commit: `caac0f881bc5e9fb075839898f85c4dc69cbc8b9`
- Evaluation Pilot Harness CI: **SUCCESS**
- baseline recompute order mismatches: **0**

CI preview:

```text
policy                      core R@10   core nDCG   challenge R@10   challenge nDCG   pairwise failures
baseline                    0.738964    0.731047    0.746115         0.667668         3
neutral_first_occurrence    0.738964    0.730166    0.746115         0.668872         3
inverse_first_occurrence    0.729441    0.726604    0.746115         0.668872         3
```

First-occurrence pairwise results:

```text
core_gold:rq-0011
  baseline  positive #2 / replay #1
  neutral   positive #2 / replay #1
  inverse   positive #2 / replay #1

challenge:rq-0023
  baseline  positive #7 / replay #4
  neutral   positive #6 / replay #4
  inverse   positive #6 / replay #5

challenge:rq-0025
  baseline  positive #3 / replay #1
  neutral   positive #3 / replay #1
  inverse   positive #3 / replay #1
```

Preliminary interpretation:

- temporal recency alone is **not** the root cause of the 3 inversions;
- neutral/inverse recency do not remove any pairwise failure;
- inverse recency damages core Recall/nDCG;
- do not implement either temporal policy from this preview.

Dual-lane preview:

```text
top10 memories inspected                    400
provenance_variant                           83
positive memories in variant lane            26
same/past grade -1 in variant lane            5
same/past grade -1 left in primary lane       0
queries whose best positive is variant       11
mean annotation overhead            ~538 tokens/query
```

This supports **retain + annotate**, not suppression. Official evidence must still be generated from merged `main` by Gemini.

# NOW — EVAL-01C

Goal: compare candidate contracts offline before deciding whether a production implementation slice is justified.

Harness:

`scripts/run_eval_01c_dual_lane_intent.py`

EVAL-01C compares three ranking policies over the **same preserved semantic top-20 candidates**:

```text
1. baseline
   current accepted hybrid-v1

2. neutral_first_occurrence
   first-occurrence queries only:
   remove the temporal-recency contribution

3. inverse_first_occurrence
   first-occurrence queries only:
   diagnostic inverse-recency temporal contribution
```

Accepted production weights remain unchanged. Policies 2–3 are **offline simulations only**.

Deterministic intent classifier for this diagnostic:

```text
temporal_supersession
temporal_replay_hard_negative
  -> first_occurrence

lifecycle/history_temporal
  -> lifecycle_history

ambiguity/contradiction
  -> contradiction

future_leakage*
  -> future_cutoff

everything else
  -> generic
```

This classifier is diagnostic scaffolding, not an approved production query classifier.

## Dual-lane simulation

No memory is deleted.

Each retrieved memory is annotated offline as:

```text
primary_evidence
or
provenance_variant
```

Variant lane includes evidence with ambiguous/non-high-confidence/noncanonical or replay/conflict/attributed provenance markers.

Measure:

- how many top-10 memories enter the variant lane;
- how many **positive** memories also enter it;
- whether same/past replay negatives become distinguishable;
- whether any replay negative remains in the primary lane;
- how many queries have their best positive in the variant lane;
- estimated token overhead of carrying lane/status/review-status/tags.

A positive memory in the variant lane is **not a failure**. The point is to retain it with provenance rather than globally suppress it.

## Required EVAL-01C measurements

For baseline / neutral / inverse policies:

- core Recall@10 / MRR@10 / nDCG@10;
- challenge Recall@10 / MRR@10 / nDCG@10;
- first-occurrence subset metrics;
- replay-vs-positive pairwise failure count;
- per-query nDCG improvements/regressions;
- non-target query changes;
- exact three known replay cases.

Harness must also verify that recomputed baseline ordering matches preserved runtime hybrid ordering.

Expected:

```text
baseline_recompute.raw_order_mismatch_count = 0
```

If not zero, stop interpretation and report harness mismatch.

## Gemini / Antigravity — after EVAL-01C harness is merged

EVAL-01C is offline and **does not require an API key**.

Run on latest `main`:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01b_replay_diagnostic.py --stdout-only
python scripts/run_eval_01c_dual_lane_intent.py
```

Evidence directory:

```text
docs/development/EVAL-01C-DUAL-LANE-TEMPORAL-INTENT/
  diagnostic.json
  summary.md
```

Gemini must commit only evidence/handoff. Do not modify the harness or production code during the run.

## EVAL-01C decision questions

The report must let Astra/Supervisor answer:

1. Does removing recency for first-occurrence intent reduce the 3 replay inversions?
2. Does inverse recency reduce them further?
3. Which policy causes fewer metric regressions?
4. Are non-target queries unchanged?
5. Can provenance lane annotation distinguish replay/ambiguous evidence without deleting valid dual-role memories?
6. How many valid positives are themselves provenance variants?
7. What is the estimated context-token overhead?
8. Is the next justified change:
   - provenance propagation only;
   - intent-conditioned ranking only;
   - both;
   - neither?

Do **not** convert the experiment winner directly into production code.

### Gemini Verification & Handoff — EVAL-01C DUAL-LANE & INTENT DIAGNOSTIC

Status: COMPLETE (Offline Diagnostic)
Tested commit: e31afe72a237adcd5683ee7cab234f4a78514d77
Evidence commit: 4f7b5f0a1bf52aafbcd4cee986fe179675acf966
Evidence: docs/development/EVAL-01C-DUAL-LANE-TEMPORAL-INTENT/ (diagnostic.json, summary.md)

- Preflight guards:
  - P8 cleanup readiness: PASS
  - P8-05 cleanup gate: BLOCKED
  - EVAL-01 fixture contract: PASS
- Baseline Recompute Integrity:
  - `raw_order_mismatch_count`: 0 (exact match with preserved EVAL-01 runtime hybrid rankings)
- Decision Question Answers:
  1. Recency removal on first-occurrence intent: NO, does not resolve any of the 3 inversions (`rq-0011`: #2 vs #1, `rq-0023`: #6 vs #4, `rq-0025`: #3 vs #1). Total pairwise failures remain 3.
  2. Inverse recency: NO, pairwise failures still remain 3/3 (`rq-0011`: #2 vs #1, `rq-0023`: #6 vs #5, `rq-0025`: #3 vs #1).
  3. Metric regressions: Neutral first-occurrence preserves Core R@10 (0.738964) with trivial nDCG delta (0.731047 -> 0.730166). Inverse recency actively damages Core Recall (0.738964 -> 0.729441) and nDCG (0.731047 -> 0.726604).
  4. Non-target queries: UNCHANGED across all policies (intent classifier strictly isolates first_occurrence).
  5. Provenance lane annotation: YES, segregates 100% (5/5) same/past grade -1 replay hits into `provenance_variant`. Exactly 0 replay negatives remain in `primary_evidence`.
  6. Positive memories in variant lane: 26 positive memories (and 11 queries' best positives) are provenance variants. Global suppression/filtering of the variant lane is confirmed unsafe.
  7. Token overhead: Mean ~538 estimated tokens/query (max 580). This annotation-only overhead appears modest relative to 12k, but full context budget-pressure behavior remains NOT_MEASURED.
  8. Justified next step: **Provenance propagation only** (from `EventRecord.event_metadata` through to `MemoryChunkRecord` / `WritingContextPackage`). Do NOT change production ranking weights or implement intent-conditioned reranking.


## EVAL-01C-PROV — VERIFIED, AWAITING SUPERVISOR DECISION

Implementation:

- PR: #13
- merge commit: `ce51efef225d7a45ef89e6b54c66a74f07fe4eb2`

Correct verification references:

```text
tested commit:
96cbf963d2e1b83d08a074f29ae8b42dc53db707

original evidence commit:
94177a67f9920e04b4997cebfa892c135a0d1afa

Gemini handoff commit:
c7e3267e90014146d8fd86a94ef7a6060d5c8b46

Astra final review commit:
a5fac15860675c5b12f20029f334cea2c72fbb15
```

Evidence:

- [verification summary](docs/development/EVAL-01C-PROVENANCE-PROPAGATION/summary.md)
- [provenance smoke](docs/development/EVAL-01C-PROVENANCE-PROPAGATION/provenance-smoke.json)
- [test log](docs/development/EVAL-01C-PROVENANCE-PROPAGATION/tests.txt)
- [environment](docs/development/EVAL-01C-PROVENANCE-PROPAGATION/environment.txt)
- [Astra final review](docs/development/EVAL-01C-PROVENANCE-PROPAGATION/ASTRA-FINAL-REVIEW.md)

Verified result:

```text
GitHub CI                          PASS
local PostgreSQL + pgvector       PASS
integration suite                 6/6 PASS

tags propagation                  PASS
review_status propagation         PASS
status propagation                PASS
chapter_title propagation         PASS
memory_id propagation             PASS
importance_score propagation      PASS
supersedes_id propagation         PASS
source_type propagation           PASS
confirmation_status propagation   PASS

unallowlisted metadata            ABSENT
metadata-only embedding update    REUSED (0 embedded / 1 reused)
hybrid ranking                    UNCHANGED
temporal cutoff                   UNCHANGED
schema migration                  NONE
P8-05 cleanup                     BLOCKED
```

Scope remains narrow:

```text
EventRecord
  -> EventMemorySource
  -> MemoryChunkRecord.memory_metadata
  -> SemanticMemoryMatch.metadata
  -> WritingService payload
```

No ranking/filter/model/embedding/cutoff/schema change was introduced.

Current gate:

```text
EVAL-01C-PROV implementation      MERGED
CI verification                   PASS
Gemini local verification         PASS
Astra final review                VERIFIED
Supervisor ACCEPT                 PENDING
```

Do not open another production implementation slice automatically.

After Supervisor decision, return to Evaluation / Pilot. Remaining experiment questions include:

- provenance-aware prompt/lane presentation;
- full context packing under token pressure;
- broader generation quality;
- raw 61-chapter ingestion/extraction quality.

These are experiment questions, not implied defects.

## Astra review — EVAL-01C

Verdict:

```text
intent-conditioned temporal reranking   NOT JUSTIFIED
inverse/neutral temporal policy          REJECTED
global variant suppression/filtering     REJECTED
provenance propagation                   JUSTIFIED AS NARROW IMPLEMENTATION
dual-lane prompt presentation            NOT YET IMPLEMENTED
full context budget pressure             NOT_MEASURED
```

Implementation contract:

[EVAL-01C provenance propagation](docs/development/EVAL-01C-PROVENANCE-PROPAGATION-implementation.md)

The implementation slice may preserve provenance metadata only. It must not alter ranking, candidate filtering, embedding, temporal cutoff, or cleanup state.

After merge, Gemini performs local verification and commits evidence under:

```text
docs/development/EVAL-01C-PROVENANCE-PROPAGATION/
```

## EVAL-01D harness — MERGED

- PR: #14
- merge commit: `3fdaca001585f1b6cdd567b8eb8e20517040145e`
- Evaluation Pilot Harness CI: **SUCCESS**
- prompt isolation: **PASS on 5/5 cases**

CI dry-run confirmed for every case:

```text
only_new_provenance_fields_differ = true
same_selected_memory_ids           = true
same_dropped_memory_ids            = true
same_system_prompt                 = true
```

Observed estimated context overhead for post-provenance:

```text
rq-0011   +800 tokens
rq-0023   +795 tokens
rq-0025   +792 tokens
rq-0036   +786 tokens
rq-0010   +800 tokens
```

No live provider call occurred in CI.

Current state:

```text
EVAL-01D harness         MERGED
CI isolation contract    PASS
live Gemini A/B          PENDING
blind Astra review       PENDING
condition reveal         PENDING
```

## NOW — EVAL-01D Provenance-Aware Generation A/B

EVAL-01C-PROV remains technically VERIFIED; Supervisor ACCEPT is still separate.

EVAL-01D asks a different question:

```text
provenance metadata reaches the LLM prompt       VERIFIED
does the LLM use it to improve replay handling?  NOT YET MEASURED
```

Runbook:

[docs/development/EVAL-01D-PROVENANCE-GENERATION-AB-runbook.md](docs/development/EVAL-01D-PROVENANCE-GENERATION-AB-runbook.md)

Harness:

`scripts/run_eval_01d_provenance_ab.py`

Controlled cases:

```text
core_gold:rq-0011      sword origin vs replay
challenge:rq-0023      first Pillar No. 2 destruction
challenge:rq-0025      first cavalry burial
core_gold:rq-0036      sword lifecycle + replay exclusion
core_gold:rq-0010      negative control for unrelated causal error
```

A/B isolation:

```text
same query
same cutoff
same top-10 candidate IDs/order/content
same component scores
same ContextBudgetPacker
same production LLM prompt renderer
same model / temperature / constraints

A = pre-EVAL-01C metadata projection
B = A + compact provenance metadata
```

Default live run:

```text
model            gemini-3.5-flash-lite
temperature      0.0
repeats          3 per condition/case
live calls       30
key policy       one fixed slot for entire run
fallback model   NONE
quality scoring  REVIEW_REQUIRED
```

CI only runs:

```bash
python scripts/run_eval_01d_provenance_ab.py --dry-run --stdout-only
```

CI dry-run must prove prompt isolation before the harness is merged.

### Gemini / Antigravity — after harness merge

Use latest `main`.

Do not open `condition-key.json` or score outputs.

Run:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01d_provenance_ab.py --dry-run --stdout-only
python scripts/run_eval_01d_provenance_ab.py --key-slot 1
```

If another fixed slot is intentionally chosen, set it once for the whole run. Never rotate keys during measurement.

Commit evidence only:

```text
docs/development/EVAL-01D-PROVENANCE-GENERATION-AB/
  runtime-config.json
  prompt-diff-audit.json
  raw-generations.json
  review-blind.json
  condition-key.json
  review-rubric.md
  latency-cost.json
  summary.md
```

Handoff must report execution only:

```text
Status: PASS | PARTIAL | BLOCKED
tested commit
evidence commit
prompt isolation PASS/FAIL
fixed key slot label
model
successful calls / 30
provider backoff events
latency by condition
quality = REVIEW_REQUIRED
P8-05 = BLOCKED
```

### Gemini Verification — EVAL-01D PROVENANCE-AWARE GENERATION A/B

Status: PASS
Tested commit: 03af3d735f894ffce0a15e87e34ba3df1dcf65e7
Evidence commit: e06fede23f792bbd9ca712a57baa6f7f4d164fde

- Prompt isolation: PASS (5/5 cases: only_new_provenance_fields_differ=true, same_selected_memory_ids=true, same_dropped_memory_ids=true, same_system_prompt=true)
- Fixed key slot label: slot-1
- Model: gemini-3.5-flash-lite (temperature=0.0)
- Successful calls: 30 / 30
- Provider backoff events: 0
- Latency by condition:
  - pre_provenance: mean=1913.89ms, p50=1897.66ms, max=2473.71ms (sample_count=15)
  - post_provenance: mean=1776.02ms, p50=1747.32ms, max=2181.87ms (sample_count=15)
- Quality: REVIEW_REQUIRED (blind review-blind.json and review-rubric.md preserved; condition-key.json untouched)
- P8-05 cleanup gate: BLOCKED
- Evidence: docs/development/EVAL-01D-PROVENANCE-GENERATION-AB/

Gemini must not declare A or B the winner.

Astra reviews the blind outputs first, commits the blind review, and only then reveals the condition mapping.

## Astra final review — EVAL-01D

Review commit:

`9ba1dc90aaa2b018d1c962abe50f4275a477f464`

Correct references:

```text
tested commit:
03af3d735f894ffce0a15e87e34ba3df1dcf65e7

evidence commit:
e06fede23f792bbd9ca712a57baa6f7f4d164fde
```

Execution:

```text
30 / 30 live calls       PASS
prompt isolation          PASS
fixed key                 slot-1
backoff                    0
P8-05                      BLOCKED
```

Frozen qualitative mapping after reveal:

```text
pre_provenance:
PASS     11
PARTIAL   4
FAIL      0

post_provenance:
PASS     12
PARTIAL   3
FAIL      0
```

For the four provenance-focused cases only:

```text
pre_provenance   11 PASS / 1 PARTIAL
post_provenance  12 PASS / 0 PARTIAL
```

This is a small directional gain, not enough to authorize a production prompt change.

Critical confound:

```text
mem-000110 already says "... even though the same sword was already forged ..."
mem-000155 already says "again depicts ..."
mem-000164 already says "yet again ..."
mem-000172 already says "again depicts ..."
```

So the pre-provenance condition already receives editorial replay information inside `memory.content`.

Review protocol limitation:

- Astra accidentally inspected condition-labelled `raw-generations.json` during integrity review;
- therefore the run must not be described as a valid blind human review;
- `ASTRA-PRE-REVEAL-REVIEW.md` froze X/Y judgments before intentionally opening the condition key;
- final quality conclusion remains exploratory.

Decision:

```text
provenance propagation              KEEP
dual-lane / provenance prompt       NOT JUSTIFIED YET
ranking change                      NOT JUSTIFIED
global suppression                  REJECTED
```

Next experiment must remove the editorial-content confound and use a truly sealed two-stage review protocol.

## EVAL-01E harness — MERGED

- PR: #15
- merge commit: `c0cbc09b11f18e9f96e998ae0bcdc8a69f29835e`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36390701491`
- dry-run isolation: **PASS 7/7**
- frozen files mutated: **false**
- neutral fixture version: `eval01e-neutral-view-v1`
- neutral fixture SHA256: `76e4642bdf2ef2fe576aa09dfa71a7f6e0727d92bcc3dd4de564f190aa5dd982`

Dry-run:

```text
cases               7
repeats             3
planned live calls  42
model               gemini-3.5-flash-lite
temperature         0.0
A/B isolation       PASS
```

For every case:

```text
only_new_provenance_fields_differ = true
same_selected_memory_ids           = true
same_dropped_memory_ids            = true
same_system_prompt                 = true
```

Observed post-provenance context overhead:

```text
rq-0011   +801 estimated tokens
rq-0023   +795
rq-0025   +792
rq-0020   +811
rq-0032   +836
rq-0038   +763
rq-0010   +800
```

Reviewer-safe capture contract verified statically:

```text
capture may commit:
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  neutralization-audit.json
  sealed-state.json
  summary.md

capture does NOT commit:
  condition-key.json
  raw-generations.json
  prompt-diff-audit.json

private state:
  .eval-private/eval01e-private.json
  gitignored
```

Current state:

```text
EVAL-01E harness       MERGED
CI dry-run             PASS
live capture           COMPLETE (42/42 live calls, slot-1)
Astra blind review     PENDING
reveal                 BLOCKED until blind review commit
```

## NOW — EVAL-01E Sealed Provenance Generation A/B

Purpose:

```text
EVAL-01D showed only a small directional gain
but replay judgments were already embedded in memory.content.

EVAL-01E removes that editorial-content confound
and repairs the blind-review protocol.
```

Harness:

`scripts/run_eval_01e_sealed_provenance_ab.py`

Neutral derived fixture:

`benchmarks/eval01e_neutral_context.json`

Runbook:

[docs/development/EVAL-01E-SEALED-PROVENANCE-AB-runbook.md](docs/development/EVAL-01E-SEALED-PROVENANCE-AB-runbook.md)

Cases:

```text
rq-0011 origin
rq-0023 repeated Pillar destruction
rq-0025 repeated cavalry state
rq-0020 conflicting attributed history
rq-0032 source-status supersession
rq-0038 physical-identity provenance
rq-0010 negative control
```

Default live design:

```text
model            gemini-3.5-flash-lite
temperature      0.0
repeats          3
cases            7
conditions       2
live calls       42
fixed key slot   one slot for whole run
fallback         NONE
```

Protocol:

```text
CI:
  --stage dry-run only

Gemini capture:
  live calls
  commit reviewer-safe X/Y only
  keep mapping/raw labels in .eval-private/
  publish SHA256 commitment

Astra:
  review only reviewer-blind.json + rubric
  commit blind review

Gemini reveal:
  zero provider calls
  verify commitment hash
  commit condition key + raw audit

Astra:
  reveal/aggregate
  decide next experiment
```

Until Astra blind review is committed:

- do not run `--stage reveal`;
- do not commit `.eval-private/`;
- do not expose condition mapping;
- do not declare A/B winner.

### New machine / local setup for Gemini

The repo was freshly synchronized on a new machine.

Local Gemini secret source remains:

`key.txt`

Do not print or commit it.

Harness expects:

`.env.eval.local`

with fixed-slot names:

```text
GEMINI_API_KEY_SLOT_1=<secret>
GEMINI_API_KEY_SLOT_2=<secret>
GEMINI_API_KEY_SLOT_3=<secret>
GEMINI_API_KEY_SLOT_4=<secret>
```

Full safe bootstrap instructions:

[New-machine bootstrap in EVAL-01E runbook](docs/development/EVAL-01E-SEALED-PROVENANCE-AB-runbook.md#new-machine-bootstrap)

Required local setup on Windows PowerShell:

```powershell
git switch main
git pull origin main

py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\ai-service\requirements.txt

git check-ignore -q key.txt
if ($LASTEXITCODE -ne 0) { throw "key.txt is not ignored" }

git check-ignore -q .env.eval.local
if ($LASTEXITCODE -ne 0) { throw ".env.eval.local is not ignored" }
```

Then create `.env.eval.local` **locally from `key.txt` without echoing key values** using the safe bootstrap snippet in the runbook.

Rules:

- never `cat`, `type`, `Get-Content`, echo, screenshot, log, or commit secret values;
- if `key.txt` contains one bare key, map it to slot 1;
- if it contains multiple bare keys, map them sequentially to slots 1..N;
- if it already contains `GEMINI_API_KEY_SLOT_N=value`, preserve those slot numbers;
- if only `GEMINI_API_KEY=value` exists, map it to slot 1;
- verify only file existence and slot numbers, never secret content;
- `git status --short` must not show `key.txt` or `.env.eval.local`.

For EVAL-01E capture choose one fixed slot before starting. Default:

`--key-slot 1`

Do not rotate keys during the 42-call run. If the chosen slot cannot finish after same-key backoff, stop and report PARTIAL/BLOCKED. A retry on another slot must rerun the full experiment from a clean capture state.

Use the venv Python for preflight and capture:

```powershell
.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01e_sealed_provenance_ab.py --stage dry-run
.\.venv\Scripts\python.exe scripts/run_eval_01e_sealed_provenance_ab.py --stage capture --key-slot 1
```

If `.venv` already exists and dependencies import correctly, reuse it.

Gemini capture command after harness merge:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01e_sealed_provenance_ab.py --stage dry-run
python scripts/run_eval_01e_sealed_provenance_ab.py --stage capture --key-slot 1
```

Evidence to commit after capture:

```text
docs/development/EVAL-01E-SEALED-PROVENANCE-AB/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  neutralization-audit.json
  sealed-state.json
  summary.md
```

Do not commit reveal artifacts yet.

### Gemini Verification — EVAL-01E SEALED PROVENANCE GENERATION A/B

Status: PASS
Tested commit: bb41fd2fbfc354e051f36e91d54fc61fb4e91192
Evidence: docs/development/EVAL-01E-SEALED-PROVENANCE-AB/

- Preflight guards:
  - P8 cleanup readiness: PASS
  - P8-05 cleanup gate: BLOCKED
  - EVAL-01 fixture contract: PASS
- Prompt isolation: PASS (7/7 cases: only_new_provenance_fields_differ=true, same_selected_memory_ids=true, same_dropped_memory_ids=true, same_system_prompt=true)
- Fixed key slot label: slot-1
- Model: gemini-3.5-flash-lite (temperature=0.0)
- Successful calls: 42 / 42
- Provider backoff events: 0
- Sealed state SHA256: 09aaa4415a6f717f49be5b67847f83b5d743aed36da3d690ecee4042100a4c7c
- Quality scoring: BLIND_REVIEW_REQUIRED (reviewer-blind.json and review-rubric.md committed; condition mapping sealed in gitignored .eval-private/eval01e-private.json)
- P8-05 cleanup gate: BLOCKED
- Next gate: Astra blind review PENDING; condition reveal BLOCKED until blind review commit

## Frozen production contract — do not drift

- embedding: `gemini-embedding-2`, 768 dimensions, explicit L2;
- embedding version: `gemini-embedding-2-768-v1`;
- cosine: `<=>`;
- temporal chapter cutoff before semantic ranking;
- hybrid-v1 weights:
  ```text
  0.75 semantic
  + 0.03 entity_overlap
  + 0.08 temporal
  + 0.10 importance
  + 0.04 relationship
  ```
- no ANN/HNSW/IVFFlat;
- semantic memory remains derived/rebuildable;
- no frozen-gold mutation;
- no automatic architecture changes.

## P8-05 remains blocked

```text
Evaluation / Pilot          = ACTIVE
P8-05 destructive cleanup   = BLOCKED_PENDING_STABILITY
```

Never set `supervisor_cleanup_gate_accepted=true` by inference.

## Roles

```text
Astra / ChatGPT
  design harness
  review evidence
  prepare implementation proposal only if justified

Gemini / Antigravity
  execute merged harness on main
  commit evidence
  do not broaden scope

Supervisor
  final decision / ACCEPT
```

## References

- [EVAL-01C script](scripts/run_eval_01c_dual_lane_intent.py)
- [EVAL-01B diagnostic](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/diagnostic.json)
- [EVAL-01B corrected summary](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/summary.md)
- [EVAL-01 runtime evidence](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/)
- [Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)
- [Phase 0–8 archive](docs/development/archive/P0-P8-HANDOFF-through-2026-09-26.md)
