"""Create Narrative Memory foundation tables."""

from alembic import op

from infrastructure.orm_models import Base, SCHEMA


revision = "0001_narrative_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    Base.metadata.create_all(bind=bind, tables=_tables())


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=_tables())
    if bind.dialect.name == "postgresql":
        op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")


def _tables():
    excluded = {"event_participants", "state_transitions", "current_entity_states", "bootstrap_jobs", "writing_generations"}
    return [t for t in Base.metadata.sorted_tables if t.name not in excluded]
