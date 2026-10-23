"""Author extraction guidance, kept outside approved narrative memory."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0012_entity_guidance'
down_revision = '0011_entity_candidate_audit'
branch_labels = None
depends_on = None


def upgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('story_brains', schema=schema)}
    if 'entity_guidance' not in columns:
        op.add_column('story_brains', sa.Column('entity_guidance',
            sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True), schema=schema)


def downgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    op.drop_column('story_brains', 'entity_guidance', schema=schema)
