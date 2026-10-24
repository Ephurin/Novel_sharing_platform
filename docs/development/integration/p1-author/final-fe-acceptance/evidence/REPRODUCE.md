# Reproduce on fresh local resources

Use source `c5a015aaef73eb4c5ed7c2b1673cc795567d0991` in a separate clean worktree. Do not reuse a previous project's volumes/config, run the old override-dependent Gemini smoke, reset a budget ledger, or modify other tasks' containers. Python 3.12, Node 22, Docker, standalone docker-compose (or Docker Compose plugin), and Edge/Chromium are prerequisites.

```powershell
# From the exact-source worktree; choose a NEW absolute output path outside it.
$out = 'C:/task-evidence/p1-new-run'
npm --prefix backend ci
npm --prefix web ci
python -m pip install -r ai-service/requirements.txt
python scripts/p1_final_acceptance.py provision --output $out
python scripts/p1_final_acceptance.py bridge-config --output $out
python scripts/p1_final_acceptance.py db-up --output $out
python scripts/p1_final_acceptance.py up --output $out
python scripts/p1_final_acceptance.py runtime-proof --output $out
python scripts/p1_final_acceptance.py web-build --output $out
python scripts/p1_final_acceptance.py web-assets --output $out
python scripts/p1_final_acceptance.py web-units --output $out
python scripts/p1_final_acceptance.py web-mounted --output $out
python scripts/p1_final_acceptance.py ai-unit --output $out
python scripts/p1_final_acceptance.py ai-postgres --output $out
python scripts/p1_final_acceptance.py backend-regression --output $out
python scripts/p1_final_acceptance.py provider-before --output $out
python scripts/p1_final_acceptance.py browser-review --output $out
python scripts/p1_final_acceptance.py provider-after --output $out
python scripts/p1_final_acceptance.py cleanup-owned --output $out
```

`up` initializes the new budget exactly once; use rebuild-app for an existing running project. Scripts generate test-only secrets in a private external env/config; NEVER commit them. Runtime LLM transport is budget-gateway → fake-upstream on internal networks, model alias Gemini 3.5 Flash Lite; no cloud keys or fallback. Embeddings are disabled in browser runtime; fake embedding/pgvector tests run separately. HITL flag is explicitly true in the isolated acceptance stack, factory default OFF is verified. Future live policy remains primary 3.5 Flash Lite, explicit fallback 3.1 Flash Lite, never 2.5; no live authorization implied.

Fixtures register actual accounts and set test-owned roles in SQL; no named initial Canon is seeded. Browser performs occurrence grouping, partial save, conflict/refresh, freeze, continue, edited atomic Canon approval, rejection, corrections, locks and resume. Negative API probes and SQL-published Reader fixtures are separately labeled. No publication API is invoked. Full DB snapshots, HTTP/console/trace/screenshots are persisted. Mounted component contracts use their existing fixtures and are not counted as real-stack acceptance.

Supplemental proof/replay scripts in repro/ accept --root and --output. The cleanup evidence script is intentionally leased to this recorded project's exact ID; use public cleanup-owned for a new reproduction. Only owned containers/networks are removed; volumes remain. Original Gemini smoke/evidence stays historical; its runtime API overrides are now unsupported and superseded by the fixed-proxy full suite.
