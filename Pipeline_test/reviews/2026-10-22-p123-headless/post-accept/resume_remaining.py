"""Finite continuation after subnet allocator exhaustion; no fixture reuse."""
import json,subprocess
from pathlib import Path
base=Path(__file__).resolve().parent;root=base/'green-03';records=[]
for name,seam,action in [('pre_progress-stop','pre_progress','stop'),('pre_approval-ABA','pre_approval','ABA'),('pre_approval-kill_stop','pre_approval','kill_stop'),('hitl',None,None)]:
 manifest=root/(name+'-environment.json')
 if manifest.exists():raise RuntimeError('Never reuse existing fixture '+name)
 subprocess.run(['python',str(base/'prepare_additional.py'),str(manifest)],check=True)
 m=json.loads(manifest.read_text());e=m['env_file'];c=['docker','compose','--env-file',e,'-f','Pipeline_test/tools/compose.p123-p3.yml','-f','Pipeline_test/tools/compose.p123-post-accept-test.yml']
 with (root/(name+'-commands.txt')).open('w',encoding='utf-8') as f:
  def call(cmd):
   r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT);records.append({'scenario':name,'command':cmd,'exit_code':r.returncode});return r.returncode
  try:
   assert call(c+['--profile','initialize','run','--rm','budget-init'])==0
   assert call(c+['up','-d','--build'])==0
   cmd=['python','Pipeline_test/tools/run_p3_post_accept.py','--env-file',e,'--output',str(root/name),'--seam',seam,'--action',action] if seam else ['python',str(base/'supplemental_checks.py'),'hitl',e,str(root/name)]
   call(cmd)
  finally:call(c+['stop','-t','2'])
 (root/'continuation-commands.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
 print(name,records[-2]['exit_code'],flush=True)
