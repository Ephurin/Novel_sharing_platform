import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ValueError(f"{name} must be greater than or equal to {minimum}")
    return value


def _env_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    values = tuple(item.strip() for item in raw_value.split(",") if item.strip())
    return values or default


@dataclass(frozen=True, slots=True)
class Settings:
    service_name: str
    service_version: str
    llm_enabled: bool
    llm_provider: str
    llm_model: str
    llm_base_url: str
    llm_timeout_seconds: int
    database_url: str
    narrative_repository: str
    default_tenant_id: str
    default_actor_id: str
    platform_api_base_url: str
    platform_service_token: str
    cors_origins: tuple[str, ...]
    pipeline_version: str
    entity_prompt_version: str
    service_auth_disabled: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        provider = (os.getenv("LLM_PROVIDER", "none") or "none").strip().lower()
        if provider not in {"none", "gemini", "openai", "groq", "fake"}:
            raise ValueError("LLM_PROVIDER must be one of: none, gemini, openai, groq, fake")

        default_model = {
            "gemini": "gemini-2.5-flash-lite",
            "openai": "gpt-4o-mini",
            "groq": "llama-3.3-70b-versatile",
            "none": "disabled",
            "fake": "fake-p4-model",
        }[provider]
        configured_base_url = (os.getenv("LLM_BASE_URL") or os.getenv("CUSTOM_LLM_URL") or "").strip()
        if provider == "groq" and not configured_base_url:
            configured_base_url = "https://api.groq.com/openai/v1"

        repository = (os.getenv("NARRATIVE_REPOSITORY", "json") or "json").strip().lower()
        if repository not in {"json", "postgres"}:
            raise ValueError("NARRATIVE_REPOSITORY must be one of: json, postgres")

        database_url = (os.getenv("DATABASE_URL", "") or "").strip()
        if repository == "postgres" and not database_url:
            raise ValueError("DATABASE_URL is required when NARRATIVE_REPOSITORY=postgres")

        return cls(
            service_name=(os.getenv("SERVICE_NAME", "AI Service - Story Platform") or "").strip(),
            service_version=(os.getenv("SERVICE_VERSION", "1.0.0") or "").strip(),
            llm_enabled=_env_bool("LLM_ENABLED", provider != "none"),
            llm_provider=provider,
            llm_model=(os.getenv("LLM_MODEL", default_model) or default_model).strip(),
            llm_base_url=configured_base_url,
            llm_timeout_seconds=_env_int("LLM_TIMEOUT_SECONDS", 30),
            database_url=database_url,
            narrative_repository=repository,
            default_tenant_id=(
                os.getenv("DEFAULT_TENANT_ID", "00000000-0000-0000-0000-000000000001") or ""
            ).strip(),
            default_actor_id=(
                os.getenv("DEFAULT_ACTOR_ID", "00000000-0000-0000-0000-000000000001") or ""
            ).strip(),
            platform_api_base_url=(os.getenv("PLATFORM_API_BASE_URL", "") or "").strip().rstrip("/"),
            platform_service_token=(os.getenv("PLATFORM_SERVICE_TOKEN", "") or "").strip(),
            cors_origins=_env_csv(
                "CORS_ORIGINS",
                (
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://localhost:4173",
                ),
            ),
            pipeline_version=(os.getenv("ENTITY_PIPELINE_VERSION", "entity-v1") or "").strip(),
            entity_prompt_version=(os.getenv("ENTITY_PROMPT_VERSION", "entity-extraction-v1") or "").strip(),
            service_auth_disabled=_env_bool("SERVICE_AUTH_DISABLED", False),
        )
