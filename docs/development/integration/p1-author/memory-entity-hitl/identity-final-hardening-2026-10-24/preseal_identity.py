import pathlib,json,subprocess,datetime,hashlib,re
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
BASE=pathlib.Path(__file__).parent;OUT=BASE/'p1-identity-final-acceptance';RED=BASE/'p1-identity-final-runtime'
SOURCE='fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9';REVIEWED='0de3fcf63fc6afdd2e1875af06dadddf844ed33f';commands=[]
def run(args,name):
 p=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf8',errors='strict')
 commands.append({'command':args,'cwd':str(ROOT),'exit_code':p.returncode,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 (OUT/'seal-commands.json').write_text(json.dumps(commands,indent=2),encoding='utf8')
 (OUT/(name+'.log')).write_text(p.stdout+p.stderr,encoding='utf8');assert p.returncode==0,p.stderr
 return p.stdout
assert run(['git','rev-parse','HEAD'],'final-source-sha').strip()==SOURCE
assert not run(['git','status','--porcelain'],'final-source-status').strip()
for kind in ['hitl','unit','postgres','backend','python','live']:
 seal=json.loads((OUT/f'test-accept-{kind}-source.json').read_text(encoding='utf8'));assert seal['sha']==SOURCE and not seal['dirty']
 assert all(c['exit_code']==0 for c in json.loads((OUT/f'test-accept-{kind}-commands.json').read_text(encoding='utf8')))
history=['docs/development/integration/p1-author/memory-entity-hitl/evidence-2026-10-23','docs/development/integration/p1-author/memory-entity-hitl/semantic-hardening-2026-10-23']
assert not run(['git','diff',REVIEWED,SOURCE,'--',*history],'historical-evidence-diff').strip()
tree=run(['git','rev-parse',SOURCE+'^{tree}'],'source-tree').strip()
merge='1a41a3731377dd97f12224e1e016a10c5415a4a1'
assert run(['git','rev-parse',merge+'^{tree}'],'pr-merge-tree').strip()==tree
cfg=json.loads((OUT/'resources.json').read_text(encoding='utf8'))
run(['docker','inspect',*cfg['containers']],'acceptance-container-inspect')
run(['docker','exec',cfg['containers'][0],'psql','-U','postgres','-d',cfg['database'],'-At','-c',"SELECT json_build_object('alembic',(SELECT version_num FROM alembic_version),'pgvector',(SELECT extversion FROM pg_extension WHERE extname='vector'),'users',(SELECT count(*) FROM public.users),'novels',(SELECT count(*) FROM public.novels),'chapters',(SELECT count(*) FROM public.chapters),'revisions',(SELECT count(*) FROM public.chapter_revisions),'brains',(SELECT count(*) FROM narrative.story_brains),'analysis_runs',(SELECT count(*) FROM narrative.analysis_runs));"],'final-pg-inventory')
run(['docker','exec',cfg['containers'][1],'mongosh','--quiet',cfg['database'],'--eval',"JSON.stringify(db.getCollectionNames().sort().map(n=>({name:n,count:db.getCollection(n).countDocuments({})})))"],'final-mongo-inventory')
lines=(OUT/'test-accept-live.log').read_text(encoding='utf8').splitlines()
for i,line in enumerate(lines):
 for prefix,name in [('# P1_HTTP_EVIDENCE ','http-requests-responses.json'),('# P1_DURABLE_EVIDENCE ','gateway-postgres-readbacks.json')]:
  if line.startswith(prefix):
   payload=line[len(prefix):];j=i
   while True:
    try:value=json.loads(payload);break
    except json.JSONDecodeError:
     j+=1;assert j<len(lines) and lines[j].startswith('# ');payload+=lines[j][2:]
   (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
readbacks=[];semantic=[];concurrent=[];redlocks=[]
for path,markers in [(OUT/'test-accept-hitl.log',[('IDENTITY_PG_READBACK ',readbacks),('SEMANTIC_PG_READBACK ',semantic),('H03_PG_READBACK ',concurrent)]),(RED/'test-red-lockreadback.log',[('RED_LOCK_PG_READBACK ',redlocks)])]:
 for line in path.read_text(encoding='utf8').splitlines():
  for marker,target in markers:
   if marker in line:target.append(json.JSONDecoder().raw_decode(line.split(marker,1)[1])[0])
assert len(redlocks)==3 and all(r['unchanged'] for r in redlocks)
assert len(concurrent)==1 and concurrent[0]['deduplicated']==[False,True]
for name,value in [('identity-postgres-readbacks',readbacks),('existing-semantics-postgres-readbacks',semantic),('concurrent-completion-readback',concurrent),('red-legacy-persistence-readbacks',redlocks)]:
 (OUT/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
results={}
for kind in ['hitl','unit','postgres']:
 s=(OUT/f'test-accept-{kind}.log').read_text(encoding='utf8');passed=int(re.findall(r'(\d+) passed',s)[-1]);skipped=re.findall(r'(\d+) skipped',s)
 results[kind]={'passed':passed,'skipped':int(skipped[-1]) if skipped else 0}
for kind in ['backend','live']:
 s=(OUT/f'test-accept-{kind}.log').read_text(encoding='utf8');results[kind]={k:int(re.findall(r'# '+k+r' (\d+)',s)[-1]) for k in ['tests','pass','fail','skipped']}
results['http_records']=len(json.loads((OUT/'http-requests-responses.json').read_text(encoding='utf8')))
results['identity_pg_stages']=len(readbacks);results['semantic_pg_stages']=len(semantic);results['h03_pg_stages']=len(concurrent)
results['unique_local_passes']=results['hitl']['passed']+results['unit']['passed']+results['postgres']['passed']+results['backend']['pass']+results['live']['pass']
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
paths=run(['git','diff','--name-only',REVIEWED,SOURCE],'changed-source-paths').splitlines();blobs=[]
for path in paths:
 raw=subprocess.check_output(['git','show',SOURCE+':'+path],cwd=ROOT)
 blobs.append({'path':path,'git_blob':subprocess.check_output(['git','rev-parse',SOURCE+':'+path],cwd=ROOT,text=True).strip(),'sha256_git_blob':hashlib.sha256(raw).hexdigest()})
(OUT/'source-blobs.json').write_text(json.dumps({'source':SOURCE,'reviewed_base':REVIEWED,'files':blobs},indent=2),encoding='utf8')
(OUT/'provenance.json').write_text(json.dumps({'reviewed_head':REVIEWED,'previous_tested_source':'f3f40d9bcbeb247a79f3de6ea1a60a0d91181e21','initial_source_commit':'79bfcebb20059bf372a6d5e7347a15708ec56b93','tested_source':SOURCE,'source_tree':tree,'ci_pr_merge_ref':merge,'ci_merge_tree_matches_source':True,'integration_base':'7fd6f71b388320e00408b7ea47c0998708c70a2c','workflow_reference_sha':subprocess.check_output(['git','rev-parse','origin/codex/ai-copilot-pipeline-test'],cwd=ROOT,text=True).strip(),'branch':'codex/p1-memory-entity-hitl','pr':'https://github.com/Ephurin/Novel_sharing_platform/pull/63','fresh_resources':cfg,'text_provider':'fake','embedding_provider':'fake','real_provider_calls':False,'historical_evidence_unchanged':True,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2),encoding='utf8')
print(json.dumps(results,indent=2))
