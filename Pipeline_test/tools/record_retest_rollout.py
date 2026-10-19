"""Record isolated rollout evidence without reading credentials."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
run = root / 'Pipeline_test/runs/2026-10-18-ui-retest-01'


def command(*args):
    return subprocess.check_output(args, text=True, timeout=20).strip()


files = {
    'backend/src/modules/ai/autonomous-controller.service.ts': ('ephurin-ui-retest-backend-1', '/app/backend/src/modules/ai/autonomous-controller.service.ts'),
    'backend/src/jobs/autonomous-processor.ts': ('ephurin-ui-retest-backend-1', '/app/backend/src/jobs/autonomous-processor.ts'),
    'ai-service/api/narrative_routes.py': ('ephurin-ui-retest-ai-service-1', '/app/api/narrative_routes.py'),
    'ai-service/application/author_workflow.py': ('ephurin-ui-retest-ai-service-1', '/app/application/author_workflow.py'),
}
fingerprints = {}
for local, (container, remote) in files.items():
    source_hash = hashlib.sha256((root / local).read_bytes()).hexdigest()
    runtime_hash = command('docker', 'exec', container, 'sha256sum', remote).split()[0]
    fingerprints[local] = {'source': source_hash, 'runtime': runtime_hash, 'match': source_hash == runtime_hash}
assert all(item['match'] for item in fingerprints.values())
sql = "SELECT version_num FROM alembic_version; SELECT extname,extversion FROM pg_extension WHERE extname='vector'; SELECT count(*) FROM narrative.autonomous_runs WHERE status='running';"
db = command('docker', 'exec', 'ephurin-ui-retest-postgres-1', 'psql', '-U', 'postgres', '-d', 'ephurin', '-Atc', sql)
assert db.splitlines() == ['0009_autonomous_runs', 'vector|0.8.6', '0']
now = datetime.datetime.now().astimezone().isoformat()
evidence = {'checked_at': now, 'fingerprints': fingerprints, 'database_checks': db.splitlines(),
            'containers': command('docker', 'ps', '--filter', 'label=com.docker.compose.project=ephurin-ui-retest', '--format', '{{.Names}} {{.Status}} {{.Ports}}').splitlines(),
            'ui_automation': 'BLOCKED_TOOL_INITIALIZATION_OS_ERROR_3', 'generation_calls': 0,
            'demo_application_services': 'STOPPED; existing running autonomous job found; demo DB services restored'}
(run / 'evidence/rollout-runtime.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
for name in ['checkpoint.json', 'run_config.json']:
    path = run / name
    data = json.loads(path.read_text(encoding='utf-8'))
    data['rollout'] = {'at': now, 'status': 'ENVIRONMENT_READY_UI_NOT_RUN', 'compose_project': 'ephurin-ui-retest',
                       'web_url': 'http://localhost:18080', 'backend_url': 'http://localhost:14000/api/v1',
                       'ai_url': 'http://localhost:18000', 'evidence': ['evidence/rollout-preflight.json', 'evidence/rollout-runtime.json']}
    if name == 'checkpoint.json':
        data['updated_at'] = now
        data['next_action'] = 'Use isolated web http://localhost:18080. Sign in through UI, create a new project and begin S01. Environment blockers resolved on isolated stack; current session browser tool fails initialization (OS error 3). UI test verdict stays BLOCKED until an operational browser agent resumes. Do not use old localhost:8080 or reuse prior project. No generation or author writes pending.'
        data['environment_issues_resolved'] = ['ENV-001', 'ENV-002', 'ENV-003']
        data['unresolved_issue_ids'] = ['TOOL-UI-001']
    else:
        data['previous_application_base_url'] = data.get('application_base_url')
        data['application_base_url'] = 'http://localhost:14000/api/v1'
        data['web_base_url'] = 'http://localhost:18080'
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'fingerprints_match': True, 'database_checks': db.splitlines(), 'checkpoint_updated': True}, indent=2))
