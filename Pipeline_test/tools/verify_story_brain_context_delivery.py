"""Wave 1H: Independent Story Brain Context Delivery Verification.

Traces complete path:
Canonical memory -> context retrieval -> temporal filtering -> budget packing ->
serialized prompt -> gateway -> fake upstream HTTP request.

OFFLINE ONLY - Zero external provider calls.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, replace
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import tempfile
import time
from typing import Any
import uuid

ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path[:0] = [str(ROOT), str(AI_SERVICE_ROOT)]

from Pipeline_test.tools.budget_gateway import AuthoritativeBudgetLedger, start_budget_gateway
from Pipeline_test.tools.fake_provider_upstream import start_fake_upstream
from application.context_budget import ContextBudgetPacker, CONTEXT_PACKING_VERSION
from application.context_routing import ContextBudgetRouter, ContextRoutingUnresolvedError
from application.context_scope import BalancedRelevanceScopeBuilder
from application.writing_service import WritingService
from core.llm_service import LLMService
from domain.errors import OptimisticLockError
from domain.models import (
    NarrativeEntity,
    NarrativeEvent,
    NarrativeProposal,
    ProposalStatus,
    StoryBrain,
    WritingContextPackage,
    WritingGenerationJob,
)
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


class InMemoryRevisionProvider:
    def __init__(self, revisions: dict[tuple[str, str, str, str], Any]) -> None:
        self.revisions = revisions

    def get_revision(self, *, tenant_id: str, novel_id: str, chapter_id: str, revision_id: str):
        key = (tenant_id, novel_id, chapter_id, revision_id)
        if key not in self.revisions:
            class DummyRev:
                def __init__(self, rev_id: str):
                    self.revision_id = rev_id
                    self.content = "Mai Linh theo dõi tín hiệu máy thu CV-04 tại trạm Bốn."
                    self.content_hash = hashlib.sha256(self.content.encode("utf-8")).hexdigest()
            return DummyRev(revision_id)
        return self.revisions[key]


def setup_canonical_story_brain(
    repo: InMemoryNarrativeRepository,
    *,
    tenant_id: str,
    novel_id: str,
) -> dict[str, Any]:
    """Create approved canonical Story Brain baseline with known revisions and locked rules."""
    brain = repo.get_story_brain(novel_id)

    # 1. Approved Entities
    e_linh = NarrativeEntity(name="Mai Linh", entity_id="e-linh-01", entity_type="PER", status="Alive", location="Cồn Vân")
    e_lam = NarrativeEntity(name="Mai Lâm", entity_id="e-lam-02", entity_type="PER", status="Unknown", location="Unknown")
    e_duy = NarrativeEntity(name="Duy", entity_id="e-duy-03", entity_type="PER", status="Alive", location="Cồn Vân")
    e_cv04 = NarrativeEntity(name="CV-04", entity_id="e-cv04-04", entity_type="ITEM", status="Active", location="Cồn Vân")
    e_con_van = NarrativeEntity(name="Cồn Vân", entity_id="e-convan-05", entity_type="LOC", status="Active", location="Cồn Vân")
    # Entity introduced only in chapter 5 (temporal filter test)
    e_ch5_future = NarrativeEntity(name="Nhân vật mới Ch5", entity_id="e-future-06", entity_type="PER", status="Alive", location="Đồi Bắc")

    # 2. Locked & Regular World Rules / Facts
    rule_locked_barrier = {
        "id": "rule-locked-barrier-01",
        "fact_type": "world_rule",
        "fact_key": "barrier_teleportation_ban",
        "fact_value": "Không thể dịch chuyển tức thời khi đang ở trong kết giới phong tỏa",
        "is_locked": True,
        "chapter_number": 1,
    }
    rule_locked_frequency = {
        "id": "rule-locked-freq-02",
        "fact_type": "world_rule",
        "fact_key": "receiver_frequency_cutoff",
        "fact_value": "Trạm thu chỉ bắt được tần số sóng dưới 50Hz",
        "is_locked": True,
        "chapter_number": 1,
    }
    fact_voice_unverified = {
        "id": "fact-voice-ch2-03",
        "fact_type": "narrative_fact",
        "fact_key": "unverified_voice_attribution",
        "fact_value": "Linh nhận ra giọng giống cha, cần mẫu đối chứng; chưa xác minh danh tính",
        "certainty": "reported",
        "is_locked": False,
        "chapter_number": 2,
    }
    # Superseded facts
    fact_old_signal = {
        "id": "fact-signal-ch1-old",
        "fact_type": "narrative_fact",
        "fact_key": "signal_origin",
        "fact_value": "Tín hiệu máy thu xuất hiện ở đồi phía Đông",
        "is_locked": False,
        "chapter_number": 1,
    }
    fact_new_signal = {
        "id": "fact-signal-ch3-new",
        "fact_type": "narrative_fact",
        "fact_key": "signal_origin",
        "fact_value": "Tín hiệu máy thu đã dời về trạm Bốn",
        "is_locked": False,
        "chapter_number": 3,
        "supersedes_id": "fact-signal-ch1-old",
    }
    # Fact belonging to chapter 5 (temporal filter test)
    fact_ch5_future = {
        "id": "fact-future-ch5-05",
        "fact_type": "narrative_fact",
        "fact_key": "extended_station_protocol",
        "fact_value": "Biên bản mở rộng trạm thu được ký kết tại hội nghị chương 5",
        "is_locked": False,
        "chapter_number": 5,
    }

    # 3. Canonical Events
    ev_ch1 = NarrativeEvent(
        event_id="ev-ch1-init",
        event_type="event",
        participants=("Mai Linh",),
        chapter=1,
        summary="Mai Linh khởi động trạm thu tại Cồn Vân và ghi nhận tín hiệu CV-04.",
        metadata={"original_narrative_order": 1024},
    )
    ev_ch2 = NarrativeEvent(
        event_id="ev-ch2-voice",
        event_type="event",
        participants=("Mai Linh",),
        chapter=2,
        summary="Phát hiện bản ghi âm có âm sắc nghi của Mai Lâm, cần mẫu đối chứng.",
        metadata={"original_narrative_order": 2048},
    )
    ev_ch3 = NarrativeEvent(
        event_id="ev-ch3-patrol",
        event_type="event",
        participants=("Duy",),
        chapter=3,
        summary="Duy đi kiểm tra bờ hào và bị thương ở chân trái.",
        metadata={"original_narrative_order": 3072},
    )
    ev_ch4 = NarrativeEvent(
        event_id="ev-ch4-recover",
        event_type="event",
        participants=("Duy",),
        chapter=4,
        summary="Duy được sơ cứu và chân trái hồi phục hoàn toàn, tiếp tục nhiệm vụ.",
        metadata={"original_narrative_order": 4096},
    )
    ev_ch5 = NarrativeEvent(
        event_id="ev-ch5-future",
        event_type="event",
        participants=("Mai Linh",),
        chapter=5,
        summary="Hội nghị toàn căn cứ tại đồi Bắc để mở rộng trạm thu.",
        metadata={"original_narrative_order": 5120},
    )

    # 4. State transitions (Duy condition: hurt in ch3, recovered in ch4)
    trans_ch3_injury = {
        "transition_id": "trans-01",
        "entity_id": "e-duy-03",
        "event_id": "ev-ch3-patrol",
        "attribute_key": "condition",
        "new_value": "hurt",
    }
    trans_ch4_recovery = {
        "transition_id": "trans-02",
        "entity_id": "e-duy-03",
        "event_id": "ev-ch4-recover",
        "attribute_key": "condition",
        "new_value": "recovered",
    }

    # 5. Planning context (Future plan at ch6 - NOT a historical event)
    planning_context = {
        "target_chapter": 6,
        "planned_events": [
            {
                "title": "Kiểm tra micro trước cửa Bốn",
                "description": "Kế hoạch tương lai tại chương 6: kiểm tra micro trước cửa Bốn, chưa thực hiện.",
                "target_chapter": 6,
            }
        ],
    }

    # Update story brain
    brain = replace(
        brain,
        entities=(e_linh, e_lam, e_duy, e_cv04, e_con_van),  # e_ch5_future not in baseline ch1-4 entities
        facts=(rule_locked_barrier, rule_locked_frequency, fact_voice_unverified, fact_old_signal, fact_new_signal, fact_ch5_future),
        events=(ev_ch1, ev_ch2, ev_ch3, ev_ch4, ev_ch5),
        transitions=(trans_ch3_injury, trans_ch4_recovery),
        current_state={
            "entities": {
                "e-duy-03": {"status": "Alive", "location": "Cồn Vân", "state": {"injured": False, "wound": "recovered"}},
                "e-linh-01": {"status": "Alive", "location": "Cồn Vân", "state": {}},
            }
        },
        metadata={"brain_version": "1", "status": "active"},
    )
    repo._brains[novel_id] = brain

    # 6. Unapproved Proposal (Pending proposal - MUST NOT be in approved canon)
    unapproved_proposal = NarrativeProposal(
        proposal_id="prop-unapproved-draft-01",
        proposal_type="world_rule",
        payload={"statement": "Tin đồn: Có đường hầm bí mật dẫn ra biển", "is_locked": False},
        status=ProposalStatus.PENDING,
    )
    repo._brains[novel_id] = replace(repo._brains[novel_id], proposals=(unapproved_proposal,))

    # 7. Setup Cross-Tenant Novel (tenant-wave1h-foreign)
    foreign_tenant = "tenant-wave1h-foreign"
    foreign_novel = "novel-wave1h-foreign"
    foreign_entity = NarrativeEntity(name="Kẻ Xâm Nhập Dị Giới", entity_id="e-foreign-99", entity_type="PER", status="Alive")
    foreign_rule = {
        "id": "rule-foreign-secret-99",
        "fact_type": "world_rule",
        "fact_key": "alien_law",
        "fact_value": "Quy tắc bí mật của thế giới song song cấm người ngoài hành tinh",
        "is_locked": True,
        "chapter_number": 1,
    }
    foreign_event = NarrativeEvent(
        event_id="ev-foreign-99",
        event_type="event",
        chapter=1,
        summary="Sự kiện vũ trụ xa lạ diễn ra tại thiên hà khác.",
    )
    foreign_brain = StoryBrain(
        story_id=foreign_novel,
        entities=(foreign_entity,),
        facts=(foreign_rule,),
        events=(foreign_event,),
        metadata={"brain_version": "1", "status": "active"},
    )
    repo._brains[foreign_novel] = foreign_brain

    return {
        "novel_id": novel_id,
        "tenant_id": tenant_id,
        "foreign_novel": foreign_novel,
        "foreign_tenant": foreign_tenant,
        "canonical_entities": ["Mai Linh", "Mai Lâm", "Duy", "CV-04", "Cồn Vân"],
        "locked_rules": ["rule-locked-barrier-01", "rule-locked-freq-02"],
        "superseded_facts": {"fact-signal-ch1-old": "fact-signal-ch3-new"},
        "ch5_future_event_id": "ev-ch5-future",
        "ch5_future_fact_id": "fact-future-ch5-05",
        "unapproved_proposal_id": "prop-unapproved-draft-01",
        "foreign_rule_id": "rule-foreign-secret-99",
    }


def execute_independent_context_verification() -> dict[str, Any]:
    """Execute Wave 1H end-to-end verification."""
    # Ensure offline boundary
    orig_getaddrinfo = socket.getaddrinfo
    def local_only(host, *args, **kwargs):
        if host not in {"127.0.0.1", "localhost", "::1", None}:
            raise RuntimeError("OFFLINE_TEST_EXTERNAL_NETWORK_DENIED")
        return orig_getaddrinfo(host, *args, **kwargs)
    socket.getaddrinfo = local_only

    run_dir = ROOT / "Pipeline_test/runs/2026-10-22-p1-wave1h-context-verify-01"
    run_dir.mkdir(parents=True, exist_ok=True)
    state_file = run_dir / "ledger.json"
    req_log_path = run_dir / "requests.jsonl"
    if req_log_path.exists():
        req_log_path.unlink()

    # 1. Start Fake Upstream
    fake_upstream, upstream_thread, received_requests = start_fake_upstream(
        port=0,
        host="127.0.0.1",
        log_path=str(req_log_path),
        expected_key="fake-upstream-only",
        scenario="wave1h-context-verify-v1",
    )
    upstream_port = fake_upstream.server_port

    # 2. Start Budget Gateway
    gateway_server, gateway_thread, ledger = start_budget_gateway(
        state_file=state_file,
        port=0,
        host="127.0.0.1",
        initialize=True,
        run_id="p1-wave1h-20261022-ctx-verify-01",
        upstream_base_url=f"http://127.0.0.1:{upstream_port}",
        upstream_api_key="fake-upstream-only",
        client_tokens={"ai-worker": "ai-service", "backend-worker": "backend"},
        upstream_timeout=2.0,
    )
    gateway_port = gateway_server.server_port
    gateway_url = f"http://127.0.0.1:{gateway_port}"

    # Configure Environment for LLM Service proxy
    os.environ["BUDGET_GUARD_URL"] = gateway_url
    os.environ["BUDGET_GUARD_MODE"] = "proxy"
    os.environ["BUDGET_GUARD_AUTH_TOKEN"] = "ai-worker"
    os.environ["LLM_LOCAL_FALLBACK"] = "false"

    try:
        # 3. Setup Repositories and Services
        tenant_id = "tenant-wave1h-owned"
        novel_id = "novel-wave1h-canon-01"
        repo = InMemoryNarrativeRepository()
        meta = setup_canonical_story_brain(repo, tenant_id=tenant_id, novel_id=novel_id)

        source_text = "Mai Linh ngồi trước bàn điều khiển trạm Bốn, kim chỉ số máy thu CV-04 đang rung nhẹ."
        content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
        chapter_id = "chapter-04"
        revision_id = "rev-ch4-uuid"

        rev_provider = InMemoryRevisionProvider({
            (tenant_id, novel_id, chapter_id, revision_id): type(
                "Rev", (), {"revision_id": revision_id, "content": source_text, "content_hash": content_hash}
            )()
        })

        llm_service = LLMService(
            provider="gemini",
            model="gemini-3.5-flash-lite",
            api_key="",
            timeout_seconds=5,
        )

        packer = ContextBudgetPacker(default_budget=8192)
        writing_service = WritingService(
            repository=repo,
            llm_service=llm_service,
            revision_provider=rev_provider,
            context_packer=packer,
        )

        # 4. Step 3 Execution: Trace complete context delivery path
        instruction = "Mai Linh tiếp tục theo dõi tín hiệu máy thu CV-04 tại trạm Bốn khi Duy bước vào phòng điều khiển."
        selection = {"start": 0, "end": len(source_text), "cursor": len(source_text)}

        # Preview context for chapter 4 cutoff
        preview = writing_service.preview_context(
            tenant_id=tenant_id,
            story_id=novel_id,
            chapter_number=4,
            token_budget=8192,
        )

        # Start and process writing generation job inline
        job = writing_service.start_generation(
            tenant_id=tenant_id,
            novel_id=novel_id,
            chapter_id=chapter_id,
            revision_id=revision_id,
            content_hash=content_hash,
            operation="continue",
            selection=selection,
            instruction=instruction,
            expected_brain_version=1,
            chapter_number=4,
            source_text=source_text,
            process_inline=True,
        )

        # Assert job reached completed status
        assert job.status == "completed", f"Job failed with status={job.status}, error={job.error}"
        assert job.validation_status == "passed", f"Draft validations failed: {job.validations}"

        # 5. Intercept and parse the actual outbound request at the fake upstream
        assert len(received_requests) >= 1, "Fake upstream did not receive any requests!"
        upstream_entry = received_requests[-1]
        outbound_prompt_text = upstream_entry.get("prompt_text", "")
        assert outbound_prompt_text, "Fake upstream did not capture prompt text!"

        # Extract the serialized Story Brain JSON from the outbound prompt
        marker = "Bối cảnh tiểu thuyết (Story Brain): "
        assert marker in outbound_prompt_text, "Marker 'Bối cảnh tiểu thuyết (Story Brain):' missing from outbound prompt!"
        raw_story_brain_str = outbound_prompt_text.split(marker, 1)[1]
        # It ends at newline before subsequent prompt lines (e.g. Phong cách / Ràng buộc)
        if "\n" in raw_story_brain_str:
            raw_story_brain_str = raw_story_brain_str.split("\n", 1)[0].strip()

        extracted_story_brain_payload = json.loads(raw_story_brain_str)

        # Hash of extracted Story Brain context
        extracted_story_brain_hash = hashlib.sha256(
            json.dumps(
                extracted_story_brain_payload,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
        ).hexdigest()

        # Deterministic hash of full outbound prompt
        full_outbound_prompt_hash = hashlib.sha256(outbound_prompt_text.encode("utf-8")).hexdigest()

        # Deterministic packed context hash from WritingService
        persisted_context_hash = job.context_hash

        # Step 3 Comparison Assertions:
        # 1. Exact match between extracted Story Brain hash and persisted job.context_hash
        story_brain_hashes_match = (extracted_story_brain_hash == persisted_context_hash)
        assert story_brain_hashes_match, (
            f"Story Brain hash mismatch: extracted={extracted_story_brain_hash} vs persisted={persisted_context_hash}"
        )

        # 2. Explicit distinction between packed-context hash and full outbound prompt hash
        hashes_distinct = (persisted_context_hash != full_outbound_prompt_hash)
        assert hashes_distinct, "Packed context hash should not be identical to full prompt hash!"

        # 6. Step 4 Verification: Invariants Check
        # Invariant 1: Approved canon included when relevant
        extracted_entity_names = [e["name"] for e in extracted_story_brain_payload.get("entities", [])]
        assert "Mai Linh" in extracted_entity_names
        assert "CV-04" in extracted_entity_names
        assert "Duy" in extracted_entity_names

        # Invariant 2: Locked rules retained under budget pressure
        extracted_rule_ids = [r["id"] for r in extracted_story_brain_payload.get("world_rules", [])]
        assert "rule-locked-barrier-01" in extracted_rule_ids
        assert "rule-locked-freq-02" in extracted_rule_ids

        # Extreme budget pressure test: ensure locked rules survive when everything else drops
        extreme_tight_package = writing_service.preview_context(
            tenant_id=tenant_id,
            story_id=novel_id,
            chapter_number=4,
            token_budget=150,
        )
        tight_prompt_context = packer.prompt_context(extreme_tight_package)
        tight_rule_ids = [r["id"] for r in tight_prompt_context.get("world_rules", [])]
        assert "rule-locked-barrier-01" in tight_rule_ids, "Locked barrier rule must survive budget pressure!"
        assert "rule-locked-freq-02" in tight_rule_ids, "Locked frequency rule must survive budget pressure!"
        assert len(tight_prompt_context.get("recent_events", [])) == 0, "Non-locked events should be dropped under 150 token budget!"
        assert "ev-ch4-recover" in extreme_tight_package.context_summary.get("dropped_event_ids", [])

        # Invariant 3: Future events not presented as historical facts
        extracted_event_ids = [ev["event_id"] for ev in extracted_story_brain_payload.get("recent_events", [])]
        assert "ev-ch5-future" not in extracted_event_ids, "Future ch5 event leaked into chapter 4 context!"
        # And Ch6 plan is not in recent_events
        assert not any("micro" in ev.get("summary", "").lower() for ev in extracted_story_brain_payload.get("recent_events", [])), (
            "Future Ch6 plan was erroneously included in recent historical events!"
        )

        # Invariant 4: Superseded character states not treated as current
        extracted_states = {s["name"]: s for s in extracted_story_brain_payload.get("current_states", [])}
        assert "Duy" in extracted_states
        duy_status = extracted_states["Duy"].get("status")
        assert duy_status == "Alive", f"Duy status should be Alive (recovered), found: {duy_status}"
        assert extracted_states["Duy"].get("state", {}).get("condition") == "recovered", (
            f"Duy state reflects obsolete condition: {extracted_states['Duy'].get('state')}"
        )
        assert extracted_states["Duy"].get("state", {}).get("condition") != "hurt", (
            "Duy state reflects superseded hurt condition!"
        )

        # Superseded fact verification
        assert "fact-signal-ch1-old" not in extracted_rule_ids, "Superseded fact leaked into world_rules!"
        assert "fact-signal-ch3-new" in extracted_rule_ids, "Current superseding fact missing from world_rules!"

        # Invariant 5: Cross-tenant memory cannot leak
        assert "Kẻ Xâm Nhập Dị Giới" not in extracted_entity_names, "Cross-tenant entity leaked!"
        assert "rule-foreign-secret-99" not in extracted_rule_ids, "Cross-tenant locked rule leaked!"
        assert "ev-foreign-99" not in extracted_event_ids, "Cross-tenant event leaked!"

        # Invariant 6: Context-budget pruning is deterministic and traceable
        p1 = packer.pack(preview, maximum=500)
        p2 = packer.pack(preview, maximum=500)
        assert p1 == p2, "ContextBudgetPacker output is not deterministic!"
        h1 = hashlib.sha256(json.dumps(packer.prompt_context(p1), sort_keys=True).encode()).hexdigest()
        h2 = hashlib.sha256(json.dumps(packer.prompt_context(p2), sort_keys=True).encode()).hexdigest()
        assert h1 == h2, "ContextBudgetPacker hash is not deterministic!"

        # Invariant 7: Retrieval failures represented honestly
        assert preview.context_summary.get("semantic_retrieval_status") in [None, ["disabled"], ["not_requested"]], (
            f"Dishonest semantic retrieval status: {preview.context_summary.get('semantic_retrieval_status')}"
        )

        # Invariant 8: No stale draft or unapproved memory silently promoted to canon
        assert "prop-unapproved-draft-01" not in extracted_rule_ids, "Unapproved pending proposal promoted to canon!"
        assert not any("hầm bí mật" in r.get("fact_value", "") for r in extracted_story_brain_payload.get("world_rules", [])), (
            "Unapproved proposal content leaked into world rules!"
        )

        # Stale brain version recheck
        try:
            stale_job = writing_service.start_generation(
                tenant_id=tenant_id,
                novel_id=novel_id,
                chapter_id=chapter_id,
                revision_id=revision_id,
                content_hash=content_hash,
                operation="continue",
                selection=selection,
                instruction="Viết tiếp khi version đổi",
                expected_brain_version=999,  # Stale version expectation!
                source_text=source_text,
                process_inline=True,
            )
            stale_handled = (stale_job.status == "failed" and stale_job.error.get("code") == "STALE_BRAIN_VERSION")
        except OptimisticLockError:
            stale_handled = True
        assert stale_handled, "Stale brain version was not rejected with optimistic lock error!"

        # 7. Collect Verification Summary and Ledger Audit
        ledger_summary = ledger.get_summary()
        assert ledger_summary["total_calls"] >= 1, "Gateway ledger did not record provider call!"

        audit_result = {
            "project_id": "p1-wave1h-20261022-ctx-verify-01",
            "novel_id": novel_id,
            "tenant_id": tenant_id,
            "chapter_number": 4,
            "expected_brain_version": 1,
            "brain_version_used": job.brain_version_used,
            "job_id": job.job_id,
            "persisted_context_hash": persisted_context_hash,
            "extracted_story_brain_hash": extracted_story_brain_hash,
            "full_outbound_prompt_hash": full_outbound_prompt_hash,
            "story_brain_hashes_match": story_brain_hashes_match,
            "hashes_distinct": hashes_distinct,
            "effective_model": upstream_entry.get("response", {}).get("modelVersion", "gemini-3.5-flash-lite"),
            "effective_output_limit": upstream_entry.get("output_limit", 8192),
            "dispatch_id": upstream_entry.get("dispatch_id"),
            "client_service": upstream_entry.get("client"),
            "invariants": {
                "inv1_approved_canon_included": True,
                "inv2_locked_rules_retained_under_budget": True,
                "inv3_future_events_excluded": True,
                "inv4_superseded_states_not_current": True,
                "inv5_cross_tenant_isolation": True,
                "inv6_budget_pruning_deterministic": True,
                "inv7_retrieval_failures_honest": True,
                "inv8_unapproved_memory_not_promoted": True,
            },
            "included_memory_ids": {
                "entities": [e["entity_id"] for e in extracted_story_brain_payload.get("entities", [])],
                "events": [ev["event_id"] for ev in extracted_story_brain_payload.get("recent_events", [])],
                "world_rules": [r["id"] for r in extracted_story_brain_payload.get("world_rules", [])],
            },
            "excluded_dropped_memory_ids": {
                "future_ch5_event": "ev-ch5-future",
                "future_ch5_fact": "fact-future-ch5-05",
                "superseded_ch1_fact": "fact-signal-ch1-old",
                "unapproved_proposal": "prop-unapproved-draft-01",
                "foreign_tenant_rule": "rule-foreign-secret-99",
                "pruned_under_150_budget": extreme_tight_package.context_summary.get("dropped_event_ids", []),
            },
            "ledger_audit": {
                "total_calls": ledger_summary["total_calls"],
                "status": ledger_summary["status"],
                "live_authorized": ledger_summary["live_authorized"],
                "charged_usd": ledger_summary["charged_usd"],
                "real_provider_calls": 0,
            },
            "verdicts": {
                "PACKED_TO_LLM_SOURCE_VERIFIED": "PASS",
                "OFFLINE_OUTBOUND_CONTEXT_VERIFIED": "PASS",
                "SEMANTIC_RAG_NOT_ASSESSED": "NOT_ASSESSED",
                "REAL_MODEL_QUALITY_NOT_TESTED": "NOT_TESTED",
                "S09_BLOCKED_AWAITING_FE_PATCH": "BLOCKED",
            },
        }

        # Write evidence to review folder
        review_dir = ROOT / "Pipeline_test/reviews/2026-10-22-p1-wave-1h"
        review_dir.mkdir(parents=True, exist_ok=True)

        (review_dir / "outbound_prompt_evidence.json").write_text(
            json.dumps({
                "dispatch_id": upstream_entry.get("dispatch_id"),
                "path": upstream_entry.get("path"),
                "full_outbound_prompt_sha256": full_outbound_prompt_hash,
                "extracted_story_brain_sha256": extracted_story_brain_hash,
                "persisted_job_context_hash": persisted_context_hash,
                "story_brain_hash_match": story_brain_hashes_match,
                "full_prompt_sample_sanitized": outbound_prompt_text[:400] + "... [TRUNCATED] ..." + outbound_prompt_text[-200:],
                "extracted_story_brain_payload": extracted_story_brain_payload,
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        (review_dir / "context_comparison.json").write_text(
            json.dumps({
                "chapter_cutoff": 4,
                "included_entity_ids": audit_result["included_memory_ids"]["entities"],
                "included_event_ids": audit_result["included_memory_ids"]["events"],
                "included_rule_ids": audit_result["included_memory_ids"]["world_rules"],
                "excluded_future_event_id": "ev-ch5-future",
                "excluded_future_fact_id": "fact-future-ch5-05",
                "excluded_superseded_fact_id": "fact-signal-ch1-old",
                "excluded_unapproved_proposal_id": "prop-unapproved-draft-01",
                "excluded_foreign_tenant_rule": "rule-foreign-secret-99",
                "tight_budget_dropped_events": audit_result["excluded_dropped_memory_ids"]["pruned_under_150_budget"],
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        (review_dir / "ledger_summary.json").write_text(
            json.dumps(ledger_summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return audit_result

    finally:
        socket.getaddrinfo = orig_getaddrinfo
        gateway_server.shutdown()
        gateway_server.server_close()
        ledger.close()
        fake_upstream.shutdown()
        fake_upstream.server_close()


if __name__ == "__main__":
    result = execute_independent_context_verification()
    print(json.dumps(result, ensure_ascii=False, indent=2))
