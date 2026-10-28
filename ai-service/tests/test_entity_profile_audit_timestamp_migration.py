"""Actual PostgreSQL upgrade paths; publish only hashed private audit snapshots."""
import hashlib
import json
import uuid

import pytest
from alembic import command
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from domain.entity_profile import EntityProfilePatch
from infrastructure.orm_models import Base, EntityRecord, StoryBrainRecord
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from tests.test_revision_provenance_timestamp_migration import database

pytestmark = pytest.mark.postgres_integration
PREVIOUS = "0015_provenance_timestamp"
HEAD = "0016_entity_profile_audit_timestamp"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def audit_rows(engine):
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM narrative.entity_profile_audits ORDER BY id")).mappings()
        return [{**{k: str(v) for k, v in r.items() if k not in ("before", "after")},
                 "before_hash": digest(r["before"]), "after_hash": digest(r["after"])} for r in result]


def column(engine, table="entity_profile_audits"):
    return next(c for c in inspect(engine).get_columns(table, schema="narrative") if c["name"] == "created_at")


def head(engine):
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one()


def real_previous(engine, cfg):
    #0001 imports current ORM metadata. Recreate the audit table through real0014
    # instead of letting create_all mask the historical migration contract.
    command.upgrade(cfg, PREVIOUS)
    command.downgrade(cfg, "0013_objective_intent")
    command.upgrade(cfg, PREVIOUS)
    assert column(engine)["nullable"] is True
    assert column(engine, "revision_provenances")["nullable"] is False


def seed(engine):
    tenant, actor, novel, eid = (uuid.uuid4() for _ in range(4))
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    repo = PostgresNarrativeRepository(factory, tenant_id=str(tenant), actor_id=str(actor))
    repo.get_story_brain(str(novel))
    with factory.begin() as session:
        brain = session.scalar(select(StoryBrainRecord).where(StoryBrainRecord.novel_id == novel))
        session.add(EntityRecord(id=eid, story_brain_id=brain.id, tenant_id=tenant, novel_id=novel,
            canonical_name="AuditFixture", normalized_name="auditfixture", entity_type="PER",
            confirmation_status="confirmed", static_attributes={}))
    for i in range(2):
        current = repo.get_entity_profile(str(novel), str(eid))
        patch = EntityProfilePatch(expected_version=current["version"],
            expected_brain_version=current["brain_version"], author_notes=f"private fixture note {i}")
        repo.update_entity_profile(str(novel), str(eid), patch, actor_id=str(actor), request_key=f"audit-fixture-{i}")
    return repo, str(actor), str(novel), str(eid)


def objects(engine):
    inspector = inspect(engine)
    return {"unique": inspector.get_unique_constraints("entity_profile_audits", schema="narrative"),
            "indexes": inspector.get_indexes("entity_profile_audits", schema="narrative"),
            "foreign_keys": inspector.get_foreign_keys("entity_profile_audits", schema="narrative"),
            "pk": inspector.get_pk_constraint("entity_profile_audits", schema="narrative")}


def test_a_fresh_chain_both_timestamps_defaults_and_metadata(database):
    engine, cfg = database
    command.upgrade(cfg, HEAD)
    assert head(engine) == HEAD
    for table in ("revision_provenances", "entity_profile_audits"):
        assert column(engine, table)["nullable"] is False
        assert "now()" in column(engine, table)["default"]
    for table in Base.metadata.sorted_tables:
        actual = {c["name"]: c for c in inspect(engine).get_columns(table.name, schema=table.schema)}
        for c in table.columns:
            assert c.name in actual
            assert actual[c.name]["nullable"] == c.nullable
    assert inspect(engine).get_columns("alembic_version")[0]["type"].length >= len(HEAD)


def test_b_real_upgrade_preserves_complete_audit_and_new_write_retry(database):
    engine, cfg = database
    real_previous(engine, cfg)
    repo, actor, novel, eid = seed(engine)
    before, constraints, default = audit_rows(engine), objects(engine), column(engine)["default"]
    assert len(before) == 2 and all(r["created_at"] != "None" for r in before)
    command.upgrade(cfg, HEAD)
    assert audit_rows(engine) == before
    assert objects(engine) == constraints and column(engine)["default"] == default
    current = repo.get_entity_profile(novel, eid)
    patch = EntityProfilePatch(expected_version=current["version"], expected_brain_version=current["brain_version"], author_notes="post-upgrade private fixture")
    result = repo.update_entity_profile(novel, eid, patch, actor_id=actor, request_key="after-upgrade")
    first = audit_rows(engine)
    retry = repo.update_entity_profile(novel, eid, patch, actor_id=actor, request_key="after-upgrade")
    assert digest(result) == digest(retry)
    assert len(first) == 3 and audit_rows(engine) == first
    assert all(r["actor_id"] == actor and r["entity_id"] == eid and r["created_at"] != "None" for r in first)
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(text("UPDATE narrative.entity_profile_audits SET created_at=NULL"))
    assert audit_rows(engine) == first


def test_c_nulls_fail_closed_without_data_schema_or_version_change(database):
    engine, cfg = database
    real_previous(engine, cfg)
    seed(engine)
    with engine.begin() as conn:
        conn.execute(text("UPDATE narrative.entity_profile_audits SET created_at=NULL"))
    before, constraints = audit_rows(engine), objects(engine)
    with pytest.raises(RuntimeError, match="DATA_REPAIR_DECISION_REQUIRED.*2 NULL"):
        command.upgrade(cfg, HEAD)
    assert audit_rows(engine) == before
    assert head(engine) == PREVIOUS and column(engine)["nullable"] is True
    assert objects(engine) == constraints
    assert column(engine, "revision_provenances")["nullable"] is False
    assert inspect(engine).get_columns("alembic_version")[0]["type"].length == 32


def test_d_downgrade_reupgrade_only_relaxes_audit_nullability(database):
    engine, cfg = database
    real_previous(engine, cfg)
    seed(engine)
    command.upgrade(cfg, HEAD)
    before, constraints, default = audit_rows(engine), objects(engine), column(engine)["default"]
    command.downgrade(cfg, PREVIOUS)
    assert head(engine) == PREVIOUS and column(engine)["nullable"] is True
    assert audit_rows(engine) == before and objects(engine) == constraints
    assert column(engine)["default"] == default
    assert column(engine, "revision_provenances")["nullable"] is False
    assert inspect(engine).get_columns("alembic_version")[0]["type"].length == 35
    command.upgrade(cfg, HEAD)
    assert column(engine)["nullable"] is False
    assert audit_rows(engine) == before and objects(engine) == constraints


def test_e_existing_not_null_table_is_preserved(database):
    engine, cfg = database
    real_previous(engine, cfg)
    seed(engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE narrative.entity_profile_audits ALTER COLUMN created_at SET NOT NULL"))
    before, constraints, default = audit_rows(engine), objects(engine), column(engine)["default"]
    command.upgrade(cfg, HEAD)
    assert head(engine) == HEAD and column(engine)["nullable"] is False
    assert audit_rows(engine) == before and objects(engine) == constraints
    assert column(engine)["default"] == default


def test_offline_upgrade_is_rejected(database):
    _, cfg = database
    with pytest.raises(RuntimeError, match="requires online NULL-data validation"):
        command.upgrade(cfg, PREVIOUS + ":" + HEAD, sql=True)
