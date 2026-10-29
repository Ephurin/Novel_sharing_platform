from pathlib import Path
import os,sys,json,re
from sqlalchemy import create_engine,inspect,text
ROOT=Path.cwd();OUT=ROOT.parent/'p1-postmerge-79-private'
cfg=json.loads((OUT/'private-stack.json').read_text(encoding='utf-8'));v=cfg['values']
assert re.fullmatch(r'codex-p1-final-[a-f0-9]{10}',cfg['project'])
assert re.fullmatch(r'ephurin_test_p1_final_[a-f0-9]{10}',v['POSTGRES_DB'])
os.environ.update(LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake')
sys.path.insert(0,str(ROOT/'ai-service'))
from infrastructure.orm_models import Base
url='postgresql+psycopg://'+v['POSTGRES_USER']+':'+v['POSTGRES_PASSWORD']+'@127.0.0.1:'+v['WAVE1D_PG_PORT']+'/'+v['POSTGRES_DB']
engine=create_engine(url);ins=inspect(engine);missing=[];nulls=[];count=0
for table in Base.metadata.sorted_tables:
 if not ins.has_table(table.name,schema=table.schema):missing.append(table.fullname);continue
 actual={c['name']:c for c in ins.get_columns(table.name,schema=table.schema)}
 for c in table.columns:
  count+=1
  if c.name not in actual:missing.append(table.fullname+'.'+c.name)
  elif actual[c.name]['nullable']!=c.nullable:nulls.append(table.fullname+'.'+c.name)
with engine.connect() as c:
 head=c.execute(text('SELECT version_num FROM public.alembic_version')).scalar_one()
 stamps=[dict(x) for x in c.execute(text("SELECT table_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='narrative' AND table_name IN ('revision_provenances','entity_profile_audits') AND column_name='created_at' ORDER BY table_name")).mappings()]
 row_counts={table:dict(c.execute(text(f'SELECT count(*) AS total_rows,count(*) FILTER (WHERE created_at IS NULL) AS null_rows FROM narrative.{table}')).mappings().one()) for table in ['revision_provenances','entity_profile_audits']}
assert head=='0016_entity_profile_audit_timestamp' and not missing and not nulls
assert len(stamps)==2 and all(x['is_nullable']=='NO' and x['column_default']=='now()' for x in stamps)
assert all(x['null_rows']==0 for x in row_counts.values())
result={'head':head,'mapped_tables':len(Base.metadata.tables),'mapped_columns_checked':count,'missing':missing,'nullability_mismatches':nulls,'target_timestamp_columns':stamps,'version_column_width':ins.get_columns('alembic_version')[0]['type'].length,'isolated_counts':row_counts,'defaults_checked':'two timestamp columns only','global_constraints_indexes_equivalence_claimed':False}
assert result['version_column_width']>=len(head)
(OUT/'schema-readback.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
engine.dispose();print('PASS: fresh isolated schema head/nullability/defaults and mapped existence')
