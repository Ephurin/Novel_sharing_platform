from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from api.deps import get_narrative_service, get_revision_analysis_service
from api.schemas import (
    EventCorrectionRequest,
    ProposalDecisionRequest,
    ProposalEditAcceptRequest,
    ProposalGroupAcceptRequest,
    ProposalRejectRequest,
    RevisionAnalysisRequest,
)
from application.narrative_service import NarrativeApplicationService
from application.ports import ContentHashMismatchError, RevisionNotFoundError
from application.revision_analysis_service import RevisionAnalysisService
from domain.errors import (
    IdempotencyConflictError,
    OptimisticLockError,
    ProposalAlreadyDecidedError,
)
from domain.projection import ProjectionError


router = APIRouter(prefix="/v1", tags=["narrative-memory"])


@router.get("/story-brains/{brain_id}/state")
def get_state(brain_id: str, service: NarrativeApplicationService = Depends(get_narrative_service)):
    return {"data": service.get_current_state(brain_id), "meta": {"schema_version": 1}}


@router.post("/story-brains/{brain_id}/projections/rebuild")
def rebuild_projection(brain_id: str, payload: ProposalDecisionRequest,
                       service: NarrativeApplicationService = Depends(get_narrative_service)):
    try:
        result = service.rebuild_projection(brain_id, payload.expected_brain_version)
    except KeyError as exc:
        raise HTTPException(404, detail={"code": "STORY_BRAIN_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    return {"data": result, "meta": {"schema_version": 1}}


@router.post("/story-brains/{brain_id}/events/{event_id}/corrections", status_code=201)
def propose_correction(brain_id: str, event_id: str, payload: EventCorrectionRequest,
                       service: NarrativeApplicationService = Depends(get_narrative_service)):
    try:
        proposals = service.propose_event_correction(brain_id, event_id,
            payload.replacement.model_dump(), [t.model_dump() for t in payload.transitions],
            payload.expected_brain_version)
    except KeyError as exc:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_CORRECTION", "message": str(exc)}) from exc
    return {"data": [asdict(p) for p in proposals], "meta": {"schema_version": 1}}


@router.post("/revisions/{revision_id}/analyses", status_code=202)
def analyze_revision(
    revision_id: str,
    payload: RevisionAnalysisRequest,
    tenant_id: str = Header(..., alias="X-Tenant-Id"),
    request_id: str = Header(..., alias="X-Request-Id"),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    service: RevisionAnalysisService = Depends(get_revision_analysis_service),
):
    try:
        result = service.analyze(
            tenant_id=tenant_id,
            novel_id=payload.novel_id,
            chapter_id=payload.chapter_id,
            revision_id=revision_id,
            content_hash=payload.content_hash,
            operation=payload.operation,
            idempotency_key=idempotency_key,
            options=payload.options.model_dump(),
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"code": "REVISION_NOT_FOUND"}) from exc
    except ContentHashMismatchError as exc:
        raise HTTPException(status_code=422, detail={"code": "CONTENT_HASH_MISMATCH"}) from exc
    except IdempotencyConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"}) from exc
    return {
        "data": {
            "job_id": result.analysis_run.run_id,
            "analysis_run_id": result.analysis_run.run_id,
            "status": "completed",
            "proposal_count": len(result.proposals),
            "deduplicated": result.deduplicated,
        },
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@router.get("/story-brains/{brain_id}/proposals")
def list_proposals(
    brain_id: str,
    status: str | None = Query(default="pending"),
    proposal_type: str | None = Query(default=None, alias="type"),
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    proposals = service.list_proposals(
        brain_id, status=status, proposal_type=proposal_type
    )
    return {
        "data": [asdict(item) for item in proposals],
        "meta": {"request_id": request_id, "next_cursor": None},
    }


@router.post("/proposals/{proposal_id}/accept")
def accept_proposal(
    proposal_id: str,
    payload: ProposalDecisionRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = service.accept_proposal_by_id(
            proposal_id, payload.expected_brain_version
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(status_code=409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    except ProposalAlreadyDecidedError as exc:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_ALREADY_DECIDED"}) from exc
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal(
    proposal_id: str,
    payload: ProposalRejectRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = service.reject_proposal_by_id(proposal_id, payload.reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_NOT_FOUND"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    except ProposalAlreadyDecidedError as exc:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_ALREADY_DECIDED"}) from exc
    return {
        "data": {"proposal_id": result.proposal_id, "status": result.status.value},
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@router.post("/proposals/{proposal_id}/edit-and-accept")
def edit_and_accept_proposal(
    proposal_id: str,
    payload: ProposalEditAcceptRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = service.accept_proposal_by_id(
            proposal_id,
            payload.expected_brain_version,
            edited_payload=payload.edited_payload,
            reason=payload.reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(status_code=409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    except ProposalAlreadyDecidedError as exc:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_ALREADY_DECIDED"}) from exc
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


@router.post("/proposal-groups/{group_id}/accept")
def accept_proposal_group(
    group_id: str,
    payload: ProposalGroupAcceptRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = service.accept_proposal_group_by_ids(
            group_id,
            payload.proposal_ids,
            payload.expected_brain_version,
            payload.reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(status_code=409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ProjectionError as exc:
        raise HTTPException(422, detail={"code": "INVALID_PROJECTION", "message": str(exc)}) from exc
    except ProposalAlreadyDecidedError as exc:
        raise HTTPException(status_code=409, detail={"code": "PROPOSAL_ALREADY_DECIDED"}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PROPOSAL_GROUP"}) from exc
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}
