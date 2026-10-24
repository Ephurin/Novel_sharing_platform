# Ready-to-paste execution prompt — Gemini Flash 3.8

You own a separate local, fake-provider **mounted Author IDE S09–S11 execution task** for Ephurin/Novel_sharing_platform. Integration is MERGED_AND_POST_MERGE_CI_VERIFIED at **dd2f8003b0ad94e6097819cdca0249aa591f54fa**, tree **5a60db0f8e5591594902ab0bdd9d3832b663f453**. P7 run 40043929597 is SUCCESS 3/3; P8 run 40043929636 SUCCESS 7/7. Do not merge PR #57, change main/feat branches, deploy, publish, start Full auto/P3, or invoke any live Gemini/embedding endpoint. Your agent name is not authorization to use a live Gemini API.

Save this prompt and READINESS.md outside the source checkout before starting. Read the source contract and the readiness blockers B1–B6. The new UI is **not** declared integrated: missing controls must yield BLOCKED/FAIL with screenshots and exact owner, not a substitute UI, route mock or direct-API “browser PASS.” You may write Playwright diagnostics in the new evidence folder, but do not alter production FE components or historical evidence. Initial fixture APIs and separately labeled backend diagnostics are allowed; they cannot complete missing browser interactions.

## 1. Exact isolated checkout and resources (PowerShell 7, Node 22+, Python 3.12, Docker)

Use a clean detached worktree; never reset the user's existing dirty checkout. Run in a fresh terminal and keep the following variables/session. Adjust only the existing repository locator if needed. All new paths below are inside this task's writable scratch root.

