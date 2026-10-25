"""G10/A16 focused contracts; no external providers."""
from dataclasses import asdict, replace
import hashlib
import uuid
import pytest
from application.bootstrap_service import ManuscriptBootstrapService
from application.ports import RevisionContent
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from api.schemas import IdeaBootstrapRequest

TENANT = '00000000-0000-0000-0000-000000000001'

class FakeBlueprint:
    calls = 0
    def generate_story_blueprint(self, **kwargs):
        self.calls += 1
        return {'premise': kwargs['idea'], 'entities': [], 'world_rules': []}

def fixture():
    repo = InMemoryNarrativeRepository()
    novel, chapter, revision = [str(uuid.uuid4()) for _ in range(3)]
    text = 'Author source'
    source = RevisionContent(novel, chapter, revision, text, hashlib.sha256(text.encode()).hexdigest(), 1)
    llm = FakeBlueprint()
    service = ManuscriptBootstrapService(repo, InMemoryRevisionContentProvider([source]), None, llm)
    return repo, service, llm, source

@pytest.mark.parametrize('entry', ['idea', 'manuscript'])
@pytest.mark.parametrize('baseline', [None, 'existing-p1-revision'])
def test_active_brain_bootstrap_is_nonmutating(entry, baseline):
    repo, service, llm, src = fixture()
    brain = repo.get_story_brain(src.novel_id)
    repo._brains[src.novel_id] = replace(brain, metadata={**brain.metadata, 'status':'active', 'baseline_revision_id': baseline})
    before = asdict(repo.get_story_brain(src.novel_id))
    with pytest.raises(Exception, match='(?i)active'):
        if entry == 'idea':
            service.start_from_idea(tenant_id=TENANT, novel_id=src.novel_id, idea='Distinct setup')
        else:
            service.start(tenant_id=TENANT, novel_id=src.novel_id, revisions=[{'chapter_id':src.chapter_id,'revision_id':src.revision_id,'content_hash':src.content_hash}],locale='vi-VN',options={})
    assert asdict(repo.get_story_brain(src.novel_id)) == before
    assert not repo._bootstrap_jobs and not repo._analysis_runs
    assert llm.calls == 0

def test_mode_contract_cannot_silently_ignore_extract():
    payload = IdeaBootstrapRequest(novel_id='n', idea='setup', mode='extract')
    assert payload.mode == 'extract'
    _, service, llm, src = fixture()
    with pytest.raises(ValueError, match='EXTRACT_NOT_IMPLEMENTED'):
        service.start_from_idea(tenant_id=TENANT, novel_id=src.novel_id, idea='setup', mode='extract')
    assert llm.calls == 0
