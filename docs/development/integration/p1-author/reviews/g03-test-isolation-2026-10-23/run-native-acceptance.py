"""Run from repository root. Creates new test-owned containers/volumes; never deletes history."""
import os, subprocess, json, uuid, time, sys, tempfile
from pathlib import Path
b=Path(sys.argv[1]).resolve();b.mkdir(parents=True,exist_ok=False)
run=uuid.uuid4().hex[:12];db='ephurin_test_d1d2_'+run;prefix='p1-final-acceptance-'+run
secret=uuid.uuid4().hex;e=os.environ.copy()
def docker(*args):return subprocess.check_output(['docker',*args],text=True).strip()
resources=[];commands=[]
try:
 for kind,image,port,mount in [('pg','pgvector/pgvector:pg16',5432,'/var/lib/postgresql/data'),('mongo','mongo:7',27017,'/data/db')]:
  name=prefix+'-'+kind;volume=name+'-data';docker('volume','create','--label','purpose=p1-core-canon-combined-test',volume)
  args=['run','-d','--pull=never','--name',name,'--label','purpose=p1-core-canon-combined-test','-p',f'127.0.0.1::{port}','-v',volume+':'+mount]
  if kind=='pg':args+=['-e','POSTGRES_DB='+db,'-e','POSTGRES_USER=authz','-e','POSTGRES_PASSWORD='+secret]
  docker(*args,image);resources.append(dict(container=name,volume=volume,image=image));hostport=docker('port',name,str(port)).split(':')[-1]
  if kind=='pg':e['DATABASE_URL']=f'postgresql://authz:{secret}@127.0.0.1:{hostport}/{db}'
  else:e['MONGODB_URI']=f'mongodb://127.0.0.1:{hostport}/{db}'
 for _ in range(30):
  r=subprocess.run(['docker','exec',prefix+'-pg','pg_isready','-U','authz','-d',db],capture_output=True)
  if r.returncode==0:break
  time.sleep(1)
 e.update(JWT_ACCESS_SECRET='isolated-test-access-secret',JWT_REFRESH_SECRET='isolated-test-refresh-secret',EPHURIN_ALLOW_TEST_DB_MUTATIONS='1',AI_SERVICE_URL='http://127.0.0.1:9',AI_LLM_BASE_URL='http://127.0.0.1:9',AI_LLM_API_KEY='',GEMINI_API_KEY='',OPENAI_API_KEY='',INTERNAL_AUTHZ_LIVE_EVIDENCE=str(b/('live-'+run)))
 e['TEST_DATABASE_URL']=e['DATABASE_URL'].replace('postgresql://','postgresql+psycopg://')
 e.update(EXPECTED_TEST_DB_NAME=db,LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',GOOGLE_API_KEY='',ACCEPTANCE_DURABLE_LOG=str(b/'durable-query-log.jsonl'))
 sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 for label,c in [('migrate',['node','--import','tsx','src/core/database/migrate.ts']),('migrate-ai',['python','-m','alembic','upgrade','head']),('migrate-replay',['node','--import','tsx','src/core/database/migrate.ts']),('alembic-rollback',['python','-m','alembic','downgrade','-1']),('alembic-reupgrade',['python','-m','alembic','upgrade','head']),('guard-lifecycle',['node','--import','tsx','--test','src/core/database/test-db-guard-lifecycle.test.ts']),('fixture-resilience',['node','--import','tsx','--test','src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts']),('reconciliation',['node','--import','tsx','--test','src/modules/novels/core-reconciliation.live.test.ts']),('integration-reconciliation',['node','--import','tsx','--test','src/modules/novels/mongo-reconciliation.live.test.ts']),('accept-contract',['node','--import','tsx','--test','src/modules/novels/accept-draft-contract.test.ts']),('outbox-postgres',['node','--import','tsx','--test','src/modules/novels/outbox.postgres.test.ts']),('accepted-persistence',['node','--import','tsx','--test','src/modules/novels/p1-production-persistence.postgres.test.ts']),('P7-pgvector',['python','-m','pytest','-o','addopts=','-q','-m','postgres_integration','--basetemp',str(Path(tempfile.gettempdir())/('combined-pg-'+uuid.uuid4().hex)),'tests'])]:
  command_cwd='ai-service' if label in ['migrate-ai','alembic-rollback','alembic-reupgrade','P7-pgvector'] else 'backend'
  command_env={**e,'DATABASE_URL':e['DATABASE_URL'].replace('postgresql://','postgresql+psycopg://')} if label in ['migrate-ai','alembic-rollback','alembic-reupgrade','P7-pgvector'] else e
  if command_cwd=='backend' and '--test' in c: c=c[:1]+['--import',(Path(__file__).resolve().parent/'observe-durable.mjs').as_uri()]+c[1:]
  command_env={**command_env,'ACCEPTANCE_SUITE_NAME':label}
  r=subprocess.run(c,cwd=command_cwd,env=command_env,capture_output=True,encoding='utf-8',errors='replace');(b/('persistence-'+label+'-'+run+'.txt')).write_text((r.stdout+r.stderr).replace(secret,'[REDACTED]'),encoding='utf-8');commands.append(dict(command=c,cwd=command_cwd,exit_code=r.returncode,tested_sha=sha));print(label,r.returncode,flush=True)
  # Counts/schema are read back after every suite on the same fresh owned resources.
  pg_query="select json_build_object('database',current_database(),'users',(select count(*) from users),'novels',(select count(*) from novels),'chapters',(select count(*) from chapters),'revisions',(select count(*) from chapter_revisions),'outbox',(select count(*) from revision_outbox_events),'migrations',(select json_agg(migration_id order by migration_id) from schema_migrations))"
  pg=subprocess.run(['docker','exec',prefix+'-pg','psql','-U','authz','-d',db,'-At','-c',pg_query],capture_output=True,encoding='utf-8')
  mo=subprocess.run(['docker','exec',prefix+'-mongo','mongosh','--quiet','--eval','JSON.stringify({database:'+json.dumps(db)+',drafts:db.getSiblingDB('+json.dumps(db)+').draft_chapters.countDocuments({})})'],capture_output=True,encoding='utf-8')
  (b/('readback-'+label+'.json')).write_text(json.dumps(dict(PG_exit=pg.returncode,PG=json.loads(pg.stdout) if pg.returncode==0 else pg.stderr,Mongo_exit=mo.returncode,Mongo=json.loads(mo.stdout) if mo.returncode==0 else mo.stderr),indent=2),encoding='utf-8')
  assert pg.returncode==0 and mo.returncode==0, 'Durable readback failed'
  assert all(json.loads(pg.stdout)[k]==0 for k in ['users','novels','chapters','revisions','outbox']), 'Residual PG fixtures after '+label
  assert json.loads(mo.stdout)['drafts']==0, 'Residual Mongo fixtures after '+label
  if r.returncode and label.startswith('migrate'):break
finally:
 for resource in resources:subprocess.run(['docker','stop',resource['container']],capture_output=True)
 (b/('persistence-runtime-'+run+'.json')).write_text(json.dumps(dict(resources=resources,database=db,commands=commands,retained=True),indent=2),encoding='utf-8')

raise SystemExit(int(any(c['exit_code'] for c in commands)))
