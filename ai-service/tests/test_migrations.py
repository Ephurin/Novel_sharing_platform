import os
import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


SERVICE_ROOT = Path(__file__).resolve().parent.parent


class MigrationTests(unittest.TestCase):
    def test_candidate_audit_upgrades_a_legacy_table_and_preserves_runs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite+pysqlite:///{(Path(temp_dir) / 'legacy.sqlite3').as_posix()}"
            config = Config(str(SERVICE_ROOT / 'alembic.ini'))
            config.set_main_option('script_location', str(SERVICE_ROOT / 'migrations'))
            config.set_main_option('sqlalchemy.url', database_url)
            old_db_url = os.environ.pop('DATABASE_URL', None)
            try:
                command.upgrade(config, '0010_fact_supersession')
                engine = create_engine(database_url)
                # Foundation imports current ORM metadata; reproduce an actual old table without the new column.
                with engine.begin() as connection:
                    connection.exec_driver_sql('ALTER TABLE analysis_runs DROP COLUMN entity_candidate_audit')
                    connection.exec_driver_sql("INSERT INTO story_brains (id, tenant_id, novel_id, status, brain_version, schema_version) VALUES ('a','b','c','active',1,1)")
                    connection.exec_driver_sql("INSERT INTO analysis_runs (id,story_brain_id,tenant_id,novel_id,operation,status,idempotency_key,input_hash,pipeline_version) VALUES ('r','a','b','c','test','pending','key','hash','old')")
                engine.dispose()
                command.upgrade(config, 'head')
                engine = create_engine(database_url)
                self.assertIn('entity_candidate_audit', {c['name'] for c in inspect(engine).get_columns('analysis_runs')})
                with engine.connect() as connection:
                    self.assertEqual(connection.exec_driver_sql('SELECT count(*) FROM analysis_runs').scalar(), 1)
                    self.assertIsNone(connection.exec_driver_sql('SELECT entity_candidate_audit FROM analysis_runs').scalar())
                engine.dispose()
            finally:
                if old_db_url is not None:
                    os.environ['DATABASE_URL'] = old_db_url

    def test_upgrade_and_downgrade_clean_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "migration.sqlite3"
            database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
            config = Config(str(SERVICE_ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
            config.set_main_option("sqlalchemy.url", database_url)

            old_db_url = os.environ.pop("DATABASE_URL", None)
            try:
                command.upgrade(config, "head")
                engine = create_engine(database_url)
                tables = set(inspect(engine).get_table_names())
                self.assertIn("story_brains", tables)
                self.assertIn("entities", tables)
                self.assertIn("analysis_runs", tables)
                self.assertIn("proposals", tables)
                self.assertIn("bootstrap_jobs", tables)
                self.assertIn("story_plans", tables)
                self.assertIn("autonomous_runs", tables)
                self.assertTrue({"state_transitions", "current_entity_states", "event_participants"} <= tables)
                engine.dispose()

                command.downgrade(config, "0001_narrative_foundation")
                engine = create_engine(database_url)
                downgraded_tables = inspect(engine).get_table_names()
                self.assertNotIn("state_transitions", downgraded_tables)
                self.assertNotIn("bootstrap_jobs", downgraded_tables)
                self.assertNotIn("story_plans", downgraded_tables)
                self.assertNotIn("autonomous_runs", downgraded_tables)
                with engine.begin() as connection:
                    connection.exec_driver_sql("INSERT INTO story_brains (id, tenant_id, novel_id, status, brain_version, schema_version) VALUES ('a', 'b', 'c', 'active', 1, 1)")
                engine.dispose()
                command.upgrade(config, "head")
                engine = create_engine(database_url)
                with engine.connect() as connection:
                    self.assertEqual(connection.exec_driver_sql("SELECT count(*) FROM story_brains").scalar(), 1)
                engine.dispose()

                command.downgrade(config, "base")
                engine = create_engine(database_url)
                self.assertEqual(inspect(engine).get_table_names(), ["alembic_version"])
                engine.dispose()
            finally:
                if old_db_url is not None:
                    os.environ["DATABASE_URL"] = old_db_url
