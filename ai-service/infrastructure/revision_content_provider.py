from __future__ import annotations

import json
from typing import Any, Callable
from urllib import error, request

from application.ports import RevisionContent, RevisionContentProvider, RevisionNotFoundError


class InMemoryRevisionContentProvider:
    def __init__(self, revisions: list[RevisionContent] | None = None) -> None:
        self._revisions = {
            (item.novel_id, item.chapter_id, item.revision_id): item
            for item in revisions or []
        }

    def get_revision(
        self, *, tenant_id: str, novel_id: str, chapter_id: str, revision_id: str
    ) -> RevisionContent:
        try:
            return self._revisions[(novel_id, chapter_id, revision_id)]
        except KeyError as exc:
            raise RevisionNotFoundError(revision_id) from exc


class UnavailableRevisionContentProvider:
    def get_revision(
        self, *, tenant_id: str, novel_id: str, chapter_id: str, revision_id: str
    ) -> RevisionContent:
        raise RevisionNotFoundError(
            "No Platform revision provider is configured; inject an integration adapter"
        )


class PlatformRevisionClient:
    def __init__(
        self,
        base_url: str,
        service_token: str,
        *,
        timeout_seconds: int = 10,
        opener: Callable[..., Any] = request.urlopen,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._service_token = service_token
        self._timeout_seconds = timeout_seconds
        self._opener = opener

    def get_revision(
        self, *, tenant_id: str, novel_id: str, chapter_id: str, revision_id: str
    ) -> RevisionContent:
        headers = {
            "Accept": "application/json",
            "X-Tenant-Id": tenant_id,
        }
        if self._service_token:
            headers["Authorization"] = f"Bearer {self._service_token}"
        req = request.Request(
            f"{self._base_url}/internal/v1/revisions/{revision_id}",
            headers=headers,
            method="GET",
        )
        try:
            with self._opener(req, timeout=self._timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            if exc.code == 404:
                raise RevisionNotFoundError(revision_id) from exc
            raise RuntimeError(f"Platform revision request failed: HTTP {exc.code}") from exc
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError("Platform revision request failed") from exc

        data = payload.get("data", payload) if isinstance(payload, dict) else {}
        required = {"revision_id", "novel_id", "chapter_id", "content", "content_hash"}
        if not required.issubset(data):
            raise RuntimeError("Platform revision response has an invalid schema")
        if (
            str(data["revision_id"]) != revision_id
            or str(data["novel_id"]) != novel_id
            or str(data["chapter_id"]) != chapter_id
        ):
            raise RevisionNotFoundError(revision_id)
        ch_num = data.get("chapter_number")
        return RevisionContent(
            revision_id=str(data["revision_id"]),
            novel_id=str(data["novel_id"]),
            chapter_id=str(data["chapter_id"]),
            content=str(data["content"]),
            content_hash=str(data["content_hash"]),
            chapter_number=int(ch_num) if ch_num is not None else None,
        )




def build_revision_content_provider(
    base_url: str, service_token: str, timeout_seconds: int
) -> RevisionContentProvider:
    if not base_url:
        return UnavailableRevisionContentProvider()
    return PlatformRevisionClient(
        base_url, service_token, timeout_seconds=timeout_seconds
    )
