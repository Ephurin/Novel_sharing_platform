from __future__ import annotations

import hashlib
import os
import time
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
        return self._embed_many(
            (text,),
            DOCUMENT_INSTRUCTION,
            kind="document",
            retry_rate_limits=False,
        )[0]

    def embed_documents(self, texts: tuple[str, ...] | list[str]) -> tuple[tuple[float, ...], ...]:
        return self._embed_many(
            tuple(texts),
            DOCUMENT_INSTRUCTION,
            kind="document",
            retry_rate_limits=True,
        )

    def embed_query(self, text: str) -> tuple[float, ...]:
        return self._embed_many(
            (text,),
            QUERY_INSTRUCTION,
            kind="query",
            retry_rate_limits=False,
        )[0]

    def _embed_many(
        self,
        texts: tuple[str, ...],
        prefix: str,
        *,
        kind: str,
        retry_rate_limits: bool,
    ) -> tuple[tuple[float, ...], ...]:
        if os.getenv("BUDGET_GUARD_URL") or os.getenv("BUDGET_GUARD_MODE") == "proxy":
            raise EmbeddingProviderError("GUARDED_P1_EMBEDDING_DISABLED")
        if not texts or any(not text.strip() for text in texts):
            raise EmbeddingProviderError(
                f"Cannot embed empty semantic-memory {kind}"
            )
        try:
            from google import genai
            from google.genai import types

            client = self._client or genai.Client(api_key=self._api_key)
            delays = (5, 15, 30)
            response = None
            for attempt in range(len(delays) + 1):
                try:
                    response = client.models.embed_content(
                        model=self.model,
                        contents=[
                            types.Content(
                                parts=[types.Part.from_text(text=prefix + text)]
                            )
                            for text in texts
                        ],
                        config=types.EmbedContentConfig(
                            output_dimensionality=self.dimension
                        ),
                    )
                    break
                except Exception as exc:
                    error_text = str(exc)
                    rate_limited = (
                        "429" in error_text
                        or "RESOURCE_EXHAUSTED" in error_text
                    )
                    if (
                        retry_rate_limits
                        and rate_limited
                        and attempt < len(delays)
                    ):
                        time.sleep(delays[attempt])
                        continue
                    raise

            embeddings = list(response.embeddings or []) if response is not None else []
            if len(embeddings) != len(texts):
                raise EmbeddingProviderError(
                    f"Gemini returned {len(embeddings)} embeddings for "
                    f"{len(texts)} {kind} inputs"
                )
            vectors: list[tuple[float, ...]] = []
            for embedding in embeddings:
                values = tuple(float(value) for value in embedding.values)
                if len(values) != self.dimension:
                    raise EmbeddingProviderError(
                        f"Gemini embedding dimension mismatch: expected {self.dimension}, "
                        f"got {len(values)}"
                    )
                vectors.append(values)
            return tuple(vectors)
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

    def embed_documents(
        self,
        texts: tuple[str, ...] | list[str],
    ) -> tuple[tuple[float, ...], ...]:
        return tuple(self.embed_document(text) for text in texts)

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
