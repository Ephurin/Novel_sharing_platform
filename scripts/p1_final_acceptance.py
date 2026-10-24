"""Fresh P1 acceptance stack; only task-owned resources, sanitized append-only commands."""
import pathlib,json,subprocess,secrets,socket,sys,datetime,os,re,ipaddress,time,argparse,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage')
parser.add_argument('--output',required=True,help='Fresh task-owned directory OUTSIDE the checkout; contains private test credentials.')
options=parser.parse_args();MODE=options.stage
OUT=pathlib.Path(options.output).resolve()
assert not OUT.is_relative_to(ROOT),'Private credentials/evidence must remain outside the checkout'
PRIVATE=OUT/'private-stack.json'
NPM='npm.cmd' if os.name=='nt' else 'npm'
NPX='npx.cmd' if os.name=='nt' else 'npx'
sys.stdout.reconfigure(encoding='utf8')
OUT.mkdir(exist_ok=True)
cfg=json.loads(PRIVATE.read_text()) if PRIVATE.exists() else {}
def scrub(text):
 for k,v in cfg.get('values',{}).items():
  if any(s in k for s in ('PASSWORD','SECRET','TOKEN','KEY')):text=text.replace(v,'[REDACTED]')
 text=re.sub(r'Bearer\s+[^\s"\']+','Bearer [REDACTED]',text)
 text=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]',text)
 return text
