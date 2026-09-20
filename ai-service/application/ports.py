from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class RevisionContent:
    revision_id: str
    novel_id: str
    chapter_id: str
    content: str
    content_hash: str
    chapter_number: int | None = None



class RevisionContentProvider(Protocol):
    def get_revision(
        self, *, tenant_id: str, novel_id: str, chapter_id: str, revision_id: str
    ) -> RevisionContent: ...


class RevisionNotFoundError(Exception):
    pass


class ContentHashMismatchError(Exception):
    pass
