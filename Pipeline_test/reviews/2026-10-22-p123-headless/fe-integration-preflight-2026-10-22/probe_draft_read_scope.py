import json,os,subprocess,sys,time
from pathlib import Path
root=Path.cwd();out=Path('C:/tmp/p123-fe-preflight-20261022');sys.path.insert(0,str(root/'Pipeline_test/tools'))
from run_p123_headless import Probe
m=json.loads((out/'environment-private.json').read_text()); env=os.environ.copy();env.update(json.loads((out/'browser-private.json').read_text()))
for k in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','LLM_API_KEY','AI_LLM_API_KEY']:env[k]=''
ready=out/'pipeline-ready-private.json';assert not ready.exists()
env.update({'ASTRA_READY_FILE':str(ready),'AI_SERVICE_URL':'http://127.0.0.1:9','NODE_ENV':'test'})
cmd=['node','--import','./node_modules/tsx/dist/loader.mjs',str(out/'pipeline_api_fixture.ts')]
with (out/'pipeline-api-fixture.txt').open('w',encoding='utf-8') as logs:
 child=subprocess.Popen(cmd,cwd=root/'backend',env=env,stdout=logs,stderr=logs)
 try:
  for _ in range(60):
   if ready.exists():break
   if child.poll() is not None:raise RuntimeError('FIXTURE_BOOT_FAILED')
   time.sleep(.3)
  config=json.loads(ready.read_text());p=Probe(root/m['env_file'],out/'read-authz-red');p.compose=['docker-compose']+p.compose[2:];p.base='http://127.0.0.1:'+str(config['port'])+'/api/v1'
  a,owner=p.account('readowner');b,foreign=p.account('readforeign');p.http.headers['Authorization']='Bearer '+a
  novel=p.api('POST','/novels',{'title':'ASTRA private draft access fixture','synopsis':'New isolated synthetic authorization fixture.'})
  body='ASTRA_PRIVATE_DRAFT_FIXTURE_DO_NOT_PUBLISH'
  chapter=p.api('POST','/novels/'+novel['novelId']+'/chapters',{'title':'Private unpublished draft','content':body})
  path='/chapters/'+chapter['chapterId'];owner_view=p.api('GET',path)
  p.stage='anonymous_private_draft_read';anonymous=p.api('GET',path,headers={'Authorization':''},expected=(200,))
  p.stage='foreign_author_private_draft_read';other=p.api('GET',path,headers={'Authorization':'Bearer '+b},expected=(200,))
  assert chapter['status']=='DRAFT'
  assert anonymous['draft']['content']==body and other['draft']['content']==body
  p.save('validation',{'executor':'ASTRA','source_sha':p.source_sha,'source_dirty':p.source_dirty,'finding':'CORE_DRAFT_READ_SCOPE','security_verdict':'RED_REPRODUCED','expected_anonymous':'401 or non-disclosing public DTO','actual_anonymous':200,'expected_foreign_author':403,'actual_foreign_author':200,'private_draft_leaked':True,'novel_id':novel['novelId'],'chapter_id':chapter['chapterId'],'owner_id':owner,'foreign_author_id':foreign,'chapter_status':'DRAFT','provider_calls':0,'production_patch':'NOT_IMPLEMENTED; separate Core owner authorization and GPT6 review required'})
  (out/'read-authz-probe-command.json').write_text(json.dumps({'command':cmd,'exit_code':0,'meaning':'0 means expected insecure condition reproduced, not security PASS'},indent=2)+'\n',encoding='utf-8')
  print('CORE_DRAFT_READ_SCOPE RED: anonymous 200 and foreign AUTHOR 200 disclose owned DRAFT content')
 finally:
  child.terminate();child.wait(timeout=15)
