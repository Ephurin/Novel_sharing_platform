import pathlib, json, subprocess, shutil, hashlib, base64

BASE=pathlib.Path(__file__).parent
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT=BASE/'p1-identity-final-acceptance'
RED=BASE/'p1-identity-final-runtime'
E=ROOT/'docs/development/integration/p1-author/memory-entity-hitl/identity-final-hardening-2026-10-24'
SOURCE='fd2f51aaaaa7196a0fdab9e6bb2498c9b55ce5e9'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
ci=json.loads((OUT/'github-actions-source.json').read_text(encoding='utf-8-sig'))
assert ci['query_source']==SOURCE and len(ci['workflow_runs'])==2
for run in ci['workflow_runs']:
    assert run['status']=='completed' and run['conclusion']=='success'
    assert all(j['status']=='completed' and j['conclusion']=='success' for j in run['jobs'])
assert sorted(len(r['jobs']) for r in ci['workflow_runs'])==[3,7]
snapshot=json.loads((RED/'red-test-snapshot.json').read_text(encoding='utf8'))
assert not snapshot['production_diff']
assert hashlib.sha256(base64.b64decode(snapshot['test_base64'])).hexdigest()==snapshot['test_sha256']
E.mkdir(parents=True,exist_ok=False)
for p in OUT.iterdir():
    if p.is_file(): shutil.copyfile(p,E/p.name)
(E/'red').mkdir()
for name in ['red-test-snapshot.json','red-development-resources.json','red-provision-commands.json',
        'red-migrate-commands.json','test-red-identity.log','test-red-identity-commands.json',
        'test-red-locks.log','test-red-locks-commands.json','test-red-lockreadback.log',
        'test-red-lockreadback-commands.json']:
    shutil.copyfile(RED/name,E/'red'/name)
shutil.copyfile(RED/'resources.json',E/'red'/'superseded-source-resources.json')
for dirname,prefixes in [('development',('test-dev','test-repair')),('superseded-79bfcebb',('test-accept-',))]:
    folder=E/dirname;folder.mkdir()
    for p in RED.iterdir():
        if p.is_file() and p.name.startswith(prefixes):shutil.copyfile(p,folder/p.name)
for name in ['identity_final_runner.py','identity_runner.py','identity_red_locks.py',
        'identity_red_locks_readback.py','preseal_identity.py','stop_identity_resources.py','package_identity.py']:
    shutil.copyfile(BASE/name,E/name)
shutil.copyfile(BASE/'identity_REPORT.md',E/'REPORT.md')
(E/'red'/'PROVENANCE.md').write_text('''# RED provenance

The original three-case RED ran on reviewed HEAD 0de3fcf with production source unchanged and only the untracked focused test file added. red-test-snapshot.json records original bytes/hash, source SHA, status and empty production diff. Its PostgreSQL/Mongo resource instance is red-development-resources.json.

The additional three-case H-05 probes install only the exact historical PostgreSQL _persist_projection method via AST from git show 0de3fcf, over the current harness. They are method counterfactuals, not clean old-checkout acceptance. BASE_METHOD in the logs records the original blob hash; copied bootstrap scripts show the patch. The second probe adds read-only before/after SQL capture around the failed Canon acceptance; all three show unchanged=true. The original and augmented probe logs are both retained. They use the separate superseded-source-resources.json test database. No production file is changed by these probes.

Development failures/reruns and preliminary clean 79bfcebb acceptance are retained in separate directories. They are superseded by the final clean fd2f51a suites and do not inflate unique counts. Intermediate failures included fixture/version setup, legacy structural relation compatibility, a TypeScript optional test token and the label-stability edge repaired in the second source commit. No final-source acceptance failure remains.
''',encoding='utf8')
print(str(E))
