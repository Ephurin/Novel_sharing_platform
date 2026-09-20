"""Fix revision provenance schema with revision_id and unique constraint."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from infrastructure.orm_models import SCHEMA


revision = "0006_fix_revision_provenance"
down_revision = "0005_revision_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances ADD COLUMN IF NOT EXISTS revision_id UUID"
        )
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_rev_provenance_revision'
                ) THEN
                    ALTER TABLE {SCHEMA}.revision_provenances
                    ADD CONSTRAINT uq_rev_provenance_revision UNIQUE (tenant_id, novel_id, revision_id);
                END IF;
            END $$;
            """
        )
        op.execute(
            f"CREATE INDEX IF NOT EXISTS ix_revision_provenances_revision_id ON {SCHEMA}.revision_provenances (revision_id)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances DROP CONSTRAINT IF EXISTS uq_rev_provenance_revision"
        )
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances DROP COLUMN IF EXISTS revision_id"
        )
