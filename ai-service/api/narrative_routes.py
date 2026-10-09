from __future__ import annotations

import asyncio
import json
from dataclasses import asdict

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.deps import (
    get_bootstrap_service,
    get_narrative_service,
    get_revision_analysis_service,
    get_settings,
    get_semantic_materializer,
    get_writing_service,
    require_service_token,
)
from api.schemas import (
    EventCorrectionRequest,
    BaselineActivationRequest,
    EntityMergeRequest,
    IdeaBootstrapRequest,
    ManuscriptBootstrapRequest,
    ProposalDecisionRequest,
    ProposalEditAcceptRequest,
    ProposalGroupAcceptRequest,
    ProposalRejectRequest,
    RevisionAnalysisRequest,
    WritingGenerationRequest,
)
from application.narrative_service import NarrativeApplicationService
from application.semantic_memory_service import refresh_semantic_memory_safely
from application.bootstrap_service import ManuscriptBootstrapService
from application.writing_service import WritingService
from application.ports import ContentHashMismatchError, RevisionNotFoundError
from application.revision_analysis_service import RevisionAnalysisService
from domain.errors import (
    ContextRoutingUnresolvedError,
    IdempotencyConflictError,
    BaselineReviewRequiredError,
    BootstrapLimitExceededError,
    OptimisticLockError,
    ProposalAlreadyDecidedError,
    SelectionOutOfBoundsError,
    WritingGenerationNotFoundError,
)
from domain.projection import ProjectionError


router = APIRouter(prefix="/v1", tags=["narrative-memory"], dependencies=[Depends(require_service_token)])
internal_router = APIRouter(prefix="/internal/v1", tags=["internal-writing"], dependencies=[Depends(require_service_token)])



