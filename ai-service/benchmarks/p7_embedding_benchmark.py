#!/usr/bin/env python3
"""Offline/remote benchmark harness for Phase 7 semantic retrieval.

This module is intentionally outside the production retrieval path. It evaluates
recent-only and embedding-only ranking against the frozen Aethelgard corpus.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from pathlib import Path
from typing import Any, Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORPUS = REPO_ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
DEFAULT_QUERIES = REPO_ROOT / ".data" / "Frozen_v1" / "core_gold_queries.json"
DEFAULT_KS = (5, 10, 20)


class BenchmarkError(RuntimeError):
    """Raised when a benchmark configuration cannot be executed safely."""


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def l2_normalize(vector: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(float(value) * float(value) for value in vector))
    if norm == 0.0:
        raise BenchmarkError("Embedding vector has zero norm")
    return [float(value) / norm for value in vector]


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise BenchmarkError(
            f"Embedding dimension mismatch: {len(left)} != {len(right)}"
        )
    return sum(float(a) * float(b) for a, b in zip(left, right))


def _gain(grade: int) -> float:
    return float((2**grade) - 1) if grade > 0 else 0.0


def evaluate_ranked_ids(
    query: dict[str, Any],
    ranked_ids: Sequence[str],
    ks: Sequence[int] = DEFAULT_KS,
) -> dict[str, Any]:
    grades = {
        str(label["memory_id"]): int(label["grade"])
        for label in query.get("labels", [])
    }
    positives = [memory_id for memory_id, grade in grades.items() if grade > 0]
    if not positives:
        raise BenchmarkError(f"Query {query.get('query_id')} has no positive labels")

    metrics: dict[str, Any] = {}
    for k in ks:
        top = list(ranked_ids[:k])
        hits = [memory_id for memory_id in top if grades.get(memory_id, 0) > 0]
        recall = len(hits) / len(positives)

        reciprocal_rank = 0.0
        for index, memory_id in enumerate(top):
            if grades.get(memory_id, 0) > 0:
                reciprocal_rank = 1.0 / float(index + 1)
                break

        dcg = sum(
            _gain(grades.get(memory_id, 0)) / math.log2(index + 2)
            for index, memory_id in enumerate(top)
        )
        ideal_grades = sorted(
            (grade for grade in grades.values() if grade > 0),
            reverse=True,
        )[:k]
        idcg = sum(
            _gain(grade) / math.log2(index + 2)
            for index, grade in enumerate(ideal_grades)
        )
        ndcg = dcg / idcg if idcg else 0.0

        metrics[str(k)] = {
            "recall": recall,
            "reciprocal_rank": reciprocal_rank,
            "ndcg": ndcg,
            "hits": hits,
            "ranked_ids": top,
        }
    return metrics


def aggregate_metrics(
    per_query: Sequence[dict[str, Any]],
    ks: Sequence[int] = DEFAULT_KS,
) -> dict[str, Any]:
    if not per_query:
        raise BenchmarkError("No query results to aggregate")

    aggregate: dict[str, Any] = {}
    for k in ks:
        key = str(k)
        recall_values = [item["metrics"][key]["recall"] for item in per_query]
        rr_values = [item["metrics"][key]["reciprocal_rank"] for item in per_query]
        ndcg_values = [item["metrics"][key]["ndcg"] for item in per_query]
        aggregate[key] = {
            "recall_at_k": statistics.fmean(recall_values),
            "mrr_at_k": statistics.fmean(rr_values),
            "ndcg_at_k": statistics.fmean(ndcg_values),
            "hit_query_rate": statistics.fmean(
                1.0 if value > 0.0 else 0.0 for value in recall_values
            ),
        }
    return aggregate


def recent_rank(
    memories: Sequence[dict[str, Any]],
    chapter_cutoff: int,
) -> list[str]:
    eligible = [
        memory
        for memory in memories
        if int(memory["chapter_number"]) <= int(chapter_cutoff)
    ]
    eligible.sort(
        key=lambda memory: (
            int(memory["chapter_number"]),
            str(memory["memory_id"]),
        ),
        reverse=True,
    )
    return [str(memory["memory_id"]) for memory in eligible]


def semantic_rank(
    memories: Sequence[dict[str, Any]],
    memory_vectors: dict[str, Sequence[float]],
    query_vector: Sequence[float],
    chapter_cutoff: int,
) -> list[str]:
    eligible = [
        memory
        for memory in memories
        if int(memory["chapter_number"]) <= int(chapter_cutoff)
    ]
    scored: list[tuple[float, str]] = []
    for memory in eligible:
        memory_id = str(memory["memory_id"])
        try:
            vector = memory_vectors[memory_id]
        except KeyError as exc:
            raise BenchmarkError(f"Missing vector for memory {memory_id}") from exc
        scored.append((cosine_similarity(vector, query_vector), memory_id))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [memory_id for _, memory_id in scored]


def run_recent(
    memories: Sequence[dict[str, Any]],
    queries: Sequence[dict[str, Any]],
    ks: Sequence[int],
) -> dict[str, Any]:
    started = time.perf_counter()
    per_query: list[dict[str, Any]] = []
    for query in queries:
        ranked = recent_rank(memories, int(query["chapter_cutoff"]))
        per_query.append(
            {
                "query_id": query["query_id"],
                "metrics": evaluate_ranked_ids(query, ranked, ks),
            }
        )
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return {
        "provider": "recent",
        "model": "chapter-recency-only",
        "dimension": None,
        "query_count": len(queries),
        "memory_count": len(memories),
        "ranking_elapsed_ms": elapsed_ms,
        "aggregate": aggregate_metrics(per_query, ks),
        "per_query": per_query,
    }


def _chunks(values: Sequence[str], batch_size: int) -> Iterable[Sequence[str]]:
    for start in range(0, len(values), batch_size):
        yield values[start : start + batch_size]


def _gemini_contents(texts: Sequence[str], model: str, *, is_query: bool) -> list[Any]:
    from google.genai import types

    if model == "gemini-embedding-2":
        prefix = (
            "Represent this narrative retrieval query for semantic search: "
            if is_query
            else "Represent this canonical narrative memory for semantic search: "
        )
        return [
            types.Content(parts=[types.Part.from_text(text=prefix + text)])
            for text in texts
        ]
    return list(texts)


def embed_gemini(
    texts: Sequence[str],
    *,
    model: str,
    dimension: int,
    batch_size: int,
    is_query: bool,
) -> tuple[list[list[float]], dict[str, Any]]:
    try:
        from google import genai
        from google.genai import types
    except Exception as exc:
        raise BenchmarkError(
            "google-genai is required for provider=gemini"
        ) from exc

    raw_keys = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not raw_keys:
        raise BenchmarkError("GEMINI_API_KEY or GOOGLE_API_KEY is required")

    keys = [k.strip() for k in raw_keys.replace(";", ",").split(",") if k.strip()]
    clients = [genai.Client(api_key=k) for k in keys]
    current_client_idx = 0

    vectors: list[list[float]] = []
    request_latencies: list[float] = []

    for batch in _chunks(list(texts), batch_size):
        config_kwargs: dict[str, Any] = {"output_dimensionality": dimension}
        if model == "gemini-embedding-001":
            config_kwargs["task_type"] = (
                "RETRIEVAL_QUERY" if is_query else "RETRIEVAL_DOCUMENT"
            )

        max_attempts = max(10, len(keys) * 3)
        response = None
        for attempt in range(max_attempts):
            client = clients[current_client_idx]
            started = time.perf_counter()
            try:
                response = client.models.embed_content(
                    model=model,
                    contents=_gemini_contents(batch, model, is_query=is_query),
                    config=types.EmbedContentConfig(**config_kwargs),
                )
                request_latencies.append((time.perf_counter() - started) * 1000.0)
                break
            except Exception as exc:
                err_str = str(exc)
                if ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str) and attempt < max_attempts - 1:
                    if len(clients) > 1:
                        current_client_idx = (current_client_idx + 1) % len(clients)
                        time.sleep(2)
                    else:
                        time.sleep(25)
                    continue
                raise

        if response is None:
            raise BenchmarkError("Failed to embed batch after retries")

        response_vectors = [
            l2_normalize(embedding.values)
            for embedding in (response.embeddings or [])
        ]
        if len(response_vectors) != len(batch):
            raise BenchmarkError(
                f"Gemini returned {len(response_vectors)} embeddings for "
                f"batch of {len(batch)} inputs"
            )
        vectors.extend(response_vectors)

    return vectors, {
        "request_count": len(request_latencies),
        "batch_size": batch_size,
        "request_latency_ms": request_latencies,
        "p50_request_latency_ms": statistics.median(request_latencies)
        if request_latencies
        else 0.0,
        "mean_request_latency_ms": statistics.fmean(request_latencies)
        if request_latencies
        else 0.0,
    }


def embed_openai(
    texts: Sequence[str],
    *,
    model: str,
    dimension: int,
    batch_size: int,
    is_query: bool,
    base_url: str | None = None,
) -> tuple[list[list[float]], dict[str, Any]]:
    del is_query  # OpenAI embedding-v3 does not expose a retrieval task-type parameter.
    try:
        from openai import OpenAI
    except Exception as exc:
        raise BenchmarkError("openai is required for provider=openai") from exc

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise BenchmarkError("OPENAI_API_KEY is required")

    client = OpenAI(api_key=api_key, base_url=base_url or None)
    vectors: list[list[float]] = []
    request_latencies: list[float] = []

    for batch in _chunks(list(texts), batch_size):
        started = time.perf_counter()
        response = client.embeddings.create(
            model=model,
            input=list(batch),
            dimensions=dimension,
            encoding_format="float",
        )
        request_latencies.append((time.perf_counter() - started) * 1000.0)
        ordered = sorted(response.data, key=lambda item: item.index)
        response_vectors = [l2_normalize(item.embedding) for item in ordered]
        if len(response_vectors) != len(batch):
            raise BenchmarkError(
                f"OpenAI returned {len(response_vectors)} embeddings for "
                f"batch of {len(batch)} inputs"
            )
        vectors.extend(response_vectors)

    return vectors, {
        "request_count": len(request_latencies),
        "batch_size": batch_size,
        "request_latency_ms": request_latencies,
        "p50_request_latency_ms": statistics.median(request_latencies)
        if request_latencies
        else 0.0,
        "mean_request_latency_ms": statistics.fmean(request_latencies)
        if request_latencies
        else 0.0,
    }


def run_embedding(
    *,
    provider: str,
    model: str,
    dimension: int,
    batch_size: int,
    memories: Sequence[dict[str, Any]],
    queries: Sequence[dict[str, Any]],
    ks: Sequence[int],
    base_url: str | None,
) -> dict[str, Any]:
    embedder = embed_gemini if provider == "gemini" else embed_openai
    memory_texts = [str(memory["content"]) for memory in memories]
    query_texts = [str(query["query"]) for query in queries]

    embed_kwargs = {
        "model": model,
        "dimension": dimension,
        "batch_size": batch_size,
    }
    if provider == "openai":
        embed_kwargs["base_url"] = base_url

    memory_started = time.perf_counter()
    memory_vectors, memory_latency = embedder(
        memory_texts,
        is_query=False,
        **embed_kwargs,
    )
    memory_elapsed_ms = (time.perf_counter() - memory_started) * 1000.0

    query_started = time.perf_counter()
    query_vectors, query_latency = embedder(
        query_texts,
        is_query=True,
        **embed_kwargs,
    )
    query_elapsed_ms = (time.perf_counter() - query_started) * 1000.0

    vector_by_memory_id = {
        str(memory["memory_id"]): vector
        for memory, vector in zip(memories, memory_vectors)
    }

    ranking_started = time.perf_counter()
    per_query: list[dict[str, Any]] = []
    for query, query_vector in zip(queries, query_vectors):
        ranked = semantic_rank(
            memories,
            vector_by_memory_id,
            query_vector,
            int(query["chapter_cutoff"]),
        )
        per_query.append(
            {
                "query_id": query["query_id"],
                "metrics": evaluate_ranked_ids(query, ranked, ks),
            }
        )
    ranking_elapsed_ms = (time.perf_counter() - ranking_started) * 1000.0

    return {
        "provider": provider,
        "model": model,
        "dimension": dimension,
        "query_count": len(queries),
        "memory_count": len(memories),
        "memory_embedding_elapsed_ms": memory_elapsed_ms,
        "query_embedding_elapsed_ms": query_elapsed_ms,
        "ranking_elapsed_ms": ranking_elapsed_ms,
        "memory_embedding_requests": memory_latency,
        "query_embedding_requests": query_latency,
        "raw_float32_vector_bytes": len(memories) * dimension * 4,
        "raw_float32_vector_mib": (len(memories) * dimension * 4) / (1024**2),
        "aggregate": aggregate_metrics(per_query, ks),
        "per_query": per_query,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--provider",
        choices=("recent", "gemini", "openai"),
        required=True,
    )
    parser.add_argument("--model", default="")
    parser.add_argument("--dimension", type=int, default=768)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--queries", type=Path, default=DEFAULT_QUERIES)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--ks",
        type=int,
        nargs="+",
        default=list(DEFAULT_KS),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.dimension <= 0:
        raise BenchmarkError("--dimension must be positive")
    if args.batch_size <= 0:
        raise BenchmarkError("--batch-size must be positive")

    corpus_payload = load_json(args.corpus)
    query_payload = load_json(args.queries)
    memories = list(corpus_payload["memories"])
    queries = list(query_payload["queries"])
    ks = tuple(sorted(set(int(value) for value in args.ks if int(value) > 0)))
    if not ks:
        raise BenchmarkError("--ks must contain at least one positive integer")

    if args.provider == "recent":
        result = run_recent(memories, queries, ks)
    else:
        default_models = {
            "gemini": "gemini-embedding-001",
            "openai": "text-embedding-3-small",
        }
        model = args.model.strip() or default_models[args.provider]
        result = run_embedding(
            provider=args.provider,
            model=model,
            dimension=args.dimension,
            batch_size=args.batch_size,
            memories=memories,
            queries=queries,
            ks=ks,
            base_url=args.base_url,
        )

    result["dataset_version"] = query_payload.get("dataset_version")
    result["corpus_path"] = str(args.corpus)
    result["query_path"] = str(args.queries)
    result["ks"] = list(ks)

    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
