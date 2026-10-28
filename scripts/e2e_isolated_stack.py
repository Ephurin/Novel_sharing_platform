"""
Disposable local stack for browser E2E runners that write data.

A runner built on this module never touches the shared development data. It creates its own
PostgreSQL and MongoDB databases (named ephurin_test_<gate>_<run>), migrates and seeds them,
serves the API and a production web build on dedicated ports, and drops both databases in
`stop()`, which runners call from `finally`. Anything that could reach shared data is refused
in `preflight()`, before the first write:

- the external opt-in EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 is missing;
- the database name is protected (ephurin, postgres, demo, ...) or not ephurin_test_*;
- the database already exists (a run only ever drops a database it created itself);
- a port belongs to the shared dev stack (4000, 5173, 8000, 8080) or is already in use;
- PostgreSQL or MongoDB is not on localhost.

`fingerprint_shared()` hashes every table and collection of the shared databases, read-only,
so a runner can prove that a run left them unchanged.

Requires local PostgreSQL and MongoDB (docker-compose), Node dependencies in backend/ and web/,
and the Python packages httpx, psycopg and pymongo.
"""

import hashlib
import os
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlsplit, urlunsplit

import httpx
import psycopg
from bson import json_util
from psycopg import sql
from pymongo import MongoClient

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
WEB_DIR = os.path.join(REPO_ROOT, "web")

OPT_IN_ENV = "EPHURIN_ALLOW_TEST_DB_MUTATIONS"
REFUSED_EXIT_CODE = 3

# Mirrors backend/src/core/database/test-db-guard.ts. Runners use the stricter ephurin_test_ prefix.
FORBIDDEN_DB_NAMES = {
    "ephurin", "postgres", "template0", "template1", "production", "prod", "demo",
    "ephurin_dev", "admin", "config", "local"
}
TEST_DB_PATTERN = re.compile(r"ephurin_test_[a-z0-9_]{6,48}")
SHARED_PORTS = {4000, 5173, 8000, 8080}
LOCAL_HOSTS = {"localhost", "127.0.0.1"}

DEFAULT_ADMIN_PG_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
DEFAULT_MONGO_BASE_URI = "mongodb://localhost:27017"
DEFAULT_SHARED_PG_URL = "postgresql://postgres:postgres@localhost:5432/ephurin"
DEFAULT_SHARED_MONGO_DB = "ephurin"


class RefusedError(RuntimeError):
    """Raised before the first write when a run could touch shared data."""


def assert_safe_target(db_name: str, opt_in: Optional[str], backend_port: int, web_port: int,
                       pg_host: Optional[str], mongo_host: Optional[str]) -> None:
    if opt_in != "1":
        raise RefusedError(f"missing external opt-in {OPT_IN_ENV}=1")
    name = (db_name or "").strip()
    if name.lower() in FORBIDDEN_DB_NAMES:
        raise RefusedError(f"database '{name}' is shared or protected")
    if not TEST_DB_PATTERN.fullmatch(name):
        raise RefusedError(f"database '{name}' is not a disposable test database (expected ephurin_test_<gate>_<run>)")
    for port in (backend_port, web_port):
        if port in SHARED_PORTS:
            raise RefusedError(f"port {port} belongs to the shared dev stack")
    if backend_port == web_port:
        raise RefusedError("backend and web ports must differ")
    for host in (pg_host, mongo_host):
        if host not in LOCAL_HOSTS:
            raise RefusedError(f"database host '{host}' is not local")


def new_test_db_name(gate: str) -> str:
    return f"ephurin_test_{gate}_{uuid.uuid4().hex[:12]}"


def with_database(url: str, db_name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{db_name}", parts.query, parts.fragment))


def port_in_use(port: int) -> bool:
    for host in ("127.0.0.1", "::1"):
        family = socket.AF_INET6 if ":" in host else socket.AF_INET
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.5)
            try:
                if probe.connect_ex((host, port)) == 0:
                    return True
            except OSError:
                pass
    return False


def list_postgres_databases(admin_pg_url: str) -> List[str]:
    with psycopg.connect(admin_pg_url, connect_timeout=5) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname")
            return [row[0] for row in cur.fetchall()]


