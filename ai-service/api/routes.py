"""
API routes cho AI Service.

Sau refactor:
- Schemas đã được tách ra api/schemas.py
- Services được inject qua api/deps.py (FastAPI Depends)
- Logic chuyển đổi entity dùng chung từ services/entity_helpers.py
- Route functions chỉ làm nhiệm vụ orchestration: nhận request → gọi service → trả response
"""

import hashlib
import time
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response

from application.narrative_service import NarrativeApplicationService
from application.writing_service import WritingService
from api.schemas import (
    AnalyzeChapterRequest,
    AnalyzeChapterResponse,
    ConfirmKBRequest,
    ConfirmKBResponse,
    ExtractEntitiesRequest,
    ExtractEntitiesResponse,
    GraphLookupRequest,
    GraphLookupResponse,
    LLMGenerateRequest,
    LLMGenerateResponse,
    SuggestNextRequest,
    SuggestNextResponse,
    SuggestionValidationOut,
    SyncStoryRequest,
    SyncStoryResponse,
)
from api.deps import (
    get_consistency_checker,
    get_consistency_engine,
    get_entity_pipeline,
    get_llm_client,
    get_llm_service,
    get_narrative_service,
    get_writing_service,
    get_story_kb,
    get_candidate_processor,
    get_span_expander,
    require_llm_service,
    require_service_token,
)
from core.consistency import ConsistencyChecker, ConsistencyEngine
from core.candidate_processor import CandidateProcessor
from core.llm_service import LLMServiceError
from core.span_expander import SpanExpander
from core.story_kb_manager import StoryKBManager
from core.exceptions import EntityExtractionError, EventExtractionError, StateExtractionError
from services.entity_pipeline.pipeline import EntityPipeline
from services.entity_helpers import (
    pipeline_to_entity_out,
    pipeline_to_sync_format,
    normalize_db_updates,
)
from services.event_summarizer import extract_narrative_events
from services.world_state_updater import update_world_state


router = APIRouter(prefix="/v1/ai", tags=["ai"], dependencies=[Depends(require_service_token)])

logger = logging.getLogger(__name__)

LEGACY_REVISION_SUCCESSOR = '</v1/revisions/{revision_id}/analyses>; rel="successor-version"'
LEGACY_WRITING_SUCCESSOR = '</v1/writing/generations>; rel="successor-version"'
LEGACY_BOOTSTRAP_SUCCESSOR = '</v1/story-brains/bootstrap/from-manuscript>; rel="successor-version"'


def _mark_deprecated(response: Response, successor: str) -> None:
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = successor


# ──────────────────────────────────────────────
#  POST /extract-entities
# ──────────────────────────────────────────────

