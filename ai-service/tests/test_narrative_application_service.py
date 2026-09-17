import inspect
import unittest

from application.narrative_service import NarrativeApplicationService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository


class NarrativeApplicationServiceTests(unittest.TestCase):
    def test_sync_entities_uses_repository_and_preserves_failure_details(self) -> None:
        service = NarrativeApplicationService(InMemoryNarrativeRepository())

        updates = service.sync_entities(
            "story-1",
            [
                {"word": "Minh", "entity": "CHARACTER"},
                {"word": "Đế đô", "entity": "LOCATION"},
            ],
        )

        self.assertEqual([item["status"] for item in updates], ["updated", "updated"])
        self.assertEqual(service.known_locations("story-1"), {"Đế đô"})

    def test_application_layer_has_no_filesystem_dependency(self) -> None:
        source = inspect.getsource(NarrativeApplicationService)

        self.assertNotIn("Path(", source)
        self.assertNotIn("open(", source)
