"""Fail-closed final aggregation, owned-resource lifecycle and secret/hash seal."""
from pathlib import Path
import hashlib,json,re,subprocess
BASE=Path(__file__).resolve().parent
REPO=BASE.parents[3]
CORE=BASE.parent/'core-readiness'
FINAL='3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,value):p.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
def cmd(args):return subprocess.check_output(args,cwd=REPO,text=True,encoding='utf-8').strip()
assert cmd(['git','rev-parse','HEAD'])==FINAL
assert not cmd(['git','status','--porcelain','--','backend','ai-service','Pipeline_test/tools','Pipeline_test/tests'])
scenarios=[s+'-'+a for s in ['post_commit','pre_approval','pre_progress'] for a in ['skip','stop']]+['pre_approval-ABA-02','pre_approval-kill_stop','pre_approval-advance_first','replacement','hitl','p1-writer','p2','p3-existing','p3-no-plan']
results=[]
for name in scenarios:
 v=read(BASE/'green-03'/name/'validation.json')
 assert v['tested_sha']==FINAL and not v['source_dirty_at_start'] and v['verdict']=='PASS',name
 assert all(c['status']=='PASS' for c in v.get('checks',[])),name
 audit=BASE/'green-03'/(name+'-readback')
 av=read(audit/'validation.json');assert av['status']=='PASS' and av['tested_sha']==FINAL,name
 migrations=read(audit/'migrations.json');assert migrations['AI']=='0013_objective_intent' and len(migrations['backend'])==12,name
 revisions=read(audit/'chapter_revisions.json');accepted=[r for r in revisions if r['source_type']=='AI_DRAFT_ACCEPT']
 outbox=read(audit/'revision_outbox_events.json')
 if name.startswith(('post_commit','pre_')) or name=='replacement':
  assert len(accepted)==1 and len(outbox)==1 and outbox[0]['revision_id']==accepted[0]['revision_id'],name
  before=read(BASE/'green-03'/name/'at-seam.json');after=read(BASE/'green-03'/name/'after.json')
  assert after['plan']['objectives'][0]['status']!='completed',name
  if name!='pre_approval-advance_first':assert after['memory']==before['memory'],name
  else:
   assert after['run']['status']=='completed',name
   assert int(after['memory']['metadata']['brain_version'])>int(before['memory']['metadata']['brain_version']),name
  # The immutable accepted lineage is retained; pending groups are not secretly accepted.
  assert accepted[0]['source_generation_id'] in [j['job_id'] for j in read(audit/'narrative-writing_generations.json')],name
 results.append({'scenario':name,'status':'PASS_BOUNDED_EXECUTOR','checks':len(v.get('checks',[])),'accepted_AI_revisions':len(accepted),'outbox_count':len(outbox),'matched_outbound_jobs':av['matched_writing_jobs'],'validation':str((BASE/'green-03'/name/'validation.json').relative_to(BASE)).replace('\\','/')})
red=read(BASE/'RED-pre-progress-skip'/'validation.json');assert red['verdict']=='EXPECTED_RED'
ra=read(BASE/'RED-pre-progress-skip'/'after.json');assert ra['plan']['objectives'][0]['status']=='completed'
reg=read(BASE/'green-03'/'regressions'/'validation.json');assert reg['tested_sha']==FINAL and reg['AI']['exit_code']==0 and all(r['exit_code']==0 for r in reg['backend'])
assert '166 passed, 2 skipped' in (BASE/'green-03/regressions/ai-tests.txt').read_text(encoding='utf-8-sig')
assert 'pass 44' in (BASE/'green-03/regressions/backend-focused.txt').read_text(encoding='utf-8-sig')
manifests=list(BASE.rglob('*-environment.json'));lifecycle=[];secrets=[]
for path in sorted(manifests):
 m=read(path);project=m['project'];assert re.fullmatch('p123-core-[a-f0-9]{10}',project)
 rows=[json.loads(line) for line in cmd(['docker','ps','-a','--filter','label=com.docker.compose.project='+project,'--format','{{json .}}']).splitlines()]
 assert rows and all(r['State']!='running' for r in rows),project
 volumes=cmd(['docker','volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']).splitlines()
 assert len(volumes)==4,project
 lifecycle.append({'project':project,'manifest':str(path.relative_to(BASE)).replace('\\','/'),'containers':[{'name':r['Names'],'state':r['State']} for r in rows],'retained_volumes':volumes,'all_stopped':True})
 for line in (REPO/m['env_file']).read_text(encoding='utf-8-sig').splitlines():
  if '=' not in line:continue
  k,v=line.split('=',1)
  if any(s in k.upper() for s in ['SECRET','PASSWORD','TOKEN','API_KEY']) and len(v.strip())>=12:secrets.append(v.strip())
