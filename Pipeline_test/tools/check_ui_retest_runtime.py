"""Read-only runtime preflight; no generation, author writes or secrets output."""
import datetime
import json
from pathlib import Path
import re
import urllib.request


def get(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        return response.read().decode()


base = 'http://localhost:18080'
spec = json.loads(get('http://localhost:18000/openapi.json'))
asset = re.search(r'src="([^"]+\.js)"', get(base)).group(1)
bundle = get(base + asset)
result = {
    'checked_at': datetime.datetime.now().astimezone().isoformat(),
    'web_url': base,
    'asset': asset,
    'memory_panel_marker': 'Bộ nhớ truyện' in bundle,
    'memory_route': '/v1/story-brains/{novel_id}/memory' in spec['paths'],
    'author_operation_route': '/v1/story-brains/{novel_id}/author-operation' in spec['paths'],
    'idea_mode': spec['components']['schemas']['IdeaBootstrapRequest']['properties'].get('mode'),
    'provider_health': json.loads(get(base + '/api/v1/ai/health')),
}
output = Path(__file__).resolve().parents[1] / 'runs/2026-10-18-ui-retest-01/evidence/rollout-preflight.json'
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
