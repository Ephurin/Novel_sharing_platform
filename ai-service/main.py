import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.routes import router
from core.consistency import ConsistencyChecker, ConsistencyEngine
from core.graph_db import GraphDBClient, GraphDBError, GraphManager
from core.llm_client import LLMClient, LLMClientError
from core.llm_service import LLMService, LLMServiceError
from core.ner_engine import InferenceError, ModelLoadError, NEREngine


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

DEFAULT_MODEL_DIR = BASE_DIR / "models" / "phobert_ner_tienhiep"
raw_model_dir = os.getenv("PHOBERT_MODEL_DIR", "").strip()
if not raw_model_dir or raw_model_dir.startswith("<"):
    MODEL_DIR = DEFAULT_MODEL_DIR.resolve()
else:
    MODEL_DIR = Path(raw_model_dir).expanduser().resolve()

default_graph_json = BASE_DIR / "models" / "knowledge_graph.json"
raw_graph_json = os.getenv("GRAPH_JSON_PATH", "").strip()
if not raw_graph_json or raw_graph_json.startswith("<"):
    GRAPH_JSON_PATH = default_graph_json.resolve()
else:
    GRAPH_JSON_PATH = Path(raw_graph_json).expanduser().resolve()


app = FastAPI(
    title="AI Service - Story Platform",
    version="1.0.0",
    description="Microservice for NER, graph context lookup, and LLM orchestration.",
)

app.state.ner_engine = NEREngine(model_dir=MODEL_DIR)
app.state.ner_model = app.state.ner_engine
app.state.graph_db = GraphDBClient(
    neo4j_uri=os.getenv("NEO4J_URI"),
    neo4j_user=os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME"),
    neo4j_password=os.getenv("NEO4J_PASSWORD"),
    json_graph_path=GRAPH_JSON_PATH,
)
app.state.graph_manager = GraphManager(env_file=BASE_DIR / ".env")
app.state.llm_client = LLMClient(
    provider=os.getenv("LLM_PROVIDER", "none"),
    model=os.getenv("LLM_MODEL", "gemini-2.5-flash-lite"),
    api_key="",
)
app.state.consistency_checker = ConsistencyChecker(low_confidence_threshold=0.60)
app.state.consistency_engine = ConsistencyEngine()

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
    logger.info("Starting AI service. Loading PhoBERT model from: %s", MODEL_DIR)
    try:
        app.state.ner_engine.load()
    except ModelLoadError:
        logger.exception("PhoBERT model loading failed. NER endpoint will return 503.")


@app.on_event("shutdown")
def shutdown_event() -> None:
    app.state.graph_db.close()
    app.state.graph_manager.close()


@app.exception_handler(ModelLoadError)
async def model_load_exception_handler(_: Request, exc: ModelLoadError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(InferenceError)
async def inference_exception_handler(_: Request, exc: InferenceError):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.exception_handler(GraphDBError)
async def graph_db_exception_handler(_: Request, exc: GraphDBError):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


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