# ACTIVE HANDOFF — EVALUATION / PILOT

> Repo: `Ephurin/Novel_sharing_platform`  
> Source of truth: latest `main`  
> Current mode: **evidence-first real-novel evaluation**  
> Active experiment: **EVAL-01O — Sealed Live Relevance-Density Micro-Validation**  
> EVAL-01L is closed. Do not change production architecture until EVAL-01M live evidence is blind-reviewed and revealed.

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
Astra blind review     COMPLETE (ce3494e)
reveal                 COMPLETE (628297a)
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

## EVAL-01E blind review — COMPLETE, REVEAL AUTHORIZED

Astra blind review commit:

`ce3494e740ef0ca744d4ad7b0c107f39b333af19`

Blind integrity:

```text
reviewer-safe capture     VERIFIED
condition mapping seen    NO
raw condition labels seen NO
private state seen        NO
blind review frozen       YES
```

Frozen blind aggregate:

```text
X:
PASS      15 / 21
PARTIAL    6 / 21
FAIL       0 / 21

Y:
PASS      15 / 21
PARTIAL    6 / 21
FAIL       0 / 21
```

Case-level blind pattern:

```text
rq-0011 origin
  X  0 PASS / 3 PARTIAL
  Y  1 PASS / 2 PARTIAL

rq-0023 repeated Pillar
  X  3 PASS
  Y  3 PASS

rq-0025 cavalry state
  X  3 PASS
  Y  2 PASS / 1 PARTIAL

rq-0020 attributed history
  X  3 PASS
  Y  3 PASS

rq-0032 source-status supersession
  X  3 PASS
  Y  3 PASS

rq-0038 physical identity
  X  3 PASS
  Y  3 PASS

rq-0010 negative control
  X  0 PASS / 3 PARTIAL
  Y  0 PASS / 3 PARTIAL
```

Reviewer artifact:

[ASTRA blind review](docs/development/EVAL-01E-SEALED-PROVENANCE-AB/ASTRA-BLIND-REVIEW.md)

### Gemini / Antigravity — REVEAL NOW AUTHORIZED

Use the **same local workspace** that still contains:

`.eval-private/eval01e-private.json`

Do not regenerate live outputs.

Run only:

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/run_eval_01e_sealed_provenance_ab.py --stage reveal
```

Reveal requirements:

```text
expected sealed SHA256:
09aaa4415a6f717f49be5b67847f83b5d743aed36da3d690ecee4042100a4c7c

provider calls during reveal   0
commitment match              true
blind review modification     forbidden
new live generation           forbidden
```

Commit only reveal-stage artifacts:

```text
docs/development/EVAL-01E-SEALED-PROVENANCE-AB/
  condition-key.json
  raw-generations.json
  prompt-diff-audit.json
  latency-cost.json
  reveal-verification.json
```

Also append a concise handoff to `promt.md` containing:

```text
Status: PASS | BLOCKED
Blind review commit: ce3494e740ef0ca744d4ad7b0c107f39b333af19
Reveal tested commit: <sha>
Reveal evidence commit: <sha>
commitment match: true | false
private state SHA256: <sha>
provider calls during reveal: 0
condition mapping committed: true | false
raw audit committed: true | false
P8-05: BLOCKED
```

Gemini must not interpret which condition won. Astra will map the already-frozen X/Y judgments after reveal.

### Gemini Verification — EVAL-01E SEALED PROVENANCE REVEAL

Status: PASS
Blind review commit: ce3494e740ef0ca744d4ad7b0c107f39b333af19
Reveal tested commit: 9e3e5b29de4e378718f74ba207c344cd202b8199
Reveal evidence commit: 628297af288f8b3beb22cff29b1498b780610ffb
commitment match: true
private state SHA256: 09aaa4415a6f717f49be5b67847f83b5d743aed36da3d690ecee4042100a4c7c
provider calls during reveal: 0
condition mapping committed: true
raw audit committed: true
P8-05: BLOCKED

## EVAL-01E final interpretation

Astra final review:

`docs/development/EVAL-01E-SEALED-PROVENANCE-AB/ASTRA-FINAL-REVIEW.md`

Review commit:

`7a7e5557571255284b34f0d28ec9fa5eb0229c0a`

Mapped blind result:

```text
pre_provenance:
PASS      14 / 21
PARTIAL    7 / 21
FAIL       0

post_provenance:
PASS      16 / 21
PARTIAL    5 / 21
FAIL       0

post improvements  2
post regressions   0
ties              19
```

Interpretation:

```text
provenance propagation               KEEP
generation value                     SUPPORTED, SMALL/DIRECTIONAL
verbose provenance prompt policy     NOT JUSTIFIED YET
ranking change                       NOT JUSTIFIED
full-system budget pressure          NOT_MEASURED
```

No production change is authorized.

## EVAL-01F harness — MERGED

- PR: #16
- merge commit: `ccff4caead957ce6bc040d3823f917d958129ff3`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36671679946`
- provider calls in CI: **0**

CI preview:

```text
cases                                  7
conditions                             3
budget points                         11

mean full provenance overhead        799.71 estimated tokens
mean compact provenance overhead     370.29 estimated tokens
compact overhead reduction            53.70%

target reduction >= 50%               PASS
compact dominance vs full             PASS
dominance failures                       0
```

The dominance invariant checks all 7 cases across all 11 residual budgets:

```text
compact selected_count             >= full
compact retained_positive_count    >= full
compact retained_critical_count    >= full
```

No production code was changed.

Current state:

```text
EVAL-01F harness          MERGED
CI offline diagnostic     PASS
official main evidence    COMPLETE (df39431)
live provider calls       NOT AUTHORIZED / NOT NEEDED
```

### Gemini / Antigravity — run official EVAL-01F evidence now

Use latest `main`.

No API key is required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01f_compact_provenance_budget.py
```

If the venv is not present, use the new-machine bootstrap already documented for EVAL-01E first. Gemini API configuration is unnecessary for this offline diagnostic.

Commit evidence only:

```text
docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/
  diagnostic.json
  summary.md
```

Then append handoff:

```text
### Gemini Verification — EVAL-01F COMPACT PROVENANCE BUDGET

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- P8 cleanup readiness: <result>
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: <result>
- Provider calls: 0
- Mean full overhead: <value>
- Mean compact overhead: <value>
- Compact overhead reduction: <value>
- Reduction target >=50%: PASS | FAIL
- Compact dominance failures vs full: <count>
- Positive-retention frontiers: <summary>
- Critical-retention frontiers: <summary>
- Evidence: docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/
```

Gemini must not start a live three-condition generation run. Astra reviews EVAL-01F evidence first.

### Gemini Verification — EVAL-01F COMPACT PROVENANCE BUDGET

Status: PASS
Tested commit: 7514027abc1f4e92ffcb3c3684750b27a26ea5ea
Evidence commit: df39431df8d5d9f8b28d91dc606b8b35247d82dd

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Provider calls: 0
- Mean full overhead: 799.71 estimated tokens
- Mean compact overhead: 370.29 estimated tokens
- Compact overhead reduction: 53.70%
- Reduction target >=50%: PASS
- Compact dominance failures vs full: 0
- Positive-retention frontiers: rq-0011: 3000 compact vs 3500 full; rq-0032: 2750 compact vs 3500 full; rq-0010: 4000 compact vs 4500 full; remaining 4 cases retain all positives down to 2000
- Critical-retention frontiers: 6/7 cases retain all critical memories down to 2000 in all conditions; rq-0010: 4000 compact vs 4500 full
- Evidence: docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/

## NOW — EVAL-01F Compact Provenance + Residual Semantic Budget

Goal:

```text
preserve useful provenance signals
while reducing ~800-token top-10 overhead
and measure evidence-drop frontier under semantic budget pressure
```

Harness:

`scripts/run_eval_01f_compact_provenance_budget.py`

Runbook:

[docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET-runbook.md](docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET-runbook.md)

Conditions:

```text
pre_provenance
full_provenance
compact_provenance
```

Compact form:

```text
pre metadata
+ provenance="status=...|review=...|tags=...|supersedes=..."
```

Redundant prompt fields intentionally omitted from compact representation:

```text
confirmation_status
memory_id        # already memory_chunk_id
chapter_title
```

Offline only:

```text
provider calls       0
API key required     NO
frozen mutation      NO
production change    NO
```

Pressure sweep:

```text
12000, 6000, 5000, 4500, 4000, 3500,
3000, 2750, 2500, 2250, 2000
```

Reduced budgets model residual semantic-memory budget after higher-priority canonical context. They are **not** a full-system context reconstruction.

Decision checks:

```text
mean compact provenance overhead reduction >= 50%

at each same residual budget:
  compact selected_count          >= full
  compact positive retention      >= full
  compact critical retention      >= full
```

### Gemini / Antigravity — after EVAL-01F harness merge

Run on latest `main`:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01f_compact_provenance_budget.py
```

No Gemini API key is needed.

Commit evidence only:

```text
docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/
  diagnostic.json
  summary.md
```

Handoff should report:

```text
Status: PASS | PARTIAL | BLOCKED
tested commit
evidence commit
mean full overhead
mean compact overhead
compact overhead reduction
dominance failures vs full
positive-retention frontiers
critical-retention frontiers
P8-05: BLOCKED
```

