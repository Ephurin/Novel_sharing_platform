"""Run from repository root; offline configuration, isolated pytest temp paths."""
from pathlib import Path
import subprocess, json, os, tempfile, time, sys
root=Path.cwd(); evidence=root/'docs/development/p2/p2-01-evidence';evidence.mkdir(exist_ok=True)
records=[]
env=os.environ.copy();env.update(DATABASE_URL='postgresql://offline:offline@127.0.0.1:1/p2_offline',MONGODB_URI='mongodb://127.0.0.1:1/p2_offline',JWT_ACCESS_SECRET='offline-only-access-secret-for-tests',JWT_REFRESH_SECRET='offline-only-refresh-secret-for-tests')
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for name,cwd,cmd in [
 ('ai-offline',root/'ai-service',[sys.executable,'-m','pytest','-q','-rs','-p','no:cacheprovider','--basetemp='+tempfile.mkdtemp(prefix='ephurin-p2-01-'),'--junitxml='+str(evidence/'ai-offline.xml')]),
 ('json-readbacks',root/'ai-service',[sys.executable,'-m','pytest','-q','-s','tests/test_p2_json_bootstrap_compat.py','-p','no:cacheprovider','--basetemp='+tempfile.mkdtemp(prefix='ephurin-p2-json-')]),
 ('python-compile',root/'ai-service',[sys.executable,'-m','compileall','-q','api','application','domain','infrastructure']),
 ('gateway',root,[str(root/'backend/node_modules/.bin/tsx.cmd'),'--test','backend/src/modules/ai/ai-gateway.test.ts','backend/src/modules/ai/p1-closed-loop-gateway.test.ts','backend/src/modules/ai/manuscript-import-contract.test.ts']),
 ('typecheck',root,[str(root/'backend/node_modules/.bin/tsc.cmd'),'-p','backend/tsconfig.json','--noEmit']),
 ('docker',root,['docker','version','--format','{{.Server.Version}}']),
 ('diff-check',root,['git','diff','--check','3adab5c73636bd4e7c3dbc6578d4ece0a54b5627','HEAD'])]:
 started=time.time(); result=subprocess.run(cmd,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
 (evidence/(name+'.log')).write_text(result.stdout,encoding='utf-8')
 records.append(dict(name=name,source_sha=sha,command=cmd,cwd=str(cwd.relative_to(root)),exit_code=result.returncode,seconds=round(time.time()-started,2)))
 print(name,result.returncode,flush=True)
records.append(dict(name='source-integrity',before=sha,after=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),tracked_diff=subprocess.check_output(['git','diff','HEAD','--stat'],text=True)))
(evidence/'commands.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
