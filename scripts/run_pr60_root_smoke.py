"""Fresh root-compose smoke. No shared ports, volumes, credentials or live providers."""
import argparse,json,os,secrets,socket,subprocess,time,uuid
from pathlib import Path
import httpx

def main():
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--allow-new-test-resources',action='store_true');a.add_argument('--scripts',nargs='+',default=['02a']);v=a.parse_args();assert v.allow_new_test_resources
 out=Path(v.output).resolve();out.mkdir(parents=True,exist_ok=False);run=uuid.uuid4().hex[:10];project='pr60-smoke-'+run;db='ephurin_test_pr60_'+run;secret=secrets.token_hex(24)
 def port():
  with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
 ports={s:port() for s in ['postgres','mongodb','ai-service','backend','web']};base=Path.cwd();override=out/'compose.isolated.yml'
 lines=['services:']
 for service,container_port in [('postgres',5432),('mongodb',27017),('ai-service',8000),('backend',4000),('web',80)]:
  lines += ['  '+service+':','    ports: !override',f'      - "127.0.0.1:{ports[service]}:{container_port}"']
  if service=='postgres':lines+=['    environment:',f'      POSTGRES_DB: {db}']
  if service=='ai-service':lines+=['    environment:',f'      DATABASE_URL: postgresql+psycopg://postgres:postgres@postgres:5432/{db}','      LLM_PROVIDER: fake','      LLM_BASE_URL: http://127.0.0.1:9/v1','      LLM_API_KEY: ""','      GEMINI_API_KEY: ""','      GOOGLE_API_KEY: ""','      OPENAI_API_KEY: ""','      EMBEDDING_PROVIDER: fake','      SEMANTIC_RETRIEVAL_ENABLED: "true"','      ACTIVE_EMBEDDING_VERSION: fake-embedding-768-v1']
  if service=='backend':lines+=['    environment:',f'      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/{db}',f'      MONGODB_URI: mongodb://mongodb:27017/{db}','      AI_LLM_BASE_URL: http://127.0.0.1:9/v1','      AI_LLM_API_KEY: ""']
 lines+=['networks:','  default:','    internal: true'];override.write_text('\n'.join(lines)+'\n',encoding='utf-8')
 env=os.environ.copy();env.update(LLM_PROVIDER='fake',PLATFORM_SERVICE_TOKEN=secret,AI_LLM_BASE_URL='http://127.0.0.1:9/v1',AI_LLM_API_KEY='',GEMINI_API_KEY='',GOOGLE_API_KEY='',OPENAI_API_KEY='',EMBEDDING_PROVIDER='fake',SEMANTIC_RETRIEVAL_ENABLED='true',ACTIVE_EMBEDDING_VERSION='fake-embedding-768-v1',EPHURIN_ALLOW_TEST_DB_MUTATIONS='1')
 compose=['docker','compose','-p',project,'-f',str(base/'docker-compose.yml'),'-f',str(override)];rows=[];sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 def command(label,cmd):
  r=subprocess.run(cmd,env=env,capture_output=True,encoding='utf-8',errors='replace');(out/(label+'.log')).write_text((r.stdout+r.stderr).replace(secret,'[REDACTED]'),encoding='utf-8');rows.append(dict(label=label,command=cmd,exit_code=r.returncode,tested_sha=sha));(out/'commands.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print(label,r.returncode,flush=True);return r.returncode
 try:
  assert command('up',compose+['up','-d','--build','postgres','mongodb','ai-service','backend','web'])==0
  health="import urllib.request; assert all(urllib.request.urlopen(url,timeout=3).status==200 for url in ['http://backend:4000/api/v1/health','http://localhost:8000/health','http://web/'])"
  for _ in range(60):
   r=subprocess.run(compose+['exec','-T','ai-service','python','-c',health],env=env,capture_output=True,timeout=15)
   if r.returncode==0:break
   time.sleep(2)
  else:raise RuntimeError('HEALTH_TIMEOUT')
  # Exact root-compose production service boundaries; fresh owned databases, fake-only runtime.
  containers=json.loads(subprocess.check_output(['docker','inspect',*[project+'-'+s+'-1' for s in ports]],text=True));safe=[]
  for c in containers:
   ce=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x);service=c['Config']['Labels']['com.docker.compose.service'];safe.append(dict(service=service,id=c['Id'],image=c['Image'],networks=list(c['NetworkSettings']['Networks'])))
   if service=='ai-service':assert ce['LLM_PROVIDER']=='fake' and ce['EMBEDDING_PROVIDER']=='fake' and not any(ce.get(k) for k in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','LLM_API_KEY'])
  nets=json.loads(subprocess.check_output(['docker','network','inspect',project+'_default'],text=True));assert all(n['Internal'] for n in nets)
  (out/'containment.json').write_text(json.dumps(dict(project=project,database=db,ports=ports,containers=safe,internal_networks=True,live_provider_calls=0),indent=2),encoding='utf-8')
  names={'01a':'run_ai_pipe_01a_production_persistence.py','02a':'run_ai_pipe_02a_idea_bootstrap.py','02b':'run_ai_pipe_02b_outline_planning.py','03a':'run_ai_pipe_03a_autonomous_controller.py'}
  assert command('copy-scripts',compose+['cp','scripts/.','ai-service:/tmp/p8-scripts'])==0
  for key in v.scripts:
   command(key,compose+['exec','-T','-e','GITHUB_SHA='+sha,'-e','GITHUB_HEAD_REF=codex/p1-canon-hitl-gate','ai-service','python','/tmp/p8-scripts/'+names[key],'--backend-url','http://backend:4000/api/v1','--ai-service-url','http://localhost:8000','--db-url','postgresql://postgres:postgres@postgres:5432/'+db,'--output','/tmp/'+key+'-evidence.json'])
   command(key+'-copy-evidence',compose+['cp','ai-service:/tmp/'+key+'-evidence.json',str(out/(key+'-evidence.json'))])
   verifier={'01a':('verify_ai_pipe_01_p1_closed_loop_evidence.py','--evidence'),'02a':('verify_ai_pipe_02a_idea_bootstrap_evidence.py','--evidence-file'),'02b':('verify_ai_pipe_02b_outline_planning_evidence.py','--evidence-file'),'03a':('verify_ai_pipe_03a_autonomous_controller_evidence.py','--evidence')}[key]
   command(key+'-verify',compose+['exec','-T','ai-service','python','/tmp/p8-scripts/'+verifier[0],verifier[1],'/tmp/'+key+'-evidence.json'])
  # Reproduce the current workflow's isolation failure separately from the repaired contract.
  native=['backend','npx','tsx','--test','--test-force-exit','src/modules/novels/p1-production-persistence.postgres.test.ts']
  command('CI-native-without-optin',compose+['exec','-T',*native])
  command('native-owned-optin',compose+['exec','-T','-e','EPHURIN_ALLOW_TEST_DB_MUTATIONS=1',*native])
 finally:
  command('service-logs',compose+['logs','--no-color','ai-service','backend']);command('stop',compose+['stop','-t','2'])
  (out/'validation.json').write_text(json.dumps(dict(tested_sha=sha,project=project,commands=rows,retained=True,live_provider_calls=0),indent=2),encoding='utf-8')
 raise SystemExit(int(any(row['exit_code'] != 0 for row in rows)))
if __name__=='__main__':main()
