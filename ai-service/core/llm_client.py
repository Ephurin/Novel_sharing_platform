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
        base_url: str = "",
    ) -> None:
        self.provider = provider.lower().strip()
        self.model = model
        self.api_key = (api_key or "").strip() or self._resolve_api_key()
        self.timeout_seconds = timeout_seconds
        self.base_url = base_url.rstrip("/")

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
        if self.provider == "groq":
            return os.getenv("GROQ_API_KEY", "").strip() or os.getenv("LLM_API_KEY", "").strip()
        return os.getenv("LLM_API_KEY", "").strip()

    @staticmethod
    def _guard_proxy_config() -> tuple[str, str] | None:
        from urllib.parse import urlparse

        url = os.getenv("BUDGET_GUARD_URL", "").rstrip("/")
        if not url:
            if os.getenv("BUDGET_GUARD_MODE") == "proxy":
                raise LLMClientError("GUARD_CONFIGURATION_INVALID")
            if os.getenv("BUDGET_GUARD_FILE"):
                raise LLMClientError("LEGACY_CLIENT_SIDE_LEDGER_DISABLED")
            return None
        parsed = urlparse(url)
        token = os.getenv("BUDGET_GUARD_AUTH_TOKEN", "")
        if (
            os.getenv("BUDGET_GUARD_MODE") != "proxy"
            or not token
            or parsed.scheme != "http"
            or parsed.hostname not in {"budget-gateway", "127.0.0.1", "localhost"}
            or parsed.path
            or parsed.query
            or parsed.username
        ):
            raise LLMClientError("GUARD_CONFIGURATION_INVALID")
        return url, token

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
            raise LLMClientError("LLM provider is disabled")

        if self.provider == "openai":
            return self._call_openai(prompt, system_prompt, temperature, max_tokens)
        if self.provider == "groq":
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
        guard = self._guard_proxy_config()
        key = guard[1] if guard else self.api_key
        if not key:
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
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
        }

        if guard:
            url = f"{guard[0]}/v1/chat/completions"
        else:
            base_url = self.base_url or (os.getenv("CUSTOM_LLM_URL") or "").rstrip("/")
            url = f"{base_url}/chat/completions" if base_url else "https://api.openai.com/v1/chat/completions"

        try:
            response = self._post_json(
                url=url,
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
        guard = self._guard_proxy_config()
        key = guard[1] if guard else self.api_key
        if not key:
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

        model_id = self.model.removeprefix("models/")
        if guard:
            url = f"{guard[0]}/v1beta/models/{model_id}:generateContent"
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
        else:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={key}"
            headers = {"Content-Type": "application/json"}
        try:
            response = self._post_json(
                url=url,
                payload=payload,
                headers=headers,
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
        opener = request.build_opener(request.ProxyHandler({}))
        try:
            with opener.open(req, timeout=self.timeout_seconds) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text)
        except error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise LLMClientError(f"HTTP {exc.code}: {error_body}") from exc
        except error.URLError as exc:
            raise LLMClientError(f"Network error: {exc.reason}") from exc
