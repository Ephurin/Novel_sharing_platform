"""Container-only adversarial HTTP probes; creates fresh sub-ledgers, never resets a run.
Execute only inside the newly owned budget-gateway, after the 200/201 integration test.
"""
import json, os, sys, time, uuid
from pathlib import Path
from unittest.mock import patch
from urllib import request, error
sys.path.insert(0, '/tools')
from budget_gateway import AuthoritativeBudgetLedger, BudgetMeterUnavailableError, start_budget_gateway


def main():
    existing = json.loads(Path('/state/ledger.json').read_text())['state']
    assert existing['run_id'].startswith('p1-wave1d-')
    parent = Path('/state/probes') / str(uuid.uuid4()); parent.mkdir(parents=True, exist_ok=False)
    tokens = json.loads(os.environ['WORKER_AUTH_TOKENS'])
    token = next(k for k,v in tokens.items() if v == 'ai-service')
    upstream = os.environ['OFFLINE_UPSTREAM_URL']
    receipts_before = len(json.load(request.urlopen(upstream + '/received')))
    results = []
    def create(label, **limits):
        path = parent / (label + '.json')
        server, thread, ledger = start_budget_gateway(path, port=0, initialize=True,
            run_id=existing['run_id']+'-'+label, client_tokens=tokens,
            upstream_base_url=upstream, upstream_api_key=os.environ['OFFLINE_UPSTREAM_KEY'],
            upstream_timeout=.1, **limits)
        return server, ledger, path
    def post(server, text='offline', ticket=None):
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
        if ticket is not None: headers['X-Budget-Ticket']=ticket
        body={'model':'gemini-3.5-flash-lite','max_tokens':20,'messages':[{'role':'user','content':text}]}
        req=request.Request('http://127.0.0.1:'+str(server.server_address[1])+'/v1/chat/completions',data=json.dumps(body).encode(),headers=headers)
        try:
            with request.urlopen(req,timeout=3) as response:return response.status
        except error.HTTPError as exc:return exc.code
    def stop(server, ledger):server.shutdown();server.server_close();ledger.close()
    server, ledger, path = create('faults')
    for fault, expected in [('429',429),('500',500),('timeout',502),('redirect',502)]:
        before=ledger.state['total_calls']
        assert [post(server,'fault:'+fault) for _ in range(2)] == [expected,expected]
        assert ledger.state['total_calls']==before+2
        ticket=ledger.state['call_history'][-1]['ticket_id']
        charged=ledger.state['charged_usd'];ledger.finalize(ticket,'SUCCESS',cost_usd=0)
        assert ledger.state['charged_usd']==charged
        results.append({'case':'upstream_'+fault+'_retry','attempts':2,'status':'PASS'})
    assert post(server,ticket='invented-or-replayed')==403 and ledger.state['total_calls']==8
    results.append({'case':'untrusted_ticket_rejected','status':'PASS'})
    stop(server,ledger)
    for label in ('deadline','cost','write_failure'):
        server,ledger,path=create(label, **({'max_cost_usd':.01,'admission_cost_usd':.01} if label=='cost' else {}))
        if label=='deadline':
            ledger.state['deadline']=ledger.state['started']-1;ledger._save_durable()
        if label=='cost':ledger.reserve(liability_usd=.009)
        if label=='write_failure':
            with patch('budget_gateway.os.replace',side_effect=OSError('offline injected atomic write failure')):
                assert post(server)==503
        else:assert post(server)==429
        attempts=ledger.state['total_calls'];deadline=ledger.state['deadline']
        stop(server,ledger)
        reopened=AuthoritativeBudgetLedger(path)
        if label in ('deadline','cost'):
            assert reopened.state['total_calls']==attempts
            assert reopened.state['deadline']==deadline
        else:assert reopened.state['total_calls']==0
        reopened.close()
        results.append({'case':label+'_deny_and_restart','status':'PASS'})
    for label in ('missing','corrupt'):
        path=parent/(label+'.json');ledger=AuthoritativeBudgetLedger(path,initialize=True,run_id=existing['run_id']+'-'+label);ledger.close()
        if label=='missing':path.unlink()
        else:path.write_text('{corrupt')
        for initialize in (False,True):
            blocked=AuthoritativeBudgetLedger(path,initialize=initialize,run_id='forbidden-reset')
            try:blocked.get_summary()
            except BudgetMeterUnavailableError:pass
            else:raise AssertionError('Missing/corrupt ledger silently reset')
            finally:blocked.close()
        results.append({'case':label+'_restart_fails_closed','status':'PASS'})
    time.sleep(.6)
    receipts_after=len(json.load(request.urlopen(upstream+'/received')))
    assert receipts_after-receipts_before==8
    output={'status':'PASS','scope':'EXECUTED_IN_NEW_GATEWAY_CONTAINER_WITH_SEPARATE_FAKE_UPSTREAM',
            'project':existing['run_id'],'probe_directory':str(parent),'received_delta':8,'checks':results,
            'main_ledger_unchanged':json.loads(Path('/state/ledger.json').read_text())['state']==existing,
            'live_cost_hard_cap':'BUDGET_COST_HARD_CAP_UNPROVEN','external_provider_calls':0}
    (parent/'result.json').write_text(json.dumps(output,indent=2))
    print(json.dumps(output))

if __name__=='__main__':main()
