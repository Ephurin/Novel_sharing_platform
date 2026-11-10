"""P2-07E: Post-M0 author-approved World Setup rule amendment backend.

Enforces:
1. Strict novel ownership and tenant scoping.
2. Verified active M0 baseline prerequisite.
3. Target fact eligibility (globally scoped world_rule, confirmed, unretired, current head).
4. Lock status immutability (is_locked inherited strictly from parent).
5. Compare-and-swap (CAS) on story brain version.
6. Idempotency on propose and decide requests.
7. Atomic single-transaction commit (successor fact + proposal decision receipt + brain version bump).
8. Zero fake chapters, revisions, events, or outbox records.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy import select, text

from api.setup_schemas import (
    SetupRuleAmendmentProposalRequest,
    SetupRuleAmendmentProposalResponse,
    SetupRuleAmendmentDecisionRequest,
    SetupRuleAmendmentDecisionResponse,
    SetupRuleAmendmentHistoryResponse,
    SetupRuleLineageEntry,
    SetupRuleAmendmentHistoryItem,
)
from application.setup_service import SetupFailure, digest
from domain.errors import BootstrapConflictError
from domain.projection import _has_global_world_rule_shape, resolve_effective_facts
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    AnalysisRunRecord,
    BootstrapJobRecord,
    FactRecord,
    ProposalDecisionRecord,
    ProposalRecord,
    StoryBrainRecord,
)


def _to_uuid(val: str | uuid.UUID) -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


def _load_m0_baseline(session: Any, repo: Any, novel_id: uuid.UUID) -> BootstrapJobRecord:
    """Ensure that the novel has a verified, completed, active setup-m0-v1 baseline."""
    jobs = session.scalars(
        select(BootstrapJobRecord).where(
            *repo._scope(BootstrapJobRecord, novel_id),
            BootstrapJobRecord.status == "completed",
            BootstrapJobRecord.stage == "m0_active",
        )
    ).all()
    for job in jobs:
        res = job.result or {}
        activation = res.get("setup_activation") or {}
        if (
            res.get("contract_version") == "setup-v1"
            and activation.get("contract_version") == "setup-m0-v1"
            and activation.get("response", {}).get("baseline_kind") == "M0"
        ):
            return job
    raise BootstrapConflictError("M0_NOT_ACTIVE")


def _find_root_and_chain(
    session: Any,
    repo: Any,
    novel_id: uuid.UUID,
    fact_id: uuid.UUID,
) -> tuple[FactRecord, uuid.UUID]:
    """Validate target fact eligibility and determine its root lineage ID."""
    fact = session.scalar(
        select(FactRecord).where(
            *repo._scope(FactRecord, novel_id),
            FactRecord.id == fact_id,
        )
    )
    if fact is None:
        raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 404)
    if fact.fact_type != "world_rule":
        raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 422)
    if fact.confirmation_status != "confirmed" or fact.is_retired:
        raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 422)
    fact_dict = repo._fact_record_to_dict(fact)
    if not _has_global_world_rule_shape(fact_dict):
        raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 422)

    # Must be the current effective head: no confirmed successor may point to this fact
    successor = session.scalar(
        select(FactRecord.id).where(
            *repo._scope(FactRecord, novel_id),
            FactRecord.supersedes_id == fact.id,
            FactRecord.confirmation_status == "confirmed",
        )
    )
    if successor is not None:
        raise BootstrapConflictError("AMENDMENT_PARENT_CONFLICT")

    # Walk up the chain to discover root_fact_id
    curr = fact
    visited = {curr.id}
    while curr.supersedes_id is not None:
        parent = session.scalar(
            select(FactRecord).where(
                *repo._scope(FactRecord, novel_id),
                FactRecord.id == curr.supersedes_id,
            )
        )
        if parent is None or parent.id in visited:
            break
        visited.add(parent.id)
        curr = parent
    root_fact_id = curr.id

    return fact, root_fact_id


def propose_amendment(
    repo: Any,
    novel_id_raw: str | uuid.UUID,
    fact_id_raw: str | uuid.UUID,
    actor_id_raw: str | uuid.UUID,
    request: SetupRuleAmendmentProposalRequest,
) -> dict[str, Any]:
    novel_id = _to_uuid(novel_id_raw)
    fact_id = _to_uuid(fact_id_raw)
    actor_id = str(_to_uuid(actor_id_raw))

    with session_scope(repo._session_factory) as session:
        # 1. Author ownership check
        owner_row = session.execute(
            text("SELECT novel_id FROM novels WHERE novel_id = :n AND author_id = :a FOR SHARE"),
            {"n": novel_id, "a": uuid.UUID(actor_id)},
        ).first()
        if owner_row is None:
            raise KeyError("SETUP_NOT_FOUND")

        # 2. Lock StoryBrain
        brain = session.scalar(
            select(StoryBrainRecord).where(
                *repo._scope(StoryBrainRecord, novel_id)
            ).with_for_update()
        )
        if brain is None:
            raise KeyError("SETUP_NOT_FOUND")

        # 3. Verify M0 active baseline
        if brain.status != "active":
            raise BootstrapConflictError("M0_NOT_ACTIVE")
        m0_job = _load_m0_baseline(session, repo, novel_id)

        # 4. CAS check on brain version
        if brain.brain_version != request.expected_brain_version:
            raise BootstrapConflictError("AMENDMENT_VERSION_CONFLICT")

        # 5. Target fact eligibility
        fact, root_fact_id = _find_root_and_chain(session, repo, novel_id, fact_id)

        # 6. Idempotency check
        fingerprint = digest({
            "novel_id": str(novel_id),
            "fact_id": str(fact.id),
            "replacement_text": request.replacement_text,
            "expected_brain_version": request.expected_brain_version,
            "idempotency_key": request.idempotency_key,
        })

        existing = session.scalar(
            select(ProposalRecord).where(
                *repo._scope(ProposalRecord, novel_id),
                ProposalRecord.proposal_type == "world_rule_amendment",
                ProposalRecord.payload["idempotency_key"].as_string() == request.idempotency_key,
            )
        )
        if existing is not None:
            if (existing.payload or {}).get("request_hash") == fingerprint:
                return _proposal_record_to_dict(existing, brain.brain_version)
            raise BootstrapConflictError("AMENDMENT_IDEMPOTENCY_CONFLICT")

        # 7. Check if another pending amendment already exists for this rule
        pending = session.scalar(
            select(ProposalRecord).where(
                *repo._scope(ProposalRecord, novel_id),
                ProposalRecord.proposal_type == "world_rule_amendment",
                ProposalRecord.status == "pending",
                ProposalRecord.payload["fact_key"].as_string() == fact.fact_key,
            )
        )
        if pending is not None:
            raise BootstrapConflictError("AMENDMENT_PENDING_EXISTS")

        # 8. Create AnalysisRunRecord and ProposalRecord
        run_id = uuid.uuid4()
        run = AnalysisRunRecord(
            id=run_id,
            story_brain_id=brain.id,
            tenant_id=repo._tenant_id,
            novel_id=novel_id,
            operation="setup_amendment",
            pipeline_version="setup-rule-amendment-v1",
            idempotency_key=f"amendment:propose:{novel_id}:{request.idempotency_key}",
            input_hash=fingerprint,
            status="completed",
        )
        session.add(run)

        proposal_id = uuid.uuid4()
        proposal = ProposalRecord(
            id=proposal_id,
            analysis_run_id=run_id,
            story_brain_id=brain.id,
            tenant_id=repo._tenant_id,
            novel_id=novel_id,
            dependency_group_id=uuid.uuid4(),
            materialization_order=0,
            proposal_type="world_rule_amendment",
            status="pending",
            expected_brain_version=request.expected_brain_version,
            payload={
                "contract_version": "setup-rule-amendment-v1",
                "parent_fact_id": str(fact.id),
                "root_fact_id": str(root_fact_id),
                "fact_key": fact.fact_key,
                "replacement_text": request.replacement_text,
                "is_locked": fact.is_locked,
                "idempotency_key": request.idempotency_key,
                "private_author_notes": request.private_author_notes or [],
                "request_hash": fingerprint,
            },
            evidence=[{
                "setup_snapshot_id": str(m0_job.id),
                "setup_hash": (m0_job.result or {}).get("setup_hash"),
                "setup_version": (m0_job.result or {}).get("setup_version"),
                "author_id": actor_id,
                "proposed_at": datetime.now(timezone.utc).isoformat(),
            }],
        )
        session.add(proposal)
        session.flush()

        return _proposal_record_to_dict(proposal, brain.brain_version)


def decide_amendment(
    repo: Any,
    novel_id_raw: str | uuid.UUID,
    proposal_id_raw: str | uuid.UUID,
    actor_id_raw: str | uuid.UUID,
    request: SetupRuleAmendmentDecisionRequest,
) -> dict[str, Any]:
    novel_id = _to_uuid(novel_id_raw)
    proposal_id = _to_uuid(proposal_id_raw)
    actor_id = str(_to_uuid(actor_id_raw))

    with session_scope(repo._session_factory) as session:
        # 1. Author ownership check
        owner_row = session.execute(
            text("SELECT novel_id FROM novels WHERE novel_id = :n AND author_id = :a FOR SHARE"),
            {"n": novel_id, "a": uuid.UUID(actor_id)},
        ).first()
        if owner_row is None:
            raise KeyError("SETUP_NOT_FOUND")

        # 2. Lock StoryBrain
        brain = session.scalar(
            select(StoryBrainRecord).where(
                *repo._scope(StoryBrainRecord, novel_id)
            ).with_for_update()
        )
        if brain is None:
            raise KeyError("SETUP_NOT_FOUND")

        # 3. Verify M0 active baseline
        if brain.status != "active":
            raise BootstrapConflictError("M0_NOT_ACTIVE")
        m0_job = _load_m0_baseline(session, repo, novel_id)

        # 4. Lock Proposal
        proposal = session.scalar(
            select(ProposalRecord).where(
                *repo._scope(ProposalRecord, novel_id),
                ProposalRecord.id == proposal_id,
            ).with_for_update()
        )
        if proposal is None:
            raise SetupFailure("AMENDMENT_PROPOSAL_NOT_FOUND", 404)
        if proposal.proposal_type != "world_rule_amendment":
            raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 422)

        # 5. Idempotency / Already decided check
        decision_fingerprint = digest({
            "novel_id": str(novel_id),
            "proposal_id": str(proposal.id),
            "decision": request.decision,
            "expected_brain_version": request.expected_brain_version,
            "idempotency_key": request.idempotency_key,
        })

        if proposal.status != "pending":
            existing_decision = session.scalar(
                select(ProposalDecisionRecord).where(
                    ProposalDecisionRecord.proposal_id == proposal.id
                )
            )
            if (
                existing_decision is not None
                and (existing_decision.edited_payload or {}).get("idempotency_key") == request.idempotency_key
            ):
                if (existing_decision.edited_payload or {}).get("request_hash") == decision_fingerprint:
                    return _decision_record_to_dict(existing_decision)
                raise BootstrapConflictError("AMENDMENT_IDEMPOTENCY_CONFLICT")
            raise BootstrapConflictError("AMENDMENT_PROPOSAL_ALREADY_DECIDED")

        # 6. CAS check
        if brain.brain_version != request.expected_brain_version:
            raise BootstrapConflictError("AMENDMENT_VERSION_CONFLICT")

        # 7. Parent fact check
        parent_fact_id = uuid.UUID(proposal.payload["parent_fact_id"])
        parent_fact = session.scalar(
            select(FactRecord).where(
                *repo._scope(FactRecord, novel_id),
                FactRecord.id == parent_fact_id,
            ).with_for_update(read=True)
        )
        if parent_fact is None or parent_fact.confirmation_status != "confirmed" or parent_fact.is_retired:
            raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 422)

        if request.decision == "accept":
            curr_successor = session.scalar(
                select(FactRecord.id).where(
                    *repo._scope(FactRecord, novel_id),
                    FactRecord.supersedes_id == parent_fact.id,
                    FactRecord.confirmation_status == "confirmed",
                )
            )
            if curr_successor is not None:
                raise BootstrapConflictError("AMENDMENT_PARENT_CONFLICT")

        # 8. Apply Decision
        decided_at_iso = datetime.now(timezone.utc).isoformat()
        if request.decision == "reject":
            proposal.status = "rejected"
            proposal.decision_reason = request.reason

            receipt = {
                "contract_version": "setup-rule-amendment-v1",
                "decision_type": "amendment_decision",
                "decision": "reject",
                "proposal_id": str(proposal.id),
                "parent_fact_id": str(parent_fact.id),
                "successor_fact_id": None,
                "root_fact_id": proposal.payload.get("root_fact_id", str(parent_fact.id)),
                "fact_key": parent_fact.fact_key,
                "fact_value": proposal.payload.get("replacement_text"),
                "is_locked": parent_fact.is_locked,
                "actor_id": actor_id,
                "tenant_id": str(repo._tenant_id),
                "novel_id": str(novel_id),
                "story_brain_id": str(brain.id),
                "expected_brain_version": request.expected_brain_version,
                "resulting_brain_version": brain.brain_version,
                "setup_snapshot_id": str(m0_job.id),
                "setup_hash": (m0_job.result or {}).get("setup_hash"),
                "artifact_ids": [],
                "decided_at": decided_at_iso,
                "idempotency_key": request.idempotency_key,
                "request_hash": decision_fingerprint,
                "reason": request.reason,
            }
            decision_rec = ProposalDecisionRecord(
                id=uuid.uuid4(),
                proposal_id=proposal.id,
                actor_id=uuid.UUID(actor_id),
                decision="reject",
                reason=request.reason,
                edited_payload=receipt,
            )
            session.add(decision_rec)
            session.flush()

            return _decision_record_to_dict(decision_rec)

        # Accept path: atomic successor creation + decision receipt + brain version bump
        successor_id = uuid.uuid4()
        successor = FactRecord(
            id=successor_id,
            story_brain_id=brain.id,
            tenant_id=repo._tenant_id,
            novel_id=novel_id,
            fact_type="world_rule",
            fact_key=parent_fact.fact_key,
            fact_value=proposal.payload["replacement_text"],
            is_locked=parent_fact.is_locked,  # Lock status is strictly immutable
            priority=getattr(parent_fact, "priority", 0) or 0,
            source_type="author_setup",
            created_by=uuid.UUID(actor_id),
            confirmation_status="confirmed",
            is_retired=False,
            supersedes_id=parent_fact.id,
        )
        session.add(successor)

        proposal.status = "accepted"
        proposal.decision_reason = request.reason
        brain.brain_version += 1

        receipt = {
            "contract_version": "setup-rule-amendment-v1",
            "decision_type": "amendment_decision",
            "decision": "accept",
            "proposal_id": str(proposal.id),
            "parent_fact_id": str(parent_fact.id),
            "successor_fact_id": str(successor_id),
            "root_fact_id": proposal.payload.get("root_fact_id", str(parent_fact.id)),
            "fact_key": parent_fact.fact_key,
            "fact_value": proposal.payload.get("replacement_text"),
            "is_locked": parent_fact.is_locked,
            "actor_id": actor_id,
            "tenant_id": str(repo._tenant_id),
            "novel_id": str(novel_id),
            "story_brain_id": str(brain.id),
            "expected_brain_version": request.expected_brain_version,
            "resulting_brain_version": brain.brain_version,
            "setup_snapshot_id": str(m0_job.id),
            "setup_hash": (m0_job.result or {}).get("setup_hash"),
            "artifact_ids": [str(successor_id)],
            "decided_at": decided_at_iso,
            "idempotency_key": request.idempotency_key,
            "request_hash": decision_fingerprint,
            "reason": request.reason,
        }
        decision_rec = ProposalDecisionRecord(
            id=uuid.uuid4(),
            proposal_id=proposal.id,
            actor_id=uuid.UUID(actor_id),
            decision="accept",
            reason=request.reason,
            edited_payload=receipt,
        )
        session.add(decision_rec)
        session.flush()

        return _decision_record_to_dict(decision_rec)


def get_amendment_history(
    repo: Any,
    novel_id_raw: str | uuid.UUID,
    fact_id_raw: str | uuid.UUID,
    actor_id_raw: str | uuid.UUID,
) -> dict[str, Any]:
    novel_id = _to_uuid(novel_id_raw)
    fact_id = _to_uuid(fact_id_raw)
    actor_id = str(_to_uuid(actor_id_raw))

    with session_scope(repo._session_factory) as session:
        # 1. Ownership check
        owner_row = session.execute(
            text("SELECT novel_id FROM novels WHERE novel_id = :n AND author_id = :a FOR SHARE"),
            {"n": novel_id, "a": uuid.UUID(actor_id)},
        ).first()
        if owner_row is None:
            raise KeyError("SETUP_NOT_FOUND")

        brain = session.scalar(
            select(StoryBrainRecord).where(*repo._scope(StoryBrainRecord, novel_id))
        )
        if brain is None:
            raise KeyError("SETUP_NOT_FOUND")

        target_fact = session.scalar(
            select(FactRecord).where(
                *repo._scope(FactRecord, novel_id),
                FactRecord.id == fact_id,
            )
        )
        if target_fact is None:
            raise SetupFailure("AMENDMENT_TARGET_INELIGIBLE", 404)

        # Discover all facts sharing this fact_key
        all_facts = session.scalars(
            select(FactRecord).where(
                *repo._scope(FactRecord, novel_id),
                FactRecord.fact_type == "world_rule",
                FactRecord.fact_key == target_fact.fact_key,
            ).order_by(FactRecord.created_at.asc(), FactRecord.id.asc())
        ).all()

        # Find verified amendment edges
        verified_edges = repo._load_verified_amendment_edges(session, novel_id)

        # Resolve effective facts to find the active head
        fact_dicts = [repo._fact_record_to_dict(f) for f in all_facts]
        try:
            effective = resolve_effective_facts(
                fact_dicts,
                tenant_id=str(repo._tenant_id),
                novel_id=str(novel_id),
                story_brain_id=str(brain.id),
                verified_amendment_edges=verified_edges,
            )
            effective_head_id = str(effective[0]["fact_id"]) if effective else str(target_fact.id)
        except Exception:
            effective_head_id = str(target_fact.id)

        # Build lineage chain starting from root (supersedes_id is None)
        parent_map = {f.supersedes_id: f for f in all_facts if f.supersedes_id is not None}
        root_fact = next((f for f in all_facts if f.supersedes_id is None), target_fact)
        lineage_entries: list[dict[str, Any]] = []
        curr = root_fact
        visited = set()
        while curr is not None and curr.id not in visited:
            visited.add(curr.id)
            val = curr.fact_value
            text_val = val if isinstance(val, str) else str(val)
            lineage_entries.append({
                "fact_id": str(curr.id),
                "fact_value": text_val,
                "is_locked": curr.is_locked,
                "supersedes_id": str(curr.supersedes_id) if curr.supersedes_id else None,
                "created_at": curr.created_at.isoformat() if curr.created_at else datetime.now(timezone.utc).isoformat(),
                "created_by": str(curr.created_by) if curr.created_by else None,
            })
            curr = parent_map.get(curr.id)

        # Proposals for this fact_key
        proposals = session.scalars(
            select(ProposalRecord).where(
                *repo._scope(ProposalRecord, novel_id),
                ProposalRecord.proposal_type == "world_rule_amendment",
                ProposalRecord.payload["fact_key"].as_string() == target_fact.fact_key,
            ).order_by(ProposalRecord.created_at.asc())
        ).all()

        decisions = {
            d.proposal_id: d
            for d in session.scalars(
                select(ProposalDecisionRecord).where(
                    ProposalDecisionRecord.proposal_id.in_([p.id for p in proposals])
                )
            ).all()
        } if proposals else {}

        proposal_items: list[dict[str, Any]] = []
        for p in proposals:
            d = decisions.get(p.id)
            p_payload = p.payload or {}
            d_payload = (d.edited_payload or {}) if d else {}
            proposal_items.append({
                "proposal_id": str(p.id),
                "status": p.status,
                "replacement_text": p_payload.get("replacement_text", ""),
                "decision": d.decision if d else None,
                "decided_at": d.decided_at.isoformat() if d and d.decided_at else None,
                "reason": d.reason if d else p.decision_reason,
                "actor_id": str(d.actor_id) if d else None,
                "successor_fact_id": d_payload.get("successor_fact_id"),
            })

        return {
            "contract_version": "setup-rule-amendment-v1",
            "novel_id": str(novel_id),
            "fact_key": target_fact.fact_key,
            "root_fact_id": str(root_fact.id),
            "effective_head_id": effective_head_id,
            "is_locked": target_fact.is_locked,
            "brain_version": brain.brain_version,
            "lineage": lineage_entries,
            "proposals": proposal_items,
        }


def _proposal_record_to_dict(proposal: ProposalRecord, brain_version: int) -> dict[str, Any]:
    payload = proposal.payload or {}
    created_at_iso = proposal.created_at.isoformat() if proposal.created_at else datetime.now(timezone.utc).isoformat()
    return {
        "contract_version": "setup-rule-amendment-v1",
        "proposal_id": str(proposal.id),
        "status": proposal.status,
        "novel_id": str(proposal.novel_id),
        "story_brain_id": str(proposal.story_brain_id),
        "parent_fact_id": payload.get("parent_fact_id"),
        "fact_key": payload.get("fact_key"),
        "replacement_text": payload.get("replacement_text"),
        "is_locked": bool(payload.get("is_locked")),
        "brain_version": brain_version,
        "created_at": created_at_iso,
    }


def _decision_record_to_dict(decision: ProposalDecisionRecord) -> dict[str, Any]:
    payload = decision.edited_payload or {}
    decided_at_iso = decision.decided_at.isoformat() if decision.decided_at else datetime.now(timezone.utc).isoformat()
    return {
        "contract_version": "setup-rule-amendment-v1",
        "decision_type": "amendment_decision",
        "decision": decision.decision,
        "proposal_id": str(decision.proposal_id),
        "parent_fact_id": payload.get("parent_fact_id"),
        "successor_fact_id": payload.get("successor_fact_id"),
        "fact_key": payload.get("fact_key"),
        "is_locked": bool(payload.get("is_locked")),
        "brain_version": payload.get("resulting_brain_version", 1),
        "decided_at": payload.get("decided_at") or decided_at_iso,
        "artifact_ids": payload.get("artifact_ids") or [],
    }
