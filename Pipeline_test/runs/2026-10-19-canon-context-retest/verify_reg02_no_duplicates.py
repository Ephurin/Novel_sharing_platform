import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
REG02_DIR = RUN_DIR / 'evidence' / 'memory' / 'REG-02'

before = json.loads((REG02_DIR / 'official-memory-before.json').read_text(encoding='utf-8'))
after = json.loads((REG02_DIR / 'official-memory-after.json').read_text(encoding='utf-8'))

b_events = {e.get('event_id') or e.get('id'): e for e in before.get('events', [])}
a_events = {e.get('event_id') or e.get('id'): e for e in after.get('events', [])}

b_facts = {f.get('fact_id') or f.get('id'): f for f in before.get('facts', [])}
a_facts = {f.get('fact_id') or f.get('id'): f for f in after.get('facts', [])}

print(f"Total Events: Before={len(b_events)} | After={len(a_events)}")
print(f"Total Facts:  Before={len(b_facts)} | After={len(a_facts)}")

# Check key assertions
targets = [
    ('An đón Linh', lambda e: 'An' in str(e.get('participants', [])) or 'đón' in e.get('summary', '').lower()),
    ('Gặp ông Hòa', lambda e: 'Hòa' in str(e.get('participants', [])) or 'hòa' in e.get('summary', '').lower()),
    ('Ký hợp đồng', lambda e: 'hợp đồng' in e.get('summary', '').lower() or 'contract' in e.get('summary', '').lower()),
]

print("\n--- Events Verification ---")
for name, filter_fn in targets:
    b_matches = [e for e in b_events.values() if filter_fn(e)]
    a_matches = [e for e in a_events.values() if filter_fn(e)]
    eid = (a_matches[0].get('event_id') or a_matches[0].get('id', ''))[:8] if a_matches else 'none'
    print(f"{name}: Before count={len(b_matches)} | After count={len(a_matches)} | ID={eid}")

print("\n--- Key Facts Verification ---")
# Mai Lâm status=Dead
ml_b = [f for f in b_facts.values() if 'dead' in str(f.get('fact_value', '')).lower() or 'mai lâm' in str(f).lower()]
ml_a = [f for f in a_facts.values() if 'dead' in str(f.get('fact_value', '')).lower() or 'mai lâm' in str(f).lower()]
print(f"Mai Lâm=Dead: Before count={len(ml_b)} | After count={len(ml_a)}")

# An age=19
an_b = [f for f in b_facts.values() if f.get('fact_key') == 'age' and str(f.get('fact_value')) == '19']
an_a = [f for f in a_facts.values() if f.get('fact_key') == 'age' and str(f.get('fact_value')) == '19']
print(f"An age=19: Before count={len(an_b)} | After count={len(an_a)}")

# Contract duration=12
ct_b = [f for f in b_facts.values() if '12' in str(f.get('fact_value')) and 'duration' in f.get('fact_key', '')]
ct_a = [f for f in a_facts.values() if '12' in str(f.get('fact_value')) and 'duration' in f.get('fact_key', '')]
print(f"Contract 12 days: Before count={len(ct_b)} | After count={len(ct_a)}")
