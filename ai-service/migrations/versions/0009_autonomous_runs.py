import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

from infrastructure.orm_models import AutonomousRunRecord


revision = "0009_autonomous_runs"
down_revision = "0008_story_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema = "narrative" if dialect == "postgresql" else None

    AutonomousRunRecord.__table__.create(bind, checkfirst=True)
    insp = inspect(bind)
    cols = [c["name"] for c in insp.get_columns("autonomous_runs", schema=schema)]
    if "input_hash" not in cols:
        op.add_column("autonomous_runs", sa.Column("input_hash", sa.String(64), nullable=True), schema=schema)
    indexes = [idx["name"] for idx in insp.get_indexes("autonomous_runs", schema=schema)]
    if "uq_autonomous_runs_active_novel" not in indexes:
        op.create_index(
            "uq_autonomous_runs_active_novel",
            "autonomous_runs",
            ["tenant_id", "novel_id"],
            unique=True,
            schema=schema,
            postgresql_where=sa.text("status IN ('queued', 'running')") if dialect == "postgresql" else None,
        )
    if "uq_autonomous_runs_idempotency" not in indexes:
        op.create_index(
            "uq_autonomous_runs_idempotency",
            "autonomous_runs",
            ["tenant_id", "novel_id", "idempotency_key"],
            unique=True,
            schema=schema,
            postgresql_where=sa.text("idempotency_key IS NOT NULL") if dialect == "postgresql" else None,
        )


def downgrade() -> None:
    bind = op.get_bind()
    AutonomousRunRecord.__table__.drop(bind, checkfirst=True)

