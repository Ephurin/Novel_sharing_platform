import json
import pathlib
import sys
import urllib.request

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'
P1_M0_DIR = EVIDENCE_DIR / 'memory' / 'P1-M0'
P1_M0_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

url = f'http://localhost:18000/v1/story-brains/{NOVEL_ID}/memory'
headers = {
    'Authorization': 'Bearer test-token',
    'X-Service-Token': 'test-token',
    'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
    'X-Request-Id': 'req-export-approved-memory'
}

req = urllib.request.Request(url, headers=headers)
raw = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
data = raw.get('data', raw)

# Save to evidence
(P1_M0_DIR / 'readonly-after-author-review.json').write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
(P1_M0_DIR / 'approved-memory.json').write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')

print("Approved memory exported successfully.")
print(f"Entities: {len(data.get('entities', []))}")
print(f"Events: {len(data.get('events', []))}")
print(f"Facts: {len(data.get('facts', []))}")
print(f"Transitions: {len(data.get('transitions', []))}")
print(f"Current States: {len(data.get('current_state', {}).get('entities', {}))}")
