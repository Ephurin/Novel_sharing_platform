import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router, suggest_next
from api.interactions import router as interaction_router
from api.narrative_routes import router as narrative_router, internal_router as internal_narrative_router
from application.narrative_service import NarrativeApplicationService
from application.revision_analysis_service import RevisionAnalysisService
from application.bootstrap_service import ManuscriptBootstrapService
from application.writing_service import WritingService
from core.consistency import ConsistencyChecker, ConsistencyEngine
from core.llm_client import LLMClient, LLMClientError
from core.llm_service import LLMService, LLMServiceError
from core.exceptions import (
    AIServiceError,
    EntityExtractionError,
    EventExtractionError,
    KBWriteError,
    StateExtractionError,
)
from core.candidate_processor import CandidateProcessor
from core.span_expander import SpanExpander
from core.story_kb_manager import StoryKBManager
from core.settings import Settings
from infrastructure.repository_factory import build_narrative_repository
from infrastructure.revision_content_provider import build_revision_content_provider
from services.entity_pipeline.pipeline import EntityPipeline


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("ai-service")


BASE_DIR = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv

    loaded = load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
    if not loaded:
        load_dotenv(dotenv_path=BASE_DIR / ".evn", override=False)
except Exception:
    logger.warning("python-dotenv is unavailable or .env load failed; using existing environment variables")

settings = Settings.from_env()

app = FastAPI(
    title=settings.service_name,
    version=settings.service_version,
    description="Microservice for NER, graph context lookup, and LLM orchestration.",
)
app.state.settings = settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.state.llm_client = LLMClient(
    provider=settings.llm_provider,
    model=settings.llm_model,
    api_key="",
    timeout_seconds=settings.llm_timeout_seconds,
    base_url=settings.llm_base_url,
)
app.state.consistency_checker = ConsistencyChecker(low_confidence_threshold=0.60)
app.state.consistency_engine = ConsistencyEngine()
app.state.story_kb = StoryKBManager()
app.state.narrative_repository = build_narrative_repository(settings, app.state.story_kb)
app.state.narrative_service = NarrativeApplicationService(app.state.narrative_repository)
app.state.candidate_processor = CandidateProcessor()
app.state.span_expander = SpanExpander()
app.state.entity_pipeline = EntityPipeline(
    pipeline_version=settings.pipeline_version,
    prompt_version=settings.entity_prompt_version,
)

try:
    app.state.llm_service = (
        LLMService(
            provider=settings.llm_provider,
            model=settings.llm_model,
            api_key="",
            base_url=settings.llm_base_url,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        if settings.llm_enabled and settings.llm_provider != "none"
        else None
    )
except Exception:
    app.state.llm_service = None
    logger.exception("LLMService initialization failed. Suggestion endpoint will return 503.")

app.state.revision_content_provider = build_revision_content_provider(
    settings.platform_api_base_url,
    settings.platform_service_token,
    settings.llm_timeout_seconds,
)
app.state.revision_analysis_service = RevisionAnalysisService(
    app.state.narrative_repository,
    app.state.revision_content_provider,
    app.state.entity_pipeline,
    app.state.llm_service,
)
app.state.bootstrap_service = ManuscriptBootstrapService(
    app.state.narrative_repository,
    app.state.revision_content_provider,
    app.state.revision_analysis_service,
)
app.state.writing_service = WritingService(
    app.state.narrative_repository,
    app.state.llm_service,
    app.state.revision_content_provider,
)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000.0
    logger.info("%s %s -> %s (%.2f ms)", request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.on_event("startup")
def startup_event() -> None:
    logger.info("Starting AI service with pure-LLM entity pipeline.")


@app.on_event("shutdown")
def shutdown_event() -> None:
    engine = getattr(app.state.narrative_repository, "engine", None)
    if engine is not None:
        engine.dispose()


# Legacy model exception handlers removed




@app.exception_handler(LLMClientError)
async def llm_exception_handler(_: Request, exc: LLMClientError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(LLMServiceError)
async def llm_service_exception_handler(_: Request, exc: LLMServiceError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(EntityExtractionError)
async def entity_extraction_handler(_: Request, exc: EntityExtractionError):
    return JSONResponse(status_code=502, content={"detail": exc.message})


@app.exception_handler(EventExtractionError)
async def event_extraction_handler(_: Request, exc: EventExtractionError):
    return JSONResponse(status_code=502, content={"detail": exc.message})


@app.exception_handler(StateExtractionError)
async def state_extraction_handler(_: Request, exc: StateExtractionError):
    return JSONResponse(status_code=502, content={"detail": exc.message})


@app.exception_handler(KBWriteError)
async def kb_write_handler(_: Request, exc: KBWriteError):
    return JSONResponse(status_code=500, content={"detail": exc.message, "story_id": exc.story_id})


@app.exception_handler(AIServiceError)
async def ai_service_handler(_: Request, exc: AIServiceError):
    return JSONResponse(status_code=500, content={"detail": exc.message})


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(router)
app.include_router(interaction_router)
app.include_router(narrative_router)
app.include_router(internal_narrative_router)
app.add_api_route("/suggest-next", suggest_next, methods=["POST"], deprecated=True)
