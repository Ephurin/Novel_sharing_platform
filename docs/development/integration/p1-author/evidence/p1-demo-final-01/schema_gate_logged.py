from pathlib import Path
import json, os, sys, uuid
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from alembic import command
from alembic.config import Config
ROOT=Path.cwd();OUT=ROOT.parent/'demo-final-01-private';v=json.loads((OUT/'private-stack.json').read_text())['values']
url='postgresql+psycopg://'+v['POSTGRES_USER']+':'+v['POSTGRES_PASSWORD']+'@127.0.0.1:'+v['WAVE1D_PG_PORT']+'/'+v['POSTGRES_DB']
sys.path.insert(0,str(ROOT/'ai-service'))
from infrastructure.orm_models import Base
from domain.entity_profile import EntityProfilePatch
from tests.test_entity_profile_audit_timestamp_migration import seed,audit_rows,digest,objects
HEAD='0016_entity_profile_audit_timestamp';results={};created=[];admin=create_engine(url,isolation_level='AUTOCOMMIT')
def migrate(target,action,revision):
 os.environ['DATABASE_URL']=target
 cfg=Config(str(ROOT/'ai-service/alembic.ini'));cfg.set_main_option('script_location',str(ROOT/'ai-service/migrations'));cfg.set_main_option('sqlalchemy.url',target);getattr(command,action)(cfg,revision)
def owned():
 name='p1_final_schema_'+uuid.uuid4().hex
 with admin.connect() as c:c.execute(text(f'CREATE DATABASE "{name}"'))
 created.append(name);return make_url(url).set(database=name).render_as_string(hide_password=False)
def historical14(target):
 migrate(target,'upgrade','0014_entity_profiles');migrate(target,'downgrade','0004_writing_generations');migrate(target,'upgrade','0014_entity_profiles')
def snapshot(e):
 # Only hashes/counts and timestamp scalars leave memory, never audit rows.
 with e.connect() as c:
  profile=c.execute(text('SELECT to_jsonb(e) FROM narrative.entities e ORDER BY id')).scalars().all()
  provenance=c.execute(text('SELECT to_jsonb(p) FROM narrative.revision_provenances p ORDER BY id')).scalars().all()
  stamps=[str(x) for x in c.execute(text('SELECT created_at FROM narrative.entity_profile_audits ORDER BY id')).scalars()]
 audit=audit_rows(e)
 return {'audit_sha256':digest(audit),'audit_count':len(audit),'audit_timestamps':stamps,'profile_sha256':digest(profile),'provenance_sha256':digest(provenance),'profile_count':len(profile),'provenance_count':len(provenance)}
def schema(e):
 missing=[];nulls=[];ins=inspect(e);n=0
 for t in Base.metadata.sorted_tables:
  if not ins.has_table(t.name,schema=t.schema):missing.append(t.fullname);continue
  actual={c['name']:c for c in ins.get_columns(t.name,schema=t.schema)}
  for c in t.columns:
   n+=1
   if c.name not in actual:missing.append(t.fullname+'.'+c.name)
   elif actual[c.name]['nullable']!=c.nullable:nulls.append(t.fullname+'.'+c.name)
 with e.connect() as c:
  head=c.execute(text('SELECT version_num FROM public.alembic_version')).scalar_one()
  timestamps=[dict(r) for r in c.execute(text("SELECT table_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='narrative' AND table_name IN ('revision_provenances','entity_profile_audits') AND column_name='created_at' ORDER BY table_name")).mappings()]
 assert head==HEAD and not missing and not nulls
 assert len(timestamps)==2 and all(r['is_nullable']=='NO' and r['column_default']=='now()' for r in timestamps)
 return {'head':head,'mapped_columns_checked':n,'missing':missing,'nullability_mismatches':nulls,'timestamps':timestamps,'version_width':ins.get_columns('alembic_version')[0]['type'].length,'defaults_scope':'two timestamps only','constraints_indexes_scope':'audit objects only; not global equivalence'}
def save():(OUT/'schema-gate-rerun.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
try:
 fresh=owned();migrate(fresh,'upgrade',HEAD);e=create_engine(fresh);results['A_fresh']=schema(e);e.dispose();save();print('A fresh PASS',flush=True)
 target=owned();historical14(target);e=create_engine(target);repo,actor,novel,eid=seed(e);current=repo.get_entity_profile(novel,eid)
 patch=EntityProfilePatch(expected_version=current['version'],expected_brain_version=current['brain_version'],appearance='Áo choàng bạc',personality='Điềm tĩnh',background='Tu sĩ vùng núi',effective_from_chapter=3)
 repo.update_entity_profile(novel,eid,patch,actor_id=actor,request_key='schema-canon');repo.record_revision_provenance(novel,'schema-chapter','schema-revision',1)
 before=snapshot(e);constraints=objects(e);migrate(target,'upgrade',HEAD)
 assert snapshot(e)==before and objects(e)==constraints
 current=repo.get_entity_profile(novel,eid);patch=EntityProfilePatch(expected_version=current['version'],expected_brain_version=current['brain_version'],author_notes='private schema after upgrade')
 saved=repo.update_entity_profile(novel,eid,patch,actor_id=actor,request_key='post-upgrade');count=len(audit_rows(e));retry=repo.update_entity_profile(novel,eid,patch,actor_id=actor,request_key='post-upgrade')
 assert digest(saved)==digest(retry) and len(audit_rows(e))==count
 results['B_existing']={'schema':schema(e),'before_hashes_counts_timestamps':before,'migration_preserves_data':True,'audit_objects_unchanged':True,'post_upgrade_retry_no_duplicate':True};e.dispose();save();print('B existing PASS',flush=True)
 for table,previous in [('revision_provenances','0014_entity_profiles'),('entity_profile_audits','0015_provenance_timestamp')]:
  target=owned();historical14(target);e=create_engine(target);repo,actor,novel,eid=seed(e);repo.record_revision_provenance(novel,'null-chapter','null-revision',1)
  if previous.endswith('timestamp'):migrate(target,'upgrade',previous)
  with e.begin() as c:c.execute(text(f'UPDATE narrative.{table} SET created_at=NULL'))
  before=snapshot(e)
  try:migrate(target,'upgrade',HEAD)
  except RuntimeError as exc:
   assert 'DATA_REPAIR_DECISION_REQUIRED' in str(exc);message=str(exc)
  else:raise AssertionError('NULL migration unexpectedly succeeded')
  assert snapshot(e)==before
  with e.connect() as c:
   actual=c.execute(text('SELECT version_num FROM public.alembic_version')).scalar_one();count=c.execute(text(f'SELECT count(*) FROM narrative.{table} WHERE created_at IS NULL')).scalar_one()
  assert actual==previous and count>0
  assert next(c for c in inspect(e).get_columns(table,schema='narrative') if c['name']=='created_at')['nullable']
  results['NULL_'+table]={'expected_fail_closed':True,'error':message,'null_rows':count,'unchanged_data':True,'unchanged_head':actual};e.dispose();save();print('NULL '+table+' expected failure PASS',flush=True)
finally:
 for name in created:
  with admin.connect() as c:c.execute(text(f'DROP DATABASE "{name}"'))
 admin.dispose()
