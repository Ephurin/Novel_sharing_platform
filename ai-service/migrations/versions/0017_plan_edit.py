"""Plan receipts and unique active plan; adopt validated ORM-created fresh schema.

0008 creates current ORM tables on fresh installs. Never rewrite old migrations.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision='0017_plan_edit'
down_revision='0016_entity_profile_audit_timestamp'
branch_labels=None
depends_on=None

def upgrade():
    bind=op.get_bind();schema='narrative' if bind.dialect.name=='postgresql' else None
    inspector=sa.inspect(bind)
    columns={c['name']:c for c in inspector.get_columns('story_plans',schema=schema)}
    if 'edit_metadata' not in columns:
        op.add_column('story_plans',sa.Column('edit_metadata',sa.JSON().with_variant(postgresql.JSONB(),'postgresql'),nullable=False,server_default=sa.text("'{}'")),schema=schema)
    elif columns['edit_metadata']['nullable'] or not isinstance(columns['edit_metadata']['type'],sa.JSON):
        raise RuntimeError('Unexpected plan metadata schema')
    indexes={i['name']:i for i in inspector.get_indexes('story_plans',schema=schema)}
    existing=indexes.get('uq_story_plan_active')
    if existing:
        options=existing.get('dialect_options',{})
        where=str(options.get('postgresql_where') if options.get('postgresql_where') is not None else options.get('sqlite_where',''))
        normalized=where.replace('::text','').translate(str.maketrans('','','() '))
        if not existing['unique'] or existing['column_names']!=['tenant_id','novel_id'] or normalized!="status='active'":
            raise RuntimeError('Unexpected active plan index')
    else:
        op.create_index('uq_story_plan_active','story_plans',['tenant_id','novel_id'],unique=True,schema=schema,postgresql_where=sa.text("status = 'active'"),sqlite_where=sa.text("status = 'active'"))

def downgrade():
    schema='narrative' if op.get_bind().dialect.name=='postgresql' else None
    table='narrative.story_plans' if schema else 'story_plans'
    if op.get_bind().execute(sa.text(f"SELECT count(*) FROM {table} WHERE edit_metadata <> '{{}}'")).scalar():
        raise RuntimeError('Cannot discard plan-edit history during downgrade')
    op.drop_index('uq_story_plan_active',table_name='story_plans',schema=schema)
    op.drop_column('story_plans','edit_metadata',schema=schema)
