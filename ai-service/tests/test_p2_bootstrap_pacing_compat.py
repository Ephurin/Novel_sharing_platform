"""Regression for P8 run 42271351664: existing controller bootstrap payload."""
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.narrative_routes import router
from api.schemas import IdeaBootstrapPreferences
from tests.test_p2_bootstrap_guard import TENANT, fixture


@pytest.fixture
def setup():
    repo, service, llm, src = fixture()
    app = FastAPI()
    app.state.bootstrap_service = service
    app.state.settings = SimpleNamespace(
        platform_service_token='pacing-compat-offline', service_auth_disabled=False,
    )
    app.include_router(router)
    headers = {'X-Service-Token': 'pacing-compat-offline', 'X-Tenant-Id': TENANT,
               'X-Request-Id': 'pacing-compat'}
    with TestClient(app) as client:
        yield repo, service, llm, src, client, headers


def test_existing_controller_pacing_payload_replays_and_still_requires_review(setup):
    repo, service, llm, src, client, headers = setup
    seen = []
    generate = llm.generate_story_blueprint

    def capture(**kwargs):
        seen.append(kwargs['preferences'])
        return generate(**kwargs)

    llm.generate_story_blueprint = capture
    body = {'novel_id': src.novel_id, 'idea': 'Explicit setup',
            'preferences': {'genre': ['Tiên Hiệp'], 'pacing': 'fast'}}
    first = client.post('/v1/story-brains/bootstrap/from-idea', json=body, headers=headers)
    assert first.status_code == 202, first.text
    replay = client.post('/v1/story-brains/bootstrap/from-idea', json=body, headers=headers)
    assert replay.status_code == 202
    assert replay.json()['data'] == first.json()['data']
    assert seen == [{'genre': ['Tiên Hiệp'], 'tone': 'neutral',
                     'target_length': 'long_form', 'pacing': 'fast'}]
    assert llm.calls == 1
    assert len(repo._bootstrap_jobs) == len(repo._analysis_runs) == 1
    assert not repo.get_story_brain(src.novel_id).events
    job_id = first.json()['data']['job_id']
    activate = client.post(f'/v1/story-brains/{src.novel_id}/baseline/activate',
                           json={'job_id': job_id}, headers=headers)
    assert activate.status_code == 409
    assert activate.json()['detail']['code'] == 'BASELINE_REVIEW_REQUIRED'
    assert service.get_job(job_id).status == 'waiting_review'


def test_absent_pacing_preserves_existing_serialized_preferences_and_job_identity(setup):
    _, service, llm, src, client, headers = setup
    legacy = {'genre': [], 'tone': 'neutral', 'target_length': 'long_form'}
    assert IdeaBootstrapPreferences().model_dump(exclude_none=True) == legacy
    job = service.start_from_idea(tenant_id=TENANT, novel_id=src.novel_id,
                                  idea='source', preferences=legacy)
    response = client.post('/v1/story-brains/bootstrap/from-idea',
                           json={'novel_id': src.novel_id, 'idea': 'source'}, headers=headers)
    assert response.status_code == 202
    assert response.json()['data']['job_id'] == job.job_id
    assert llm.calls == 1


@pytest.mark.parametrize('preferences', [{'pacing': []}, {'pacing': ''}, {'unknown': 'fast'}])
def test_invalid_or_unknown_preferences_still_fail_before_provider(setup, preferences):
    repo, _, llm, src, client, headers = setup
    response = client.post('/v1/story-brains/bootstrap/from-idea', json={
        'novel_id': src.novel_id, 'idea': 'source', 'preferences': preferences,
    }, headers=headers)
    assert response.status_code == 422
    assert llm.calls == 0
    assert not repo._bootstrap_jobs
