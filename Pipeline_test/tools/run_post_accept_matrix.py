"""Finite isolated offline execution; preserve failures and stop only owned resources."""
import json,subprocess,sys
from pathlib import Path
from prepare_p123_next import prepare

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'Pipeline_test/reviews/2026-10-22-p123-headless/post-accept'
def invoke(args,log):
 with log.open('a',encoding='utf-8',newline='\n') as f:
  p=subprocess.run(args,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,text=True)
 return p.returncode
def provision(name):
 # prepare_p123_next CLI adds a non-overlapping owned subnet allocation.
 manifest=OUT/(name+'-environment.json')
 subprocess.run([sys.executable,'Pipeline_test/tools/prepare_p123_next.py','--manifest',str(manifest)],cwd=ROOT,check=True)
 m=json.loads(manifest.read_text());env=m['env_file']
 c=['docker','compose','--env-file',env,'-f','Pipeline_test/tools/compose.p123-p3.yml','-f','Pipeline_test/tools/compose.p123-post-accept-test.yml']
 return env,c
def main():
 OUT.mkdir(parents=True,exist_ok=True);records=[]
 scenarios=[(s,a) for s in ['post_commit','pre_approval','pre_progress'] for a in ['skip','stop']]+[('pre_approval','ABA'),('pre_approval','kill_stop'),('pre_approval','advance_first')]
 for seam,action in scenarios:
  name=seam+'-'+action;env,c=provision(name);log=OUT/(name+'-commands.txt')
  try:
   for cmd in [c+['--profile','initialize','run','--rm','budget-init'],c+['up','-d','--build'],[sys.executable,'Pipeline_test/tools/run_p3_post_accept.py','--env-file',env,'--output',str(OUT/name),'--seam',seam,'--action',action]]:
    code=invoke(cmd,log);records.append({'scenario':name,'command':cmd,'exit_code':code})
    if code:break
  finally:
   code=invoke(c+['stop','-t','2'],log);records.append({'scenario':name,'command':c+['stop','-t','2'],'exit_code':code})
  (OUT/'matrix-commands.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8',newline='\n')
  print(name, records[-2]['exit_code'],flush=True)
 return int(any(r['exit_code'] for r in records))
if __name__=='__main__':raise SystemExit(main())
