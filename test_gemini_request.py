import argparse
import os
import sys
from pathlib import Path
from typing import Any


def load_env_files() -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    root_env = Path(".env")
    service_env = Path("ai-service") / ".env"

    if root_env.exists():
        load_dotenv(dotenv_path=root_env, override=False)
    if service_env.exists():
        load_dotenv(dotenv_path=service_env, override=False)


def resolve_api_key() -> str:
    candidates = [
        os.getenv("GEMINI_API_KEY", ""),
        os.getenv("GOOGLE_API_KEY", ""),
        os.getenv("LLM_API_KEY", ""),
    ]
    for value in candidates:
        key = (value or "").strip()
        if key and not key.startswith("<"):
            return key
    return ""


def normalize_model_name(model_name: str) -> str:
    value = (model_name or "").strip()
    if not value:
        return "models/gemini-flash-latest"
    if value.startswith("models/"):
        return value
    return f"models/{value}"


def is_not_found_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "not found" in message and "model" in message


def get_generate_content_models(client: Any) -> list[str]:
    names: list[str] = []
    for model in client.models.list():
        model_name = str(getattr(model, "name", ""))
        methods = getattr(model, "supported_actions", None) or getattr(model, "supported_generation_methods", None) or []
        if methods:
            normalized = [str(item).lower() for item in methods]
            if not any("generate" in item for item in normalized):
                continue
        if model_name:
            names.append(model_name)
    return names


def choose_fallback_model(available_models: list[str], requested_model: str) -> str | None:
    if not available_models:
        return None

    available_set = set(available_models)
    preferred = [
        "models/gemini-flash-latest",
        "models/gemini-2.5-flash",
        "models/gemini-2.0-flash",
        "models/gemini-2.0-flash-lite",
        "models/gemini-pro-latest",
    ]

    requested = normalize_model_name(requested_model)
    if requested in available_set:
        return requested

    for candidate in preferred:
        if candidate in available_set:
            return candidate

    return available_models[0]


def list_supported_models(client: Any) -> None:
    print("== Gemini models supporting generateContent ==")
    count = 0
    try:
        models = get_generate_content_models(client)
        for model_name in models:
            print(f"- {model_name}")
            count += 1
    except Exception as exc:
        print(f"Could not list models: {exc}")

    if count == 0:
        print("No model with generateContent capability was found for this API key/project.")


def extract_response_text(response: Any) -> str:
    text = getattr(response, "text", "")
    if text:
        return text

    collected_parts: list[str] = []

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", []) if content else []
        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                collected_parts.append(str(part_text))

    if collected_parts:
        return "\n".join(collected_parts)

    if isinstance(response, dict):
        candidates_data = response.get("candidates", [])
        for candidate in candidates_data:
            content = candidate.get("content", {}) if isinstance(candidate, dict) else {}
            parts = content.get("parts", []) if isinstance(content, dict) else []
            for part in parts:
                if isinstance(part, dict) and part.get("text"):
                    collected_parts.append(str(part["text"]))

    return "\n".join(collected_parts)


def classify_error(exc: Exception) -> tuple[str, int]:
    message = str(exc)
    message_lower = message.lower()

    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)

    if status_code in (401, 403):
        return f"AUTH ERROR: API key may be invalid or not authorized. Detail: {message}", 3

    if status_code == 429 or "quota" in message_lower or "rate limit" in message_lower:
        return f"QUOTA ERROR: Request limit or quota exceeded. Detail: {message}", 4

    if status_code == 404 and "model" in message_lower and "not found" in message_lower:
        return f"MODEL ERROR: Requested model is unavailable. Detail: {message}", 5

    if "api key" in message_lower and ("invalid" in message_lower or "not valid" in message_lower):
        return f"AUTH ERROR: API key is invalid. Detail: {message}", 3

    return f"REQUEST ERROR: {message}", 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Standalone Gemini request tester")
    parser.add_argument(
        "--model",
        default="models/gemini-flash-latest",
        help="Gemini model name, for example: models/gemini-flash-latest",
    )
    parser.add_argument(
        "--prompt",
        default="Xin chao Gemini. Hay tra loi 1 cau ngan bang tieng Viet.",
        help="Prompt text sent to Gemini",
    )
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--max-tokens", type=int, default=256)
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="List models supporting generateContent before sending request",
    )
    args = parser.parse_args()

    load_env_files()
    api_key = resolve_api_key()
    if not api_key:
        print("ERROR: Gemini API key not found.")
        print("Please set GEMINI_API_KEY (or GOOGLE_API_KEY / LLM_API_KEY) in ai-service/.env")
        return 1

    try:
        from google import genai
    except Exception as exc:
        print("ERROR: google-genai is not installed.")
        print(f"Detail: {exc}")
        print("Install with: pip install google-genai")
        return 1

    try:
        client = genai.Client(api_key=api_key)

        if args.list_models:
            list_supported_models(client)
            print()

        selected_model = normalize_model_name(args.model)
        try:
            response = client.models.generate_content(
                model=selected_model,
                contents=args.prompt,
                config={
                    "temperature": args.temperature,
                    "max_output_tokens": args.max_tokens,
                },
            )
        except Exception as exc:
            if not is_not_found_error(exc):
                raise

            available_models = get_generate_content_models(client)
            fallback_model = choose_fallback_model(available_models, selected_model)
            if not fallback_model:
                raise

            print(f"INFO: Model {selected_model} not available. Retrying with {fallback_model}.")
            selected_model = fallback_model
            response = client.models.generate_content(
                model=selected_model,
                contents=args.prompt,
                config={
                    "temperature": args.temperature,
                    "max_output_tokens": args.max_tokens,
                },
            )

        text = extract_response_text(response)

        print("== Gemini request success ==")
        print(f"Model: {selected_model}")
        print("Response:")
        print(text if text else "(empty response)")
        return 0
    except Exception as exc:
        print("== Gemini request failed ==")
        print(f"Model: {normalize_model_name(args.model)}")
        message, code = classify_error(exc)
        print(message)
        print("Hint: try running with --list-models and pick a model your key can access.")
        return code


if __name__ == "__main__":
    sys.exit(main())
