# EVAL-01E — Sealed Provenance Generation A/B

Status: EXPERIMENT HARNESS
Production code change: NONE
Frozen corpus mutation: NONE
Live provider: Gemini
Review protocol: TWO-STAGE SEALED BLIND REVIEW

## New-machine bootstrap

Use this section when the repository has just been cloned/pulled onto a new machine.

### Local secret source

The user's local Gemini key(s) remain in:

`key.txt`

This file is a local secret source only.

Never:

- print/cat/type/Get-Content the key to the terminal;
- paste the key into chat, logs, reports, commits, screenshots, or evidence;
- commit `key.txt`;
- commit `.env.eval.local`.

The repository already ignores both `key.txt` and `.env.*`.

Verify ignore rules without displaying file contents:

```powershell
git check-ignore -q key.txt
if ($LASTEXITCODE -ne 0) { throw "key.txt is not ignored" }

git check-ignore -q .env.eval.local
if ($LASTEXITCODE -ne 0) { throw ".env.eval.local is not ignored" }
```

### Python environment

On Windows PowerShell, prefer a repo-local virtual environment:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\ai-service\requirements.txt
```

If `.venv` already exists and imports work, reuse it instead of recreating it.

Sanity check:

```powershell
.\.venv\Scripts\python.exe -c "import pydantic, sqlalchemy, psycopg, pgvector; print('python-deps-ok')"
```

Do not write package-manager output containing secrets into evidence.

### Convert key.txt -> .env.eval.local safely

The evaluation harness reads fixed slots from `.env.eval.local`:

```text
GEMINI_API_KEY_SLOT_1=<secret>
GEMINI_API_KEY_SLOT_2=<secret>
GEMINI_API_KEY_SLOT_3=<secret>
GEMINI_API_KEY_SLOT_4=<secret>
```

Gemini must create this file locally from `key.txt` without echoing the secret.

Use the following PowerShell-safe bootstrap. It supports:

- one bare key line -> slot 1;
- up to four bare non-empty lines -> slots 1..N;
- existing `GEMINI_API_KEY_SLOT_N=value` lines;
- a single `GEMINI_API_KEY=value` line -> slot 1.

```powershell
@'
from pathlib import Path

src = Path("key.txt")
dst = Path(".env.eval.local")

if not src.exists():
    raise SystemExit("BLOCKED: key.txt not found")

lines = [
    line.strip()
    for line in src.read_text(encoding="utf-8-sig").splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]

slots = {}
bare = []

for line in lines:
    if "=" in line:
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if name.startswith("GEMINI_API_KEY_SLOT_"):
            try:
                slot = int(name.rsplit("_", 1)[1])
            except ValueError:
                continue
            if 1 <= slot <= 4 and value:
                slots[slot] = value
        elif name == "GEMINI_API_KEY" and value:
            slots.setdefault(1, value)
    else:
        bare.append(line)

for value in bare:
    for slot in range(1, 5):
        if slot not in slots:
            slots[slot] = value
            break

if not slots:
    raise SystemExit("BLOCKED: no Gemini key found in key.txt")

dst.write_text(
    "".join(
        f"GEMINI_API_KEY_SLOT_{slot}={slots[slot]}\n"
        for slot in sorted(slots)
    ),
    encoding="utf-8",
)

print(
    "eval-secret-config-ok:",
    "slots=" + ",".join(str(slot) for slot in sorted(slots)),
)
'@ | .\.venv\Scripts\python.exe -
```

The command may print slot numbers only. It must never print key values.

Then verify configuration without revealing secrets:

```powershell
.\.venv\Scripts\python.exe -c "from pathlib import Path; p=Path('.env.eval.local'); assert p.exists() and p.stat().st_size > 0; print('eval-env-present')"
git status --short
```

Expected: neither `key.txt` nor `.env.eval.local` appears in `git status`.

### Fixed-slot measurement rule

Before live capture, choose one available slot. Default:

`--key-slot 1`

Once capture starts:

- keep the same slot for all 42 calls;
- never rotate to another key mid-run;
- never combine partial calls from multiple slots into one measurement.

If the selected slot hits a quota/rate-limit condition that cannot recover with the harness's same-key backoff:

1. stop the run;
2. report PARTIAL/BLOCKED;
3. preserve or discard the partial run explicitly;
4. if a different slot is used for a retry, rerun the entire 42-call experiment from a clean capture state using that one fixed slot.

Do not use multiple keys to bypass provider quota.

### New-machine preflight

Before EVAL-01E capture, run with the venv Python:

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01e_sealed_provenance_ab.py --stage dry-run
```

