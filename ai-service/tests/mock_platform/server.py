"""
Mock Platform Server for Narrative Memory Phase 4 testing.
Provides GET /internal/v1/revisions/{revision_id} matching PlatformRevisionClient contract.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [mock-platform] %(levelname)s: %(message)s",
)
logger = logging.getLogger("mock-platform")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# Default deterministic fixtures
FIXTURES: dict[str, dict[str, Any]] = {}


def register_fixture(
    *,
    revision_id: str,
    novel_id: str,
    chapter_id: str,
    content: str,
    tenant_id: str = "00000000-0000-0000-0000-000000000001",
) -> None:
    FIXTURES[revision_id] = {
        "tenant_id": tenant_id,
        "revision_id": revision_id,
        "novel_id": novel_id,
        "chapter_id": chapter_id,
        "content": content,
        "content_hash": sha256_text(content),
    }


# Seed default test fixtures
REV_1_CONTENT = (
    "Tiêu Viêm thi triển Dị Hỏa đối đầu Hải Ba Đông tại sa mạc Tháp Qua Nhĩ. "
    "Sau một hồi kịch chiến dữ dội, Hải Ba Đông bị thương nặng và suy giảm sức chiến đấu."
)
register_fixture(
    revision_id="33333333-3333-3333-3333-333333333333",
    novel_id="11111111-1111-1111-1111-111111111111",
    chapter_id="22222222-2222-2222-2222-222222222222",
    content=REV_1_CONTENT,
)

REV_2_CONTENT = (
    "Ngày hôm sau tại cổ thành Mạc Gia, Tiêu Viêm cùng Hải Ba Đông tiến vào đại điện. "
    "Hải Ba Đông tiếp tục bị thương nhẹ khi phá vỡ trận pháp phòng thủ."
)
register_fixture(
    revision_id="33333333-3333-3333-3333-333333333334",
    novel_id="11111111-1111-1111-1111-111111111111",
    chapter_id="22222222-2222-2222-2222-222222222223",
    content=REV_2_CONTENT,
)

SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "test-token")


class MockPlatformHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        logger.info("%s - - [%s] %s", self.client_address[0], self.log_date_time_string(), format % args)

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in {"/health", "/healthz"}:
            self._send_json(HTTPStatus.OK, {"status": "ok", "service": "mock-platform"})
            return

        if path.startswith("/internal/v1/revisions/"):
            revision_id = path[len("/internal/v1/revisions/") :].strip("/")
            # Validate headers
            tenant_header = self.headers.get("X-Tenant-Id")
            if not tenant_header:
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"detail": "Missing X-Tenant-Id header"},
                )
                return

            if SERVICE_TOKEN:
                auth_header = self.headers.get("Authorization", "")
                expected_auth = f"Bearer {SERVICE_TOKEN}"
                if auth_header != expected_auth:
                    self._send_json(
                        HTTPStatus.UNAUTHORIZED,
                        {"detail": "Invalid or missing service token"},
                    )
                    return

            fixture = FIXTURES.get(revision_id)
            if not fixture:
                self._send_json(
                    HTTPStatus.NOT_FOUND,
                    {"detail": f"Revision {revision_id} not found"},
                )
                return

            if fixture["tenant_id"] != tenant_header:
                self._send_json(
                    HTTPStatus.NOT_FOUND,
                    {"detail": f"Revision {revision_id} does not belong to tenant {tenant_header}"},
                )
                return

            self._send_json(HTTPStatus.OK, {"data": fixture})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Endpoint not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/internal/v1/revisions":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"detail": "Invalid JSON"})
                return

            required = {"revision_id", "novel_id", "chapter_id", "content"}
            if not required.issubset(data):
                self._send_json(
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    {"detail": f"Missing required fields: {required - set(data.keys())}"},
                )
                return

            register_fixture(
                revision_id=str(data["revision_id"]),
                novel_id=str(data["novel_id"]),
                chapter_id=str(data["chapter_id"]),
                content=str(data["content"]),
                tenant_id=str(data.get("tenant_id", "00000000-0000-0000-0000-000000000001")),
            )
            self._send_json(HTTPStatus.CREATED, {"data": FIXTURES[str(data["revision_id"])]})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Endpoint not found"})


def run(port: int = 8080) -> None:
    server = HTTPServer(("0.0.0.0", port), MockPlatformHandler)
    logger.info("Mock Platform server listening on port %s", port)
    logger.info("Registered %d initial fixtures", len(FIXTURES))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down mock-platform...")
        server.server_close()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    run(port)
