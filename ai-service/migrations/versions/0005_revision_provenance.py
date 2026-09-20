"""Add revision provenance and fact chapter number."""

from alembic import op
import sqlalchemy as sa

from infrastructure.orm_models import SCHEMA


revision = "0005_revision_provenance"
down_revision = "0004_writing_generations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {SCHEMA}.revision_provenances (
                id UUID PRIMARY KEY,
                story_brain_id UUID NOT NULL REFERENCES {SCHEMA}.story_brains(id) ON DELETE CASCADE,
                tenant_id UUID NOT NULL,
                novel_id UUID NOT NULL,
                chapter_id UUID NOT NULL,
                chapter_number INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ix_narrative_rev_prov_tenant_id ON {SCHEMA}.revision_provenances (tenant_id);
            CREATE INDEX IF NOT EXISTS ix_narrative_rev_prov_novel_id ON {SCHEMA}.revision_provenances (novel_id);
            """
        )
        op.execute(f"ALTER TABLE {SCHEMA}.facts ADD COLUMN IF NOT EXISTS chapter_number INTEGER")
    else:
        op.create_table(
            "revision_provenances",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("story_brain_id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=False),
            sa.Column("novel_id", sa.Uuid(), nullable=False),
            sa.Column("chapter_id", sa.Uuid(), nullable=False),
            sa.Column("chapter_number", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            schema=SCHEMA if bind.dialect.name != "sqlite" else None,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.revision_provenances CASCADE")
        op.execute(f"ALTER TABLE {SCHEMA}.facts DROP COLUMN IF EXISTS chapter_number")
    else:
        op.drop_table("revision_provenances", schema=SCHEMA if bind.dialect.name != "sqlite" else None)
