import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.deps import get_narrative_service
from api.narrative_routes import router
from application.narrative_service import NarrativeApplicationService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from tests.test_state_projection import accept, event_group


def test_state_correction_review_and_rebuild_routes():
    repo = InMemoryNarrativeRepository()
    repo.upsert_entity("story", {"name": "Minh"})
    first = event_group()
    accept(repo, first)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_narrative_service] = lambda: NarrativeApplicationService(repo)
    with TestClient(app) as client:
        response = client.post(f"/v1/story-brains/story/events/{first[0].proposal_id}/corrections", json={
            "expected_brain_version": 2,
            "replacement": {"event_type": "injury", "summary": "Minor injury", "participants": ["Minh"]},
            "transitions": [{"entity_id": "Minh", "attribute_key": "health", "new_value": 95}]})
        assert response.status_code == 201
        proposals = response.json()["data"]
        assert len(repo.get_story_brain("story").events) == 1
        accepted = client.post(f"/v1/proposal-groups/{proposals[0]['dependency_group_id']}/accept",
            headers={"X-Request-Id": "correction-review"}, json={"expected_brain_version": 2,
                "proposal_ids": [p["proposal_id"] for p in proposals]})
        assert accepted.status_code == 200
        state = client.get("/v1/story-brains/story/state").json()["data"]
        assert next(iter(state["entities"].values()))["health"] == 95
        rebuilt = client.post("/v1/story-brains/story/projections/rebuild", json={"expected_brain_version": 3})
        assert rebuilt.status_code == 200 and rebuilt.json()["data"] == state
        assert client.post("/v1/story-brains/story/projections/rebuild",
            json={"expected_brain_version": 2}).status_code == 409
        assert client.post(f"/v1/story-brains/story/events/{uuid.uuid4()}/corrections", json={
            "expected_brain_version": 3, "replacement": {"event_type": "x", "summary": "x"}}).status_code == 404


def test_invalid_transition_review_returns_422_and_keeps_proposals_pending():
    repo = InMemoryNarrativeRepository()
    repo.upsert_entity("story", {"name": "Minh"})
    proposals = event_group(120)
    repo.save_proposals("story", proposals)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_narrative_service] = lambda: NarrativeApplicationService(repo)
    with TestClient(app) as client:
        result = client.post(f"/v1/proposal-groups/{proposals[0].dependency_group_id}/accept",
            headers={"X-Request-Id": "bad-review"}, json={"expected_brain_version": 1,
                "proposal_ids": [p.proposal_id for p in proposals]})
        assert result.status_code == 422
        assert result.json()["detail"]["code"] == "INVALID_PROJECTION"
        assert not repo.get_story_brain("story").events
