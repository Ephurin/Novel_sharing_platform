"""Read-only post-rollout observations. Never calls generation or changes author data."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request

root = Path(__file__).resolve().parents[2]
output = root / 'Pipeline_test/runs/2026-10-19-canon-context-repair/evidence'
novel = '46642ff1-5bac-4513-98fd-ffe1be6cb318'


def get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=30) as response:
        return response.read()


headers = {'X-Service-Token': os.environ.get('PLATFORM_SERVICE_TOKEN', 'test-token'),
           'X-Tenant-Id': '00000000-0000-0000-0000-000000000001', 'X-Request-Id': 'canon-context-readonly'}
result = {'at': datetime.datetime.now().astimezone().isoformat(), 'context': {}, 'generation_calls': 0,
          'novel_writes': 0, 'live_ui': 'NOT_RUN', 'real_provider_reconciliation': 'NOT_RUN'}
for budget in [4000, 8192]:
    query = urllib.parse.urlencode({'chapter_number': 5, 'character_name': 'Linh', 'token_budget': budget})
    package = json.loads(get(f'http://localhost:18000/v1/story-brains/{novel}/context-preview?{query}', headers))['data']
    (output / f'context-{budget}.json').write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding='utf-8')
    result['context'][str(budget)] = {'entities': len(package['entities']), 'events': len(package['recent_events']),
        'facts': len(package['world_rules']), 'estimated_tokens': package['token_budget']['used'],
        'packing_version': package['token_budget']['packing_version']}
    assert package['world_rules'] and package['recent_events']
    assert package['token_budget']['used'] <= budget
files = {'ai-service': ['services/canon_reconciliation.py', 'domain/canon_identity.py',
          'application/context_budget.py', 'services/prose_facts.py', 'application/revision_analysis_service.py',
          'core/llm_service.py', 'domain/projection.py', 'infrastructure/postgres_narrative_repository.py'],
         'backend': ['src/modules/ai/proposal-evidence.service.ts', 'src/modules/ai/ai-gateway.controller.ts']}
result['fingerprints'] = {}
for service, paths in files.items():
    for path in paths:
        remote = ('/app/backend/' if service == 'backend' else '/app/') + path
        digest = subprocess.check_output(['docker', 'exec', f'ephurin-ui-retest-{service}-1', 'sha256sum', remote], text=True, timeout=15).split()[0]
        local = hashlib.sha256((root / service / path).read_bytes()).hexdigest()
        assert digest == local, path
        result['fingerprints'][f'{service}/{path}'] = digest
sql = "BEGIN READ ONLY; SELECT version_num FROM alembic_version; SELECT 'independent',status,count(*) FROM narrative.proposals WHERE novel_id='46642ff1-5bac-4513-98fd-ffe1be6cb318' GROUP BY status ORDER BY status; SELECT 'reader03',status,count(*) FROM narrative.proposals WHERE novel_id='06a979c5-b089-4648-a04e-81383aa7b119' GROUP BY status ORDER BY status; COMMIT;"
result['database'] = subprocess.check_output(['docker', 'exec', 'ephurin-ui-retest-postgres-1', 'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc', sql], text=True, timeout=20).splitlines()
assert '0010_fact_supersession' in result['database']
assert 'independent|pending|26' in result['database'] and 'independent|accepted|152' in result['database']
html = get('http://localhost:18080').decode()
asset = re.search(r'src="([^"]+\.js)"', html).group(1)
bundle = get('http://localhost:18080' + asset).decode()
assert 'Phân tích lại chương đang mở' in bundle and 'Đã có trong canon' in bundle
result['web_asset'] = asset
(output / 'runtime.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
