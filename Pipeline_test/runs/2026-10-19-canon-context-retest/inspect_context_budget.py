import json
import pathlib
import sys
import urllib.request

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'
CTX_DIR = EVIDENCE_DIR / 'context'
CTX_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

for budget in [4000, 8192]:
    url = f'http://localhost:18000/v1/story-brains/{NOVEL_ID}/context-preview?chapter_number=5&token_budget={budget}&character_name=Linh'
    headers = {
        'Authorization': 'Bearer test-token',
        'X-Service-Token': 'test-token',
        'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
        'X-Request-Id': f'req-ctx-preview-{budget}'
    }
    req = urllib.request.Request(url, headers=headers)
    res = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    data = res.get('data', res)
    
    # Save payload
    payload_file = CTX_DIR / f'context_preview_{budget}.json'
    payload_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"\n=================== BUDGET {budget} ===================")
    print(f"Saved payload to {payload_file}")
    print(f"Brain Version: {data.get('brain_version')}")
    print(f"Token Budget: {data.get('token_budget')}")
    print(f"Entities Count: {len(data.get('entities', []))}")
    print(f"Current States Count: {len(data.get('current_states', []))}")
    print(f"Recent Events Count: {len(data.get('recent_events', []))}")
    print(f"Semantic Memories Count: {len(data.get('semantic_memories', []))}")
    print(f"World Rules Count: {len(data.get('world_rules', []))}")
    print(f"Author Constraints Count: {len(data.get('author_constraints', []))}")
    
    # Inspect sample events
    events = data.get('recent_events', [])
    print(f"\nSample Events in Context ({len(events)}):")
    for e in events[:5]:
        print(f"  - Ch {e.get('chapter', e.get('chapter_number'))}: {e.get('summary', '')[:80]}")
        
    # Inspect sample current states / facts
    states = data.get('current_states', [])
    print(f"\nSample Current States / Facts ({len(states)}):")
    for s in states[:8]:
        subj = s.get('entity_name') or s.get('subject_name') or s.get('entity_id')
        attr = s.get('attribute') or s.get('fact_key')
        val = s.get('value') or s.get('fact_value')
        cert = s.get('certainty') or s.get('status')
        print(f"  - {subj} | {attr}: {val} (certainty: {cert})")
        
    # Check dropped / packing info if available
    summary = data.get('context_summary') or {}
    print(f"\nContext Summary: {json.dumps(summary, indent=2, ensure_ascii=False)}")
