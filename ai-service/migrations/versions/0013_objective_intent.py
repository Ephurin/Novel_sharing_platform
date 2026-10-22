"""Monotone objective intent epoch for accept-commit fencing."""
from alembic import op
import sqlalchemy as sa
revision = '0013_objective_intent'
down_revision = '0012_entity_guidance'
branch_labels = None
depends_on = None

def upgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('story_plan_objectives', schema=schema)}
    if 'intent_version' not in columns:
        op.add_column('story_plan_objectives', sa.Column('intent_version', sa.Integer(), nullable=False, server_default='0'), schema=schema)

def downgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    op.drop_column('story_plan_objectives', 'intent_version', schema=schema)
