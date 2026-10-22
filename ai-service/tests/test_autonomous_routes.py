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
from domain.models import StoryPlan, StoryPlanObjective
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from main import app


class AutonomousRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = "00000000-0000-0000-0000-000000000033"
        self.novel_id = "10000000-0000-0000-0000-000000000033"
        self.repository = InMemoryNarrativeRepository()
        self.writing_service = WritingService(self.repository, llm_service=None)

        app.dependency_overrides[get_narrative_repository] = lambda: self.repository
        app.dependency_overrides[get_writing_service] = lambda: self.writing_service
        app.dependency_overrides[require_service_token] = lambda: None

        self.client = TestClient(app)
        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Request-Id": "autonomous-request-001",
            "X-Author-Id": "author-user-001",
        }

        # Setup an active story plan
        self.plan = self.repository.create_story_plan(
            StoryPlan(
                plan_id=str(uuid.uuid4()),
                novel_id=self.novel_id,
                tenant_id=self.tenant_id,
                plan_version=1,
                status="active",
                objectives=(
                    StoryPlanObjective(
                        objective_id=str(uuid.uuid4()),
                        order_index=1,
                        title="Mục tiêu 1",
                        description="Khám phá di tích cổ",
                        target_chapter=1,
                        status="pending",
                    ),
                    StoryPlanObjective(
                        objective_id=str(uuid.uuid4()),
                        order_index=2,
                        title="Mục tiêu 2",
                        description="Thu thập bí kíp",
                        target_chapter=2,
                        status="pending",
                    ),
                ),
            )
        )

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_active_run_pins_plan_and_stopped_run_cannot_be_revived(self) -> None:
        created = self.client.post("/v1/autonomous/runs", json={"novel_id": self.novel_id}, headers=self.headers)
        self.assertEqual(created.status_code, 201)
        run_id = created.json()["data"]["run_id"]
        activate = self.client.post(f"/v1/story-plans/{self.plan.plan_id}/activate",
                                    params={"novel_id": self.novel_id}, headers=self.headers)
        self.assertEqual(activate.status_code, 409)
        stopped = self.client.post(f"/v1/autonomous/runs/{run_id}/stop", json={}, headers=self.headers)
        self.assertEqual(stopped.status_code, 200)
        revive = self.client.patch(f"/v1/autonomous/runs/{run_id}", json={"status": "completed"}, headers=self.headers)
        self.assertEqual(revive.status_code, 409)
        self.assertEqual(self.repository.get_autonomous_run(run_id).status, "stopped")

    def test_create_and_get_autonomous_run(self) -> None:
        create_res = self.client.post(
            "/v1/autonomous/runs",
            json={
                "novel_id": self.novel_id,
                "plan_id": self.plan.plan_id,
                "max_iterations": 5,
                "max_retries_per_objective": 2,
                "idempotency_key": "run-key-1",
            },
            headers=self.headers,
        )
        self.assertEqual(create_res.status_code, 201)
        data = create_res.json()["data"]
        run_id = data["run_id"]
        self.assertEqual(data["novel_id"], self.novel_id)
        self.assertEqual(data["plan_id"], self.plan.plan_id)
        self.assertEqual(data["plan_version"], 1)
        self.assertEqual(data["status"], "running")
        self.assertEqual(data["max_iterations"], 5)
        self.assertEqual(data["max_retries_per_objective"], 2)

        # GET by run_id
        get_res = self.client.get(f"/v1/autonomous/runs/{run_id}", headers=self.headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["data"]["run_id"], run_id)

        # GET active run by novel
        active_res = self.client.get(
            f"/v1/autonomous/by-novel/{self.novel_id}/active",
            headers=self.headers,
        )
        self.assertEqual(active_res.status_code, 200)
        self.assertEqual(active_res.json()["data"]["run_id"], run_id)

    def test_single_writer_conflict(self) -> None:
        # Create first run
        res1 = self.client.post(
            "/v1/autonomous/runs",
            json={"novel_id": self.novel_id},
            headers=self.headers,
        )
        self.assertEqual(res1.status_code, 201)

        # Attempt to create second active run for same novel
        res2 = self.client.post(
            "/v1/autonomous/runs",
            json={"novel_id": self.novel_id},
            headers=self.headers,
        )
        self.assertEqual(res2.status_code, 409)
        self.assertEqual(res2.json()["detail"]["code"], "ACTIVE_RUN_CONFLICT")

    def test_update_and_stop_run(self) -> None:
        res = self.client.post(
            "/v1/autonomous/runs",
            json={"novel_id": self.novel_id},
            headers=self.headers,
        )
        run_id = res.json()["data"]["run_id"]

        # PATCH update
        patch_res = self.client.patch(
            f"/v1/autonomous/runs/{run_id}",
            json={
                "current_iteration": 1,
                "current_retries": 1,
                "stop_reason": "testing_patch",
            },
            headers=self.headers,
        )
        self.assertEqual(patch_res.status_code, 200)
        updated = patch_res.json()["data"]
        self.assertEqual(updated["current_iteration"], 1)
        self.assertEqual(updated["current_retries"], 1)

        # POST stop
        stop_res = self.client.post(
            f"/v1/autonomous/runs/{run_id}/stop",
            json={"reason": "cancelled_by_user"},
            headers=self.headers,
        )
        self.assertEqual(stop_res.status_code, 200)
        stopped = stop_res.json()["data"]
        self.assertEqual(stopped["status"], "stopped")
        self.assertEqual(stopped["stop_reason"], "cancelled_by_user")

    def test_idempotency_same_key_same_payload_returns_existing(self) -> None:
        payload = {
            "novel_id": self.novel_id,
            "plan_id": self.plan.plan_id,
            "max_iterations": 5,
            "max_retries_per_objective": 2,
            "idempotency_key": "idemp-key-stable",
        }
        res1 = self.client.post("/v1/autonomous/runs", json=payload, headers=self.headers)
        self.assertEqual(res1.status_code, 201)
        run_id_1 = res1.json()["data"]["run_id"]

        # Same key + identical payload -> returns existing run
        res2 = self.client.post("/v1/autonomous/runs", json=payload, headers=self.headers)
        self.assertEqual(res2.status_code, 201)
        run_id_2 = res2.json()["data"]["run_id"]
        self.assertEqual(run_id_1, run_id_2)

    def test_idempotency_same_key_conflicting_payload_raises_409(self) -> None:
        payload1 = {
            "novel_id": self.novel_id,
            "plan_id": self.plan.plan_id,
            "max_iterations": 5,
            "max_retries_per_objective": 2,
            "idempotency_key": "idemp-key-conflict",
        }
        res1 = self.client.post("/v1/autonomous/runs", json=payload1, headers=self.headers)
        self.assertEqual(res1.status_code, 201)

        # Same key + different max_iterations -> 409 IDEMPOTENCY_CONFLICT
        payload2 = {
            "novel_id": self.novel_id,
            "plan_id": self.plan.plan_id,
            "max_iterations": 10,
            "max_retries_per_objective": 2,
            "idempotency_key": "idemp-key-conflict",
        }
        res2 = self.client.post("/v1/autonomous/runs", json=payload2, headers=self.headers)
        self.assertEqual(res2.status_code, 409)
        self.assertEqual(res2.json()["detail"]["code"], "IDEMPOTENCY_CONFLICT")

    def test_concurrent_active_run_attempts(self) -> None:
        import concurrent.futures

        novel_id = str(uuid.uuid4())
        # create active plan for this new novel
        plan = self.repository.create_story_plan(
            StoryPlan(
                plan_id=str(uuid.uuid4()),
                novel_id=novel_id,
                tenant_id=self.tenant_id,
                plan_version=1,
                status="active",
                objectives=(
                    StoryPlanObjective(
                        objective_id=str(uuid.uuid4()),
                        order_index=1,
                        title="Goal 1",
                        description="Desc 1",
                        status="pending",
                    ),
                ),
            )
        )

        def make_request(idx: int):
            return self.client.post(
                "/v1/autonomous/runs",
                json={"novel_id": novel_id, "plan_id": plan.plan_id, "idempotency_key": f"key-{idx}"},
                headers=self.headers,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(make_request, 1)
            f2 = executor.submit(make_request, 2)
            results = [f1.result(), f2.result()]

        statuses = [r.status_code for r in results]
        # Exactly one must succeed (201) and the other must be rejected (409)
        self.assertIn(201, statuses)
        self.assertIn(409, statuses)
        conflicts = [r for r in results if r.status_code == 409]
        self.assertEqual(conflicts[0].json()["detail"]["code"], "ACTIVE_RUN_CONFLICT")


    def test_resume_can_explicitly_clear_HITL_stop_reason(self):
        created = self.client.post('/v1/autonomous/runs', json={'novel_id': self.novel_id}, headers=self.headers)
        self.assertEqual(created.status_code, 201)
        path = '/v1/autonomous/runs/' + created.json()['data']['run_id']
        paused = self.client.patch(path, json={'stop_reason': 'waiting_for_entity_review'}, headers=self.headers)
        self.assertEqual(paused.json()['data']['stop_reason'], 'waiting_for_entity_review')
        unchanged = self.client.patch(path, json={'current_iteration': 1}, headers=self.headers)
        self.assertEqual(unchanged.json()['data']['stop_reason'], 'waiting_for_entity_review')
        resumed = self.client.patch(path, json={'stop_reason': None}, headers=self.headers)
        self.assertIsNone(resumed.json()['data']['stop_reason'])
        self.assertIsNone(self.client.get(path, headers=self.headers).json()['data']['stop_reason'])

    def test_objective_intent_epoch_survives_skip_pending_ABA(self):
        objective = self.plan.objectives[0]
        path = f'/v1/story-plans/{self.plan.plan_id}/objectives/{objective.objective_id}?novel_id={self.novel_id}'
        versions = []
        for status in ('in_progress', 'skipped', 'pending', 'in_progress'):
            response = self.client.patch(path, json={'status': status}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            versions.append(response.json()['data']['intent_version'])
        self.assertEqual(versions, [1, 2, 3, 4])
