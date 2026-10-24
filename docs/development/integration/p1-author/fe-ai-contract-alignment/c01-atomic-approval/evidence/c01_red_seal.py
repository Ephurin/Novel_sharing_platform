import hashlib,json,pathlib,subprocess,shutil,datetime
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT=pathlib.Path(__file__).parent/'c01-red'
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
assert base=='839b9525385f0ab137512c76ba4d434bdb736dbc'
changed=subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines()
assert changed==['backend/src/modules/ai/p1-memory-entity.live.test.ts'],changed
overlay=subprocess.check_output(['git','diff','--binary'],cwd=ROOT)
(OUT/'RED-tracked-test-overlay.patch').write_bytes(overlay)
files={}
for name in ['ai-service/tests/test_c01_canon_group.py','backend/src/modules/ai/p1-memory-entity.live.test.ts']:
    data=(ROOT/name).read_bytes();files[name]=hashlib.sha256(data).hexdigest()
    shutil.copy2(ROOT/name,OUT/('RED-'+pathlib.Path(name).name))
for name in ['ai-service/infrastructure/postgres_narrative_repository.py','ai-service/application/narrative_service.py',
        'ai-service/api/narrative_routes.py']:
    data=(ROOT/name).read_bytes();blob=subprocess.check_output(['git','show',base+':'+name],cwd=ROOT)
    assert data.replace(b'\r\n',b'\n')==blob.replace(b'\r\n',b'\n')
    files[name]={'runtime_sha256':hashlib.sha256(data).hexdigest(),'git_blob_sha256':hashlib.sha256(blob).hexdigest()}
(OUT/'RED-source-integrity.json').write_text(json.dumps({'base':base,'only_tracked_change':changed,
    'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,
    'tracked_overlay_sha256':hashlib.sha256(overlay).hexdigest()},indent=2),encoding='utf8')
print('RED base sealed; only regression tests differ from reviewed HEAD')
