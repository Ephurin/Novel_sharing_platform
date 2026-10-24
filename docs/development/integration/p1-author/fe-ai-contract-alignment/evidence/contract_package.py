"""Package actual results only; evidence files are committed after source validation."""
import datetime, hashlib, json, pathlib, re, shutil, subprocess
SCRATCH = pathlib.Path(__file__).parent
FINAL = SCRATCH/'p1-contract-delivery'
DEV = SCRATCH/'p1-contract-runtime'
PACK = SCRATCH/'p1-contract-evidence-pack'
ROOT = pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
SOURCE = '4811963d235dd9f79b2efa387152e008f9519e47'
TREE = 'a72f876e9ce3f35236d71e06339cfa8d19cce3c0'
PACK.mkdir(exist_ok=True)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
def save(name,value): (PACK/name).write_text(json.dumps(value,ensure_ascii=True,indent=2),encoding='utf8')
commands=[]
for suite in ('contract','hitl','postgres','unit','backend','live','python','typescript'):
    seal=json.loads((FINAL/f'test-accept-{suite}-source.json').read_text())
    assert seal['sha']==SOURCE and seal['dirty'] is False
    rows=json.loads((FINAL/f'test-accept-{suite}-commands.json').read_text())
    assert all(r['exit_code']==0 for r in rows),rows
    commands.extend(rows)
for path in FINAL.glob('*'):
    if path.is_file() and path.suffix in ('.log','.json'):
        shutil.copy2(path,PACK/path.name)
for name in ('RED-test_p1_contract_alignment.py','red-repro.log','red-repro-seal.json',
        'test-red-contract.log','test-red-contract-commands.json','test-red-lockboundary.log',
        'test-red-lockboundary-commands.json','test-red-inventoryguard.log',
        'test-red-inventoryguard-commands.json','red-inventory-test.patch'):
    shutil.copy2(DEV/name,PACK/name)
for name in ('contract_delivery_runner.py','contract_red_repro.py','contract_package.py'):
    shutil.copy2(SCRATCH/name,PACK/name)
save('commands.json',commands)
save('source-integrity.json',{'source_sha':SOURCE,'source_tree':TREE,
    'integration_base':'dd2f8003b0ad94e6097819cdca0249aa591f54fa',
    'specification_commit':'4654c8cf1c5803d65d2f6fc25f63a0ed245ed500',
    'sealed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'clean_source_for_every_acceptance_suite':True,'fake_only':True,
    'inventory_red_base':'6a723bfc49aec3b173d2cbf90077300023bee127',
    'inventory_red_test_patch_sha256':hashlib.sha256((DEV/'red-inventory-test.patch').read_bytes()).hexdigest()})
def result(suite):
    data=(FINAL/f'test-accept-{suite}.log').read_text(encoding='utf8')
    if suite in ('backend','live'):
        passed=int(re.search(r'# pass (\d+)',data).group(1));failed=int(re.search(r'# fail (\d+)',data).group(1))
        assert failed==0
        return {'passed':passed,'failed':failed,'skipped':0}
    passed=int(re.search(r'(\d+) passed',data).group(1))
    skipped=re.search(r'(\d+) skipped',data)
    return {'passed':passed,'skipped':int(skipped.group(1)) if skipped else 0,'failed':0}
counts={s:result(s) for s in ('contract','hitl','postgres','unit','backend','live')}
counts['unique_local_passes']=sum(counts[s]['passed'] for s in ('hitl','postgres','unit','backend','live'))
counts['not_double_counted']='contract PostgreSQL tests repeat inside hitl; CI and prior candidates are not added'
save('test-counts.json',counts)
raw=(FINAL/'test-accept-live.log').read_text(encoding='utf8').replace('\n# ','')
decoder=json.JSONDecoder()
http=decoder.raw_decode(raw.split('P1_HTTP_EVIDENCE ',1)[1])[0]
readbacks=decoder.raw_decode(raw.split('P1_DURABLE_EVIDENCE ',1)[1])[0]
save('http-requests.json',http)
save('http-durable-readbacks.json',readbacks)
save('http-summary.json',{'requests':len(http),'statuses':{str(k):sum(r.get('status')==k for r in http)
    for k in sorted({r['status'] for r in http})},'mounted_browser':'NOT_RUN'})
pg=[]
for line in (FINAL/'test-accept-contract.log').read_text(encoding='utf8').splitlines():
    if line.startswith('CONTRACT_PG_READBACK '):
        pg.append(json.loads(line[len('CONTRACT_PG_READBACK '):]))
save('contract-postgres-readbacks.json',pg)
print(json.dumps({'source':SOURCE,'counts':counts,'http_requests':len(http),'pg_snapshots':len(pg),
    'files':len(list(PACK.iterdir()))},indent=2))
