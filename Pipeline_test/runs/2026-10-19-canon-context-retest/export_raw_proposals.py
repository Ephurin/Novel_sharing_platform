import json
import pathlib
import subprocess
import sys

run_dir = pathlib.Path(__file__).resolve().parent
evidence_dir = run_dir / 'evidence'
p1_m0_dir = evidence_dir / 'memory' / 'P1-M0'
p1_m0_dir.mkdir(parents=True, exist_ok=True)

novel_id = '735c3109-c0be-4512-96cf-da7382ce8d56'

sql = f"""
SELECT json_agg(p) FROM (
    SELECT 
        p.id,
        p.analysis_run_id,
        p.story_brain_id,
        p.novel_id,
        p.dependency_group_id,
        p.materialization_order,
        p.proposal_type,
        p.status,
        p.payload,
        p.evidence,
        p.confidence,
        p.expected_brain_version,
        p.decision_reason,
        p.created_at,
        p.updated_at
    FROM narrative.proposals p
    WHERE p.novel_id = '{novel_id}'
    ORDER BY p.materialization_order, p.created_at, p.id
) p;
"""

cmd = ['docker', 'exec', 'ephurin-ui-retest-postgres-1', 'psql', '-U', 'postgres', '-d', 'ephurin', '-t', '-c', sql]
res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')

if res.returncode != 0:
    print("Error querying proposals:", res.stderr)
    sys.exit(1)

raw_json = res.stdout.strip()
proposals = json.loads(raw_json)
print(f"Total raw proposals retrieved: {len(proposals)}")

# Save to evidence
(evidence_dir / 'raw-proposals.json').write_text(json.dumps(proposals, indent=2, ensure_ascii=False), encoding='utf-8')
(p1_m0_dir / 'raw-proposals.json').write_text(json.dumps(proposals, indent=2, ensure_ascii=False), encoding='utf-8')
print("Saved raw proposals to evidence/raw-proposals.json and evidence/memory/P1-M0/raw-proposals.json")

# Summary by type
by_type = {}
for p in proposals:
    pt = p['proposal_type']
    by_type[pt] = by_type.get(pt, 0) + 1
print("Summary by proposal_type:", by_type)
