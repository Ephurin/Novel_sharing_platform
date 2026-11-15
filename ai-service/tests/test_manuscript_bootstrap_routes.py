from __future__ import annotations

import hashlib
import os
import unittest

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_bootstrap_service, get_narrative_service
from application.bootstrap_service import ManuscriptBootstrapService
from application.narrative_service import NarrativeApplicationService
from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from services.entity_pipeline.pipeline import EntityPipeline
from tests.harness.fake_llm import FakeDeterministicLLMService


class ManuscriptBootstrapRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000011"
        self.novel_id = "10000000-0000-0000-0000-000000000011"
        self.chapter_id = "20000000-0000-0000-0000-000000000011"
        self.revision_id = "30000000-0000-0000-0000-000000000011"
        content = (
            "Luật: Người chết không thể hồi sinh.\n"
            "Tiêu Viêm đối đầu Hải Ba Đông tại sa mạc."
        )
        self.content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        revision = RevisionContent(
            revision_id=self.revision_id,
            novel_id=self.novel_id,
            chapter_id=self.chapter_id,
            content=content,
            content_hash=self.content_hash,
        )
        repository = InMemoryNarrativeRepository()
        provider = InMemoryRevisionContentProvider([revision])
        analysis = RevisionAnalysisService(
            repository,
            provider,
            EntityPipeline("bootstrap-route-test", "bootstrap-route-test"),
            FakeDeterministicLLMService(),
        )
        self.bootstrap = ManuscriptBootstrapService(repository, provider, analysis)
        narrative = NarrativeApplicationService(repository)
        app.dependency_overrides[get_bootstrap_service] = lambda: self.bootstrap
        app.dependency_overrides[get_narrative_service] = lambda: narrative
        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Request-Id": "bootstrap-route-request",
        }

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()

    def test_import_review_and_activate_baseline(self) -> None:
        started = self.client.post(
            "/v1/story-brains/bootstrap/from-manuscript",
            headers=self.headers,
            json={
                "novel_id": self.novel_id,
                "revisions": [
                    {
                        "chapter_id": self.chapter_id,
                        "revision_id": self.revision_id,
                        "content_hash": self.content_hash,
                    }
                ],
                "locale": "vi-VN",
                "options": {
                    "extract_world_rules": True,
                    "build_embeddings": False,
                    "require_review_for_all": True,
                },
            },
        )
        self.assertEqual(started.status_code, 202)
        job_id = started.json()["data"]["job_id"]

        job = self.client.get(f"/v1/jobs/{job_id}", headers=self.headers)
        self.assertEqual(job.status_code, 200)
        self.assertEqual(job.json()["data"]["status"], "waiting_review")
        self.assertEqual(job.json()["data"]["progress"]["current"], 1)

        queue = self.client.get(
            f"/v1/story-brains/{self.novel_id}/review-queue", headers=self.headers
        )
        self.assertEqual(queue.status_code, 200)
        proposals = queue.json()["data"]
        self.assertTrue(proposals)
        self.assertEqual(proposals[0]["review_priority"], 80)

        blocked = self.client.post(
            f"/v1/story-brains/{self.novel_id}/baseline/activate",
            headers=self.headers,
            json={"job_id": job_id},
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["detail"]["code"], "BASELINE_REVIEW_REQUIRED")

        fact = next(p for p in proposals if p['proposal_type'] == 'fact')
        rejected = self.client.post(f"/v1/proposals/{fact['proposal_id']}/reject",
            headers=self.headers, json={'reason': 'partial review'})
        self.assertEqual(rejected.status_code, 422)
        unchanged = self.client.get(f'/v1/story-brains/{self.novel_id}/review-queue', headers=self.headers)
        self.assertEqual(unchanged.json()['data'], proposals)
        version = 1
        for group_id in dict.fromkeys(p['dependency_group_id'] for p in proposals):
            accepted = self.client.post(f'/v1/proposal-groups/{group_id}/accept', headers=self.headers,
                json={'proposal_ids': [p['proposal_id'] for p in proposals if p['dependency_group_id'] == group_id],
                      'expected_brain_version': version})
            self.assertEqual(accepted.status_code, 200, accepted.text)
            version = accepted.json()['data']['brain_version']

        activated = self.client.post(
            f"/v1/story-brains/{self.novel_id}/baseline/activate",
            headers=self.headers,
            json={"job_id": job_id},
        )
        self.assertEqual(activated.status_code, 200)
        self.assertEqual(activated.json()["data"]["status"], "active")

        summary = self.client.get(f"/v1/story-brains/by-novel/{self.novel_id}")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.json()["data"]["baseline_revision_id"], self.revision_id)
        self.assertEqual(summary.json()["data"]["counts"]["pending_proposals"], 0)

    def test_import_rejects_content_hash_mismatch_before_job_creation(self) -> None:
        response = self.client.post(
            "/v1/story-brains/bootstrap/from-manuscript",
            headers=self.headers,
            json={
                "novel_id": self.novel_id,
                "revisions": [
                    {
                        "chapter_id": self.chapter_id,
                        "revision_id": self.revision_id,
                        "content_hash": "0" * 64,
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "CONTENT_HASH_MISMATCH")


if __name__ == "__main__":
    unittest.main()
