# Regression summary

Final source `dace9f9bc92f6b4209b8e6692985cfa8e3f805df`, clean tracked tree. Evidence was the only untracked directory. Results independently executed; no inherited PASS is counted.

| Check | PASS | FAIL | SKIP | Exit / evidence |
|---|---:|---:|---:|---|
| Focused backend unit, including 34 internal authorization checks | 110 | 0 | 0 | 0; SEALED-backend-unit.txt |
| Focused AI revision/bootstrap/analysis/generation/canon tests | 44 | 0 | 0 | 0; SEALED-AI-unit.txt; 4 existing FastAPI deprecation warnings |
| Real Mongo reconciliation | 6 | 0 | 0 | 0; persistence-reconciliation-9411d956383d.txt |
| Real PG outbox lease/fencing | 2 | 0 | 0 | 0; persistence-outbox-postgres-9411d956383d.txt |
| Real PG/Mongo accepted-generation persistence (fake AI responses) | 5 | 0 | 0 | 0; persistence-accepted-persistence-9411d956383d.txt |
| Real HTTP/PG/Mongo contract, fake-provider supported baseline path | 17 | 0 | 0 | 0; SEALED-runtime/validation.json |
| **Total executed test assertions/rows** | **184** | **0** | **0** | Node counts follow test-runner output; API rows counted separately |

Typecheck and backend build PASS, both exit 0; source diff whitespace check PASS exit 0. Fresh DB migrations PASS. Exact argv, CWD, SHA and exit codes: SEALED-targeted-commands.json, persistence-runtime-9411d956383d.json and SEALED-commands.json.

NOT_RUN: 5 explicitly out-of-scope gate groups: full AuthorWritingIde S09-S11, real model/embedding quality, populated/shared DB upgrade, P3 100k, production deployment. No required repair case is silently skipped. Worker failure proof consists of real SQL outbox transaction fault/retry plus focused extraction-failure unit regression; no broad worker-crash stress certification.

RED baseline independently reproduced 10 PASS/3 FAIL at 1394bf66f802bc9b0c4a1bba50cdc1140940353b. All original 10 PASS rows remain PASS and all 3 regressions are GREEN. Intermediate GREEN/FINAL runs are retained for provenance, not added to the final 184 total.

Resources: 32 newly created containers stopped; 26 new named/anonymous volumes retained (including Mongo config volumes), RESOURCE_AUDIT.json. No historical DB, volume, report or source was deleted or reused. No real provider/embedding/payment execution.
