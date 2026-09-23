from __future__ import annotations

import math
from typing import Protocol, Sequence, runtime_checkable


class EmbeddingProviderError(RuntimeError):
    """Raised when an embedding provider cannot produce a valid vector."""


def l2_normalize(values: Sequence[float], *, expected_dimension: int) -> tuple[float, ...]:
    vector = tuple(float(value) for value in values)
    if len(vector) != expected_dimension:
        raise EmbeddingProviderError(
            f"Embedding dimension mismatch: expected {expected_dimension}, got {len(vector)}"
        )
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        raise EmbeddingProviderError("Embedding vector has zero norm")
    return tuple(value / norm for value in vector)


@runtime_checkable
class EmbeddingProvider(Protocol):
    model: str
    version: str
    dimension: int

    def embed_document(self, text: str) -> Sequence[float]: ...
