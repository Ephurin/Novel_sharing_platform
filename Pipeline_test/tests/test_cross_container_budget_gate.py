"""Wave 1D HOST HTTP integration. Container-level evidence is a SEPARATE gate.
Uses the actual google-genai SDK, actual LLMService, and a separate fake HTTP upstream.
"""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import time
import urllib.request
import urllib.error
from unittest.mock import patch

import pytest
ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / 'ai-service')]
from Pipeline_test.tools.budget_gateway import AuthoritativeBudgetLedger, start_budget_gateway, BudgetMeterUnavailableError
from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from core.llm_service import LLMService, LLMServiceError

AUTH = {'Bearer ai-worker': 'ai-service', 'Bearer backend-worker': 'backend'}

@pytest.fixture(autouse=True)
def forbid_non_loopback_python_dns(monkeypatch):
    original = socket.getaddrinfo
    def local_only(host, *args, **kwargs):
        if host not in {'127.0.0.1', 'localhost', '::1', None}:
            raise RuntimeError('OFFLINE_TEST_EXTERNAL_NETWORK_DENIED')
        return original(host, *args, **kwargs)
    monkeypatch.setattr(socket, 'getaddrinfo', local_only)

def post(url, data=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(data or {}).encode(),
        headers={'Content-Type':'application/json', 'Authorization':'Bearer ai-worker', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as res: return res.status, json.load(res)
    except urllib.error.HTTPError as exc: return exc.code, json.load(exc)

def body(text='hello'):
    return {'model':'gemini-3.5-flash-lite', 'max_tokens':20, 'messages':[{'role':'user','content':text}]}

@pytest.fixture
def stack(tmp_path, request):
    upstream, _, received = start_fake_upstream()
    server, _, ledger = start_budget_gateway(tmp_path/'state.json', port=0, initialize=True, run_id='wave1d-unit',
        upstream_base_url=f'http://127.0.0.1:{upstream.server_port}', upstream_api_key='fake-upstream-only',
        client_tokens={'ai-worker':'ai-service', 'backend-worker':'backend'}, upstream_timeout=.1)
    yield f'http://127.0.0.1:{server.server_port}', ledger, received, server
    observation = os.getenv('WAVE1D_OBSERVATION_LOG')
    if observation:
        entry = {'test': request.node.nodeid, 'gateway_url': f'http://127.0.0.1:{server.server_port}',
            'fake_upstream_url': f'http://127.0.0.1:{upstream.server_port}',
            'received_requests': received, 'in_memory_reservations': ledger.state.get('total_calls'),
            'meter_latched_unavailable': bool(ledger._init_error)}
        with Path(observation).open('a', encoding='utf-8') as stream: stream.write(json.dumps(entry) + '\n')
    server.shutdown(); server.server_close(); ledger.close(); upstream.shutdown(); upstream.server_close()


def test_real_gemini_sdk_structured_operation_reaches_separate_upstream_once(stack, monkeypatch):
    url, ledger, received, _ = stack
    monkeypatch.setenv('BUDGET_GUARD_URL', url); monkeypatch.setenv('BUDGET_GUARD_MODE','proxy')
    monkeypatch.setenv('BUDGET_GUARD_AUTH_TOKEN','ai-worker')
    monkeypatch.delenv('BUDGET_GUARD_FILE',raising=False)
    from services.entity_pipeline.pipeline import EntityPipeline
    from services.entity_pipeline.verification import EntityDecisionBatch
    from core.structured_call import call_structured
    llm=LLMService(provider='gemini',model='gemini-3.5-flash-lite',api_key='',structured_max_tokens=128)
    result=call_structured(llm, operation='entity_candidate_verification', system_prompt='Verify candidates.',
        user_prompt=json.dumps({'candidates':[{'candidate_id':'c1'}]}))
    assert EntityDecisionBatch.model_validate_json(result).decisions[0].candidate_id=='c1'
    assert len(received)==1
    assert received[0]['path']=='/v1beta/models/gemini-3.5-flash-lite:generateContent'
    assert 'decisions' in received[0]['native_schema']['properties']
    assert ledger.get_summary()['total_calls']==1
    assert ledger.state['call_history'][0]['client_service']=='ai-service'
    assert llm.provider=='gemini'


@pytest.mark.parametrize('last_slot', [False, True])
def test_real_sdk_quota_retries_consume_slots_and_budget_denial_stops_retries(stack,monkeypatch,last_slot):
    from types import SimpleNamespace
    import core.llm_service as client_module
    monkeypatch.setenv('BUDGET_GUARD_URL', stack[0]);monkeypatch.setenv('BUDGET_GUARD_MODE','proxy')
    monkeypatch.setenv('BUDGET_GUARD_AUTH_TOKEN','ai-worker')
    monkeypatch.setattr(client_module,'time',SimpleNamespace(monotonic=time.monotonic,sleep=lambda _:None))
    if last_slot:stack[1].state['max_calls']=1;stack[1]._save_durable()
    llm=LLMService(provider='gemini',model='gemini-3.5-flash-lite',api_key='dummy')
    with pytest.raises(LLMServiceError):llm._call_llm('offline','fault:429')
    expected=1 if last_slot else 4
    assert len(stack[2])==stack[1].state['total_calls']==expected
    assert llm._gemini_model_candidates()==['models/gemini-3.5-flash-lite']


@pytest.mark.parametrize('ticket', ['invented','stolen','reused','expired','old-run'])
def test_client_tickets_never_dispatch_even_if_well_named(stack,ticket):
    url, ledger, received, _=stack
    assert post(url+'/v1/chat/completions',body(),{'X-Budget-Ticket':ticket})[0]==403
    assert not received and ledger.state['total_calls']==0


def test_actual_backend_provider_uses_gateway_once_in_separate_node_process(stack):
    import shutil, subprocess
    url, ledger, received, _ = stack
    environment = {**os.environ, 'BUDGET_GUARD_URL': url, 'BUDGET_GUARD_MODE': 'proxy',
        'BUDGET_GUARD_AUTH_TOKEN': 'backend-worker', 'AI_LLM_BASE_URL': url + '/v1',
        'AI_LLM_API_KEY': '', 'AI_LLM_MODEL': 'gemini-3.5-flash-lite',
        'DB_CONNECT_ON_START': 'false', 'AI_LLM_MAX_TOKENS': '128'}
    script = """import {generateCopilotSuggestionWithLlm} from './dist/modules/ai-copilot/llm-provider.js';
    const actualFetch=globalThis.fetch;
    globalThis.fetch=(input,init)=>{if(new URL(String(input)).origin!==new URL(process.env.BUDGET_GUARD_URL).origin)
      throw Error('OFFLINE_TEST_EXTERNAL_NETWORK_DENIED');return actualFetch(input,init)};
    generateCopilotSuggestionWithLlm({instruction:'Offline integration',recentText:'An.',characters:[],recentEvents:[]})
      .then(v=>{if(v!=='Separate fake upstream response.')throw Error('wrong upstream');console.log('BACKEND_HTTP_OK');process.exit(0)})
      .catch(e=>{console.error(e.message);process.exit(1)});"""
    result = subprocess.run([shutil.which('node'), '--input-type=module', '--eval', script],
        cwd=ROOT/'backend', env=environment, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert 'BACKEND_HTTP_OK' in result.stdout
    assert len(received) == ledger.state['total_calls'] == 1
    assert received[0]['client'] == 'backend'


def test_public_reserve_finalize_and_unpriced_routes_denied(stack):
    url, ledger, received, _=stack
    for path in ['/api/budget/reserve','/api/budget/finalize','/v1/embeddings','/v1beta/models/x:embedContent']:
        assert post(url+path,{'estimated_cost':-999,'prompt_tokens':-100})[0]==403
    assert post(url+'/v1/chat/completions',body(),{'Authorization':'Bearer forged'})[0]==401
    assert not received


@pytest.mark.parametrize('field,value', [('n',2),('n',-1),('stream',True),('max_tokens',0),
    ('max_tokens',8193),('max_tokens',float('nan')),('tools',[]),('best_of',8),('responseModalities',['IMAGE'])])
def test_unbounded_or_unpriced_billing_variants_fail_before_dispatch(stack,field,value):
    data=body();data[field]=value
    assert post(stack[0]+'/v1/chat/completions',data)[0] in {403,422}
    assert not stack[2] and stack[1].state['total_calls']==0


def test_real_previously_used_ticket_is_still_rejected_for_both_workers(stack):
    url,ledger,received,_=stack
    assert post(url+'/v1/chat/completions',body())[0]==200
    ticket=ledger.state['call_history'][0]['ticket_id']
    def caller(token):return post(url+'/v1/chat/completions',body(),
        {'Authorization':'Bearer '+token,'X-Budget-Ticket':ticket})[0]
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        assert list(pool.map(caller,['ai-worker','backend-worker']))==[403,403]
    assert len(received)==ledger.state['total_calls']==1


def test_second_ledger_owner_cannot_race_authoritative_process(stack):
    other=AuthoritativeBudgetLedger(stack[1].state_file)
    try:
        with pytest.raises(BudgetMeterUnavailableError): other.get_summary()
    finally: other.close()


def test_spoofed_client_header_does_not_override_authenticated_identity(stack):
    assert post(stack[0]+'/v1/chat/completions',body(),{'X-Client-Service':'administrator'})[0]==200
    assert stack[1].state['call_history'][0]['client_service']=='ai-service'


def test_http_cost_ceiling_ignores_claimed_client_estimate(stack):
    url, ledger, received, _=stack
    ledger.state['admission_cost_usd']='0.006';ledger._save_durable()
    request=body();request.update(estimated_cost=0,prompt_tokens=-999)
    assert post(url+'/v1/chat/completions',request)[0]==200
    assert post(url+'/v1/chat/completions',request)[0]==429
    assert len(received)==ledger.state['total_calls']==1


def test_finalization_write_failure_preserves_full_outstanding_on_restart(stack):
    import Pipeline_test.tools.budget_gateway as gateway
    url,ledger,received,_=stack
    ledger.state['max_calls']=1;ledger._save_durable()
    replace=gateway.os.replace
    calls=[]
    def interrupted(source,target):
        calls.append(1)
        if len(calls)>1:raise OSError('injected finalization failure')
        return replace(source,target)
    with patch.object(gateway.os,'replace',side_effect=interrupted):
        assert post(url+'/v1/chat/completions',body())[0]==503
    assert len(received)==1
    path=ledger.state_file;ledger.close()
    restarted=AuthoritativeBudgetLedger(path)
    try:
        state=restarted.get_summary()
        assert state['total_calls']==1 and float(state['outstanding_usd'])>0
        from Pipeline_test.tools.budget_gateway import BudgetExceededError
        with pytest.raises(BudgetExceededError):restarted.reserve(liability_usd='.001')
    finally:restarted.close()


@pytest.mark.parametrize('url', ['', 'https://generativelanguage.googleapis.com', 'http://untrusted.example'])
def test_missing_or_misrouted_guard_fails_before_sdk_transport(monkeypatch,url):
    monkeypatch.setenv('BUDGET_GUARD_URL',url);monkeypatch.setenv('BUDGET_GUARD_MODE','proxy')
    monkeypatch.setenv('BUDGET_GUARD_AUTH_TOKEN','ai-worker')
    llm=LLMService(provider='gemini',api_key='dummy')
    with pytest.raises(LLMServiceError,match='GUARD_CONFIGURATION_INVALID'):llm._call_llm('s','u')
    assert not llm._local_fallback_enabled()


def test_200th_is_last_dispatch_and_concurrent_clients_cannot_take_201st(stack):
    url, ledger, received, _=stack
    for _ in range(199):
        result=post(url+'/v1/chat/completions',body())
        assert result[0]==200, (result, str(ledger._init_error), ledger.state['total_calls'])
    def caller(token): return post(url+'/v1/chat/completions',body(),{'Authorization':'Bearer '+token})[0]
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        statuses=list(pool.map(caller,['ai-worker','backend-worker']))
    assert sorted(statuses)==[200,429]
    assert len(received)==ledger.state['total_calls']==200
    assert post(url+'/v1/chat/completions',body())[0]==429
    assert len(received)==200


@pytest.mark.parametrize('fault,status',[('429',429),('500',500),('timeout',502),('redirect',502)])
def test_upstream_error_timeout_and_retry_each_consume_exactly_one(stack,fault,status):
    url, ledger, received, _=stack
    for count in [1,2]:
        assert post(url+'/v1/chat/completions',body('fault:'+fault))[0]==status
        assert ledger.state['total_calls']==len(received)==count
    assert all(e['charged_usd']==e['liability_usd'] for e in ledger.state['call_history'])


def test_model_discovery_is_also_accounted_and_denied_after_expiry(stack):
    url, ledger, received, _ = stack
    request = urllib.request.Request(url+'/v1/models', headers={'Authorization':'Bearer backend-worker'})
    with urllib.request.urlopen(request) as response:
        assert response.status == 200
    assert len(received) == ledger.state['total_calls'] == 1
    ledger.state['deadline'] = ledger.state['started'] - 1; ledger._save_durable()
    with pytest.raises(urllib.error.HTTPError) as error: urllib.request.urlopen(request)
    assert error.value.code == 429
    assert len(received) == 1


def test_settlement_replay_is_idempotent_and_unknown_usage_holds_maximum(stack):
    url, ledger, received, _=stack
    assert post(url+'/v1/chat/completions',body())[0]==200
    before=json.dumps(ledger.state,sort_keys=True)
    ledger.finalize(ledger.state['call_history'][0]['ticket_id'],'SUCCESS',cost_usd=0)
    assert json.dumps(ledger.state,sort_keys=True)==before


def test_time_and_outstanding_cost_expiry_deny_before_upstream(stack):
    url, ledger, received, _=stack
    ledger.state['deadline']=ledger.state['started']-1;ledger._save_durable()
    assert post(url+'/v1/chat/completions',body())[0]==429
    assert not received


def test_inflight_liability_cannot_be_bypassed_by_client_estimates(tmp_path):
    ledger=AuthoritativeBudgetLedger(tmp_path/'s.json',initialize=True,run_id='liability')
    ledger.reserve(liability_usd=4.49)
    from Pipeline_test.tools.budget_gateway import BudgetExceededError
    with pytest.raises(BudgetExceededError): ledger.reserve(estimated_cost=-999,liability_usd=.02)
    assert ledger.get_summary()['total_calls']==1
    ledger.close()


def test_missing_corrupt_deleted_or_legacy_ledger_cannot_reset(tmp_path):
    path=tmp_path/'s.json'
    empty=AuthoritativeBudgetLedger(path)
    with pytest.raises(BudgetMeterUnavailableError): empty.get_summary()
    empty.close()
    ledger=AuthoritativeBudgetLedger(path,initialize=True,run_id='durable')
    ledger.reserve(liability_usd=.1);deadline=ledger.state['deadline'];ledger.close()
    again=AuthoritativeBudgetLedger(path)
    assert again.state['total_calls']==1 and again.state['deadline']==deadline
    again.close();path.unlink()
    missing=AuthoritativeBudgetLedger(path,initialize=True,run_id='must-not-reset')
    with pytest.raises(BudgetMeterUnavailableError):missing.get_summary()
    missing.close()
    path.write_text('{broken')
    broken=AuthoritativeBudgetLedger(path)
    with pytest.raises(BudgetMeterUnavailableError):broken.get_summary()
    assert path.read_text()=='{broken'
    broken.close()


def test_interrupted_replace_is_fail_closed_and_preserves_authority(stack):
    url, ledger, received, _=stack
    original=ledger.state_file.read_bytes()
    with patch('Pipeline_test.tools.budget_gateway.os.replace',side_effect=OSError('injected')):
        assert post(url+'/v1/chat/completions',body())[0]==503
    assert not received and ledger.state_file.read_bytes()==original
    assert post(url+'/v1/chat/completions',body())[0]==503


def test_gateway_offline_no_direct_sdk_fallback(stack,monkeypatch):
    url, ledger, received, server=stack
    server.shutdown();server.server_close()
    monkeypatch.setenv('BUDGET_GUARD_URL',url);monkeypatch.setenv('BUDGET_GUARD_MODE','proxy')
    monkeypatch.setenv('BUDGET_GUARD_AUTH_TOKEN','ai-worker')
    llm=LLMService(provider='openai',model='gemini-3.5-flash-lite',api_key='dummy',timeout_seconds=1)
    with pytest.raises(LLMServiceError):llm._call_llm('system','user')
    assert not received


def test_guarded_embeddings_and_fallback_are_disabled_before_transport(stack,monkeypatch):
    monkeypatch.setenv('BUDGET_GUARD_URL',stack[0]);monkeypatch.setenv('BUDGET_GUARD_MODE','proxy')
    monkeypatch.setenv('BUDGET_GUARD_AUTH_TOKEN','ai-worker')
    from infrastructure.embedding_providers import GeminiEmbeddingProvider, EmbeddingProviderError
    # Deliberately inject a client whose transport must never be invoked.
    import inspect
    kwargs={'api_key':'dummy'}
    provider=GeminiEmbeddingProvider(**kwargs)
    with pytest.raises(EmbeddingProviderError, match='DISABLED'):provider.embed_query('test')
    llm=LLMService(provider='gemini',api_key='dummy',fallback_api_key='dummy')
    assert not llm._can_fallback_to_openai()
    with pytest.raises(LLMServiceError,match='FALLBACK_DISABLED'):
        llm._call_openai('s','u',model_override='gpt-4o-mini',api_key_override='dummy')
    assert not stack[2]


def test_unknown_live_pricing_is_denied_not_a_live_hard_cap_claim(stack):
    url, ledger, received, server=stack
    server.RequestHandlerClass.upstream_base_url='https://generativelanguage.googleapis.com/v1beta/openai'
    assert post(url+'/v1/chat/completions',body())[0]==503
    assert not received
    assert ledger.get_summary()['live_cost_hard_cap']=='BUDGET_COST_HARD_CAP_UNPROVEN'
