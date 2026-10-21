from fastapi.testclient import TestClient
import pytest

from api.deps import get_narrative_repository, get_revision_analysis_service
from main import app
from tests.test_entity_candidates import Verifier, service


@pytest.fixture
def api():
    repository, analysis, args = service('An tới trạm Bốn.', Verifier())
    app.dependency_overrides[get_narrative_repository] = lambda: repository
    app.dependency_overrides[get_revision_analysis_service] = lambda: analysis
    with TestClient(app) as client:
        yield client, repository, analysis, args
    app.dependency_overrides.clear()


def test_review_http_contract_pauses_then_resumes_only_after_explicit_decisions(api):
    client, repo, _, args = api
    headers = {'X-Tenant-Id': 't', 'X-Request-Id': 'review-test', 'Idempotency-Key': args['idempotency_key']}
    response = client.post(f"/v1/revisions/{args['revision_id']}/analyses", headers=headers,
        json={k: args[k] for k in ('novel_id', 'chapter_id', 'content_hash', 'operation', 'options')})
    assert response.status_code == 202
    data = response.json()['data']
    assert data['status'] == 'waiting_entity_review' and data['proposal_count'] == 0
    base = f"/v1/story-brains/story/entity-reviews/{data['analysis_run_id']}"
    waiting = client.post(base + '/continue', headers=headers)
    assert waiting.json()['data']['status'] == 'waiting_entity_review'
    audit = client.get('/v1/story-brains/story/entity-reviews').json()['data'][0]
    payload = {'expected_version': audit['review_version'], 'decisions': audit['decisions']}
    assert client.post(base + '/review', json=payload, headers={**headers, 'X-Tenant-Id': 'other'}).status_code == 404
    assert client.post(base.replace('/story/', '/other/') + '/review', json=payload, headers=headers).status_code == 404
    assert client.post(base + '/review', json={**payload, 'decisions': []}, headers=headers).status_code == 422
    assert client.post(base + '/review', json=payload, headers=headers).status_code == 200
    assert client.post(base + '/review', json=payload, headers=headers).status_code == 409
    assert not repo.list_entities('story')
    final = client.post(base + '/continue', headers=headers)
    assert final.status_code == 200 and final.json()['data']['status'] == 'completed'
    assert client.get('/v1/story-brains/story/entity-reviews').json()['data'] == []


def test_guidance_http_conflict_and_invalid_input(api):
    client, repo, _, _ = api
    path = '/v1/story-brains/story/entity-guidance'
    assert client.get(path).json()['data']['version'] == 0
    payload = {'entries': [{'name': 'vòng bạc'}], 'expected_version': 0}
    assert client.post(path, json=payload).json()['data']['version'] == 1
    assert client.post(path, json=payload).status_code == 409
    assert client.post(path, json={'entries': [{'name': ''}], 'expected_version': 1}).status_code == 422
    assert not repo.list_entities('story')


def test_author_declaration_http_creates_proposal_without_claiming_source_presence(api):
    client, repo, _, _ = api
    response = client.post('/v1/story-brains/story/author-entities', json={'name': 'Mai', 'entity_type': 'PER'})
    assert response.status_code == 201
    assert response.json()['data']['evidence'] == []
    assert not repo.list_entities('story')