```powershell
$ErrorActionPreference = 'Stop'
$OriginRepo = 'C:\Users\Laptop\OneDrive\Documents\testproject'
$Scratch = 'C:\Users\Laptop\.codex\visualizations\2026\10\22\01a1643d-da57-7160-b72e-640d59fa14db'
$Run = 'p1-ide-' + [guid]::NewGuid().ToString('N').Substring(0,10)
$TaskRoot = Join-Path $Scratch $Run
$Checkout = Join-Path $TaskRoot 'source'
$Evidence = Join-Path $TaskRoot 'evidence'
New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
git -C $OriginRepo fetch origin integration/p1-author
git -C $OriginRepo worktree add --detach $Checkout dd2f8003b0ad94e6097819cdca0249aa591f54fa
if ($LASTEXITCODE -ne 0) { throw 'Worktree setup failed' }
if ((git -C $Checkout rev-parse HEAD) -ne 'dd2f8003b0ad94e6097819cdca0249aa591f54fa') { throw 'Wrong source' }
if ((git -C $Checkout rev-parse 'HEAD^{tree}') -ne '5a60db0f8e5591594902ab0bdd9d3832b663f453') { throw 'Wrong tree' }
git -C $Checkout status --porcelain
Start-Transcript -Path (Join-Path $Evidence 'commands-transcript.txt')
$Db = 'ephurin_test_' + $Run.Replace('-','_')
$Pg = $Run + '-pg'; $Mongo = $Run + '-mongo'
docker run -d --name $Pg --label "ephurin.e2e=$Run" -p '127.0.0.1::5432' -e POSTGRES_HOST_AUTH_METHOD=trust -e "POSTGRES_DB=$Db" pgvector/pgvector:pg16
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL creation failed' }
docker run -d --name $Mongo --label "ephurin.e2e=$Run" -p '127.0.0.1::27017' mongo:7
if ($LASTEXITCODE -ne 0) { throw 'Mongo creation failed' }
$PgPort = ((docker port $Pg 5432).Trim() -split ':')[-1]
$MongoPort = ((docker port $Mongo 27017).Trim() -split ':')[-1]
# Readiness: repeat until both succeed, bounded to 60 seconds; stop on timeout.
for ($attempt=0; $attempt -lt 60; $attempt++) {
  docker exec $Pg pg_isready -U postgres | Out-Null; $pgReady = $LASTEXITCODE -eq 0
  docker exec $Mongo mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' | Out-Null
  if ($pgReady -and $LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
if ($attempt -eq 60) { throw 'Database readiness timeout' }
function Free-Port {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
  $listener.Start(); $value = $listener.LocalEndpoint.Port; $listener.Stop(); return $value
}
$AiPort=Free-Port; $BackendPort=Free-Port; $WebPort=Free-Port
$Ai="http://127.0.0.1:$AiPort"; $Backend="http://127.0.0.1:$BackendPort/api/v1"; $Web="http://127.0.0.1:$WebPort"
$NodePg="postgresql://postgres@127.0.0.1:$PgPort/$Db"
$PythonPg=$NodePg.Replace('postgresql:','postgresql+psycopg:')
$env:DATABASE_URL=$NodePg; $env:TEST_DATABASE_URL=$NodePg
$env:MONGODB_URI="mongodb://127.0.0.1:$MongoPort/$Db"
$env:NODE_ENV='test'; $env:APP_ENV='test'
$env:JWT_ACCESS_SECRET='isolated-e2e-access-secret-only'
$env:JWT_REFRESH_SECRET='isolated-e2e-refresh-secret-only'
$env:PLATFORM_SERVICE_TOKEN='isolated-e2e-service-token-only'
$env:DEFAULT_TENANT_ID='00000000-0000-0000-0000-000000000001'
$env:DEFAULT_ACTOR_ID='00000000-0000-0000-0000-000000000002'
$env:PLATFORM_API_BASE_URL="http://127.0.0.1:$BackendPort"
$env:AI_SERVICE_URL=$Ai; $env:WEB_ORIGIN=$Web
$env:DB_CONNECT_ON_START='true'; $env:API_PREFIX='/api/v1'
$env:EPHURIN_ALLOW_TEST_DB_MUTATIONS='1'; $env:EXPECTED_TEST_DB_NAME=$Db
$env:LLM_PROVIDER='fake'; $env:EMBEDDING_PROVIDER='fake'
$env:NARRATIVE_REPOSITORY='postgres'; $env:SERVICE_AUTH_DISABLED='false'
$env:SEMANTIC_MEMORY_ENABLED='false'; $env:SEMANTIC_RETRIEVAL_ENABLED='false'
$env:LLM_BASE_URL='http://127.0.0.1:9'; $env:AI_LLM_BASE_URL='http://127.0.0.1:9'
foreach ($name in 'GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','GROQ_API_KEY','LLM_API_KEY','AI_LLM_API_KEY') { Set-Item "Env:$name" '' }
python -m venv (Join-Path $TaskRoot 'venv')
$Py=Join-Path $TaskRoot 'venv/Scripts/python.exe'
& $Py -m pip install -r (Join-Path $Checkout 'ai-service/requirements.txt') pytest httpx
if ($LASTEXITCODE -ne 0) { throw 'Python dependencies failed' }
Push-Location (Join-Path $Checkout 'backend')
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies failed' }
npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'SQL migration failed' }
Pop-Location
$env:DATABASE_URL=$PythonPg; $env:TEST_DATABASE_URL=$PythonPg
Push-Location (Join-Path $Checkout 'ai-service')
& $Py -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'AI migration failed' }
& $Py -c "import os; os.environ.pop('ENTITY_CANDIDATE_VERIFICATION_ENABLED',None); from core.settings import Settings; assert Settings.from_env().entity_candidate_verification_enabled is False; print('default OFF confirmed')"
if ($LASTEXITCODE -ne 0) { throw 'Default flag changed' }
Pop-Location
Push-Location (Join-Path $Checkout 'web')
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Web dependencies failed' }
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed' }
Pop-Location
```

Record native commands/actual exit codes individually, not just the transcript. No shared compose volume/port is used. Inspect migrations read-only: backend schema_migrations is keyed by complete SQL filename (including the existing duplicate 012 prefix); SQL 017 and AI Alembic 0013_objective_intent are already integrated. Do not rename, skip, stamp or synthesize migration success. PostgreSQL must have vector extension. No new migration is expected.

## 2. Start real services with fake providers

