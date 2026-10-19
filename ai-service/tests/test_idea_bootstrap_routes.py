from __future__ import annotations

import os
import unittest

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_bootstrap_service, get_narrative_service
from application.bootstrap_service import ManuscriptBootstrapService
from application.narrative_service import NarrativeApplicationService
from application.revision_analysis_service import RevisionAnalysisService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app
from services.entity_pipeline.pipeline import EntityPipeline
from tests.harness.fake_llm import FakeDeterministicLLMService


class IdeaBootstrapRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000022"
        self.novel_id = "10000000-0000-0000-0000-000000000022"
        self.repository = InMemoryNarrativeRepository()
        self.provider = InMemoryRevisionContentProvider([])
        self.fake_llm = FakeDeterministicLLMService()
        self.analysis = RevisionAnalysisService(
            self.repository,
            self.provider,
            EntityPipeline("idea-route-test", "idea-route-test"),
            self.fake_llm,
        )
        self.bootstrap = ManuscriptBootstrapService(
            self.repository,
            self.provider,
            self.analysis,
            llm_service=self.fake_llm,
        )
        self.narrative = NarrativeApplicationService(self.repository)
        app.dependency_overrides[get_bootstrap_service] = lambda: self.bootstrap
        app.dependency_overrides[get_narrative_service] = lambda: self.narrative
        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Request-Id": "idea-bootstrap-request-001",
        }

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_bootstrap_from_idea_creates_proposals_and_activates_baseline(self) -> None:
        payload = {
            "mode": "blueprint",
            "novel_id": self.novel_id,
            "idea": "Một pháp sư mất trí nhớ điều tra cái chết của chính mình tại sa mạc.",
            "outline": "Chương 1: Tỉnh dậy trong hoang mạc. Chương 2: Gặp gỡ đồng minh.",
            "locale": "vi-VN",
            "preferences": {
                "genre": ["fantasy", "mystery"],
                "tone": "dark",
                "target_length": "long_form",
            },
            "author_constraints": [
                "Không có du hành thời gian",
            ],
        }

        # 1. Start bootstrap from idea
        resp = self.client.post(
            "/v1/story-brains/bootstrap/from-idea",
            json=payload,
            headers=self.headers,
        )
        self.assertEqual(resp.status_code, 202, resp.text)
        data = resp.json()["data"]
        job_id = data["job_id"]
        self.assertEqual(data["story_brain_id"], self.novel_id)
        self.assertEqual(data["status"], "waiting_review")

        # 2. Check review queue
        rq_resp = self.client.get(
            f"/v1/story-brains/{self.novel_id}/review-queue",
            headers=self.headers,
        )
        self.assertEqual(rq_resp.status_code, 200, rq_resp.text)
        proposals = rq_resp.json()["data"]
        self.assertGreater(len(proposals), 0)

        types = {p["proposal_type"] for p in proposals}
        self.assertIn("fact", types)  # premise & world rules
        self.assertIn("entity", types)  # characters/locations

        # Find premise
        premise_prop = next(p for p in proposals if p["payload"].get("fact_type") == "premise")
        self.assertIn("Một pháp sư", premise_prop["payload"]["fact_value"])

        # 3. Accept all proposals
        group_id = proposals[0]["dependency_group_id"]
        accept_resp = self.client.post(
            f"/v1/proposal-groups/{group_id}/accept",
            json={
                "proposal_ids": [p["proposal_id"] for p in proposals],
                "expected_brain_version": 1,
            },
            headers=self.headers,
        )
        self.assertEqual(accept_resp.status_code, 200, accept_resp.text)
        self.assertEqual(accept_resp.json()["data"]["brain_version"], 2)

        # 4. Activate baseline
        act_resp = self.client.post(
            f"/v1/story-brains/{self.novel_id}/baseline/activate",
            json={"job_id": job_id},
            headers=self.headers,
        )
        self.assertEqual(act_resp.status_code, 200, act_resp.text)
        self.assertEqual(act_resp.json()["data"]["status"], "active")

        # 5. Check active Story Brain summary
        brain_resp = self.client.get(
            f"/v1/story-brains/by-novel/{self.novel_id}",
            headers=self.headers,
        )
        self.assertEqual(brain_resp.status_code, 200, brain_resp.text)
        brain_data = brain_resp.json()["data"]
        self.assertEqual(brain_data["status"], "active")
        self.assertEqual(brain_data["brain_version"], 2)
        self.assertGreater(brain_data["counts"]["entities"], 0)

    def test_bootstrap_from_idea_idempotency(self) -> None:
        payload = {
            "mode": "blueprint",
            "novel_id": self.novel_id,
            "idea": "Idempotent idea test.",
            "locale": "vi-VN",
        }
        resp1 = self.client.post("/v1/story-brains/bootstrap/from-idea", json=payload, headers=self.headers)
        self.assertEqual(resp1.status_code, 202)
        job1 = resp1.json()["data"]["job_id"]

        resp2 = self.client.post("/v1/story-brains/bootstrap/from-idea", json=payload, headers=self.headers)
        self.assertEqual(resp2.status_code, 202)
        job2 = resp2.json()["data"]["job_id"]

        self.assertEqual(job1, job2)

    def test_bootstrap_locale_distinct_jobs(self) -> None:
        payload_vi = {
            "mode": "blueprint",
            "novel_id": self.novel_id,
            "idea": "A detective solves their own murder.",
            "locale": "vi-VN",
        }
        payload_en = {
            "mode": "blueprint",
            "novel_id": self.novel_id,
            "idea": "A detective solves their own murder.",
            "locale": "en-US",
        }
        # First request in vi-VN
        resp_vi1 = self.client.post("/v1/story-brains/bootstrap/from-idea", json=payload_vi, headers=self.headers)
        self.assertEqual(resp_vi1.status_code, 202)
        job_vi1 = resp_vi1.json()["data"]["job_id"]

        # Repeated request in vi-VN produces identical job_id
        resp_vi2 = self.client.post("/v1/story-brains/bootstrap/from-idea", json=payload_vi, headers=self.headers)
        self.assertEqual(resp_vi2.status_code, 202)
        self.assertEqual(job_vi1, resp_vi2.json()["data"]["job_id"])

        # Request in en-US produces distinct job_id
        resp_en = self.client.post("/v1/story-brains/bootstrap/from-idea", json=payload_en, headers=self.headers)
        self.assertEqual(resp_en.status_code, 202)
        job_en = resp_en.json()["data"]["job_id"]
        self.assertNotEqual(job_vi1, job_en)

    def test_provider_failure_fails_closed(self) -> None:
        class FailingLLM:
            def _call_llm(self, **kwargs: object) -> str:
                raise ConnectionError("LLM API endpoint unavailable")

        failing_bootstrap = ManuscriptBootstrapService(
            self.repository,
            self.provider,
            self.analysis,
            llm_service=FailingLLM(),
        )
        with self.assertRaises(RuntimeError) as ctx:
            failing_bootstrap.start_from_idea(
                tenant_id=self.tenant_id,
                novel_id="20000000-0000-0000-0000-000000000088",
                idea="A warrior explores ancient ruins.",
            )
        self.assertIn("Provider failed to generate structured story blueprint", str(ctx.exception))

    def test_provider_invalid_json_fails_closed(self) -> None:
        class CorruptLLM:
            def _call_llm(self, **kwargs: object) -> str:
                return '{"corrupt": true}'  # Missing required premise

        corrupt_bootstrap = ManuscriptBootstrapService(
            self.repository,
            self.provider,
            self.analysis,
            llm_service=CorruptLLM(),
        )
        with self.assertRaises(RuntimeError) as ctx:
            corrupt_bootstrap.start_from_idea(
                tenant_id=self.tenant_id,
                novel_id="20000000-0000-0000-0000-000000000089",
                idea="A warrior explores ancient ruins.",
            )
        self.assertIn("Provider failed to generate structured story blueprint", str(ctx.exception))

    def test_no_provider_fallback_derives_only_from_user_inputs(self) -> None:
        offline_bootstrap = ManuscriptBootstrapService(
            self.repository,
            self.provider,
            self.analysis,
            llm_service=None,  # Explicit no-provider path
        )
        test_novel_id = "20000000-0000-0000-0000-000000000090"
        job = offline_bootstrap.start_from_idea(
            tenant_id=self.tenant_id,
            novel_id=test_novel_id,
            idea="A realistic cyber-espionage thriller in Tokyo.",
            preferences={"genre": ["cyberpunk", "thriller"], "tone": "gritty"},
            author_constraints=["No magic allowed", "Hard sci-fi physics"],
        )
        self.assertEqual(job.status, "waiting_review")

        # Fetch generated proposals from repository
        queue = self.repository.list_proposals(test_novel_id)
        self.assertEqual(len(queue), 5)  # 1 premise + 2 preferences rules + 2 author constraints

        premise_prop = next(p for p in queue if p.payload.get("fact_type") == "premise")
        self.assertEqual(premise_prop.payload["fact_value"], "A realistic cyber-espionage thriller in Tokyo.")

        rule_values = [p.payload["fact_value"] for p in queue if p.payload.get("fact_type") == "world_rule"]
        self.assertIn("Genre: cyberpunk, thriller", rule_values)
        self.assertIn("Tone: gritty", rule_values)
        self.assertIn("No magic allowed", rule_values)
        self.assertIn("Hard sci-fi physics", rule_values)

        # Assert no fantasy lore or phantom entities were invented
        entity_props = [p for p in queue if p.proposal_type == "entity"]
        self.assertEqual(len(entity_props), 0)
        for r in rule_values:
            self.assertNotIn("ma thuật", r.lower())
            self.assertNotIn("bảo toàn", r.lower())


if __name__ == "__main__":
    unittest.main()
