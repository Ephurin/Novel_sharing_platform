# Migration collision matrix — ASTRA

**PASS_EMPTY_DB_SQL_AND_ALEMBIC_REPEAT only.** This is a temporary SQL union rehearsal, not a code merge, deployed composite, existing-data upgrade, downgrade or permission to migrate production. `HOLD_FE_INTEGRATION_ONLY` remains.

## Exact inputs and identity

Pipeline `26a6cbc4c562dd5c496ce446efb55bb297ee3dca`; PR54 `18759ae65f33f935c7243b53f435630a7c53f4cb`; stacked PR55 `7b15c078c1ffe2fca96c4e66c96577e3ff007c3c`. `migration-inventory.json` records every SQL path, provenance SHA, LF-normalized hash and the actual sorted union. Pipeline12 files + PR55 17 files =29 provenance entries /18 unique SQL files. The shared001–011 filenames have identical normalized bytes; no same-filename/different-body conflict was found. PR54 contributes012–014; #55 adds015–017.

Both trees use the same `backend/src/core/database/migrate.ts`: lines27–29 store **full filename**, not numeric prefix; lines41–50 execute each file and its `schema_migrations` insert in one transaction; lines63–69 lexically sort filenames. `schema_migrations.migration_id` is the primary key. Therefore the two012 files have different identities and both must survive. SQL runner has no global migration admission/advisory lock around the check-then-apply loop; concurrent startup is not verified and must be coordinated. It has no stored content checksum: do not edit already-applied files or rename them without an upgrade plan.

## Proposed combined order (actually rehearsed on an empty DB)

| Order / exact filenames | Source / dependency | Collision / data and ownership implications |
|---|---|---|
| 001_auth_user_wallet.sql →002_novels.sql →003_chapters.sql →004_content_control.sql →005_reports_description.sql →006_reading_interactions.sql →007_wallet_transactions.sql →008_authoring_context.sql →009_chapter_revisions.sql →010_analysis_outbox.sql →011_outbox_claim_token.sql | Identical common files in pipeline and stacked PR55; hashes in inventory | Keep one byte-identical copy per full filename; preserve revisions/outbox and lease-aware application behavior separately. |
| 012_novel_engagement.sql | PR54/55: novel_follows, novel_ratings; user/novel FKs, score1–10 | Lexically before reports012; independent of reports guard, not its replacement. |
| 012_reports_unique_open.sql | Pipeline: duplicate OPEN reports / PENDING moderation preflight and partial unique indexes | Fails closed if duplicates exist; no silent data deletion. Resolve populated-data duplicates manually under owner review. Both012s remain distinct. |
| 013_novel_review_text.sql | PR54/55: review_text + review index | Follows engagement table creation. |
| 014_novel_editorial_metadata.sql | PR54/55: author_note length guard, novel_genres FK table | Backfills existing novels.genre_id with ON CONFLICT DO NOTHING. Empty rehearsal cannot validate real genre data/backfill volume or malformed prior schemas. |
| 015_author_workflow.sql | PR55: import_key/import_hash; partial unique import index; moderation notification_pending | Duplicate legacy import keys, if any, need a separate preflight. Schema alone does not implement retry-safe pipeline createChapter. |
| 016_author_launch_checklist.sql | PR55: profile fields, moderation submitted_content, notification_events outbox, chapter_publication_schedules | FKs to users/chapters/moderation; status CHECK and draft version. Requires coordinated services, worker ownership and retention policy, not merely table presence. |
| **017_transactional_moderation_evidence.sql** | **PR55 current head: moderation_evidence(evidence_id varchar24,payload jsonb,created_at)** | Missing from old Core handoff inventory; mandatory for the current PR transactional publication path. Preserve legacy Mongo evidence read compatibility. No user publication action tested. |
| AI Alembic0001…0012→**0013_objective_intent** | Pipeline independent migration system;0013 down_revision0012_entity_guidance; narrative.story_plan_objectives.intent_version non-null default0 | Not backend SQL013 and not tracked in schema_migrations.0013 checks column presence, adds only if absent. Its downgrade drops the epoch and is incompatible with running new controllers; not executed. |

No renaming proposed. Before a future approved cutover, inspect target full migration IDs and actual schema, duplicate reports/reviews, existing import keys and genre FK/backfill. Back up under owner procedure, quiesce writers/controllers/schedulers, run one admitted SQL migrator and AI upgrade, then deploy compatible services together. Old/mixed workers and downgrade while new code runs remain untested; do not infer safe rolling deployment from this rehearsal.

## Actual runtime and provenance

Fresh project **p123-core-8c853261f5** was generated with random credentials and new pg_state/mongo_state volumes; no historical volume reused or removed. Only PG/Mongo and a fixed-destination loopback ingress proxy were started for this task. No AI provider server or native controller worker was started.

A temporary external `composite-sql/` directory contained the exact union; no Git merge commit or combined source checkout was created. It was bind-mounted read-only over migrations in the previously built pipeline backend image; the **real unmodified migration runner** executed `npm run db:migrate`. The runner and AI0013 file inside the reused images match pinned pipeline source; image IDs/hashes in `migration-image-source-proof.json`. Reusing immutable tool images did not reuse databases/identities/volumes.

| Command / check | Exit / observed result |
|---|---|
| Fresh PG/Mongo up --wait |0 |
| Combined SQL first runner execution |0;18 Applied migration entries |
| Combined SQL second runner execution |0;18 skipped by exact full filename, not re-executed raw DDL |
| AI alembic upgrade head |0; reached0013_objective_intent |
| AI alembic upgrade head repeat |0; no pending revisions |
| PG SELECT schema readback |0;18 IDs including both012s and017; both report/moderation unique guards; narrative/public tables and Alembic0013 |

The SQL/Alembic readback was captured **before** browser/auth fixtures added synthetic business rows. `migration-runtime.json`, `schema-readback.txt`, command logs and `migration-commands.json` contain actual results. Fixture data stayed in this owned project; historical resources were not touched.

## Limits / owner follow-up

- Fresh empty database only: no legacy populated database, production-size backfill, old schema drift, duplicate-resolution or version-skew simulation.
- Runner repeat proves full-filename tracking/skipping; it does not prove every raw SQL statement can be reapplied under arbitrary partial migration.
- No concurrent migration run, downgrade, mixed application deployment or automated rollback.
- No combined Core+FE services E2E. Browser hook used PR55 backend; security RED used pipeline backend, as **separate** trees.
- Core schema owner must approve the union, runtime privileges and cutover sequencing; FE owner must confirm017 and notification/moderation semantics. This matrix authorizes no production change.
