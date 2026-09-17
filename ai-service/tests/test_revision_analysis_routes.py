import hashlib
import json
import os
import unittest

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_narrative_service, get_revision_analysis_service
from application.narrative_service import NarrativeApplicationService
from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from domain.models import NarrativeProposal
from services.entity_pipeline.pipeline import EntityPipeline


class FakeLLMService:
    model = "fake-model"

    def __init__(self) -> None:
        self.responses = [
            json.dumps([{"phrase": "Minh", "entity": "PER", "score": 0.98}]),
            json.dumps({"events": []}),
        ]

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        return self.responses.pop(0)


class RevisionAnalysisRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        content = "Minh bước vào thành."
        self.content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        revision = RevisionContent(
            revision_id="revision-route",
            novel_id="novel-route",
            chapter_id="chapter-route",
            content=content,
            content_hash=self.content_hash,
        )
        repository = InMemoryNarrativeRepository()
        self.repository = repository
        narrative = NarrativeApplicationService(repository)
        analysis = RevisionAnalysisService(
            repository,
            InMemoryRevisionContentProvider([revision]),
            EntityPipeline("entity-test-v1", "prompt-test-v1"),
            FakeLLMService(),
        )
        app.dependency_overrides[get_narrative_service] = lambda: narrative
        app.dependency_overrides[get_revision_analysis_service] = lambda: analysis
        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": "tenant-route",
            "X-Request-Id": "request-route",
            "Idempotency-Key": "analysis-route",
        }

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()

    def test_analyze_list_accept_and_reject_routes(self) -> None:
        analyzed = self.client.post(
            "/v1/revisions/revision-route/analyses",
            headers=self.headers,
            json={
                "novel_id": "novel-route",
                "chapter_id": "chapter-route",
                "content_hash": self.content_hash,
                "options": {"extract_entities": True, "extract_events": True},
            },
        )
        self.assertEqual(analyzed.status_code, 202)
        self.assertEqual(analyzed.json()["data"]["proposal_count"], 1)

        listed = self.client.get(
            "/v1/story-brains/novel-route/proposals",
            headers={"X-Request-Id": "request-route"},
        )
        proposal_id = listed.json()["data"][0]["proposal_id"]
        accepted = self.client.post(
            f"/v1/proposals/{proposal_id}/accept",
            headers={"X-Request-Id": "request-route"},
            json={"expected_brain_version": 1},
        )

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["data"]["status"], "accepted")

        repeated = self.client.post(
            f"/v1/proposals/{proposal_id}/accept",
            headers={"X-Request-Id": "request-route"},
            json={"expected_brain_version": 1},
        )
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(repeated.json()["detail"]["code"], "PROPOSAL_ALREADY_DECIDED")

    def test_reject_endpoint_does_not_materialize_entity(self) -> None:
        self.client.post(
            "/v1/revisions/revision-route/analyses",
            headers=self.headers,
            json={
                "novel_id": "novel-route",
                "chapter_id": "chapter-route",
                "content_hash": self.content_hash,
                "options": {"extract_entities": True, "extract_events": True},
            },
        )
        listed = self.client.get(
            "/v1/story-brains/novel-route/proposals",
            headers={"X-Request-Id": "request-route"},
        )
        proposal_id = listed.json()["data"][0]["proposal_id"]
        rejected = self.client.post(
            f"/v1/proposals/{proposal_id}/reject",
            headers={"X-Request-Id": "request-route"},
            json={"reason": "incorrect entity"},
        )
        snapshot = self.client.get("/v1/enhanced/kb/novel-route")

        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["data"]["status"], "rejected")
        self.assertFalse(snapshot.json()["entities"])

    def test_bulk_group_accept_materializes_once(self) -> None:
        group_id = "group-route"
        proposals = [
            NarrativeProposal(
                proposal_id="entity-route",
                proposal_type="entity",
                payload={
                    "canonical_name": "Minh",
                    "normalized_name": "minh",
                    "entity_type": "PER",
                },
                dependency_group_id=group_id,
                materialization_order=10,
            ),
            NarrativeProposal(
                proposal_id="fact-route",
                proposal_type="fact",
                payload={
                    "fact_type": "world_rule",
                    "fact_key": "no_revival",
                    "fact_value": True,
                },
                dependency_group_id=group_id,
                materialization_order=20,
            ),
        ]
        self.repository.save_proposals("novel-route", proposals)

        response = self.client.post(
            f"/v1/proposal-groups/{group_id}/accept",
            headers={"X-Request-Id": "request-route"},
            json={
                "expected_brain_version": 1,
                "proposal_ids": [item.proposal_id for item in proposals],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["brain_version"], 2)
        brain = self.repository.get_story_brain("novel-route")
        self.assertEqual(len(brain.entities), 1)
        self.assertEqual(len(brain.facts), 1)
