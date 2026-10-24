"""Recapture full PG RED from an immutable archived base; never swap active source."""
import pathlib,subprocess,tarfile,io,json,os,datetime,hashlib,shutil
P=pathlib.Path(__file__).parent
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT=P/'group-rejection-red'
base='3616b503dec46e293a58c98be977fcdad5bf8bdb'
archive=subprocess.check_output(['git','archive',base,'ai-service'],cwd=ROOT)
target=OUT/'baseline-replay'
target.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(archive)) as t:t.extractall(target,filter='data')
shutil.copy2(OUT/'RED-test_atomic_group_rejection.py',target/'ai-service/tests/test_atomic_group_rejection.py')
cfg=json.loads((OUT/'resources.json').read_text())
env=os.environ.copy();env.update(DATABASE_URL=f"postgresql+psycopg://postgres@127.0.0.1:{cfg['pg_port']}/{cfg['database']}",TEST_DATABASE_URL=f"postgresql+psycopg://postgres@127.0.0.1:{cfg['pg_port']}/{cfg['database']}",LLM_PROVIDER='fake',EMBEDDING_PROVIDER='fake',AI_LLM_BASE_URL='http://127.0.0.1:9',ENTITY_CANDIDATE_VERIFICATION_ENABLED='false',SERVICE_AUTH_DISABLED='true',NARRATIVE_REPOSITORY='json',SEMANTIC_MEMORY_ENABLED='false',SEMANTIC_RETRIEVAL_ENABLED='false')
for k in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:env[k]=''
cmd=['python','-m','pytest','--basetemp='+str(OUT/'replay-pytest'),'-q','-s','-m','postgres_integration','tests/test_atomic_group_rejection.py']
p=subprocess.run(cmd,cwd=target/'ai-service',env=env,capture_output=True)
(OUT/'RED-baseline-replay.log').write_bytes(p.stdout+p.stderr)
(OUT/'RED-baseline-replay.json').write_text(json.dumps({'command':cmd,'cwd':str(target/'ai-service'),'exit_code':p.returncode,'base':base,'archive_sha256':hashlib.sha256(archive).hexdigest(),'test_overlay_sha256':hashlib.sha256((OUT/'RED-test_atomic_group_rejection.py').read_bytes()).hexdigest(),'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'note':'Original PG RED log was accidentally overwritten by the first development GREEN run. This full RED recapture uses immutable git archive plus the sealed original test overlay. Original Gateway RED is preserved.'},indent=2))
print('RED replay exit',p.returncode)
print(p.stdout.decode('utf8',errors='replace')[-2200:])
assert p.returncode==1
