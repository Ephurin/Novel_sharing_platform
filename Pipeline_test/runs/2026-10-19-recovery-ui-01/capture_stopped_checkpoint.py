"""Read-only PostgreSQL snapshot after intentionally stopping isolated workers."""
import datetime as dt
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
novel = '7d03320e-94c3-4913-a31f-a6eeef8af0dc'
def sql(query):
    return json.loads(subprocess.check_output(['docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc', query]).decode('utf-8'))
outbox=sql(f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT event_id,revision_id,status,retry_count,last_error,created_at,updated_at FROM revision_outbox_events WHERE novel_id='{novel}') t;")
proposals=sql(f"SELECT coalesce(json_agg(t),'[]') FROM (SELECT id AS proposal_id,proposal_type,status,evidence,analysis_run_id FROM narrative.proposals WHERE novel_id='{novel}' AND status='pending') t;")
value={'checked_at':dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(),
    'novel_id':novel,'outbox':outbox,'pending_proposals':proposals,
    'services_intentionally_stopped':['ephurin-ui-retest-backend-1','ephurin-ui-retest-ai-service-1'],
    'reason':'End failed gate retest without unobserved background provider retries; no volumes reset/deleted',
    'resume':'Read checkpoint first. docker start ephurin-ui-retest-ai-service-1 ephurin-ui-retest-backend-1',
    'warning':'PROCESSING labels are persisted state at worker stop, not proof a worker is currently executing.'}
(root/'evidence/stopped-checkpoint.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pending_proposals':len(proposals),'unfinished_outbox':sum(x['status'] not in ('COMPLETED','FAILED') for x in outbox)}))
