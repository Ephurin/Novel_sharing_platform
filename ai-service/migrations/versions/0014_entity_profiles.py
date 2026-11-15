"""Additive author profile and private audit ledger (AX-01)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = '0014_entity_profiles'
down_revision = '0013_objective_intent'
branch_labels = None
depends_on = None


def upgrade():
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    json_type = sa.JSON().with_variant(JSONB(), 'postgresql')
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('entities', schema=schema)}
    if 'author_profile' not in columns:
        op.add_column('entities', sa.Column('author_profile', json_type, nullable=False, server_default='{}'), schema=schema)
    if 'private_author_notes' not in columns:
        op.add_column('entities', sa.Column('private_author_notes', sa.Text(), nullable=False, server_default=''), schema=schema)
    if 'profile_version' not in columns:
        op.add_column('entities', sa.Column('profile_version', sa.Integer(), nullable=False, server_default='0'), schema=schema)
    if 'entity_profile_audits' in sa.inspect(op.get_bind()).get_table_names(schema=schema):
        return
    op.create_table('entity_profile_audits',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('novel_id', sa.Uuid(), nullable=False),
        sa.Column('entity_id', sa.Uuid(), sa.ForeignKey(f'{schema + "." if schema else ""}entities.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Uuid(), nullable=False),
        sa.Column('request_key', sa.String(128), nullable=False),
        sa.Column('input_hash', sa.String(64), nullable=False),
        sa.Column('before', json_type, nullable=False),
        sa.Column('after', json_type, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('tenant_id', 'novel_id', 'actor_id', 'request_key', name='uq_entity_profile_request'), schema=schema)


def downgrade():
    # Securely export private profiles/audits first; rollback discards these additions.
    schema = 'narrative' if op.get_bind().dialect.name == 'postgresql' else None
    op.drop_table('entity_profile_audits', schema=schema)
    for name in ('profile_version', 'private_author_notes', 'author_profile'):
        op.drop_column('entities', name, schema=schema)
