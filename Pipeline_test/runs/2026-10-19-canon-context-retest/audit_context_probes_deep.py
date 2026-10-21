import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
CTX_DIR = RUN_DIR / 'evidence' / 'context'

for budget in [4000, 8192]:
    ctx = json.loads((CTX_DIR / f'context_preview_{budget}.json').read_text(encoding='utf-8'))
    print(f"\n=================== BUDGET {budget} COMPREHENSIVE PROBE CHECK ===================")
    
    entities = ctx.get('entities', [])
    current_states = ctx.get('current_states', [])
    recent_events = ctx.get('recent_events', [])
    
    print(f"Entities ({len(entities)}): {[e.get('name') for e in entities]}")
    print(f"\nCurrent States Entities ({len(current_states)}): {[s.get('name') for s in current_states]}")
    
    # Check all probes
    print("\nProbe Verifications:")
    
    # 1. Linh & attributes
    linh_state = next((s for s in current_states if s.get('name') == 'Linh'), None)
    print("1. Linh State:", bool(linh_state))
    if linh_state:
        print("   Attributes:", list(linh_state.get('state', {}).keys()))
        print("   Recorded Data Storage (G16):", linh_state.get('state', {}).get('recorded_data_storage'))
        print("   Position relative to Duy (G14):", linh_state.get('state', {}).get('vị trí đứng so với Duy'))
        
    # 2. Duy & attributes
    duy_state = next((s for s in current_states if s.get('name') == 'Duy'), None)
    print("2. Duy State:", bool(duy_state))
    if duy_state:
        print("   Duy Attributes:", duy_state.get('state', {}))
        
    # 3. An & attributes
    an_state = next((s for s in current_states if s.get('name') == 'An'), None)
    print("3. An State:", bool(an_state))
    if an_state:
        print("   An Attributes:", an_state.get('state', {}))

    # 4. Mai Lâm (Dead)
    mai_lam = next((e for e in entities if 'Lâm' in e.get('name', '')), None)
    mai_lam_state = next((s for s in current_states if 'Lâm' in s.get('name', '')), None)
    print("4. Mai Lâm Status:", mai_lam.get('status') if mai_lam else (mai_lam_state.get('status') if mai_lam_state else 'Not in context'))

    # 5. Recent events coverage
    print(f"\n5. Recent Events ({len(recent_events)}):")
    for e in recent_events:
        print(f"   [Ch {e.get('chapter', e.get('chapter_number'))}] {e.get('summary')[:90]}")
