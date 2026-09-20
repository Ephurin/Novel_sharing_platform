"""Add revision provenance and fact chapter number."""

from alembic import op
import sqlalchemy as sa

from infrastructure.orm_models import RevisionProvenanceRecord, SCHEMA


revision = "0005_revision_provenance"
down_revision = "0004_writing_generations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    RevisionProvenanceRecord.__table__.create(bind, checkfirst=True)
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE {SCHEMA}.facts ADD COLUMN IF NOT EXISTS chapter_number INTEGER")


def downgrade() -> None:
    bind = op.get_bind()
    RevisionProvenanceRecord.__table__.drop(bind, checkfirst=True)
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE {SCHEMA}.facts DROP COLUMN IF EXISTS chapter_number")
