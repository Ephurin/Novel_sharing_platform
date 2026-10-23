import unittest
from fastapi.testclient import TestClient
from main import app
from api.deps import get_narrative_service
from application.narrative_service import NarrativeApplicationService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository

class AuthorOperationConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.novel_id = "test-novel-consist-1"
        self.repo = InMemoryNarrativeRepository()
        self.service = NarrativeApplicationService(repository=self.repo)
        # Seed an entity: "Trần Vân" status="Alive"
        self.repo.upsert_entity(self.novel_id, {
            "name": "Trần Vân",
            "entity_type": "PER",
            "status": "Alive",
            "location": "Thanh Vân Tông",
        })
        app.dependency_overrides[get_narrative_service] = lambda: self.service
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_consistency_contradiction_detected(self):
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/author-operation",
            json={
                "operation": "check_consistency",
                "content": "Bản thảo: Trần Vân đã hy sinh tại đại chiến.",
                "revision_id": "rev-123",
            },
        )
        self.assertEqual(res.status_code, 200)
        findings = res.json()["data"]["findings"]
        self.assertEqual(len(findings), 1)
        self.assertIn("Mâu thuẫn thực thể", findings[0]["description"])
        self.assertEqual(findings[0]["evidence"], "Trần Vân đã hy sinh")
        self.assertEqual(findings[0]["revision_id"], "rev-123")

    def test_consistency_clean_prose(self):
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/author-operation",
            json={
                "operation": "check_consistency",
                "content": "Bản thảo: Trần Vân chăm chỉ tu luyện tại động phủ.",
                "revision_id": "rev-123",
            },
        )
        self.assertEqual(res.status_code, 200)
        findings = res.json()["data"]["findings"]
        self.assertEqual(len(findings), 0)
