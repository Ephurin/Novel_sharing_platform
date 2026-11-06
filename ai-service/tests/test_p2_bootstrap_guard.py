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


def test_concurrent_requests_reserve_before_provider_and_replay_once():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from domain.errors import BootstrapConflictError, IdempotencyConflictError
    repo, service, llm, src = fixture()
    entered, release = Event(), Event()
    original = llm.generate_story_blueprint

    def slow(**kwargs):
        entered.set()
        assert release.wait(5)
        return original(**kwargs)

    llm.generate_story_blueprint = slow
    args = dict(tenant_id=TENANT, novel_id=src.novel_id, idea='source', idempotency_key='same')
    with ThreadPoolExecutor() as pool:
        worker = pool.submit(service.start_from_idea, **args)
        assert entered.wait(5)
        try:
            replay = service.start_from_idea(**args)
            assert replay.status == 'running'
            with pytest.raises(BootstrapConflictError, match='BOOTSTRAP_IN_PROGRESS'):
                service.start_from_idea(**{**args, 'idempotency_key': 'other'})
            with pytest.raises(IdempotencyConflictError):
                service.start_from_idea(**{**args, 'idea': 'changed'})
        finally:
            release.set()
        job = worker.result(timeout=5)
    assert job.job_id == replay.job_id
    assert job.status == 'waiting_review'
    assert llm.calls == 1
    assert len(repo._bootstrap_jobs) == len(repo._analysis_runs) == 1
    assert not repo.get_story_brain(src.novel_id).events


def test_failed_blueprint_replay_does_not_dispatch_again():
    repo, service, llm, src = fixture()
    def fail(**kwargs):
        llm.calls += 1
        raise RuntimeError('fake provider failure')
    llm.generate_story_blueprint = fail
    args = dict(tenant_id=TENANT, novel_id=src.novel_id, idea='source', idempotency_key='failed')
    with pytest.raises(RuntimeError, match='fake provider failure'):
        service.start_from_idea(**args)
    job = service.start_from_idea(**args)
    assert service.resume(job.job_id).status == 'failed'
    assert llm.calls == 1
    assert not repo._analysis_runs
    assert not repo.list_proposals(src.novel_id)


def test_activation_requires_every_persisted_required_decision():
    from domain.errors import BaselineReviewRequiredError
    repo, service, _, src = fixture()
    job = service.start_from_idea(tenant_id=TENANT, novel_id=src.novel_id, idea='source')
    missing = str(uuid.uuid4())
    repo.save_bootstrap_job(replace(job, result={**job.result, 'required_proposal_ids': [missing]}))
    with pytest.raises(BaselineReviewRequiredError):
        service.activate_baseline(src.novel_id, job.job_id)
    assert repo.get_story_brain(src.novel_id).metadata['status'] == 'importing'
    assert repo.get_bootstrap_job(job.job_id).status == 'waiting_review'
