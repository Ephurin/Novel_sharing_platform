import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
REG03_DIR = RUN_DIR / 'evidence' / 'memory' / 'REG-03'

before = json.loads((REG03_DIR / 'probe-official-memory-before.json').read_text(encoding='utf-8'))
after = json.loads((REG03_DIR / 'probe-official-memory-after.json').read_text(encoding='utf-8'))
ctx = json.loads((REG03_DIR / 'probe-context-preview.json').read_text(encoding='utf-8'))

print("=== REG-03 Supersession & Context Verification ===")

print(f"\nBefore Supersession: {len(before['events'])} events, {len(before['facts'])} facts")
for e in before['events']:
    print(f"  [Event {e['event_id'][:8]}] {e['summary']}")
for f in before['facts']:
    print(f"  [Fact {f.get('id', '')[:8]}] {f.get('fact_key')}: {f.get('fact_value')}")

print(f"\nAfter Supersession: {len(after['events'])} events, {len(after['facts'])} facts")
print("Events in Active Memory:")
for e in after['events']:
    sup = e.get('metadata', {}).get('supersedes_id')
    print(f"  [Event {e['event_id'][:8]}] supersedes={sup[:8] if sup else None} | {e['summary']}")

print("Facts in Active Memory:")
for f in after['facts']:
    sup = f.get('supersedes_id')
    print(f"  [Fact {f.get('id', '')[:8]}] supersedes={sup[:8] if sup else None} | {f.get('fact_key')}: {f.get('fact_value')}")

print("\nEvents in Context Preview (Packed for Generation):")
for e in ctx.get('recent_events', []):
    print(f"  [Event {e.get('event_id', '')[:8]}] {e.get('summary')}")

print("\nFacts in Context Preview (Packed for Generation):")
for r in ctx.get('world_rules', []):
    print(f"  [Rule {r.get('fact_id', '')[:8]}] {r.get('statement')}")

# Assertions
active_event_summaries = [e['summary'] for e in after['events']]
# 1. Active memory contains the 15-day version
has_15_days = any('mười lăm' in s or 'fifteen' in s.lower() for s in active_event_summaries)
print(f"\nAssertion 1 (Active memory contains 15-day version): {'PASS' if has_15_days else 'FAIL'}")

# 2. Supersedes_id points to old event 955aebb2
has_supersedes_link = any(e.get('metadata', {}).get('supersedes_id') == '955aebb2-ca06-5f04-a9c0-d1aaeca8b9a4' for e in after['events'])
print(f"Assertion 2 (Event replacement links to 955aebb2 via supersedes_id): {'PASS' if has_supersedes_link else 'FAIL'}")

# 3. Unchanged event 2 is retained
has_event2 = any('d46e8f91' in e['event_id'] for e in after['events'])
print(f"Assertion 3 (Unchanged Event 2 retained with same ID): {'PASS' if has_event2 else 'FAIL'}")

# 4. Context preview contains 15-day version and excludes duplicate/stale version
ctx_event_summaries = [e.get('summary', '') for e in ctx.get('recent_events', [])]
ctx_has_15 = any('mười lăm' in s or 'fifteen' in s.lower() for s in ctx_event_summaries)
ctx_has_no_duplicates = len([e for e in ctx_event_summaries if 'hợp đồng' in e.lower() or 'contract' in e.lower()]) <= 1
print(f"Assertion 4 (Context preview has 15-day version and excludes old version without duplicate): {'PASS' if ctx_has_15 and ctx_has_no_duplicates else 'FAIL'}")
