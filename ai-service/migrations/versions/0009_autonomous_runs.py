"""Add autonomous_runs storage."""

from alembic import op

from infrastructure.orm_models import AutonomousRunRecord


revision = "0009_autonomous_runs"
down_revision = "0008_story_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    AutonomousRunRecord.__table__.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    AutonomousRunRecord.__table__.drop(bind, checkfirst=True)
