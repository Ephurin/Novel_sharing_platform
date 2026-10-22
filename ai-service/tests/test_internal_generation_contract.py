from types import SimpleNamespace
from api.narrative_routes import get_internal_writing_generation
from domain.models import WritingGenerationJob

def test_internal_generation_preserves_controller_recovery_identity():
    job = WritingGenerationJob(job_id='generation', novel_id='novel', chapter_id='chapter',
        revision_id='base', content_hash='hash', tenant_id='tenant', operation='continuation',
        selection={'start':0,'end':0,'cursor':0}, instruction='continue',
        idempotency_key='auto-owned-run-iter-0-try-0', status='completed')
    repository = SimpleNamespace(get_writing_job=lambda generation_id: job)
    response = get_internal_writing_generation('generation', SimpleNamespace(_repository=repository))
    assert response['data']['idempotency_key'] == job.idempotency_key
    assert response['data']['novel_id'] == 'novel'
    assert response['data']['chapter_id'] == 'chapter'
