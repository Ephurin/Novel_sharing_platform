# Isolated migrations

Fresh project `codex-p1-final-8c19b8c475` owns the new PG/pgvector and Mongo volumes. Initial bootstrap and final clean-source replay are in commands-and-exits.json; all final migration commands exit 0. Both distinct 012 SQL files, SQL 017 and all subsequent committed files remain unchanged. See runtime/migration-catalog-readback.json for actual SQL ledger and public.alembic_version. No migration introduced by this delta. Runtime/source hashes and actual internal network inspection are recorded separately. No historical volume was reused or deleted.
