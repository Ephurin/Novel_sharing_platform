"""Use this name to avoid shadowing Python stdlib http.client. Provision one HTTP runtime at a time."""
"""Run from root: fresh project per invocation, preserve output and stopped resources."""
import subprocess,json,sys,time
from pathlib import Path
b=Path(sys.argv[1]).resolve();b.mkdir(parents=True,exist_ok=False);phase=sys.argv[2];manifest=b/(phase+'-manifest.json');rows=[]
def run(label,cmd):
 r=subprocess.run(cmd,capture_output=True,encoding='utf-8',errors='replace');(b/(phase+'-'+label+'.txt')).write_text(r.stdout+r.stderr,encoding='utf-8');rows.append(dict(command=cmd,exit_code=r.returncode,tested_sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()));(b/(phase+'-commands.json')).write_text(json.dumps(rows,indent=2),encoding='utf-8');print(label,r.returncode,flush=True);return r.returncode
assert run('prepare',['python','Pipeline_test/tools/prepare_fe_core_contract.py','--manifest',str(manifest),'--allow-new-test-resources'])==0
m=json.loads(manifest.read_text());c=['docker','compose','--env-file',m['env_file'],'-f','Pipeline_test/tools/compose.p123-p3.yml']
try:
 assert run('init',c+['--profile','initialize','run','--rm','budget-init'])==0
 assert run('up',c+['up','-d','--build'])==0
 for _ in range(60):
  import requests
  try:
   env=dict(line.split('=',1) for line in Path(m['env_file']).read_text().splitlines() if line and not line.startswith('#'))
   if requests.get('http://127.0.0.1:'+env['WAVE1D_BACKEND_PORT']+'/api/v1/health',timeout=2).status_code==200:break
  except requests.RequestException:pass
  time.sleep(2)
 run('probe',['python','Pipeline_test/tools/'+('fe_core_contract_probe.py' if phase=='persistence' else 'canon_hitl_probe.py'),'--env-file',m['env_file'],'--output',str(b/(phase+'-runtime')),'--allow-test-mutations'])
finally:run('stop',c+['stop','-t','2'])

raise SystemExit(int(any(r['exit_code'] for r in rows)))
