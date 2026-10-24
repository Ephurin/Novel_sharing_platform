import ast, pathlib, subprocess, sys, hashlib, json
ROOT=pathlib.Path(r'C:\Users\Laptop\.codex\worktrees\draft-read-authz\testproject')
sys.path.insert(0,str(ROOT/'ai-service'))
import infrastructure.postgres_narrative_repository as pg
import domain.projection as projection
BASE='0de3fcf63fc6afdd2e1875af06dadddf844ed33f'
def original_method(path,name):
    raw=subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
    tree=ast.parse(raw.decode())
    node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name)
    print('BASE_METHOD '+json.dumps({'base':BASE,'path':path,'method':name,'blob_sha256':hashlib.sha256(raw).hexdigest()}))
    return compile(ast.Module(body=[node],type_ignores=[]),path,'exec')
namespace=dict(vars(pg));exec(original_method('ai-service/infrastructure/postgres_narrative_repository.py','_persist_projection'),namespace)
pg.PostgresNarrativeRepository._persist_projection=namespace['_persist_projection']
from sqlalchemy import text
original_accept=pg.PostgresNarrativeRepository.accept_proposal_group
def durable(repo,story):
    result={}
    with repo._session_factory() as session:
        for table in ('story_brains','entities','relationships','events','facts','proposals','state_transitions','current_entity_states'):
            result[table]=sorted([dict(r) for r in session.execute(text(f'SELECT * FROM narrative.{table} WHERE tenant_id=:t AND novel_id=:n'),{'t':repo._tenant_id,'n':repo._novel_id(story)}).mappings()],key=lambda r:str(r.get('id',r.get('entity_id'))))
    return result
def audited_accept(repo,story,*args,**kwargs):
    before=durable(repo,story)
    try:return original_accept(repo,story,*args,**kwargs)
    except Exception:
        after=durable(repo,story)
        print('RED_LOCK_PG_READBACK '+json.dumps({'before':before,'after':after,'unchanged':before==after},default=str))
        assert before==after
        raise
pg.PostgresNarrativeRepository.accept_proposal_group=audited_accept
import pytest
sys.exit(pytest.main(['--basetemp='+str(pathlib.Path(__file__).parent/'p1-identity-final-runtime/pytest-red2-locks'),'-q','-s','-m','postgres_integration','tests/test_p1_identity_final.py::test_h05_homonyms_lock_only_exact_pair_and_reload','tests/test_p1_identity_final.py::test_h05_ambiguous_legacy_lock_is_preserved_without_partial_canon']))
