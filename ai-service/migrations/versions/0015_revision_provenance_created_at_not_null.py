"""Align provenance timestamp nullability without inventing historical data."""
from alembic import context, op
import sqlalchemy as sa

revision = "0015_provenance_timestamp"
down_revision = "0014_entity_profiles"
branch_labels = None
depends_on = None


def upgrade():
    if context.is_offline_mode():
        raise RuntimeError("0015_provenance_timestamp requires online NULL-data validation")
    bind = op.get_bind()
    schema = "narrative" if bind.dialect.name == "postgresql" else None
    table = "narrative.revision_provenances" if schema else "revision_provenances"
    if schema:
        # The same transactional lock required by ALTER prevents a NULL writer
        # entering between validation and constraint installation.
        op.execute(sa.text(f"LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE"))
    null_rows = bind.execute(sa.text(
        f"SELECT count(*) FROM {table} WHERE created_at IS NULL"
    )).scalar_one()
    if null_rows:
        raise RuntimeError(
            "DATA_REPAIR_DECISION_REQUIRED: revision_provenances.created_at "
            f"contains {null_rows} NULL row(s); no timestamps or rows modified"
        )
    if schema:
        op.alter_column("revision_provenances", "created_at", schema=schema,
                        existing_type=sa.DateTime(timezone=True), nullable=False)
    else:
        with op.batch_alter_table("revision_provenances") as batch:
            batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade():
    # Restore only the previous nullable contract. Keep every row, timestamp,
    # default, index and unrelated constraint; no data repair is reversed.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.alter_column("revision_provenances", "created_at", schema="narrative",
                        existing_type=sa.DateTime(timezone=True), nullable=True)
    else:
        with op.batch_alter_table("revision_provenances") as batch:
            batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=True)
