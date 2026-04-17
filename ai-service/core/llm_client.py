import json
import os
from typing import Any
from urllib import error, request


class LLMClientError(RuntimeError):
    """Raised when calling external LLM APIs fails."""


class LLMClient:
    def __init__(
        self,
        provider: str = "none",
        model: str = "gpt-4o-mini",
        api_key: str = "",
        timeout_seconds: int = 30,
    ) -> None:
        self.provider = provider.lower().strip()
        self.model = model
        self.api_key = (api_key or "").strip() or self._resolve_api_key()
        self.timeout_seconds = timeout_seconds

    def _resolve_api_key(self) -> str:
        if self.provider == "gemini":
            return (
                os.getenv("GEMINI_API_KEY", "").strip()
                or os.getenv("GOOGLE_API_KEY", "").strip()
                or os.getenv("LLM_API_KEY", "").strip()
            )
        if self.provider == "openai":
            return (
                os.getenv("OPENAI_API_KEY", "").strip()
                or os.getenv("LLM_API_KEY", "").strip()
            )
        return os.getenv("LLM_API_KEY", "").strip()

    def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 256,
    ) -> str:
        if not prompt.strip():
            raise ValueError("prompt must not be empty")

        if self.provider in {"none", ""}:
            return "LLM provider is disabled. Set LLM_PROVIDER and API key env variables to enable."

        if self.provider == "openai":
            return self._call_openai(prompt, system_prompt, temperature, max_tokens)
        if self.provider == "gemini":
            return self._call_gemini(prompt, system_prompt, temperature, max_tokens)

        raise LLMClientError(f"Unsupported LLM provider: {self.provider}")

    def _call_openai(
        self,
        prompt: str,
        system_prompt: str | None,
        temperature: float,
        max_tokens: int,
    ) -> str:
        if not self.api_key:
            raise LLMClientError("Missing API key for OpenAI")

        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = self._post_json(
                url="https://api.openai.com/v1/chat/completions",
                payload=payload,
                headers=headers,
            )
            choices = response.get("choices", [])
            if not choices:
                return ""
            message = choices[0].get("message", {})
            return str(message.get("content", ""))
        except Exception as exc:
            raise LLMClientError(f"OpenAI call failed: {exc}") from exc

    def _call_gemini(
        self,
        prompt: str,
        system_prompt: str | None,
        temperature: float,
        max_tokens: int,
    ) -> str:
        if not self.api_key:
            raise LLMClientError("Missing API key for Gemini")

        joined_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        payload = {
            "contents": [
                {
                    "parts": [{"text": joined_prompt}],
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        try:
            response = self._post_json(
                url=url,
                payload=payload,
                headers={"Content-Type": "application/json"},
            )
            candidates = response.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts:
                return ""
            return str(parts[0].get("text", ""))
        except Exception as exc:
            raise LLMClientError(f"Gemini call failed: {exc}") from exc

    def _post_json(self, url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(url=url, data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text)
        except error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise LLMClientError(f"HTTP {exc.code}: {error_body}") from exc
        except error.URLError as exc:
            raise LLMClientError(f"Network error: {exc.reason}") from exc