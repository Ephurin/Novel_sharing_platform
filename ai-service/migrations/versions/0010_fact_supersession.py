"""Keep fact revision history while projecting only the current source occurrence."""
import sqlalchemy as sa
from alembic import op

revision = '0010_fact_supersession'
down_revision = '0009_autonomous_runs'
branch_labels = None
depends_on = None


def upgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('facts', schema=schema)}
    if 'supersedes_id' not in columns:
        op.add_column('facts', sa.Column('supersedes_id', sa.Uuid(), nullable=True), schema=schema)
    if 'is_retired' not in columns:
        op.add_column('facts', sa.Column('is_retired', sa.Boolean(), nullable=False, server_default=sa.false()), schema=schema)


def downgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    op.drop_column('facts', 'is_retired', schema=schema)
    op.drop_column('facts', 'supersedes_id', schema=schema)
