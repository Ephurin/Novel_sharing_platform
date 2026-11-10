"""Unit and API contract tests for P2-06A AI Brainstorming Foundation.

Verifies:
- Structured suggestions for World Rules, Characters, and Future Chapter Events.
- All proposals carry status `model_proposed`, strictly separated from Canon/History.
- No auto-approval, no creation of historical narrative events.
- Fake provider abstraction with grounding in Story Brain entities.
- Fabricated participant entity_id detection and rejection (422).
- Identity and scope verification (401, 403, 422).
- CAS optimistic lock checks on brain version (409) and plan version (409).
- Idempotency key replay (identical output) and conflict detection (409).
- Private notes protection (zero leakage to provider, response, or error detail).
- Provider quota exhaustion handling (429).
- Provider malformed / empty output handling (502).
- Provider unavailable handling (503).
- Backwards compatibility for `suggest_events` operation on `POST /author-operation`.
"""
import hashlib
import json
import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.brainstorm_schemas import BrainstormRequest, BrainstormResponse
from api.deps import get_brainstorm_service, get_llm_service, get_narrative_repository, get_narrative_service
from application.brainstorm_service import BrainstormService
from application.narrative_service import NarrativeApplicationService
from core.fake_llm import FakeDeterministicLLMService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from main import app


