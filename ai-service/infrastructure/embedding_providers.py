from __future__ import annotations

import hashlib
import os
from typing import Any

from domain.embeddings import EmbeddingProviderError


DOCUMENT_INSTRUCTION = "Represent this canonical narrative memory for semantic search: "
QUERY_INSTRUCTION = "Represent this narrative retrieval query for semantic search: "


class GeminiEmbeddingProvider:
    """Production ADR-012 document/query embedding adapter."""

    model = "gemini-embedding-2"
    version = "gemini-embedding-2-768-v1"
    dimension = 768

    def __init__(
        self,
        *,
        api_key: str | None = None,
        client: Any | None = None,
    ) -> None:
        self._client = client
        self._api_key = (
            api_key
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or ""
        ).strip()
        if self._client is None and not self._api_key:
            raise EmbeddingProviderError(
                "GEMINI_API_KEY or GOOGLE_API_KEY is required for Gemini embeddings"
            )

    def embed_document(self, text: str) -> tuple[float, ...]:
        return self._embed_prefixed(text, DOCUMENT_INSTRUCTION, kind="document")

    def embed_query(self, text: str) -> tuple[float, ...]:
        return self._embed_prefixed(text, QUERY_INSTRUCTION, kind="query")

    def _embed_prefixed(
        self,
        text: str,
        prefix: str,
        *,
        kind: str,
    ) -> tuple[float, ...]:
        if not text.strip():
            raise EmbeddingProviderError(f"Cannot embed empty semantic-memory {kind}")
        try:
            from google import genai
            from google.genai import types

            client = self._client or genai.Client(api_key=self._api_key)
            response = client.models.embed_content(
                model=self.model,
                contents=[
                    types.Content(
                        parts=[types.Part.from_text(text=prefix + text)]
                    )
                ],
                config=types.EmbedContentConfig(
                    output_dimensionality=self.dimension
                ),
            )
            embeddings = list(response.embeddings or [])
            if len(embeddings) != 1:
                raise EmbeddingProviderError(
                    f"Gemini returned {len(embeddings)} embeddings for one {kind}"
                )
            values = tuple(float(value) for value in embeddings[0].values)
            if len(values) != self.dimension:
                raise EmbeddingProviderError(
                    f"Gemini embedding dimension mismatch: expected {self.dimension}, "
                    f"got {len(values)}"
                )
            return values
        except EmbeddingProviderError:
            raise
        except Exception as exc:
            raise EmbeddingProviderError(
                f"Gemini embedding request failed: {type(exc).__name__}"
            ) from exc


class DeterministicFakeEmbeddingProvider:
    """Deterministic non-network embedding provider for tests and local fixtures."""

    model = "fake-embedding"
    version = "fake-embedding-768-v1"
    dimension = 768

    def embed_document(self, text: str) -> tuple[float, ...]:
        return self._embed_prefixed(text, DOCUMENT_INSTRUCTION, kind="document")

    def embed_query(self, text: str) -> tuple[float, ...]:
        return self._embed_prefixed(text, QUERY_INSTRUCTION, kind="query")

    def _embed_prefixed(
        self,
        text: str,
        prefix: str,
        *,
        kind: str,
    ) -> tuple[float, ...]:
        if not text.strip():
            raise EmbeddingProviderError(f"Cannot embed empty semantic-memory {kind}")
        digest = hashlib.sha512((prefix + text).encode("utf-8")).digest()
        return tuple(
            (float(digest[index % len(digest)]) - 127.5) / 127.5
            for index in range(self.dimension)
        )
