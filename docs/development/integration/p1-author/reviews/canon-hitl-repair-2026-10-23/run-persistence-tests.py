"""Run from repository root. Creates new test-owned containers/volumes; never deletes history."""
import os, subprocess, json, uuid, time
from pathlib import Path
b=Path(__file__).resolve().parent
run=uuid.uuid4().hex[:12];db='ephurin_test_d1d2_'+run;prefix='canon-gate-'+run
secret=uuid.uuid4().hex;e=os.environ.copy()
def docker(*args):return subprocess.check_output(['docker',*args],text=True).strip()
resources=[];commands=[]
try:
 for kind,image,port,mount in [('pg','pgvector/pgvector:pg16',5432,'/var/lib/postgresql/data'),('mongo','mongo:7',27017,'/data/db')]:
  name=prefix+'-'+kind;volume=name+'-data';docker('volume','create','--label','purpose=canon-hitl-gate-test',volume)
  args=['run','-d','--pull=never','--name',name,'--label','purpose=canon-hitl-gate-test','-p',f'127.0.0.1::{port}','-v',volume+':'+mount]
  if kind=='pg':args+=['-e','POSTGRES_DB='+db,'-e','POSTGRES_USER=authz','-e','POSTGRES_PASSWORD='+secret]
  docker(*args,image);resources.append(dict(container=name,volume=volume,image=image));hostport=docker('port',name,str(port)).split(':')[-1]
  if kind=='pg':e['DATABASE_URL']=f'postgresql://authz:{secret}@127.0.0.1:{hostport}/{db}'
  else:e['MONGODB_URI']=f'mongodb://127.0.0.1:{hostport}/{db}'
 for _ in range(30):
  r=subprocess.run(['docker','exec',prefix+'-pg','pg_isready','-U','authz','-d',db],capture_output=True)
  if r.returncode==0:break
  time.sleep(1)
 e.update(JWT_ACCESS_SECRET='isolated-test-access-secret',JWT_REFRESH_SECRET='isolated-test-refresh-secret',EPHURIN_ALLOW_TEST_DB_MUTATIONS='1',AI_SERVICE_URL='http://127.0.0.1:9',AI_LLM_BASE_URL='http://127.0.0.1:9',AI_LLM_API_KEY='',GEMINI_API_KEY='',OPENAI_API_KEY='',INTERNAL_AUTHZ_LIVE_EVIDENCE=str(b/('live-'+run)))
 sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 for label,c in [('migrate',['node','--import','tsx','src/core/database/migrate.ts']),('migrate-ai',['python','-m','alembic','upgrade','head']),('integration-reconciliation',['node','--import','tsx','--test','src/modules/novels/mongo-reconciliation.live.test.ts']),('accept-contract',['node','--import','tsx','--test','src/modules/novels/accept-draft-contract.test.ts']),('outbox-postgres',['node','--import','tsx','--test','src/modules/novels/outbox.postgres.test.ts']),('accepted-persistence',['node','--import','tsx','--test','src/modules/novels/p1-production-persistence.postgres.test.ts'])]:
  command_cwd='ai-service' if label=='migrate-ai' else 'backend'
  command_env={**e,'DATABASE_URL':e['DATABASE_URL'].replace('postgresql://','postgresql+psycopg://')} if label=='migrate-ai' else e
  r=subprocess.run(c,cwd=command_cwd,env=command_env,capture_output=True,encoding='utf-8',errors='replace');(b/('persistence-'+label+'-'+run+'.txt')).write_text((r.stdout+r.stderr).replace(secret,'[REDACTED]'),encoding='utf-8');commands.append(dict(command=c,cwd=command_cwd,exit_code=r.returncode,tested_sha=sha));print(label,r.returncode,flush=True)
  if r.returncode and label.startswith('migrate'):break
finally:
 for resource in resources:subprocess.run(['docker','stop',resource['container']],capture_output=True)
 (b/('persistence-runtime-'+run+'.json')).write_text(json.dumps(dict(resources=resources,database=db,commands=commands,retained=True),indent=2),encoding='utf-8')
