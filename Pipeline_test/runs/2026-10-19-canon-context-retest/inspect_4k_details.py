import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
CTX_DIR = RUN_DIR / 'evidence' / 'context'

for budget in [4000, 8192]:
    ctx = json.loads((CTX_DIR / f'context_preview_{budget}.json').read_text(encoding='utf-8'))
    print(f"\n=================== BUDGET {budget} DETAILS ===================")
    print("--- RECENT EVENTS ---")
    for e in ctx.get('recent_events', []):
        ch = e.get('chapter', e.get('chapter_number', '?'))
        print(f"  [Ch {ch}] {e.get('summary')}")
        
    print("\n--- CURRENT STATES ---")
    for s in ctx.get('current_states', []):
        name = s.get('entity_name') or s.get('subject_name')
        attr = s.get('attribute') or s.get('fact_key')
        val = s.get('value') or s.get('fact_value')
        cert = s.get('certainty') or s.get('status')
        print(f"  [{cert}] {name} -> {attr}: {val}")
        
    print("\n--- ENTITIES ---")
    for ent in ctx.get('entities', []):
        print(f"  {ent.get('canonical_name')} ({ent.get('entity_type')})")
        
    print("\n--- TOKEN USAGE & DROP STATS ---")
    summary = ctx.get('context_summary') or {}
    print(f"Estimated Tokens: {summary.get('estimated_tokens')}")
    print(f"Selected IDs Count: {len(summary.get('selected_ids', []))}")
    drop_reasons = summary.get('drop_reasons', {})
    print(f"Dropped IDs Count: {len(drop_reasons)}")
    from collections import Counter
    reason_counts = Counter(drop_reasons.values())
    for r, c in reason_counts.items():
        print(f"  Reason '{r}': {c} items")
