# P1-DEMO-INTEGRATION-04 — Controlled merge and post-merge smoke

Date: 2026-10-28 (Asia/Saigon).

**Final verdict: P1_DEMO_INTEGRATION_NEEDS_CHANGES**

Both reviewed PRs were integrated and the real browser/API/DB/fake-generation smoke passed. A subsequent independent schema check found an inherited ORM/database nullability mismatch. The strict “no schema drift” gate is therefore not satisfied. Testing stopped; no speculative runtime or migration fix was made. This report is committed on a separate handoff branch after the stop; integration remains at the tested source below.

## Source lock, policy and controlled merges

- Integration baseline and unchanged main: `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`.
- PR #75 locked head: `b98dab9712e587cc75449795d73252f662b57d6d`.
- PR #76 locked head: `3be021d2c0f777ba6cd5c0043554499acffcbc09`.
- QA Gate-03 reference read: `0e001e396cfc6745c0efc8595922da9ae389a6f4`.
- PR #75 merge: `033da85ba6690c04362120cbfce3055826bec763`.
- PR #76 retargeted from AX-01 to integration after #75, reviewed 19-file AX-02-only diff, then merged: **`9646b147eca1aacb9a12db00ee11e99923c71e97`**.
- Actual tested integration tree: `8269a69d197f432da92f05f9663d87c9f1654fda`, identical to locked AX-02. Both locked heads are retained in ancestry. QA Gate-03 is not an ancestor. No squash, rebase, cherry-pick, production-source modifications or main update.

Before merging, GitHub REST returned “Branch not protected” (404), no effective branch rules and no repository/parent rulesets. No required review/check rule was configured, and both PR review lists were empty. Existing checks were all successful: PR #75 10 jobs across [P7](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40534013021) and [P8](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40534013028); PR #76 seven [P8 jobs](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40544279840). Drafts were marked ready under the current controlled-merge instruction. No policy bypass or admin override was used. No new required check was configured or skipped.

Gate-03 contains inaccurate baseline/AX-01 root-tree values and “one commit/direct parent” descriptions. Git independently establishes baseline tree `ad0092004cfbd5d042b5c687fb31010e9638835b`, AX-01 tree `e8ec5fd8e39973f9a067c40061952036379d1f10`, and the actual complete merge ancestry. Its production-subtree equivalence claim was independently verified. See source-provenance.json and premerge-guards.json in the evidence directory.

## Runtime, configuration and build provenance

Fresh owned project: `codex-p1-final-7a784d18c5`. Dedicated PostgreSQL/pgvector, MongoDB, Gateway, AI service, budget gateway and fake upstream; no shared agent resources modified. Web was freshly built from integration HEAD with `VITE_API_BASE_URL=/api/v1`; all 302 artifact sizes/SHA256 values are recorded. Container hashes for narrative service/routes and Gateway source are recorded alongside the internal-network topology.

**Selected demo configuration: `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`.** This is the existing compose value, verified in runtime topology; it was never changed to pass acceptance. The application default remains false, separately verified. Only true was exercised in this post-merge smoke; Gate-03's earlier false run is historical evidence, not a new result. The OpenAI-compatible local transport points through the owned budget gateway to fake-upstream; embeddings are fake. The ledger records 0 requests before and 14 after, with request hashes/operations, and no live cloud calls. Raw prompts, credentials, notes, SQL snapshots and traces stay outside the repository.

## Migration and schema results — stop reason

- Backend: all 18 SQL migration filenames exactly match public.schema_migrations, through `017_transactional_moderation_evidence.sql`: exit 0.
- AI service: `python -m alembic upgrade head`: exit 0; public.alembic_version reads `0014_entity_profiles`.
- All narrative ORM tables/columns exist. Profile columns author_profile/private_author_notes/profile_version are non-null and the audit table exists. No destructive migration or production migration edit was performed.
- **FAIL — nullability alignment:** `narrative.revision_provenances.created_at` is nullable in PostgreSQL (`information_schema.columns.is_nullable = YES`), while RevisionProvenanceRecord.created_at is non-null in SQLAlchemy (Mapped[datetime]). Migration `0005_revision_provenance.py:27` creates the PostgreSQL column without NOT NULL. The class and historical migration contract predate AX-01/AX-02; the baseline class is unchanged. See schema-drift.json and schema-readback.json.

Reproduction: after the normal upgrade, query `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema='narrative' AND table_name='revision_provenances' AND column_name='created_at'`; compare with `RevisionProvenanceRecord.__table__.c.created_at.nullable` (False). No remaining acceptance or runtime changes followed this discovery. A reviewer must decide whether to accept this inherited contract explicitly or authorize a separate reviewed correction; historical migrations were not rewritten. Full index/default autogenerate equivalence was not run and is not claimed.

