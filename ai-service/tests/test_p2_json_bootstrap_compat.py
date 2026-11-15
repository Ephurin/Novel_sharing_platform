"""PR72 review: unsupported JSON bootstrap must fail503 without adapter side effects."""
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import uuid, hashlib, json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.narrative_routes import router
from api.schemas import IdeaBootstrapRequest
from application.bootstrap_service import ManuscriptBootstrapService
from core.story_kb_manager import StoryKBManager
from infrastructure.json_narrative_repository import JsonNarrativeRepository

class Tripwire:
    calls = 0
    def get_revision(self, **kwargs):
        self.calls += 1
        raise AssertionError('JSON rejection must precede source/provider work')
    def generate_story_blueprint(self, **kwargs):
        self.calls += 1
        raise AssertionError('JSON rejection must precede provider work')

@pytest.mark.parametrize('entry', ['idea','manuscript'])
@pytest.mark.parametrize('seeded', [False,True])
def test_json_new_bootstrap_returns503_without_mutation(tmp_path,entry,seeded):
    manager=StoryKBManager(storage_dir=tmp_path)
    repo=JsonNarrativeRepository(manager)
    novel=str(uuid.uuid4())
    if seeded:
        kb=manager.load_kb(novel)
        kb.metadata['status']='active'
        manager.save_narrative_kb(novel,kb)
    tripwire=Tripwire()
    service=ManuscriptBootstrapService(repo,tripwire,None,tripwire)
    app=FastAPI();app.state.bootstrap_service=service
    app.state.settings=SimpleNamespace(platform_service_token='json-compat-test',service_auth_disabled=False)
    app.include_router(router)
    headers={'X-Service-Token':'json-compat-test','X-Tenant-Id':str(uuid.uuid4()),'X-Request-Id':str(uuid.uuid4())}
    disk=lambda:{str(p.relative_to(tmp_path)):p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}
    before=disk()
    assert bool(before)==seeded
    jobs=deepcopy(repo._bootstrap_jobs);runs=deepcopy(repo._analysis_runs)
    body={'novel_id':novel,'idea':'Author setup','mode':'blueprint'} if entry=='idea' else {'novel_id':novel,'revisions':[{'chapter_id':str(uuid.uuid4()),'revision_id':str(uuid.uuid4()),'content_hash':'0'*64}]}
    with TestClient(app,raise_server_exceptions=False) as client:
        response=client.post('/v1/story-brains/bootstrap/from-'+entry,headers=headers,json=body)
    try:
        assert response.status_code==503, response.text
        assert response.json()['detail']['code']=='BOOTSTRAP_REQUIRES_POSTGRES'
    finally:
        assert disk()==before
        assert repo._bootstrap_jobs==jobs and repo._analysis_runs==runs
        assert tripwire.calls==0
        hashes=lambda value:{name:hashlib.sha256(data).hexdigest() for name,data in value.items()}
        print('JSON_COMPAT_READBACK '+json.dumps({'entry':entry,'seeded':seeded,'http_status':response.status_code,
            'before_files':hashes(before),'after_files':hashes(disk()),'jobs_unchanged':repo._bootstrap_jobs==jobs,
            'runs_unchanged':repo._analysis_runs==runs,'provider_calls':tripwire.calls}))

def test_nested_preferences_reject_unknown_fields():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        IdeaBootstrapRequest(novel_id='n', idea='source', preferences={'unknown_nested': 'typo'})


def test_json_activation_fails_closed_before_job_or_brain_access():
    from domain.errors import BootstrapConflictError
    service = ManuscriptBootstrapService(SimpleNamespace(supports_bootstrap_lifecycle=False), None, None)
    with pytest.raises(BootstrapConflictError, match='BOOTSTRAP_REQUIRES_POSTGRES'):
        service.activate_baseline('novel', 'legacy-job')
