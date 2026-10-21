import json
import pathlib
import subprocess
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
REG02_DIR = RUN_DIR / 'evidence' / 'memory' / 'REG-02'
REG02_DIR.mkdir(parents=True, exist_ok=True)

ANALYSIS_RUN_ID = 'f47e19b4-1004-414d-972b-ec1729a1ae72'

cmd = [
    'docker', 'exec', 'ephurin-ui-retest-postgres-1',
    'psql', '-U', 'postgres', '-d', 'ephurin', '-t', '-A',
    '-c', f"""
    SELECT json_agg(p) FROM (
        SELECT id, analysis_run_id, story_brain_id, dependency_group_id, materialization_order,
               proposal_type, payload, evidence, confidence, status, expected_brain_version, created_at
        FROM narrative.proposals
        WHERE analysis_run_id = '{ANALYSIS_RUN_ID}'
        ORDER BY materialization_order ASC, created_at ASC
    ) p;
    """
]

raw_json = subprocess.check_output(cmd).decode('utf-8').strip()
proposals = json.loads(raw_json)

# Save to evidence
(REG02_DIR / 'raw-proposals.json').write_text(json.dumps(proposals, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"Exported {len(proposals)} proposals to {REG02_DIR / 'raw-proposals.json'}")

# Analyze proposals
by_type = {}
reused = []
new_items = []
superseded = []

for p in proposals:
    ptype = p['proposal_type']
    by_type[ptype] = by_type.get(ptype, 0) + 1
    payload = p.get('payload', {})
    
    if payload.get('reuse_artifact_id'):
        reused.append((p['id'], ptype, payload.get('name') or payload.get('summary') or payload.get('fact_key'), payload.get('reuse_artifact_id'), payload.get('reconciliation_reason')))
    elif payload.get('supersedes_id'):
        superseded.append((p['id'], ptype, payload.get('name') or payload.get('summary') or payload.get('fact_key'), payload.get('supersedes_id'), payload.get('reconciliation_reason')))
    else:
        new_items.append((p['id'], ptype, payload.get('name') or payload.get('summary') or payload.get('fact_key'), payload))

print("\nBy Type:", by_type)
print(f"\n--- REUSED (Canon Match / Giữ nguyên) ({len(reused)}) ---")
for r in reused:
    print(f"[{r[1]}] {r[2]} -> target: {r[3][:8]} | reason: {r[4]}")

print(f"\n--- NEW ITEMS ({len(new_items)}) ---")
for n in new_items:
    p = n[3]
    name = p.get('canonical_name') or p.get('fact_key') or p.get('summary')
    val = p.get('fact_value') or p.get('entity_type') or ''
    print(f"[{n[1]}] {name}: {val}")
