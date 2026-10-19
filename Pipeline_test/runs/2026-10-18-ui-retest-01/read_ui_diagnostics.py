"""Read-only diagnostics scoped to the UI-created test novel. No API writes."""
import json, sys, datetime, subprocess, re
from pathlib import Path
import psycopg
from psycopg.rows import dict_row

R=Path(__file__).resolve().parent
NOVEL='06a979c5-b089-4648-a04e-81383aa7b119'
label=sys.argv[1]
target=R/'evidence/memory/P1-M0'/f'{label}.json'
if target.exists(): raise RuntimeError('Do not overwrite evidence')
out={'time':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),'kind':'READ_ONLY_DIAGNOSTIC','novel_id':NOVEL}
with psycopg.connect(host='127.0.0.1',port=55432,dbname='ephurin',user='postgres',password='postgres',connect_timeout=5,options='-c default_transaction_read_only=on -c statement_timeout=6000',row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute('SHOW transaction_read_only');out['transaction']=cur.fetchone()
        for schema,table in [('public','chapter_revisions'),('narrative','story_brains'),('narrative','bootstrap_jobs'),('narrative','analysis_runs'),('narrative','proposals'),('narrative','entities'),('narrative','events'),('narrative','facts'),('narrative','state_transitions')]:
            cur.execute(psycopg.sql.SQL('SELECT * FROM {}.{} WHERE novel_id=%s').format(psycopg.sql.Identifier(schema),psycopg.sql.Identifier(table)),(NOVEL,))
            out[table]=cur.fetchall()
target.write_text(json.dumps(out,default=str,ensure_ascii=False,indent=2),encoding='utf-8')
logs=subprocess.run(['docker','logs','ephurin-ui-retest-ai-service-1'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=10)
text=logs.stdout+'\n'+logs.stderr
text=re.sub(r'AIza[\w-]+','[REDACTED]',text)
text=re.sub(r'(?i)(key=|bearer\s+)[^\s\"&]+',r'\1[REDACTED]',text)
safe='\n'.join(x for x in text.splitlines() if not any(y in x.lower() for y in ['authorization:', 'cookie:', 'password=', 'api_key']))
(R/'evidence'/f'{label}-ai-log.txt').write_text(safe,encoding='utf-8')
traces=[]
for line in safe.splitlines():
    if 'structured_provider_response ' in line:
        try: traces.append(json.loads(line.split('structured_provider_response ',1)[1]))
        except ValueError: pass
(R/'evidence'/f'{label}-structured-traces.json').write_text(json.dumps(traces,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'job_status':out['bootstrap_jobs'][0]['status'],'progress':out['bootstrap_jobs'][0]['progress_current'],'proposals':len(out['proposals']),'approved_entities':len(out['entities']),'approved_events':len(out['events']),'revisions':len(out['chapter_revisions']),'provider_structured_responses':len(traces)},ensure_ascii=True))
