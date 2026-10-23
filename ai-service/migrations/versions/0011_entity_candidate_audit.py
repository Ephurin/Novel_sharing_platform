"""Persist candidate decisions separately from approved narrative memory."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0011_entity_candidate_audit'
down_revision = '0010_fact_supersession'
branch_labels = None
depends_on = None


def upgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('analysis_runs', schema=schema)}
    if 'entity_candidate_audit' not in columns:
        op.add_column('analysis_runs', sa.Column('entity_candidate_audit',
                      sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True), schema=schema)


def downgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    op.drop_column('analysis_runs', 'entity_candidate_audit', schema=schema)