write(BASE/'resource-lifecycle.json',lifecycle)
commands=[]
for path in BASE.rglob('*commands.json'):
 if path.name=='commands-and-exits.json':continue
 value=read(path)
 if isinstance(value,list):commands.append({'path':str(path.relative_to(BASE)).replace('\\','/'),'records':value})
write(BASE/'commands-and-exits.json',{'final_tested_source_sha':FINAL,'record_sets':commands,'focused_regressions':reg,'build':{'command':['npm.cmd','--prefix','backend','run','build'],'exit_code':0,'tested_sha':FINAL},'failed_attempts_preserved':True,'note':'Root and green-02 are intermediate attempts. Only green-03 is final-SHA acceptance; exact per-case logs are retained.'})
write(BASE/'validation.json',{'verdict':'P3_POST_ACCEPT_INTENT_BOUNDED_OFFLINE_EXECUTOR_PASS','integration_candidate':'P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW','authority_sha':'0582f0528f80740c17f0caa75ccc541fb3080e69','tested_source_sha':FINAL,'source_clean_at_test_start':True,'RED_tested_sha':red['tested_sha'],'scenarios':results,'AI_passed':166,'AI_skipped':2,'backend_focused_passed':44,'backend_typecheck':'PASS','backend_build':'PASS','scheduling':'P3_SCHEDULING_CONTENTION_LIMIT','human_actor':'SIMULATED_HUMAN_VIA_API','owned_projects':len(lifecycle),'retained_volumes':sum(len(r['retained_volumes']) for r in lifecycle),'external_provider_calls':0,'actual_paid_spend_usd':0,'independent_review':'PENDING','UI':'UI_BLOCKED_FE','LIVE_PROVIDER':'REAL_PROVIDER_NOT_TESTED','SEMANTIC_RAG':'NOT_ASSESSED','LITERARY_QUALITY':'NOT_ASSESSED','P3_HITL_CONTROLLER_100K':'NOT_RUN'})
write(CORE/'readiness-validation.json',{'tested_source_sha':FINAL,'candidate':'P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW','executor_evidence':'../post-accept/validation.json','independent_review':'PENDING','FE_integration':'HOLD','scheduling_limit':'RUN_STEP_BUSY requires bounded consumer backoff; no production FE implementation tested'})
files=[p for root in [BASE,CORE] for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='artifact-sha256.json']
for path in files:
 content=path.read_text(encoding='utf-8-sig').replace('\r\n','\n');content='\n'.join(line.rstrip() for line in content.splitlines()).rstrip()+'\n'
 assert not re.search(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',content),str(path)
 assert not any(secret in content for secret in secrets),'Credential in '+str(path)
 path.write_text(content,encoding='utf-8',newline='\n')
write(BASE/'artifact-sha256.json',{'algorithm':'SHA256','files':{str(p.relative_to(BASE.parent)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}})
print(json.dumps({'final_scenarios':len(results),'post_accept_checks':sum(r['checks'] for r in results[:11]),'owned_projects':len(lifecycle),'retained_volumes':sum(len(r['retained_volumes']) for r in lifecycle),'files_sealed':len(files),'secret_scan':'PASS'}))