def run(label,args,*,cwd=ROOT,stdin=None,env=None,timeout=900):
 if env is None:
  env={**os.environ,**cfg.get('values',{})} # Own values override host Compose interpolation.
 def source():
  def git(*args):
   return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
  return {'sha':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),'dirty':git('status','--porcelain')}
 before=source()
 original=label;attempt=1
 while (OUT/(label+'.log')).exists():
  attempt+=1;label=original+'-attempt'+str(attempt)
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();print('RUN',label,flush=True)
 p=subprocess.run(args,cwd=cwd,input=stdin,env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=timeout)
 (OUT/(label+'.log')).write_text(scrub(p.stdout+p.stderr),encoding='utf8')
 entry={'label':label,'log':label+'.log','command':args,'cwd':str(cwd),'source_before':before,'source_after':source(),'start_utc':started,'end_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':p.returncode,'stdin_recorded':False}
 with (OUT/'commands-and-exits.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(entry)+'\n')
 print(label,'exit',p.returncode,flush=True)
 if p.returncode:raise RuntimeError(scrub(p.stderr[-1800:]))
 return p.stdout
if MODE=='provision':
 assert not PRIVATE.exists(),'Never overwrite an old environment'
 suffix=secrets.token_hex(5);project='codex-p1-final-'+suffix
 values={'WAVE1D_PROJECT':project,'POSTGRES_DB':'ephurin_test_p1_final_'+suffix,'POSTGRES_USER':'p123',
  **{k:secrets.token_hex(24) for k in ['POSTGRES_PASSWORD','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','PLATFORM_SERVICE_TOKEN','AI_WORKER_TOKEN','BACKEND_WORKER_TOKEN','OFFLINE_UPSTREAM_KEY']},
  'WAVE1D_AUTHOR_EMAIL':project+'@example.invalid','WAVE1D_AUTHOR_USERNAME':project.replace('-','_'),
  'WAVE1D_AUTHOR_PASSWORD':'Core!'+secrets.token_hex(20)}
 allocated=[]
 try:
  for name in ['WEB','BACKEND','AI','GATE','FAKE','PG','MONGO']:
   s=socket.socket();s.bind(('127.0.0.1',0));allocated.append(s);values['WAVE1D_'+name+'_PORT']=str(s.getsockname()[1])
 finally:
  for s in allocated:s.close()
 ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
 networks=json.loads(subprocess.check_output(['docker','network','inspect',*ids],text=True))
 used=[ipaddress.ip_network(i['Subnet']) for n in networks for i in (n.get('IPAM',{}).get('Config') or []) if i.get('Subnet')]
 candidates=[ipaddress.ip_network(f'172.29.{i}.0/24') for i in range(16,250)]
 available=[n for n in candidates if all(n.version!=u.version or not n.overlaps(u) for u in used)]
 assert len(available)>=3
 for key,net in zip(['P123_WORKER_SUBNET','P123_UPSTREAM_SUBNET','P123_EDGE_SUBNET'],secrets.SystemRandom().sample(available,3)):values[key]=str(net)
 env_file=OUT/('.env.'+project)
 env_file.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n',encoding='utf8')
 override=OUT/'compose.override.private.json'
 override.write_text(json.dumps({'services':{
  'postgres':{'ports':[f"127.0.0.1:{values['WAVE1D_PG_PORT']}:5432"]},
  'mongodb':{'ports':[f"127.0.0.1:{values['WAVE1D_MONGO_PORT']}:27017"]},
  'backend':{'ports':[f"127.0.0.1:{values['WAVE1D_BACKEND_PORT']}:4000"],
    'environment':{'EPHURIN_ALLOW_TEST_DB_MUTATIONS':'1','EXPECTED_TEST_DB_NAME':values['POSTGRES_DB']}}}},indent=2))
 cfg={'project':project,'values':values,'env_file':str(env_file),'override':str(override)};PRIVATE.write_text(json.dumps(cfg,indent=2))
 (OUT/'environment.json').write_text(scrub(json.dumps({'project':project,'private_env_file':env_file.name,'values':values,'fresh_resources_only':True,'fake_providers_only':True},indent=2)))
 print('Provisioned unique project',project);sys.exit()
assert cfg['project'].startswith('codex-p1-final-')
compose=(['docker-compose'] if shutil.which('docker-compose') else ['docker','compose'])+['--env-file',cfg['env_file'],'-f',str(ROOT/'Pipeline_test/tools/compose.p123-p3.yml'),'-f',cfg['override']]
if MODE=='bridge-config':
 v=cfg['values']
 for key in ['PG','MONGO','BACKEND']:
  with socket.socket() as s:
   s.bind(('127.0.0.1',0));v['WAVE1D_'+key+'_PORT']=str(s.getsockname()[1])
 pathlib.Path(cfg['env_file']).write_text('\n'.join(k+'='+val for k,val in v.items())+'\n',encoding='utf8')
 pathlib.Path(cfg['override']).write_text(json.dumps({'services':{'acceptance-bridge':{
  'image':'python:3.12-slim','command':['python','/tools/p1_acceptance_tcp_bridge.py'],
  'volumes':[str(ROOT/'Pipeline_test/tools').replace('\\','/')+':/tools:ro'],
  'networks':['workers','headless-edge'],'read_only':True,'cap_drop':['ALL'],
  'security_opt':['no-new-privileges:true'],
  'ports':[f"127.0.0.1:{v['WAVE1D_PG_PORT']}:15432",f"127.0.0.1:{v['WAVE1D_MONGO_PORT']}:17017",f"127.0.0.1:{v['WAVE1D_BACKEND_PORT']}:14000"],
  'depends_on':{'postgres':{'condition':'service_healthy'},'mongodb':{'condition':'service_healthy'}}}}},indent=2))
 PRIVATE.write_text(json.dumps(cfg,indent=2))
 (OUT/'environment-bridge.json').write_text(scrub(json.dumps({'project':cfg['project'],'values':v,'bridge_destinations':'fixed postgres/mongodb/backend only; providers have no edge network'},indent=2)))
 print('Configured new fixed-destination bridge ports')
if MODE=='db-up':
 run('compose-config',compose+['config','--format','json'])
 run('compose-db-up',compose+['up','-d','--wait','postgres','mongodb','acceptance-bridge'])
 v=cfg['values'];env=os.environ.copy();pg=f"postgresql://{v['POSTGRES_USER']}:{v['POSTGRES_PASSWORD']}@127.0.0.1:{v['WAVE1D_PG_PORT']}/{v['POSTGRES_DB']}"
 env.update(v)
 env.update(NODE_ENV='test',MONGODB_URI=f"mongodb://127.0.0.1:{v['WAVE1D_MONGO_PORT']}/{v['POSTGRES_DB']}",DATABASE_URL=pg,TEST_DATABASE_URL=pg,EPHURIN_ALLOW_TEST_DB_MUTATIONS='1',EXPECTED_TEST_DB_NAME=v['POSTGRES_DB'])
 run('backend-migrations',[NPM,'run','db:migrate'],cwd=ROOT/'backend',env=env)
 env.update(DATABASE_URL=pg.replace('postgresql:','postgresql+psycopg:'))
 run('ai-alembic-migrations',['python','-m','alembic','upgrade','head'],cwd=ROOT/'ai-service',env=env)
if MODE=='up':
 run('budget-initialize',compose+['--profile','initialize','run','--rm','budget-init'])
 run('compose-stack-up',compose+['up','-d','--build','postgres','mongodb','fake-upstream','budget-gateway','ai-service','backend'])
if MODE=='rebuild-app':
 run('compose-owned-app-rebuild',compose+['up','-d','--build','--no-deps','ai-service','backend'])
if MODE=='status':
 raw=run('compose-status',compose+['ps','--format','json'])
 print(raw)
if MODE=='fe19-tests':
 v=cfg['values'];env=os.environ.copy();env.update(v)
 pg=f"postgresql+psycopg://{v['POSTGRES_USER']}:{v['POSTGRES_PASSWORD']}@127.0.0.1:{v['WAVE1D_PG_PORT']}/{v['POSTGRES_DB']}"
 env.update(DATABASE_URL=pg,TEST_DATABASE_URL=pg,LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',AI_LLM_BASE_URL='http://127.0.0.1:9',
  NARRATIVE_REPOSITORY='json',SERVICE_AUTH_DISABLED='true',ENTITY_CANDIDATE_VERIFICATION_ENABLED='false',PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
 for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:env[key]=''
 for marker,label in [('not postgres_integration','fe19-unit'),('postgres_integration','fe19-postgres')]:
  run(label,['python','-m','pytest','-q','-s','-m',marker,'tests/test_p1_fe_final_contracts.py'],cwd=ROOT/'ai-service',env=env)
if MODE in ('fe19-known-red','fe19-known-green'):
 env=os.environ.copy();env.update(LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',SERVICE_AUTH_DISABLED='true',NARRATIVE_REPOSITORY='json',PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
 for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:env[key]=''
 run(MODE,['python','-m','pytest','-q','tests/test_p1_fe_final_contracts.py','-k','known_inventory'],cwd=ROOT/'ai-service',env=env)
if MODE in ('consistency-red','consistency-green'):
 v=cfg['values'];env=os.environ.copy();env.update(LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',SERVICE_AUTH_DISABLED='true',NARRATIVE_REPOSITORY='json',PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
 env.update(TEST_DATABASE_URL=f"postgresql+psycopg://{v['POSTGRES_USER']}:{v['POSTGRES_PASSWORD']}@127.0.0.1:{v['WAVE1D_PG_PORT']}/{cfg['regression_database']}")
 for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:env[key]=''
 run(MODE,['python','-m','pytest','-o','addopts=','-q','-s','tests/test_p1_fe_final_contracts.py','-k','consistency_reads'],cwd=ROOT/'ai-service',env=env)
if MODE=='legacy-consistency':
 env=os.environ.copy();env.update(LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',SERVICE_AUTH_DISABLED='true',NARRATIVE_REPOSITORY='json',PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
 run(MODE,['python','-m','pytest','-q','tests/test_author_operation_consistency.py'],cwd=ROOT/'ai-service',env=env)
if MODE=='web-build':
 env={k:v for k,v in os.environ.items() if not k.startswith('VITE_')};env.update(VITE_API_BASE_URL='/api/v1')
 run('web-typecheck',[NPM,'run','typecheck'],cwd=ROOT/'web',env=env)
 run('web-production-build',[NPM,'run','build'],cwd=ROOT/'web',env=env)
if MODE.startswith('browser-'):
 env=os.environ.copy()
 env.update(P1_ACCEPTANCE_CONFIG=str(PRIVATE),P1_EVIDENCE_DIR=str(OUT/MODE),PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
 run(MODE,['node','--test','tests/p1-final-acceptance.browser.test.mjs'],cwd=ROOT/'web',env=env,timeout=1000)
if MODE in ('web-units','web-mounted'):
 env=os.environ.copy();env.update(cfg['values'])
 env.update(PYTHONUTF8='1',PYTHONIOENCODING='utf-8',PLAYWRIGHT_CHANNEL='msedge',RUN_DRAFT_BROWSER_TESTS='1',NODE_ENV='test',
  DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:9/ephurin_test_p1_final_unit',MONGODB_URI='mongodb://127.0.0.1:9/ephurin_test_p1_final_unit')
 if MODE=='web-units':
  files=sorted(str(p.relative_to(ROOT/'web')) for p in (ROOT/'web/tests').glob('*.test.ts'))
  files+=['tests/color-scheme.test.mjs','tests/project-sorting.test.mjs','tests/wallet-earnings.test.mjs']
  run(MODE,[NPX,'tsx','--test',*files],cwd=ROOT/'web',env=env)
 else:
  import psycopg
  from psycopg import sql
  v=cfg['values'];db=cfg.get('regression_database')
  if not db:
   db='ephurin_test_p1_final_regression_'+secrets.token_hex(5)
   with psycopg.connect(host='127.0.0.1',port=int(v['WAVE1D_PG_PORT']),user=v['POSTGRES_USER'],password=v['POSTGRES_PASSWORD'],dbname=v['POSTGRES_DB'],autocommit=True) as conn:
    conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db)))
   cfg['regression_database']=db;PRIVATE.write_text(json.dumps(cfg,indent=2))
  env.update(DATABASE_URL=f"postgresql://{v['POSTGRES_USER']}:{v['POSTGRES_PASSWORD']}@127.0.0.1:{v['WAVE1D_PG_PORT']}/{db}",
   MONGODB_URI=f"mongodb://127.0.0.1:{v['WAVE1D_MONGO_PORT']}/{db}",P1_EVIDENCE_DIR=str(OUT/('web-mounted-'+secrets.token_hex(4))),
   EPHURIN_ALLOW_TEST_DB_MUTATIONS='1',EXPECTED_TEST_DB_NAME=db)
  run(MODE,['node','--test','--test-concurrency=1','tests/api-client-security.browser.test.mjs','tests/author-ide.browser.test.mjs','tests/draft-persistence.browser.test.mjs','tests/p1-hitl-interactions.browser.test.mjs'],cwd=ROOT/'web',env=env)
