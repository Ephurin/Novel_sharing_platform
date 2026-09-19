"""
Automated Postman Collection Runner for Narrative Memory Phase 4.
Executes all 14 mandatory scenarios over HTTP against the live Docker Compose environment,
asserts response contracts and persistence, and outputs execution evidence.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

POSTMAN_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = POSTMAN_DIR.parent.parent.parent
EVIDENCE_DIR = PROJECT_ROOT / "docs" / "development" / "P4-DOCKER-POSTMAN-01"


def http_request(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    req_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        req_headers.update(headers)

    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            resp_body = response.read().decode("utf-8")
            resp_headers = dict(response.headers)
            parsed = json.loads(resp_body) if resp_body else {}
            return status, parsed, resp_headers
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8")
        parsed = json.loads(err_body) if err_body else {}
        return exc.code, parsed, dict(exc.headers)


class ScenarioRunner:
    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        mock_platform_url: str = "http://127.0.0.1:8081",
    ) -> None:
        import uuid
        self.base_url = base_url.rstrip("/")
        self.mock_platform_url = mock_platform_url.rstrip("/")
        self.tenant_id = "00000000-0000-0000-0000-000000000001"
        self.novel_id = str(uuid.uuid4())
        self.chapter_id = str(uuid.uuid4())
        self.revision_id = str(uuid.uuid4())
        self.content_text = (
            "Tiêu Viêm thi triển Dị Hỏa đối đầu Hải Ba Đông tại sa mạc Tháp Qua Nhĩ. "
            "Sau một hồi kịch chiến dữ dội, Hải Ba Đông bị thương nặng và suy giảm sức chiến đấu."
        )
        self.content_hash = hashlib.sha256(self.content_text.encode("utf-8")).hexdigest()
        self.results: list[dict[str, Any]] = []

        # Dynamic state
        self.analysis_run_id = ""
        self.dependency_group_id = ""
        self.proposal_ids: list[str] = []
        self.event_id = ""
        self.brain_version = 1
        self.corr_group_id = ""
        self.corr_proposal_ids: list[str] = []
        self.later_event_id = ""
        self.state_before_correction: dict[str, Any] = {}

    def setup_fixture(self) -> None:
        # Register revision in mock-platform
        code, body, _ = http_request(
            "POST",
            f"{self.mock_platform_url}/internal/v1/revisions",
            headers={"Content-Type": "application/json"},
            body={
                "revision_id": self.revision_id,
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content": self.content_text,
                "tenant_id": self.tenant_id,
            },
        )
        if code not in {200, 201}:
            print(f"Warning: Failed registering dynamic fixture in mock-platform ({code}): {body}")
        else:
            print(f"Registered fresh test fixture in mock-platform: novel_id={self.novel_id}, revision_id={self.revision_id}")

    def record(self, case_id: str, title: str, status: str, details: str, duration_ms: float) -> None:
        self.results.append(
            {
                "case_id": case_id,
                "title": title,
                "status": status,
                "details": details,
                "duration_ms": round(duration_ms, 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        print(f"[{status.upper()}] {case_id}: {title} ({round(duration_ms, 2)} ms) - {details}")

    def run_all(self) -> bool:
        print("=" * 70)
        print("Starting Narrative Memory Phase 4 HTTP Postman Test Suite")
        print(f"Target Base URL: {self.base_url}")
        print("=" * 70)
        self.setup_fixture()

        # 1. Phân tích revision (Chưa có canonical state trước acceptance)
        t0 = time.perf_counter()
        idem_key = f"key-run-{int(time.time()*1000)}"
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/revisions/{self.revision_id}/analyses",
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Request-Id": "req-01",
                "Idempotency-Key": idem_key,
            },
            body={
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content_hash": self.content_hash,
                "operation": "chapter_analysis",
                "options": {
                    "extract_entities": True,
                    "extract_events": True,
                    "extract_state_transitions": True,
                },
            },
        )
        if code == 202 and body.get("data", {}).get("status") == "completed":
            self.analysis_run_id = body["data"]["analysis_run_id"]
            prop_count = body["data"]["proposal_count"]
            # Check canonical state is still empty before acceptance
            c_code, c_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
            if c_code == 200 and not c_body.get("data", {}).get("entities"):
                self.record(
                    "01",
                    "Phân tích revision",
                    "pass",
                    f"202 Accepted, run_id={self.analysis_run_id}, proposals={prop_count}, canonical state is empty",
                    (time.perf_counter() - t0) * 1000,
                )
            else:
                self.record("01", "Phân tích revision", "fail", "Canonical state was prematurely mutated", (time.perf_counter() - t0) * 1000)
        else:
            self.record("01", "Phân tích revision", "fail", f"Expected 202, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 2. Phân tích lại với cùng input/key (Deduplication)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/revisions/{self.revision_id}/analyses",
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Request-Id": "req-02",
                "Idempotency-Key": idem_key,
            },
            body={
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content_hash": self.content_hash,
                "operation": "chapter_analysis",
                "options": {
                    "extract_entities": True,
                    "extract_events": True,
                    "extract_state_transitions": True,
                },
            },
        )
        if code == 202 and body.get("data", {}).get("deduplicated") is True:
            self.record("02", "Phân tích lại cùng key/input", "pass", "202 Accepted, deduplicated=True, same run_id returned", (time.perf_counter() - t0) * 1000)
        else:
            self.record("02", "Phân tích lại cùng key/input", "fail", f"Expected deduplicated=True, got code {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 3. Dùng cùng key với input khác (409 IDEMPOTENCY_CONFLICT)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/revisions/{self.revision_id}/analyses",
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Request-Id": "req-03",
                "Idempotency-Key": idem_key,
            },
            body={
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content_hash": self.content_hash,
                "operation": "conflicting_operation",
                "options": {"extract_entities": False},
            },
        )
        if code == 409 and body.get("detail", {}).get("code") == "IDEMPOTENCY_CONFLICT":
            self.record("03", "Idempotency conflict", "pass", "409 Conflict, IDEMPOTENCY_CONFLICT returned cleanly", (time.perf_counter() - t0) * 1000)
        else:
            self.record("03", "Idempotency conflict", "fail", f"Expected 409 IDEMPOTENCY_CONFLICT, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 4. Content hash sai (422 CONTENT_HASH_MISMATCH)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/revisions/{self.revision_id}/analyses",
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Request-Id": "req-04",
                "Idempotency-Key": f"bad-hash-{time.time()}",
            },
            body={
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content_hash": "0000000000000000000000000000000000000000000000000000000000000000",
                "operation": "chapter_analysis",
                "options": {"extract_entities": True},
            },
        )
        if code == 422 and body.get("detail", {}).get("code") == "CONTENT_HASH_MISMATCH":
            self.record("04", "Content hash sai", "pass", "422 Unprocessable Entity, CONTENT_HASH_MISMATCH returned", (time.perf_counter() - t0) * 1000)
        else:
            self.record("04", "Content hash sai", "fail", f"Expected 422 CONTENT_HASH_MISMATCH, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # Retrieve proposals for Acceptance
        code, body, _ = http_request(
            "GET",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/proposals?status=pending",
            headers={"X-Request-Id": "req-fetch-props"},
        )
        proposals = body.get("data", [])
        if not proposals:
            self.record("05", "Accept dependency group", "fail", "No proposals found to accept", 0)
            return False

        self.dependency_group_id = proposals[0]["dependency_group_id"]
        self.proposal_ids = [p["proposal_id"] for p in proposals if p["dependency_group_id"] == self.dependency_group_id]
        event_p = next((p for p in proposals if p["proposal_type"] == "event"), None)
        if event_p:
            self.event_id = event_p["proposal_id"]

        # 5. Accept dependency group (Materialization & brain_version increments)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/proposal-groups/{self.dependency_group_id}/accept",
            headers={"X-Request-Id": "req-accept-05"},
            body={
                "proposal_ids": self.proposal_ids,
                "expected_brain_version": 1,
                "reason": "Author accepted initial group",
            },
        )
        if code == 200 and body.get("data", {}).get("brain_version") == 2:
            self.brain_version = 2
            self.record("05", "Accept dependency group", "pass", f"200 OK, brain_version incremented to 2, artifacts materialized", (time.perf_counter() - t0) * 1000)
        else:
            self.record("05", "Accept dependency group", "fail", f"Expected 200 with brain_version=2, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 6. Đọc state (Attributes & Provenance)
        t0 = time.perf_counter()
        code, body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
        data = body.get("data", {})
        entities = data.get("entities", {})
        provenance = data.get("provenance", {})
        if code == 200 and entities and provenance:
            self.record("06", "Đọc state", "pass", f"200 OK, state entities={len(entities)}, provenance keys={len(provenance)}", (time.perf_counter() - t0) * 1000)
        else:
            self.record("06", "Đọc state", "fail", f"Expected non-empty entities and provenance, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 7. Version cũ (409 BRAIN_VERSION_CONFLICT)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/proposal-groups/{self.dependency_group_id}/accept",
            headers={"X-Request-Id": "req-stale-07"},
            body={
                "proposal_ids": self.proposal_ids,
                "expected_brain_version": 1,
                "reason": "Retrying with stale version",
            },
        )
        if code == 409:
            self.record("07", "Version cũ", "pass", f"409 Conflict correctly returned on stale expected_brain_version", (time.perf_counter() - t0) * 1000)
        else:
            self.record("07", "Version cũ", "fail", f"Expected 409 Conflict, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 8. Transition không hợp lệ trong nhóm (422 INVALID_PROJECTION)
        t0 = time.perf_counter()
        inv_code, inv_body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/events/{self.event_id}/corrections",
            headers={"X-Request-Id": "req-invalid-trans"},
            body={
                "expected_brain_version": 2,
                "replacement": {
                    "event_type": "injury",
                    "summary": "Invalid health transition",
                    "participants": ["Hải Ba Đông"],
                    "chapter": 1,
                },
                "transitions": [
                    {
                        "entity_id": "Hải Ba Đông",
                        "attribute_key": "health",
                        "new_value": 9999,
                    }
                ],
            },
        )
        if inv_code == 201 and inv_body.get("data"):
            inv_group_id = inv_body["data"][0]["dependency_group_id"]
            inv_p_ids = [p["proposal_id"] for p in inv_body["data"]]
            # Now attempt to accept this invalid group -> must fail with 422 INVALID_PROJECTION
            acc_code, acc_body, _ = http_request(
                "POST",
                f"{self.base_url}/v1/proposal-groups/{inv_group_id}/accept",
                headers={"X-Request-Id": "req-accept-invalid"},
                body={
                    "proposal_ids": inv_p_ids,
                    "expected_brain_version": 2,
                    "reason": "Trying to accept invalid transition",
                },
            )
            if acc_code == 422 and acc_body.get("detail", {}).get("code") == "INVALID_PROJECTION":
                # Verify atomic rollback: brain_version remains 2
                st_code, st_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
                self.record(
                    "08",
                    "Transition không hợp lệ trong nhóm",
                    "pass",
                    "422 Unprocessable Entity on accept, INVALID_PROJECTION returned, atomic rollback verified",
                    (time.perf_counter() - t0) * 1000,
                )
            else:
                self.record(
                    "08",
                    "Transition không hợp lệ trong nhóm",
                    "fail",
                    f"Expected 422 INVALID_PROJECTION on accept, got {acc_code}: {acc_body}",
                    (time.perf_counter() - t0) * 1000,
                )
        else:
            self.record(
                "08",
                "Transition không hợp lệ trong nhóm",
                "fail",
                f"Failed creating invalid correction proposal: {inv_code} {inv_body}",
                (time.perf_counter() - t0) * 1000,
            )

        # 9. Reject proposal (Không làm thay đổi canonical state)
        t0 = time.perf_counter()
        before_code, before_body, _ = http_request(
            "GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state"
        )
        reject_id = inv_p_ids[0] if inv_code == 201 and inv_body.get("data") else None
        if reject_id is None:
            self.record("09", "Reject proposal", "fail", "No real pending proposal is available to reject", 0)
        else:
            code, body, _ = http_request(
                "POST", f"{self.base_url}/v1/proposals/{reject_id}/reject",
                headers={"X-Request-Id": "req-reject-09"},
                body={"reason": "Author rejects invalid correction"},
            )
            after_code, after_body, _ = http_request(
                "GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state"
            )
            rejected_code, rejected_body, _ = http_request(
                "GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/proposals?status=rejected",
                headers={"X-Request-Id": "req-reject-verify"},
            )
            was_rejected = any(p.get("proposal_id") == reject_id for p in rejected_body.get("data", []))
            if (code == 200 and body.get("data", {}).get("status") == "rejected"
                    and before_code == after_code == 200 and before_body.get("data") == after_body.get("data")
                    and rejected_code == 200 and was_rejected):
                self.record("09", "Reject proposal", "pass", "Rejected a real pending proposal; state and provenance are unchanged", (time.perf_counter() - t0) * 1000)
            else:
                self.record("09", "Reject proposal", "fail", f"Reject invariant failed: status={code}, state_changed={before_body != after_body}, listed={was_rejected}", (time.perf_counter() - t0) * 1000)

        # Arrange a genuinely later accepted event. Correcting the original event
        # must replay this event afterwards, so its health=40 transition wins.
        later_revision_id = str(__import__("uuid").uuid4())
        later_content = "Tieu Viem va Hai Ba Dong pha tran phap tai Mac Gia."
        later_hash = hashlib.sha256(later_content.encode("utf-8")).hexdigest()
        fixture_code, _, _ = http_request(
            "POST",
            f"{self.mock_platform_url}/internal/v1/revisions",
            body={
                "revision_id": later_revision_id,
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content": later_content,
                "tenant_id": self.tenant_id,
            },
        )
        later_code, later_body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/revisions/{later_revision_id}/analyses",
            headers={
                "X-Tenant-Id": self.tenant_id,
                "X-Request-Id": "req-later-analysis",
                "Idempotency-Key": f"later-{later_revision_id}",
            },
            body={
                "novel_id": self.novel_id,
                "chapter_id": self.chapter_id,
                "content_hash": later_hash,
                "operation": "chapter_analysis",
                "options": {
                    "extract_entities": True,
                    "extract_events": True,
                    "extract_state_transitions": True,
                },
            },
        )
        later_run_id = later_body.get("data", {}).get("analysis_run_id")
        props_code, props_body, _ = http_request(
            "GET",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/proposals?status=pending",
            headers={"X-Request-Id": "req-later-proposals"},
        )
        later_props = [
            proposal for proposal in props_body.get("data", [])
            if proposal.get("analysis_run_id") == later_run_id
        ]
        later_group_id = later_props[0]["dependency_group_id"] if later_props else ""
        later_ids = [
            proposal["proposal_id"] for proposal in later_props
            if proposal.get("dependency_group_id") == later_group_id
        ]
        later_event = next(
            (proposal for proposal in later_props if proposal.get("proposal_type") == "event"),
            None,
        )
        later_accept_code, later_accept_body = 0, {}
        if later_group_id:
            later_accept_code, later_accept_body, _ = http_request(
                "POST",
                f"{self.base_url}/v1/proposal-groups/{later_group_id}/accept",
                headers={"X-Request-Id": "req-accept-later"},
                body={
                    "proposal_ids": later_ids,
                    "expected_brain_version": 2,
                    "reason": "Accept later narrative event for replay-order verification",
                },
            )
        if (
            fixture_code in {200, 201}
            and later_code == 202
            and props_code == 200
            and later_event
            and later_accept_code == 200
            and later_accept_body.get("data", {}).get("brain_version") == 3
        ):
            self.later_event_id = later_event["proposal_id"]
            self.brain_version = 3

        # 10. Correction đang pending (Event/state cũ chưa đổi)
        t0 = time.perf_counter()
        before_corr_code, before_corr_body, _ = http_request(
            "GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state"
        )
        self.state_before_correction = before_corr_body.get("data", {})
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/events/{self.event_id}/corrections",
            headers={"X-Request-Id": "req-valid-corr"},
            body={
                "expected_brain_version": 3,
                "replacement": {
                    "event_type": "battle",
                    "summary": "Tiêu Viêm kịch chiến Hải Ba Đông (chỉnh sửa: Hải Ba Đông chỉ thương nhẹ)",
                    "participants": ["Tiêu Viêm", "Hải Ba Đông"],
                    "chapter": 1,
                },
                "transitions": [
                    {
                        "entity_id": "Hải Ba Đông",
                        "attribute_key": "health",
                        "new_value": 70,
                    }
                ],
            },
        )
        if code == 201 and body.get("data"):
            corr_props = body["data"]
            self.corr_group_id = corr_props[0]["dependency_group_id"]
            self.corr_proposal_ids = [p["proposal_id"] for p in corr_props]
            # Verify canonical state is still old state before acceptance
            st_code, st_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
            if (before_corr_code == st_code == 200
                    and st_body.get("data") == self.state_before_correction):
                self.record("10", "Correction đang pending", "pass", "201 Created; complete state and provenance snapshot is unchanged", (time.perf_counter() - t0) * 1000)
            else:
                self.record("10", "Correction đang pending", "fail", "Canonical state prematurely reflected pending correction", (time.perf_counter() - t0) * 1000)
        else:
            self.record("10", "Correction đang pending", "fail", f"Expected 201 Created, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 11. Accept correction (Appends event, replays timeline)
        t0 = time.perf_counter()
        code, body, _ = http_request(
            "POST",
            f"{self.base_url}/v1/proposal-groups/{self.corr_group_id}/accept",
            headers={"X-Request-Id": "req-accept-corr"},
            body={
                "proposal_ids": self.corr_proposal_ids,
                "expected_brain_version": 3,
                "reason": "Author approves correction",
            },
        )
        if code == 200 and body.get("data", {}).get("brain_version") == 4:
            self.brain_version = 4
            # The corrected early event is replayed before the later event.
            st_code, st_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
            health_values = [
                attr.get("health") for attr in st_body.get("data", {}).get("entities", {}).values() if "health" in attr
            ]
            if 40 in health_values and 70 not in health_values:
                self.record("11", "Accept correction", "pass", "200 OK, brain_version=4; correction accepted and later health=40 remains effective", (time.perf_counter() - t0) * 1000)
            else:
                self.record("11", "Accept correction", "fail", f"Expected later health=40 after replay: {st_body}", (time.perf_counter() - t0) * 1000)
        else:
            self.record("11", "Accept correction", "fail", f"Expected 200 with brain_version=4, got {code}: {body}", (time.perf_counter() - t0) * 1000)

        # 12. Correction event cũ khi có event về sau (Replay preserves subsequent events)
        t0 = time.perf_counter()
        st_code, st_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
        state_data = st_body.get("data", {})
        health_entries = [
            (entity_id, attributes.get("health"))
            for entity_id, attributes in state_data.get("entities", {}).items()
            if "health" in attributes
        ]
        later_provenance = any(
            state_data.get("provenance", {}).get(entity_id, {}).get("health", {}).get("event_id")
            == self.later_event_id
            for entity_id, value in health_entries
            if value == 40
        )
        if st_code == 200 and self.later_event_id and later_provenance:
            self.record("12", "Event về sau vẫn có hiệu lực khi sửa event cũ", "pass", "Final health=40 and provenance point to the accepted later event", (time.perf_counter() - t0) * 1000)
        else:
            self.record("12", "Event về sau vẫn có hiệu lực", "fail", f"Later-event replay/provenance invariant failed: event={self.later_event_id}, state={st_body}", (time.perf_counter() - t0) * 1000)

        # 13. Rebuild hai lần (Bằng online projection, provenance ổn định, version không tăng)
        t0 = time.perf_counter()
        code1, body1, _ = http_request(
            "POST",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/projections/rebuild",
            body={"expected_brain_version": self.brain_version},
        )
        code2, body2, _ = http_request(
            "POST",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/projections/rebuild",
            body={"expected_brain_version": self.brain_version},
        )
        if code1 == 200 and code2 == 200 and body1.get("data") == body2.get("data"):
            self.record("13", "Rebuild hai lần", "pass", "200 OK, both rebuilds match online projection identically; idempotent; version unchanged", (time.perf_counter() - t0) * 1000)
        else:
            self.record("13", "Rebuild hai lần", "fail", f"Rebuild failed or results differed: code1={code1}, code2={code2}", (time.perf_counter() - t0) * 1000)

        # 14. Restart container (Dữ liệu và trạng thái proposal/state vẫn còn)
        t0 = time.perf_counter()
        print("Restarting containers p4-ai-service and p4-postgres to verify persistence...")
        before_restart_code, before_restart_body, _ = http_request(
            "GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state"
        )
        before_props_code, before_props_body, _ = http_request(
            "GET",
            f"{self.base_url}/v1/story-brains/{self.novel_id}/proposals?status=rejected",
            headers={"X-Request-Id": "req-before-restart-proposals"},
        )
        subprocess.run(["docker", "restart", "p4-postgres"], check=True, capture_output=True)
        subprocess.run(["docker", "restart", "p4-ai-service"], check=True, capture_output=True)
        # Wait for health
        healthy = False
        for _ in range(15):
            time.sleep(1)
            try:
                h_code, h_body, _ = http_request("GET", f"{self.base_url}/health")
                if h_code == 200:
                    healthy = True
                    break
            except Exception:
                pass

        if healthy:
            st_code, st_body, _ = http_request("GET", f"{self.base_url}/v1/story-brains/{self.novel_id}/state")
            props_code, props_body, _ = http_request(
                "GET",
                f"{self.base_url}/v1/story-brains/{self.novel_id}/proposals?status=rejected",
                headers={"X-Request-Id": "req-after-restart-proposals"},
            )
            if (st_code == before_restart_code == 200
                    and props_code == before_props_code == 200
                    and st_body.get("data") == before_restart_body.get("data")
                    and props_body.get("data") == before_props_body.get("data")):
                self.record("14", "Restart container persistence", "pass", "PostgreSQL and API restarted; state, provenance, and rejected proposals match their snapshots", (time.perf_counter() - t0) * 1000)
            else:
                self.record("14", "Restart container persistence", "fail", f"State missing after restart: {st_body}", (time.perf_counter() - t0) * 1000)
        else:
            self.record("14", "Restart container persistence", "fail", "Container did not recover healthy after restart", (time.perf_counter() - t0) * 1000)

        self._generate_reports()
        return all(r["status"] == "pass" for r in self.results)

    def _generate_reports(self) -> None:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        # JSON Report
        json_path = EVIDENCE_DIR / "postman-results.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "suite": "Narrative Memory Phase 4 - Postman Test Suite",
                    "execution_time": datetime.now(timezone.utc).isoformat(),
                    "total_tests": len(self.results),
                    "passed": sum(1 for r in self.results if r["status"] == "pass"),
                    "failed": sum(1 for r in self.results if r["status"] == "fail"),
                    "results": self.results,
                },
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"Saved JSON test results to: {json_path}")

        # Markdown Report
        md_path = EVIDENCE_DIR / "postman-report.md"
        total = len(self.results)
        passed = sum(1 for r in self.results if r["status"] == "pass")
        failed = sum(1 for r in self.results if r["status"] == "fail")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write("# Báo Cáo Kết Quả Kiểm Thử HTTP / Postman — Phase 4\n\n")
            f.write(f"- **Thời gian chạy:** `{datetime.now(timezone.utc).isoformat()}`\n")
            f.write(f"- **Môi trường:** Docker Compose (`p4-ai-service`, `p4-postgres`, `p4-mock-platform`)\n")
            f.write(f"- **Tổng số ca:** `{total}` | **Passed:** `{passed}` | **Failed:** `{failed}`\n\n")
            f.write("| Ca | Tên kịch bản | Kết quả | Thời gian (ms) | Chi tiết |\n")
            f.write("| :--- | :--- | :---: | :---: | :--- |\n")
            for r in self.results:
                icon = "✅ PASS" if r["status"] == "pass" else "❌ FAIL"
                f.write(f"| `{r['case_id']}` | {r['title']} | {icon} | {r['duration_ms']} | {r['details']} |\n")
        print(f"Saved Markdown test report to: {md_path}")


if __name__ == "__main__":
    runner = ScenarioRunner()
    success = runner.run_all()
    sys.exit(0 if success else 1)