```powershell
$Node=(Get-Command node).Source
$env:ENTITY_CANDIDATE_VERIFICATION_ENABLED='true'
$env:DATABASE_URL=$PythonPg; $env:TEST_DATABASE_URL=$PythonPg
$AiProcess=Start-Process -WindowStyle Hidden -PassThru -FilePath $Py -WorkingDirectory (Join-Path $Checkout 'ai-service') -ArgumentList @('-m','uvicorn','main:app','--app-dir',(Join-Path $Checkout 'ai-service'),'--host','127.0.0.1','--port',"$AiPort") -RedirectStandardOutput (Join-Path $Evidence 'ai.log') -RedirectStandardError (Join-Path $Evidence 'ai-error.log')
$env:DATABASE_URL=$NodePg; $env:TEST_DATABASE_URL=$NodePg; $env:PORT="$BackendPort"
$BackendProcess=Start-Process -WindowStyle Hidden -PassThru -FilePath $Node -WorkingDirectory (Join-Path $Checkout 'backend') -ArgumentList @((Join-Path $Checkout 'backend/node_modules/tsx/dist/cli.mjs'),(Join-Path $Checkout 'backend/src/main.ts')) -RedirectStandardOutput (Join-Path $Evidence 'backend.log') -RedirectStandardError (Join-Path $Evidence 'backend-error.log')
$env:VITE_API_BASE_URL=$Backend
$WebProcess=Start-Process -WindowStyle Hidden -PassThru -FilePath $Node -WorkingDirectory (Join-Path $Checkout 'web') -ArgumentList @((Join-Path $Checkout 'web/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',"$WebPort",'--strictPort') -RedirectStandardOutput (Join-Path $Evidence 'web.log') -RedirectStandardError (Join-Path $Evidence 'web-error.log')
$OwnedProcesses=@($AiProcess,$BackendProcess,$WebProcess) | ForEach-Object { @{Id=$_.Id; StartTicks=$_.StartTime.ToUniversalTime().Ticks.ToString()} }
@{run=$Run;source='dd2f8003b0ad94e6097819cdca0249aa591f54fa';checkout=$Checkout;database=$Db;pg=$Pg;mongo=$Mongo;ai=$Ai;backend=$Backend;web=$Web;processes=$OwnedProcesses} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Evidence 'resources.json')
# Poll these local health URLs for at most 60 seconds. Record bodies and exit/status.
Invoke-RestMethod "$Ai/health"
Invoke-RestMethod "$Backend/health"
Invoke-WebRequest $Web | Select-Object StatusCode
docker exec $Pg psql -U postgres -d $Db -c 'SELECT migration_id FROM schema_migrations ORDER BY migration_id; SELECT version_num FROM alembic_version; SELECT extversion FROM pg_extension WHERE extname=''vector'';'
```

Use bounded retries while startup is in progress; a port collision is a setup failure, not permission to kill an existing listener. Record Docker image IDs, database names, source/tree, process ownership and fake-only configuration. Do not print provider keys or unrelated environment values. Browser HAR must redact Authorization/cookies/local passwords before sharing.

Verify actual default-OFF compatibility in a separate unique-name fixture: stop only the owned AI process, restart with ENTITY_CANDIDATE_VERIFICATION_ENABLED removed, assert guidance.chapter_review_enabled=false and legacy analysis does not enter waiting_entity_review or auto-approve Canon. Capture DB state. Restart the owned AI with the flag true, update PID/start-time manifest and use a different empty novel for new HITL tests. The Python default assertion above is a configuration check, not this runtime/browser acceptance.

## 3. Accounts and initial fixtures

Create two ACTIVE AUTHOR accounts A/B using local /auth/register then /auth/become-author; credentials must be unique test-only values (password upper/lower/digit, >=8 characters). Example provisioning (not a browser review result):

```powershell
$TestPassword='LocalOnlyA9_' + [guid]::NewGuid().ToString('N')
$Accounts=@()
foreach ($suffix in 'a','b') {
  $username=$Run.Replace('-','_')+'_'+$suffix
  $registered=Invoke-RestMethod "$Backend/auth/register" -Method Post -ContentType 'application/json' -Body (@{email="$username@example.test";username=$username;password=$TestPassword}|ConvertTo-Json)
  $author=Invoke-RestMethod "$Backend/auth/become-author" -Method Post -Headers @{Authorization="Bearer $($registered.data.accessToken)"}
  $Accounts+=@{username=$username;userId=$author.data.user.userId;token=$author.data.accessToken}
}
```

Keep tokens/password only in a local private fixture manifest, never committed evidence. Log in through the real /login UI in independent browser contexts. Create A's target DRAFT novel and at least two chapters, A's second novel and B's foreign novel. Empty Story Brain must have no pre-seeded Minh IDs. Use unique titles/UUIDs and maintain owned users/novels/chapters/revisions/outbox registry. Do not run broad resetting seed scripts.

For same-name discovery, source prose should explicitly distinguish two people: “Minh, người thầy ở làng phía bắc, gặp Minh, người thợ ở làng phía nam. Người thầy tên Minh; người thợ cũng tên Minh.” Add lowercase missing-name “lan” only through subsequent guidance/refresh. The deterministic fake may discover capitalization/extra candidates; record every raw candidate and author rejection. Do not equate all mentions named Minh; only human controls can establish group membership. If required controls are absent, capture that blocker immediately. Do not inject pre-reviewed groups or pre-approved Canon to claim this case passed.

## 4. Browser execution and evidence

