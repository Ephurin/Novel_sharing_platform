# Wave 1E direct source patch — GPT-6 handoff to execution agent

**Date:** 2026-10-21 UTC+7; **branch:** `codex/ai-copilot-pipeline-test`.  
**Scope:** narrow direct GitHub edits to Wave 1E test harness/source-format validation only. Historical failed-run fixtures, ledgers, screenshot traces, canonical evidence and actual novel service records not edited. **No provider calls, browser runs or local full-repository pytest executed by the reviewer**; reported status is **CODE_PATCHED_TESTS_PENDING**.

## Implemented, source-only

- `Pipeline_test/tools/manuscript_fixture.py` (new): version `markdown-h1-title-body-nfc-lf-v1` uses the first `# Chương N — Name` H1 as editor title and remaining text as body, with documented UTF-8/no-BOM, CRLF→LF and NFC normalization. Tracks **source-file SHA256 vs canonical BODY SHA256 separately**, rejects empty/broken/misnumbered fixtures without modifying them.
- `Pipeline_test/tools/provenance.py`: `verify_manuscript_gold_hashes()` now checks canonical stored chapter `title`, BODY-only revision content and hash, owner, order and revision ID; wrong whole-file raw hash must fail rather than qualify as pass.
- `Pipeline_test/tools/browser_author_driver.py`: real Playwright uses parsed title and body, demands title+body autosave/readback, emits `source-to-canonical-manifest.json` on success and labels action-specific copied final snapshots honestly `final_post_run_readback`.
- `Pipeline_test/tests/test_partial_import_idempotency.py`: existing deterministic gold chapter generator updated to use new title/body mapping instead of full Markdown raw-body.
- `Pipeline_test/tests/test_manuscript_fixture_mapping.py` (new): frozen five chapters, parser correctness + source preservation, correct canonical mock, old Wave 1D title/body mismatch, wrong hash, absent hashes, Unicode/CRLF normalization, broken headings and malformed input negative cases.

## IMPORTANT: test and acceptance status

This is **a source edit, not independent executable test evidence**. The reviewer lacks access to the author's local Git/Docker/Playwright runtime, and could not clone public GitHub from its sandbox (network unavailable). The execution agent should **check HEAD and run** in its current checked-out project:

```bash
python -m pytest -q Pipeline_test/tests/test_manuscript_fixture_mapping.py Pipeline_test/tests/test_partial_import_idempotency.py Pipeline_test/tests/test_ui_evidence_authenticity.py -p no:cacheprovider -o addopts=''
python -m pytest -q Pipeline_test/tests -p no:cacheprovider -o addopts=''
```

Then, only on a **new isolated test-owned fake-upstream stack**, run S01→S02 Playwright; inspect real titles, revision body hashes, source mapping and action/GET correlation, with screenshots and trace. If any test fails, **fix narrowly and report RED→GREEN with actual output**. Old Wave 1D attempt-04 was known to include `# Chương ...` in body and remains frozen historical evidence; **do not edit it or relabel as contract-compliant PASS**.

## Continuing Wave 1E (other work)

- **P0:** mixed positive, negative and unresolved **source-supported** fake S02 entity decisions, author keep/reject/correct/continue and event/fact only after `entities_reviewed`. Do this with real browser and new isolated fake project if safe. Never claim gold or real-model quality.
- **P1:** per-action timestamp-specific readback, if feasible; current code now explicitly labels final-post-run snapshots, so no claim of immediate per-step persistence.
- **P2 DEFERRED:** paid-tier mathematical USD $5 hard cap. See `Pipeline_test/FREE_TIER_BUDGET_PRIORITY_DECISION_2026-10-21.md`. Operational call-limit, retries and quota handling still required; **zero real provider calls until separately approved**.
- Ensure no source fixture/gold mutation; no PR/merge or `main` modifications. Keep preserved Wave 1D DB/ledgers/projects as-is.

**Verdict:** `WAVE_1E_S01_MAPPING_PATCHED_PENDING_EXECUTED_TESTS`; overall P1 remains **BLOCKED / NOT ACCEPTED**, Wave 1E mixed HITL and S01/S02 rerun **NOT_RUN** in this reviewer turn.