Only after all preflight commands pass should Gemini run live capture.

## Goal

Measure whether compact provenance metadata improves narrative reasoning when the memory text itself no longer contains evaluator-written replay/canonical judgments.

EVAL-01E removes the largest EVAL-01D confound by using a derived neutral context view.

The frozen benchmark files remain unchanged.

## Cases

- core_gold:rq-0011 — sword origin
- challenge:rq-0023 — repeated Pillar No. 2 destruction
- challenge:rq-0025 — repeated cavalry-state history
- challenge:rq-0020 — conflicting attributed battle history
- challenge:rq-0032 — earlier reported interpretation vs later established evidence
- core_gold:rq-0038 — physical seed identity provenance
- core_gold:rq-0010 — negative control for causal-history reasoning

Default live run:

- model: gemini-3.5-flash-lite
- temperature: 0.0
- repeats: 3
- conditions: pre_provenance / post_provenance
- calls: 42
- fixed key slot for whole run
- no key rotation
- no fallback model

## Derived neutral context view

Fixture:

benchmarks/eval01e_neutral_context.json

Rules:

1. Do not modify .data/Frozen_v1.
2. Preserve local event facts and speaker attribution.
3. Remove only evaluator-added cross-memory judgments such as:
   - again / yet again as replay labels;
   - even though this already happened;
   - this is not independently confirmed;
   - source does not explicitly identify X as Y;
   - narrator directly states/frames as an evaluator source-status cue.
4. A/B uses the same neutralized content in both conditions.
5. Only compact provenance metadata differs.

The harness emits a neutralization audit with original/neutral content hashes.

## A/B isolation

Both branches must keep identical:

- task prompt;
- chapter cutoff;
- accepted top-10 candidate IDs/order;
- neutralized memory content;
- component scores;
- context packer;
- production prompt renderer;
- model;
- temperature;
- constraints.

Only post_provenance adds:

- confirmation_status
- memory_id
- chapter_title
- tags
- status
- review_status
- supersedes_id when present

Dry-run fails if stripping those fields from post_provenance does not exactly reproduce pre_provenance context.

## Sealed two-stage protocol

### Stage 1 — capture

Run:

python scripts/run_eval_01e_sealed_provenance_ab.py --stage capture --key-slot 1

The harness writes reviewer-safe evidence only:

docs/development/EVAL-01E-SEALED-PROVENANCE-AB/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  neutralization-audit.json
  sealed-state.json
  summary.md

Private state is written locally only:

.eval-private/eval01e-private.json

.gitignore excludes .eval-private/.

Private state contains:

- condition mapping;
- call order;
- raw condition-labelled generations;
- prompt/context hashes;
- latency by condition.

The public sealed-state.json contains SHA256(private_state).

Gemini commits only reviewer-safe evidence.

Gemini must not:

- open reviewer-blind.json to score it;
- reveal condition mapping;
- commit raw condition-labelled outputs;
- commit .eval-private;
- run stage reveal;
- declare a winner.

### Astra blind review

Astra may inspect only:

- reviewer-blind.json
- review-rubric.md

Astra must not inspect:

- .eval-private
- workflow logs containing private state
- condition mapping
- prompt hashes
- condition-labelled raw outputs

Astra commits the blind review before reveal.

### Stage 2 — reveal

Only after Astra blind review commit, Gemini runs on the same local workspace:

python scripts/run_eval_01e_sealed_provenance_ab.py --stage reveal

Reveal performs zero provider calls.

It first verifies:

SHA256(local private state) == sealed-state.json commitment

Then it writes:

- condition-key.json
- raw-generations.json
- prompt-diff-audit.json
- latency-cost.json
- reveal-verification.json

Gemini commits these reveal artifacts.

Astra then maps the frozen blind judgments to conditions.

## Decision boundary

Possible outcomes:

- repeatable post-provenance gain with no negative-control degradation:
  justify a narrower prompt/context experiment;
- no meaningful difference:
  provenance remains infrastructure but no new prompt policy;
- mixed:
  expand benchmark;
- worse:
  do not surface/use provenance automatically.

No result directly authorizes ranking changes or global filtering.

## Guardrails

Do not:

- mutate frozen gold;
- alter retrieval ordering;
- alter hybrid weights;
- change embedding model/version;
- add ANN;
- alter temporal cutoff;
- modify production prompt behavior during this experiment;
- rotate keys to bypass quota;
- reveal mapping before blind review.

P8-05 remains BLOCKED.
