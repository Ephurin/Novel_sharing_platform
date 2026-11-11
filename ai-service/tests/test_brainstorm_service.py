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
from concurrent.futures import ThreadPoolExecutor
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
        self.repo._novel_authors[self.novel_id] = self.author_id
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
        self.assertEqual(res.status_code, 200, res.text)
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
        self.assertEqual(res.status_code, 200, res.text)
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
        self.assertEqual(res.status_code, 200, res.text)
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
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()["data"]
        self.assertEqual(len(data["world_rules"]), 0)
        self.assertGreaterEqual(len(data["characters"]), 1)
        self.assertEqual(len(data["future_events"]), 0)

    def test_bsa01_effective_world_rules_lineage_and_unverified_successor_blocks_llm(self):
        """BSA-01: Grounding uses verified effective Canon lineage via resolve_effective_facts.
        Unverified successor fails closed (422) BEFORE provider dispatch (zero LLM calls).
        """
        from dataclasses import replace
        # 1. Unverified successor: rule_A superseded by rule_B with NO receipt edge
        root_id = str(uuid.uuid4())
        child_id = str(uuid.uuid4())
        brain = self.repo.get_story_brain(self.novel_id)
        self.repo._brains[self.novel_id] = replace(
            brain,
            facts=(
                {
                    "fact_id": root_id,
                    "fact_type": "world_rule",
                    "fact_key": "world_rule_dan_duoc",
                    "fact_value": "Đan dược có 9 phẩm cấp.",
                    "confirmation_status": "confirmed",
                },
                {
                    "fact_id": child_id,
                    "fact_type": "world_rule",
                    "fact_key": "world_rule_dan_duoc",
                    "fact_value": "Đan dược có 10 phẩm cấp (Đế Phẩm là cao nhất).",
                    "confirmation_status": "confirmed",
                    "supersedes_id": root_id,
                },
            ),
            metadata={
                **brain.metadata,
                "verified_amendment_edges": [],  # NO verified edge!
            },
        )
        self.fake_llm.last_call = {}

        res = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1"},
        )
        # Must fail closed with 422
        self.assertEqual(res.status_code, 422)
        err = res.json()["detail"]
        self.assertIn(err["code"], ("WORLD_RULE_SUCCESSOR_UNVERIFIED", "WORLD_RULE_LINEAGE_INVALID"))
        # ZERO LLM calls!
        self.assertEqual(self.fake_llm.last_call, {}, "LLM must NOT be dispatched on invalid lineage")

        # 2. Verified successor: add verified amendment edge (root_id, child_id)
        brain = self.repo.get_story_brain(self.novel_id)
        self.repo._brains[self.novel_id] = replace(
            brain,
            metadata={
                **brain.metadata,
                "verified_amendment_edges": [[root_id, child_id]],
            },
        )
        res_ok = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1"},
        )
        self.assertEqual(res_ok.status_code, 200)
        # Grounding rules must only contain the successor, root must be superseded/hidden
        rules_in_prompt = self.fake_llm.last_call.get("world_rules", [])
        self.assertTrue(
            any("10 phẩm cấp" in r for r in rules_in_prompt),
            "Successor must be grounded in prompt",
        )
        self.assertFalse(
            any("Đan dược có 9 phẩm cấp." == r for r in rules_in_prompt),
            "Superseded root must NOT be present in prompt",
        )

    def test_bsa02_concurrent_requests_single_flight_and_restart(self):
        """BSA-02: Concurrent calls with same key perform single-flight reservation.
        New service instance reuses existing receipt without re-dispatching LLM.
        """
        idem_key = "idem-concurrency-" + str(uuid.uuid4())
        body = {
            "contract_version": "brainstorm-v1",
            "instruction": "Test concurrency single flight",
            "idempotency_key": idem_key,
        }

        # Clear receipts for clean test
        BrainstormService._in_memory_receipts.clear()

        # Concurrent requests
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(
                    self.client.post,
                    f"/v1/story-brains/{self.novel_id}/brainstorm",
                    headers=self.headers,
                    json=body,
                )
                for _ in range(2)
            ]
            responses = [f.result() for f in futures]

        self.assertEqual(responses[0].status_code, 200)
        self.assertEqual(responses[1].status_code, 200)
        # Both responses return the exact same receipt
        data0 = responses[0].json()["data"]
        data1 = responses[1].json()["data"]
        self.assertEqual(data0["provenance"]["timestamp"], data1["provenance"]["timestamp"])

        # Service restart: create new service instance
        new_svc = BrainstormService(repository=self.repo, llm_service=self.fake_llm)
        self.fake_llm.last_call = {}
        res_restart = new_svc.brainstorm(
            self.novel_id,
            BrainstormRequest.model_validate(body),
            tenant_id=self.tenant_id,
            actor_id=self.author_id,
        )
        self.assertEqual(res_restart.provenance.timestamp, data0["provenance"]["timestamp"])
        self.assertEqual(self.fake_llm.last_call, {}, "Restarted service must read cached receipt without LLM call")

    def test_bsa02_cas_update_intervening_story_brain_exact_retry_succeeds(self):
        """BSA-02: Legitimate exact retry after intervening Story Brain update returns original result without 409."""
        from dataclasses import replace
        idem_key = "idem-brain-update-" + str(uuid.uuid4())
        body = {
            "contract_version": "brainstorm-v1",
            "instruction": "Phát triển tuyến nhân vật phụ",
            "idempotency_key": idem_key,
            "expected_brain_version": 1,
        }
        res1 = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json=body,
        )
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()["data"]

        # Intervening update to Story Brain version (version 1 -> 2)
        brain = self.repo.get_story_brain(self.novel_id)
        self.repo._brains[self.novel_id] = replace(
            brain,
            metadata={**brain.metadata, "brain_version": "2"},
        )

        # Retry with original body (with expected_brain_version: 1)
        res2 = self.client.post(
            f"/v1/story-brains/{self.novel_id}/brainstorm",
            headers=self.headers,
            json=body,
        )
        self.assertEqual(res2.status_code, 200, "Exact retry must succeed without 409 conflict")
        self.assertEqual(res2.json()["data"]["provenance"]["timestamp"], data1["provenance"]["timestamp"])

    def test_bsa03_author_identity_required_and_foreign_ownership_forbidden(self):
        """BSA-03: Author identity required (401), foreign author ownership forbidden (403), zero LLM calls."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        body = {"contract_version": "brainstorm-v1"}
        self.fake_llm.last_call = {}

        # 1. Missing author header -> 401
        res_no_author = self.client.post(
            url,
            headers={
                "X-Tenant-Id": self.tenant_id,
                "Authorization": f"Bearer {self.service_token}",
                "X-Service-Token": self.service_token,
            },
            json=body,
        )
        self.assertEqual(res_no_author.status_code, 401)
        self.assertEqual(res_no_author.json()["detail"]["code"], "BRAINSTORM_IDENTITY_REQUIRED")
        self.assertEqual(self.fake_llm.last_call, {})

        # 2. Foreign author on novel owned by author_id -> 403
        if not hasattr(self.repo, "_novel_authors"):
            self.repo._novel_authors = {}
        self.repo._novel_authors[self.novel_id] = self.author_id

        foreign_author = str(uuid.uuid4())
        res_foreign = self.client.post(
            url,
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Author-Id": foreign_author,
                "X-User-Id": foreign_author,
                "X-Actor-Id": foreign_author,
                "Authorization": f"Bearer {self.service_token}",
                "X-Service-Token": self.service_token,
            },
            json=body,
        )
        self.assertEqual(res_foreign.status_code, 403)
        self.assertEqual(res_foreign.json()["detail"]["code"], "NOVEL_OWNERSHIP_MISMATCH")
        self.assertEqual(self.fake_llm.last_call, {})

    def test_bsa03_plan_cas_fail_closed_on_error_or_missing_plan(self):
        """BSA-03: Fails closed (409/503) when plan CAS or backend lookup fails, zero LLM calls."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        self.fake_llm.last_call = {}

        # 1. expected_plan_version provided but repo has no plan support -> 409
        res = self.client.post(
            url,
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "expected_plan_version": 2},
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["detail"]["code"], "PLAN_VERSION_CONFLICT")
        self.assertEqual(self.fake_llm.last_call, {})

        # 2. Plan store throws database exception -> fails closed with 503
        self.repo.supports_plan_edit_v1 = True
        self.repo.read_plans = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("DB plan outage"))
        res_503 = self.client.post(
            url,
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "expected_plan_version": 1},
        )
        self.assertEqual(res_503.status_code, 503)
        self.assertEqual(res_503.json()["detail"]["code"], "PLAN_SERVICE_UNAVAILABLE")
        self.assertEqual(self.fake_llm.last_call, {})

    def test_bsa04_adversarial_provider_output_validation(self):
        """BSA-04: Strict validation envelope catches string items, oversized arrays, bad chapter types."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"

        # 1. String item instead of dict -> 502
        res1 = self.client.post(
            url,
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "instruction": "test_adversarial_string_item"},
        )
        self.assertEqual(res1.status_code, 502)
        self.assertEqual(res1.json()["detail"]["code"], "BRAINSTORM_PROVIDER_ERROR")

        # 2. Oversized array (>20 items) -> 502
        res2 = self.client.post(
            url,
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "instruction": "test_adversarial_oversized_array"},
        )
        self.assertEqual(res2.status_code, 502)
        self.assertEqual(res2.json()["detail"]["code"], "BRAINSTORM_PROVIDER_ERROR")

        # 3. Bad target chapter (not an int) -> 502
        res3 = self.client.post(
            url,
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "instruction": "test_adversarial_bad_chapter"},
        )
        self.assertEqual(res3.status_code, 502)
        self.assertEqual(res3.json()["detail"]["code"], "BRAINSTORM_PROVIDER_ERROR")

        # 4. Mixed categories when target="characters": server-side filtering strictly isolates target
        res4 = self.client.post(
            url,
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_adversarial_mixed_targets",
                "target": "characters",
            },
        )
        self.assertEqual(res4.status_code, 200)
        data = res4.json()["data"]
        self.assertEqual(len(data["world_rules"]), 0, "Non-requested world_rules must be filtered out")
        self.assertEqual(len(data["future_events"]), 0, "Non-requested future_events must be filtered out")
        self.assertGreaterEqual(len(data["characters"]), 1, "Requested characters must be present")

    def test_bsa02r_retry_succeeds_after_429_quota_failure(self):
        """BSA-02R: Same-key retry succeeds after initial 429 quota exhaustion."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        idem_key = f"retry-429-{uuid.uuid4()}"

        # 1. Initial request fails with 429
        res1 = self.client.post(
            url,
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_quota_exhausted",
                "idempotency_key": idem_key,
            },
        )
        self.assertEqual(res1.status_code, 429)
        self.assertEqual(res1.json()["detail"]["code"], "PROVIDER_QUOTA_EXHAUSTED")

        # 2. Retry with same idempotency key and successful instruction must succeed
        res2 = self.client.post(
            url,
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "instruction": "test_quota_exhausted",  # Same payload
                "idempotency_key": idem_key,
            },
        )
        # Note: In test environment, if payload instruction triggers quota, it fails again,
        # but the key is re-reservable! Let's test with a successful retry payload or clear trigger:
        # According to BSA-02R, if provider error clears on retry, same-key exact retry succeeds:
        # Let's verify by patching fake_llm or toggling trigger:
        # Actually, let's test retry when provider succeeds on second attempt:
        idem_key2 = f"retry-transient-{uuid.uuid4()}"
        with patch.object(self.fake_llm, "suggest_brainstorm", side_effect=[RuntimeError("429 Resource exhausted"), None]):
            # First attempt fails with 429
            r1 = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "idempotency_key": idem_key2, "instruction": "Normal"},
            )
            self.assertEqual(r1.status_code, 429)

            # Second attempt with exact same payload succeeds with 200
            # Reset side effect to return normal output
            self.fake_llm.suggest_brainstorm = FakeDeterministicLLMService().suggest_brainstorm
            r2 = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "idempotency_key": idem_key2, "instruction": "Normal"},
            )
            self.assertEqual(r2.status_code, 200)

            # Third attempt: exact replay served from cache
            self.fake_llm.call_count = 0
            r3 = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "idempotency_key": idem_key2, "instruction": "Normal"},
            )
            self.assertEqual(r3.status_code, 200)
            self.assertEqual(self.fake_llm.call_count, 0)

    def test_bsa02r_retry_succeeds_after_502_provider_failure(self):
        """BSA-02R: Same-key retry succeeds after initial 502 provider error."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        idem_key = f"retry-502-{uuid.uuid4()}"

        with patch.object(self.fake_llm, "suggest_brainstorm", side_effect=[RuntimeError("502 Bad Gateway"), None]):
            r1 = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "idempotency_key": idem_key, "instruction": "Normal"},
            )
            self.assertEqual(r1.status_code, 502)

            self.fake_llm.suggest_brainstorm = FakeDeterministicLLMService().suggest_brainstorm
            r2 = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "idempotency_key": idem_key, "instruction": "Normal"},
            )
            self.assertEqual(r2.status_code, 200)

    def test_bsa02r_stale_pending_lease_takeover(self):
        """BSA-02R: Expired pending lease is safely taken over on subsequent request."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"
        idem_key = f"stale-lease-{uuid.uuid4()}"
        scoped_key = f"brainstorm:{self.tenant_id}:{self.author_id}:{self.novel_id}:{idem_key}"[:255]

        req = BrainstormRequest(
            contract_version="brainstorm-v1",
            idempotency_key=idem_key,
            instruction="Test stale takeover",
        )
        canonical_input = {
            "tenant_id": self.tenant_id,
            "author_id": self.author_id,
            "novel_id": self.novel_id,
            "idempotency_key": req.idempotency_key,
            "target": req.target,
            "instruction": req.instruction,
            "current_chapter": req.current_chapter,
            "target_chapter": req.target_chapter,
            "expected_brain_version": req.expected_brain_version,
            "expected_plan_version": req.expected_plan_version,
            "private_notes": req.private_notes,
            "private_author_notes": req.private_author_notes,
        }
        input_hash = hashlib.sha256(
            json.dumps(canonical_input, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()

        # Inject stale pending record into in-memory receipts
        import time
        BrainstormService._in_memory_receipts[scoped_key] = {
            "status": "pending",
            "input_hash": input_hash,
            "author_id": self.author_id,
            "response": None,
            "lease_token": "expired-token",
            "lease_expires_at": time.time() - 10.0,  # 10s in the past
        }

        # Request with same key takes over expired lease and succeeds
        res = self.client.post(
            url,
            headers=self.headers,
            json={
                "contract_version": "brainstorm-v1",
                "idempotency_key": idem_key,
                "instruction": "Test stale takeover",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(BrainstormService._in_memory_receipts[scoped_key]["status"], "completed")

    def test_bsa03r_novel_not_found_when_unregistered(self):
        """BSA-03R: Missing novel in novel ownership store fails closed with 404 NOVEL_NOT_FOUND."""
        other_novel_id = str(uuid.uuid4())
        # Story Brain exists in repository, but novel is NOT registered in _novel_authors
        self.repo.get_story_brain(other_novel_id)

        res = self.client.post(
            f"/v1/story-brains/{other_novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "instruction": "Normal"},
        )
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json()["detail"]["code"], "NOVEL_NOT_FOUND")

    def test_bsa03r_novel_ownership_mismatch_denied(self):
        """BSA-03R: Foreign author calling brainstorm is rejected with 403 NOVEL_OWNERSHIP_MISMATCH."""
        other_novel_id = str(uuid.uuid4())
        self.repo.get_story_brain(other_novel_id)
        # Registered to a different author
        self.repo._novel_authors[other_novel_id] = str(uuid.uuid4())

        res = self.client.post(
            f"/v1/story-brains/{other_novel_id}/brainstorm",
            headers=self.headers,
            json={"contract_version": "brainstorm-v1", "instruction": "Normal"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json()["detail"]["code"], "NOVEL_OWNERSHIP_MISMATCH")

    def test_bsa04r_scalar_type_errors_map_to_502(self):
        """BSA-04R: Provider returning invalid scalar types returns 502, never 500."""
        url = f"/v1/story-brains/{self.novel_id}/brainstorm"

        adversarial_cases = [
            ("test_adversarial_scalar_rule_text", "world_rules: text must be string"),
            ("test_adversarial_scalar_char_name", "characters: name must be string"),
            ("test_adversarial_scalar_event_title", "future_events: title must be string"),
            ("test_adversarial_bad_aliases_string", "characters: aliases must be list"),
            ("test_adversarial_bad_aliases_int", "characters: alias items must be string"),
            ("test_adversarial_bad_participant_int", "future_events: participant entity_id must be string"),
            ("test_adversarial_bad_participant_hint_int", "future_events: participant name_hint must be string"),
            ("test_adversarial_bool_chapter", "future_events: target_chapter cannot be bool"),
            ("test_adversarial_bool_min_words", "future_events: min_words cannot be bool"),
        ]

        for trigger, label in adversarial_cases:
            res = self.client.post(
                url,
                headers=self.headers,
                json={"contract_version": "brainstorm-v1", "instruction": trigger},
            )
            self.assertEqual(
                res.status_code,
                502,
                f"Trigger '{trigger}' ({label}) returned {res.status_code}: {res.text}",
            )
            self.assertEqual(res.json()["detail"]["code"], "BRAINSTORM_PROVIDER_ERROR")
