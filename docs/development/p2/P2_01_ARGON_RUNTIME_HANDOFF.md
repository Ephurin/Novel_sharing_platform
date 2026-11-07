# P2-01 runtime acceptance — Argon handoff

2026-11-07 Asia/Saigon. **NOT_RUN_ENVIRONMENT locally.** Docker CLI exists but the Docker Desktop Linux engine pipe does not. No local PostgreSQL tools were found. Do not rerun earlier offline PASS suites merely to replace real DB evidence.

Target PR: #89, base `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627`. Correction source: `a4e602a5b59dad74d112efd188155aefdaed5323`. Fetch first and record the actual head; later closure documentation does not alter runtime source. Use a fresh checkout of the actual delivery head, not P1 demo or a dirty shared checkout.

## Isolation and preparation

Commands below are Bash for Argon, **not executed acceptance evidence**. Run from repository root with Docker/Compose, Python 3.12 and Node 22. Use the supplied two-service compose file only. It has no external volumes, bind mounts or connection to P1 QA. Use an unused project suffix and ports; if occupied, select fresh ports and update every localhost URL consistently. Never reuse the root production/demo compose project. Retain the task containers until evidence review; do not remove QA volumes or reset quota data.

```bash
set -euo pipefail
export P2_RUN=p2-01-argon-20261107-a
export P2_COMPOSE=docs/development/p2/p2-01-argon.compose.yml
export P2_EVIDENCE="$PWD/p2-01-argon-evidence-$P2_RUN"
mkdir -p "$P2_EVIDENCE"
git rev-parse HEAD > "$P2_EVIDENCE/source-sha.txt"
git rev-parse 'HEAD^{tree}' > "$P2_EVIDENCE/source-tree.txt"
git status --short > "$P2_EVIDENCE/status-before.txt"
docker compose -p "$P2_RUN" -f "$P2_COMPOSE" config > "$P2_EVIDENCE/compose.txt"
docker compose -p "$P2_RUN" -f "$P2_COMPOSE" up -d --wait
docker compose -p "$P2_RUN" -f "$P2_COMPOSE" ps > "$P2_EVIDENCE/services.txt"
docker compose -p "$P2_RUN" -f "$P2_COMPOSE" exec -T pg psql -U p2 -d p2a -v ON_ERROR_STOP=1 -c 'SELECT current_database(), version(); CREATE EXTENSION IF NOT EXISTS vector; SELECT extname,extversion FROM pg_extension;' > "$P2_EVIDENCE/database-identity.txt"
docker compose -p "$P2_RUN" -f "$P2_COMPOSE" exec -T mongo mongosh --quiet p2a --eval 'print(db.getName()); printjson(db.runCommand({ping:1}))' > "$P2_EVIDENCE/mongo-identity.txt"
python3.12 -m venv /tmp/ephurin-p2-01-argon-venv
. /tmp/ephurin-p2-01-argon-venv/bin/activate
python -m pip install -r ai-service/requirements.txt pytest httpx
(cd backend && npm ci)
```

All credentials here are task-only fixture values. Explicitly unset paid-provider keys/forwarding inherited from your shell. Use no private author notes. Pin outbound providers to fake, including embeddings. These variables must be set in each terminal running the tests or service:

```bash
export APP_ENV=test NODE_ENV=test SERVICE_AUTH_DISABLED=false
export DATABASE_URL='postgresql+psycopg://p2:p2-offline-fixture@127.0.0.1:57432/p2a'
export TEST_DATABASE_URL="$DATABASE_URL"
export NARRATIVE_REPOSITORY=postgres
export DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
export PLATFORM_SERVICE_TOKEN=p2-01-argon-offline
export LLM_PROVIDER=fake LLM_ENABLED=true EMBEDDING_PROVIDER=fake
export ACTIVE_EMBEDDING_VERSION=fake-embedding-768-v1
export SEMANTIC_RETRIEVAL_ENABLED=false ENTITY_CANDIDATE_VERIFICATION_ENABLED=false
export PLATFORM_API_BASE_URL=http://127.0.0.1:57114
export JWT_ACCESS_SECRET=p2-01-argon-offline-access-secret
export JWT_REFRESH_SECRET=p2-01-argon-offline-refresh-secret
export MONGODB_URI=mongodb://127.0.0.1:57017/p2a
export AI_SERVICE_URL=http://127.0.0.1:58001
```

## PostgreSQL admission/review acceptance