@router.get("/story-brains/by-novel/{novel_id}")
def get_story_brain_by_novel(
    novel_id: str,
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    return {
        "data": service.get_story_brain_summary(novel_id),
        "meta": {"schema_version": 1},
    }


@router.post("/story-brains/bootstrap/from-manuscript", status_code=202)
def bootstrap_from_manuscript(
    payload: ManuscriptBootstrapRequest,
    background_tasks: BackgroundTasks,
    tenant_id: str = Header(..., alias="X-Tenant-Id"),
    request_id: str = Header(..., alias="X-Request-Id"),
    service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    try:
        job = service.start(
            tenant_id=tenant_id,
            novel_id=payload.novel_id,
            revisions=[item.model_dump() for item in payload.revisions],
            locale=payload.locale,
            options=payload.options.model_dump(),
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(404, detail={"code": "REVISION_NOT_FOUND"}) from exc
    except ContentHashMismatchError as exc:
        raise HTTPException(422, detail={"code": "CONTENT_HASH_MISMATCH"}) from exc
    except BootstrapLimitExceededError as exc:
        raise HTTPException(
            422, detail={"code": "BOOTSTRAP_LIMIT_EXCEEDED", "details": exc.details}
        ) from exc
    if job.status not in {"waiting_review", "completed"}:
        background_tasks.add_task(service.process, job.job_id)
    return {
        "data": {
            "job_id": job.job_id,
            "story_brain_id": payload.novel_id,
            "status": job.status,
        },
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@router.post("/story-brains/bootstrap/from-idea", status_code=202)
def bootstrap_from_idea(
    payload: IdeaBootstrapRequest,
    tenant_id: str = Header(..., alias="X-Tenant-Id"),
    request_id: str = Header(..., alias="X-Request-Id"),
    service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    try:
        job = service.start_from_idea(
            tenant_id=tenant_id,
            novel_id=payload.novel_id,
            idea=payload.idea,
            outline=payload.outline,
            locale=payload.locale,
            preferences=payload.preferences.model_dump(),
            author_constraints=payload.author_constraints,
        )
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "INVALID_IDEA", "message": str(exc)}) from exc
    return {
        "data": {
            "job_id": job.job_id,
            "story_brain_id": payload.novel_id,
            "status": job.status,
        },
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    request_id: str = Header(..., alias="X-Request-Id"),
    bootstrap_service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
    writing_service: WritingService = Depends(get_writing_service),
):
    try:
        job = bootstrap_service.get_job(job_id)
        data = asdict(job)
        data["type"] = "bootstrap"
        data["progress"] = {
            "current": job.progress_current,
            "total": len(job.revisions),
            "unit": "chapter",
            "stage": job.stage,
        }
        return {"data": data, "meta": {"request_id": request_id, "schema_version": 1}}
    except Exception:
        pass

    try:
        w_job = writing_service._repository.get_writing_job(job_id)
        data = asdict(w_job)
        data["type"] = "writing_generation"
        data["progress"] = {
            "stage": w_job.stage,
            "status": w_job.status,
        }
        return {"data": data, "meta": {"request_id": request_id, "schema_version": 1}}
    except Exception as exc:
        raise HTTPException(404, detail={"code": "JOB_NOT_FOUND"}) from exc


@router.get("/jobs/{job_id}/events")
async def stream_job_events(
    job_id: str,
    writing_service: WritingService = Depends(get_writing_service),
    bootstrap_service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    async def event_generator():
        for _ in range(60):
            try:
                w_job = writing_service._repository.get_writing_job(job_id)
                payload = {
                    "job_id": w_job.job_id,
                    "type": "writing_generation",
                    "status": w_job.status,
                    "stage": w_job.stage,
                    "validation_status": w_job.validation_status,
                }
                yield f"event: update\ndata: {json.dumps(payload)}\n\n"
                if w_job.status in ("completed", "failed"):
                    yield f"event: done\ndata: {json.dumps(payload)}\n\n"
                    break
            except Exception:
                try:
                    b_job = bootstrap_service.get_job(job_id)
                    payload = {
                        "job_id": b_job.job_id,
                        "type": "bootstrap",
                        "status": b_job.status,
                        "stage": b_job.stage,
                    }
                    yield f"event: update\ndata: {json.dumps(payload)}\n\n"
                    if b_job.status in ("completed", "failed", "waiting_review"):
                        yield f"event: done\ndata: {json.dumps(payload)}\n\n"
                        break
                except Exception:
                    yield f"event: error\ndata: {json.dumps({'code': 'JOB_NOT_FOUND'})}\n\n"
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/jobs/{job_id}/resume", status_code=202)
def resume_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    try:
        job = service.get_job(job_id)
    except KeyError as exc:
        raise HTTPException(404, detail={"code": "JOB_NOT_FOUND"}) from exc
    if job.status not in {"waiting_review", "completed"}:
        background_tasks.add_task(service.resume, job_id)
    return {"data": {"job_id": job_id, "status": job.status}, "meta": {"request_id": request_id}}


@router.get("/story-brains/{brain_id}/review-queue")
def get_review_queue(
    brain_id: str,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    return {
        "data": service.review_queue(brain_id),
        "meta": {"request_id": request_id, "next_cursor": None},
    }


@router.post("/story-brains/{brain_id}/baseline/activate")
def activate_baseline(
    brain_id: str,
    payload: BaselineActivationRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: ManuscriptBootstrapService = Depends(get_bootstrap_service),
):
    try:
        result = service.activate_baseline(brain_id, payload.job_id)
    except KeyError as exc:
        raise HTTPException(404, detail={"code": "JOB_NOT_FOUND"}) from exc
    except BaselineReviewRequiredError as exc:
        raise HTTPException(
            409,
            detail={
                "code": "BASELINE_REVIEW_REQUIRED",
                "pending_proposal_ids": exc.pending_proposal_ids,
            },
        ) from exc
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


@router.post("/story-brains/{brain_id}/entities/merge")
def merge_entities(
    brain_id: str,
    payload: EntityMergeRequest,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = service.merge_entities(
            brain_id,
            payload.source_entity_id,
            payload.target_entity_id,
            payload.expected_brain_version,
        )
    except KeyError as exc:
        raise HTTPException(404, detail={"code": "ENTITY_NOT_FOUND"}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(409, detail={"code": "BRAIN_VERSION_CONFLICT"}) from exc
    except ValueError as exc:
        raise HTTPException(400, detail={"code": "INVALID_ENTITY_MERGE", "message": str(exc)}) from exc
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


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
    background_tasks: BackgroundTasks,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
    semantic_materializer = Depends(get_semantic_materializer),
):
    try:
        story_id, _ = service.resolve_proposal_novel(proposal_id)
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
    if semantic_materializer is not None:
        background_tasks.add_task(
            refresh_semantic_memory_safely,
            semantic_materializer,
            story_id,
        )
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
    background_tasks: BackgroundTasks,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
    semantic_materializer = Depends(get_semantic_materializer),
):
    try:
        story_id, _ = service.resolve_proposal_novel(proposal_id)
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
    if semantic_materializer is not None:
        background_tasks.add_task(
            refresh_semantic_memory_safely,
            semantic_materializer,
            story_id,
        )
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


@router.post("/proposal-groups/{group_id}/accept")
def accept_proposal_group(
    group_id: str,
    payload: ProposalGroupAcceptRequest,
    background_tasks: BackgroundTasks,
    request_id: str = Header(..., alias="X-Request-Id"),
    service: NarrativeApplicationService = Depends(get_narrative_service),
    semantic_materializer = Depends(get_semantic_materializer),
):
    try:
        story_id, _ = service.resolve_proposal_group_novel(group_id)
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
    if semantic_materializer is not None:
        background_tasks.add_task(
            refresh_semantic_memory_safely,
            semantic_materializer,
            story_id,
        )
    return {"data": result, "meta": {"request_id": request_id, "schema_version": 1}}


# ──────────────────────────────────────────────
#  Writing Loop Endpoints (P6)
# ──────────────────────────────────────────────

@router.get("/story-brains/{brain_id}/context-preview")
def preview_writing_context(
    brain_id: str,
    chapter_number: int | None = Query(None),
    character_name: str | None = Query(None),
    token_budget: int | None = Query(None),
    tenant_id: str = Header(..., alias="X-Tenant-Id"),
    request_id: str = Header(..., alias="X-Request-Id"),
    service: WritingService = Depends(get_writing_service),
):
    try:
        package = service.preview_context(
            tenant_id=tenant_id,
            story_id=brain_id,
            chapter_number=chapter_number,
            character_name=character_name,
            token_budget=token_budget,
        )
    except ContextRoutingUnresolvedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CONTEXT_SCOPE_EXCEEDS_MAX_TIER",
                "message": str(exc),
                "details": dict(exc.details),
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=404, detail={"code": "STORY_BRAIN_NOT_FOUND", "message": str(exc)}) from exc

    return {
        "data": asdict(package),
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@router.post("/writing/generations", status_code=202)
def create_writing_generation(
    payload: WritingGenerationRequest,
    background_tasks: BackgroundTasks,
    tenant_id: str = Header(..., alias="X-Tenant-Id"),
    request_id: str = Header(..., alias="X-Request-Id"),
    service: WritingService = Depends(get_writing_service),
):
    try:
        selection_dict = payload.selection.model_dump()
        job = service.start_generation(
            tenant_id=tenant_id,
            novel_id=payload.novel_id,
            chapter_id=payload.chapter_id,
            revision_id=payload.revision_id,
            content_hash=payload.content_hash,
            operation=payload.operation,
            selection=selection_dict,
            instruction=payload.instruction,
            constraints=payload.constraints,
            style=payload.style,
            expected_brain_version=payload.expected_brain_version,
            chapter_number=payload.chapter_number,
            actor_id=payload.actor_id,
            idempotency_key=payload.idempotency_key,
            process_inline=False,
        )
    except SelectionOutOfBoundsError as exc:
        raise HTTPException(422, detail={"code": "SELECTION_OUT_OF_BOUNDS", "message": str(exc)}) from exc
    except ContentHashMismatchError as exc:
        raise HTTPException(409, detail={"code": "CONTENT_HASH_MISMATCH", "message": str(exc)}) from exc
    except IdempotencyConflictError as exc:
        raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": str(exc)}) from exc
    except OptimisticLockError as exc:
        raise HTTPException(409, detail={"code": "OPTIMISTIC_LOCK_CONFLICT", "message": str(exc)}) from exc
    except Exception as exc:
        raise HTTPException(400, detail={"code": "GENERATION_REQUEST_FAILED", "message": str(exc)}) from exc

    if job.status not in ("completed", "failed"):
        background_tasks.add_task(service.process_generation, job.job_id)

    return {
        "data": asdict(job),
        "meta": {"request_id": request_id, "schema_version": 1},
    }


@internal_router.post(
    "/story-brains/{brain_id}/semantic-memory/rebuild",
    status_code=202,
)
def rebuild_semantic_memory(
    brain_id: str,
    background_tasks: BackgroundTasks,
    semantic_materializer = Depends(get_semantic_materializer),
):
    if semantic_materializer is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "SEMANTIC_MEMORY_DISABLED"},
        )
    background_tasks.add_task(
        refresh_semantic_memory_safely,
        semantic_materializer,
        brain_id,
    )
    return {
        "data": {
            "story_brain_id": brain_id,
            "status": "queued",
        }
    }


# ──────────────────────────────────────────────
#  Internal Server-to-Server Writing API (Platform Trust Contract)
# ──────────────────────────────────────────────

@internal_router.get("/writing/generations/{generation_id}")
def get_internal_writing_generation(
    generation_id: str,
    service: WritingService = Depends(get_writing_service),
):
    try:
        job = service._repository.get_writing_job(generation_id)
    except Exception as exc:
        raise HTTPException(404, detail={"code": "GENERATION_NOT_FOUND", "message": str(exc)}) from exc

    return {
        "data": {
            "job_id": job.job_id,
            "novel_id": job.novel_id,
            "chapter_id": job.chapter_id,
            "revision_id": job.revision_id,
            "content_hash": job.content_hash,
            "operation": job.operation,
            "draft": job.draft,
            "patch": asdict(job.patch) if job.patch else None,
            "validation_status": job.validation_status,
            "validations": [asdict(v) for v in job.validations],
            "status": job.status,
            "brain_version_used": job.brain_version_used,
            "context_hash": job.context_hash,
            "chapter_number": job.chapter_number,
        }
    }


@internal_router.get("/proposals/{proposal_id}/novel")
def resolve_proposal_novel(
    proposal_id: str,
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        novel_id, proposal = service.resolve_proposal_novel(proposal_id)
        return {"data": {"novel_id": str(novel_id), "proposal_id": proposal.proposal_id}}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_NOT_FOUND"}) from exc


@internal_router.get("/proposal-groups/{group_id}/novel")
def resolve_proposal_group_novel(
    group_id: str,
    service: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        novel_id, proposals = service.resolve_proposal_group_novel(group_id)
        return {
            "data": {
                "novel_id": str(novel_id),
                "group_id": group_id,
                "proposal_ids": [p.proposal_id for p in proposals],
            }
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "PROPOSAL_GROUP_NOT_FOUND"}) from exc

