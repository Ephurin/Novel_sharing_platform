"""
API routes cho AI Service.

Sau refactor:
- Schemas đã được tách ra api/schemas.py
- Services được inject qua api/deps.py (FastAPI Depends)
- Logic chuyển đổi entity dùng chung từ services/entity_helpers.py
- Route functions chỉ làm nhiệm vụ orchestration: nhận request → gọi service → trả response
"""

import time
import logging

from fastapi import APIRouter, Depends, HTTPException

from application.narrative_service import NarrativeApplicationService
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
    get_story_kb,
    get_candidate_processor,
    get_span_expander,
    require_llm_service,
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


router = APIRouter(prefix="/v1/ai", tags=["ai"])
logger = logging.getLogger(__name__)


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

@router.post("/suggest-next", response_model=SuggestNextResponse)
def suggest_next(
    payload: SuggestNextRequest,
    llm_service=Depends(require_llm_service),
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
    engine: ConsistencyEngine = Depends(get_consistency_engine),
) -> SuggestNextResponse:
    started = time.perf_counter()

    graph_context = narrative.story_context(
        payload.story_id, payload.character_name, limit=payload.graph_limit
    )
    graph_data = narrative.consistency_data(
        payload.story_id, payload.character_name
    )

    attempts = 0
    regenerated = False
    final_suggestions: list[str] = []
    final_validations: list[dict] = []
    conflict_detected = False
    current_text_for_attempt = payload.current_text

    for attempt in range(1, payload.max_regenerations + 2):
        attempts = attempt

        try:
            generated = llm_service.generate_suggestion(
                current_text=current_text_for_attempt,
                graph_context=graph_context,
                mood=payload.mood,
            )
        except LLMServiceError:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        suggestions = generated.get("suggestions", []) if isinstance(generated, dict) else []
        final_suggestions = [str(item).strip() for item in suggestions if str(item).strip()]
        final_validations = []
        conflict_messages: list[str] = []
        conflict_detected = False

        for suggestion in final_suggestions:
            result = engine.validate_suggestion(suggestion, graph_data)
            errors = result.get("errors", []) if isinstance(result, dict) else []

            normalized_errors: list[dict[str, str]] = []
            for error in errors:
                code = str(error.get("code", "UNKNOWN_CONFLICT"))
                message = str(error.get("message", "Consistency conflict detected"))
                normalized_errors.append({"code": code, "message": message})
                conflict_messages.append(message)

            if result.get("regenerate_required", False):
                conflict_detected = True

            final_validations.append(
                {
                    "suggestion": suggestion,
                    "is_consistent": bool(result.get("is_consistent", False)),
                    "action": str(result.get("action", "Regenerate")),
                    "errors": normalized_errors,
                }
            )

        if not conflict_detected:
            break

        if attempt <= payload.max_regenerations:
            regenerated = True
            unique_conflicts = list(dict.fromkeys(conflict_messages))
            conflict_text = "; ".join(unique_conflicts) if unique_conflicts else "Tranh mau thuan voi graph data"
            current_text_for_attempt = (
                payload.current_text
                + "\n\nRang buoc nhat quan bat buoc: "
                + conflict_text
                + ". Hay tao lai 3 huong di tiep theo khong mau thuan voi graph data."
            )
            continue

        regenerated = True
        break

    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)
    status = "accepted" if not conflict_detected else "conflict_after_max_regenerate"

    logger.info(
        "suggest-next completed: character=%s attempts=%d regenerated=%s status=%s time_ms=%.3f",
        payload.character_name,
        attempts,
        regenerated,
        status,
        processing_ms,
    )

    return SuggestNextResponse(
        character_name=payload.character_name,
        graph_context=graph_context,
        suggestions=final_suggestions,
        validations=final_validations,
        attempts=attempts,
        regenerated=regenerated,
        status=status,
        processing_ms=processing_ms,
    )


# ──────────────────────────────────────────────
#  POST /sync-story
# ──────────────────────────────────────────────

@router.post("/sync-story", response_model=SyncStoryResponse)
def sync_story(
    payload: SyncStoryRequest,
    pipeline: EntityPipeline = Depends(get_entity_pipeline),
    llm_service=Depends(get_llm_service),
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
) -> SyncStoryResponse:
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

@router.post("/kb/confirm", response_model=ConfirmKBResponse)
def confirm_kb(
    payload: ConfirmKBRequest,
    kb: StoryKBManager = Depends(get_story_kb),
    llm_service=Depends(get_llm_service),
) -> ConfirmKBResponse:
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
