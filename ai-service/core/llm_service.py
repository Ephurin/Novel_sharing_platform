import json
import logging
import os
import re
from typing import Any


class LLMServiceError(RuntimeError):
    """Raised when LLM suggestion generation fails."""


logger = logging.getLogger(__name__)


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
    ) -> None:
        self.provider = provider.lower().strip()
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout_seconds = timeout_seconds
        self.base_url = (base_url or os.getenv("LLM_BASE_URL") or os.getenv("CUSTOM_LLM_URL") or "").strip()
        self.fallback_provider = (fallback_provider or os.getenv("LLM_FALLBACK_PROVIDER") or "").lower().strip()
        self.fallback_model = ""
        self.fallback_api_key = ""

        if self.provider == "gemini":
            self.model = self._normalize_model(model, "models/gemini-1.5-flash", is_gemini=True)
            self.api_key = self._normalize_api_key(
                api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
            )
            self.fallback_provider = self.fallback_provider or "openai"
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

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        if not self.api_key:
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
        try:
            from google import genai
        except Exception as exc:
            raise LLMServiceError("google-genai is not installed") from exc

        client = genai.Client(api_key=self.api_key)
        last_error: Exception | None = None
        merged_prompt = f"{system_prompt}\n\n{user_prompt}".strip()

        for model_name in self._gemini_model_candidates():
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=merged_prompt,
                    config={
                        "temperature": self.temperature,
                        "max_output_tokens": self.max_tokens,
                    },
                )
                text = self._extract_gemini_text(response)
                if text:
                    self.model = model_name
                    return text

                last_error = RuntimeError("Gemini returned empty response")
            except Exception as exc:
                last_error = exc
                message = str(exc).lower()
                # Retry other model aliases when configured model is deprecated or unavailable.
                if "not found" in message or "not supported" in message:
                    continue
                raise LLMServiceError(f"Gemini request failed: {exc}") from exc

        raise LLMServiceError(f"Gemini request failed: {last_error}")

    def _gemini_model_candidates(self) -> list[str]:
        candidates = [
            self.model,
            "models/gemini-1.5-flash",
            "models/gemini-1.5-flash-latest",
            "models/gemini-1.5-pro",
            "models/gemini-2.0-flash",
        ]
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
        if not key:
            raise LLMServiceError("OpenAI fallback is enabled but OPENAI_API_KEY is missing")

        try:
            client = OpenAI(
                api_key=key, 
                base_url=self.base_url or None,
                default_headers={"ngrok-skip-browser-warning": "true"},
                timeout=self.timeout_seconds,
            )
            response = client.chat.completions.create(
                model=model_name,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            raise LLMServiceError(f"OpenAI request failed: {exc}") from exc

    def _can_fallback_to_openai(self) -> bool:
        return self.fallback_provider == "openai" and bool(self.fallback_api_key)

    @staticmethod
    def _local_fallback_enabled() -> bool:
        value = (os.getenv("LLM_LOCAL_FALLBACK", "true") or "true").strip().lower()
        return value not in {"0", "false", "no", "off"}

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        message = str(exc).lower()
        return "quota" in message or "rate limit" in message or "429" in message

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
        try:
            return json.dumps(graph_context, ensure_ascii=False)
        except Exception:
            return str(graph_context)

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
        context_str = json.dumps(context_package or {}, ensure_ascii=False)
        style_str = json.dumps(style or {}, ensure_ascii=False) if style else ""
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
