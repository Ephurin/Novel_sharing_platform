import os,sys,json,uuid,time,subprocess,pathlib,datetime
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT=pathlib.Path(__file__).parent/'p1-semantic-runtime';OUT.mkdir(exist_ok=True)
mode=sys.argv[1]; commands=[]
def run(args,env=None,cwd=None,expect=0,label=None):
 p=subprocess.run(args,cwd=cwd,env=env,capture_output=True,text=True,encoding='utf8',errors='replace')
 commands.append({'command':args,'cwd':str(cwd or pathlib.Path.cwd()),'exit_code':p.returncode,'expected_exit':expect,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 (OUT/(mode+'-commands.json')).write_text(json.dumps(commands,indent=2))
 (OUT/((label or mode+'-'+str(len(commands)))+'.log')).write_text(p.stdout+p.stderr,encoding='utf8')
 print((label or str(args))+' exit='+str(p.returncode),flush=True)
 if expect is not None and p.returncode!=expect: raise RuntimeError(p.stdout[-6000:]+p.stderr[-1500:])
 return p
if mode=='provision':
 tag='astra-p1-semantics-'+uuid.uuid4().hex[:8];db='ephurin_test_'+tag.replace('-','_');cfg={'database':db,'containers':[]}
 for svc,image,port,args in [('pg','pgvector/pgvector:pg16',5432,['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB='+db]),('mongo','mongo:7',27017,[])]:
  name=tag+'-'+svc
  run(['docker','run','-d','--name',name,'--label','astra.task=p1-entity-semantics','-p',f'127.0.0.1::{port}',*args,image]);cfg['containers'].append(name)
  cfg[svc+'_port']=run(['docker','port',name,str(port)]).stdout.strip().split(':')[-1]
  for attempt in range(60):
   probe=['docker','exec',name,'pg_isready','-U','postgres'] if svc=='pg' else ['docker','exec',name,'mongosh','--quiet','--eval','db.adminCommand({ping:1}).ok']
   if subprocess.run(probe,capture_output=True).returncode==0:break
   time.sleep(.5)
  else:raise RuntimeError('readiness timeout '+name)
 (OUT/'resources.json').write_text(json.dumps(cfg,indent=2));sys.exit()
cfg=json.loads((OUT/'resources.json').read_text());env=os.environ.copy()
pg=f"postgresql://postgres@127.0.0.1:{cfg['pg_port']}/{cfg['database']}"
env.update(NODE_ENV='test',DATABASE_URL=pg,TEST_DATABASE_URL=pg,MONGODB_URI=f"mongodb://127.0.0.1:{cfg['mongo_port']}/{cfg['database']}",JWT_ACCESS_SECRET='isolated-hitl-access',JWT_REFRESH_SECRET='isolated-hitl-refresh',PLATFORM_SERVICE_TOKEN='isolated-hitl-service',EPHURIN_ALLOW_TEST_DB_MUTATIONS='1',EXPECTED_TEST_DB_NAME=cfg['database'],LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',SERVICE_AUTH_DISABLED='false',AI_LLM_BASE_URL='http://127.0.0.1:9',ENTITY_CANDIDATE_VERIFICATION_ENABLED='true',NARRATIVE_REPOSITORY='postgres',SEMANTIC_MEMORY_ENABLED='false',SEMANTIC_RETRIEVAL_ENABLED='false')
for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:env[key]=''
if mode=='migrate':run(['npm.cmd','run','db:migrate'],env,ROOT/'backend',label='backend-migration');env.update(DATABASE_URL=pg.replace('postgresql:', 'postgresql+psycopg:'));run(['python','-m','alembic','upgrade','head'],env,ROOT/'ai-service',label='alembic-upgrade')
if mode.startswith('test-'):
 env.update(DATABASE_URL=pg.replace('postgresql:', 'postgresql+psycopg:'),TEST_DATABASE_URL=pg.replace('postgresql:', 'postgresql+psycopg:'),ENTITY_CANDIDATE_VERIFICATION_ENABLED='false',SERVICE_AUTH_DISABLED='true',NARRATIVE_REPOSITORY='json')
 if mode.startswith('test-accept'):
  sha=run(['git','rev-parse','HEAD'],cwd=ROOT).stdout.strip();dirty=run(['git','status','--porcelain'],cwd=ROOT).stdout.strip();assert not dirty,dirty
  (OUT/(mode+'-source.json')).write_text(json.dumps({'sha':sha,'dirty':False,'database':cfg['database'],'fake_only':True},indent=2))
 kind=mode.split('-')[-1]
 if kind=='semantics':run(['python','-m','pytest','--basetemp='+str(OUT/('pytest-'+mode)),'-q','-s','-m','postgres_integration','tests/test_p1_entity_semantics.py','tests/test_p1_memory_entity_hitl.py::test_parallel_continue_commits_one_proposal_set'],env,ROOT/'ai-service',expect=1 if 'red' in mode else 0,label=mode)
 if kind=='unit':run(['python','-m','pytest','--basetemp='+str(OUT/('pytest-'+mode)),'-q','-m','not postgres_integration'],env,ROOT/'ai-service',expect=0,label=mode)
 if kind=='hitl':run(['python','-m','pytest','--basetemp='+str(OUT/('pytest-'+mode)),'-q','-s','-m','postgres_integration','tests/test_p1_memory_entity_hitl.py','tests/test_p1_entity_semantics.py'],env,ROOT/'ai-service',expect=0,label=mode)
 if kind=='postgres':run(['python','-m','pytest','--basetemp='+str(OUT/('pytest-'+mode)),'-q','-m','postgres_integration','tests/test_postgres_integration.py','tests/test_semantic_memory_postgres_integration.py','tests/test_p8_json_postgres_cutover_integration.py'],env,ROOT/'ai-service',expect=0,label=mode)
 if kind=='backend':
  env.update(DATABASE_URL=pg)
  run(['npm.cmd','run','typecheck'],env,ROOT/'backend',expect=0,label=mode+'-typecheck')
  run(['node','--import','tsx','--test','src/modules/ai/ai-gateway.test.ts','src/modules/ai/p1-closed-loop-gateway.test.ts','src/modules/novels/chapter-revisions.test.ts','src/modules/novels/outbox.test.ts','src/jobs/outbox-processor.test.ts','src/modules/novels/p1-production-persistence.postgres.test.ts','src/modules/novels/internal-revision-authorization.test.ts'],env,ROOT/'backend',expect=0,label=mode)

if mode.endswith('live'):
 import socket,urllib.request
 def freeport():
  with socket.socket() as sock: sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
 aiport,platformport=freeport(),freeport()
 env.update(DATABASE_URL=pg.replace('postgresql:', 'postgresql+psycopg:'),TEST_DATABASE_URL=pg.replace('postgresql:', 'postgresql+psycopg:'),NARRATIVE_REPOSITORY='postgres',SERVICE_AUTH_DISABLED='false',ENTITY_CANDIDATE_VERIFICATION_ENABLED='true',PLATFORM_API_BASE_URL=f'http://127.0.0.1:{platformport}',AI_SERVICE_URL=f'http://127.0.0.1:{aiport}',HITL_PLATFORM_PORT=str(platformport),TEST_HITL_LIVE='1')
 with open(OUT/(mode+'-ai.log'),'w',encoding='utf8') as log:
  ai=subprocess.Popen(['python','-m','uvicorn','main:app','--host','127.0.0.1','--port',str(aiport)],env=env,cwd=ROOT/'ai-service',stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  try:
   for i in range(100):
    try:
     urllib.request.urlopen(f'http://127.0.0.1:{aiport}/health',timeout=2);break
    except Exception:
     if ai.poll() is not None:raise RuntimeError('AI startup failed; inspect log')
     time.sleep(.3)
   else:raise RuntimeError('AI startup timed out')
   env.update(DATABASE_URL=pg)
   run(['node','--import','tsx','--test','src/modules/ai/p1-memory-entity.live.test.ts'],env,ROOT/'backend',expect=0,label=mode)
  finally:ai.terminate();ai.wait(timeout=15)