Launch the **real Vite router at $Web/author/ide**, not a component/hook fixture. Implement specs/config only under $Evidence (outside checkout). Import Playwright from the installed checkout web/node_modules via an absolute file URL, set testDir=$Evidence/specs, outputDir=$Evidence/browser, baseURL=$Web, reporter JSON/HTML into $Evidence, trace=on and screenshot=on. Commands:

```powershell
& (Join-Path $Checkout 'web/node_modules/.bin/playwright.cmd') test --config (Join-Path $Evidence 'playwright.config.mjs') --project chromium --trace on
$BrowserExit=$LASTEXITCODE
& (Join-Path $Checkout 'web/node_modules/.bin/playwright.cmd') show-report (Join-Path $Evidence 'html-report')
```

You must create the real mounted specs/config before these commands; no full-stack S09–S11 suite currently exists. Attach pageerror/console/requestfailed listeners, HAR (sanitized), trace, per-action screenshots (1440x900 and mobile 375x812), network request/response bodies, UTC stage timestamps and DOM error text. Network allowlist is loopback service origins plus browser internal resources; abort/report external AI/provider requests. Never fulfill/mutate core API responses with page.route mocks. A delay/barrier for concurrency may defer then continue the genuine request, but must never fabricate its response.

Do not use unmodified npm run test:author-ide-browser as this acceptance: it mocks memory/AI APIs and writes historical evidence paths. npm run test:draft-browser is a hook fixture and also writes historical evidence. Both can only be separately labelled diagnostics after outputs are redirected in a disposable copied harness, not production FE changes and not E2E PASS.

## 5. Required acceptance matrix — all initially NOT_TESTED

| Case | Real browser action | Expected API | Durable assertion and PASS rule |
| --- | --- | --- | --- |
| 1 S09 manuscript/separation | Type/save manuscript; open memory; trigger analysis | CAS save returns authoritative version; revision history/snapshot provides UUID/hash; analysis waits for entity review | PG immutable revision exact text/hash, Mongo draft/version match; no approved entity/event/fact or brain-version increment from extraction. PASS only with real controls/network/SQL. |
| 2 Two new same-name people | Review occurrences and explicitly create two provisional groups in empty novel | /review carries distinct scoped keys; frozen UUIDs distinct; /continue uses frozen inventory | Exactly two intended entity proposals/reserved IDs and correct occurrence mapping; no pre-seeded IDs. Missing grouping control = BLOCKED, never API substitute. |
| 3 Guidance refresh | Save some human choices, add lan, refresh entity stage, review changed/new candidates | finalize:false, guidance CAS, /refresh expected_version; compatible choices retained, pending IDs shown | Audit versions/membership/UUIDs stable for retained groups; changed candidates require review; no downstream proposals until freeze. Wrong /continue call = FAIL/BLOCKED. |
| 4 Identity-safe Canon | Inspect exact IDs/context then explicitly approve group | Owner accept with expected_brain_version; foreign/anonymous denied | Reserved IDs unchanged in Canon/events/facts/state; pending absent from memory; only approval increments version. Visually edited payload must equal DB payload (B5). |
| 5 Relationship lock/conflict | Select exact A→X lock, then unrelated B→X; repeat inverse target; conflict same pair | Existing exact-ID contract where real author UI exists; ambiguous legacy lock rejects | Lock pair/provenance preserved, unrelated pair independent, conflict rolls back whole group. Missing public lock control = BLOCKED. Trusted-service API-only probe remains separate diagnostic. |
| 6 S10 correction | Trigger contradiction, review evidence/identity, edit event/fact proposal, reject/approve | Correct immutable source/version; correction pending, explicit approval; no ignored edit fields | Old artifacts/history retained, active state changes only after approval; intended entity ID and exact edited value verified. Missing transitions/ID UI or dropped edits = FAIL/BLOCKED, not 200 PASS. |
| 7 S11 reload/resume | Close/reopen chapter/project/browser, reload checkpoint and memory, continue twice | Correct run/revision/version; stale continuation 409 | Same scoped groups/UUIDs survive; one durable proposal set; pending separate; cross-chapter checkpoints never substituted. |
| 8 Save/Undo/CAS | Rapid A→B→Undo, two tabs save concurrently; reload stale server state | Ordered writes; correct expectedVersion; stale 409 with local draft retained | Correct latest revision/hash/version, no obsolete overwrite, no duplicate content/outbox, no account/chapter cross-write. Capture real delayed requests, not mocked responses. |
| 9 Account/novel isolation | A/B independent contexts, foreign deep links/actions and same account other novel | Anonymous 401, foreign 403 or scoped missing 404; no client-tenant trust | Complete scoped before/after SQL/Mongo equality for every denied write; no foreign response body or stale cached memory visible. |
| 10 Legacy/default OFF | Separate unique-name OFF fixture; ON known duplicate-name fixture; inspect legacy consumers | Default OFF unchanged; explicit ON requires IDs for ambiguous references, no silent first-name fallback | Both UUIDs survive /memory and context-preview; legacy name-keyed export/JSON are not used as canonical memory. Legacy ambiguous lock fails closed; no guessed binding. |

