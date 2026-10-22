import hashlib,json,secrets,socket,subprocess,time
from pathlib import Path
ROOT=Path.cwd(); OUT=Path('C:/tmp/p123-fe-preflight-20261022'); PR=Path('C:/tmp/novel-fe-pr55-preflight-20261022')
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
subprocess.run(['python','Pipeline_test/tools/prepare_p123_headless.py','--manifest',str(OUT/'environment-private.json')],check=True)
m=json.loads((OUT/'environment-private.json').read_text()); envpath=ROOT/m['env_file']
env=dict(x.split('=',1) for x in envpath.read_text().splitlines() if x and not x.startswith('#'))
project=m['project']; composite=OUT/'composite-sql'; composite.mkdir()
inventory=[]
for label,tree,ref in [('pipeline',ROOT,sha),('pr55',PR,'7b15c078c1ffe2fca96c4e66c96577e3ff007c3c')]:
 for f in sorted((tree/'backend/src/core/database/migrations').glob('*.sql')):
  data=f.read_bytes().replace(b'\r\n',b'\n'); target=composite/f.name
  digest=hashlib.sha256(data).hexdigest()
  if target.exists(): assert target.read_bytes()==data,'SAME_FILENAME_DIFFERENT_SQL:'+f.name
  else: target.write_bytes(data)
  inventory.append({'tree':label,'sha':ref,'path':'backend/src/core/database/migrations/'+f.name,'sha256_lf':digest})
(OUT/'migration-inventory.json').write_text(json.dumps({'source_sha':sha,'files':inventory,'combined_order':sorted(p.name for p in composite.glob('*.sql'))},indent=2)+'\n',encoding='utf-8')
ports=[]
for _ in range(2):
 s=socket.socket();s.bind(('127.0.0.1',0));ports.append(s.getsockname()[1]);s.close()
override=OUT/'ports-private.yml';override.write_text('services:\n  postgres:\n    ports: ["127.0.0.1:'+str(ports[0])+':5432"]\n  mongodb:\n    ports: ["127.0.0.1:'+str(ports[1])+':27017"]\n')
compose=['docker-compose','--env-file',str(envpath),'-f',str(ROOT/'Pipeline_test/tools/compose.p123-headless.yml'),'-f',str(override)]
records=[]
def run(label,args,stdin=None):
 r=subprocess.run(args,input=stdin,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=120)
 log=r.stdout+'\n'+r.stderr
 for k,v in env.items():
  if any(t in k for t in ['PASSWORD','SECRET','TOKEN','KEY']) and len(v)>8: log=log.replace(v,'[REDACTED]')
 (OUT/(label+'.txt')).write_text(log,encoding='utf-8')
 records.append({'label':label,'command':args,'exit_code':r.returncode})
 (OUT/'migration-commands.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
 if r.returncode: raise RuntimeError(label+':'+str(r.returncode)+':'+log[-1000:])
 return r.stdout
run('infra-up',compose+['up','-d','--wait','postgres','mongodb'])
private=OUT/'runtime-private.env'
private.write_text('\n'.join(['DATABASE_URL=postgresql://'+env['POSTGRES_USER']+':'+env['POSTGRES_PASSWORD']+'@postgres:5432/'+env['POSTGRES_DB'],'MONGODB_URI=mongodb://mongodb:27017/'+env['POSTGRES_DB'],'JWT_ACCESS_SECRET='+env['JWT_ACCESS_SECRET'],'JWT_REFRESH_SECRET='+env['JWT_REFRESH_SECRET'],'NODE_ENV=test','AI_SERVICE_URL=http://127.0.0.1:9','GEMINI_API_KEY=','GOOGLE_API_KEY=','OPENAI_API_KEY=','LLM_API_KEY=','AI_LLM_API_KEY='])+'\n')
node=['docker','run','--rm','--network',project+'_workers','--env-file',str(private),'--mount','type=bind,src='+str(composite)+',dst=/app/backend/src/core/database/migrations,readonly','p123-core-bce7da708c-backend','npm','run','db:migrate']
run('combined-sql-first',node);run('combined-sql-repeat',node)
ai_private=OUT/'ai-private.env'
ai_private.write_text('\n'.join(['DATABASE_URL=postgresql+psycopg://'+env['POSTGRES_USER']+':'+env['POSTGRES_PASSWORD']+'@postgres:5432/'+env['POSTGRES_DB'],'PERSISTENCE_BACKEND=postgres','GEMINI_API_KEY=','GOOGLE_API_KEY=','OPENAI_API_KEY=','LLM_API_KEY=','LLM_ENABLED=false','EMBEDDING_PROVIDER=none','SEMANTIC_RETRIEVAL_ENABLED=false'])+'\n')
ai=['docker','run','--rm','--network',project+'_workers','--env-file',str(ai_private),'p123-core-bce7da708c-ai-service','alembic']
run('ai-alembic-upgrade',ai+['upgrade','head']);run('ai-alembic-repeat',ai+['upgrade','head'])
query="select json_build_object('database',current_database(),'migrations',(select json_agg(migration_id order by migration_id) from schema_migrations),'alembic',(select json_agg(version_num) from alembic_version),'reports_guard',to_regclass('idx_reports_open_reporter_target'),'moderation_guard',to_regclass('idx_moderation_reviews_pending_target_source'),'tables',(select json_agg(table_schema||'.'||table_name order by table_schema,table_name) from information_schema.tables where table_schema in ('public','narrative')))"
raw=run('schema-readback',compose+['exec','-T','postgres','psql','-X','-U',env['POSTGRES_USER'],'-d',env['POSTGRES_DB'],'-At','-v','ON_ERROR_STOP=1','-c',query])
readback=json.loads(raw);assert len(readback['migrations'])==18;assert readback['alembic']==['0013_objective_intent'];assert readback['reports_guard'] and readback['moderation_guard'];assert 'public.moderation_evidence' in readback['tables']
(OUT/'migration-runtime.json').write_text(json.dumps({'executor':'ASTRA','source_sha':sha,'pr55_sha':'7b15c078c1ffe2fca96c4e66c96577e3ff007c3c','project':project,'runtime':'PASS_EMPTY_DB_SQL_AND_ALEMBIC_REPEAT','readback':readback,'no_business_data_seeded':True,'no_merge':True,'historical_volumes_removed':False,'mixed_code_runtime':'NOT_RUN','upgrade_existing_populated_db':'NOT_RUN','concurrent_runner':'NOT_RUN','downgrade':'NOT_RUN'},indent=2)+'\n',encoding='utf-8')
# Host fixture credentials remain private; never add these files to Git.
host={'DATABASE_URL':'postgresql://'+env['POSTGRES_USER']+':'+env['POSTGRES_PASSWORD']+'@127.0.0.1:'+str(ports[0])+'/'+env['POSTGRES_DB'],'MONGODB_URI':'mongodb://127.0.0.1:'+str(ports[1])+'/'+env['POSTGRES_DB'],'JWT_ACCESS_SECRET':env['JWT_ACCESS_SECRET'],'JWT_REFRESH_SECRET':env['JWT_REFRESH_SECRET']}
(OUT/'browser-private.json').write_text(json.dumps(host),encoding='utf-8')
print(json.dumps({'project':project,'migrations':len(readback['migrations']),'alembic':readback['alembic'],'runtime':'PASS'}))