## Executed commands and assertions

Working directory: the dedicated integration worktree at the actual integration HEAD. External driver: `../integration04-private/qa/scripts/p1_final_acceptance.py`, extracted from the locked QA SHA. Only tool ROOT/browser-test/sanitizer paths were adapted to point at integration source; original and adapted hashes are in harness-manifest.json. No QA branch was merged or QA harness committed into production source. Local dependency junctions use existing lock-compatible installations; tracked source stayed clean throughout execution.

Each driver invocation used `P1_SOURCE_ROOT=<integration worktree>` and `--output ../integration04-private`. commands-and-exits.jsonl records exact subprocess arguments, working directories, source before/after and exit codes.

| Command/stage | Exit/result |
| --- | --- |
| provision; bridge-config | 0; isolated resources, private credentials outside checkout |
| db-up initial backend `npm run db:migrate` | 1 before SQL execution: missing local tsx; dependency junction bootstrap attempts failed first (relative path, then sandbox access); recorded, not hidden |
| db-up after dependency setup | compose 0; backend migrations 0; AI `python -m alembic upgrade head` 0 |
| web-build: `npm run typecheck`; `npm run build` | 0 / 0; inherited directive and chunk-size warnings |
| `npm run test:entity-profile` | 0; 3 pure/client + 16 mounted mock cases, classified separately |
| `npm run test:p1-hitl` | 0; 25 units + 11 mounted interactions |
| runtime-proof; provider-before; provider-after | all 0 |
| browser-ax-post-merge: `node --test <external locked QA acceptance test>` | 0; seven real scenarios PASS, homonym scenario PARTIAL_PASS |
| schema readback | first query used wrong narrative.alembic_version namespace; corrected read-only query uses public.alembic_version; no migration failure; one inherited nullability mismatch found |
| cleanup-owned | 0; only owned containers removed, zero owned containers remaining; volumes preserved |

Real acceptance used the production SPA, real Gateway/API/auth and PostgreSQL, not mocked HTTP. 186 HTTP interactions, including 135 browser requests, were recorded. Assertions cover author login/promotion, active Brain/bootstrap/HITL, confirmed UUID selection, appearance/personality save, page reload and independent DB readback, audit/version increments, note-only Brain stability, whole-snapshot temporal cutoff, two-browser 409 preserving the losing draft and explicit reconcile, same-key replay without duplicate audit, cross-author denial in both directions (403), unauthenticated 401, reader 403, missing key/oversize 422, and prompt isolation.

Normal writing job `29882f64-016b-5b9c-b413-b4d7b06be11a` completed. Its fake-upstream request was bound by correlation token; updated profile/UUID were present, private notes and unrelated profiles absent. Recomputed upstream context hash equals persisted job hash: `ee1d37d72e0fff2f6f71c4f83799139c50ba0a7637c49712d37feac9926acf42`.

Homonym result remains **PARTIAL_PASS — SYNTHETIC_DB_FIXTURE**: the production declaration API rejects duplicate canonical names (422); UI/UUID isolation was exercised with an explicitly synthetic isolated DB entity, not claimed as a supported creation flow. No new end-user domain capability is implied.

## Evidence and recovery

Public-safe outputs: [evidence/integration-04-20261028](evidence/integration-04-20261028), including acceptance summary, schema readbacks, exact command ledger, build/runtime hashes, allowlisted fake call ledger and migration/test logs. Private raw traces/prompts/notes were not copied. The secret validator's seven negative self-tests, new-evidence target scan (exit 0) and report scan passed. An extra broad historical-folder scan exited 1 with 45 READ_ERROR entries on long Windows historical paths; it does not establish historical coverage, and no historical file was altered; trace sanitization reports zero binary frames. No raw trace ZIP is committed.

Owned containers have been stopped; volumes and private local configuration remain quarantined outside source for authorized investigation. No production deployment occurred. If rollback is authorized, revert merge #76 first (`git revert -m 1 9646b147eca1aacb9a12db00ee11e99923c71e97`), then #75 (`git revert -m 1 033da85ba6690c04362120cbfce3055826bec763`) on a separate reviewed branch; do not reset or force-push integration. Preserve DB backups and profile/audit exports. Downgrading migration0014 drops profile columns/audit history and is not an automatic rollback step. No rollback was executed here.

Stop for GPT-6 independent review of the inherited schema mismatch and the integration handoff. No P2/P3 or production deploy.
