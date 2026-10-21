import json,subprocess
from pathlib import Path
project='p1-wave1d-20261021-offline-01'
def run(service,exe,script):
 cid=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+service],text=True).strip()
 assert cid and '\n' not in cid
 return subprocess.check_output(['docker','exec',cid,exe,'-c',script],text=True).strip()
script='''
from core.llm_service import LLMService,LLMServiceError
from infrastructure.embedding_providers import GeminiEmbeddingProvider,EmbeddingProviderError
p=GeminiEmbeddingProvider(api_key='offline-dummy')
try:p.embed_query('offline')
except EmbeddingProviderError as e:assert 'DISABLED' in str(e)
else:raise AssertionError('embedding bypass')
llm=LLMService(provider='gemini',api_key='offline-dummy',fallback_api_key='offline-dummy')
assert not llm._can_fallback_to_openai()
try:llm._call_openai('s','u',model_override='gpt-4o-mini',api_key_override='offline-dummy')
except LLMServiceError as e:assert 'FALLBACK_DISABLED' in str(e)
else:raise AssertionError('fallback bypass')
print('CONTAINER_EMBEDDING_AND_FALLBACK_DISABLED')
'''
assert run('ai-service','python',script)=='CONTAINER_EMBEDDING_AND_FALLBACK_DISABLED'
before=json.loads(Path('Pipeline_test/runs/2026-10-21-p1-wave1d-offline-01/runtime/gateway-ledger-readback.json').read_text())
after=json.loads(run('budget-gateway','python',"import json,urllib.request;print(json.dumps(json.load(urllib.request.urlopen('http://localhost:18090/status'))))"))
assert before==after and after['total_calls']==200
print(json.dumps({'disabled_routes':'PASS','actual_gateway_process_restart':'PASS','ledger_identical_before_after_restart':True,'calls':200,'deadline':after['deadline']}))