Do not start a live three-condition generation experiment until Astra reviews EVAL-01F.

## EVAL-01F final interpretation

Astra final review:

`docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/ASTRA-FINAL-REVIEW.md`

Review commit:

`503bef319630fade0f0dad156bceb92298853e25`

Verdict:

```text
compact provenance overhead reduction      53.70% PASS
compact dominance failures                     0
full verbose provenance next-live candidate  DROP
compact provenance next candidate            KEEP
production compact prompt                    NOT AUTHORIZED
full-system 12k pressure                     NOT_MEASURED
```

## EVAL-01G harness — MERGED

- PR: #17
- merge commit: `a1759b3e33031248abaa746aee7b71377ce96b40`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36677371273`
- provider calls in CI: **0**
- contract failures: **0**

CI 12k preview:

```text
pre_provenance
  mean estimated before pack      18310.14
  mean tokens used                11972.29
  mean selected entities             69.57
  mean selected world rules           8.29
  mean selected recent events          0.29
  mean selected semantic memories      6.43
  mean positive retention             0.690
  mean critical retention             0.690
  cases all positives retained        4 / 7
  cases all critical retained         4 / 7

full_provenance
  mean estimated before pack      19896.29
  mean tokens used                11952.71
  mean selected entities             69.57
  mean selected world rules           8.29
  mean selected recent events          0.14
  mean selected semantic memories      4.57
  mean positive retention             0.519
  mean critical retention             0.595
  cases all positives retained        2 / 7
  cases all critical retained         3 / 7

compact_provenance
  mean estimated before pack      19035.71
  mean tokens used                11973.71
  mean selected entities             69.57
  mean selected world rules           8.29
  mean selected recent events          0.29
  mean selected semantic memories      5.43
  mean positive retention             0.519
  mean critical retention             0.643
  cases all positives retained        2 / 7
  cases all critical retained         3 / 7
```

Contract checks:

```text
deterministic packing                     PASS
locked entities retained                  PASS
locked entity states retained             PASS
locked rules retained                     PASS
author constraints retained               PASS
protected overflow                        false
compact semantic count >= full @12k       PASS
compact positive retention >= full @12k   PASS
compact critical retention >= full @12k   PASS
```

Important preliminary signal — do not convert directly into production code:

```text
ContextBudgetPacker priority appears to spend most of the 12k package on
entity/state bundles and world rules before semantic/recent evidence.

At 12k in this production-shaped fixture:
  ~70 entity bundles survive on average
  semantic memories fall to ~4.6-6.4 / 20
  recent events are almost completely starved
```

This may be a larger context-selection bottleneck than provenance verbosity itself.

However the fixture is still source-grounded production-shaped, not a literal live PostgreSQL context snapshot. Astra must review official main evidence before authorizing a packer policy experiment.

Current state:

```text
EVAL-01G harness        MERGED
CI contract             PASS
official main evidence  COMPLETE (d49bf0d)
production change       NOT AUTHORIZED
```

### Gemini / Antigravity — run official EVAL-01G evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01g_full_context_pressure.py
```

Commit only:

```text
docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01G FULL CONTEXT PRESSURE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- P8 cleanup readiness: <result>
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: <result>
- Provider calls: 0
- Fixture claim: source-grounded production-shaped
- Contract failures: <count>
- 12k pre aggregate: <summary>
- 12k full aggregate: <summary>
- 12k compact aggregate: <summary>
- Protected overflow: <result>
- Cases all positives retained by condition: <summary>
- Cases all critical retained by condition: <summary>
- Evidence: docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/
```

Gemini must not modify packer priority or start a live generation run. Astra reviews official evidence first.

### Gemini Verification — EVAL-01G FULL CONTEXT PRESSURE

Status: PASS
Tested commit: 41155020f0c249f6c20d44fa59b97fbd9ae722c8
Evidence commit: d49bf0da77f654e2adfdb82844b63541091cd36f

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Provider calls: 0
- Fixture claim: source-grounded production-shaped
- Contract failures: 0 (deterministic packing PASS, locked entities/rules retained PASS, constraints retained PASS)
- 12k pre aggregate: 11972.29 tokens used, 69.57 entities, 8.29 rules, 0.29 recent events, 6.43 semantic memories, pos_ret=0.690, crit_ret=0.690
- 12k full aggregate: 11952.71 tokens used, 69.57 entities, 8.29 rules, 0.14 recent events, 4.57 semantic memories, pos_ret=0.519, crit_ret=0.595
- 12k compact aggregate: 11973.71 tokens used, 69.57 entities, 8.29 rules, 0.29 recent events, 5.43 semantic memories, pos_ret=0.519, crit_ret=0.643
- Protected overflow: false (0 occurrences across all conditions and budgets)
- Cases all positives retained by condition: pre=4/7, full=2/7, compact=2/7
- Cases all critical retained by condition: pre=4/7, full=3/7, compact=3/7
- Evidence: docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/

## NOW — EVAL-01G Full 12k Context Pressure Reconstruction

Goal:

```text
reconstruct a source-grounded production-shaped WritingContextPackage
and let all ContextBudgetPacker layers compete inside the actual 12k budget
```

Harness:

`scripts/run_eval_01g_full_context_pressure.py`

Runbook:

[docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE-runbook.md](docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE-runbook.md)

Fixture layers:

```text
entities          <- .data/Batch_7/entities.json
current states    <- latest canonical Frozen_v1 memory pointer per entity
world rules       <- canonical memories tagged world_rule
recent events     <- canonical event_summary memories near cutoff
semantic memories <- preserved EVAL-01 top-20 + EVAL-01E neutral view
author constraints<- evaluation constraints
```

Important claim boundary:

```text
source-grounded + production-shaped
NOT a literal PostgreSQL runtime snapshot
```

Experimental stress policies:

```text
locked entities:
  entities referenced by case-specific critical memories

locked world rules:
  high_confidence + importance >= 0.95
```

These lock markers are packer-test policy, not story facts.

Conditions:

```text
pre_provenance
full_provenance
compact_provenance
```

Budgets:

```text
12000 primary
10000 sensitivity
8000  sensitivity
```

PASS contract:

```text
deterministic packing                     PASS
locked entities retained                  PASS
locked entity states retained             PASS
locked rules retained                     PASS
author constraints retained               PASS
protected overflow                        false

at 12k:
compact semantic count          >= full
compact positive retention      >= full
compact critical retention      >= full
```

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01g_full_context_pressure.py
```

Commit only:

```text
docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- Provider calls: 0
- Fixture claim: source-grounded production-shaped
- Contract failures: <count>
- 12k pre aggregate: <summary>
- 12k full aggregate: <summary>
- 12k compact aggregate: <summary>
- Protected overflow: <result>
- Cases all positives retained by condition
- Cases all critical retained by condition
- P8-05: BLOCKED
```

Do not start live generation until Astra reviews EVAL-01G.

## EVAL-01G final interpretation

Astra final review:

`docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/ASTRA-FINAL-REVIEW.md`

Review commit:

`75ed5d6104900c3d055c4cb11ac6076feb2f79a5`

Critical correction:

```text
EVAL-01G semantic input   top-20 stress
production default        top-8

SemanticRetrieverService.default_limit = 8
Writing generation does not override semantic_limit
```

Therefore:

```text
full-package pressure                  VERIFIED AS STRESS
production default semantic starvation NOT YET PROVEN
entity/state input breadth             PLAUSIBLE BOTTLENECK
packer algorithm defect                NOT YET PROVEN
```

Do not use EVAL-01G alone to justify a production packer rewrite.

## EVAL-01H harness — MERGED

- PR: #18
- merge commit: `9dc2f92935a134c9e8f300d7cd853a1ffd3ff792`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36678524242`
- provider calls in CI: **0**
- contract failures: **0**

Production-shaped defaults used:

```text
semantic limit   8
recent limit    20
provenance       compact
packer           unchanged
budget           12000 primary
```

CI 12k preview:

```text
baseline_prod8
  mean input entities       69.57
  mean selected entities    69.57
  mean selected rules        8.29
  mean selected recent       1.00 / 20
  mean selected semantic     4.71 / 8
  positive retention         0.571
  critical retention         0.667
  all positives retained     4 / 7 cases
  all critical retained      4 / 7 cases
  zero-semantic cases        2 / 7
  zero-recent cases          4 / 7

retrieval_scoped_entities
  mean input entities       15.71
  mean selected entities    15.71
  mean selected rules       10.57
  mean selected recent      20.00 / 20
  mean selected semantic     8.00 / 8
  positive retention         1.000
  critical retention         1.000
  all positives retained     7 / 7
  all critical retained      7 / 7
  zero-semantic cases        0
  zero-recent cases          0
  scope coverage             1.000

balanced_scoped_entities
  mean input entities       21.57
  mean selected entities    21.57
  mean selected rules       10.57
  mean selected recent      20.00 / 20
  mean selected semantic     8.00 / 8
  positive retention         1.000
  critical retention         1.000
  all positives retained     7 / 7
  all critical retained      7 / 7
  zero-semantic cases        0
  zero-recent cases          0
  scope coverage             1.000
```