```bash
(cd ai-service && python -m alembic upgrade head) 2>&1 | tee "$P2_EVIDENCE/alembic.log"
(cd ai-service && python -m pytest -o addopts= -vv -s -m postgres_integration \
  --basetemp="/tmp/$P2_RUN-pg" --junitxml="$P2_EVIDENCE/a16.xml" \
  tests/test_p2_bootstrap_postgres.py) 2>&1 | tee "$P2_EVIDENCE/a16.log"
```

Expect **15 actual PASS cases**, zero skips: active idea/manuscript with/without baseline, exact-key replay after activation, changed payload conflicts, concurrent same-key replay and distinct-key rejection, running worker versus activation, late active/version changes, rollback injection, foreign tenant/bad source, manuscript replay, pending and missing required reviews. `P2A_PG_READBACK` lines contain full scoped narrative table snapshots/decisions and `P2A_HTTP` records. Preserve all lines; equal-before/after assertions must pass. Inspect the new pending/missing cases independently, not only the suite total. Also run existing affected P1 SQL suites on this isolated DB when review requests them; record their precise command and flags separately.

JSON fail-closed already has offline evidence. If you need fresh same-source confirmation, run only `tests/test_p2_json_bootstrap_compat.py -s` with OS temp output; do not mislabel this as SQL evidence.

## Gateway → AI → PG/Mongo + P1 changed save

Apply Node migrations with the Node URL (no `+psycopg`), then restore the Python URL for the AI process:

```bash
(cd backend && DATABASE_URL='postgresql://p2:p2-offline-fixture@127.0.0.1:57432/p2a' npm run db:migrate) 2>&1 | tee "$P2_EVIDENCE/node-migrations.log"
(cd ai-service && python -m uvicorn main:app --host 127.0.0.1 --port 58001) 2>&1 | tee "$P2_EVIDENCE/ai-service.log"
```

Keep that AI process running in its own terminal. In a second terminal with the same env, set Node's URL and run the opt-in test. It starts the real Gateway on 57114 itself; do not start a competing backend there. `PLATFORM_API_BASE_URL` points to that Gateway's internal immutable-revision endpoint, without `/api/v1`.

```bash
export DATABASE_URL='postgresql://p2:p2-offline-fixture@127.0.0.1:57432/p2a'
export TEST_P2A_LIVE=1
export P2A_EVIDENCE_FILE="$P2_EVIDENCE/gateway-durable-readbacks.json"
curl -fsS http://127.0.0.1:58001/health
(cd backend && npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts) 2>&1 | tee "$P2_EVIDENCE/gateway.log"
```

Expect one actual PASS, not the default SKIP. The fixture asserts both actual DB names equal `p2a` before mutations; this name is intentionally confined to these fresh task containers, not an existing DB with that name elsewhere. HTTP negatives cover anonymous/foreign/missing novel/active idea+manuscript. Before/after state includes all narrative scoped tables, decisions, Core chapters/revisions/outbox and Mongo draft/version. Following ordinary changed-body P1 save must yield two revisions total, exactly one completed outbox, Mongo version 2, unchanged approved entity/Brain version and active status. Outbox completion alone does not prove author Canon approval or M-FIRST.

Keep the final JSON even on failure. Do not manually edit rows to make the fixture pass. Save service errors, worker statuses and exact hashes; report genuine failures for Codex to fix. Further live request tests may use fake provider only and must retain explicit author review. This task does not authorize autonomous Canon approval.

## Required return package

- Actual source/head/tree and complete command + exit-code ledger (`pipefail` required); container image digests, migrations, PG/vector and Mongo identity.
- A16 JUnit + complete scoped DB readbacks, request statuses and fake provider counters.
- Gateway request/readback JSON, AI service log, revisions/hash/source_type, outbox identity/status, Mongo versions before/after and equality checks for rejected requests.
- Provider configuration and zero real dispatch confirmation, without tokens/private notes.
- `git status --short` after tests and a SHA-256 manifest of the package; no edits to historical evidence.
- Verdict PASS/FAIL per case or precise NOT_RUN_ENVIRONMENT. Do not promote the earlier CI suite total to new readbacks.

Stop the AI process after testing. Stop only the named project with `docker compose -p "$P2_RUN" -f "$P2_COMPOSE" stop`; retain its container data for review. No automatic cleanup of other projects. Runtime completion still stops at GPT-6/owner review; no merge or P2-02 implementation.
