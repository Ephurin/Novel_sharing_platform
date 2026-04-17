import time
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from core.llm_service import LLMServiceError


router = APIRouter(prefix="/v1/ai", tags=["ai"])
logger = logging.getLogger(__name__)


class ExtractEntitiesRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Raw paragraph text")

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("text must not be empty")
        return value.strip()


class EntityOut(BaseModel):
    Entity: str
    Label: str
    Score: float


class ConsistencyWarning(BaseModel):
    code: str
    message: str


class ExtractEntitiesResponse(BaseModel):
    entities: list[EntityOut]
    warnings: list[ConsistencyWarning] = []
    processing_ms: float


class GraphLookupRequest(BaseModel):
    entity: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=100)


class GraphRelationOut(BaseModel):
    name: str
    relation: str


class GraphLookupResponse(BaseModel):
    entity: str
    related: list[GraphRelationOut]


class LLMGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=256, ge=16, le=2048)


class LLMGenerateResponse(BaseModel):
    output: str


class SuggestNextRequest(BaseModel):
    character_name: str = Field(..., min_length=1)
    current_text: str = Field(..., min_length=1)
    max_regenerations: int = Field(default=2, ge=0, le=5)
    graph_limit: int = Field(default=50, ge=1, le=200)

    @field_validator("character_name", "current_text")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("value must not be empty")
        return value.strip()


class SuggestionValidationOut(BaseModel):
    suggestion: str
    is_consistent: bool
    action: str
    errors: list[ConsistencyWarning] = Field(default_factory=list)


class SuggestNextResponse(BaseModel):
    character_name: str
    graph_context: str
    suggestions: list[str]
    validations: list[SuggestionValidationOut]
    attempts: int
    regenerated: bool
    status: str
    processing_ms: float


class SyncStoryRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    story_content: str = Field(..., min_length=1)

    @field_validator("story_id", "story_content")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("value must not be empty")
        return value.strip()


class SyncStoryEntityOut(BaseModel):
    word: str
    entity: str
    score: float


class SyncStoryDBStatusOut(BaseModel):
    entity: str
    label: str
    story_id: str
    status: str
    reason: str | None = None


class SyncStoryResponse(BaseModel):
    story_id: str
    extracted_entities: list[SyncStoryEntityOut]
    db_updates: list[SyncStoryDBStatusOut]
    updated_count: int
    failed_count: int
    processing_ms: float


@router.post("/extract-entities", response_model=ExtractEntitiesResponse)
def extract_entities(payload: ExtractEntitiesRequest, request: Request) -> ExtractEntitiesResponse:
    started = time.perf_counter()
    try:
        entities = request.app.state.ner_engine.extract_entities(payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    warnings = request.app.state.consistency_checker.check_entities(payload.text, entities)
    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    return ExtractEntitiesResponse(
        entities=entities,
        warnings=warnings,
        processing_ms=processing_ms,
    )


@router.post("/graph/related", response_model=GraphLookupResponse)
def graph_related(payload: GraphLookupRequest, request: Request) -> GraphLookupResponse:
    related = request.app.state.graph_db.get_related_entities(payload.entity, payload.limit)
    return GraphLookupResponse(entity=payload.entity, related=related)


@router.post("/llm/generate", response_model=LLMGenerateResponse)
def llm_generate(payload: LLMGenerateRequest, request: Request) -> LLMGenerateResponse:
    try:
        output = request.app.state.llm_client.generate(
            prompt=payload.prompt,
            system_prompt=payload.system_prompt,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
        return LLMGenerateResponse(output=output)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/suggest-next", response_model=SuggestNextResponse)
def suggest_next(payload: SuggestNextRequest, request: Request) -> SuggestNextResponse:
    started = time.perf_counter()

    llm_service = getattr(request.app.state, "llm_service", None)
    if llm_service is None:
        raise HTTPException(status_code=503, detail="LLMService is not initialized")

    graph_context = request.app.state.graph_manager.get_story_context(payload.character_name, limit=payload.graph_limit)
    graph_data = request.app.state.graph_manager.get_consistency_graph_data(
        payload.character_name,
        limit=payload.graph_limit,
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
            result = request.app.state.consistency_engine.validate_suggestion(suggestion, graph_data)
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


@router.post("/sync-story", response_model=SyncStoryResponse)
def sync_story(payload: SyncStoryRequest, request: Request) -> SyncStoryResponse:
    started = time.perf_counter()

    try:
        entities = request.app.state.ner_model.predict(payload.story_content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db_updates: list[dict] = []
    for entity in entities:
        result = request.app.state.graph_db.upsert_entity(entity, payload.story_id)
        db_updates.append(result)

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

    normalized_updates: list[dict] = []
    for item in db_updates:
        normalized_updates.append(
            {
                "entity": str(item.get("entity", "")),
                "label": str(item.get("label", "")),
                "story_id": str(item.get("story_id", payload.story_id)),
                "status": str(item.get("status", "unknown")),
                "reason": str(item.get("reason")) if item.get("reason") is not None else None,
            }
        )

    return SyncStoryResponse(
        story_id=payload.story_id,
        extracted_entities=entities,
        db_updates=normalized_updates,
        updated_count=updated_count,
        failed_count=failed_count,
        processing_ms=processing_ms,
    )