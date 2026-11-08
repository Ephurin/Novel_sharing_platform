"""Plan snapshot receipts/private settings and active-plan uniqueness.

Existing duplicate active plans cause upgrade to fail, never silent data cleanup.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision='0017_plan_edit'
down_revision='0016_entity_profile_audit_timestamp'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('story_plans',sa.Column('edit_metadata',postgresql.JSONB(),nullable=False,server_default=sa.text("'{}'::jsonb")),schema='narrative')
    op.create_index('uq_story_plan_active','story_plans',['tenant_id','novel_id'],unique=True,schema='narrative',postgresql_where=sa.text("status = 'active'"))

def downgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM narrative.story_plans WHERE edit_metadata <> '{}'::jsonb")).scalar():
        raise RuntimeError('Cannot discard plan-edit history during downgrade')
    op.drop_index('uq_story_plan_active',table_name='story_plans',schema='narrative')
    op.drop_column('story_plans','edit_metadata',schema='narrative')
