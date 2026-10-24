import hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
PREFIX='docs/development/integration/p1-author/fe-ai-contract-alignment/evidence/'
manifest='MANIFEST.sha256.json'
if len(sys.argv)>1 and sys.argv[1]=='verify':
    data=json.loads(subprocess.check_output(['git','show','HEAD:'+PREFIX+manifest],cwd=ROOT))
    for name,info in data['files'].items():
        blob=subprocess.check_output(['git','show','HEAD:'+PREFIX+name],cwd=ROOT)
        assert hashlib.sha256(blob).hexdigest()==info['sha256'] and len(blob)==info['bytes'],name
    changed=subprocess.check_output(['git','diff','--name-only',data['tested_source'],'HEAD'],cwd=ROOT,text=True).splitlines()
    assert changed and all(p.startswith(PREFIX) for p in changed),changed
    assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()
    print(json.dumps({'verified_files':len(data['files']),'evidence_only':True,
        'evidence_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}))
else:
    names=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT,text=True).splitlines()
    assert names and all(n.startswith(PREFIX) for n in names)
    files={}
    for name in names:
        if name==PREFIX+manifest:continue
        blob=subprocess.check_output(['git','show',':'+name],cwd=ROOT)
        files[name[len(PREFIX):]]={'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob)}
    (ROOT/PREFIX/manifest).write_text(json.dumps({'tested_source':'4811963d235dd9f79b2efa387152e008f9519e47',
        'hash_basis':'staged canonical Git blobs; manifest excludes itself','files':files},indent=2),encoding='utf8')
    print(json.dumps({'staged_files_hashed':len(files)}))
