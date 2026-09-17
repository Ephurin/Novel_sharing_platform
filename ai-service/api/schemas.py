"""
Pydantic schemas cho tất cả API endpoints.

Tập trung toàn bộ request/response models tại đây để:
- routes.py chỉ chứa logic xử lý
- Dễ tìm kiếm và chỉnh sửa cấu trúc dữ liệu
- Tái sử dụng models giữa các router
"""

from pydantic import BaseModel, Field, field_validator

from core.candidate_processor import Candidate
from core.story_kb_manager import EventHistoryEntry, CurrentWorldState


# ──────────────────────────────────────────────
#  Shared / Reusable schemas
# ──────────────────────────────────────────────

class ConsistencyWarning(BaseModel):
    code: str
    message: str


class RevisionAnalysisOptions(BaseModel):
    extract_entities: bool = True
    extract_events: bool = True
    extract_state_transitions: bool = False
    check_consistency: bool = True
    build_embeddings: bool = False


class RevisionAnalysisRequest(BaseModel):
    novel_id: str = Field(..., min_length=1)
    chapter_id: str = Field(..., min_length=1)
    content_hash: str = Field(..., min_length=64, max_length=64)
    operation: str = "incremental_story_analysis"
    base_revision_id: str | None = None
    options: RevisionAnalysisOptions = Field(default_factory=RevisionAnalysisOptions)


class ProposalDecisionRequest(BaseModel):
    expected_brain_version: int = Field(..., ge=1)


class ProposalRejectRequest(BaseModel):
    reason: str | None = None


class ProposalEditAcceptRequest(ProposalDecisionRequest):
    edited_payload: dict
    reason: str | None = None


class ProposalGroupAcceptRequest(ProposalDecisionRequest):
    proposal_ids: list[str] = Field(..., min_length=1)
    reason: str | None = None


class CorrectionEventPayload(BaseModel):
    event_type: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    participants: list[str] = Field(default_factory=list)
    chapter: int = Field(default=1, ge=1)


class CorrectionTransitionPayload(BaseModel):
    entity_id: str = Field(min_length=1)
    attribute_key: str = Field(min_length=1, max_length=100)
    new_value: object


class EventCorrectionRequest(ProposalDecisionRequest):
    replacement: CorrectionEventPayload
    transitions: list[CorrectionTransitionPayload] = Field(default_factory=list)


# ──────────────────────────────────────────────
#  /extract-entities
# ──────────────────────────────────────────────

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


class ExtractEntitiesResponse(BaseModel):
    entities: list[EntityOut]
    warnings: list[ConsistencyWarning] = []
    processing_ms: float


# ──────────────────────────────────────────────
#  /graph/related
# ──────────────────────────────────────────────

class GraphLookupRequest(BaseModel):
    entity: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=100)


class GraphRelationOut(BaseModel):
    name: str
    relation: str


class GraphLookupResponse(BaseModel):
    entity: str
    related: list[GraphRelationOut]


# ──────────────────────────────────────────────
#  /llm/generate
# ──────────────────────────────────────────────

class LLMGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_prompt: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=256, ge=16, le=2048)


class LLMGenerateResponse(BaseModel):
    output: str


# ──────────────────────────────────────────────
#  /suggest-next
# ──────────────────────────────────────────────

class SuggestNextRequest(BaseModel):
    character_name: str = Field(..., min_length=1)
    current_text: str = Field(..., min_length=1)
    story_id: str = Field(default="default_story", min_length=1)
    mood: str = Field(default="neutral", description="Writing mood: romantic | tragic | comedic | dark | neutral")
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


# ──────────────────────────────────────────────
#  /sync-story
# ──────────────────────────────────────────────

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


# ──────────────────────────────────────────────
#  /analyze/chapter
# ──────────────────────────────────────────────

class AnalyzeChapterRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)


class AnalyzeChapterResponse(BaseModel):
    story_id: str
    candidates: list[Candidate]
    processing_ms: float


# ──────────────────────────────────────────────
#  /kb/confirm
# ──────────────────────────────────────────────

class ConfirmKBRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    approved_candidates: list[Candidate]
    text: str | None = None


class ConfirmKBResponse(BaseModel):
    story_id: str
    db_updates: list[dict]
    event_history: list[EventHistoryEntry] = []
    current_world_state: CurrentWorldState | None = None
    processing_ms: float


# ──────────────────────────────────────────────
#  /enhanced/process-interactions  (interactions.py)
# ──────────────────────────────────────────────

class ProcessInteractionsRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    use_existing_entities: bool = True


class RelationOverrideRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    subject: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)
    object: str = Field(..., min_length=1)
