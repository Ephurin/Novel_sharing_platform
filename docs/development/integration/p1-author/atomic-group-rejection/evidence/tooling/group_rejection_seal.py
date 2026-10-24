import hashlib,json,pathlib,subprocess,shutil,datetime
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT=pathlib.Path(__file__).parent/'group-rejection-red'
base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
assert base=='3616b503dec46e293a58c98be977fcdad5bf8bdb'
files={}
for name in ['ai-service/tests/test_atomic_group_rejection.py','backend/src/modules/ai/p1-memory-entity.live.test.ts']:
 data=(ROOT/name).read_bytes();files[name]=hashlib.sha256(data).hexdigest()
 shutil.copy2(ROOT/name,OUT/('RED-'+pathlib.Path(name).name))
for name in ['ai-service/infrastructure/postgres_narrative_repository.py','ai-service/application/narrative_service.py','ai-service/api/narrative_routes.py','backend/src/modules/ai/ai-gateway.controller.ts','backend/src/modules/ai/ai-gateway.routes.ts']:
 data=(ROOT/name).read_bytes();blob=subprocess.check_output(['git','show',base+':'+name],cwd=ROOT)
 assert data.replace(b'\r\n',b'\n')==blob.replace(b'\r\n',b'\n')
 files[name]={'runtime_sha256':hashlib.sha256(data).hexdigest(),'git_blob_sha256':hashlib.sha256(blob).hexdigest()}
(OUT/'RED-test-overlay.patch').write_bytes(subprocess.check_output(['git','diff','--binary'],cwd=ROOT))
(OUT/'RED-source-integrity.json').write_text(json.dumps({'base':base,'production_base':'2eca7f19c20a71202d7c827af2e15d8fb6dc88bb','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files},indent=2))
for log in OUT.glob('test-red-*.log'):
 lines=log.read_text(encoding='utf8').splitlines()
 print(log.name, '\n'.join(l for l in lines if ('failed,' in l or 'passed' in l or 'GROUP_REJECT_HTTP' in l or 'AssertionError' in l) and len(l)<700)[-3500:])
