import json
import unittest

from core.exceptions import EventExtractionError, StateExtractionError
from services.event_summarizer import extract_narrative_events
from services.state_extraction import extract_states


class FakeLLMService:
    def __init__(self, response: object = "[]", error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.model = "fake-model"

    def _call_llm(self, system_prompt: str, user_prompt: str) -> object:
        if self.error is not None:
            raise self.error
        return self.response


class EventExtractionTests(unittest.TestCase):
    entities = [{"normalized_name": "Minh"}, {"normalized_name": "Hắc Thành"}]

    def test_valid_event_is_converted_to_internal_model(self) -> None:
        response = json.dumps(
            {
                "events": [
                    {
                        "participants": ["Minh"],
                        "locations": ["Hắc Thành"],
                        "summary": "Minh đến Hắc Thành.",
                        "event_type": "movement",
                        "emotion_tags": ["neutral"],
                        "importance_score": 0.7,
                        "consequences": [],
                    }
                ]
            },
            ensure_ascii=False,
        )

        events = extract_narrative_events(
            "Minh đến Hắc Thành.",
            self.entities,
            FakeLLMService(response),
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].participants, ["Minh"])
        self.assertEqual(events[0].event_type, "movement")

    def test_valid_empty_event_list_is_not_an_error(self) -> None:
        events = extract_narrative_events("Không có sự kiện.", self.entities, FakeLLMService('{"events":[]}'))
        self.assertEqual(events, [])

    def test_single_consequence_text_is_preserved_as_one_item(self) -> None:
        consequence = "Amane discovers the truth. She leaves the city."
        for value, expected in [(consequence, [consequence]), ("  ", []), ([consequence], [consequence])]:
            with self.subTest(value=value):
                response = json.dumps({"events": [{
                    "participants": ["Minh"], "summary": "Minh reveals the truth.",
                    "event_type": "discovery", "consequences": value,
                }]})
                events = extract_narrative_events("Minh reveals the truth.", self.entities, FakeLLMService(response))
                self.assertEqual(events[0].consequences, expected)

    def test_invalid_consequence_structures_are_still_rejected(self) -> None:
        for value in [{"text": "a consequence"}, 123, [123], None]:
            with self.subTest(value=value):
                response = json.dumps({"events": [{
                    "participants": ["Minh"], "summary": "Minh leaves.",
                    "event_type": "movement", "consequences": value,
                }]})
                with self.assertRaisesRegex(EventExtractionError, "schema validation"):
                    extract_narrative_events("Minh leaves.", self.entities, FakeLLMService(response))

    def test_malformed_event_output_is_explicit(self) -> None:
        with self.assertRaisesRegex(EventExtractionError, "not valid JSON"):
            extract_narrative_events("Minh xuất hiện.", self.entities, FakeLLMService("invalid"))


class StateExtractionTests(unittest.TestCase):
    entities = [{"resolved_name": "Minh"}]

    def test_valid_state_is_converted_to_internal_model(self) -> None:
        response = json.dumps(
            {
                "states": [
                    {
                        "entity": "Minh",
                        "attribute": "health",
                        "value": "wounded",
                        "confidence": 0.9,
                    }
                ]
            },
            ensure_ascii=False,
        )

        states = extract_states("Minh bị thương.", self.entities, FakeLLMService(response))

        self.assertEqual(len(states), 1)
        self.assertEqual(states[0].entity_id, "Minh")
        self.assertEqual(states[0].attribute, "health")

    def test_valid_empty_state_list_is_not_an_error(self) -> None:
        states = extract_states("Minh đứng yên.", self.entities, FakeLLMService('{"states":[]}'))
        self.assertEqual(states, [])

    def test_invalid_state_schema_is_explicit(self) -> None:
        response = json.dumps(
            {"states": [{"entity": "Minh", "attribute": "power", "value": "high", "confidence": 0.9}]}
        )
        with self.assertRaisesRegex(StateExtractionError, "schema validation"):
            extract_states("Minh mạnh lên.", self.entities, FakeLLMService(response))


if __name__ == "__main__":
    unittest.main()