For each row report PASS/FAIL/BLOCKED/NOT_RUN, source SHA, browser action and screenshot, actual status/body, before/after DB stage and reason/owner. An unexecuted row cannot be PASS. Existing B1–B6 are blockers to reproduce; do not repair FE in this execution task or reopen accepted backend findings without new runtime evidence.

## 6. SQL/Mongo readbacks and provenance

At pre-review, partial-save, refresh, freeze, continue-before-Canon, approval, conflict rollback, reload and denied writes, record scoped full rows from narrative.story_brains (brain_version/guidance), analysis_runs (request/audit), proposals (status/payload/evidence/group), proposal_decisions, entities, aliases/mentions, events/event_participants, facts, state_transitions, relationships (both metadata IDs/lock/provenance), current_entity_states and revision_provenance. Inspect actual schema column/table names first; missing snapshot coverage cannot be invented.

Also capture public chapters/latest_revision_id, chapter_revisions immutable text/content_hash/parent/source, revision_outbox_events delivery state and Mongo draft_chapters content/version/owner plus writer-lease collections if created. Query only owned tenant/novel/chapter IDs; sort rows before equality comparison. Keep raw Unicode text plus SHA-256 recomputation. Use no name-keyed dictionary to compare duplicate identities.

Example diagnostic commands (replace NovelId/ChapterId from your owned registry, not another project's IDs):

```powershell
docker exec $Pg psql -U postgres -d $Db -c "SELECT id,brain_version FROM narrative.story_brains WHERE novel_id='$NovelId'::uuid; SELECT id,canonical_name FROM narrative.entities WHERE novel_id='$NovelId'::uuid; SELECT relation_metadata,is_locked FROM narrative.relationships WHERE novel_id='$NovelId'::uuid;"
docker exec $Pg psql -U postgres -d $Db -c "SELECT revision_id,content_hash,content FROM chapter_revisions WHERE chapter_id='$ChapterId'::uuid ORDER BY created_at; SELECT * FROM revision_outbox_events WHERE chapter_id='$ChapterId'::uuid ORDER BY created_at;"
docker exec $Mongo mongosh --quiet $Db --eval "JSON.stringify(db.draft_chapters.find({chapterId:'$ChapterId'}).toArray())"
```

Negative status alone is insufficient: compare durable state, proposal counts and brain version before/after. Preserve all failed runs; separate browser results from backend diagnostics. Do not claim live provider/model quality or full production readiness.

## 7. Cleanup and final handoff

Stop only your PID/start-time pairs and task-labelled containers; retain all volumes and evidence. Do not drop/reset old schemas or Docker volumes, use docker system prune, or delete worktrees recursively. Before any cleanup export resource manifest, fixture UUID registry, source/tree, Docker image/mount inventory and DB snapshots.

```powershell
foreach ($owned in $OwnedProcesses) {
  $running=Get-Process -Id $owned.Id -ErrorAction SilentlyContinue
  if ($running -and $running.StartTime.ToUniversalTime().Ticks.ToString() -eq $owned.StartTicks) { Stop-Process -Id $running.Id }
}
foreach ($container in @($Pg,$Mongo)) {
  $meta=(docker inspect $container | ConvertFrom-Json)[0]
  if ($meta.Config.Labels.'ephurin.e2e' -ne $Run) { throw 'Refusing foreign container cleanup' }
  docker stop $container
}
docker inspect $Pg $Mongo | Set-Content (Join-Path $Evidence 'retained-resources.json')
git -C $Checkout status --porcelain
Stop-Transcript
```

If you restarted a service, update $OwnedProcesses and resources.json before cleanup. Preserve stopped containers/volumes for review; no historical fixtures may be touched. Worktree archival is a separate owner decision after evidence is copied outside it.

Return exact source/tree, local fake-only configuration, commands/exits, 10-row results, screenshots/trace/HAR/console paths, immutable revision/SQL/Mongo provenance, failed/blocked interactions and owners. Stop for review. No PR #57 merge, FE code patch, production release or P3 execution.
