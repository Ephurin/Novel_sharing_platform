import json
import unittest

from infrastructure.revision_content_provider import PlatformRevisionClient


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class PlatformRevisionClientTests(unittest.TestCase):
    def test_fetches_revision_with_tenant_and_service_auth(self) -> None:
        captured = {}

        def opener(req, timeout):
            captured["url"] = req.full_url
            captured["tenant"] = req.get_header("X-tenant-id")
            captured["authorization"] = req.get_header("Authorization")
            captured["timeout"] = timeout
            return FakeResponse(
                {
                    "data": {
                        "revision_id": "revision-1",
                        "novel_id": "novel-1",
                        "chapter_id": "chapter-1",
                        "content": "Nội dung",
                        "content_hash": "a" * 64,
                    }
                }
            )

        client = PlatformRevisionClient(
            "https://platform.example",
            "service-secret",
            timeout_seconds=7,
            opener=opener,
        )
        revision = client.get_revision(
            tenant_id="tenant-1",
            novel_id="novel-1",
            chapter_id="chapter-1",
            revision_id="revision-1",
        )

        self.assertEqual(revision.content, "Nội dung")
        self.assertEqual(
            captured["url"], "https://platform.example/internal/v1/revisions/revision-1"
        )
        self.assertEqual(captured["tenant"], "tenant-1")
        self.assertEqual(captured["authorization"], "Bearer service-secret")
        self.assertEqual(captured["timeout"], 7)