Contract held across 12k / 10k / 8k:

```text
deterministic packing                 PASS
required scope retained               PASS
protected artifacts retained          PASS
protected overflow                    false
positive retention                  >= baseline
critical retention                  >= baseline
recent retention                    >= baseline
world-rule retention                >= baseline
```

Preliminary interpretation:

```text
EVAL-01G top-20 stress finding        CORRECTED
production-limit starvation           STILL OBSERVED
entity/state breadth                  STRONG BOTTLENECK CANDIDATE
packer scheduler rewrite              NOT YET REQUIRED
input scoping                         STRONGER / NARROWER NEXT CANDIDATE
```

The scoped policies recover evidence without changing ContextBudgetPacker.

Do not productionize from CI preview alone.

Current state:

```text
EVAL-01H harness        MERGED
CI contract             PASS
official main evidence  COMPLETE (66dffab)
production change       NOT AUTHORIZED
```

### Gemini / Antigravity — run official EVAL-01H evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01h_prod8_context_scope.py
```

Commit only:

```text
docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01H PRODUCTION-LIMIT CONTEXT SCOPE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- P8 cleanup readiness: <result>
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: <result>
- Provider calls: 0
- semantic limit: 8
- recent limit: 20
- contract failures: <count>
- baseline 12k aggregate: <summary>
- retrieval-scoped 12k aggregate: <summary>
- balanced-scoped 12k aggregate: <summary>
- 10k/8k sensitivity: <summary>
- protected overflow: <result>
- Evidence: docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/
```

Gemini must not modify ContextBudgetPacker or repository scoping. Astra reviews official evidence first.

### Gemini Verification — EVAL-01H PRODUCTION-LIMIT CONTEXT SCOPE

Status: PASS
Tested commit: 2c8b4df65ecd6cd26051008d13f419f696c6b34e
Evidence commit: 66dffab6d5d72cd4001edc77663f9f3d29e66da8

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Provider calls: 0
- semantic limit: 8
- recent limit: 20
- contract failures: 0 (deterministic packing PASS, required scope retained PASS, protected artifacts retained PASS)
- baseline 12k aggregate: 69.57 entities, 8.29 rules, 1.00 recent, 4.71 semantic; pos_ret=0.571 (4/7 cases), crit_ret=0.667 (4/7 cases); zero_semantic=2, zero_recent=4
- retrieval-scoped 12k aggregate: 15.71 entities, 10.57 rules, 20.00 recent, 8.00 semantic; pos_ret=1.000 (7/7 cases), crit_ret=1.000 (7/7 cases); zero_semantic=0, zero_recent=0; scope_cov=1.000
- balanced-scoped 12k aggregate: 21.57 entities, 10.57 rules, 20.00 recent, 8.00 semantic; pos_ret=1.000 (7/7 cases), crit_ret=1.000 (7/7 cases); zero_semantic=0, zero_recent=0; scope_cov=1.000
- 10k/8k sensitivity: baseline collapses to 0.57 semantic @10k and 0.0 semantic @8k (0% retention); both scoped policies maintain 8.0/8 semantic and 1.00 pos/crit retention down to 8k
- protected overflow: false (0 occurrences across all 63 traces)
- Evidence: docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/

## NOW — EVAL-01H Production-Limit Context Scope Diagnostic

Goal:

```text
use production-shaped semantic limit=8 / recent limit=20
keep ContextBudgetPacker unchanged
change only entity/current-state input breadth
```

Harness:

`scripts/run_eval_01h_prod8_context_scope.py`

Runbook:

[docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE-runbook.md](docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE-runbook.md)

Policies:

```text
baseline_prod8
  full entity/state input

retrieval_scoped_entities
  protected
  + query-named entities
  + entities in semantic top-8

balanced_scoped_entities
  retrieval-scoped
  + participants from newest 5 recent events
```

Held constant:

```text
semantic limit       8
recent limit        20
provenance           compact
world rules          unchanged
author constraints   unchanged
ContextBudgetPacker  unchanged
budgets              12k / 10k / 8k
```

No positive/critical gold labels are used to build the query scope.

PASS contract for both scoped policies at all tested budgets:

```text
deterministic                    PASS
required scope retained          PASS
protected artifacts retained     PASS
protected overflow               false
positive retention             >= baseline
critical retention             >= baseline
recent retention               >= baseline
world-rule retention           >= baseline
```

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01h_prod8_context_scope.py
```

Commit only:

```text
docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- Provider calls: 0
- semantic limit: 8
- recent limit: 20
- contract failures: <count>
- baseline 12k aggregate: <summary>
- retrieval-scoped 12k aggregate: <summary>
- balanced-scoped 12k aggregate: <summary>
- 10k/8k sensitivity: <summary>
- protected overflow: <result>
- P8-05: BLOCKED
```

Do not change production packer/repository scoping until Astra review.

## EVAL-01H final interpretation

Astra final review:

`docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/ASTRA-FINAL-REVIEW.md`

Review commit:

`edd6cc6d2bfe4ac7c6fcb23c68c228eab4a17abe`

Verdict:

```text
entity/state breadth bottleneck       STRONGLY SUPPORTED
production-shaped starvation          VERIFIED IN FIXTURE
ContextBudgetPacker rewrite           NOT JUSTIFIED
retrieval-scoped input                BEST CURRENT SCOPING CANDIDATE
balanced scope                        DROP FROM NEXT TEST
production scoping                    NOT AUTHORIZED
```

Competing explanation still open:

```text
12k Story Brain budget itself may simply be too conservative.
```

## EVAL-01I harness — MERGED

- PR: #19
- merge commit: `34a41fac2a7316d43a4abc2a7f340044940ca847`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36680373234`
- provider calls in CI: **0**
- contract failures: **0**

Global thresholds from CI:

```text
baseline_full_entities
  minimum budget all semantic retained     16000
  minimum budget all rules retained        16000
  minimum budget evidence complete         20000
  minimum budget all recent retained       20000
  minimum budget all input artifacts fit   20000

retrieval_scoped_entities
  minimum budget all semantic retained     12000
  minimum budget all rules retained        12000
  minimum budget evidence complete         12000
  minimum budget all recent retained       12000
  minimum budget all input artifacts fit   12000
```

12k:

```text
baseline
  mean tokens used       11941.86
  mean headroom             58.14
  semantic                  4.71 / 8
  recent                    1.00 / 20
  evidence-complete cases   0 / 7

retrieval-scoped
  mean tokens used        8862.29
  mean headroom           3137.71
  semantic                  8 / 8
  recent                   20 / 20
  evidence-complete cases   7 / 7
```

16k:

```text
baseline
  semantic                  8 / 8
  recent                   16 / 20 mean
  evidence-complete cases   4 / 7
  all rules retained        7 / 7
  mean tokens used       15543.57
  mean headroom            456.43

retrieval-scoped
  full input still fits
  mean tokens used        8862.29
```

20k:

```text
baseline
  semantic                  8 / 8
  recent                   20 / 20
  all rules                 retained
  all input artifacts       retained
  evidence-complete cases   7 / 7
  mean tokens used       16239.57
  mean headroom           3760.43

retrieval-scoped
  same complete package as 12k
  mean tokens used        8862.29
```

24k / 32k do not add more Story Brain artifacts in this fixture:

```text
baseline plateau tokens used     16239.57
scoped plateau tokens used        8862.29
```

Preliminary interpretation:

```text
12k is indeed conservative for broad full-entity context.

Raising Story Brain budget to 20k:
  removes the measured retention failure
  without changing selection/scoping policy.

Retrieval scoping:
  achieves the same measured evidence completeness at 12k
  using ~7.4k fewer estimated Story Brain tokens on average.

16k:
  sufficient for semantic + rules,
  not sufficient for all recent events in every case.
```

Do not choose between "baseline@20k" and "scoped@12k" from offline retention alone.

The next decision must consider generation quality, latency, provider input-token usage/cost, and outer-prompt/manuscript headroom.

Current state:

```text
EVAL-01I harness        MERGED
CI diagnostic           PASS
official main evidence  COMPLETE (0763077)
production budget       UNCHANGED
production scoping      UNCHANGED
```

### Gemini / Antigravity — run official EVAL-01I evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01i_context_budget_scaling.py
```

Commit only:

```text
docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01I CONTEXT BUDGET SCALING

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

baseline minimum evidence-complete budget: <value>
baseline minimum all-input-fit budget: <value>
scoped minimum evidence-complete budget: <value>
scoped minimum all-input-fit budget: <value>

12k / 16k / 20k / 24k / 32k:
  tokens used
  headroom
  semantic retained
  recent retained
  positive/critical retention

P8-05: BLOCKED
```

Gemini must not alter production budget or entity scoping. Astra reviews official evidence first.

### Gemini Verification — EVAL-01I CONTEXT BUDGET SCALING

Status: PASS
Tested commit: 1fb48d5e563d8a0e407ec138388c6ced01e1b316
Evidence commit: 0763077e70bbfaa9db05c2b9d808d6f47aceefe7
Provider calls: 0

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Contract failures: 0

baseline minimum evidence-complete budget: 20000
baseline minimum all-input-fit budget: 20000
scoped minimum evidence-complete budget: 12000
scoped minimum all-input-fit budget: 12000

