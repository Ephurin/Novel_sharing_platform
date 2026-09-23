"""Add semantic-memory chunk and embedding storage."""

from alembic import op

from infrastructure.orm_models import MemoryChunkRecord, MemoryEmbeddingRecord


revision = "0007_semantic_memory_foundation"
down_revision = "0006_fix_revision_provenance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    MemoryChunkRecord.__table__.create(bind, checkfirst=True)
    MemoryEmbeddingRecord.__table__.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    MemoryEmbeddingRecord.__table__.drop(bind, checkfirst=True)
    MemoryChunkRecord.__table__.drop(bind, checkfirst=True)
    # Do not drop the vector extension. It may be shared by another schema or
    # future migration; P7-02 only owns its two derived semantic-memory tables.
