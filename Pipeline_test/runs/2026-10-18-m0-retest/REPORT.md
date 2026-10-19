# M0 repairs and retest — 2026-10-18

## Verdict

**Local regression PASS; real-provider M0 retest NOT RUN (approval blocked).**
This is not evidence that P1/P2/P3 can finish a 100k-word novel. The previous
2026-10-17 report remains the latest completed real-provider run and remains BLOCKED.
No M10/M20/M50 checkpoint, controller run, accepted new chapter or final novel was produced here.

## Implemented repairs

1. **P1 structured extraction:** entity, event, state-transition and idea-blueprint
   calls use a separate `LLM_STRUCTURED_MAX_TOKENS` budget (default 8192), with
   Gemini JSON MIME mode. Ordinary suggestion output retains its existing budget.
   Invalid JSON, explicit token truncation and non-completion finish reasons fail;
   no automatic JSON salvage or silent acceptance of partial output.
   The earlier 512-token limit was a plausible cause, not a proven diagnosis:
   old evidence did not contain provider finish reasons.
2. **P2 initial status:** idea entities expose a reviewable `initial_status`.
   The prompt requires constraints about already-dead characters to be respected,
   and forbids deriving present state from future outline events. Accepted new
   entities preserve this status; unspecified status defaults to Unknown instead
   of Alive. Existing entities are not rewritten automatically. A model omitting
   or misreading a constraint can still fail the memory gate; live testing is needed.
3. **P3 confidence overflow:** extractor scores consistently convert from 0–10
   to 0–1, including scores below 1. All repository adapters validate the complete
   proposal batch before saving, rejecting nonfinite or out-of-range confidence.

Structured provider traces include operation, source revision identifiers where
available, prompt/response hashes, output size, finish reason, response ID and
token usage where supplied by the SDK. They do not log full manuscript or raw
provider response. These traces support correlation, but cannot replace raw-response
inspection when a future failure requires it.

## Validation

- Targeted suite: **81 passed**, four existing FastAPI deprecation warnings.
- Complete default Python suite: **270 passed, 2 skipped, 42 deselected,
  6 subtests passed**, four FastAPI deprecation warnings.
- The 42 deselected tests are PostgreSQL integration tests excluded by the
  repository's default pytest configuration. Repository contract tests in the
  passing suite include the SQL adapter on SQLite, not a real PostgreSQL run.
- `git diff --check`: passed (line-ending notices only).
- AI-service image built and local demo AI-service recreated; health is `healthy`.
  Backend/web/database services were not recreated. No database reset.
- Initial full-suite invocation lacked external harness files. A read-only mount
  invocation exposed an unwritable pytest temp path and Gemini mock import-order
  issue. Corrected mock isolation and explicit `/tmp` basetemp; final suite above passed.

Reproducible full-suite command (PowerShell from repository root):

```powershell
docker run --rm -e APP_ENV=test --mount "type=bind,source=$((Get-Location).Path),target=/workspace,readonly" -w /workspace/ai-service testproject-ai-service python -m pytest -q -p no:cacheprovider --basetemp=/tmp/m0-pytest
```

## Live retest gate

`retest.py` prepares isolated P1/P3 projects with the existing five synthetic
manuscript chapters and a separate P2 idea project. It uses author public APIs,
immutable snapshots with MANUSCRIPT_BOOTSTRAP purpose, exact readback checks,
and redacted evidence. It never automatically accepts proposals.

The sandbox denied localhost access before login. Automatic approval review then
rejected the escalated `retest.py start` command because sending manuscript payloads
to Gemini had not been explicitly authorized in the available user context.
The rejected command did not execute. No state.json or new project was created
by this script. Do not bypass this gate via Docker, another transport or provider.

Required confirmation: permission to submit `Pipeline_test/input/manuscript/ch01.md`
through `ch05.md`, plus the existing P2 idea and author constraints, to the configured
Gemini provider (`gemini-3.5-flash-lite`) for this M0 retest, incurring API usage.

After permission: run `python Pipeline_test/runs/2026-10-18-m0-retest/retest.py start`,
then explicit `poll <unique-attempt>` calls. Inspect proposals before acceptance;
verify P2 Dead status after activation and run all M0 gold/probe checks for P1/P3.
Bootstrap reaching waiting_review alone is not a memory PASS. Do not start the
100k-word long run while the memory gate remains unresolved.