12k / 16k / 20k / 24k / 32k:
  baseline:
    12k: 11941.86 tokens (headroom 58.14), semantic 4.71/8, recent 1.00/20, pos_ret=0.571, crit_ret=0.667 (0/7 complete)
    16k: 15543.57 tokens (headroom 456.43), semantic 8.00/8, recent 16.00/20, pos_ret=1.000, crit_ret=1.000 (4/7 complete)
    20k: 16239.57 tokens (headroom 3760.43), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    24k: 16239.57 tokens (headroom 7760.43), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    32k: 16239.57 tokens (headroom 15760.43), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
  retrieval-scoped:
    12k: 8862.29 tokens (headroom 3137.71), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    16k: 8862.29 tokens (headroom 7137.71), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    20k: 8862.29 tokens (headroom 11137.71), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    24k: 8862.29 tokens (headroom 15137.71), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)
    32k: 8862.29 tokens (headroom 23137.71), semantic 8.00/8, recent 20.00/20, pos_ret=1.000, crit_ret=1.000 (7/7 complete)

P8-05: BLOCKED

## NOW — EVAL-01I Context Budget Scaling

Goal:

```text
measure whether increasing the Story Brain budget alone
eliminates evidence loss under the current broad entity/state input
```

Harness:

`scripts/run_eval_01i_context_budget_scaling.py`

Runbook:

[docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING-runbook.md](docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING-runbook.md)

Policies:

```text
baseline_full_entities
retrieval_scoped_entities
```

Held constant:

```text
semantic limit       8
recent limit        20
compact provenance
ContextBudgetPacker  unchanged
same seven cases
```

Story Brain application budgets:

```text
12000
16000
20000
24000
32000
```

Measure global minimum budget across all 7 cases for:

```text
all semantic retained
all recent retained
all world rules retained
all positive/critical evidence retained

and separately:

all input artifacts retained
```

Also record mean tokens used and unused Story Brain headroom.

Important boundary:

```text
these budgets cover Story Brain only;
outer prompt + manuscript selection + output tokens are outside this number.
```

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01i_context_budget_scaling.py
```

Commit only:

```text
docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

baseline minimum evidence-complete budget: <value>
baseline minimum all-input-fit budget: <value>
scoped minimum evidence-complete budget: <value>
scoped minimum all-input-fit budget: <value>

12k/16k/20k/24k/32k aggregate:
  tokens used
  headroom
  semantic retained
  recent retained
  positive/critical retention

P8-05: BLOCKED
```

Do not change production budget or scoping until Astra reviews official EVAL-01I evidence.

## EVAL-01I final interpretation

Astra final review:

`docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING/ASTRA-FINAL-REVIEW.md`

Review commit:

`5a0dd928a3610e5b67d58765d7ff4c8c863ed167`

Verdict:

```text
broad @12k                 too small
broad @16k                 semantic/rules complete, recent partial
broad @20k                 complete in current fixture
retrieval-scoped @12k      complete and ~7.4k tokens smaller
production change          not authorized
```

Remaining scalability question:

```text
20k is sufficient for this 61-chapter fixture,
but not proven as a permanent ceiling for larger novels.
```

## EVAL-01J harness — MERGED

- PR: #20
- merge commit: `659b022297b8e16b82249e6d8a441713983847de`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36681998602`
- provider calls in CI: **0**
- contract failures: **0**

Adaptive branch coverage across all 21 case×scale traces:

```text
broad@20k             7
broad@24k             5
retrieval-scoped@12k  9
```

1× source-grounded load:

```text
mean broad estimated before   16239.57
mean broad entities              69.57

branches:
  broad@20k             7 / 7
  broad@24k             0 / 7
  scoped@12k            0 / 7

evidence complete       7 / 7
protected overflow      0
semantic retained       8 / 8
recent retained        20 / 20
```

2× entity/state breadth stress:

```text
mean broad estimated before   24047.71
mean broad entities             123.43
mean synthetic entities          53.86

branches:
  broad@20k             0 / 7
  broad@24k             5 / 7
  scoped@12k            2 / 7

evidence complete       7 / 7
protected overflow      0
semantic retained       8 / 8
recent retained        20 / 20
```

4× entity/state breadth stress:

```text
mean broad estimated before   39664.00
mean broad entities             231.14
mean synthetic entities         161.57

branches:
  broad@20k             0 / 7
  broad@24k             0 / 7
  scoped@12k            7 / 7

evidence complete       7 / 7
protected overflow      0
semantic retained       8 / 8
recent retained        20 / 20
```

Candidate adaptive policy exercised by CI:

```text
broad estimate <=20k
  -> broad@20k

20k < broad estimate <=24k
  -> broad@24k

broad estimate >24k
  -> retrieval-scoped@12k
```

Important interpretation boundary:

```text
This stress test scales entity/state breadth only.

It does NOT scale:
  chapters
  semantic memory count
  recent-event count
  world-rule count
  relationship complexity
  plot complexity
```

Synthetic clones are noncanonical structural load only and never enter retrieval evidence, query scope, or gold labels.

Current state:

```text
EVAL-01J harness        MERGED
CI adaptive contract    PASS
official main evidence  COMPLETE (ae8a089)
production policy       UNCHANGED
```

### Gemini / Antigravity — run official EVAL-01J evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01j_adaptive_budget_scale.py
```

Commit only:

```text
docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01J ADAPTIVE BUDGET SCALE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

branch counts:
  broad@20k: <n>
  broad@24k: <n>
  scoped@12k: <n>

1x:
  broad estimate
  branch distribution
  evidence complete
  protected overflow

2x:
  broad estimate
  branch distribution
  evidence complete
  protected overflow

4x:
  broad estimate
  branch distribution
  evidence complete
  protected overflow

P8-05: BLOCKED
```

Gemini must not alter production budget/scoping/adaptive behavior. Astra reviews official evidence first.

### Gemini Verification — EVAL-01J ADAPTIVE BUDGET SCALE

Status: PASS
Tested commit: 58100e69bcaa6e6590590ea642df4fe904ba3cca
Evidence commit: ae8a089dc0342b86bc3b262a4ea8d2bb1680e506
Provider calls: 0

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Contract failures: 0

branch counts:
  broad@20k: 7
  broad@24k: 5
  scoped@12k: 9

1x:
  broad estimate: 16239.57
  branch distribution: broad@20k=7, broad@24k=0, scoped@12k=0
  evidence complete: 7/7
  protected overflow: 0

2x:
  broad estimate: 24047.71
  branch distribution: broad@20k=0, broad@24k=5, scoped@12k=2
  evidence complete: 7/7
  protected overflow: 0

4x:
  broad estimate: 39664.00
  branch distribution: broad@20k=0, broad@24k=0, scoped@12k=7
  evidence complete: 7/7
  protected overflow: 0

P8-05: BLOCKED

## NOW — EVAL-01J Adaptive Story Brain Budget / Scale Stress

Candidate policy:

```text
broad estimate <=20k
  -> broad@20k

20k < broad estimate <=24k
  -> broad@24k

broad estimate >24k
  -> retrieval-scoped@12k
```

Harness:

`scripts/run_eval_01j_adaptive_budget_scale.py`

Runbook:

[docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE-runbook.md](docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE-runbook.md)

Stress:

```text
1x source-grounded entity/state load
2x structural entity/state load
4x structural entity/state load
```

Synthetic additions are deterministic noncanonical stress clones of only non-locked, non-retrieval-scope entity/state bundles.

They do not enter:

```text
semantic evidence
recent events
query scope
gold labels
```

This experiment tests **entity/state breadth growth only**, not arbitrary story growth.

Held constant:

```text
semantic limit       8
recent limit        20
compact provenance
ContextBudgetPacker  unchanged
same seven cases
```

PASS requires every adaptive trace to retain all semantic/recent/rules/protected/query-scope evidence with no protected overflow.

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01j_adaptive_budget_scale.py
```

Commit only:

```text
docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

branch counts:
  1x: <summary>
  2x: <summary>
  4x: <summary>

evidence complete:
  1x: <n>/7
  2x: <n>/7
  4x: <n>/7

protected overflow: <count>
contract failures: <count>
P8-05: BLOCKED
```

Do not alter production budget/scoping/adaptive behavior until Astra reviews official evidence.

## EVAL-01J final interpretation

Astra final review:

`docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE/ASTRA-FINAL-REVIEW.md`

Review commit:

`363f6a46d57f78c30b2f953577ef0702361d9ac2`

Verdict:

```text
20k normal broad tier                SUPPORTED
24k broad tolerance tier             SUPPORTED, TIGHT
>24k scoped@12k fallback             SUPPORTED FOR ENTITY/STATE GROWTH
adaptive concept                     STRONGLY PROMISING
production policy                    NOT AUTHORIZED
```

Remaining risk:

```text
entity scoping cannot remove pressure caused by
large world-rule or evidence payloads themselves.
```

## EVAL-01K harness — MERGED

