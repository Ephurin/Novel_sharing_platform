"""Read-only checks after the S03 repair rollout. Does not call a model."""
import datetime
import hashlib
import json
import re
import subprocess
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'Pipeline_test/runs/2026-10-18-memory-repair/evidence/runtime.json'


def get(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read().decode()


spec = json.loads(get('http://localhost:18000/openapi.json'))
asset = re.search(r'src="([^"]+\.js)"', get('http://localhost:18080')).group(1)
bundle = get('http://localhost:18080' + asset)
files = {
    'ai-service': ['application/revision_analysis_service.py', 'services/prose_facts.py', 'services/source_grounding.py', 'core/llm_service.py', 'domain/projection.py'],
    'backend': ['src/modules/ai/ai-gateway.controller.ts'],
}
hashes = {}
for service, paths in files.items():
    for path in paths:
        runtime_path = ('/app/backend/' if service == 'backend' else '/app/') + path
        actual = subprocess.check_output(['docker', 'exec', f'ephurin-ui-retest-{service}-1', 'sha256sum', runtime_path], text=True, timeout=20).split()[0]
        expected = hashlib.sha256((root / service / path).read_bytes()).hexdigest()
        hashes[service + '/' + path] = {'sha256': actual, 'matches': actual == expected}
sql = "SELECT status,count(*) FROM narrative.proposals GROUP BY status ORDER BY status; SELECT count(*) FROM narrative.autonomous_runs WHERE status='running';"
counts = subprocess.check_output(['docker', 'exec', 'ephurin-ui-retest-postgres-1', 'psql', '-U', 'postgres', '-d', 'ephurin', '-Atc', sql], text=True, timeout=20).splitlines()
result = {'at': datetime.datetime.now().astimezone().isoformat(), 'web': 'http://localhost:18080', 'asset': asset,
          'author_proposals_route': '/v1/story-brains/{novel_id}/author-proposals' in spec['paths'],
          'repair_ui_in_bundle': 'Tạo đề xuất để duyệt' in bundle,
          'facts_ui_in_bundle': 'Dữ kiện' in bundle, 'hashes': hashes, 'queue_and_running_counts': counts,
          'generation_calls': 0, 'live_ui': 'NOT_RUN', 'real_provider_extraction': 'NOT_RUN'}
assert result['author_proposals_route'] and result['repair_ui_in_bundle'] and result['facts_ui_in_bundle']
assert all(h['matches'] for h in hashes.values())
assert counts == ['accepted|26', 'pending|65', 'rejected|2', '0'], counts
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
