import hashlib
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

from core.structured_call import extraction_source, structured_request


class LLMServiceError(RuntimeError):
    """Raised when LLM suggestion generation fails."""


logger = logging.getLogger(__name__)

_FORBIDDEN_PRIVATE_NOTE_KEYS = frozenset({
    "author_notes",
    "private_author_notes",
    "authorNotes",
    "privateAuthorNotes",
})


def _strip_private_notes(value: Any, *, in_entity_item: bool = False) -> Any:
    if isinstance(value, dict):
        is_entity_like = in_entity_item or any(
            k in value for k in ("entity_id", "characterId", "character_id", "canonical_name", "role", "entity_type")
        )
        cleaned: dict[str, Any] = {}
        for k, v in value.items():
            if k in _FORBIDDEN_PRIVATE_NOTE_KEYS:
                continue
            if is_entity_like and k == "notes":
                continue
            cleaned[k] = _strip_private_notes(
                v,
                in_entity_item=(k in {"entities", "characters", "known_entities"}),
            )
        return cleaned
    if isinstance(value, (list, tuple)):
        return [_strip_private_notes(item, in_entity_item=in_entity_item) for item in value]
    return value


class LLMService:
    def __init__(
        self,
        provider: str = "gemini",
        model: str | None = None,
        api_key: str | None = None,
        fallback_provider: str | None = None,
        fallback_model: str | None = None,
        fallback_api_key: str | None = None,
        base_url: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 512,
        timeout_seconds: int = 30,
        structured_max_tokens: int = 8192,
    ) -> None:
        self.provider = provider.lower().strip()
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout_seconds = timeout_seconds
        if structured_max_tokens < 1:
            raise ValueError("structured_max_tokens must be positive")
        self.structured_max_tokens = structured_max_tokens
        self.base_url = (base_url or os.getenv("LLM_BASE_URL") or os.getenv("CUSTOM_LLM_URL") or "").strip()
        self.fallback_provider = (fallback_provider or os.getenv("LLM_FALLBACK_PROVIDER") or "").lower().strip()
        self.fallback_model = ""
        self.fallback_api_key = ""

        if self.provider == "gemini":
            self.model = self._normalize_model(model, "models/gemini-3.5-flash-lite", is_gemini=True)
            self.api_key = self._normalize_api_key(
                api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
            )
            # No implicit cross-provider fallback. Any OpenAI fallback must be explicitly opted in.
            if self.fallback_provider == "openai":
                self.fallback_model = self._normalize_model(
                    fallback_model or os.getenv("OPENAI_MODEL") or os.getenv("LLM_FALLBACK_MODEL") or "gpt-4o-mini",
                    "gpt-4o-mini",
                    is_gemini=False,
                )
                self.fallback_api_key = self._normalize_api_key(
                    fallback_api_key or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY") or ""
                )
        elif self.provider == "openai":
            self.model = self._normalize_model(model, "gpt-4o-mini", is_gemini=False)
            self.api_key = self._normalize_api_key(
                api_key or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY") or ""
            )
            self.fallback_provider = ""
        elif self.provider == "groq":
            self.model = self._normalize_model(model, "llama-3.3-70b-versatile", is_gemini=False)
            self.api_key = self._normalize_api_key(
                api_key or os.getenv("GROQ_API_KEY") or ""
            )
            if not self.base_url:
                self.base_url = "https://api.groq.com/openai/v1"
            self.fallback_provider = "gemini"
        else:
            raise LLMServiceError("provider must be one of 'gemini', 'openai', 'groq'")

    @staticmethod
    def _normalize_model(model: str | None, default_model: str, is_gemini: bool) -> str:
        value = (model or "").strip()
        if not value or value.startswith("<"):
            value = default_model

        if is_gemini and not value.startswith("models/"):
            return f"models/{value}"
        return value

    @staticmethod
    def _normalize_api_key(api_key: str | None) -> str:
        value = (api_key or "").strip()
        if not value or value.startswith("<"):
            return ""
        return value

    def generate_suggestion(self, current_text: str, graph_context: Any, mood: str = "neutral") -> dict[str, list[str]]:
        if not current_text or not current_text.strip():
            raise ValueError("current_text must not be empty")

        context_text = self._normalize_graph_context(graph_context)

        user_prompt = (
            f"Dua tren boi canh nhan vat: {context_text}, "
            f"hay goi y 3 huong di tiep theo cho doan van sau: {current_text.strip()}"
        )
        # Preserve the exact Vietnamese requirement phrase in the prompt body.
        user_prompt = (
            f"Dựa trên bối cảnh nhân vật: {context_text}, "
            f"hãy gợi ý 3 hướng đi tiếp theo cho đoạn văn sau: {current_text.strip()}"
        )

        # Build mood directive
        from services.style_service import build_mood_directive
        mood_directive = build_mood_directive(mood)

        system_prompt = (
            "Ban la tro ly sang tao cot truyen. "
            "Chi tra ve JSON hop le, khong them giai thich. "
            "Dinh dang bat buoc: {\"suggestions\": [\"...\", \"...\", \"...\"]}."
        )
        if mood_directive:
            system_prompt += f"\n{mood_directive}"

        try:
            raw_output = self._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
        except LLMServiceError as exc:
            if (
                self.provider == "gemini"
                and self._is_quota_error(exc)
                and not self._can_fallback_to_openai()
                and self._local_fallback_enabled()
            ):
                logger.warning(
                    "Gemini quota exceeded and no OpenAI fallback key configured. Using local suggestion fallback."
                )
                return {"suggestions": self._generate_local_suggestions(current_text)}
            raise

        suggestions = self._extract_suggestions(raw_output)

        return {"suggestions": suggestions[:3]}

    def extract_events_and_relations(self, text: str, entities: list[dict]) -> dict:
        if not text or not text.strip():
            return {"events": []}

        # Format entities for prompt
        entity_names = [e.get("resolved_name", e.get("word", "")) for e in entities if e.get("resolved_name", e.get("word", ""))]
        entity_names_str = ", ".join(set(entity_names))

        system_prompt = (
            "You are an expert narrative analyst specializing in character interactions and relationship mapping. "
            "Your task is to extract events and interactions between entities from the provided text.\n"
            "Entities can be People (PER), Locations (LOC), or Organizations (ORG).\n"
            "Return ONLY valid JSON, no explanations. Required format:\n"
            "{\n"
            "  \"events\": [\n"
            "    {\n"
            "      \"subject\": \"Name of the subject entity\",\n"
            "      \"subject_type\": \"PER | LOC | ORG\",\n"
            "      \"action\": \"verb describing the interaction\",\n"
            "      \"object\": \"Name of the object entity\",\n"
            "      \"object_type\": \"PER | LOC | ORG\",\n"
            "      \"suggested_relation\": \"Must be EXACTLY ONE of: ALLY_OF, ENEMY_OF, KNOWS, LOVES, HAS_ITEM, BELONGS_TO. Do not combine them!\",\n"
            "      \"confidence\": 0.9\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Text passage: {text.strip()}\n"
            f"Known entities (if found, use these exact names): {entity_names_str}\n"
            "Your tasks:\n"
            "1. Extract all significant interaction events.\n"
            "2. Identify any NEW entities (characters, locations, organizations) not in the known list.\n"
            "3. For each event, suggest a relationship if applicable (ALLY_OF, ENEMY_OF, etc.).\n"
            "Return ONLY valid JSON."
        )

        try:
            raw_output = self._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
        except LLMServiceError as exc:
            logger.error("LLM Extraction failed: %s", exc)
            raise
        except Exception as exc:
            raise LLMServiceError(f"LLM extraction failed: {exc}") from exc

        cleaned = raw_output.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed = self._parse_json_like_output(cleaned)
        if isinstance(parsed, dict) and "events" in parsed:
            return parsed
        elif isinstance(parsed, list):
            return {"events": parsed}

        raise LLMServiceError("LLM extraction output is not valid structured JSON")

    def _call_structured(self, *, operation: str, system_prompt: str, user_prompt: str) -> str:
        trace = {
            "trace_id": str(uuid.uuid4()),
            "operation": operation,
            "source": extraction_source.get(),
            "system_prompt_sha256": hashlib.sha256(system_prompt.encode("utf-8")).hexdigest(),
            "input_sha256": hashlib.sha256(user_prompt.encode("utf-8")).hexdigest(),
            "max_output_tokens": self.structured_max_tokens,
        }
        token = structured_request.set(trace)
        start = time.monotonic()
        try:
            raw = self._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
            try:
                json.loads(raw)
            except (TypeError, json.JSONDecodeError) as exc:
                raise LLMServiceError(f"STRUCTURED_OUTPUT_INVALID_JSON trace_id={trace['trace_id']}") from exc
            return raw
        except Exception as exc:
            logger.warning(
                "structured_call_failed %s",
                json.dumps({
                    **trace,
                    "error_type": type(exc).__name__,
                    "elapsed_ms": round((time.monotonic() - start) * 1000),
                }),
            )
            raise
        finally:
            structured_request.reset(token)

    def _record_structured_response(self, response: Any, text: str, *, provider: str, model: str, finish: Any) -> None:
        trace = structured_request.get()
        if trace is None:
            return
        reason = str(getattr(finish, "value", finish) or "UNKNOWN")
        usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
        usage_fields = (
            "prompt_token_count",
            "candidates_token_count",
            "total_token_count",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
        )
        logger.info(
            "structured_provider_response %s",
            json.dumps({
                **trace,
                "provider": provider,
                "model": model,
                "finish_reason": reason,
                "response_id": getattr(response, "response_id", None) or getattr(response, "id", None),
                "response_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "response_characters": len(text),
                "usage": {key: getattr(usage, key) for key in usage_fields if isinstance(getattr(usage, key, None), int)},
            }),
        )
        if reason.upper() in {"MAX_TOKENS", "LENGTH"}:
            raise LLMServiceError(f"STRUCTURED_OUTPUT_TRUNCATED trace_id={trace['trace_id']}")
        if reason.upper() not in {"STOP", "UNKNOWN"}:
            raise LLMServiceError(f"STRUCTURED_OUTPUT_INCOMPLETE trace_id={trace['trace_id']} finish={reason}")

    @staticmethod
    def _guard_proxy_config() -> tuple[str, str] | None:
        from urllib.parse import urlparse

        mode = os.getenv("AI_EXECUTION_MODE", "offline_test").lower().strip()
        url = os.getenv("BUDGET_GUARD_URL", "").rstrip("/")
        token = os.getenv("BUDGET_GUARD_AUTH_TOKEN", "").strip()

        if mode == "live_free_tier":
            if not url or not token:
                raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
            parsed = urlparse(url)
            if (
                os.getenv("BUDGET_GUARD_MODE") != "proxy"
                or parsed.scheme not in {"http", "https"}
                or parsed.hostname not in {"budget-gateway", "127.0.0.1", "localhost"}
                or parsed.path
                or parsed.query
                or parsed.username
            ):
                raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
            return url, token

        if not url:
            if os.getenv("BUDGET_GUARD_MODE") == "proxy":
                raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
            if os.getenv("BUDGET_GUARD_FILE"):
                raise LLMServiceError("LEGACY_CLIENT_SIDE_LEDGER_DISABLED")
            return None
        parsed = urlparse(url)
        if (
            os.getenv("BUDGET_GUARD_MODE") != "proxy"
            or not token
            or parsed.scheme != "http"
            or parsed.hostname not in {"budget-gateway", "127.0.0.1", "localhost"}
            or parsed.path
            or parsed.query
            or parsed.username
        ):
            raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
        return url, token

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        mode = os.getenv("AI_EXECUTION_MODE", "offline_test").lower().strip()
        guard = self._guard_proxy_config()
        if mode == "live_free_tier" and not guard:
            raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
        if not self.api_key and not guard:
            raise LLMServiceError(f"Missing API key for provider '{self.provider}'")

        try:
            if self.provider == "gemini":
                return self._call_gemini(system_prompt=system_prompt, user_prompt=user_prompt)
            return self._call_openai(system_prompt=system_prompt, user_prompt=user_prompt)
        except LLMServiceError as exc:
            if self.provider == "gemini" and self._is_quota_error(exc) and self._can_fallback_to_openai():
                logger.warning(
                    "Gemini quota/rate-limit detected. Falling back to OpenAI model=%s",
                    self.fallback_model,
                )
                return self._call_openai(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model_override=self.fallback_model,
                    api_key_override=self.fallback_api_key,
                )
            raise

    def _call_gemini(self, system_prompt: str, user_prompt: str) -> str:
        mode = os.getenv("AI_EXECUTION_MODE", "offline_test").lower().strip()
        guard = self._guard_proxy_config()
        if mode == "live_free_tier" and not guard:
            raise LLMServiceError("GUARD_CONFIGURATION_INVALID")

        try:
            from google import genai
            from google.genai import types
        except Exception as exc:
            raise LLMServiceError("google-genai is not installed") from exc

        timeout_ms = max(1, round(float(self.timeout_seconds) * 1000))
        if guard:
            client = genai.Client(
                api_key=guard[1],
                http_options=types.HttpOptions(
                    base_url=guard[0],
                    api_version="v1beta",
                    timeout=timeout_ms,
                    client_args={"trust_env": False},
                    headers={"Authorization": "Bearer " + guard[1]},
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )
        else:
            if mode == "live_free_tier":
                raise LLMServiceError("GUARD_CONFIGURATION_INVALID")
            client = genai.Client(
                api_key=self.api_key,
                http_options=types.HttpOptions(
                    timeout=timeout_ms,
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            )
        last_error: Exception | None = None
        merged_prompt = f"{system_prompt}\n\n{user_prompt}".strip()

        for model_name in self._gemini_model_candidates():
            for attempt in range(4):
                ticket_id = self._budget_guard_reserve(
                    operation=(structured_request.get() or {}).get("operation", "gemini_generate_content"),
                    provider="gemini",
                    model=model_name,
                )
                try:
                    structured = structured_request.get()
                    config: dict[str, Any] = {
                        "temperature": self.temperature,
                        "max_output_tokens": structured["max_output_tokens"] if structured else self.max_tokens,
                    }
                    if structured:
                        config["response_mime_type"] = "application/json"
                        if structured["operation"] in {"event_extraction", "hitl_event_extraction"}:
                            from core.structured_outputs import NarrativeEventOutput
                            from pydantic import BaseModel

                            class EventBatch(BaseModel):
                                events: list[NarrativeEventOutput]

                            config["response_json_schema"] = EventBatch.model_json_schema()
                        elif structured["operation"] in {"prose_fact_extraction", "prose_fact_coverage"}:
                            from services.prose_facts import ProseFacts

                            config["response_json_schema"] = ProseFacts.model_json_schema()
                        elif structured["operation"] == "canon_reconciliation":
                            from services.canon_reconciliation import CanonComparison

                            config["response_json_schema"] = CanonComparison.model_json_schema()
                        elif structured["operation"] == "entity_candidate_verification":
                            from services.entity_pipeline.verification import EntityDecisionBatch

                            config["response_json_schema"] = EntityDecisionBatch.model_json_schema()
                    response = client.models.generate_content(
                        model=model_name,
                        contents=merged_prompt,
                        config=config,
                    )
                    text = self._extract_gemini_text(response)
                    candidates = getattr(response, "candidates", None) or []
                    self._record_structured_response(
                        response,
                        text,
                        provider="gemini",
                        model=model_name,
                        finish=getattr(candidates[0], "finish_reason", None) if candidates else None,
                    )
                    if text:
                        if ticket_id:
                            usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
                            p_tokens = getattr(usage, "prompt_token_count", getattr(usage, "prompt_tokens", None))
                            c_tokens = getattr(usage, "candidates_token_count", getattr(usage, "completion_tokens", None))
                            self._budget_guard_finalize(
                                ticket_id,
                                status="SUCCESS",
                                prompt_tokens=p_tokens,
                                candidate_tokens=c_tokens,
                                provider="gemini",
                                model=model_name,
                            )
                        self.model = model_name
                        return text

                    if ticket_id:
                        self._budget_guard_finalize(
                            ticket_id,
                            status="FAILED",
                            error="Gemini returned empty response",
                            provider="gemini",
                            model=model_name,
                        )
                    last_error = RuntimeError("Gemini returned empty response")
                except Exception as exc:
                    last_error = exc
                    if ticket_id:
                        self._budget_guard_finalize(
                            ticket_id,
                            status="FAILED",
                            error=str(exc),
                            provider="gemini",
                            model=model_name,
                        )
                    message = str(exc).lower()
                    if guard and any(
                        code in message
                        for code in (
                            "max_calls_reached",
                            "rolling_rate_limit_exceeded",
                            "absolute_deadline_expired",
                            "outstanding_liability_cost_limit",
                            "budget_meter_unavailable",
                            "live_safety_guard_not_enabled",
                            "live_upstream_not_authorized",
                            "model_not_approved",
                            "private_notes_forbidden_in_prompt",
                            "free_tier_status_unverified",
                            "quota_config_required",
                            "rpm_limit_exceeded",
                            "tpm_limit_exceeded",
                            "rpd_limit_exceeded",
                            "concurrency_limit_exceeded",
                            "provider_rate_limited",
                            "provider_timeout",
                            "provider_unavailable",
                        )
                    ):
                        raise LLMServiceError("BUDGET_GUARD_DENIED") from exc
                    if self._is_quota_error(exc):
                        if attempt < 3:
                            sleep_s = (attempt + 1) * 3
                            logger.warning(
                                "Gemini 429 quota hit on %s (attempt %d/4). Sleeping %ds...",
                                model_name,
                                attempt + 1,
                                sleep_s,
                            )
                            time.sleep(sleep_s)
                            continue
                    # Retry other model aliases when configured model is deprecated or unavailable.
                    if "not found" in message or "not supported" in message:
                        break
                    raise LLMServiceError(f"Gemini request failed: {exc}") from exc

        raise LLMServiceError(f"Gemini request failed: {last_error}")

    def _gemini_model_candidates(self) -> list[str]:
        # Do not silently switch to retired or unapproved models. Operators may
        # explicitly select gemini-3.1-flash-lite via LLM_MODEL if needed.
        candidates = [self.model]
        seen: set[str] = set()
        result: list[str] = []
        for item in candidates:
            value = (item or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result

    def _extract_gemini_text(self, response: Any) -> str:
        text = getattr(response, "text", "")
        if text:
            return str(text)

        collected: list[str] = []
        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts:
                part_text = getattr(part, "text", None)
                if part_text:
                    collected.append(str(part_text))

        return "\n".join(collected)

    def _call_openai(
        self,
        system_prompt: str,
        user_prompt: str,
        model_override: str | None = None,
        api_key_override: str | None = None,
    ) -> str:
        try:
            from openai import OpenAI
        except Exception as exc:
            raise LLMServiceError("openai package is not installed") from exc

        key = self._normalize_api_key(api_key_override) if api_key_override is not None else self.api_key
        model_name = model_override or self.model
        if "generativelanguage.googleapis.com" in (self.base_url or "") and model_name in {"gpt-4o-mini", "models/gpt-4o-mini"}:
            model_name = "gemini-3.5-flash-lite"
        guard = self._guard_proxy_config()
        if guard:
            if model_override or api_key_override:
                raise LLMServiceError("GUARDED_FALLBACK_DISABLED")
            key = guard[1]
        if not key:
            raise LLMServiceError("OpenAI fallback is enabled but OPENAI_API_KEY is missing")

        ticket_id = self._budget_guard_reserve(
            operation=(structured_request.get() or {}).get("operation", "chat_completions"),
            provider="openai-compatible",
            model=model_name,
        )
        try:
            extra_headers = {"ngrok-skip-browser-warning": "true", "X-Client-Service": "ai-service"}
            if ticket_id:
                extra_headers["X-Budget-Ticket"] = ticket_id
            client = OpenAI(
                api_key=key,
                base_url=(guard[0] + "/v1") if guard else self.base_url or None,
                max_retries=0 if guard else 2,
                default_headers=extra_headers,
                timeout=self.timeout_seconds,
            )
            response = client.chat.completions.create(
                model=model_name,
                temperature=self.temperature,
                max_tokens=(structured_request.get() or {}).get("max_output_tokens", self.max_tokens),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
            )
            text = response.choices[0].message.content or ""
            self._record_structured_response(
                response,
                text,
                provider="openai-compatible",
                model=model_name,
                finish=getattr(response.choices[0], "finish_reason", None),
            )
            if ticket_id:
                usage = getattr(response, "usage", None)
                p_tokens = getattr(usage, "prompt_tokens", None)
                c_tokens = getattr(usage, "completion_tokens", None)
                self._budget_guard_finalize(
                    ticket_id,
                    status="SUCCESS",
                    prompt_tokens=p_tokens,
                    candidate_tokens=c_tokens,
                    provider="openai-compatible",
                    model=model_name,
                )
            return text
        except Exception as exc:
            if ticket_id:
                self._budget_guard_finalize(
                    ticket_id,
                    status="FAILED",
                    error=str(exc),
                    provider="openai-compatible",
                    model=model_name,
                )
            raise LLMServiceError(f"OpenAI request failed: {exc}") from exc

    def _can_fallback_to_openai(self) -> bool:
        if (
            os.getenv("BUDGET_GUARD_URL")
            or os.getenv("BUDGET_GUARD_MODE") == "proxy"
            or os.getenv("AI_EXECUTION_MODE") == "live_free_tier"
        ):
            return False
        return self.fallback_provider == "openai" and bool(self.fallback_api_key)

    def _budget_guard_reserve(self, operation: str, provider: str, model: str) -> str:
        self._guard_proxy_config()  # Fail closed for a missing/misconfigured guarded route.
        return ""  # No client-side tickets; exactly-once accounting belongs to proxy transport.

    def _budget_guard_finalize(self, ticket_id: str, **kwargs: Any) -> None:
        if ticket_id:
            raise LLMServiceError("CLIENT_SETTLEMENT_FORBIDDEN")

    @staticmethod
    def _local_fallback_enabled() -> bool:
        if (
            os.getenv("BUDGET_GUARD_URL")
            or os.getenv("BUDGET_GUARD_MODE") == "proxy"
            or os.getenv("AI_EXECUTION_MODE") == "live_free_tier"
        ):
            return False
        value = (os.getenv("LLM_LOCAL_FALLBACK", "true") or "true").strip().lower()
        return value not in {"0", "false", "no", "off"}

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        message = str(exc).lower()
        if "structured_output_" in message:
            return False
        status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
        return (
            status in (429, "429")
            or bool(re.search(r"(?<![a-z0-9])429(?![a-z0-9])", message))
            or any(term in message for term in ("quota", "rate limit", "resource_exhausted"))
        )

    @staticmethod
    def _generate_local_suggestions(current_text: str) -> list[str]:
        seed = current_text.strip()
        if len(seed) > 120:
            seed = seed[:120].rstrip() + "..."

        return [
            f"Nhan vat phat hien mot manh moi moi tu boi canh hien tai: {seed}",
            "Xuat hien mot nhan vat phu cung thong tin trai chieu, tao them xung dot de day cot truyen.",
            "Ket thuc doan bang mot tinh tiet bat ngo de mo ra huong tiep theo nhung van giu tinh nhat quan.",
        ]

    def _normalize_graph_context(self, graph_context: Any) -> str:
        if graph_context is None:
            return "khong co du lieu"
        if isinstance(graph_context, str):
            return graph_context.strip() or "khong co du lieu"
        sanitized = _strip_private_notes(graph_context)
        try:
            return json.dumps(sanitized, ensure_ascii=False)
        except Exception:
            return str(sanitized)

    def _extract_suggestions(self, raw_output: str) -> list[str]:
        if not raw_output or not raw_output.strip():
            raise LLMServiceError("LLM returned empty output")

        cleaned = raw_output.strip()
        if cleaned.startswith("```"):
            # Normalize fenced JSON blocks like ```json ... ```.
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed = self._parse_json_like_output(cleaned)
        if parsed is None:
            quoted_values = [item.strip() for item in re.findall(r'"([^"]+)"', cleaned)]
            quoted_values = [item for item in quoted_values if item and item.lower() != "suggestions"]
            if quoted_values:
                return self._ensure_three_suggestions(quoted_values)

            # Fallback: parse bullet lines if model does not return valid JSON.
            lines: list[str] = []
            for raw_line in cleaned.splitlines():
                value = raw_line.strip()
                if not value:
                    continue

                value = value.strip(",")
                normalized = value.strip().lower().replace(" ", "")
                if normalized in {"{", "}", "[", "]", "suggestions:[", '"suggestions":[', "'suggestions':["}:
                    continue

                value = value.strip("-• \t\"',")
                if not value:
                    continue
                lines.append(value)

            if not lines:
                raise LLMServiceError("Failed to parse LLM output into suggestions")
            return self._ensure_three_suggestions(lines)

        data = parsed

        if isinstance(data, dict):
            raw_suggestions = data.get("suggestions", [])
        elif isinstance(data, list):
            raw_suggestions = data
        else:
            raise LLMServiceError("LLM JSON output is not in expected format")

        suggestions: list[str] = []
        for item in raw_suggestions:
            text = str(item).strip()
            if text:
                suggestions.append(text)

        if not suggestions:
            raise LLMServiceError("No suggestions found in LLM output")

        return self._ensure_three_suggestions(suggestions)

    @staticmethod
    def _ensure_three_suggestions(values: list[str]) -> list[str]:
        suggestions = [str(item).strip() for item in values if str(item).strip()]
        while len(suggestions) < 3:
            suggestions.append("(goi y bo sung)")
        return suggestions[:3]

    def _parse_json_like_output(self, text: str) -> Any | None:
        try:
            return json.loads(text)
        except Exception:
            pass

        first_obj = text.find("{")
        last_obj = text.rfind("}")
        if first_obj != -1 and last_obj > first_obj:
            candidate = text[first_obj : last_obj + 1]
            try:
                return json.loads(candidate)
            except Exception:
                pass

        first_arr = text.find("[")
        last_arr = text.rfind("]")
        if first_arr != -1 and last_arr > first_arr:
            candidate = text[first_arr : last_arr + 1]
            try:
                return json.loads(candidate)
            except Exception:
                pass

        return None

    def generate_writing_draft(
        self,
        *,
        operation: str,
        selected_text: str = "",
        cursor_offset: int = 0,
        start_offset: int | None = None,
        end_offset: int | None = None,
        instruction: str = "",
        context_package: dict[str, Any] | None = None,
        style: dict[str, Any] | None = None,
        constraints: list[str] | tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        """Generate draft text and patch coordinates using LLM or local fallback."""
        sanitized_context = _strip_private_notes(context_package or {})
        context_str = json.dumps(
            sanitized_context,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        style_str = json.dumps(_strip_private_notes(style or {}), ensure_ascii=False) if style else ""
        constraints_str = "; ".join(str(c) for c in (constraints or [])) if constraints else ""

        system_prompt = (
            "Bạn là trợ lý viết tiểu thuyết chuyên nghiệp (Author AI Copilot).\n"
            "Dựa trên bối cảnh thế giới, nhân vật, phong cách và các ràng buộc của tác giả, hãy tạo nội dung viết tiếp hoặc sửa đổi phù hợp.\n"
            "Chỉ trả về định dạng JSON hợp lệ:\n"
            "{\n"
            '  "draft_text": "Nội dung văn bản được sinh ra",\n'
            '  "explanation": "Lý giải ngắn gọn về hướng phát triển cốt truyện"\n'
            "}"
        )
        user_prompt = (
            f"Thao tác: {operation}\n"
            f"Đoạn văn được chọn: {selected_text}\n"
            f"Vị trí con trỏ: {cursor_offset}\n"
            f"Yêu cầu / Chỉ dẫn: {instruction}\n"
            f"Bối cảnh tiểu thuyết (Story Brain): {context_str}\n"
        )
        if style_str:
            user_prompt += f"Phong cách văn phong (Style): {style_str}\n"
        if constraints_str:
            user_prompt += f"Ràng buộc bắt buộc (Constraints): {constraints_str}\n"

        patch_start = start_offset if start_offset is not None else cursor_offset
        patch_end = end_offset if end_offset is not None else cursor_offset

        try:
            raw_output = self._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = self._parse_json_like_output(cleaned)
            draft_text = ""
            if isinstance(parsed, dict):
                draft_text = parsed.get("draft_text") or parsed.get("draft") or ""
            if not draft_text:
                draft_text = cleaned
        except Exception as exc:
            if self._local_fallback_enabled():
                logger.warning("LLM generation failed, using local draft fallback: %s", exc)
                draft_text = f"Đoạn văn tự động bổ sung dựa trên hướng dẫn: {instruction.strip() or 'Tiếp diễn mạch truyện'}"
            else:
                raise LLMServiceError(f"Writing generation failed: {exc}") from exc

        return {
            "draft_text": draft_text,
            "patch": {
                "start": patch_start,
                "end": patch_end,
                "replacement": draft_text,
            },
            "model_info": {"model": self.model, "provider": self.provider},
        }

    def suggest_brainstorm(
        self,
        *,
        instruction: str = "",
        known_entities: list[dict[str, Any]] | None = None,
        world_rules: list[str] | None = None,
        current_chapter: int = 1,
        target_chapter: int | None = None,
        target: str = "all",
    ) -> dict[str, Any]:
        system_prompt = (
            "You are an expert creative writing assistant and novel architect. "
            "Generate structured brainstorm suggestions for a story based on confirmed world rules, "
            "known characters, and the author's instructions.\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "world_rules": [\n'
            '    {"fact_key": "world_rule_<slug>", "text": "<rule text>", "category": "magic_system|geography|faction|law|cosmology|general"}\n'
            "  ],\n"
            '  "characters": [\n'
            '    {"name": "<name>", "canonical_name": "<name>", "entity_type": "character", "role": "protagonist|antagonist|ally|mentor|bystander|rival|other", "description": "<desc>", "archetype": "<archetype>", "aliases": ["<alias>"]}\n'
            "  ],\n"
            '  "future_events": [\n'
            '    {"title": "<title>", "description": "<desc>", "target_chapter": <int>, "ending": <bool>, "min_words": 1500, "participants": [{"entity_id": "<uuid>", "name_hint": null}, {"entity_id": null, "name_hint": "<name>"}]}\n'
            "  ]\n"
            "}\n"
            "IMPORTANT: If referencing an existing known character, you MUST use their exact entity_id with name_hint=null. "
            "If introducing a new character, entity_id MUST be null and name_hint MUST be their name. Do NOT fabricate entity UUIDs."
        )
        user_prompt = (
            f"Instruction: {instruction}\n"
            f"Target suggestions: {target}\n"
            f"Current chapter: {current_chapter}\n"
            f"Target chapter: {target_chapter or (current_chapter + 1)}\n"
            f"Known entities: {json.dumps(known_entities or [])}\n"
            f"Confirmed world rules: {json.dumps(world_rules or [])}\n"
        )
        try:
            raw = self._call_structured(
                operation="brainstorm_suggestions",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = self._parse_json_like_output(cleaned)
            if not isinstance(parsed, dict):
                raise LLMServiceError("Brainstorm output is not a JSON object")
            return parsed
        except LLMServiceError:
            raise
        except Exception as exc:
            if self._is_quota_error(exc):
                raise LLMServiceError(f"429 Quota exhausted: {exc}") from exc
            raise LLMServiceError(f"Brainstorm generation failed: {exc}") from exc