- PR: #21
- merge commit: `9519fc30532ad0d64f6e0ec3cd1ebd1edaff34ce`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36685818264`
- provider calls in CI: **0**
- harness integrity failures: **0**
- adaptive policy failures: **5**

Important distinction:

```text
harness integrity          PASS
adaptive policy            FAIL under combined_4x
```

This is an intended diagnostic result, not a CI failure.

Scenario results:

```text
source_1x
  mean broad estimate      16239.57
  mean scoped estimate      8862.29
  core evidence complete    7 / 7
  all rule load retained    7 / 7

rules_2x
  mean broad estimate      17687.29
  mean scoped estimate     10310.00
  core evidence complete    7 / 7
  all rule load retained    7 / 7

evidence_payload_2x
  mean broad estimate      17931.43
  mean scoped estimate     10554.29
  core evidence complete    7 / 7
  all rule load retained    7 / 7

combined_2x
  mean broad estimate      19379.29
  mean scoped estimate     12002.00
  core evidence complete    7 / 7
  all rule load retained    7 / 7

combined_4x
  mean broad estimate      25658.43
  mean scoped estimate     18281.14
  branches:
    broad@24k              2 / 7
    scoped@12k             5 / 7

  core evidence complete    2 / 7
  semantic retained         6.29 / 8 mean
  recent retained           7.57 / 20 mean
  protected overflow        0
```

Clean failure frontier:

```text
all scenarios <= combined_2x             PASS 7/7
combined_4x broad@24k traces             PASS 2/2
combined_4x scoped@12k traces            FAIL 5/5
```

Interpretation:

```text
>24k -> scoped@12k works when pressure is mostly entity/state breadth.

It is NOT sufficient when the pressure remains inside
world-rule + semantic/recent payloads themselves.

At combined_4x the scoped package itself averages ~18.3k,
so entity scoping alone cannot make a fixed 12k fallback safe.
```

This means the next candidate must be a **second-stage adaptive scoped budget**, not a larger broad ceiling.

Do not change production policy yet.

Current state:

```text
EVAL-01K harness        MERGED
CI integrity            PASS
adaptive policy         FAIL @ combined_4x
official main evidence  COMPLETE (a224d24)
production policy       UNCHANGED
```

### Gemini / Antigravity — run official EVAL-01K evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01k_multilane_growth_stress.py
```

Commit only:

```text
docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01K MULTILANE GROWTH STRESS

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

Integrity: PASS | FAIL
Adaptive policy: PASS | FAIL
Adaptive failures: <n>

Per scenario:
  broad mean estimate
  scoped mean estimate
  branch distribution
  core evidence complete
  all-rule-load retained
  synthetic rule retention
  semantic retained
  recent retained
  protected overflow

P8-05: BLOCKED
```

Gemini must not alter production budget/scoping/adaptive behavior. Astra reviews official evidence first.

### Gemini Verification — EVAL-01K MULTILANE GROWTH STRESS

Status: PASS
Tested commit: 3a94fc2a289a83aa2ce70e78214dfa61da6c3750
Evidence commit: a224d2457589114d95a1b3417322689cf563113a
Provider calls: 0

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Integrity failures: 0

Integrity: PASS
Adaptive policy: FAIL (clean failure frontier at combined_4x, 5 failures)
Adaptive failures: 5

Per scenario:
  source_1x:
    broad mean estimate: 16239.57
    scoped mean estimate: 8862.29
    branch distribution: broad@20k=7, broad@24k=0, scoped@12k=0
    core evidence complete: 7/7
    all-rule-load retained: 7/7
    synthetic rule retention: 1.000
    semantic retained: 8.00/8
    recent retained: 20.00/20
    protected overflow: 0
  rules_2x:
    broad mean estimate: 17687.29
    scoped mean estimate: 10310.00
    branch distribution: broad@20k=6, broad@24k=1, scoped@12k=0
    core evidence complete: 7/7
    all-rule-load retained: 7/7
    synthetic rule retention: 1.000
    semantic retained: 8.00/8
    recent retained: 20.00/20
    protected overflow: 0
  evidence_payload_2x:
    broad mean estimate: 17931.43
    scoped mean estimate: 10554.29
    branch distribution: broad@20k=6, broad@24k=1, scoped@12k=0
    core evidence complete: 7/7
    all-rule-load retained: 7/7
    synthetic rule retention: 1.000
    semantic retained: 8.00/8
    recent retained: 20.00/20
    protected overflow: 0
  combined_2x:
    broad mean estimate: 19379.29
    scoped mean estimate: 12002.00
    branch distribution: broad@20k=5, broad@24k=2, scoped@12k=0
    core evidence complete: 7/7
    all-rule-load retained: 7/7
    synthetic rule retention: 1.000
    semantic retained: 8.00/8
    recent retained: 20.00/20
    protected overflow: 0
  combined_4x:
    broad mean estimate: 25658.43
    scoped mean estimate: 18281.14
    branch distribution: broad@20k=0, broad@24k=2, scoped@12k=5
    core evidence complete: 2/7 (2 broad@24k pass, 5 scoped@12k fail)
    all-rule-load retained: 6/7
    synthetic rule retention: 0.997
    semantic retained: 6.29/8
    recent retained: 7.57/20
    protected overflow: 0

P8-05: BLOCKED

## NOW — EVAL-01K Multi-Lane Growth Stress

Goal:

```text
stress rule count + selected semantic payload size
+ selected recent-event payload size
while keeping the EVAL-01J adaptive policy unchanged
```

Harness:

`scripts/run_eval_01k_multilane_growth_stress.py`

Runbook:

[docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS-runbook.md](docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS-runbook.md)

Scenarios:

```text
source_1x
rules_2x
evidence_payload_2x
combined_2x
combined_4x
```

Production counts remain:

```text
semantic candidates in prompt = 8
recent events in prompt       = 20
```

Stress contract:

```text
rules:
  deterministic noncanonical unlocked clones

semantic/recent payload:
  repeat existing source-derived payload only
  no new facts/candidates
```

Adaptive policy unchanged:

```text
<=20k       broad@20k
20k..24k    broad@24k
>24k        retrieval-scoped@12k
```

Important:

```text
adaptive-policy failure is a valid finding.
Do NOT increase scoped budget inside EVAL-01K to make it pass.
```

CI integrity requires only determinism/protected/scope invariants.

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01k_multilane_growth_stress.py
```

Commit only:

```text
docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

Integrity: PASS | FAIL
Adaptive policy: PASS | FAIL
Adaptive failures: <n>

Per scenario:
  broad mean estimate
  scoped mean estimate
  branch distribution
  core evidence complete
  all-rule-load retained
  synthetic rule retention
  protected overflow

P8-05: BLOCKED
```

Do not alter production policy until Astra review.

## EVAL-01K final interpretation

Astra final review:

`docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS/ASTRA-FINAL-REVIEW.md`

Review commit:

`240bc60bc131561af6c496afe313fbabecf9261a`

Verdict:

```text
broad@20k                         KEEP
broad@24k                         KEEP AS TOLERANCE
>24k -> retrieval scope           KEEP
fixed scoped@12k                  REJECT UNDER MULTI-LANE PRESSURE
secondary scoped tiers            JUSTIFIED
```

Measured combined_4x failure curve:

```text
scoped ~16-17k
  semantic survives
  recent drops first

scoped ~19k
  optional semantic starts dropping

scoped ~20k
  positive/critical evidence starts dropping

scoped ~22.6k
  semantic + recent can collapse
```

## EVAL-01L harness — MERGED

- PR: #22
- merge commit: `57b4fd15d97f13b0bf98cc8284f97bb10d785184`
- Evaluation Pilot Harness CI: **SUCCESS**
- workflow run: `36686951748`
- provider calls in CI: **0**
- integrity failures: **0**
- final-policy failures: **0**
- unresolved scoped >24k: **0**

Global scoped frontier:

```text
source_1x
  core evidence complete   12k
  full input fit           12k

rules_2x
  core evidence complete   16k
  full input fit           16k
  semantic complete        12k
  recent complete          16k

evidence_payload_2x
  core evidence complete   12k
  full input fit           12k

combined_2x
  core evidence complete   16k
  full input fit           16k
  semantic complete        12k
  recent complete          16k

combined_4x
  core evidence complete   24k
  full input fit           24k
  semantic complete        16k
  recent complete          24k
  original rules           12k
  all stress-rule load     16k
```

Final two-stage policy exercised across all 35 case×scenario traces:

```text
broad@20k             24
broad@24k              6
scoped@12k             0
scoped@16k             0
scoped@20k             3
scoped@24k             2
unresolved >24k        0
```

Combined_4x final routing:

```text
2 / 7 -> broad@24k
3 / 7 -> scoped@20k
2 / 7 -> scoped@24k

core evidence complete  7 / 7
full input fit          7 / 7
semantic retained       8 / 8
recent retained        20 / 20
```

Candidate offline architecture now closes cleanly:

```text
BROAD

broad <=20k
  -> broad@20k

20k < broad <=24k
  -> broad@24k

broad >24k
  -> retrieval scope


SCOPED

scoped <=12k
  -> scoped@12k

12k < scoped <=16k
  -> scoped@16k

16k < scoped <=20k
  -> scoped@20k

20k < scoped <=24k
  -> scoped@24k

scoped >24k
  -> unresolved / compression required
