# Evidence delivery seal — ASTRA

- Tested source: `7d1f1bed508480db84def77c75c99039a9bacd7e`.
- Initial evidence payload: `3791a15f5a3febe46f428bd268cd44db1449a9a4`.
- Delivery is on `origin/codex/ai-copilot-pipeline-test`; main and the dirty original checkout were preserved.
- No source changes followed verification. Full Core acceptance remains ungranted; `HOLD_FE_INTEGRATION_ONLY`; stop for GPT-6 independent delta review.

`integrity-sha256.json` records the exact pre-staging working-file bytes. Windows/Git line-ending normalization changes Git blob bytes for 17 copied text logs/metadata files; their substantive content is unchanged. The original evidence and hashes are preserved without rewriting. Use the appended **`integrity-git-blobs.json`** to verify the exact committed payload portably with `git show <evidence_payload_sha>:<path>`, independently of checkout line-ending settings. Its manifest covers all 40 files in the initial evidence commit and does not recursively include this seal.

The whitespace warnings from `git diff --cached --check` were trailing whitespace/terminal blank lines in captured command logs, retained verbatim. They do not represent a failed runtime test, build or typecheck. Production source passed `git diff --check` before its commit. All test commands and exit codes remain in `commands.json` and the regression logs.
