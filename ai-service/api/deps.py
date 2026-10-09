"""
FastAPI Dependency Injection helpers.

Mỗi hàm ở đây lấy một service từ app.state và trả về.
Route functions sử dụng qua `Depends(get_xxx)` để:
- Khai báo rõ ràng các phụ thuộc
- Dễ dàng mock khi viết Unit Test
- Tránh truy cập request.app.state rải rác khắp nơi
"""

from fastapi import Depends, Header, HTTPException, Request

from application.narrative_service import NarrativeApplicationService
from application.revision_analysis_service import RevisionAnalysisService
from application.bootstrap_service import ManuscriptBootstrapService
from application.writing_service import WritingService
from core.consistency import ConsistencyChecker, ConsistencyEngine
from core.story_kb_manager import StoryKBManager
from core.candidate_processor import CandidateProcessor
from core.span_expander import SpanExpander
from services.entity_pipeline.pipeline import EntityPipeline


def get_entity_pipeline(request: Request) -> EntityPipeline:
    return request.app.state.entity_pipeline


def get_consistency_checker(request: Request) -> ConsistencyChecker:
    return request.app.state.consistency_checker


def get_consistency_engine(request: Request) -> ConsistencyEngine:
    return request.app.state.consistency_engine


def get_story_kb(request: Request) -> StoryKBManager:
    return request.app.state.story_kb


def get_narrative_service(request: Request) -> NarrativeApplicationService:
    return request.app.state.narrative_service


def get_narrative_repository(request: Request):
    return request.app.state.narrative_repository


def get_revision_analysis_service(request: Request) -> RevisionAnalysisService:
    return request.app.state.revision_analysis_service


def get_bootstrap_service(request: Request) -> ManuscriptBootstrapService:
    return request.app.state.bootstrap_service


def get_writing_service(request: Request) -> WritingService:
    return request.app.state.writing_service


def get_semantic_materializer(request: Request):
    return getattr(request.app.state, "semantic_materializer", None)


def get_candidate_processor(request: Request) -> CandidateProcessor:
    return request.app.state.candidate_processor


def get_span_expander(request: Request) -> SpanExpander:
    return request.app.state.span_expander


def get_llm_client(request: Request):
    """Returns the raw LLM client. Raises 503 if not available."""
    return request.app.state.llm_client


def get_llm_service(request: Request):
    """Returns the LLM service (for suggestions, event extraction, etc.).
    Returns None if not initialized — callers must handle this case.
    """
    return getattr(request.app.state, "llm_service", None)


def require_llm_service(request: Request):
    """Same as get_llm_service but raises 503 if not available.
    Use for endpoints that absolutely require LLM.
    """
    svc = getattr(request.app.state, "llm_service", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="LLMService is not initialized")
    return svc


def get_settings(request: Request):
    return getattr(request.app.state, "settings", None)


def require_service_token(
    request: Request,
    authorization: str | None = Header(None),
    x_service_token: str | None = Header(None, alias="X-Service-Token"),
    x_internal_service_key: str | None = Header(None, alias="X-Internal-Service-Key"),
) -> None:
    get_s = getattr(request.app, "dependency_overrides", {}).get(get_settings, get_settings)
    if callable(get_s):
        try:
            settings = get_s(request)
        except TypeError:
            settings = get_s()
    else:
        settings = getattr(request.app.state, "settings", None)
    if settings is None:
        try:
            from core.settings import Settings
            settings = Settings.from_env()
        except Exception:
            settings = None
    service_auth_disabled = getattr(settings, "service_auth_disabled", False) if settings else False
    if service_auth_disabled:
        return

    expected_token = getattr(settings, "platform_service_token", "") if settings else ""
    if not expected_token:
        raise HTTPException(
            status_code=503,
            detail={"code": "SERVICE_AUTH_NOT_CONFIGURED", "message": "Service authentication is not configured on AI Service"},
        )
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif x_service_token:
        token = x_service_token.strip()
    elif x_internal_service_key:
        token = x_internal_service_key.strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "SERVICE_AUTH_REQUIRED", "message": "Service token required"},
        )
    if token != expected_token:
        raise HTTPException(
            status_code=403,
            detail={"code": "SERVICE_AUTH_INVALID", "message": "Invalid service token"},
        )


