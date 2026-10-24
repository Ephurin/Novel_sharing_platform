import datetime,hashlib,json,pathlib,re,shutil,subprocess
SCRATCH=pathlib.Path(__file__).parent
FINAL=SCRATCH/'c01-final'; RED=SCRATCH/'c01-red'; PACK=SCRATCH/'c01-evidence-pack'
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
SOURCE='46da7223aa3152614a75c86ae39db99475e0097a'
TREE='e5b0aa98aa08fd33d940a83f9e7da2013bb08812'
PACK.mkdir(exist_ok=True)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
def save(name,data): (PACK/name).write_text(json.dumps(data,indent=2,ensure_ascii=True),encoding='utf8')
commands=[]
for suite in ('c01','hitl','postgres','unit','backend','live','python','typescript'):
    seal=json.loads((FINAL/f'test-accept-{suite}-source.json').read_text())
    assert seal['sha']==SOURCE and seal['dirty'] is False
    rows=json.loads((FINAL/f'test-accept-{suite}-commands.json').read_text())
    assert all(r['exit_code']==0 for r in rows)
    commands.extend(rows)
for path in FINAL.iterdir():
    if path.is_file() and path.suffix in ('.json','.log'):shutil.copy2(path,PACK/path.name)
for path in RED.iterdir():
    if path.is_file() and (path.name.startswith('RED-') or path.name.startswith('test-red-')
            or path.name=='pre-fixture-unit-failure.log'):
        shutil.copy2(path,PACK/path.name)
for name in ('c01_final_runner.py','c01_red_seal.py','c01_package.py'):
    shutil.copy2(SCRATCH/name,PACK/name)
save('commands.json',commands)
save('source-integrity.json',{'base_sha':'839b9525385f0ab137512c76ba4d434bdb736dbc',
    'source_sha':SOURCE,'tree':TREE,'clean_source_for_every_suite':True,'fake_only':True,
    'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
counts={}
for name in ('c01','hitl','postgres','unit','backend','live'):
    raw=(FINAL/f'test-accept-{name}.log').read_text(encoding='utf8')
    if name in ('backend','live'):
        assert re.search(r'# fail 0',raw)
        passed=int(re.search(r'# pass (\d+)',raw).group(1));skipped=0
    else:
        passed=int(re.search(r'(\d+) passed',raw).group(1))
        skipped=re.search(r'(\d+) skipped',raw);skipped=int(skipped.group(1)) if skipped else 0
    counts[name]={'passed':passed,'skipped':skipped,'failed':0}
counts['unique_local_passes']=sum(counts[n]['passed'] for n in ('hitl','postgres','unit','backend','live'))
counts['counting_rule']='20 focused C01 cases repeat in full HITL; CI and RED are not added'
save('test-counts.json',counts)
decoder=json.JSONDecoder()
for phase,folder,prefix in [('green',FINAL,'test-accept-live'),('red',RED,'test-red-verified-live')]:
    raw=(folder/(prefix+'.log')).read_text(encoding='utf8').replace('\n# ','')
    http=decoder.raw_decode(raw.split('P1_HTTP_EVIDENCE ',1)[1])[0]
    durable=decoder.raw_decode(raw.split('P1_DURABLE_EVIDENCE ',1)[1])[0]
    save(phase+'-http-requests.json',http);save(phase+'-http-readbacks.json',durable)
    save(phase+'-http-summary.json',{'requests':len(http),'statuses':{str(k):sum(x['status']==k for x in http)
        for k in sorted({x['status'] for x in http})},'mounted_browser':'NOT_RUN'})
    if phase=='red':
        broken=next(x for x in durable if x['stage']=='C01-after-partial-approval-200')
        assert int(broken['brain'][0]['brain_version'])==2
        assert any(p['status']=='accepted' for p in broken['proposals']) and any(p['status']=='pending' for p in broken['proposals'])
    else:
        for stage in ('C01-after-partial-approval-401','C01-after-partial-approval-403','C01-after-partial-approval-422','C01-after-unedited-partial'):
            before=next(x for x in durable if x['stage']=='C01-before-partial-approval')
            after=next(x for x in durable if x['stage']==stage)
            assert {**before,'stage':''}=={**after,'stage':''}
pg=[]
for line in (FINAL/'test-accept-c01.log').read_text(encoding='utf8').splitlines():
    if 'CONTRACT_PG_READBACK ' in line:
        pg.append(json.loads(line.split('CONTRACT_PG_READBACK ',1)[1]))
save('c01-postgres-readbacks.json',pg)
print(json.dumps({'source':SOURCE,'counts':counts,'pg_snapshots':len(pg)},indent=2))
