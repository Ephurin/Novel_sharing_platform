import unittest

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
