"""Bounded offline regressions with fresh temp storage and a DNS egress guard."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import uuid
ROOT=Path(__file__).resolve().parents[2]

def main():
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); a=p.parse_args()
    out=Path(a.output).resolve(); out.mkdir(parents=True,exist_ok=False)
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    # pytest executes in this interpreter so every DNS resolution is bounded.
    original=socket.getaddrinfo
    def offline(host,*args,**kwargs):
        if host not in ('localhost','127.0.0.1','::1',None): raise RuntimeError('OFFLINE_TEST_DNS_DENIED')
        return original(host,*args,**kwargs)
    socket.getaddrinfo=offline
    sys.path.insert(0,str(ROOT/'ai-service'))
    import pytest
    from contextlib import redirect_stdout, redirect_stderr
    suites=['context_budget','context_routing','context_scope','manuscript_bootstrap','entity_review_workflow','revision_analysis_workflow','entity_cutoff_provenance','narrative_repository_contract','canon_revision_reconciliation','state_projection']
    args=['-m','not postgres_integration','-q','-ra','--basetemp='+str(Path(tempfile.gettempdir())/('p123-next-'+uuid.uuid4().hex)),'--junitxml='+str(out/'ai-junit.xml')]+[str(ROOT/'ai-service/tests'/('test_'+s+'.py')) for s in suites]
    with (out/'ai-tests.txt').open('w',encoding='utf-8') as stream, redirect_stdout(stream), redirect_stderr(stream):
        ai_exit=int(pytest.main(args))
    socket.getaddrinfo=original
    results=[]
    commands=[['npm.cmd','run','typecheck'],['node','--import','tsx','--test','src/modules/novels/chapter-revisions.test.ts','src/modules/novels/outbox.test.ts','src/modules/ai/ai-gateway.test.ts','src/modules/ai/p1-closed-loop-gateway.test.ts']]
    for name,command in zip(('backend-typecheck','backend-focused'),commands):
        r=subprocess.run(command,cwd=ROOT/'backend',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=120)
        (out/(name+'.txt')).write_text(r.stdout+'\n'+r.stderr,encoding='utf-8')
        results.append({'suite':name,'command':command,'exit_code':r.returncode})
    result={'tested_sha':sha,'AI':{'args':args,'exit_code':ai_exit,'egress_guard':'non-loopback DNS denied','SQL_fixture':'SQLite; real PostgreSQL covered by separate HTTP run'},'backend':results}
    (out/'validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result)); return int(ai_exit!=0 or any(r['exit_code'] for r in results))
if __name__=='__main__': raise SystemExit(main())
