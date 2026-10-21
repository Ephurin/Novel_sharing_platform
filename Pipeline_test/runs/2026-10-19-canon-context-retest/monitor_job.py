import time
import subprocess
import sys

job_id = '7b527d4a-73b9-5506-9cc7-535225461ba5'
sql = f"SELECT status, stage, progress_current, progress_total, error FROM narrative.bootstrap_jobs WHERE id = '{job_id}';"

for i in range(60):
    cmd = ['docker', 'exec', 'ephurin-ui-retest-postgres-1', 'psql', '-U', 'postgres', '-d', 'ephurin', '-t', '-c', sql]
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout.strip()
    print(f"[{i*5}s] {out}")
    if any(k in out for k in ['completed', 'waiting_review', 'failed']):
        break
    time.sleep(5)