```

Important:

```text
routing uses estimated package size only
gold labels are evaluation-only
ContextBudgetPacker unchanged
production policy unchanged
```

This is the **last planned offline budget architecture experiment**.

If official EVAL-01L evidence matches CI, next step is:

```text
EVAL-01M — sealed live generation validation
```

No additional offline budget experiment should be opened unless official evidence or live validation reveals a new failure.

Current state:

```text
EVAL-01L harness        MERGED
CI final policy         PASS
official main evidence  COMPLETE (b98c0a5)
production policy       UNCHANGED
```

### Gemini / Antigravity — run official EVAL-01L evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01l_secondary_scoped_frontier.py
```

Commit only:

```text
docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER/
  diagnostic.json
  summary.md
```

Then append:

```text
### Gemini Verification — EVAL-01L SECONDARY SCOPED FRONTIER

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

Integrity: PASS | FAIL
Final policy: PASS | FAIL
Unresolved scoped >24k: <n>

Global scoped frontier:
  source_1x
  rules_2x
  evidence_payload_2x
  combined_2x
  combined_4x

Final branch counts:
  broad@20k
  broad@24k
  scoped@12k
  scoped@16k
  scoped@20k
  scoped@24k

P8-05: BLOCKED
```

Gemini must not alter production budget/scoping/adaptive behavior. Astra reviews official evidence first.

### Gemini Verification — EVAL-01L SECONDARY SCOPED FRONTIER

Status: PASS
Tested commit: ac186d686e352276f416fb8f7f797c6d0b886a3d
Evidence commit: b98c0a5e72b7a413f2192a3429db6c6f6a5b897b
Provider calls: 0

- P8 cleanup readiness: PASS
- P8-05 cleanup gate: BLOCKED
- EVAL-01 fixture contract: PASS
- Integrity failures: 0

Integrity: PASS
Final policy: PASS
Unresolved scoped >24k: 0

Global scoped frontier:
  source_1x: core complete @12k, full input fit @12k
  rules_2x: core complete @16k, full input fit @16k (semantic complete @12k, recent @16k)
  evidence_payload_2x: core complete @12k, full input fit @12k
  combined_2x: core complete @16k, full input fit @16k (semantic complete @12k, recent @16k)
  combined_4x: core complete @24k, full input fit @24k (semantic complete @16k, recent @24k)

Final branch counts:
  broad@20k: 24
  broad@24k: 6
  scoped@12k: 0
  scoped@16k: 0
  scoped@20k: 3
  scoped@24k: 2

P8-05: BLOCKED

## NOW — EVAL-01L Secondary Scoped Budget Frontier

This is the final planned offline budget architecture diagnostic.

Harness:

`scripts/run_eval_01l_secondary_scoped_frontier.py`

Runbook:

[docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER-runbook.md](docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER-runbook.md)

Scoped sweep:

```text
12k
16k
20k
24k
```

Candidate two-stage policy:

```text
BROAD

<=20k       broad@20k
20k..24k    broad@24k
>24k        retrieval scope


SCOPED

<=12k       scoped@12k
12k..16k    scoped@16k
16k..20k    scoped@20k
20k..24k    scoped@24k
>24k        unresolved
```

Routing is based only on estimated package size.

Positive/critical labels are evaluation-only.

PASS requires:

```text
integrity                       PASS
unresolved scoped >24k         0
final-policy failures          0
core evidence complete         all 35 case×scenario traces
protected overflow             0
```

If PASS, move next to **EVAL-01M sealed live generation validation**. Do not open another offline budget experiment unless EVAL-01L reveals a new unresolved frontier.

### Gemini / Antigravity — after harness merge

Run latest main. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01l_secondary_scoped_frontier.py
```

Commit only:

```text
docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER/
  diagnostic.json
  summary.md
```

Handoff:

```text
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

Integrity: PASS | FAIL
Final policy: PASS | FAIL
Unresolved scoped >24k: <n>

Global scoped frontier by scenario:
  source_1x
  rules_2x
  evidence_payload_2x
  combined_2x
  combined_4x

Final branch counts:
  broad@20k
  broad@24k
  scoped@12k
  scoped@16k
  scoped@20k
  scoped@24k

P8-05: BLOCKED
```

Do not alter production policy. Astra reviews official evidence first.

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


## EVAL-01L final interpretation — CLOSED

Astra final review:

`docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER/ASTRA-FINAL-REVIEW.md`

Review commit:

`9070808b4188ecd74c2c0c3c50293dc7199594c2`

Verdict:

```text
official evidence                    VERIFIED
integrity failures                   0
final-policy failures                0
unresolved scoped >24k               0
offline budget frontier              CLOSED
production policy                    UNCHANGED
```

Supported offline candidate:

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
>24k        -> unresolved / compression required
```

Important caveats:

- application estimator, not exact provider tokenizer;
- Story Brain only, not the whole outer prompt/output budget;
- source-grounded production-shaped Aethelgard fixture, not proof over every future novel;
- `scoped@12k` and `scoped@16k` pass independent sweeps but had zero natural final-route hits in the 35 current traces;
- `scoped>24k` remains an explicit unresolved state rather than an automatically enlarged ceiling.

No additional offline budget-frontier experiment is planned.

# NOW — EVAL-01M Sealed Live Adaptive Context Validation

Goal:

```text
test whether the EVAL-01L offline-supported adaptive context policy
improves actual Gemini generation quality versus the current fixed broad@12k behavior
```

This is an **evaluation harness only**. Production budget/scoping remains unchanged.

Primary conditions:

```text
CONTROL
  fixed broad entity/state package
  ContextBudgetPacker maximum = 12000

CANDIDATE
  EVAL-01L two-stage routing:
    broad <=20k      -> broad@20k
    broad <=24k      -> broad@24k
    broad >24k       -> retrieval-scoped
    scoped <=12k     -> scoped@12k
    scoped <=16k     -> scoped@16k
    scoped <=20k     -> scoped@20k
    scoped <=24k     -> scoped@24k
    scoped >24k      -> unresolved
```

Routing must use estimated package size only. Gold positive/critical labels are review/evaluation data and must never influence routing.

Held constant:

```text
same case query
same chapter cutoff
same source-grounded base package
same semantic top-8 order
same recent-event limit=20
same compact provenance
same model
same temperature
same production prompt renderer
same task instruction
same author constraints
same output max_tokens
```

Two live strata:

```text
NORMAL
  source_1x
  all 7 fixed EVAL-01E cases

STRESS_RESILIENCE
  combined_4x
  include only case/scenario rows where the candidate route actually enters
  scoped@20k or scoped@24k
  selection is based on package-size routing only, never gold labels
```

The stress stratum is structural resilience evidence only. It must be reported separately from normal source-grounded quality and must not be pooled into a single “winner” rate.

Default live contract:

```text
model            gemini-3.5-flash-lite
temperature      0.0
repeats          3
expected cases   7 normal + 5 scoped-stress = 12 case/scenario rows
expected calls   12 * 2 * 3 = 72
key policy       one fixed slot for the whole capture
fallback model   NONE
quality scoring  BLIND_REVIEW_REQUIRED
```

Sealed protocol:

```text
dry-run
  -> prove deterministic routing/packing and prompt contract
capture
  -> live X/Y outputs
  -> condition mapping/raw labelled outputs remain in .eval-private/
  -> public SHA256 commitment
blind Astra review
  -> freeze X/Y judgments
reveal
  -> zero provider calls
  -> verify commitment
  -> publish mapping/raw audit
final Astra interpretation
```

Reviewer dimensions:

- canonical/source-status correctness;
- chronology/causality;
- ambiguity handling;
- future leakage;
- unsupported claims;
- completeness.

Latency, backoff count, estimated Story Brain size, selected artifact counts, and full prompt size proxy must be recorded separately from blind quality.

Decision rule:

```text
A production implementation slice is NOT automatic.

After reveal, Astra/Supervisor must separately judge:
1. normal source-grounded quality effect;
2. stress-resilience quality effect;
3. latency/input-size cost;
4. regressions;
5. whether evidence is strong enough to justify production adaptive routing.
```

P8-05 remains BLOCKED.


## EVAL-01M harness — MERGED / LIVE CAPTURE COMPLETE

- PR: #23
- merge commit: `3ac07099e401676798c0c9f27346bc96dc18de1b`
- Evaluation Pilot Harness workflow: `36691882656` — **SUCCESS**
- production changes: **none**
- CI dry-run provider calls: `0`
- live capture: **AUTHORIZED ON LATEST MAIN** using one fixed local Gemini key slot

Hardening added before merge:

```text
public deterministic X/Y mapping        REMOVED
private random blind salt               ENABLED
private random call-order salt          ENABLED
query-gold-derived entity locks         REMOVED
gold influence on adaptive routing      NONE
source-derived world-rule locks         RETAINED
```

Expected dry-run contract:

```text
normal rows                         7
scoped combined_4x stress rows      5
total rows                         12
planned live calls                 72
provider calls in CI                0
routing uses gold                false
query gold used for locking      false
control protected overflow       false
candidate protected overflow     false
```

CI verified:

