"""Require real audit timestamps without rewriting historical audit data."""
from alembic import context, op
import sqlalchemy as sa

revision = "0016_entity_profile_audit_timestamp"
down_revision = "0015_provenance_timestamp"
branch_labels = None
depends_on = None


def upgrade():
    if context.is_offline_mode():
        raise RuntimeError("0016_entity_profile_audit_timestamp requires online NULL-data validation")
    bind = op.get_bind()
    schema = "narrative" if bind.dialect.name == "postgresql" else None
    table = "narrative.entity_profile_audits" if schema else "entity_profile_audits"
    if schema:
        op.execute(sa.text(f"LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE"))
    null_rows = bind.execute(sa.text(
        f"SELECT count(*) FROM {table} WHERE created_at IS NULL"
    )).scalar_one()
    if null_rows:
        raise RuntimeError(
            "DATA_REPAIR_DECISION_REQUIRED: entity_profile_audits.created_at "
            f"contains {null_rows} NULL row(s); no timestamps or audits modified"
        )
    column = next(c for c in sa.inspect(bind).get_columns("entity_profile_audits", schema=schema)
                  if c["name"] == "created_at")
    if column["nullable"]:
        if schema:
            op.alter_column("entity_profile_audits", "created_at", schema=schema,
                            existing_type=sa.DateTime(timezone=True), nullable=False)
        else:
            with op.batch_alter_table("entity_profile_audits") as batch:
                batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    if schema:
        # This requested revision ID is 35 characters; Alembic defaults to
        # VARCHAR(32). Widen metadata transactionally before it writes the head.
        opts = context.get_context().opts
        name = opts.get("version_table", "alembic_version")
        version_schema = opts.get("version_table_schema")
        version_column = next(c for c in sa.inspect(bind).get_columns(name, schema=version_schema)
                              if c["name"] == "version_num")
        length = getattr(version_column["type"], "length", None)
        if length is not None and length < len(revision):
            op.alter_column(name, "version_num", schema=version_schema,
                            existing_type=version_column["type"], type_=sa.String(len(revision)))


def downgrade():
    # Only relax this audit constraint; keep data/defaults and unrelated objects.
    # Keep widened Alembic metadata: its current 35-character head is still stored
    # while this function runs, and old revisions remain compatible with it.
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("entity_profile_audits", "created_at", schema="narrative",
                        existing_type=sa.DateTime(timezone=True), nullable=True)
    else:
        with op.batch_alter_table("entity_profile_audits") as batch:
            batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=True)
