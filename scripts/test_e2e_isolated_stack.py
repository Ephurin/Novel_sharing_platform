"""
Refusal tests for disposable E2E stacks: an unsafe target is refused before the first write.

GuardTests cover the pure checks. RunnerRefusalTests start every runner built on the disposable
stack against unsafe targets (the shared `ephurin` database, no opt-in, shared dev ports, an
existing database) and prove from fingerprints of every shared table and collection that nothing
changed. They need local PostgreSQL and MongoDB and are skipped when those are unreachable.

Run (repo root): python -m unittest scripts/test_e2e_isolated_stack.py -v
"""

import os
import subprocess
import sys
import unittest
import uuid

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS_DIR)

import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402

import e2e_isolated_stack as stack  # noqa: E402

RUNNERS = [
    os.path.join(SCRIPTS_DIR, name)
    for name in (
        "run_reader_social_comment_preferences_e2e.py",
        "run_reader_discovery_reading_state_e2e.py",
        "run_ui_smoke_matrix_e2e.py",
        "run_srs_acceptance_e2e.py",
    )
]
RUNNER_ENV_KEYS = [stack.OPT_IN_ENV, "EPHURIN_E2E_TEST_DB_NAME", "EPHURIN_E2E_BACKEND_PORT", "EPHURIN_E2E_WEB_PORT"]


def services_up() -> bool:
    try:
        stack.list_postgres_databases(stack.DEFAULT_ADMIN_PG_URL)
        stack.list_mongo_databases(stack.DEFAULT_MONGO_BASE_URI)
        stack.fingerprint_postgres(stack.DEFAULT_SHARED_PG_URL)
        return True
    except Exception:
        return False


class GuardTests(unittest.TestCase):
    def check(self, **overrides):
        target = {
            "db_name": "ephurin_test_social_0123456789ab",
            "opt_in": "1",
            "backend_port": 4311,
            "web_port": 5311,
            "pg_host": "localhost",
            "mongo_host": "127.0.0.1",
        }
        target.update(overrides)
        stack.assert_safe_target(**target)

    def test_accepts_disposable_target(self):
        self.check()

    def test_refuses_shared_protected_and_foreign_names(self):
        for name in ["ephurin", "EPHURIN", " ephurin ", "postgres", "demo", "prod", "ephurin_dev", "admin",
                     "", "ephurin_report_e2e_abc", "reader_test", "ephurin_test_", "ephurin_test_x; drop"]:
            with self.subTest(name=name), self.assertRaises(stack.RefusedError):
                self.check(db_name=name)

    def test_refuses_without_explicit_opt_in(self):
        for value in [None, "", "0", "true", "yes"]:
            with self.subTest(opt_in=value), self.assertRaises(stack.RefusedError):
                self.check(opt_in=value)

    def test_refuses_shared_dev_ports(self):
        for port in sorted(stack.SHARED_PORTS):
            with self.subTest(port=port), self.assertRaises(stack.RefusedError):
                self.check(backend_port=port)
            with self.subTest(port=port), self.assertRaises(stack.RefusedError):
                self.check(web_port=port)
        with self.assertRaises(stack.RefusedError):
            self.check(backend_port=4311, web_port=4311)

    def test_refuses_non_local_database_hosts(self):
        with self.assertRaises(stack.RefusedError):
            self.check(pg_host="db.example.com")
        with self.assertRaises(stack.RefusedError):
            self.check(mongo_host="10.0.0.5")


@unittest.skipUnless(services_up(), "local PostgreSQL/MongoDB with the shared ephurin database not reachable")
class RunnerRefusalTests(unittest.TestCase):
    def run_runner(self, runner: str, **overrides):
        env = {key: value for key, value in os.environ.items() if key not in RUNNER_ENV_KEYS}
        env.update({"EPHURIN_E2E_DEMO_PASSWORD": "not-used-by-refused-runs", "PYTHONIOENCODING": "utf-8"})
        env.update({key: value for key, value in overrides.items() if value is not None})
        return subprocess.run([sys.executable, runner], env=env, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=120)

    def assert_refused_without_writes(self, reason: str, **overrides):
        for runner in RUNNERS:
            with self.subTest(runner=os.path.basename(runner)):
                before = stack.fingerprint_shared()
                result = self.run_runner(runner, **overrides)
                after = stack.fingerprint_shared()
                output = result.stdout + result.stderr
                self.assertEqual(result.returncode, stack.REFUSED_EXIT_CODE, output)
                self.assertIn("REFUSED", result.stdout)
                self.assertIn(reason, result.stdout)
                self.assertEqual(stack.diff_fingerprints(before, after), [], "shared data changed")
                self.assertEqual(before["sha256"], after["sha256"])
                self.assertEqual(before["postgres_databases"], after["postgres_databases"], "a database was created or dropped")
                self.assertEqual(before["mongo_databases"], after["mongo_databases"], "a database was created or dropped")

    def test_shared_default_database_is_refused(self):
        self.assert_refused_without_writes("shared or protected", **{stack.OPT_IN_ENV: "1", "EPHURIN_E2E_TEST_DB_NAME": "ephurin"})

    def test_missing_opt_in_is_refused(self):
        self.assert_refused_without_writes("opt-in")

    def test_shared_dev_ports_are_refused(self):
        self.assert_refused_without_writes("port 4000", **{stack.OPT_IN_ENV: "1", "EPHURIN_E2E_BACKEND_PORT": "4000"})

    def test_existing_database_is_refused_and_preserved(self):
        name = f"ephurin_test_guard_{uuid.uuid4().hex[:12]}"
        with psycopg.connect(stack.DEFAULT_ADMIN_PG_URL, autocommit=True) as conn:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        sentinel_url = stack.with_database(stack.DEFAULT_ADMIN_PG_URL, name)
        try:
            with psycopg.connect(sentinel_url) as conn:
                conn.execute("CREATE TABLE sentinel (value text)")
                conn.execute("INSERT INTO sentinel VALUES ('kept')")
            self.assert_refused_without_writes("already exists", **{stack.OPT_IN_ENV: "1", "EPHURIN_E2E_TEST_DB_NAME": name})
            with psycopg.connect(sentinel_url) as conn:
                self.assertEqual(conn.execute("SELECT value FROM sentinel").fetchall(), [("kept",)])
        finally:
            with psycopg.connect(stack.DEFAULT_ADMIN_PG_URL, autocommit=True) as conn:
                conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


if __name__ == "__main__":
    unittest.main()
