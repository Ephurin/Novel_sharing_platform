import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.interactions import router as interaction_router
from core.consistency import ConsistencyChecker, ConsistencyEngine
from core.llm_client import LLMClient, LLMClientError
from core.llm_service import LLMService, LLMServiceError
from core.candidate_processor import CandidateProcessor
from core.span_expander import SpanExpander
from core.story_kb_manager import StoryKBManager
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

# No longer using local PhoBERT model dir



app = FastAPI(
    title="AI Service - Story Platform",
    version="1.0.0",
    description="Microservice for NER, graph context lookup, and LLM orchestration.",
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Removed legacy NER engine
app.state.llm_client = LLMClient(
    provider=os.getenv("LLM_PROVIDER", "none"),
    model=os.getenv("LLM_MODEL", "gemini-2.5-flash-lite"),
    api_key="",
)
app.state.consistency_checker = ConsistencyChecker(low_confidence_threshold=0.60)
app.state.consistency_engine = ConsistencyEngine()
app.state.story_kb = StoryKBManager()
app.state.candidate_processor = CandidateProcessor()
app.state.span_expander = SpanExpander()
app.state.entity_pipeline = EntityPipeline(ml_enabled=True)

try:
    app.state.llm_service = LLMService(
        provider=os.getenv("LLM_PROVIDER", "gemini"),
        model=os.getenv("LLM_MODEL", "gemini-2.5-flash-lite"),
        api_key="",
    )
except Exception:
    app.state.llm_service = None
    logger.exception("LLMService initialization failed. Suggestion endpoint will return 503.")


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000.0
    logger.info("%s %s -> %s (%.2f ms)", request.method, request.url.path, response.status_code, duration_ms)
    return response


@app.on_event("startup")
def startup_event() -> None:
    logger.info("Starting AI service with hybrid Entity Pipeline.")


@app.on_event("shutdown")
def shutdown_event() -> None:
    pass


# Legacy model exception handlers removed




@app.exception_handler(LLMClientError)
async def llm_exception_handler(_: Request, exc: LLMClientError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(LLMServiceError)
async def llm_service_exception_handler(_: Request, exc: LLMServiceError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(router)
app.include_router(interaction_router)