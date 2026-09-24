from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from core.exceptions import KBWriteError
from fastapi.testclient import TestClient

from api.deps import get_settings
from core.story_kb_manager import StoryKB, StoryKBManager
from main import app


class LegacyJsonReadOnlyTests(unittest.TestCase):
    def test_read_only_manager_can_read_existing_snapshot_but_cannot_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = Path(temp_dir)
            writable = StoryKBManager(storage)
            writable.save_kb("story-1", StoryKB(story_id="story-1"))
            source = storage / "story-1.json"
            before = hashlib.sha256(source.read_bytes()).hexdigest()

            readonly = StoryKBManager(storage, read_only=True)
            loaded = readonly.load_kb("story-1")
            self.assertEqual(loaded.story_id, "story-1")

            with self.assertRaisesRegex(KBWriteError, "read-only"):
                readonly.upsert_entity(
                    "story-1",
                    {"word": "Elena", "entity": "CHARACTER"},
                )

            after = hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertEqual(before, after)

    def test_read_only_manager_blocks_atomic_narrative_save(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = StoryKBManager(Path(temp_dir), read_only=True)
            with self.assertRaisesRegex(KBWriteError, "read-only"):
                manager.save_narrative_kb("story-2", StoryKB(story_id="story-2"))

            self.assertFalse((Path(temp_dir) / "story-2.json").exists())

    def test_legacy_kb_confirm_fails_closed_with_deprecation_headers(self) -> None:
        class TestSettings:
            service_auth_disabled = True

        original_manager = app.state.story_kb
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                app.state.story_kb = StoryKBManager(Path(temp_dir), read_only=True)
                app.dependency_overrides[get_settings] = lambda: TestSettings()
                client = TestClient(app)

                response = client.post(
                    "/v1/ai/kb/confirm",
                    json={"story_id": "story-3", "approved_candidates": []},
                )

                self.assertEqual(response.status_code, 409)
                self.assertEqual(
                    response.json()["detail"]["code"],
                    "LEGACY_JSON_READ_ONLY",
                )
                self.assertEqual(response.headers["deprecation"], "true")
                self.assertIn("successor-version", response.headers["link"])
                self.assertFalse((Path(temp_dir) / "story-3.json").exists())
        finally:
            app.state.story_kb = original_manager
            app.dependency_overrides.pop(get_settings, None)


if __name__ == "__main__":
    unittest.main()
