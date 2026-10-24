# Migration Run Evidence — P1 AI Writing Pipeline + Author Workspace

**Date:** 2026-10-23
**Environment:** Completely isolated Docker Compose project `p1_author_int_b5249`
**Database Credentials & Mappings:**
- PostgreSQL: `postgres://int_user:int_secure_password_987@localhost:55432/ephurin_int` (Volume: `int_pg_state_b5249`)
- MongoDB: `mongodb://localhost:28017/ephurin_int` (Volume: `int_mongo_state_b5249`)
- Isolation: Brand new databases, zero shared state, zero production/demo volumes touched.

---

## 1. SQL Migrations Execution (Backend)

Command: `node --env-file=.env.integration ./node_modules/tsx/dist/cli.mjs src/core/database/migrate.ts`

### First Execution (Empty DB -> Applied)
Exit Code: `0`

Applied 18 migrations in lexical sequence:
1. `001_auth_user_wallet.sql`
2. `002_novels.sql`
3. `003_chapters.sql`
4. `004_content_control.sql`
5. `005_reports_description.sql`
6. `006_reading_interactions.sql`
7. `007_wallet_transactions.sql`
8. `008_authoring_context.sql`
9. `009_chapter_revisions.sql`
10. `010_analysis_outbox.sql`
11. `011_outbox_claim_token.sql`
12. `012_novel_engagement.sql`
13. `012_reports_unique_open.sql`
14. `013_novel_review_text.sql`
15. `014_novel_editorial_metadata.sql`
16. `015_author_workflow.sql`
17. `016_author_launch_checklist.sql`
18. `017_transactional_moderation_evidence.sql`

### Second Execution (Repeat Check -> Idempotent Skip)
Exit Code: `0`
All 18 migrations skipped cleanly based on exact full-filename match in `schema_migrations`.

---

## 2. Alembic Migrations Execution (AI Service)

Command: `alembic upgrade head`
Database URL: `postgresql+psycopg://int_user:int_secure_password_987@localhost:55432/ephurin_int`

### Execution (Empty -> Applied Head)
Exit Code: `0`

Applied 13 revisions in sequence:
- `0001_narrative_foundation`: Create Narrative Memory foundation tables
- `0002_state_projection`: Add confirmed transitions, participants and rebuildable state projections
- `0003_manuscript_bootstrap`: Add durable manuscript bootstrap jobs
- `0004_writing_generations`: Add durable writing generations
- `0005_revision_provenance`: Add revision provenance and fact chapter number
- `0006_fix_revision_provenance`: Fix revision provenance schema with revision_id and unique constraint
- `0007_semantic_memory_foundation`: Add semantic-memory chunk and embedding storage
- `0008_story_plans`: Add story_plans and story_plan_objectives storage
- `0009_autonomous_runs`: Add autonomous run controller storage
- `0010_fact_supersession`: Keep fact revision history while projecting current source occurrence
- `0011_entity_candidate_audit`: Persist candidate decisions separately from approved narrative memory
- `0012_entity_guidance`: Author extraction guidance, kept outside approved narrative memory
- `0013_objective_intent`: Monotone objective intent epoch for accept-commit fencing

### Repeat Execution
Exit Code: `0` (No pending revisions)

---

## 3. Database Schema Verification

### SQL `schema_migrations` Table
Readback confirmed 18 rows:
- `001_auth_user_wallet.sql` to `017_transactional_moderation_evidence.sql`
- Both `012_novel_engagement.sql` and `012_reports_unique_open.sql` present and preserved.

### Narrative Schema Tables (21 tables verified)
- `analysis_runs`, `autonomous_runs`, `bootstrap_jobs`, `current_entity_states`, `entities`, `entity_aliases`, `entity_mentions`, `event_participants`, `events`, `facts`, `memory_chunks`, `memory_embeddings`, `proposal_decisions`, `proposals`, `relationships`, `revision_provenances`, `state_transitions`, `story_brains`, `story_plan_objectives`, `story_plans`, `writing_generations`.

---

## 4. Migration Gate Verdict

- Empty Database Rehearsal: **PASS_EMPTY_DB**
- Idempotent Repeat Check: **PASS**
- Populated Production Upgrade: **NOT_RUN** (Empty target only, as required by isolation gate)
- Downgrade Rehearsal: **NOT_RUN**
