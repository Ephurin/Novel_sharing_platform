"""Real PostgreSQL migration scenarios; one owned disposable database per case."""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from infrastructure.orm_models import Base, RevisionProvenanceRecord
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository

pytestmark = pytest.mark.postgres_integration
ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = "0014_entity_profiles"
HEAD = "0015_provenance_timestamp"


@pytest.fixture
def database(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        raise pytest.UsageError("Disposable PostgreSQL TEST_DATABASE_URL required")
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    name = "schema_drift_test_" + uuid.uuid4().hex
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    target = make_url(url).set(database=name).render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", target)
    engine = create_engine(target)
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", target.replace("%", "%%"))
    try:
        yield engine, cfg
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE "{name}"'))
        admin.dispose()


def column(engine):
    return next(c for c in inspect(engine).get_columns("revision_provenances", schema="narrative")
                if c["name"] == "created_at")


def rows(engine):
    with engine.connect() as conn:
        return conn.execute(text("SELECT to_jsonb(p) FROM narrative.revision_provenances p ORDER BY id")).scalars().all()


def repository(engine):
    return PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
        tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))


def seed(engine):
    repo = repository(engine)
    for index in range(2):
        repo.record_revision_provenance("timestamp-story", f"chapter-{index}", f"revision-{index}", index + 1)
    # Known historical fixture instants, never a migration backfill.
    with engine.begin() as conn:
        conn.execute(text("UPDATE narrative.revision_provenances SET created_at=:stamp"),
                     {"stamp": datetime(2020, 2, 3, 4, 5, 6, 123456, tzinfo=timezone.utc)})
    return repo


def test_fresh_chain_aligns_orm_and_preserves_default(database):
    engine, cfg = database
    command.upgrade(cfg, HEAD)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one() == HEAD
    assert column(engine)["nullable"] is False
    assert "now()" in column(engine)["default"]
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        actual = {c["name"]: c for c in inspector.get_columns(table.name, schema=table.schema)}
        for c in table.columns:
            assert c.name in actual
            assert actual[c.name]["nullable"] == c.nullable, f"{table.fullname}.{c.name}"


def test_existing_rows_and_timestamps_preserved_new_default_and_constraint(database):
    engine, cfg = database
    command.upgrade(cfg, PREVIOUS)
    repo = seed(engine)
    before, default = rows(engine), column(engine)["default"]
    assert len(before) == 2 and column(engine)["nullable"] is True
    command.upgrade(cfg, HEAD)
    assert rows(engine) == before
    assert column(engine)["default"] == default
    assert column(engine)["nullable"] is False
    repo.record_revision_provenance("timestamp-story", "new-chapter", "new-revision", 3)
    assert len(rows(engine)) == 3
    assert all(r["created_at"] is not None for r in rows(engine))
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(text("UPDATE narrative.revision_provenances SET created_at=NULL"))
    assert len(rows(engine)) == 3


def test_null_data_fails_closed_with_no_partial_schema_or_data_changes(database):
    engine, cfg = database
    command.upgrade(cfg, PREVIOUS)
    seed(engine)
    with engine.begin() as conn:
        conn.execute(text("UPDATE narrative.revision_provenances SET created_at=NULL"))
    before = rows(engine)
    with pytest.raises(RuntimeError, match="DATA_REPAIR_DECISION_REQUIRED.*2 NULL"):
        command.upgrade(cfg, HEAD)
    assert rows(engine) == before
    assert column(engine)["nullable"] is True
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one() == PREVIOUS
    assert all(r["created_at"] is None for r in rows(engine))


def test_downgrade_only_relaxes_constraint_and_reupgrade_is_lossless(database):
    engine, cfg = database
    command.upgrade(cfg, HEAD)
    seed(engine)
    before, default = rows(engine), column(engine)["default"]
    constraints = inspect(engine).get_unique_constraints("revision_provenances", schema="narrative")
    command.downgrade(cfg, PREVIOUS)
    assert rows(engine) == before
    assert column(engine)["nullable"] is True
    assert column(engine)["default"] == default
    assert inspect(engine).get_unique_constraints("revision_provenances", schema="narrative") == constraints
    command.upgrade(cfg, HEAD)
    assert rows(engine) == before
    assert column(engine)["nullable"] is False


def test_repository_repeated_record_preserves_timestamp_and_queries(database):
    engine, cfg = database
    command.upgrade(cfg, HEAD)
    repo = repository(engine)
    repo.record_revision_provenance("story", "chapter", "revision", 1)
    before = repo.get_revision_provenance("story", "revision")
    assert before["created_at"] is not None
    repo.record_revision_provenance("story", "chapter", "revision", 2)
    after = repo.get_revision_provenance("story", "revision")
    assert after["created_at"] == before["created_at"]
    assert after["id"] == before["id"] and after["chapter_number"] == 2
    assert len(rows(engine)) == 1
    assert RevisionProvenanceRecord.__table__.c.created_at.nullable is False
