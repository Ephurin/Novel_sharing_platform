"""Read-only aggregate checks and evidence seal; never mutates business data."""
import hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = Path.cwd()
SHA = 'a7081c6932e33bd5500d0ca40604afe6bb0d51e4'
def read(path): return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))
def write(path, data): (ROOT / path).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf-8', newline='\n')
def command(args):
    p = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', check=True)
    return p.stdout

assert command(['git','rev-parse','HEAD']).strip() == SHA
modes = ['skip_first','stop_first','accept_first','ABA','plan_replaced','kill_pre_commit','kill_post_commit']
results = []
for mode in modes:
    val = read(f'{mode}/validation.json')
    assert val['verdict'] == 'PASS' and val['tested_sha'] == SHA and not val['source_dirty_at_start']
    busy = read(f'{mode}/competing-step.json')
    assert busy['status'] == 409 and busy['response']['error']['code'] == 'RUN_STEP_BUSY'
    audit = mode+'-readback'+('-02' if mode == 'stop_first' else '')
    assert read(f'{audit}/validation.json')['status'] == 'PASS'
    assert read(f'{audit}/migrations.json')['AI'] == '0013_objective_intent'
    revisions = [r for r in read(f'{audit}/chapter_revisions.json') if r['source_type'] == 'AI_DRAFT_ACCEPT']
    expected = int(mode in ['accept_first','kill_post_commit'])
    assert len(revisions) == expected
    outbox = read(f'{audit}/revision_outbox_events.json')
    assert len(outbox) == expected
    if expected: assert outbox[0]['revision_id'] == revisions[0]['revision_id']
    if mode == 'ABA': assert read(f'{audit}/narrative-story_plan_objectives.json')[0]['intent_version'] == 4
    results.append({'scenario':mode,'status':'PASS','checks':len(val['checks']),'accepted':expected,'outbox':len(outbox),'audit':audit})

for scenario in ['p3-existing','p3-no-plan-03','p2','terminal-stop','p1-writer']:
    val = read(f'{scenario}/validation.json')
    assert val['verdict'] == 'PASS' and val['tested_sha'] == SHA and not val['source_dirty_at_start']
    results.append({'scenario':scenario,'status':'PASS','checks':len(val.get('checks',[])),'evidence':f'{scenario}/validation.json'})

manifests = [json.loads(p.read_text(encoding='utf-8-sig')) for p in ROOT.glob('*-environment.json')]
assert len(manifests) == 13
lifecycle=[]
for m in manifests:
    project=m['project']
    rows=[json.loads(s) for s in command(['docker','ps','-a','--filter',f'label=com.docker.compose.project={project}','--format','{{json .}}']).splitlines()]
    assert rows and all(r['State'] != 'running' for r in rows)
    volumes=command(['docker','volume','ls','--filter',f'label=com.docker.compose.project={project}','--format','{{.Name}}']).splitlines()
    lifecycle.append({'project':project,'containers':[{'name':r['Names'],'state':r['State']} for r in rows],'retained_volumes':volumes,'all_stopped':True})
write('resource-lifecycle.json', lifecycle)
old=REPO/'Pipeline_test/reviews/2026-10-22-p123-headless/p1-race-p3/P3-negative/inflight-objective'
write('prior-red-references.json', [{'path':str(p.relative_to(REPO)).replace('\\','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(old.glob('*.json'))])
write('validation.json',{'verdict':'P3_OBJECTIVE_FENCE_BOUNDED_OFFLINE_EXECUTOR_PASS','tested_source_sha':SHA,'authority_sha':'fee928f46448f8b1cd84652d06b7c36ca6481828','source_clean_at_test_start':True,'scenarios':results,'AI_passed':162,'AI_skipped':2,'backend_passed':44,'backend_typecheck':'PASS','backend_build':'PASS','external_provider_calls':0,'actual_paid_spend_usd':0,'human_actor':'SIMULATED_HUMAN_VIA_API','independent_review':'PENDING','UI':'NOT_RUN','LIVE_PROVIDER':'NOT_RUN','SEMANTIC_RAG':'NOT_ASSESSED','LITERARY_QUALITY':'NOT_ASSESSED','P3_100K':'NOT_RUN'})
write('commands-and-exits.json',{'tested_source_sha':SHA,'records':[{'scenario':r['scenario'],'exit_code':0,'invocation_reference':('Pipeline_test/tools/run_p3_intent_fence.py --mode '+r['scenario']) if r['scenario'] in modes else r.get('evidence'),'note':'See HTTP trace, containment and validation in scenario directory; own environment manifest required.'} for r in results]+[{'command':'Pipeline_test/tools/run_p123_regressions.py','exit_code':0,'exact_args_reference':'regressions-01/validation.json'},{'command':'npm.cmd run build','cwd':'backend','exit_code':0}], 'retained_unsuccessful_attempts':[{'path':'p3-no-plan','exit_code':1,'reason':'Docker inspect preflight TimeoutExpired; no novel created'},{'path':'p3-no-plan-02','exit_code':1,'reason':'Real background worker RUN_STEP_BUSY; superseded by fresh p3-no-plan-03 with bounded known-busy retry adapter'},{'path':'stop_first-readback','exit_code':1,'reason':'In-memory fake receipts lost on restart; durable journal verified in stop_first-readback-02'}]})

# Normalize only this new evidence tree, then scan without printing credentials.
secrets=[]
for m in manifests:
    for line in (REPO/m['env_file']).read_text(encoding='utf-8-sig').splitlines():
        if '=' in line:
            key,value=line.split('=',1)
            if any(x in key.upper() for x in ['SECRET','PASSWORD','TOKEN','API_KEY']) and len(value.strip())>=12: secrets.append(value.strip())
files=[p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='artifact-sha256.json']
for p in files:
    s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n')
    s='\n'.join(line.rstrip() for line in s.splitlines()).rstrip()+'\n'
    assert not re.search(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',s), str(p)
    assert not any(secret in s for secret in secrets), 'Credential in '+str(p)
    p.write_text(s,encoding='utf-8',newline='\n')
write('artifact-sha256.json',{'algorithm':'SHA256','files':{str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}})
print(json.dumps({'scenarios':len(results),'owned_projects':len(lifecycle),'volumes_retained':sum(len(x['retained_volumes']) for x in lifecycle),'all_stopped':True,'files_sealed':len(files),'secret_scan':'PASS'}))
