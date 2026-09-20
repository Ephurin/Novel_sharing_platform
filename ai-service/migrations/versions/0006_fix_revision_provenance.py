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
        res = bind.execute(
            sa.text(f"SELECT count(*) FROM {SCHEMA}.revision_provenances WHERE revision_id IS NULL")
        ).scalar()
        if res and res > 0:
            import os
            allow_clear = os.getenv("MIGRATION_CLEAR_UNMAPPED_PROVENANCE", "").lower() in ("true", "1", "yes")
            if allow_clear:
                op.execute(f"DELETE FROM {SCHEMA}.revision_provenances WHERE revision_id IS NULL")
            else:
                raise RuntimeError(
                    f"Found {res} unmapped legacy revision_provenance rows without revision_id. "
                    "Legacy 0005 schema did not track revision_id, so automatic random mapping is unsafe and prohibited. "
                    "Set MIGRATION_CLEAR_UNMAPPED_PROVENANCE=true to discard unmapped cache rows and rebuild them from Platform, "
                    "or clear the table manually."
                )
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances ALTER COLUMN revision_id SET NOT NULL"
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
    else:
        with op.batch_alter_table("revision_provenances") as batch_op:
            batch_op.add_column(sa.Column("revision_id", sa.Uuid(), nullable=True))
        res = bind.execute(
            sa.text("SELECT count(*) FROM revision_provenances WHERE revision_id IS NULL")
        ).scalar()
        if res and res > 0:
            import os
            allow_clear = os.getenv("MIGRATION_CLEAR_UNMAPPED_PROVENANCE", "").lower() in ("true", "1", "yes")
            if allow_clear:
                bind.execute(sa.text("DELETE FROM revision_provenances WHERE revision_id IS NULL"))
            else:
                raise RuntimeError(
                    f"Found {res} unmapped legacy revision_provenance rows without revision_id. "
                    "Legacy 0005 schema did not track revision_id, so automatic random mapping is unsafe and prohibited. "
                    "Set MIGRATION_CLEAR_UNMAPPED_PROVENANCE=true to discard unmapped cache rows and rebuild them, "
                    "or clear the table manually."
                )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances DROP CONSTRAINT IF EXISTS uq_rev_provenance_revision"
        )
        op.execute(
            f"DROP INDEX IF EXISTS {SCHEMA}.ix_revision_provenances_revision_id"
        )
        op.execute(
            f"ALTER TABLE {SCHEMA}.revision_provenances DROP COLUMN IF EXISTS revision_id"
        )
    else:
        with op.batch_alter_table("revision_provenances") as batch_op:
            batch_op.drop_column("revision_id")
