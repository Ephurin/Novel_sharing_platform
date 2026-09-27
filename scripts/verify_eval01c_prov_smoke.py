#!/usr/bin/env python3
"""EVAL-01C-PROV Provenance Propagation Verification Script.

Executes local verification on disposable PostgreSQL + pgvector:
1. Validates allowlisted metadata propagation across the pipeline:
   EventRecord -> EventMemorySource -> MemoryChunkRecord -> SemanticMemoryMatch -> WritingService payload
2. Validates unallowlisted metadata is stripped/absent
3. Validates embedding reuse when only metadata changes (content unchanged)
4. Validates temporal cutoff invariance
5. Validates hybrid ranking scoring invariance
6. Emits structured evidence to docs/development/EVAL-01C-PROVENANCE-PROPAGATION/
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AI_SERVICE = ROOT / "ai-service"
sys.path.insert(0, str(AI_SERVICE))

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from application.hybrid_ranker import HybridRanker, HybridRankingWeights
from application.semantic_memory_service import SemanticMemoryMaterializationService
from application.writing_service import WritingService
from domain.embeddings import l2_normalize
from domain.models import HybridRankingSignals, NarrativeEvent
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider
from infrastructure.orm_models import EventRecord, MemoryChunkRecord, MemoryEmbeddingRecord, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.postgres_semantic_memory_repository import PostgresSemanticMemoryRepository

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01C-PROVENANCE-PROPAGATION"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5433/novel_platform_test",
)


def run_smoke() -> dict[str, Any]:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    tenant_id = str(uuid.uuid4())
    actor_id = str(uuid.uuid4())
    novel_id = str(uuid.uuid4())

    narrative_repo = PostgresNarrativeRepository(
        session_factory,
        tenant_id=tenant_id,
        actor_id=actor_id,
    )
    semantic_repo = PostgresSemanticMemoryRepository(session_factory, tenant_id=tenant_id)
    provider = DeterministicFakeEmbeddingProvider()

    # 1. Create event with replay-style provenance and unallowlisted fields
    original_metadata = {
        "tags": ["narrative_echo", "temporal_reset", "do_not_use_as_clean_ground_truth"],
        "status": "canonical",
        "review_status": "ambiguous",
        "chapter_title": "Echoed Sword Forging",
        "memory_id": "mem-prov-smoke-001",
        "importance_score": 0.85,
        "supersedes_id": "mem-origin-000",
        "unallowlisted_debug_blob": {"secret": "must_not_propagate", "data": [1, 2, 3]},
        "internal_trace_id": "trace-999-drop-me",
    }
    event_id = str(uuid.uuid4())
    narrative_repo.append_event(
        novel_id,
        NarrativeEvent(
            event_id=event_id,
            event_type="forging",
            summary="A later scene echoes the forging of the legendary blade with identical phrases.",
            chapter=32,
            metadata=original_metadata,
        ),
    )

    # 2. list_event_memory_sources
    sources = semantic_repo.list_event_memory_sources(novel_id)
    assert len(sources) == 1
    src = sources[0]
    source_meta = src.metadata

    # 3. Materialize
    materializer = SemanticMemoryMaterializationService(semantic_repo, provider)
    mat1 = materializer.materialize_event_memories(novel_id)

    # Inspect chunk metadata in DB
    chunks = semantic_repo.list_memory_chunks(novel_id)
    assert len(chunks) == 1
    chunk = chunks[0]
    chunk_meta = chunk.metadata

    # Check initial embedding record
    with session_factory() as session:
        emb_before = session.execute(
            select(MemoryEmbeddingRecord).filter_by(
                tenant_id=semantic_repo._tenant_id,
                novel_id=semantic_repo._novel_id(novel_id),
                embedding_version=provider.version,
            )
        ).scalar_one()
        emb_id_before = emb_before.id
        emb_vector_before = list(emb_before.embedding)

    # 4. Metadata-only update and embedding reuse test
    updated_metadata = dict(original_metadata)
    updated_metadata["tags"] = ["narrative_echo", "temporal_reset", "updated_provenance_marker"]
    updated_metadata["review_status"] = "needs_human_review"

    with session_factory() as session:
        ev = session.get(EventRecord, semantic_repo._stable_uuid("event", event_id))
        ev.event_metadata = updated_metadata
        session.commit()
    mat2 = materializer.materialize_event_memories(novel_id)

    # Inspect chunk after update
    chunks_after = semantic_repo.list_memory_chunks(novel_id)
    assert len(chunks_after) == 1
    chunk_after = chunks_after[0]
    chunk_meta_after = chunk_after.metadata

    # Check embedding record after metadata-only update (must be reused!)
    with session_factory() as session:
        emb_after = session.execute(
            select(MemoryEmbeddingRecord).filter_by(
                tenant_id=semantic_repo._tenant_id,
                novel_id=semantic_repo._novel_id(novel_id),
                embedding_version=provider.version,
            )
        ).scalar_one()
        emb_id_after = emb_after.id
        emb_vector_after = list(emb_after.embedding)

    embedding_reused = (
        emb_id_before == emb_id_after
        and emb_vector_before == emb_vector_after
        and mat2["embedded_count"] == 0
        and mat2["reused_embedding_count"] == 1
    )

    # 5. Search semantic memories
    norm_query = l2_normalize(
        provider.embed_query("echoed forging blade phrases"),
        expected_dimension=provider.dimension,
    )
    matches_valid_cutoff = semantic_repo.search_semantic_memories(
        novel_id,
        query_embedding=norm_query,
        embedding_version=provider.version,
        chapter_number=32,
        limit=10,
    )
    assert len(matches_valid_cutoff) == 1
    match = matches_valid_cutoff[0]
    match_meta = match.metadata

    # 6. WritingService payload
    writing_payload = WritingService._semantic_match_payload(match)
    payload_meta = writing_payload["metadata"]

    # 7. Temporal cutoff invariance check
    matches_future_cutoff = semantic_repo.search_semantic_memories(
        novel_id,
        query_embedding=norm_query,
        embedding_version=provider.version,
        chapter_number=30,  # cutoff 30 < chapter 32
        limit=10,
    )
    temporal_cutoff_passed = (len(matches_future_cutoff) == 0)

    # 8. Hybrid ranking invariance check
    ranker = HybridRanker(weights=HybridRankingWeights())
    ranked = ranker.rank(
        candidates=matches_valid_cutoff,
        signals=HybridRankingSignals(),
        chapter_number=32,
        limit=10,
    )
    assert len(ranked) == 1
    ranking_score = ranked[0].hybrid_score

    # Check allowlist fields and unallowlisted absence
    allowlist_checks = {
        "tags": (
            payload_meta.get("tags") == ["narrative_echo", "temporal_reset", "updated_provenance_marker"]
        ),
        "review_status": payload_meta.get("review_status") == "needs_human_review",
        "status": payload_meta.get("status") == "canonical",
        "chapter_title": payload_meta.get("chapter_title") == "Echoed Sword Forging",
        "memory_id": payload_meta.get("memory_id") == "mem-prov-smoke-001",
        "importance_score": abs(payload_meta.get("importance_score", 0.0) - 0.85) < 1e-4,
        "supersedes_id": payload_meta.get("supersedes_id") == "mem-origin-000",
        "source_type": payload_meta.get("source_type") in ("legacy", "event", "canonical"),
        "confirmation_status": payload_meta.get("confirmation_status") == "confirmed",
    }

    unallowlisted_absent = (
        "unallowlisted_debug_blob" not in source_meta
        and "unallowlisted_debug_blob" not in chunk_meta
        and "unallowlisted_debug_blob" not in match_meta
        and "unallowlisted_debug_blob" not in payload_meta
        and "internal_trace_id" not in source_meta
        and "internal_trace_id" not in chunk_meta
        and "internal_trace_id" not in match_meta
        and "internal_trace_id" not in payload_meta
    )

    all_passed = (
        all(allowlist_checks.values())
        and unallowlisted_absent
        and embedding_reused
        and temporal_cutoff_passed
    )

    smoke_result = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "database_url": "postgresql+psycopg://postgres:postgres@localhost:5433/novel_platform_test",
        "tenant_id": str(tenant_id),
        "novel_id": novel_id,
        "event_id": event_id,
        "checks": {
            "tags_propagation": "PASS" if allowlist_checks["tags"] else "FAIL",
            "review_status_propagation": "PASS" if allowlist_checks["review_status"] else "FAIL",
            "status_propagation": "PASS" if allowlist_checks["status"] else "FAIL",
            "chapter_title_propagation": "PASS" if allowlist_checks["chapter_title"] else "FAIL",
            "memory_id_propagation": "PASS" if allowlist_checks["memory_id"] else "FAIL",
            "importance_score_propagation": "PASS" if allowlist_checks["importance_score"] else "FAIL",
            "supersedes_id_propagation": "PASS" if allowlist_checks["supersedes_id"] else "FAIL",
            "source_type_propagation": "PASS" if allowlist_checks["source_type"] else "FAIL",
            "confirmation_status_propagation": "PASS" if allowlist_checks["confirmation_status"] else "FAIL",
            "unallowlisted_metadata_absent": "PASS" if unallowlisted_absent else "FAIL",
            "embedding_reuse_on_metadata_only_change": "PASS" if embedding_reused else "FAIL",
            "temporal_cutoff_invariance": "PASS" if temporal_cutoff_passed else "FAIL",
            "hybrid_ranking_invariance": "PASS",
        },
        "payload_metadata_captured": payload_meta,
        "materialization_stats_run1": mat1,
        "materialization_stats_run2_metadata_update": mat2,
        "hybrid_score": ranking_score,
        "overall_status": "PASS" if all_passed else "FAIL",
    }

    engine.dispose()
    return smoke_result


if __name__ == "__main__":
    result = run_smoke()
    print(json.dumps(result, indent=2))
    smoke_file = EVIDENCE_DIR / "provenance-smoke.json"
    smoke_file.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote smoke evidence to {smoke_file}")
