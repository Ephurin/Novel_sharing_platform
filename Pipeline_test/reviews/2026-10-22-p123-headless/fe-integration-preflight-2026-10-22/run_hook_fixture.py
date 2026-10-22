import hashlib,json,os,subprocess
from pathlib import Path
out=Path('C:/tmp/p123-fe-preflight-20261022'); pr=Path('C:/tmp/novel-fe-pr55-preflight-20261022')
env=os.environ.copy();env.update(json.loads((out/'browser-private.json').read_text()))
for k in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','LLM_API_KEY','AI_LLM_API_KEY']: env[k]=''
env.update({'RUN_DRAFT_BROWSER_TESTS':'1','PLAYWRIGHT_CHANNEL':'msedge','AI_SERVICE_URL':'http://127.0.0.1:9','NODE_ENV':'test'})
assert not subprocess.check_output(['git','status','--porcelain'],cwd=pr,text=True).strip()
cmd=['node','--test','tests/draft-persistence.browser.test.mjs']
r=subprocess.run(cmd,cwd=out/'browser-sandbox/web',env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=160)
log=r.stdout+'\n'+r.stderr
for v in json.loads((out/'browser-private.json').read_text()).values(): log=log.replace(v,'[REDACTED]')
(out/'pr55-hook-browser.txt').write_text(log,encoding='utf-8')
metadata={'executor':'ASTRA','source_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=pr,text=True).strip(),'source_clean_before':True,'source_clean_after':not subprocess.check_output(['git','status','--porcelain'],cwd=pr,text=True).strip(),'command':cmd,'cwd':'temporary browser-sandbox/web; unmodified test copy with source/backend junctions to pinned PR worktree','exit_code':r.returncode,'runtime':'PASS_HOOK_FIXTURE_ONLY' if r.returncode==0 else 'FAIL','full_Author_IDE_S09':'NOT_RUN','provider':'loopback closed port 9; real keys blank','historical_artifacts_overwritten':False}
(out/'browser-runtime.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
print(log[-2200:]);print(json.dumps(metadata));raise SystemExit(r.returncode)
