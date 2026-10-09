from __future__ import annotations

import os
import unittest
import uuid

os.environ["LLM_ENABLED"] = "false"
os.environ["LLM_PROVIDER"] = "none"
os.environ["NARRATIVE_REPOSITORY"] = "json"

from fastapi.testclient import TestClient

from api.deps import get_narrative_repository, get_writing_service, require_service_token
from application.writing_service import WritingService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from main import app


class StoryPlanRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000022"
        self.novel_id = "10000000-0000-0000-0000-000000000022"
        self.repository = InMemoryNarrativeRepository()
        self.writing_service = WritingService(self.repository, llm_service=None)

        app.dependency_overrides[get_narrative_repository] = lambda: self.repository
        app.dependency_overrides[get_writing_service] = lambda: self.writing_service
        app.dependency_overrides[require_service_token] = lambda: None

        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Request-Id": "story-plan-request-001",
            "X-Author-Id": "author-user-001",
        }

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_story_plan_create_and_idempotency(self) -> None:
        payload = {
            "novel_id": self.novel_id,
            "source_outline": "Chương 1: Tỉnh dậy trong hoang mạc.\nChương 2: Đột kích doanh trại địch.\nChương 3: Chiến thắng cuối cùng.",
            "idempotency_key": "idemp-plan-1",
            "objectives": [
                {
                    "order_index": 1,
                    "title": "Tỉnh dậy",
                    "description": "Nhân vật chính tỉnh dậy mất trí nhớ ở hoang mạc",
                    "target_chapter": 1,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 2,
                    "title": "Đột kích",
                    "description": "Đột kích doanh trại ma thú thu thập mảnh tinh thạch",
                    "target_chapter": 2,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 3,
                    "title": "Chiến thắng",
                    "description": "Đánh bại ma vương và giải phóng vùng đất",
                    "target_chapter": 3,
                    "objective_type": "chapter_goal",
                },
            ],
        }

        # 1. Create Story Plan
        res = self.client.post("/v1/story-plans", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()["data"]
        plan_id = data["plan_id"]
        self.assertEqual(data["novel_id"], self.novel_id)
        self.assertEqual(data["plan_version"], 1)
        self.assertEqual(data["status"], "draft")
        self.assertEqual(len(data["objectives"]), 3)
        self.assertEqual(data["objectives"][0]["title"], "Tỉnh dậy")
        self.assertEqual(data["objectives"][0]["status"], "pending")

        # 2. Idempotent repeat returns existing plan
        res_repeat = self.client.post("/v1/story-plans", json=payload, headers=self.headers)
        self.assertEqual(res_repeat.status_code, 201)
        self.assertEqual(res_repeat.json()["data"]["plan_id"], plan_id)
        self.assertEqual(res_repeat.json()["data"]["plan_version"], 1)

    def test_story_plan_activate_and_supersede_lifecycle(self) -> None:
        payload_v1 = {
            "novel_id": self.novel_id,
            "source_outline": "Kế hoạch bản v1",
            "objectives": [
                {"order_index": 1, "title": "Mục tiêu 1", "description": "Mô tả 1", "target_chapter": 1},
            ],
        }
        res1 = self.client.post("/v1/story-plans", json=payload_v1, headers=self.headers)
        self.assertEqual(res1.status_code, 201)
        plan_v1_id = res1.json()["data"]["plan_id"]

        # Activate Plan V1
        res_act1 = self.client.post(f"/v1/story-plans/{plan_v1_id}/activate?novel_id={self.novel_id}", headers=self.headers)
        self.assertEqual(res_act1.status_code, 200)
        self.assertEqual(res_act1.json()["data"]["status"], "active")
        self.assertEqual(res_act1.json()["data"]["plan_version"], 1)

        # Check active plan endpoint
        res_get_act = self.client.get(f"/v1/story-plans/by-novel/{self.novel_id}/active", headers=self.headers)
        self.assertEqual(res_get_act.status_code, 200)
        self.assertEqual(res_get_act.json()["data"]["plan_id"], plan_v1_id)

        # Create Plan V2
        payload_v2 = {
            "novel_id": self.novel_id,
            "source_outline": "Kế hoạch bản v2 đã chỉnh sửa",
            "objectives": [
                {"order_index": 1, "title": "Mục tiêu 1 đã sửa", "description": "Mô tả 1 sửa", "target_chapter": 1},
                {"order_index": 2, "title": "Mục tiêu 2 mới", "description": "Mô tả 2", "target_chapter": 2},
            ],
        }
        res2 = self.client.post("/v1/story-plans", json=payload_v2, headers=self.headers)
        self.assertEqual(res2.status_code, 201)
        plan_v2_id = res2.json()["data"]["plan_id"]
        self.assertEqual(res2.json()["data"]["plan_version"], 2)
        self.assertEqual(res2.json()["data"]["status"], "draft")

        # Activate Plan V2 -> Plan V1 becomes superseded
        res_act2 = self.client.post(f"/v1/story-plans/{plan_v2_id}/activate?novel_id={self.novel_id}", headers=self.headers)
        self.assertEqual(res_act2.status_code, 200)
        self.assertEqual(res_act2.json()["data"]["status"], "active")
        self.assertEqual(res_act2.json()["data"]["plan_version"], 2)

        # Verify Plan V1 is now superseded
        res_p1 = self.client.get(f"/v1/story-plans/{plan_v1_id}", headers=self.headers)
        self.assertEqual(res_p1.status_code, 200)
        self.assertEqual(res_p1.json()["data"]["status"], "superseded")

    def test_story_plan_objective_update_status(self) -> None:
        res = self.client.post(
            "/v1/story-plans",
            json={
                "novel_id": self.novel_id,
                "objectives": [
                    {"order_index": 1, "title": "Bắt đầu", "description": "Khởi đầu", "target_chapter": 1},
                ],
            },
            headers=self.headers,
        )
        plan = res.json()["data"]
        plan_id = plan["plan_id"]
        obj_id = plan["objectives"][0]["objective_id"]

        # Update status to completed
        res_patch = self.client.patch(
            f"/v1/story-plans/{plan_id}/objectives/{obj_id}?novel_id={self.novel_id}",
            json={"status": "completed"},
            headers=self.headers,
        )
        self.assertEqual(res_patch.status_code, 200)
        self.assertEqual(res_patch.json()["data"]["status"], "completed")

    def test_story_plan_future_leakage_guard_in_context_preview(self) -> None:
        # 1. Create and activate plan with 3 ordered chapters
        res = self.client.post(
            "/v1/story-plans",
            json={
                "novel_id": self.novel_id,
                "source_outline": "Chương 1: Tìm kiếm di tích.\nChương 2: Đối mặt hắc ám kỵ sĩ.\nChương 3: Tiêu diệt ác ma Roland.",
                "objectives": [
                    {"order_index": 1, "title": "Tìm di tích", "description": "Khám phá phế tích cổ đại", "target_chapter": 1},
                    {"order_index": 2, "title": "Hắc ám kỵ sĩ", "description": "Giao tranh với kỵ sĩ bóng đêm tại thung lũng", "target_chapter": 2},
                    {"order_index": 3, "title": "Tiêu diệt ác ma Roland", "description": "Trảm sát chúa tể Roland tại tháp cao", "target_chapter": 3},
                ],
            },
            headers=self.headers,
        )
        plan_id = res.json()["data"]["plan_id"]
        self.client.post(f"/v1/story-plans/{plan_id}/activate?novel_id={self.novel_id}", headers=self.headers)

        # 2. Get context preview for Chapter 1
        preview = self.writing_service.preview_context(
            tenant_id=self.tenant_id,
            story_id=self.novel_id,
            chapter_number=1,
        )

        # Planning context should be present
        self.assertIsNotNone(preview.planning_context)
        self.assertEqual(preview.planning_context["plan_id"], plan_id)
        self.assertEqual(preview.planning_context["plan_version"], 1)
        self.assertEqual(preview.planning_context["total_objectives"], 3)

        # Current objective for Chapter 1 must be Objective 1
        self.assertIsNotNone(preview.current_objective)
        self.assertEqual(preview.current_objective["order_index"], 1)
        self.assertEqual(preview.current_objective["title"], "Tìm di tích")

        # Context summary reflects planning provenance
        self.assertEqual(preview.context_summary["plan_id"], [plan_id])
        self.assertEqual(preview.context_summary["plan_version"], ["1"])
        self.assertEqual(preview.context_summary["active_objective_title"], ["Tìm di tích"])

        # 3. CRITICAL INVARIANT: FUTURE PLAN != HISTORICAL CANON
        recent_events_text = " ".join(str(ev) for ev in preview.recent_events)
        world_rules_text = " ".join(str(r) for r in preview.world_rules)
        entities_text = " ".join(str(e) for e in preview.entities)

        self.assertNotIn("Hắc ám kỵ sĩ", recent_events_text, "Future Chapter 2 objective leaked into recent_events!")
        self.assertNotIn("ác ma Roland", recent_events_text, "Future Chapter 3 objective leaked into recent_events!")
        self.assertNotIn("Hắc ám kỵ sĩ", world_rules_text, "Future objective leaked into world_rules!")
        self.assertNotIn("ác ma Roland", world_rules_text, "Future objective leaked into world_rules!")

        # 4. Advance Chapter 1 objective to completed, preview Chapter 2
        obj_1_id = preview.current_objective["objective_id"]
        self.client.patch(
            f"/v1/story-plans/{plan_id}/objectives/{obj_1_id}?novel_id={self.novel_id}",
            json={"status": "completed"},
            headers=self.headers,
        )

        preview_ch2 = self.writing_service.preview_context(
            tenant_id=self.tenant_id,
            story_id=self.novel_id,
            chapter_number=2,
        )
        self.assertEqual(preview_ch2.current_objective["order_index"], 2)
        self.assertEqual(preview_ch2.current_objective["title"], "Hắc ám kỵ sĩ")


if __name__ == "__main__":
    unittest.main()
