import unittest
import hashlib
import uuid
from types import SimpleNamespace
from fastapi.testclient import TestClient
from main import app
from api.deps import get_narrative_service
from application.narrative_service import NarrativeApplicationService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from application.ports import RevisionContent

class AuthorOperationConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.novel_id = str(uuid.uuid4())
        self.chapter_id = str(uuid.uuid4())
        self.revision_id = str(uuid.uuid4())
        self.previous_analysis = app.state.revision_analysis_service
        self.analysis = SimpleNamespace(_repository=None, _revision_provider=None)
        self.repo = InMemoryNarrativeRepository()
        self.service = NarrativeApplicationService(repository=self.repo)
        self.analysis._repository = self.repo
        app.state.revision_analysis_service = self.analysis
        # Seed an entity: "Trần Vân" status="Alive"
        self.repo.upsert_entity(self.novel_id, {
            "name": "Trần Vân",
            "entity_id": str(uuid.uuid4()),
            "entity_type": "PER",
            "status": "Alive",
            "location": "Thanh Vân Tông",
        })
        app.dependency_overrides[get_narrative_service] = lambda: self.service
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        app.state.revision_analysis_service = self.previous_analysis
        self.client.close()

    def source(self, content):
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        self.analysis._revision_provider = InMemoryRevisionContentProvider([
            RevisionContent(self.revision_id, self.novel_id, self.chapter_id, content, content_hash, 1)])
        return {'operation': 'check_consistency', 'content': content, 'revision_id': self.revision_id,
            'chapter_id': self.chapter_id, 'content_hash': content_hash}

    def test_consistency_contradiction_detected(self):
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/author-operation",
            headers={'X-Tenant-Id': '00000000-0000-0000-0000-000000000001'},
            json=self.source('Bản thảo: Trần Vân đã hy sinh tại đại chiến.'),
        )
        self.assertEqual(res.status_code, 200)
        findings = res.json()["data"]["findings"]
        self.assertEqual(len(findings), 1)
        self.assertIn("Mâu thuẫn thực thể", findings[0]["description"])
        self.assertEqual(findings[0]["evidence"], "Trần Vân đã hy sinh")
        self.assertEqual(findings[0]["revision_id"], self.revision_id)

    def test_consistency_clean_prose(self):
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/author-operation",
            headers={'X-Tenant-Id': '00000000-0000-0000-0000-000000000001'},
            json=self.source('Bản thảo: Trần Vân chăm chỉ tu luyện tại động phủ.'),
        )
        self.assertEqual(res.status_code, 200)
        findings = res.json()["data"]["findings"]
        self.assertEqual(len(findings), 0)

    def test_merged_fact_conflict_lists_every_fact_once(self):
        # BB1: check_canon merges one sentence that conflicts with two facts about the same character.
        from unittest.mock import patch
        merged = [{'rule_id': 'entity:e2:last_seen', 'rule_text': 'Lam Yên xuất hiện gần nhất ở Thiên Lôi Uyên (chương 17)',
                   'kind': 'fact', 'quote': 'Lam Yên ngồi bên bếp lửa', 'explanation': 'Đang ở Thiên Lôi Uyên', 'subject': 'e2',
                   'also': [{'rule_id': 'fact:f9', 'rule_text': 'Lam Yên: location = Thiên Lôi Uyên'}]}]
        self.analysis._llm_service = object()
        with patch('services.rule_consistency.check_canon', return_value=merged):
            res = self.client.post(
                f"/v1/story-brains/{self.novel_id}/author-operation",
                headers={'X-Tenant-Id': '00000000-0000-0000-0000-000000000001'},
                json=self.source('Bản thảo: Lam Yên ngồi bên bếp lửa.'),
            )
        self.assertEqual(res.status_code, 200)
        findings = res.json()["data"]["findings"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["code"], "CANON_FACT_CONFLICT")
        self.assertEqual(findings[0]["canon_ref"], 'entity:e2:last_seen')
        self.assertEqual(findings[0]["canon_refs"], ['entity:e2:last_seen', 'fact:f9'])
        self.assertIn('Thiên Lôi Uyên (chương 17); Lam Yên: location = Thiên Lôi Uyên', findings[0]["description"])
