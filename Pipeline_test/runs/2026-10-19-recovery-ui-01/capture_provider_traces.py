"""Read-only provider trace collection; never prints credentials or manuscript."""
import json
import re
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
raw = subprocess.check_output(
    ['docker', 'logs', '--since', '2026-10-20T00:04:00Z',
     'ephurin-ui-retest-ai-service-1'], stderr=subprocess.STDOUT).decode('utf-8', errors='replace')
records = []
http_calls = []
for line in raw.splitlines():
    if 'HTTP Request: POST https://generativelanguage.googleapis.com/' in line:
        match = re.search(r'HTTP/1\.1 (\d+)', line)
        http_calls.append({'log_time': line.split(' | ')[0],
                           'provider': 'gemini', 'http_status': int(match.group(1)) if match else None})
    for marker in ('structured_provider_response ', 'structured_call_failed '):
        if marker not in line:
            continue
        try:
            record = json.loads(line.split(marker, 1)[1])
        except ValueError:
            continue
        records.append({'log_time': line.split(' | ')[0], 'kind': marker.strip(), **record})
(root / 'evidence/provider-traces-progress.json').write_text(
    json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(root / 'evidence/provider-http-attempts.json').write_text(
    json.dumps(http_calls, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'structured_records': len(records),
    'observed_gemini_http_attempts': len(http_calls),
    'responses': sum(r['kind'] == 'structured_provider_response' for r in records),
    'failures': sum(r['kind'] == 'structured_call_failed' for r in records),
    'last_record': {k: v for k, v in (records[-1] if records else {}).items()
                    if k in ('log_time', 'kind', 'task', 'operation', 'model', 'error_code', 'trace_id')}}))
