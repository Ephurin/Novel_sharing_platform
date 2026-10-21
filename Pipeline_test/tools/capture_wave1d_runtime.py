"""Export safe metadata/receipts from explicitly owned Wave1D containers only."""
import argparse,json,subprocess
from pathlib import Path

def docker(*args):return subprocess.check_output(['docker',*args],text=True).strip()
def capture(project,output):
    if not project.startswith(('p1-wave1d-', 'p1-wave1e-')):raise ValueError('Owned namespace required')
    ids=docker('ps','-q','--filter','label=com.docker.compose.project='+project).splitlines()
    assert len(ids)==7
    services=[];by_service={}
    for cid in ids:
        data=json.loads(docker('inspect',cid))[0];labels=data['Config']['Labels'];assert labels['com.docker.compose.project']==project
        service=labels['com.docker.compose.service'];by_service[service]=cid
        env=dict(v.split('=',1) for v in data['Config']['Env'] if '=' in v)
        services.append({'container_id':cid,'name':data['Name'],'service':service,'image_sha':data['Image'],
            'command':data['Config']['Cmd'],'state':data['State']['Status'],
            'networks':list(data['NetworkSettings']['Networks']),
            'mounts':[{'type':m['Type'],'source':m.get('Name',m['Source']),'destination':m['Destination'],'rw':m['RW']} for m in data['Mounts']],
            'provider_configuration':{k:env.get(k) for k in ('LLM_PROVIDER','LLM_MODEL','LLM_FALLBACK_PROVIDER','LLM_LOCAL_FALLBACK','EMBEDDING_PROVIDER','BUDGET_GUARD_MODE','BUDGET_GUARD_URL')},
            'real_provider_keys_present':any(env.get(k) for k in ('GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY'))})
    summary=json.loads(docker('exec',by_service['budget-gateway'],'python','-c',"import json,urllib.request;print(json.dumps(json.load(urllib.request.urlopen('http://localhost:18090/status'))))"))
    receipts=docker('exec',by_service['fake-upstream'],'python','-c',"from pathlib import Path;p=Path('/evidence/requests.jsonl');print(p.read_text() if p.exists() else '')")
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    (output/'runtime-owned-resources.json').write_text(json.dumps({'project':project,'services':services,'networks':[{'name':n,'internal':json.loads(docker('network','inspect',n))[0]['Internal']} for n in sorted({n for s in services for n in s['networks']})]},indent=2)+'\n')
    (output/'gateway-ledger-readback.json').write_text(json.dumps(summary,indent=2)+'\n')
    (output/'fake-upstream-receipts.jsonl').write_text(receipts+'\n')
    print(json.dumps({'project':project,'containers':len(services),'main_ledger_calls':summary['total_calls'],'fake_receipts':len(receipts.splitlines()),'live_authorized':summary['live_authorized']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--output',required=True);a=p.parse_args();capture(a.project,a.output)