```text
row_count                              12
planned_live_calls                     72
normal_rows                             7
stress_resilience_rows                  5
candidate branches:
  broad_20k                             7
  scoped_20k                            3
  scoped_24k                            2
routing_uses_gold                   false
query_gold_used_for_package_locking false
evaluation_entity_locks_removed      true
same system prompt                   true
same pre-policy source package       true
control protected overflow          false
candidate protected overflow        false
```

### Gemini / Antigravity — RUN EVAL-01M CAPTURE NOW

Use latest `main`. Keep the same local workspace through capture → blind review → reveal because the sealed private state is intentionally gitignored.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage dry-run
.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage capture --key-slot 1
```

Fixed-key rule:

```text
one slot for all 72 calls
no rotation during capture
fallback model = none
if same-key retry/backoff cannot complete:
  stop PARTIAL/BLOCKED
  do not continue with another key
```

Public capture evidence to commit:

```text
docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  capture-contract.json
  sealed-state.json
  summary.md
```

Keep private / do NOT commit before Astra blind review:

```text
.eval-private/eval01m-private.json
condition-key.json
raw-generations.json
prompt-diff-audit.json
latency-cost.json
reveal-verification.json
```

Append execution-only handoff. Do not identify X/Y or declare a winner.

After Gemini commits capture evidence:

```text
Astra blind review
  -> commit ASTRA-BLIND-REVIEW.md
  -> authorize reveal

Gemini reveal
  -> zero provider calls
  -> verify sealed SHA256
  -> publish mapping/raw audit

Astra final interpretation
  -> decide whether a narrow production implementation proposal is justified
```

P8-05 remains BLOCKED.

### Gemini Verification — EVAL-01M SEALED LIVE ADAPTIVE CONTEXT

Status: PASS
Tested commit: dbaa74ec93183c750b97035464961430543e1baa
Evidence commit: e202a190598d97d109f96bdd189f5e39aa63762e
Fixed key slot: slot-1
Model: gemini-3.5-flash-lite (temperature=0.0)

- Preflight guards:
  - P8 cleanup readiness: PASS
  - P8-05 cleanup gate: BLOCKED
  - EVAL-01 fixture contract: PASS
- Stage dry-run: PASS (12 rows, 72 planned live calls, 0 provider calls)
- Stage capture: PASS
  - Successful calls: 72 / 72
  - Provider backoff events: 0
  - Sealed state SHA256: 2edc2eb3585da1c1358bedf49d1371e48be5f54e0450148a9036364f87c4c296
  - Quality scoring: BLIND_REVIEW_REQUIRED (reviewer-blind.json committed; mapping/raw outputs sealed in gitignored .eval-private/eval01m-private.json)
- Strata:
  - NORMAL: 7 rows (source_1x) × 2 conditions × 3 repeats = 42 calls
  - STRESS_RESILIENCE: 5 rows (combined_4x) × 2 conditions × 3 repeats = 30 calls
- Evidence: docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/
- Next step: Astra blind review PENDING; reveal BLOCKED until blind review commit

P8-05: BLOCKED


## EVAL-01M Astra blind review — COMPLETE / REVEAL AUTHORIZED

Blind review:

`docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/ASTRA-BLIND-REVIEW.md`

Review commit:

`07141f468d53957ecf0aab6fc17b1fb84bf1b132`

Blind integrity at freeze time:

```text
condition mapping inspected             NO
private state inspected                 NO
condition-labelled raw output inspected NO
packing audit inspected                 NO
condition-labelled latency inspected    NO
condition identity inferred             NO
```

Frozen blind preference counts:

```text
NORMAL
  X    5
  Y    7
  TIE  9

STRESS_RESILIENCE
  X    7
  Y    5
  TIE  3

ALL 36 PAIRS
  X   12
  Y   12
  TIE 12
```

Important: these counts are not a condition verdict because X/Y is randomized per row/repeat.

Substantive blind finding:

```text
NORMAL
  mostly ties/modest differences
  strongest discrimination in chronology/source-status cases

STRESS_RESILIENCE
  large evidence-retention failures appear in one side of many pairs
  missing evidence includes:
    Pillar No.2 40/42/45 history
    cavalry 45/47/49 history
    Alistair discovery/motive
    concrete old-battle competing claims
  severe failure alternates between X and Y under sealed assignment
  seed physical-identity negative control remains stable
```

### Gemini / Antigravity — RUN REVEAL NOW

Use the **same local workspace** that still contains:

`.eval-private/eval01m-private.json`

Do not run capture again.
Do not call Gemini.
Reveal must use zero provider calls.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/run_eval_01m_sealed_live_adaptive_context.py --stage reveal
```

Reveal must verify:

```text
ASTRA-BLIND-REVIEW.md present       true
private-state SHA256 commitment     MATCH
provider calls during reveal        0
```

Expected reveal artifacts:

```text
docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/
  condition-key.json
  raw-generations.json
  prompt-diff-audit.json
  latency-cost.json
  reveal-verification.json
```

Commit those reveal artifacts plus a concise handoff.

Gemini must report execution/integrity only and must **not** declare control/candidate winner.

After reveal commit:

```text
Astra
  -> map frozen blind X/Y scores to actual conditions
  -> inspect prompt/packing/latency audit
  -> issue final EVAL-01M interpretation

production policy remains unchanged until that final interpretation
P8-05 remains BLOCKED
```

### Gemini Verification — EVAL-01M SEALED LIVE ADAPTIVE REVEAL

Status: PASS
Blind review commit: 07141f468d53957ecf0aab6fc17b1fb84bf1b132
Reveal tested commit: f60ecb5d30a1a2c04b252e440b9ea77755d70eca
Reveal evidence commit: 9c324a37896977ddb887a98604884c60adf3ff3e
commitment match: true
private state SHA256: 2edc2eb3585da1c1358bedf49d1371e48be5f54e0450148a9036364f87c4c296
provider calls during reveal: 0
condition mapping committed: true
raw audit committed: true
P8-05: BLOCKED


## EVAL-01M final interpretation — CLOSED

Astra final review:

`docs/development/EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT/ASTRA-FINAL-REVIEW.md`

Review commit:

`a73f37ad668c5317ee7ee7785ef1fe52266b62e6`

Verdict:

```text
SUPPORTED_FOR_IMPLEMENTATION_PROPOSAL
```

This does **not** authorize production rollout.

Mapped blind result:

```text
NORMAL
  adaptive_eval01l       9
  fixed_broad_12k        3
  tie                    9

STRESS_RESILIENCE
  adaptive_eval01l      12
  fixed_broad_12k        0
  tie                    3
```

Key interpretation:

```text
fixed universal 12k             REJECT AS GENERAL POLICY
always-on large context         NOT JUSTIFIED
adaptive budget + scoping       SUPPORTED
relevance-density control       REQUIRED BEFORE ROLLOUT
```

Confirmed regression:

```text
challenge:rq-0025 NORMAL
  adaptive 0
  control  3

adaptive retained:
  semantic 8/8
  recent 20/20

control retained:
  semantic 5/8
  recent 0/20
```

This establishes a new failure mode:

```text
more retained evidence
  !=
better generation precision

context dilution / attention competition is now a measured risk
```

Latency evidence:

```text
NORMAL
  fixed mean       1839 ms
  adaptive mean    1834 ms

STRESS_RESILIENCE
  fixed mean       1883 ms
  adaptive mean    1930 ms
```

Exact provider token usage/cost remains unavailable from the current client.

# NOW — EVAL-01N Relevance Density / Scope-First Diagnostic

Goal:

```text
test whether scoping entity/current-state breadth earlier
can preserve all evidence while reducing distracting context
relative to current broad@20k NORMAL routing
```

Offline only.

Provider calls:

`0`

Production changes:

`NONE`

Primary hypothesis:

```text
if broad package >12k:
  scope entity/state breadth first
  then choose the minimum scoped tier that fits

rather than:
  broad <=20k -> broad@20k
```

Candidate scope inputs must be source-derived only:

```text
query-named entities
+ entities appearing in semantic top-8
+ optional recent-participant expansion
```

No gold labels may influence scope/routing.

EVAL-01N should compare at least:

```text
A current EVAL-01L NORMAL route
  broad@20k

B retrieval-scoped density candidate
  scoped package
  minimum fitting tier from 12k/16k/20k/24k

C balanced-scoped density candidate
  retrieval scope
  + participants from newest recent-event window
  minimum fitting tier from 12k/16k/20k/24k
```

Primary success checks:

```text
all 7 source_1x cases
semantic 8/8 retained
recent 20/20 retained
all source-derived world rules retained
required entity scope retained
protected overflow = 0
deterministic packing
estimated context materially lower than broad@20k
```

Special diagnostic case:

`challenge:rq-0025`

The experiment must report whether a scope-first package preserves the same evidence lanes while reducing entity/state breadth and total estimated prompt size for this known live regression.

Do not modify ContextBudgetPacker.

Do not alter production policy.

P8-05 remains BLOCKED.


## EVAL-01N harness — MERGED / OFFICIAL EVIDENCE PENDING

- PR: #24
- merge commit: `9fb738f1ff1215d42fe9ccd4726fa923112a0274`
- Evaluation Pilot Harness run: `36697226838` — **SUCCESS**
- provider calls in CI: `0`
- contract failures: `0`

CI preview:

