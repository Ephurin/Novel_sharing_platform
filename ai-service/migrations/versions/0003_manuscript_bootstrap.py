"""Add durable manuscript bootstrap jobs."""

from alembic import op

from infrastructure.orm_models import BootstrapJobRecord


revision = "0003_manuscript_bootstrap"
down_revision = "0002_state_projection"
branch_labels = None
depends_on = None


def upgrade() -> None:
    BootstrapJobRecord.__table__.create(op.get_bind())


def downgrade() -> None:
    BootstrapJobRecord.__table__.drop(op.get_bind())