@router.post("/extract-entities", response_model=ExtractEntitiesResponse)
def extract_entities(
    payload: ExtractEntitiesRequest,
    pipeline: EntityPipeline = Depends(get_entity_pipeline),
    llm_service=Depends(get_llm_service),
    checker: ConsistencyChecker = Depends(get_consistency_checker),
) -> ExtractEntitiesResponse:
    started = time.perf_counter()

    try:
        raw_results = pipeline.run(payload.text, llm_service=llm_service)
    except EntityExtractionError:
        raise
    except Exception as exc:
        logger.error("Hybrid pipeline failed in extract-entities: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    entities = pipeline_to_entity_out(raw_results)
    warnings = checker.check_entities(payload.text, entities)
    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    return ExtractEntitiesResponse(
        entities=entities,
        warnings=warnings,
        processing_ms=processing_ms,
    )


# ──────────────────────────────────────────────
#  POST /graph/related
# ──────────────────────────────────────────────

@router.post("/graph/related", response_model=GraphLookupResponse)
def graph_related(
    payload: GraphLookupRequest,
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
) -> GraphLookupResponse:
    related = narrative.related_entities("default_story", payload.entity, payload.limit)
    return GraphLookupResponse(entity=payload.entity, related=related)


# ──────────────────────────────────────────────
#  POST /llm/generate
# ──────────────────────────────────────────────

@router.post("/llm/generate", response_model=LLMGenerateResponse)
def llm_generate(
    payload: LLMGenerateRequest,
    llm_client=Depends(get_llm_client),
) -> LLMGenerateResponse:
    try:
        output = llm_client.generate(
            prompt=payload.prompt,
            system_prompt=payload.system_prompt,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
        return LLMGenerateResponse(output=output)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ──────────────────────────────────────────────
#  POST /suggest-next
# ──────────────────────────────────────────────

@router.post("/suggest-next", response_model=SuggestNextResponse, deprecated=True)
def suggest_next(
    payload: SuggestNextRequest,
    response: Response,
    llm_service=Depends(get_llm_service),
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
    engine: ConsistencyEngine = Depends(get_consistency_engine),
    writing_service: WritingService = Depends(get_writing_service),
) -> SuggestNextResponse:
    # Phase 6.5/P8-03 deprecation contract
    _mark_deprecated(response, LEGACY_WRITING_SUCCESSOR)
    if llm_service is None:
        raise HTTPException(
            status_code=503,
            detail="LLMService is not initialized",
            headers={
                "Deprecation": "true",
                "Link": LEGACY_WRITING_SUCCESSOR,
            },
        )
    started = time.perf_counter()

    # Unified generation via WritingService (Phase 6.5 consolidation)
    try:
        content_hash = hashlib.sha256(payload.current_text.encode("utf-8")).hexdigest()
        tenant_id = "00000000-0000-0000-0000-000000000001"
        brain = writing_service._repository.get_story_brain(payload.story_id)
        expected_brain_version = int(brain.metadata.get("brain_version", "1")) if brain else 1
        job = writing_service.start_generation(
            tenant_id=tenant_id,
            novel_id=payload.story_id,
            chapter_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"chapter:{payload.story_id}")),
            revision_id=f"ephemeral:{content_hash}",
            content_hash=content_hash,
            source_text=payload.current_text,
            operation="continue",
            selection={
                "start": 0,
                "end": len(payload.current_text),
                "cursor": len(payload.current_text),
            },
            instruction=f"Tiếp tục đoạn văn cho nhân vật {payload.character_name} với mood {payload.mood}",
            style={"mood": payload.mood},
            expected_brain_version=expected_brain_version,
            process_inline=True,
        )

        suggestion_text = job.draft or ""
        suggestions = [suggestion_text] if suggestion_text else []
        validations: list[SuggestionValidationOut] = []
        is_consistent = job.validation_status in ("passed", "pending")
        if job.validations:
            for v in job.validations:
                if isinstance(v, dict):
                    code = str(v.get("code") or v.get("check_type") or "CONSISTENCY_CHECK")
                    msg = str(v.get("message", "Validation result"))
                    passed = bool(v.get("passed", True))
                else:
                    code = str(getattr(v, "code", "") or getattr(v, "validator", "CONSISTENCY_CHECK"))
                    msg = str(getattr(v, "message", "Validation result"))
                    passed = bool(getattr(v, "passed", True))
                errs = [{"code": code, "message": msg}] if not passed else []
                validations.append(
                    SuggestionValidationOut(
                        suggestion=suggestion_text,
                        is_consistent=passed,
                        action="Accept" if passed else "Regenerate",
                        errors=errs,
                    )
                )
        else:
            validations.append(
                SuggestionValidationOut(
                    suggestion=suggestion_text,
                    is_consistent=is_consistent,
                    action="Accept" if is_consistent else "Regenerate",
                    errors=[],
                )
            )

        graph_context = narrative.story_context(
            payload.story_id, payload.character_name, limit=payload.graph_limit
        )
        processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

        return SuggestNextResponse(
            character_name=payload.character_name,
            graph_context=graph_context,
            suggestions=suggestions,
            validations=validations,
            attempts=1,
            regenerated=False,
            status="accepted" if is_consistent else "conflict_detected",
            processing_ms=processing_ms,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("WritingService generation failed for suggest-next: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"code": "SUGGEST_NEXT_FAILED", "message": f"WritingService generation failed: {exc}"},
        ) from exc



# ──────────────────────────────────────────────
#  POST /sync-story
# ──────────────────────────────────────────────

@router.post("/sync-story", response_model=SyncStoryResponse, deprecated=True)
def sync_story(
    payload: SyncStoryRequest,
    response: Response,
    pipeline: EntityPipeline = Depends(get_entity_pipeline),
    llm_service=Depends(get_llm_service),
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
) -> SyncStoryResponse:
    _mark_deprecated(response, LEGACY_BOOTSTRAP_SUCCESSOR)
    started = time.perf_counter()

    try:
        raw_results = pipeline.run(payload.story_content, llm_service=llm_service)
        entities = pipeline_to_sync_format(raw_results)
    except EntityExtractionError:
        raise
    except Exception as exc:
        logger.error("Hybrid pipeline failed in sync_story: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    db_updates = narrative.sync_entities(payload.story_id, entities)

    updated_count = sum(1 for item in db_updates if item.get("status") == "updated")
    failed_count = len(db_updates) - updated_count
    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    logger.info(
        "sync-story completed: story_id=%s entities=%d updated=%d failed=%d time_ms=%.3f",
        payload.story_id,
        len(entities),
        updated_count,
        failed_count,
        processing_ms,
    )

    return SyncStoryResponse(
        story_id=payload.story_id,
        extracted_entities=entities,
        db_updates=normalize_db_updates(db_updates, payload.story_id),
        updated_count=updated_count,
        failed_count=failed_count,
        processing_ms=processing_ms,
    )


# ──────────────────────────────────────────────
#  POST /analyze/chapter
# ──────────────────────────────────────────────

@router.post("/analyze/chapter", response_model=AnalyzeChapterResponse)
def analyze_chapter(
    payload: AnalyzeChapterRequest,
    pipeline: EntityPipeline = Depends(get_entity_pipeline),
    llm_service=Depends(get_llm_service),
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
    expander: SpanExpander = Depends(get_span_expander),
    processor: CandidateProcessor = Depends(get_candidate_processor),
) -> AnalyzeChapterResponse:
    started = time.perf_counter()

    try:
        raw_results = pipeline.run(payload.text, llm_service=llm_service)
        entities = pipeline_to_entity_out(raw_results)
    except EntityExtractionError:
        raise
    except Exception as exc:
        logger.error("Hybrid pipeline failed in analyze_chapter: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    known_locations = narrative.known_locations(payload.story_id)
    # The span expander might still be useful for boundary refinement
    expanded_entities = expander.expand_entities(payload.text, entities, extra_locations=known_locations)
    candidates = processor.process_entities(expanded_entities, payload.text)

    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    return AnalyzeChapterResponse(
        story_id=payload.story_id,
        candidates=candidates,
        processing_ms=processing_ms,
    )


# ──────────────────────────────────────────────
#  POST /kb/confirm
# ──────────────────────────────────────────────

@router.post("/kb/confirm", response_model=ConfirmKBResponse, deprecated=True)
def confirm_kb(
    payload: ConfirmKBRequest,
    response: Response,
    kb: StoryKBManager = Depends(get_story_kb),
    llm_service=Depends(get_llm_service),
) -> ConfirmKBResponse:
    _mark_deprecated(response, LEGACY_REVISION_SUCCESSOR)
    if kb.read_only:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "LEGACY_JSON_READ_ONLY",
                "message": (
                    "Legacy JSON write path is disabled in production; "
                    "use revision analysis and proposal review APIs"
                ),
            },
            headers={
                "Deprecation": "true",
                "Link": LEGACY_REVISION_SUCCESSOR,
            },
        )

    started = time.perf_counter()

    db_updates = []
    approved_entities_list = []
    for cand in payload.approved_candidates:
        entity_data = {
            "word": cand.raw_name,
            "entity": cand.type,
            "score": cand.confidence,
        }
        approved_entities_list.append({
            "normalized_name": cand.normalized_name,
            "raw_name": cand.raw_name,
            "type": cand.type,
        })

        try:
            result = kb.upsert_entity(payload.story_id, entity_data)
            db_updates.append(result)
        except Exception as exc:
            logger.error("StoryKB write failed in /kb/confirm for %s: %s", payload.story_id, exc)
            db_updates.append({
                "entity": cand.raw_name,
                "label": cand.type,
                "story_id": payload.story_id,
                "status": "failed",
                "reason": str(exc),
            })

    # Load StoryKB object to process new events and states
    kb_obj = kb.load_kb(payload.story_id)

    # If text is provided, perform event extraction & world state update
    if payload.text and payload.text.strip():
        try:
            new_events = extract_narrative_events(
                text=payload.text,
                approved_entities=approved_entities_list,
                llm_service=llm_service
            )
            for event in new_events:
                kb_obj.event_history.append(event)
                kb_obj.current_world_state = update_world_state(
                    current_state=kb_obj.current_world_state,
                    event=event,
                    llm_service=llm_service
                )
            
            # Save the updated KB back to storage
            kb.save_kb(payload.story_id, kb_obj)
        except (EventExtractionError, StateExtractionError):
            raise
        except Exception as exc:
            logger.error("Event/State processing failed in /kb/confirm: %s", exc)

    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    return ConfirmKBResponse(
        story_id=payload.story_id,
        db_updates=db_updates,
        event_history=kb_obj.event_history,
        current_world_state=kb_obj.current_world_state,
        processing_ms=processing_ms,
    )
