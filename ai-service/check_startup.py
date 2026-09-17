import argparse
import importlib
import os
import sys
from pathlib import Path

from core.settings import Settings


def load_env(base_dir: Path) -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    env_path = base_dir / ".env"
    evn_path = base_dir / ".evn"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    elif evn_path.exists():
        load_dotenv(dotenv_path=evn_path, override=False)


def check_python_deps(settings: Settings, errors: list[str]) -> None:
    required_modules = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "pydantic": "pydantic",
        "dotenv": "python-dotenv",
    }
    if settings.llm_enabled and settings.llm_provider == "gemini":
        required_modules["google.genai"] = "google-genai"
    if settings.llm_enabled and settings.llm_provider in {"openai", "groq"}:
        required_modules["openai"] = "openai"
    if settings.narrative_repository == "postgres":
        required_modules["sqlalchemy"] = "SQLAlchemy"
        required_modules["alembic"] = "alembic"
        required_modules["psycopg"] = "psycopg[binary]"

    for module_name, package_name in required_modules.items():
        if importlib.util.find_spec(module_name) is None:
            errors.append(f"Missing dependency: {package_name} (import: {module_name})")


def check_llm_config(settings: Settings, errors: list[str], warnings: list[str]) -> None:
    provider = settings.llm_provider
    gemini_key = (os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")).strip()
    openai_key = (os.getenv("OPENAI_API_KEY", "") or os.getenv("LLM_API_KEY", "")).strip()
    groq_key = (os.getenv("GROQ_API_KEY", "") or os.getenv("LLM_API_KEY", "")).strip()

    if not settings.llm_enabled or provider == "none":
        warnings.append("LLM provider is disabled")
    elif provider == "gemini":
        if not gemini_key or gemini_key.startswith("<"):
            errors.append("LLM_PROVIDER=gemini but GEMINI_API_KEY/GOOGLE_API_KEY is missing")
    elif provider == "openai":
        if not openai_key or openai_key.startswith("<"):
            errors.append("LLM_PROVIDER=openai but OPENAI_API_KEY/LLM_API_KEY is missing")
    elif provider == "groq" and (not groq_key or groq_key.startswith("<")):
        errors.append("LLM_PROVIDER=groq but GROQ_API_KEY/LLM_API_KEY is missing")

def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-fast startup checker for AI service")
    parser.add_argument(
        "--base-dir",
        default=str(Path(__file__).resolve().parent),
        help="Path to ai-service directory",
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir).resolve()
    load_env(base_dir)

    errors: list[str] = []
    warnings: list[str] = []

    try:
        settings = Settings.from_env()
    except ValueError as exc:
        print(f"Configuration error: {exc}")
        return 1

    check_python_deps(settings, errors)
    check_llm_config(settings, errors, warnings)

    print("== AI Service Startup Check ==")
    print(f"Base dir: {base_dir}")

    if warnings:
        print("Warnings:")
        for item in warnings:
            print(f"- {item}")

    if errors:
        print("Errors:")
        for item in errors:
            print(f"- {item}")
        print("Result: FAIL")
        return 1

    print("Result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
