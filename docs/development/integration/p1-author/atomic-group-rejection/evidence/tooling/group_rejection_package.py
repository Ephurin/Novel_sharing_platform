import datetime,hashlib,json,pathlib,re,shutil,subprocess
P=pathlib.Path(__file__).parent
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
FINAL=P/'group-rejection-final'; RED=P/'group-rejection-red'; DEV=P/'group-rejection-dev'; PACK=P/'group-rejection-evidence-pack'
SOURCE='e0c0e72651d2fd7eb52b82fdf53932aa4e849123'
TREE='f2fde602c427fc143d50918844b11f9262a8a5c1'
PACK.mkdir(exist_ok=True)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
def save(name,obj):
 target=PACK/name;target.parent.mkdir(parents=True,exist_ok=True)
 target.write_text(json.dumps(obj,indent=2,ensure_ascii=True),encoding='utf8')
def copy(src,name):
 target=PACK/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,target)
commands=[];counts={}
for suite in ('rejection','hitl','postgres','unit','backend','live','python','typescript'):
 seal=json.loads((FINAL/f'test-accept-{suite}-source.json').read_text())
 assert seal['sha']==SOURCE and seal['dirty'] is False
 rows=json.loads((FINAL/f'test-accept-{suite}-commands.json').read_text())
 assert all(r['exit_code']==0 for r in rows),suite
 commands.extend(rows)
 if suite in ('python','typescript'):continue
 raw=(FINAL/f'test-accept-{suite}.log').read_text(encoding='utf8')
 if suite in ('backend','live'):
  assert '# fail 0' in raw
  passed=int(re.search(r'# pass (\d+)',raw).group(1));skipped=int(re.search(r'# skipped (\d+)',raw).group(1))
 else:
  passed=int(re.search(r'(\d+) passed',raw).group(1))
  skipped=re.search(r'(\d+) skipped',raw);skipped=int(skipped.group(1)) if skipped else 0
 counts[suite]={'passed':passed,'skipped':skipped,'failed':0}
counts['unique_local_passes']=sum(counts[s]['passed'] for s in ('hitl','postgres','unit','backend','live'))
counts['counting_rule']='Focused rejection cases repeat in full HITL; CI, retries and RED are not added.'
for f in FINAL.iterdir():
 if f.is_file() and f.suffix in ('.json','.log'):copy(f,'green/'+f.name)
for f in RED.iterdir():
 if f.is_file() and (f.name.startswith('RED-') or f.name.startswith('test-red-live') or f.name.startswith(('provision-','migrate-','backend-migration','alembic-upgrade')) or f.name=='resources.json'):
  copy(f,'red/'+f.name)
for f in DEV.iterdir():
 if f.is_file() and f.suffix in ('.json','.log'):copy(f,'development/'+f.name)
# Preserve the accidentally mislabeled first development GREEN, explicitly excluded from RED proof.
copy(RED/'test-red-rejection.log','development/first-green-mislabeled-test-red-rejection.log')
copy(RED/'test-red-rejection-commands.json','development/first-green-mislabeled-commands.json')
for name in ('group_rejection_final_runner.py','group_rejection_red_replay.py','group_rejection_seal.py','group_rejection_package.py'):
 copy(P/name,'tooling/'+name)
save('commands.json',commands);save('test-counts.json',counts)
save('source-integrity.json',{'base_sha':'2eca7f19c20a71202d7c827af2e15d8fb6dc88bb','contract_commit':'3616b503dec46e293a58c98be977fcdad5bf8bdb','source_sha':SOURCE,'source_tree':TREE,'clean_for_every_final_suite':True,'fake_only':True,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
decoder=json.JSONDecoder()
for phase,folder,name in [('green',FINAL,'test-accept-live'),('red',RED,'test-red-live')]:
 raw=(folder/(name+'.log')).read_text(encoding='utf8').replace('\n# ','')
 requests=decoder.raw_decode(raw.split('P1_HTTP_EVIDENCE ',1)[1])[0]
 readbacks=decoder.raw_decode(raw.split('P1_DURABLE_EVIDENCE ',1)[1])[0]
 save(phase+'/http-requests.json',requests);save(phase+'/http-readbacks.json',readbacks)
 save(phase+'/http-summary.json',{'requests':len(requests),'durable_readbacks':len(readbacks),'statuses':{str(k):sum(r['status']==k for r in requests) for k in sorted({r['status'] for r in requests})},'mounted_browser':'NOT_RUN'})
 if phase=='red':
  before=next(r for r in readbacks if r['stage']=='group-reject-before-partial')
  after=next(r for r in readbacks if r['stage']=='group-reject-after-partial')
  assert before['brain']==after['brain']
  assert {p['status'] for p in after['proposals']}=={'pending','rejected'}
 else:
  before=next(r for r in readbacks if r['stage']=='group-reject-before-partial')
  for stage in ['group-reject-after-partial','group-reject-negative-401','group-reject-negative-403','group-reject-negative-409']:
   after=next(r for r in readbacks if r['stage']==stage)
   assert {**before,'stage':''}=={**after,'stage':''}
pg=[]
for line in (FINAL/'test-accept-rejection.log').read_text(encoding='utf8').splitlines():
 if 'ATOMIC_REJECT_PG_READBACK ' in line:pg.append(json.loads(line.split('ATOMIC_REJECT_PG_READBACK ',1)[1]))
save('green/rejection-postgres-readbacks.json',pg)
print(json.dumps({'counts':counts,'critical_pg_snapshots':len(pg),'pack':str(PACK)},indent=2))
