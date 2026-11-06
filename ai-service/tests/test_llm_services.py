import unittest
from unittest.mock import patch

import httpx
from google import genai

from core.llm_client import LLMClient, LLMClientError
from core.llm_service import LLMService, LLMServiceError


class StubLLMService(LLMService):
    def __init__(self, response: str = '{"events": []}', error: Exception | None = None) -> None:
        super().__init__(provider="openai", model="fake-model", api_key="test-key")
        self.response = response
        self.error = error

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        if self.error is not None:
            raise self.error
        return self.response


class GeminiModelSelectionTests(unittest.TestCase):
    def test_default_gemini_model_does_not_use_legacy_versions(self) -> None:
        service = LLMService(provider="gemini", model=None, api_key="test-key")
        self.assertEqual(service._gemini_model_candidates(), ["models/gemini-3.5-flash-lite"])

    def test_explicit_3_1_fallback_model(self) -> None:
        service = LLMService(provider="gemini", model="gemini-3.1-flash-lite", api_key="test-key")
        self.assertEqual(service._gemini_model_candidates(), ["models/gemini-3.1-flash-lite"])


class LLMClientTests(unittest.TestCase):
    def test_disabled_provider_is_an_explicit_error(self) -> None:
        client = LLMClient(provider="none", model="disabled")

        with self.assertRaisesRegex(LLMClientError, "disabled"):
            client.generate("Write a sentence")


class GeminiRetryTests(unittest.TestCase):
    def call_with_statuses(self, statuses: list[int]) -> tuple[str, int]:
        calls = []

        def handle(request: httpx.Request) -> httpx.Response:
            status = statuses[min(len(calls), len(statuses) - 1)]
            calls.append(request)
            if status != 200:
                return httpx.Response(status, json={"error": {"code": status, "message": "provider error"}})
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "[]"}]}}]})

        real_client = genai.Client

        def create_client(**kwargs):
            options = kwargs["http_options"]
            self.assertEqual(options["timeout"], 30000)
            options["httpx_client"] = httpx.Client(transport=httpx.MockTransport(handle))
            client = real_client(**kwargs)
            self.addCleanup(client.close)
            return client

        self.calls = calls
        service = LLMService(provider="gemini", api_key="test-key")
        with patch("google.genai.Client", side_effect=create_client), patch("time.sleep"):
            result = service._call_gemini("Extract entities", "Minh met Lan.")
        return result, len(calls)

    def test_transient_overload_recovers(self) -> None:
        result, calls = self.call_with_statuses([503, 503, 200])
        self.assertEqual(result, "[]")
        self.assertEqual(calls, 3)

    def test_persistent_overload_stops_after_three_attempts(self) -> None:
        with self.assertRaisesRegex(LLMServiceError, "đã thử lại 3 lần"):
            self.call_with_statuses([503])
        self.assertEqual(len(self.calls), 3)

    def test_invalid_key_is_not_retried(self) -> None:
        with self.assertRaises(LLMServiceError):
            self.call_with_statuses([403])
        self.assertEqual(len(self.calls), 1)


class InteractionExtractionTests(unittest.TestCase):
    def test_valid_empty_event_result_is_not_an_error(self) -> None:
        service = StubLLMService('{"events": []}')

        self.assertEqual(service.extract_events_and_relations("Minh đứng yên.", []), {"events": []})

    def test_malformed_event_result_is_an_explicit_error(self) -> None:
        service = StubLLMService("invalid")

        with self.assertRaisesRegex(LLMServiceError, "structured JSON"):
            service.extract_events_and_relations("Minh gặp Lan.", [])

    def test_provider_event_failure_is_an_explicit_error(self) -> None:
        service = StubLLMService(error=LLMServiceError("provider timeout"))

        with self.assertRaisesRegex(LLMServiceError, "provider timeout"):
            service.extract_events_and_relations("Minh gặp Lan.", [])


if __name__ == "__main__":
    unittest.main()
