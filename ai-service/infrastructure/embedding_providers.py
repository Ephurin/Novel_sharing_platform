from __future__ import annotations

import hashlib
import math
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
        mode = os.getenv("AI_EXECUTION_MODE", "offline_test").lower().strip()
        guard_url = os.getenv("BUDGET_GUARD_URL", "").rstrip("/")
        guard_token = os.getenv("BUDGET_GUARD_AUTH_TOKEN", "").strip()

        if mode == "offline_test":
            if guard_url or os.getenv("BUDGET_GUARD_MODE") == "proxy":
                raise EmbeddingProviderError("GUARDED_P1_EMBEDDING_DISABLED")
        elif mode == "live_free_tier":
            if not guard_url or not guard_token or os.getenv("BUDGET_GUARD_MODE") != "proxy":
                raise EmbeddingProviderError("GUARD_CONFIGURATION_INVALID")
            from urllib.parse import urlparse
            parsed = urlparse(guard_url)
            if (
                parsed.scheme not in {"http", "https"}
                or parsed.hostname not in {"budget-gateway", "127.0.0.1", "localhost"}
                or parsed.path
                or parsed.query
                or parsed.username
            ):
                raise EmbeddingProviderError("GUARD_CONFIGURATION_INVALID")
        else:
            raise EmbeddingProviderError(f"UNSUPPORTED_EXECUTION_MODE: {mode}")

        if not texts or any(not text.strip() for text in texts):
            raise EmbeddingProviderError(
                f"Cannot embed empty semantic-memory {kind}"
            )

        forbidden_tokens = (
            '"author_notes"', '"private_author_notes"', '"authornotes"', '"privateauthornotes"',
            '"private_notes"', '"privatenotes"'
        )
        for t in texts:
            lowered = t.lower()
            if any(tok in lowered for tok in forbidden_tokens):
                raise EmbeddingProviderError("PRIVATE_NOTES_FORBIDDEN_IN_PROMPT")

        try:
            from google import genai
            from google.genai import types

            if guard_url:
                client = genai.Client(
                    api_key=guard_token,
                    http_options=types.HttpOptions(
                        base_url=guard_url,
                        api_version="v1beta",
                        headers={"Authorization": f"Bearer {guard_token}"},
                        client_args={"trust_env": False},
                        retry_options=types.HttpRetryOptions(attempts=1),
                    ),
                )
            else:
                if mode == "live_free_tier":
                    raise EmbeddingProviderError("GUARD_CONFIGURATION_INVALID")
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
                if not all(math.isfinite(v) and not math.isnan(v) for v in values):
                    raise EmbeddingProviderError("Gemini embedding returned NaN or non-finite vector")
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