```text
broad_20k_current
  mean Story Brain used        16,242
  mean entities                69.57

retrieval_scope_min_tier
  resolved                     7 / 7
  selected tier                12k for all 7
  mean Story Brain used         8,826
  mean entities                15.43
  mean token reduction         45.55%

balanced_scope_min_tier
  resolved                     7 / 7
  selected tier                12k for all 7
  mean Story Brain used         9,638
  mean entities                21.29
  mean token reduction         40.66%
```

Both scope-first candidates preserved across all seven source_1x cases:

```text
semantic                       8 / 8
recent                        20 / 20
all source-derived rules       retained
required entity scope          retained
full scoped input              fit
protected overflow             0
deterministic                  true
```

Known live regression case `challenge:rq-0025`:

```text
current broad@20k
  used          16,135
  entities          68
  semantic         8/8
  recent         20/20

retrieval scope-first
  tier            12k
  used           9,308
  entities          18
  semantic         8/8
  recent         20/20
  reduction       42.31%

balanced scope-first
  tier            12k
  used           9,593
  entities          20
  semantic         8/8
  recent         20/20
  reduction       40.55%
```

Provisional interpretation:

```text
scope-first hypothesis             STRONGLY SUPPORTED OFFLINE
retrieval-scope candidate          DENSER THAN BALANCED
production policy                  UNCHANGED
live confirmation                  STILL REQUIRED
```

### Gemini / Antigravity — run official EVAL-01N evidence now

Use latest `main`. No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01n_relevance_density.py
```

Commit only:

```text
docs/development/EVAL-01N-RELEVANCE-DENSITY/
  diagnostic.json
  summary.md
```

Append execution-only handoff:

```text
### Gemini Verification — EVAL-01N RELEVANCE DENSITY

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Provider calls: 0

Contract: PASS | FAIL
Failures: <n>

Broad@20k:
  mean tokens used
  mean entities

Retrieval scope-first:
  resolved cases
  budget distribution
  mean tokens used
  mean entities
  mean reduction %

Balanced scope-first:
  resolved cases
  budget distribution
  mean tokens used
  mean entities
  mean reduction %

Known regression rq-0025:
  broad used/entities
  retrieval used/entities/reduction
  balanced used/entities/reduction

P8-05: BLOCKED
```

Gemini must not change production budget, routing, scope behavior, or ContextBudgetPacker.

Astra reviews official evidence before any live follow-up.

### Gemini Verification — EVAL-01N RELEVANCE DENSITY

Status: PASS
Tested commit: adaacaa528351c2353ac5a28d2c0605461971f85
Evidence commit: 2949187dc475326772fcb857854b7b659e082b76
Provider calls: 0

Contract: PASS
Failures: 0

Broad@20k:
  mean tokens used: 16242.43
  mean entities: 69.57

Retrieval scope-first:
  resolved cases: 7 / 7
  budget distribution: 12k: 7, 16k: 0, 20k: 0, 24k: 0
  mean tokens used: 8825.71
  mean entities: 15.43
  mean reduction %: 45.55%

Balanced scope-first:
  resolved cases: 7 / 7
  budget distribution: 12k: 7, 16k: 0, 20k: 0, 24k: 0
  mean tokens used: 9637.86
  mean entities: 21.29
  mean reduction %: 40.66%

Known regression rq-0025:
  broad used/entities: 16135 / 68
  retrieval used/entities/reduction: 9308 / 18 / 42.31%
  balanced used/entities/reduction: 9593 / 20 / 40.55%

P8-05: BLOCKED


## EVAL-01N final interpretation — CLOSED

Astra final review:

`docs/development/EVAL-01N-RELEVANCE-DENSITY/ASTRA-FINAL-REVIEW.md`

Review commit:

`bc7c3703badc046a8050b9b56c86f63a4879d06f`

Verdict:

```text
SUPPORTED_FOR_LIVE_MICRO_VALIDATION
```

Selected live candidate:

`balanced_scope_first_min_tier`

Reason:

```text
retrieval-only
  densest package
  mean reduction ~45.55%
  but semantic retrieval alone may omit useful recent participant state

balanced scope-first
  mean reduction ~40.66%
  preserves newest-five recent participant state
  still fits all 7 source_1x cases at 12k
  safer quality candidate
```

Production policy remains unchanged.

# NOW — EVAL-01O Sealed Live Relevance-Density Micro-Validation

Question:

```text
Does balanced scope-first relevance density
repair the NORMAL rq-0025 broad@20k regression
without regressing the other source-grounded cases?
```

Conditions:

```text
CONTROL
  broad_20k_current

CANDIDATE
  balanced_scope_first_min_tier
  scope =
    query-named entities
    + semantic-top8 entities
    + participants from newest five recent events
  then minimum full-fit tier from 12k/16k/20k/24k
```

Live set:

```text
all 7 source_1x cases
3 repeats
2 conditions
42 provider calls
```

This is intentionally NORMAL-only. EVAL-01M already established stress-resilience value for adaptive scoping; EVAL-01O isolates the newly measured relevance-density question.

Hard isolation requirements:

```text
same query
same chapter cutoff
same source-derived base package
same model
same temperature
same prompt renderer
same task instruction
same author constraints

semantic IDs     EXACTLY IDENTICAL between conditions
recent event IDs EXACTLY IDENTICAL between conditions
world-rule IDs   EXACTLY IDENTICAL between conditions

only entity/current-state breadth and resulting minimum budget may differ
```

Gold-derived experimental entity locks remain removed.

Gold labels must not influence scope, tier choice, X/Y mapping, or call order.

Default capture:

```text
model            gemini-3.5-flash-lite
temperature      0.0
repeats          3
rows             7
planned calls    42
fixed key slot   one slot for full capture
fallback         none
quality          SEALED BLIND REVIEW
```

Primary success gate after reveal:

```text
rq-0025
  balanced candidate must improve or at minimum remove
  the prior consistent 0-3 regression versus broad@20k

other cases
  no systematic new regression pattern

negative/stability cases
  ambiguity/identity/causal boundaries preserved
```

Secondary evidence:

```text
Story Brain estimated size
entity/state counts
prompt character proxy
latency
backoff events
selected tier
```

Exact provider token usage/cost remains unavailable unless the client exposes it.

Production changes: NONE.
P8-05 remains BLOCKED.


## EVAL-01O harness — MERGED / LIVE CAPTURE AUTHORIZED

- PR: #25
- merge commit: `ac937b3d12f38d6ae3d5b63995ec10321e9b90eb`
- Evaluation Pilot Harness run: `36699131357` — **SUCCESS**
- CI provider calls: `0`
- production changes: **none**

CI dry-run contract:

```text
row_count                         7
planned_live_calls              42
routing_uses_gold            false
query_gold_used_for_scope    false
exact semantic IDs            true
exact recent IDs              true
exact rule IDs                true
same system prompt            true
candidate entities subset     true
candidate tier distribution:
  12k                           7
```

Density delta:

```text
mean broad@20k Story Brain     16,242
mean balanced scope-first       9,638
mean reduction                 40.66%
```

Known regression case `challenge:rq-0025`:

```text
broad@20k
  Story Brain used    16,135
  entities                68

balanced scope-first@12k
  Story Brain used     9,593
  entities                20
  reduction            40.55%
```

### Gemini / Antigravity — RUN EVAL-01O CAPTURE NOW

Use latest `main`.

Keep the same local workspace through capture → Astra blind review → reveal because the sealed private state is gitignored.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01o_sealed_live_relevance_density.py --stage dry-run
.\.venv\Scripts\python.exe scripts/run_eval_01o_sealed_live_relevance_density.py --stage capture --key-slot 1
```

Fixed-key contract:

```text
one key slot for all 42 calls
no key rotation
fallback model = none
if capture cannot complete on that slot:
  stop PARTIAL/BLOCKED
  do not continue with another slot
```

Public capture evidence to commit:

```text
docs/development/EVAL-01O-SEALED-LIVE-RELEVANCE-DENSITY/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  capture-contract.json
  sealed-state.json
  summary.md
```

Keep private until Astra blind review:

```text
.eval-private/eval01o-private.json
condition-key.json
raw-generations.json
prompt-diff-audit.json
latency-cost.json
reveal-verification.json
```

Gemini handoff after capture:

```text
### Gemini Verification — EVAL-01O SEALED LIVE RELEVANCE DENSITY

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

Model: gemini-3.5-flash-lite
Fixed key slot: <slot>
Successful calls: <n>/42
Backoff events: <n>
Sealed state SHA256: <sha>

Dry-run:
  rows: 7
  exact semantic IDs: true
  exact recent IDs: true
  exact rule IDs: true
  candidate tier 12k: 7/7

Condition mapping committed: false
Raw labelled outputs committed: false
Quality: BLIND_REVIEW_REQUIRED

P8-05: BLOCKED
```

Gemini must not identify X/Y or declare a winner.

After capture commit:

```text
Astra blind review
  -> freeze all 21 X/Y judgments
  -> primary focus rq-0025
  -> commit ASTRA-BLIND-REVIEW.md

Gemini reveal
  -> zero provider calls
  -> verify sealed SHA256

Astra final interpretation
  -> decide whether relevance-density routing is ready for a narrow production proposal
```

Production policy remains unchanged.
P8-05 remains BLOCKED.
