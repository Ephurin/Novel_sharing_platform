import json,os,subprocess,sys,time
from pathlib import Path
root=Path.cwd();out=Path('C:/tmp/p123-fe-preflight-20261022');sys.path.insert(0,str(root/'Pipeline_test/tools'))
from run_p123_headless import Probe
m=json.loads((out/'environment-private.json').read_text()); env=os.environ.copy();env.update(json.loads((out/'browser-private.json').read_text()))
for k in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','LLM_API_KEY','AI_LLM_API_KEY']:env[k]=''
ready=out/'pr55-ready-private.json';assert not ready.exists()
env.update({'ASTRA_READY_FILE':str(ready),'AI_SERVICE_URL':'http://127.0.0.1:9','NODE_ENV':'test'})
cmd=['node','--import','./node_modules/tsx/dist/loader.mjs',str(out/'pr55_api_fixture.ts')]
with (out/'pr55-api-fixture.txt').open('w',encoding='utf-8') as logs:
 child=subprocess.Popen(cmd,cwd=root/'backend',env=env,stdout=logs,stderr=logs)
 try:
  for _ in range(60):
   if ready.exists():break
   if child.poll() is not None:raise RuntimeError('FIXTURE_BOOT_FAILED')
   time.sleep(.3)
  config=json.loads(ready.read_text());p=Probe(root/m['env_file'],out/'pr55-api-contract');p.compose=['docker-compose']+p.compose[2:];p.base='http://127.0.0.1:'+str(config['port'])+'/api/v1'
  a,owner=p.account('readowner');b,foreign=p.account('readforeign');p.http.headers['Authorization']='Bearer '+a
  novel=p.api('POST','/novels',{'title':'ASTRA private draft access fixture','synopsis':'New isolated synthetic authorization fixture.'})
  body='ASTRA_PRIVATE_DRAFT_FIXTURE_DO_NOT_PUBLISH'
  chapter=p.api('POST','/novels/'+novel['novelId']+'/chapters',{'title':'Private unpublished draft','content':body})
  path='/chapters/'+chapter['chapterId'];owner_view=p.api('GET',path)
  p.stage='anonymous_private_draft_read';anonymous=p.api('GET',path,headers={'Authorization':''},expected=(401,))
  p.stage='foreign_author_private_draft_read';other=p.api('GET',path,headers={'Authorization':'Bearer '+b},expected=(403,))
  assert chapter['status']=='DRAFT'
  p.stage='owner_missing_version';p.api('PATCH',path,{'content':'missing version body'},expected=(428,))
  version=owner_view['draft']['version']
  p.stage='owner_versioned_save';saved=p.api('PATCH',path,{'content':'versioned owner body','expectedVersion':version,'autosave':True},expected=(200,))
  assert saved['draftVersion']==version+1
  p.stage='owner_stale_version';p.api('PATCH',path,{'content':'stale different body','expectedVersion':version},expected=(409,))
  p.stage='metadata_only_no_version';p.api('PATCH',path,{'isVip':False,'priceCoins':0},expected=(200,))
  p.save('validation',{'executor':'ASTRA','source_sha':'7b15c078c1ffe2fca96c4e66c96577e3ff007c3c','pipeline_test_driver_sha':p.source_sha,'source_clean':True,'runtime':'PASS_SEPARATE_PR55_API_ONLY','anonymous_get':401,'foreign_author_get':403,'owner_get':200,'missing_version_patch':428,'versioned_owner_patch':200,'stale_different_body_patch':409,'metadata_only_no_version_patch':200,'no_active_baseline_fixture':True,'provider_calls':0,'combined_app_runtime':'NOT_RUN'})
  (out/'pr55-api-command.json').write_text(json.dumps({'command':cmd,'exit_code':0,'runtime':'PASS_SEPARATE_PR55_API_ONLY'},indent=2)+'\n',encoding='utf-8')
  print('PR55 API fixture PASS: anonymous 401; foreign author 403; version required 428; owner save 200; stale 409; pricing-only 200')

 finally:
  child.terminate();child.wait(timeout=15)
