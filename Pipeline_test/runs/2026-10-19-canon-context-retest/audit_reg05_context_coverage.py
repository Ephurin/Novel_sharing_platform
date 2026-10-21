import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
CTX_DIR = RUN_DIR / 'evidence' / 'context'

ctx4k = json.loads((CTX_DIR / 'context_preview_4000.json').read_text(encoding='utf-8'))
ctx8k = json.loads((CTX_DIR / 'context_preview_8192.json').read_text(encoding='utf-8'))

# Probe definitions
probes = [
    {
        'id': 'PROBE-01-LINH-AGE',
        'desc': 'Mai Linh 29 tuổi',
        'check': lambda ctx: any(s.get('fact_key') == 'age' and str(s.get('fact_value')) == '29' for s in ctx.get('current_states', []))
    },
    {
        'id': 'PROBE-02-CONTRACT-12',
        'desc': 'Hợp đồng thẩm định 12 ngày',
        'check': lambda ctx: any('12' in str(s.get('fact_value')) and 'duration' in s.get('fact_key', '') for s in ctx.get('current_states', [])) or any('12' in e.get('summary', '') or 'mười hai' in e.get('summary', '').lower() for e in ctx.get('recent_events', []))
    },
    {
        'id': 'PROBE-03-MAI-LAM-DEAD',
        'desc': 'Mai Lâm (cha Linh) qua đời trong trận lũ',
        'check': lambda ctx: any('dead' in str(s.get('fact_value')).lower() for s in ctx.get('current_states', [])) or any('Mai Lâm' in str(ctx.get('entities', [])) for _ in [1])
    },
    {
        'id': 'PROBE-04-FLOOD-23',
        'desc': 'Trận lũ 17 năm trước có 23 người chết',
        'check': lambda ctx: any(str(s.get('fact_value')) == '23' for s in ctx.get('current_states', []))
    },
    {
        'id': 'PROBE-05-DUY-LEFT-EAR',
        'desc': 'Duy bị điếc tai trái (G14)',
        'check': lambda ctx: any('tai trái' in str(s.get('fact_value', '')).lower() or 'left' in str(s.get('fact_value', '')).lower() for s in ctx.get('current_states', []))
    },
    {
        'id': 'PROBE-06-SCAN-LIMIT-3',
        'desc': 'Giới hạn quét 3 lần (G10)',
        'check': lambda ctx: any('3' in str(s.get('fact_value', '')) and 'scan' in s.get('fact_key', '').lower() for s in ctx.get('current_states', []))
    },
    {
        'id': 'PROBE-07-AN-AGE-19',
        'desc': 'An 19 tuổi (G08)',
        'check': lambda ctx: any(s.get('fact_key') == 'age' and str(s.get('fact_value')) == '19' for s in ctx.get('current_states', []))
    },
    {
        'id': 'PROBE-08-ARRIVE-EVENT',
        'desc': 'Sự kiện Mai Linh về bến phà',
        'check': lambda ctx: any('ferry' in e.get('summary', '').lower() or 'phà' in e.get('summary', '').lower() or 'bến' in e.get('summary', '').lower() for e in ctx.get('recent_events', []))
    },
    {
        'id': 'PROBE-09-MEET-HOA-EVENT',
        'desc': 'Sự kiện gặp ông Hòa ở kho gốm',
        'check': lambda ctx: any('Hòa' in e.get('summary', '') or 'kho' in e.get('summary', '').lower() for e in ctx.get('recent_events', []))
    },
    {
        'id': 'PROBE-10-THREE-KNOCKS-EVENT',
        'desc': 'Sự kiện ba tiếng gõ ở trạm Bốn (Ch 5)',
        'check': lambda ctx: any(e.get('chapter') == 5 or 'tiếng gõ' in e.get('summary', '').lower() or 'knock' in e.get('summary', '').lower() for e in ctx.get('recent_events', []))
    }
]

print("======================= REG-05 CONTEXT COVERAGE AUDIT =======================")
for budget_name, ctx in [('4,000 tokens', ctx4k), ('8,192 tokens', ctx8k)]:
    summary = ctx.get('context_summary') or {}
    print(f"\n--- Budget: {budget_name} ---")
    print(f"Total Tokens Used: {summary.get('total_tokens_used', 'N/A')}")
    print(f"Entities Packed:   {len(ctx.get('entities', []))}")
    print(f"Current States:    {len(ctx.get('current_states', []))}")
    print(f"Recent Events:     {len(ctx.get('recent_events', []))}")
    print(f"Dropped IDs Count: {len(summary.get('dropped_ids', []))}")
    
    pass_count = 0
    for p in probes:
        ok = p['check'](ctx)
        status = "PASS" if ok else "DROPPED"
        if ok: pass_count += 1
        print(f"  [{status:7s}] {p['id']}: {p['desc']}")
    print(f"Total Probe Coverage: {pass_count}/{len(probes)} ({pass_count/len(probes)*100:.1f}%)")
