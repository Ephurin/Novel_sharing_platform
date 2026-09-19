"""Add durable writing generations."""

from alembic import op

from infrastructure.orm_models import WritingGenerationRecord


revision = "0004_writing_generations"
down_revision = "0003_manuscript_bootstrap"
branch_labels = None
depends_on = None


def upgrade() -> None:
    WritingGenerationRecord.__table__.create(op.get_bind())


def downgrade() -> None:
    WritingGenerationRecord.__table__.drop(op.get_bind())
