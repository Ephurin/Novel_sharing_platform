"""
FastAPI Dependency Injection helpers.

Mỗi hàm ở đây lấy một service từ app.state và trả về.
Route functions sử dụng qua `Depends(get_xxx)` để:
- Khai báo rõ ràng các phụ thuộc
- Dễ dàng mock khi viết Unit Test
- Tránh truy cập request.app.state rải rác khắp nơi
"""

from fastapi import Depends, HTTPException, Request

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


def get_revision_analysis_service(request: Request) -> RevisionAnalysisService:
    return request.app.state.revision_analysis_service


def get_bootstrap_service(request: Request) -> ManuscriptBootstrapService:
    return request.app.state.bootstrap_service


def get_writing_service(request: Request) -> WritingService:
    return request.app.state.writing_service


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

