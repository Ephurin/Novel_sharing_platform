import json
import unittest

from core.exceptions import EntityExtractionError
from services.entity_pipeline.pipeline import EntityPipeline


class FakeLLMService:
    def __init__(self, response: object = "[]", error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.model = "fake-model"

    def _call_llm(self, system_prompt: str, user_prompt: str) -> object:
        if self.error is not None:
            raise self.error
        return self.response


class EntityPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = EntityPipeline(
            pipeline_version="entity-test-v1",
            prompt_version="entity-prompt-test-v1",
        )

    def test_valid_empty_result_is_not_an_error(self) -> None:
        result = self.pipeline.run_with_metadata("Không có tên riêng.", llm_service=FakeLLMService("[]"))

        self.assertEqual(result.entities, [])
        self.assertEqual(result.metadata.pipeline_version, "entity-test-v1")
        self.assertEqual(result.metadata.model_name, "fake-model")
        self.assertEqual(result.metadata.prompt_version, "entity-prompt-test-v1")

    def test_valid_output_has_stable_schema_and_order(self) -> None:
        response = json.dumps(
            [
                {"phrase": "Hắc Thành", "entity": "LOC", "score": 7.5},
                {"phrase": "Minh", "entity": "PER", "score": 9.5},
            ],
            ensure_ascii=False,
        )

        result = self.pipeline.run("Minh đến Hắc Thành.", llm_service=FakeLLMService(response))

        self.assertEqual(
            result,
            [
                {"phrase": "Minh", "entity": "PER", "score": 9.5, "label": "PER", "initial_status": "Unknown", "status_quote": ""},
                {"phrase": "Hắc Thành", "entity": "LOC", "score": 7.5, "label": "LOC", "initial_status": "Unknown", "status_quote": ""},
            ],
        )

    def test_malformed_output_raises_explicit_error(self) -> None:
        with self.assertRaisesRegex(EntityExtractionError, "not valid JSON"):
            self.pipeline.run("Minh xuất hiện.", llm_service=FakeLLMService("not-json"))

    def test_schema_invalid_output_raises_explicit_error(self) -> None:
        response = json.dumps([{"phrase": "Minh", "entity": "ALIEN", "score": 9.5}])

        with self.assertRaisesRegex(EntityExtractionError, "schema validation"):
            self.pipeline.run("Minh xuất hiện.", llm_service=FakeLLMService(response))

    def test_provider_failure_raises_explicit_error(self) -> None:
        with self.assertRaisesRegex(EntityExtractionError, "provider call failed"):
            self.pipeline.run(
                "Minh xuất hiện.",
                llm_service=FakeLLMService(error=TimeoutError("provider timeout")),
            )

    def test_missing_provider_is_not_treated_as_empty_result(self) -> None:
        with self.assertRaisesRegex(EntityExtractionError, "provider is unavailable"):
            self.pipeline.run("Minh xuất hiện.", llm_service=None)


if __name__ == "__main__":
    unittest.main()