def list_mongo_databases(mongo_base_uri: str) -> List[str]:
    client = MongoClient(mongo_base_uri, serverSelectionTimeoutMS=5000)
    try:
        return sorted(client.list_database_names())
    finally:
        client.close()


def fingerprint_postgres(pg_url: str) -> Dict[str, Any]:
    """Row count and content hash of every public table. Read-only."""
    tables: Dict[str, Any] = {}
    with psycopg.connect(pg_url, connect_timeout=5) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            database = cur.fetchone()[0]
            cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
            for (table,) in cur.fetchall():
                cur.execute(sql.SQL(
                    "SELECT count(*), md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) FROM {} t"
                ).format(sql.Identifier(table)))
                rows, digest = cur.fetchone()
                tables[table] = {"rows": rows, "md5": digest}
    return {"database": database, "tables": tables}


def fingerprint_mongo(mongo_base_uri: str, db_name: str) -> Dict[str, Any]:
    """Document count and content hash of every collection. Read-only."""
    client = MongoClient(mongo_base_uri, serverSelectionTimeoutMS=5000)
    try:
        db = client[db_name]
        collections: Dict[str, Any] = {}
        for name in sorted(db.list_collection_names()):
            digest = hashlib.sha256()
            count = 0
            for document in db[name].find({}, sort=[("_id", 1)]):
                digest.update(json_util.dumps(document, sort_keys=True).encode("utf-8"))
                count += 1
            collections[name] = {"documents": count, "sha256": digest.hexdigest()}
        return {"database": db_name, "collections": collections}
    finally:
        client.close()


def fingerprint_shared(shared_pg_url: str = DEFAULT_SHARED_PG_URL,
                       mongo_base_uri: str = DEFAULT_MONGO_BASE_URI,
                       shared_mongo_db: str = DEFAULT_SHARED_MONGO_DB,
                       admin_pg_url: str = DEFAULT_ADMIN_PG_URL) -> Dict[str, Any]:
    postgres = fingerprint_postgres(shared_pg_url)
    mongo = fingerprint_mongo(mongo_base_uri, shared_mongo_db)
    combined = hashlib.sha256(json_util.dumps({"pg": postgres, "mongo": mongo}, sort_keys=True).encode("utf-8"))
    return {
        "postgres": postgres,
        "mongo": mongo,
        "sha256": combined.hexdigest(),
        "postgres_databases": list_postgres_databases(admin_pg_url),
        "mongo_databases": list_mongo_databases(mongo_base_uri),
    }


