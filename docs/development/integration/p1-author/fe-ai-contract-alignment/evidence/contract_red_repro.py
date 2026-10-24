"""Reproduce RED from immutable Git export without moving the accepted-source checkout."""
import hashlib, io, json, os, pathlib, subprocess, tarfile, datetime
ROOT = pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
OUT = pathlib.Path(__file__).parent / 'p1-contract-runtime'
BASE = '4654c8cf1c5803d65d2f6fc25f63a0ed245ed500'
dest = OUT / 'red-baseline-export'
dest.mkdir(exist_ok=True)
archive = subprocess.check_output(['git', 'archive', BASE, 'ai-service'], cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    tar.extractall(dest, filter='data')
test = OUT / 'RED-test_p1_contract_alignment.py'
target = dest / 'ai-service/tests/test_p1_contract_alignment.py'
target.write_bytes(test.read_bytes())
cfg = json.loads((OUT/'resources.json').read_text())
env = os.environ.copy()
url = f"postgresql+psycopg://postgres@127.0.0.1:{cfg['pg_port']}/{cfg['database']}"
env.update(TEST_DATABASE_URL=url, DATABASE_URL=url, LLM_PROVIDER='fake', EMBEDDING_PROVIDER='fake',
    NARRATIVE_REPOSITORY='json', SERVICE_AUTH_DISABLED='true', ENTITY_CANDIDATE_VERIFICATION_ENABLED='false',
    SEMANTIC_MEMORY_ENABLED='false', SEMANTIC_RETRIEVAL_ENABLED='false')
for key in ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','AI_LLM_API_KEY','LLM_API_KEY']:
    env[key]=''
cmd=['python','-m','pytest','--basetemp='+str(OUT/'pytest-red-repro'),'-q','-s','-m',
    'postgres_integration','tests/test_p1_contract_alignment.py']
result = subprocess.run(cmd, cwd=dest/'ai-service', env=env, capture_output=True, encoding='utf8', errors='replace')
(OUT/'red-repro.log').write_text(result.stdout+result.stderr, encoding='utf8')
seal={'base_sha':BASE,'git_archive_sha256':hashlib.sha256(archive).hexdigest(),
    'test_sha256':hashlib.sha256(test.read_bytes()).hexdigest(), 'command':cmd,
    'cwd':str(dest/'ai-service'),'exit_code':result.returncode,'expected_exit':1,
    'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'fake_only':True}
for part in ['api/schemas.py','api/narrative_routes.py','application/narrative_service.py',
        'infrastructure/postgres_narrative_repository.py']:
    data=(dest/'ai-service'/part).read_bytes()
    expected=subprocess.check_output(['git','show',BASE+':ai-service/'+part],cwd=ROOT)
    assert data.replace(b'\r\n', b'\n')==expected.replace(b'\r\n', b'\n')
    seal[part]={'exported_sha256':hashlib.sha256(data).hexdigest(),
        'git_blob_sha256':hashlib.sha256(expected).hexdigest(),
        'git_archive_windows_crlf_only': data != expected}
(OUT/'red-repro-seal.json').write_text(json.dumps(seal,indent=2),encoding='utf8')
print(json.dumps(seal,indent=2))
assert result.returncode==1
