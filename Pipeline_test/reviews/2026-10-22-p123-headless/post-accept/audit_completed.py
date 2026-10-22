"""One finite read-only audit pass over completed final-SHA scenarios."""
import json,subprocess,sys
from pathlib import Path
BASE=Path(__file__).resolve().parent
FINAL='3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99'
records=[]
for manifest in sorted((BASE/'green-03').glob('*-environment.json')):
 name=manifest.name.removesuffix('-environment.json');validation=manifest.parent/name/'validation.json'
 if not validation.exists() or (manifest.parent/(name+'-readback')).exists():continue
 v=json.loads(validation.read_text(encoding='utf-8'));m=json.loads(manifest.read_text(encoding='utf-8'))
 if v.get('verdict')!='PASS' or v.get('tested_sha')!=FINAL:continue
 states=subprocess.check_output(['docker','ps','-a','--filter','label=com.docker.compose.project='+m['project'],'--format','{{.State}}'],text=True).splitlines()
 if not states or 'running' in states:continue
 c=['docker','compose','--env-file',m['env_file'],'-f','Pipeline_test/tools/compose.p123-next.yml' if name in ['p1-writer','p2'] else 'Pipeline_test/tools/compose.p123-p3.yml']
 if name=='p1-writer':c+=['-f','Pipeline_test/tools/compose.p123-ordered-test.yml']
 if name=='replacement' or name.startswith(('post_commit','pre_')):c+=['-f','Pipeline_test/tools/compose.p123-post-accept-test.yml']
 with (manifest.parent/(name+'-audit-commands.txt')).open('w',encoding='utf-8') as stream:
  def call(cmd):
   p=subprocess.run(cmd,stdout=stream,stderr=subprocess.STDOUT);records.append({'scenario':name,'command':cmd,'exit_code':p.returncode});return p.returncode
  try:
   assert call(c+['up','-d','--no-build'])==0
   code=call([sys.executable,str(BASE/'readback_scenario.py'),name])
   print(name,'readback',code,flush=True)
  finally:call(c+['stop','-t','2'])
(BASE/('audit-pass-'+sys.argv[1]+'.json')).write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8',newline='\n')