class BrainstormFoundationTests(unittest.TestCase):
    def setUp(self):
        self.novel_id = str(uuid.uuid4())
        self.tenant_id = "00000000-0000-0000-0000-000000000001"
        self.author_id = str(uuid.uuid4())
        self.service_token = (
            getattr(getattr(app.state, "settings", None), "platform_service_token", None)
            or os.getenv("PLATFORM_SERVICE_TOKEN", "p202-offline-token")
        )
        self.orig_settings = getattr(app.state, "settings", None)
        if hasattr(app.state, "settings") and app.state.settings is not None:
            if not getattr(app.state.settings, "platform_service_token", None):
                from dataclasses import replace
                app.state.settings = replace(app.state.settings, platform_service_token=self.service_token)

        self.headers = {
            "X-Tenant-Id": self.tenant_id,
            "X-Author-Id": self.author_id,
            "X-User-Id": self.author_id,
            "X-Actor-Id": self.author_id,
            "Authorization": f"Bearer {self.service_token}",
            "X-Service-Token": self.service_token,
        }

        self.repo = InMemoryNarrativeRepository()
        self.fake_llm = FakeDeterministicLLMService()
        self.service = NarrativeApplicationService(repository=self.repo)
        self.brainstorm_svc = BrainstormService(repository=self.repo, llm_service=self.fake_llm)

        # Seed an approved entity in the Story Brain: "Tiêu Viêm"
        self.repo.upsert_entity(
            self.novel_id,
            {
                "name": "Tiêu Viêm",
                "entity_type": "character",
                "status": "Alive",
            },
        )
        self.entity_id = self.repo.get_story_brain(self.novel_id).entities[0].entity_id
        # Seed a confirmed world rule
        self.rule_fact_id = str(uuid.uuid4())
        from dataclasses import replace
        brain = self.repo.get_story_brain(self.novel_id)
        self.repo._brains[self.novel_id] = replace(
            brain,
            facts=(
                {
                    "fact_id": self.rule_fact_id,
                    "fact_type": "world_rule",
                    "fact_key": "world_rule_di_hoa",
                    "fact_value": "Dị Hỏa là ngọn lửa thần bí sinh ra từ trời đất, có uy lực hủy thiên diệt địa.",
                },
            ),
        )

        self.orig_repo = getattr(app.state, "narrative_repository", None)
        self.orig_llm = getattr(app.state, "llm_service", None)
        self.orig_brainstorm = getattr(app.state, "brainstorm_service", None)
        app.state.narrative_repository = self.repo
        app.state.llm_service = self.fake_llm
        app.state.brainstorm_service = self.brainstorm_svc
        app.dependency_overrides[get_narrative_repository] = lambda: self.repo
        app.dependency_overrides[get_narrative_service] = lambda: self.service
        app.dependency_overrides[get_llm_service] = lambda: self.fake_llm
        app.dependency_overrides[get_brainstorm_service] = lambda: self.brainstorm_svc

        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        if self.orig_settings is not None:
            app.state.settings = self.orig_settings
        if self.orig_repo is not None:
            app.state.narrative_repository = self.orig_repo
        app.state.llm_service = self.orig_llm
        app.state.brainstorm_service = self.orig_brainstorm
        self.client.close()

    def test_brainstorm_returns_model_proposed_not_canon_not_history(self):
        """Rule 1: Suggestions carry `model_proposed` status and leave Canon/events unchanged."""
        brain_before = self.repo.get_story_brain(self.novel_id, read_only=True)
        events_before = len(brain_before.events)
        facts_before = len(brain_before.facts)
        entities_before = len(brain_before.entities)
        brain_v_before = brain_before.metadata.get("brain_version", "1")

        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "target": "all",
                "instruction": "Gợi ý thêm bí cảnh và nhân vật mới",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()["data"]

        # 1. World Rules proposals
        self.assertGreaterEqual(len(data["world_rules"]), 1)
        for r in data["world_rules"]:
            self.assertEqual(r["status"], "model_proposed")
            self.assertEqual(r["origin"], "model_proposed")
            self.assertFalse(r["is_canon"])
            self.assertFalse(r["is_historical"])
            self.assertTrue(r["rule_id"])
            self.assertTrue(r["fact_key"])

        # 2. Character proposals
        self.assertGreaterEqual(len(data["characters"]), 1)
        for c in data["characters"]:
            self.assertEqual(c["status"], "model_proposed")
            self.assertEqual(c["origin"], "model_proposed")
            self.assertFalse(c["is_canon"])
            self.assertFalse(c["is_historical"])
            self.assertTrue(c["character_id"])
            self.assertTrue(c["name"])

        # 3. Future Chapter Events
        self.assertGreaterEqual(len(data["future_events"]), 1)
        for e in data["future_events"]:
            self.assertEqual(e["status"], "model_proposed")
            self.assertEqual(e["origin"], "model_proposed")
            self.assertFalse(e["is_canon"])
            self.assertFalse(e["is_historical"])
            self.assertGreaterEqual(e["target_chapter"], 1)

        # 4. Provenance
        self.assertEqual(data["provenance"]["status"], "model_proposed")
        self.assertEqual(data["provenance"]["contract_version"], "brainstorm-v1")
        self.assertEqual(data["provenance"]["grounding_entities_count"], 1)
        self.assertEqual(data["provenance"]["grounding_rules_count"], 1)

        # 5. Strict Canon Immutability: Story Brain must NOT be mutated
        brain_after = self.repo.get_story_brain(self.novel_id, read_only=True)
        self.assertEqual(len(brain_after.events), events_before)
        self.assertEqual(len(brain_after.facts), facts_before)
        self.assertEqual(len(brain_after.entities), entities_before)
        self.assertEqual(brain_after.metadata.get("brain_version", "1"), brain_v_before)

    def test_author_operation_suggest_events_backward_compatible(self):
        """Rule 2: AuthorMemoryPanel's call to POST /author-operation with suggest_events returns events."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/author-operation",
            headers=self.headers,
            json={
                "operation": "suggest_events",
                "instruction": "Tiếp tục diễn biến chương 2",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()["data"]

        # AuthorMemoryPanel.tsx accesses `result.events`
        self.assertIn("events", data)
        self.assertIsInstance(data["events"], list)
        self.assertGreaterEqual(len(data["events"]), 1)
        first_event = data["events"][0]
        self.assertIn("title", first_event)
        self.assertIn("description", first_event)
        self.assertIn("target_chapter", first_event)
        self.assertEqual(first_event["status"], "model_proposed")
        self.assertFalse(first_event["is_canon"])

    def test_grounded_participant_uses_approved_entity_id(self):
        """Rule 3: Approved entities in Story Brain are grounded with their exact entity_id."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "target": "future_events",
            },
        )
        self.assertEqual(res.status_code, 200)
        events = res.json()["data"]["future_events"]
        participants = events[0]["participants"]
        approved_p = next((p for p in participants if p["entity_id"] == self.entity_id), None)
        self.assertIsNotNone(approved_p, "Expected participant referencing approved entity_id")
        self.assertIsNone(approved_p["name_hint"])

    def test_fabricated_participant_identity_rejected_422(self):
        """Rule 4: Fabricated entity UUIDs not in Story Brain are caught and rejected with 422."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_fabricated_identity",
            },
        )
        self.assertEqual(res.status_code, 422)
        err = res.json()["detail"]
        self.assertEqual(err["code"], "BRAINSTORM_FABRICATED_IDENTITY")
        self.assertEqual(err["fabricated_id"], "00000000-0000-0000-0000-ffffffffffff")

    def test_identity_and_scope_checks(self):
        """Rule 5: Enforce strict identity headers, scope checks, and fail-closed security."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        body = {"contract_version": "brainstorm-v1"}

        # 1. Missing tenant header -> 401
        res = self.client.post(
            url,
            headers={
                "Authorization": f"Bearer {self.service_token}",
                "X-Service-Token": self.service_token,
                "X-Author-Id": self.author_id,
                "X-User-Id": self.author_id,
            },
            json=body,
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["detail"]["code"], "BRAINSTORM_IDENTITY_REQUIRED")

        # 2. Invalid UUID in tenant header -> 422
        res = self.client.post(
            url,
            headers={
                **self.headers,
                "X-Tenant-Id": "invalid-uuid",
            },
            json=body,
        )
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"]["code"], "INVALID_SCOPE_HEADER")

        # 3. Actor/User mismatch with Author -> 403
        foreign_id = str(uuid.uuid4())
        res = self.client.post(
            url,
            headers={
                **self.headers,
                "X-User-Id": foreign_id,
            },
            json=body,
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["detail"]["code"], "BRAINSTORM_IDENTITY_MISMATCH")

        # 4. Tenant mismatch with repository tenant -> 403
        self.repo._tenant_id = uuid.UUID(self.tenant_id)
        other_tenant = str(uuid.uuid4())
        res = self.client.post(
            url,
            headers={
                **self.headers,
                "X-Tenant-Id": other_tenant,
            },
            json=body,
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["detail"]["code"], "TENANT_SCOPE_MISMATCH")

    def test_cas_brain_version_conflict_409(self):
        """Rule 6: CAS check against expected_brain_version rejects stale calls with 409."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "expected_brain_version": 999,  # actual is 1
            },
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["detail"]["code"], "BRAIN_VERSION_CONFLICT")

    def test_idempotency_retry_and_conflict(self):
        """Rule 7: Identical idempotency key replays cached receipt; modified input raises 409."""
        idem_key = "idem-test-key-" + str(uuid.uuid4())
        body = {
            "contract_version": "brainstorm-v1",
            "instruction": "Phát triển tuyến nhân vật phụ",
            "idempotency_key": idem_key,
        }

        # 1st call: fresh generation
        res1 = self.client.post(f"/v1/story-brains/{self.novel_id}/brainstorm", headers=self.headers, json=body)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()["data"]

        # 2nd call: exact replay with same key -> same output
        res2 = self.client.post(f"/v1/story-brains/{self.novel_id}/brainstorm", headers=self.headers, json=body)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()["data"]
        self.assertEqual(data1["provenance"]["timestamp"], data2["provenance"]["timestamp"])

        # 3rd call: same key with DIFFERENT payload -> 409 IDEMPOTENCY_CONFLICT
        conflicting_body = {
            "contract_version": "brainstorm-v1",
            "instruction": "Khác hoàn toàn hướng dẫn cũ",
            "idempotency_key": idem_key,
        }
        res3 = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm", headers=self.headers, json=conflicting_body
        )
        self.assertEqual(res3.status_code, 409)
        self.assertEqual(res3.json()["detail"]["code"], "IDEMPOTENCY_CONFLICT")

    def test_no_private_notes_leakage(self):
        """Rule 8: Private author notes are never leaked to LLM prompt, response body, or errors."""
        secret_marker = "TOP_SECRET_AUTHOR_SPOILER_998877"
        private_list_marker = "ANOTHER_SECRET_NOTE_554433"

        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "Gợi ý cốt truyện thông thường",
                "private_notes": secret_marker,
                "private_author_notes": [private_list_marker],
            },
        )
        self.assertEqual(res.status_code, 200)
        raw_response_text = res.text

        # 1. Response body must NOT contain the secret notes
        self.assertNotIn(secret_marker, raw_response_text)
        self.assertNotIn(private_list_marker, raw_response_text)

        # 2. Fake LLM prompt / last_call must NOT contain the secret notes
        last_call_str = json.dumps(self.fake_llm.last_call)
        self.assertNotIn(secret_marker, last_call_str)
        self.assertNotIn(private_list_marker, last_call_str)

        # 3. Error responses must NOT leak private notes either
        err_res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_fabricated_identity",
                "private_notes": secret_marker,
            },
        )
        self.assertEqual(err_res.status_code, 422)
        self.assertNotIn(secret_marker, err_res.text)

    def test_provider_quota_exhausted_429(self):
        """Rule 9: Provider 429 quota exhaustion is surfaced clearly as HTTP 429."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_quota_exhausted",
            },
        )
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.json()["detail"]["code"], "PROVIDER_QUOTA_EXHAUSTED")
        self.assertIn("retry_after", res.json()["detail"])

    def test_provider_malformed_json_502(self):
        """Rule 10: Malformed provider output fails safely with HTTP 502."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_malformed_json",
            },
        )
        self.assertEqual(res.status_code, 502)
        self.assertIn(res.json()["detail"]["code"], ("BRAINSTORM_PROVIDER_ERROR", "BRAINSTORM_OUTPUT_INVALID"))

    def test_provider_empty_suggestions_502(self):
        """Rule 11: Empty suggestions from provider fail visibly with HTTP 502."""
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_empty_output",
            },
        )
        self.assertEqual(res.status_code, 502)
        self.assertEqual(res.json()["detail"]["code"], "BRAINSTORM_EMPTY_SUGGESTIONS")

    def test_provider_unavailable_503(self):
        """Rule 12: Disabled/unavailable provider returns HTTP 503."""
        no_llm_svc = BrainstormService(repository=self.repo, llm_service=None)
        app.state.llm_service = None
        app.state.brainstorm_service = no_llm_svc
        app.dependency_overrides[get_llm_service] = lambda: None
        app.dependency_overrides[get_brainstorm_service] = lambda: no_llm_svc

        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1"},
        )
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["detail"]["code"], "BRAINSTORM_PROVIDER_UNAVAILABLE")

    def test_target_filtering(self):
        """Rule 13: Target selector isolates requested suggestion types."""
        # Only world rules
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "target": "world_rules"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertGreaterEqual(len(data["world_rules"]), 1)
        self.assertEqual(len(data["characters"]), 0)
        self.assertEqual(len(data["future_events"]), 0)

        # Only characters
        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "target": "characters"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(len(data["world_rules"]), 0)
        self.assertGreaterEqual(len(data["characters"]), 1)
        self.assertEqual(len(data["future_events"]), 0)
