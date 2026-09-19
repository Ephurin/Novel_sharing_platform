import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


SERVICE_ROOT = Path(__file__).resolve().parent.parent


class MigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_clean_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "migration.sqlite3"
            database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
            config = Config(str(SERVICE_ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
            config.set_main_option("sqlalchemy.url", database_url)

            command.upgrade(config, "head")
            engine = create_engine(database_url)
            tables = set(inspect(engine).get_table_names())
            self.assertIn("story_brains", tables)
            self.assertIn("entities", tables)
            self.assertIn("analysis_runs", tables)
            self.assertIn("proposals", tables)
            self.assertIn("bootstrap_jobs", tables)
            self.assertTrue({"state_transitions", "current_entity_states", "event_participants"} <= tables)
            engine.dispose()

            command.downgrade(config, "0001_narrative_foundation")
            engine = create_engine(database_url)
            downgraded_tables = inspect(engine).get_table_names()
            self.assertNotIn("state_transitions", downgraded_tables)
            self.assertNotIn("bootstrap_jobs", downgraded_tables)
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