def diff_fingerprints(before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
    """Names of tables/collections whose content changed between two fingerprints."""
    changed = []
    for kind, key in (("postgres", "tables"), ("mongo", "collections")):
        left, right = before[kind][key], after[kind][key]
        for name in sorted(set(left) | set(right)):
            if left.get(name) != right.get(name):
                changed.append(f"{kind}.{name}")
    return changed


@dataclass
class StackConfig:
    gate: str
    db_name: str
    backend_port: int
    web_port: int
    admin_pg_url: str = DEFAULT_ADMIN_PG_URL
    mongo_base_uri: str = DEFAULT_MONGO_BASE_URI
    work_dir: str = field(default_factory=lambda: tempfile.mkdtemp(prefix="ephurin-e2e-"))


def config_from_env(gate: str, default_backend_port: int, default_web_port: int) -> StackConfig:
    """Overrides: EPHURIN_E2E_TEST_DB_NAME, EPHURIN_E2E_BACKEND_PORT, EPHURIN_E2E_WEB_PORT,
    ADMIN_DATABASE_URL, BASE_MONGODB_URI."""
    return StackConfig(
        gate=gate,
        db_name=os.environ.get("EPHURIN_E2E_TEST_DB_NAME") or new_test_db_name(gate),
        backend_port=int(os.environ.get("EPHURIN_E2E_BACKEND_PORT", default_backend_port)),
        web_port=int(os.environ.get("EPHURIN_E2E_WEB_PORT", default_web_port)),
        admin_pg_url=os.environ.get("ADMIN_DATABASE_URL", DEFAULT_ADMIN_PG_URL),
        mongo_base_uri=os.environ.get("BASE_MONGODB_URI", DEFAULT_MONGO_BASE_URI),
    )


class IsolatedStack:
    def __init__(self, config: StackConfig, log: Callable[[str], None] = print):
        self.config = config
        self.log = log
        self.processes: List[subprocess.Popen] = []
        self._log_handles: List[Any] = []
        self.dist_dir = os.path.join(config.work_dir, "web-dist")
        self.ownership: Dict[str, Any] = {
            "database": config.db_name,
            "pg_created_by_run": False,
            "mongo_created_by_run": False,
            "pg_dropped": False,
            "mongo_dropped": False,
            "errors": [],
        }
        self.steps: List[Dict[str, Any]] = []

    @property
    def pg_url(self) -> str:
        return with_database(self.config.admin_pg_url, self.config.db_name)

    @property
    def mongo_uri(self) -> str:
        return with_database(self.config.mongo_base_uri, self.config.db_name)

    @property
    def api_url(self) -> str:
        return f"http://127.0.0.1:{self.config.backend_port}/api/v1"

    @property
    def web_url(self) -> str:
        return f"http://127.0.0.1:{self.config.web_port}"

    def db_env(self) -> Dict[str, str]:
        """Environment that points backend tooling at the disposable databases only."""
        return {
            "DATABASE_URL": self.pg_url,
            "MONGODB_URI": self.mongo_uri,
            "EXPECTED_TEST_DB_NAME": self.config.db_name,
            OPT_IN_ENV: "1",
        }

    def preflight(self) -> None:
        """All refusal checks. Performs no writes."""
        assert_safe_target(
            self.config.db_name,
            os.environ.get(OPT_IN_ENV),
            self.config.backend_port,
            self.config.web_port,
            urlsplit(self.config.admin_pg_url).hostname,
            urlsplit(self.config.mongo_base_uri).hostname,
        )
        if self.config.db_name in list_postgres_databases(self.config.admin_pg_url):
            raise RefusedError(f"PostgreSQL database '{self.config.db_name}' already exists; it is not owned by this run")
        if self.config.db_name in list_mongo_databases(self.config.mongo_base_uri):
            raise RefusedError(f"MongoDB database '{self.config.db_name}' already exists; it is not owned by this run")
        for port in (self.config.backend_port, self.config.web_port):
            if port_in_use(port):
                raise RefusedError(f"port {port} is already in use")

    def start(self) -> None:
        self.preflight()
        name = self.config.db_name
        self.log(f"[Stack] Creating disposable databases '{name}'")
        with psycopg.connect(self.config.admin_pg_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        self.ownership["pg_created_by_run"] = True
        client = MongoClient(self.config.mongo_base_uri, serverSelectionTimeoutMS=5000)
        try:
            client[name].create_collection("_run_marker")
        finally:
            client.close()
        self.ownership["mongo_created_by_run"] = True

        env = {**os.environ, **self.db_env()}
        self._run_step("backend_db_migrate", "npm run db:migrate", BACKEND_DIR, env)
        self._run_step("backend_db_seed_demo", "npm run db:seed:demo", BACKEND_DIR, env)
        with psycopg.connect(self.pg_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database()")
                assert cur.fetchone()[0] == name, "connected to an unexpected database"

        web_env = {**os.environ, "VITE_API_BASE_URL": self.api_url}
        self._run_step("web_production_build", f'npx vite build --outDir "{self.dist_dir}" --emptyOutDir', WEB_DIR, web_env)

        backend_env = {
            **env,
            "PORT": str(self.config.backend_port),
            "WEB_ORIGIN": self.web_url,
            "NODE_ENV": "development",
            "DB_CONNECT_ON_START": "true",
            "JWT_ACCESS_SECRET": secrets.token_hex(32),
            "JWT_REFRESH_SECRET": secrets.token_hex(32),
        }
        self._spawn("backend", "npx tsx src/main.ts", BACKEND_DIR, backend_env)
        self._wait_http(f"{self.api_url}/health", "backend")
        self._spawn(
            "web",
            f'npx vite preview --outDir "{self.dist_dir}" --port {self.config.web_port} --strictPort --host 127.0.0.1',
            WEB_DIR,
            dict(os.environ),
        )
        self._wait_http(self.web_url, "web")

        with psycopg.connect(self.config.admin_pg_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = %s", (name,))
                self.ownership["backend_connections_to_test_db"] = cur.fetchone()[0]
        self.log(f"[Stack] Ready: web={self.web_url} api={self.api_url} db={name}")

    def stop(self) -> None:
        """Stops owned processes and drops owned databases. Never raises."""
        for proc in reversed(self.processes):
            if proc.poll() is None:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        self.processes.clear()
        name = self.config.db_name
        if self.ownership["pg_created_by_run"] and not self.ownership["pg_dropped"]:
            try:
                with psycopg.connect(self.config.admin_pg_url, autocommit=True) as conn:
                    with conn.cursor() as cur:
                        cur.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
                self.ownership["pg_dropped"] = name not in list_postgres_databases(self.config.admin_pg_url)
            except Exception as error:
                self.ownership["errors"].append(f"pg drop: {error}")
        if self.ownership["mongo_created_by_run"] and not self.ownership["mongo_dropped"]:
            try:
                client = MongoClient(self.config.mongo_base_uri, serverSelectionTimeoutMS=5000)
                try:
                    client.drop_database(name)
                finally:
                    client.close()
                self.ownership["mongo_dropped"] = name not in list_mongo_databases(self.config.mongo_base_uri)
            except Exception as error:
                self.ownership["errors"].append(f"mongo drop: {error}")
        for handle in self._log_handles:
            handle.close()
        self._log_handles.clear()
        # Logs stay in work_dir as run evidence; only the web build is removed.
        shutil.rmtree(self.dist_dir, ignore_errors=True)
        self.log(f"[Stack] Teardown: pg_dropped={self.ownership['pg_dropped']} mongo_dropped={self.ownership['mongo_dropped']}")

    @property
    def teardown_ok(self) -> bool:
        owned_pg = self.ownership["pg_created_by_run"]
        owned_mongo = self.ownership["mongo_created_by_run"]
        return (not owned_pg or self.ownership["pg_dropped"]) and (not owned_mongo or self.ownership["mongo_dropped"])

    def __enter__(self) -> "IsolatedStack":
        try:
            self.start()
        except BaseException:
            self.stop()
            raise
        return self

    def __exit__(self, *exc: Any) -> None:
        self.stop()

    def _run_step(self, name: str, command: str, cwd: str, env: Dict[str, str]) -> None:
        self.log(f"[Stack] {name}: {command}")
        started = time.time()
        result = subprocess.run(command, shell=True, cwd=cwd, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace")
        step = {"name": name, "command": command, "cwd": os.path.relpath(cwd, REPO_ROOT),
                "exit_code": result.returncode, "duration_seconds": round(time.time() - started, 1)}
        self.steps.append(step)
        self._write_log(name, result.stdout + "\n" + result.stderr)
        if result.returncode != 0:
            raise RuntimeError(f"{name} failed (exit {result.returncode}):\n{(result.stdout + result.stderr)[-1500:]}")

    def _spawn(self, name: str, command: str, cwd: str, env: Dict[str, str]) -> None:
        log_path = os.path.join(self.config.work_dir, f"{name}.log")
        handle = open(log_path, "w", encoding="utf-8", errors="replace")
        self._log_handles.append(handle)
        self.processes.append(subprocess.Popen(command, shell=True, cwd=cwd, env=env, stdout=handle, stderr=subprocess.STDOUT))

    def _wait_http(self, url: str, name: str, timeout: float = 90.0) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if httpx.get(url, timeout=2.0).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            if any(proc.poll() is not None for proc in self.processes):
                break
            time.sleep(0.5)
        log_path = os.path.join(self.config.work_dir, f"{name}.log")
        tail = open(log_path, encoding="utf-8", errors="replace").read()[-1500:] if os.path.exists(log_path) else ""
        raise RuntimeError(f"{name} did not become ready at {url}:\n{tail}")

    def _write_log(self, name: str, text: str) -> None:
        with open(os.path.join(self.config.work_dir, f"{name}.log"), "w", encoding="utf-8", errors="replace") as handle:
            handle.write(text)
