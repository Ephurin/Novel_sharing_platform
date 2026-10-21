"""Opt-in execution against a NEW, already-initialized offline Compose project.

No auto-start, delete, reset or implicit attachment to historical resources.
Run boundary probes in a different project from the browser smoke (quota is consumed).
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import pytest

PROJECT = os.getenv('WAVE1D_CONTAINER_PROJECT', '')
pytestmark = pytest.mark.skipif(not PROJECT, reason='NOT_RUN: new isolated Docker project must be explicitly provided')


def docker(*args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=40)
    if result.returncode: raise RuntimeError('Docker command failed; no fallback to host/mocked E2E')
    return result.stdout.strip()


def owned(service):
    if not PROJECT.startswith('p1-wave1d-'): raise RuntimeError('New Wave1D project namespace required')
    ids = docker('ps', '-q', '--filter', 'label=com.docker.compose.project='+PROJECT,
                 '--filter', 'label=com.docker.compose.service='+service).splitlines()
    if len(ids) != 1: raise RuntimeError('Exactly one running owned service is required: '+service)
    data = json.loads(docker('inspect', ids[0]))[0]
    if data['Config']['Labels']['com.docker.compose.project'] != PROJECT: raise RuntimeError('Ownership mismatch')
    return ids[0], data


def python_in(service, script):
    return docker('exec', owned(service)[0], 'python', '-c', script)


def summary():
    return json.loads(python_in('budget-gateway',
        "import json,urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://localhost:18090/status'))))"))


def count():
    return int(python_in('fake-upstream', "from pathlib import Path; p=Path('/evidence/requests.jsonl');print(len(p.read_text().splitlines()) if p.exists() else 0)"))


def test_running_workers_have_internal_network_only_and_no_provider_keys():
    for service in ('ai-service', 'backend'):
        _, data = owned(service)
        environment = dict(v.split('=', 1) for v in data['Config']['Env'] if '=' in v)
        assert environment.get('BUDGET_GUARD_MODE') == 'proxy'
        assert environment.get('BUDGET_GUARD_URL') == 'http://budget-gateway:18090'
        assert not any(environment.get(key) for key in ('GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY'))
        assert len(data['NetworkSettings']['Networks']) == 1
        for network in data['NetworkSettings']['Networks']:
            assert json.loads(docker('network', 'inspect', network))[0]['Internal'] is True
    _, fake = owned('fake-upstream')
    assert set(fake['NetworkSettings']['Networks']).isdisjoint(owned('ai-service')[1]['NetworkSettings']['Networks'])


def test_real_container_sdk_s02_and_backend_paths_share_exact_dispatch_accounting():
    before, requests = summary()['total_calls'], count()
    result = python_in('ai-service', """
import os,json
from core.llm_service import LLMService
from core.structured_call import call_structured
from services.entity_pipeline.verification import EntityDecisionBatch
assert os.environ['LLM_PROVIDER']=='gemini'
llm=LLMService(provider=os.environ['LLM_PROVIDER'],model=os.environ['LLM_MODEL'])
raw=call_structured(llm,operation='entity_candidate_verification',system_prompt='Offline verification',user_prompt=json.dumps({'candidates':[{'candidate_id':'container-S02'}]}))
assert EntityDecisionBatch.model_validate_json(raw).decisions[0].candidate_id=='container-S02'
print('NATIVE_GEMINI_STRUCTURED_OK')
""")
    assert result == 'NATIVE_GEMINI_STRUCTURED_OK'
    assert summary()['total_calls'] == before + 1 and count() == requests + 1
    result = docker('exec', owned('backend')[0], 'node', '--input-type=module', '-e', """
import {generateCopilotSuggestionWithLlm} from './dist/modules/ai-copilot/llm-provider.js';
const text=await generateCopilotSuggestionWithLlm({instruction:'offline',recentText:'An',characters:[],recentEvents:[]});
if(text!=='Separate fake upstream response.')throw Error('wrong upstream');console.log('BACKEND_HTTP_OK');process.exit(0);
""")
    assert result == 'BACKEND_HTTP_OK'
    assert summary()['total_calls'] == before + 2 and count() == requests + 2


def test_worker_cannot_reach_public_network_or_fake_upstream_directly():
    for service in ('ai-service',):
        result = python_in(service, """
import socket
for host,port in [('1.1.1.1',443),('fake-upstream',18091)]:
    try:
        s=socket.create_connection((host,port),timeout=1);s.close()
    except OSError:continue
    raise RuntimeError('UNGUARDED_EGRESS_REACHABLE')
print('DIRECT_EGRESS_DENIED')
""")
        assert result == 'DIRECT_EGRESS_DENIED'
    result = docker('exec', owned('backend')[0], 'node', '--input-type=module', '-e', """
import net from 'node:net';
for(const [host,port] of [['1.1.1.1',443],['fake-upstream',18091]]){
 await new Promise((resolve,reject)=>{const s=net.connect(port,host);s.setTimeout(1000);
 s.on('connect',()=>{s.destroy();reject(Error('UNGUARDED_EGRESS_REACHABLE'))});
 s.on('error',resolve);s.on('timeout',()=>{s.destroy();resolve()});});
}console.log('DIRECT_EGRESS_DENIED');
""")
    assert result == 'DIRECT_EGRESS_DENIED'


def test_200_201_and_two_container_final_slot_race():
    before = summary()['total_calls']
    assert before < 199, 'Use a fresh owned project; never reset an existing ledger'
    result = python_in('ai-service', """
import json,os,urllib.request,urllib.error
url=os.environ['BUDGET_GUARD_URL']
body=json.dumps({'model':'gemini-3.5-flash-lite','max_tokens':20,'messages':[{'role':'user','content':'offline'}]}).encode()
n=json.load(urllib.request.urlopen(url+'/status'))['total_calls']
for i in range(199-n):
 req=urllib.request.Request(url+'/v1/chat/completions',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['BUDGET_GUARD_AUTH_TOKEN']})
 with urllib.request.urlopen(req) as response:assert response.status==200
print('199')
""")
    assert result == '199'
    def ai():
        return python_in('ai-service', """
import os,json,urllib.request,urllib.error
req=urllib.request.Request(os.environ['BUDGET_GUARD_URL']+'/v1/chat/completions',data=json.dumps({'model':'gemini-3.5-flash-lite','max_tokens':20,'messages':[{'role':'user','content':'last slot'}]}).encode(),headers={'Authorization':'Bearer '+os.environ['BUDGET_GUARD_AUTH_TOKEN'],'Content-Type':'application/json'})
try:
 with urllib.request.urlopen(req) as r:print(r.status)
except urllib.error.HTTPError as e:print(e.code)
""")
    def backend():
        return docker('exec', owned('backend')[0], 'node', '--input-type=module', '-e', """
const r=await fetch(process.env.BUDGET_GUARD_URL+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.BUDGET_GUARD_AUTH_TOKEN},body:JSON.stringify({model:'gemini-3.5-flash-lite',max_tokens:20,messages:[{role:'user',content:'last slot'}]})});console.log(r.status);
""")
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        futures=[pool.submit(ai),pool.submit(backend)]
        assert sorted(f.result() for f in futures)==['200','429']
    assert summary()['total_calls'] == count() == 200
    assert ai() == '429' and count() == 200
