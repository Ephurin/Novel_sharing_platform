import os
import unittest

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"

from fastapi.testclient import TestClient

from api.deps import get_narrative_service
from application.narrative_service import NarrativeApplicationService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from main import app


class NarrativeRouteCompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        repository = InMemoryNarrativeRepository()
        service = NarrativeApplicationService(repository)
        app.dependency_overrides[get_narrative_service] = lambda: service
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()

    def test_legacy_kb_relation_and_graph_routes_use_application_service(self) -> None:
        override = self.client.post(
            "/v1/enhanced/relation/override",
            json={
                "story_id": "default_story",
                "subject": "Minh",
                "relation": "ALLY_OF",
                "object": "Lan",
            },
        )
        snapshot = self.client.get("/v1/enhanced/kb/default_story")
        graph = self.client.post(
            "/v1/ai/graph/related", json={"entity": "Minh", "limit": 10}
        )

        self.assertEqual(override.status_code, 200)
        self.assertEqual(snapshot.status_code, 200)
        self.assertEqual(graph.status_code, 200)
        self.assertEqual(
            graph.json()["related"], [{"name": "Lan", "relation": "ALLY_OF"}]
        )
