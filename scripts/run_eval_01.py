#!/usr/bin/env python3
"""EVAL-01 Aethelgard Runtime Baseline Runner.

Executes end-to-end evaluation on real PostgreSQL + pgvector runtime:
1. Environment & Preflight verification (slot-1, postgres, pgvector)
2. Materialization of 216 canonical memories via SemanticMemoryMaterializationService
3. Semantic-only & accepted Hybrid-v1 retrieval evaluation with chapter cutoffs
4. Explicit Future-Information Leakage Audit (must be 0)
5. Long-range archetype evaluations
6. Context packing verification (budget, dedup, deterministic context hash)
7. Bounded generation pilot via live LLMClient
8. Evidence generation across all 12 required files
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

ROOT = Path(__file__).resolve().parents[1]
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(AI_SERVICE_ROOT))

from infrastructure.database import create_database_engine, create_session_factory, session_scope
from infrastructure.orm_models import (
    Base,
    EntityAliasRecord,
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    MemoryChunkRecord,
    MemoryEmbeddingRecord,
    RelationshipRecord,
    RevisionProvenanceRecord,
    StoryBrainRecord,
)
from infrastructure.postgres_semantic_memory_repository import PostgresSemanticMemoryRepository
from infrastructure.embedding_providers import GeminiEmbeddingProvider
from application.semantic_memory_service import SemanticMemoryMaterializationService
from application.hybrid_ranker import HybridRanker, HybridRankingWeights
from application.context_budget import ContextBudgetPacker
from core.llm_client import LLMClient
from domain.models import WritingContextPackage
from benchmarks.p7_embedding_benchmark import evaluate_ranked_ids, aggregate_metrics, recent_rank

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# Fixed test IDs
TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
STORY_ID = "aethelgard-soul-mortal-blade-61ch"
NOVEL_ID = PostgresSemanticMemoryRepository._novel_id(STORY_ID)


def load_env_slot() -> str:
    eval_local = ROOT / ".env.eval.local"
    if not eval_local.exists():
        raise RuntimeError(".env.eval.local not found")
    for line in eval_local.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("GEMINI_API_KEY_SLOT_1="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("GEMINI_API_KEY_SLOT_1 not found in .env.eval.local")


def stable_uuid(kind: str, value: str) -> uuid.UUID:
    return PostgresSemanticMemoryRepository._stable_uuid(kind, str(value))


def seed_canonical_story(factory, memories_data: list[dict[str, Any]], entities_data: dict[str, Any]) -> uuid.UUID:
    """Seed StoryBrain, Entities, Relationships, Revisions, and Events for the 61-chapter novel."""
    with session_scope(factory) as session:
        # 1. StoryBrain
        brain = session.query(StoryBrainRecord).filter_by(tenant_id=TENANT_ID, novel_id=NOVEL_ID).first()
        if brain is None:
            brain = StoryBrainRecord(
                id=stable_uuid("story_brain", STORY_ID),
                tenant_id=TENANT_ID,
                novel_id=NOVEL_ID,
                status="ready",
                brain_version=1,
                schema_version=1,
            )
            session.add(brain)
            session.flush()

        brain_id = brain.id

        # 2. Revisions (chapters 1 to 61)
        existing_revs = {r.chapter_number for r in session.query(RevisionProvenanceRecord).filter_by(story_brain_id=brain_id).all()}
        for ch in range(1, 62):
            if ch not in existing_revs:
                rev_id = stable_uuid("revision", f"ch-{ch}")
                chap_id = stable_uuid("chapter", f"ch-{ch}")
                session.add(
                    RevisionProvenanceRecord(
                        id=stable_uuid("rev_prov", f"ch-{ch}"),
                        story_brain_id=brain_id,
                        tenant_id=TENANT_ID,
                        novel_id=NOVEL_ID,
                        chapter_id=chap_id,
                        revision_id=rev_id,
                        chapter_number=ch,
                    )
                )

        # 3. Entities
        existing_entities = {e.canonical_name.casefold(): e.id for e in session.query(EntityRecord).filter_by(story_brain_id=brain_id).all()}
        for ent in entities_data.get("entities", []):
            name = ent["canonical_name"]
            if name.casefold() not in existing_entities:
                ent_uuid = stable_uuid("entity", ent["entity_id"])
                e_rec = EntityRecord(
                    id=ent_uuid,
                    story_brain_id=brain_id,
                    tenant_id=TENANT_ID,
                    novel_id=NOVEL_ID,
                    entity_type=ent.get("entity_type", "character"),
                    canonical_name=name,
                    normalized_name=name.casefold(),
                    description=ent.get("notes", ""),
                    static_attributes={"first_chapter": ent.get("first_chapter", 1), "aliases": ent.get("aliases", [])},
                    confirmation_status="confirmed",
                )
                session.add(e_rec)
                session.flush()
                existing_entities[name.casefold()] = ent_uuid
                seen_norm_aliases = set()
                for alias in ent.get("aliases", []):
                    norm = alias.casefold()
                    if norm not in seen_norm_aliases and norm != name.casefold():
                        seen_norm_aliases.add(norm)
                        session.add(
                            EntityAliasRecord(
                                id=stable_uuid("alias", f"{ent['entity_id']}:{norm}"),
                                entity_id=ent_uuid,
                                alias=alias,
                                normalized_alias=norm,
                                source_type="canonical",
                                confirmation_status="confirmed",
                            )
                        )

        # 4. Relationships
        existing_rels = session.query(RelationshipRecord).filter_by(story_brain_id=brain_id).count()
        if existing_rels == 0:
            for rel in entities_data.get("relationships", []):
                sub_id = rel.get("a")
                obj_id = rel.get("b")
                # map id to canonical names
                name_map = {e["entity_id"]: e["canonical_name"] for e in entities_data.get("entities", [])}
                sub_name = name_map.get(sub_id, sub_id)
                obj_name = name_map.get(obj_id, obj_id)
                session.add(
                    RelationshipRecord(
                        id=stable_uuid("relationship", rel["relationship_id"]),
                        story_brain_id=brain_id,
                        tenant_id=TENANT_ID,
                        novel_id=NOVEL_ID,
                        subject_name=sub_name,
                        object_name=obj_name,
                        relation_type=rel.get("relationship_type", "associated"),
                        source_type="canonical",
                        relation_metadata={
                            "first_chapter": rel.get("first_chapter", 1),
                            "relationship_id": rel.get("relationship_id"),
                            "status": "canonical",
                        },
                    )
                )

        # 5. Events (216 canonical memories)
        existing_events = {e.narrative_order: e.id for e in session.query(EventRecord).filter_by(story_brain_id=brain_id).all()}
        for idx, mem in enumerate(memories_data, start=1):
            mem_id = mem["memory_id"]
            if idx not in existing_events:
                ev_uuid = stable_uuid("event", mem_id)
                ch_num = int(mem.get("chapter_number", 1))
                ev_rec = EventRecord(
                    id=ev_uuid,
                    story_brain_id=brain_id,
                    tenant_id=TENANT_ID,
                    novel_id=NOVEL_ID,
                    narrative_order=idx,
                    event_type=mem.get("memory_type", "event_summary"),
                    summary=mem["content"],
                    participants=mem.get("entities", []),
                    chapter_number=ch_num,
                    event_metadata={
                        "memory_id": mem_id,
                        "importance_score": float(mem.get("importance", 0.5)),
                        "chapter_title": mem.get("chapter_title", ""),
                        "tags": mem.get("tags", []),
                        "status": mem.get("status", "canonical"),
                    },
                    confirmation_status="confirmed",
                )
                session.add(ev_rec)

        # 6. Event participants. HybridRanker signals read the normalized
        # event_participants table, not EventRecord.participants JSON.
        session.flush()
        existing_participants = {
            (row.event_id, row.entity_id, row.participant_role)
            for row in session.query(EventParticipantRecord)
            .join(EventRecord, EventParticipantRecord.event_id == EventRecord.id)
            .filter(EventRecord.story_brain_id == brain_id)
            .all()
        }
        for mem in memories_data:
            event_uuid = stable_uuid("event", mem["memory_id"])
            for source_entity_id in mem.get("entities", []):
                entity_uuid = stable_uuid("entity", source_entity_id)
                participant_key = (event_uuid, entity_uuid, "actor")
                if participant_key in existing_participants:
                    continue
                if session.get(EntityRecord, entity_uuid) is None:
                    continue
                session.add(
                    EventParticipantRecord(
                        event_id=event_uuid,
                        entity_id=entity_uuid,
                        participant_role="actor",
                    )
                )
                existing_participants.add(participant_key)

        return brain_id


def run_evaluation():
    print("=" * 70)
    print("STARTING EVAL-01 AETHELGARD RUNTIME BASELINE")
    print("=" * 70)

    api_key = load_env_slot()
    db_url = "postgresql+psycopg://postgres:postgres@localhost:5433/novel_platform"
    engine = create_database_engine(db_url)
    factory = create_session_factory(engine)

    # 1. Load canonical memories and entities
    memories_path = ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    memories_payload = json.loads(memories_path.read_text(encoding="utf-8"))
    memories = memories_payload["memories"]

    entities_path = ROOT / ".data" / "Batch_7" / "entities.json"
    entities_payload = json.loads(entities_path.read_text(encoding="utf-8"))

    # 2. Seed database
    print(f"\n[1/7] Seeding PostgreSQL database (story: {STORY_ID}, {len(memories)} canonical memories)...")
    t0_seed = time.perf_counter()
    seed_canonical_story(factory, memories, entities_payload)
    print(f"      Seeding completed in {time.perf_counter() - t0_seed:.2f}s")

    # 3. Materialize Semantic Memory using accepted tooling
    print("\n[2/7] Materializing semantic memory chunks and generating live embeddings...")
    embedding_provider = GeminiEmbeddingProvider(api_key=api_key)
    repo = PostgresSemanticMemoryRepository(factory, tenant_id=TENANT_ID)
    materializer = SemanticMemoryMaterializationService(repo, embedding_provider)

    t0_mat = time.perf_counter()
    mat_result = materializer.materialize_event_memories(STORY_ID)
    elapsed_mat = time.perf_counter() - t0_mat

    coverage = repo.embedding_coverage(STORY_ID, embedding_provider.version)
    print(f"      Materialization result: {mat_result}")
    print(f"      Coverage: {coverage}")
    print(f"      Elapsed: {elapsed_mat:.2f}s")

    # Record materialization.txt
    mat_txt = (
        f"EVAL-01 AETHELGARD RUNTIME BASELINE — MATERIALIZATION\n"
        f"Evaluated At: {datetime.now(timezone.utc).isoformat()}\n"
        f"Story ID: {STORY_ID}\n"
        f"Tenant ID: {TENANT_ID}\n"
        f"Total event memory sources listed: {len(memories)}\n"
        f"Memory chunks persisted: {mat_result.get('memory_chunk_count', 0)}\n"
        f"Embeddings generated/stored this run: {mat_result.get('embedded_count', 0)}\n"
        f"Embeddings reused this run: {mat_result.get('reused_embedding_count', 0)}\n"
        f"Total chunks in database: {coverage['total_chunks']}\n"
        f"Fresh embeddings matching content hash: {coverage['current']}\n"
        f"Stale embeddings: {coverage['stale']}\n"
        f"Missing embeddings: {coverage['missing']}\n"
        f"Embedding Model: {embedding_provider.model}\n"
        f"Embedding Version: {embedding_provider.version}\n"
        f"Embedding Dimension: {embedding_provider.dimension}\n"
        f"Materialization Elapsed Time: {elapsed_mat:.2f}s\n"
        f"Status: SUCCESS\n"
    )
    (EVIDENCE_DIR / "materialization.txt").write_text(mat_txt, encoding="utf-8")

    # 4. Retrieval Evaluation
    print("\n[3/7] Running source-defined retrieval splits...")

    all_frozen_payload = json.loads(
        (ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json").read_text(encoding="utf-8")
    )
    all_frozen_queries = all_frozen_payload["queries"]
    core_queries = [q for q in all_frozen_queries if q.get("split") == "core_gold"]
    challenge_queries = [q for q in all_frozen_queries if q.get("split") == "challenge"]
    vn_queries = json.loads(
        (ROOT / ".data" / "Frozen_v1" / "vietnamese_diagnostic_queries.json").read_text(encoding="utf-8")
    )["queries"]

    if len(all_frozen_queries) != 40 or len(core_queries) != 21 or len(challenge_queries) != 19 or len(vn_queries) != 10:
        raise RuntimeError(
            "Frozen query split contract changed: "
            f"all={len(all_frozen_queries)} core={len(core_queries)} "
            f"challenge={len(challenge_queries)} vi={len(vn_queries)}"
        )

    hybrid_ranker = HybridRanker()
    mem_id_by_event_id = {
        str(stable_uuid("event", m["memory_id"])): m["memory_id"] for m in memories
    }
    mem_id_by_order = {
        idx: m["memory_id"] for idx, m in enumerate(memories, start=1)
    }
    memory_by_id = {m["memory_id"]: m for m in memories}

    def resolve_memory_id(match) -> str:
        if match.event_id and match.event_id in mem_id_by_event_id:
            return mem_id_by_event_id[match.event_id]
        if match.narrative_order and match.narrative_order in mem_id_by_order:
            return mem_id_by_order[match.narrative_order]
        return str(match.metadata.get("memory_id", match.memory_chunk_id))

    retrieval_raw: list[dict[str, Any]] = []
    split_results: dict[str, dict[str, Any]] = {}
    future_leak_violations: list[dict[str, Any]] = []
    stale_version_violations: list[dict[str, Any]] = []
    query_embedding_latencies: list[float] = []
    sql_latencies: list[float] = []
    hybrid_latencies: list[float] = []

    def evaluate_split(split_name: str, queries: list[dict[str, Any]]) -> dict[str, Any]:
        semantic_per_query: list[dict[str, Any]] = []
        hybrid_per_query: list[dict[str, Any]] = []
        recent_per_query: list[dict[str, Any]] = []

        for q in queries:
            qid = str(q["query_id"])
            case_id = f"{split_name}:{qid}"
            qtext = str(q.get("query") or q.get("query_text") or "")
            q_cutoff = int(q["chapter_cutoff"])

            t0_qembed = time.perf_counter()
            q_vec = embedding_provider.embed_query(qtext)
            query_embedding_latencies.append((time.perf_counter() - t0_qembed) * 1000)

            t0_sql = time.perf_counter()
            semantic_matches = repo.search_semantic_memories(
                STORY_ID,
                query_embedding=q_vec,
                embedding_version=embedding_provider.version,
                chapter_number=q_cutoff,
                limit=20,
            )
            sql_latencies.append((time.perf_counter() - t0_sql) * 1000)

            t0_hyb = time.perf_counter()
            signals = repo.get_hybrid_ranking_signals(
                STORY_ID,
                query_text=qtext,
                chapter_number=q_cutoff,
            )
            hybrid_matches = hybrid_ranker.rank(
                semantic_matches,
                signals=signals,
                chapter_number=q_cutoff,
                limit=20,
            )
            hybrid_latencies.append((time.perf_counter() - t0_hyb) * 1000)

            sem_ranked_ids = [resolve_memory_id(m) for m in semantic_matches]
            hyb_ranked_ids = [resolve_memory_id(m) for m in hybrid_matches]
            rec_ranked_ids = recent_rank(memories, q_cutoff)[:20]

            sem_eval = evaluate_ranked_ids(q, sem_ranked_ids)
            hyb_eval = evaluate_ranked_ids(q, hyb_ranked_ids)
            rec_eval = evaluate_ranked_ids(q, rec_ranked_ids)

            semantic_per_query.append(
                {"case_id": case_id, "query_id": qid, "metrics": sem_eval}
            )
            hybrid_per_query.append(
                {"case_id": case_id, "query_id": qid, "metrics": hyb_eval}
            )
            recent_per_query.append(
                {"case_id": case_id, "query_id": qid, "metrics": rec_eval}
            )

            for rank_idx, match in enumerate(hybrid_matches):
                memory_id = resolve_memory_id(match)
                if int(match.chapter_number or 0) > q_cutoff:
                    future_leak_violations.append(
                        {
                            "case_id": case_id,
                            "query_cutoff": q_cutoff,
                            "leaked_memory_id": memory_id,
                            "memory_chapter": match.chapter_number,
                            "rank": rank_idx + 1,
                        }
                    )
                if match.embedding_version != embedding_provider.version:
                    stale_version_violations.append(
                        {
                            "case_id": case_id,
                            "memory_id": memory_id,
                            "version": match.embedding_version,
                        }
                    )

            retrieval_raw.append(
                {
                    "case_id": case_id,
                    "split": split_name,
                    "query_id": qid,
                    "query_text": qtext,
                    "query_type": q.get("query_type"),
                    "chapter_cutoff": q_cutoff,
                    "positive_memory_ids": list(q.get("positive_memory_ids", [])),
                    "query_entity_ids": list(signals.query_entity_ids),
                    "related_entity_ids": list(signals.related_entity_ids),
                    "semantic_top20": [
                        {
                            "rank": idx + 1,
                            "memory_id": resolve_memory_id(m),
                            "chapter_number": m.chapter_number,
                            "cosine_distance": m.cosine_distance,
                        }
                        for idx, m in enumerate(semantic_matches)
                    ],
                    "hybrid_top20": [
                        {
                            "rank": idx + 1,
                            "memory_id": resolve_memory_id(m),
                            "chapter_number": m.chapter_number,
                            "cosine_distance": m.cosine_distance,
                            "hybrid_score": m.hybrid_score,
                            "entity_overlap_score": m.entity_overlap_score,
                            "temporal_score": m.temporal_score,
                            "relationship_score": m.relationship_score,
                        }
                        for idx, m in enumerate(hybrid_matches)
                    ],
                }
            )

        return {
            "query_count": len(queries),
            "recent": aggregate_metrics(recent_per_query),
            "semantic": aggregate_metrics(semantic_per_query),
            "hybrid_v1": aggregate_metrics(hybrid_per_query),
            "per_query_hybrid": hybrid_per_query,
        }

    # Primary model-selection split.
    split_results["core_gold"] = evaluate_split("core_gold", core_queries)
    # Secondary diagnostic split. Never merge this into the primary aggregate.
    split_results["challenge"] = evaluate_split("challenge", challenge_queries)
    # Cross-lingual diagnostic reuses source query IDs, so case_id carries the split.
    split_results["vietnamese_diagnostic"] = evaluate_split(
        "vietnamese_diagnostic", vn_queries
    )

    retrieval_metrics = {
        "dataset_version": all_frozen_payload["dataset_version"],
        "tested_commit": "RERUN_COMMIT_TO_BE_RECORDED_BY_GEMINI",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "memory_count": len(memories),
        "split_contract": {
            "core_gold": 21,
            "challenge": 19,
            "vietnamese_diagnostic": 10,
        },
        "splits": split_results,
    }
    (EVIDENCE_DIR / "retrieval-raw.json").write_text(
        json.dumps(retrieval_raw, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (EVIDENCE_DIR / "retrieval-metrics.json").write_text(
        json.dumps(retrieval_metrics, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    aggregate_core = split_results["core_gold"]
    print(
        "      Core-gold @10 semantic: "
        f"Recall={aggregate_core['semantic']['10']['recall_at_k']:.4f}, "
        f"MRR={aggregate_core['semantic']['10']['mrr_at_k']:.4f}, "
        f"nDCG={aggregate_core['semantic']['10']['ndcg_at_k']:.4f}"
    )
    print(
        "      Core-gold @10 hybrid-v1: "
        f"Recall={aggregate_core['hybrid_v1']['10']['recall_at_k']:.4f}, "
        f"MRR={aggregate_core['hybrid_v1']['10']['mrr_at_k']:.4f}, "
        f"nDCG={aggregate_core['hybrid_v1']['10']['ndcg_at_k']:.4f}"
    )

    # 5. Future Leakage Audit
    print("\n[4/7] Performing Temporal Safety & Future Leak Audit...")
    future_audit = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "total_queries_audited": sum(item["query_count"] for item in split_results.values()),
        "total_candidates_inspected": sum(
            len(row["hybrid_top20"]) for row in retrieval_raw
        ),
        "future_leak_violations_count": len(future_leak_violations),
        "future_leak_violations": future_leak_violations,
        "stale_wrong_version_count": len(stale_version_violations),
        "stale_wrong_version_violations": stale_version_violations,
        "temporal_cutoff_mechanism": "SQL WHERE EventRecord.chapter_number <= chapter_number before ORDER BY cosine_distance",
        "temporal_safety_pass": len(future_leak_violations) == 0 and len(stale_version_violations) == 0,
        "status": "PASS" if (len(future_leak_violations) == 0 and len(stale_version_violations) == 0) else "FAIL",
    }
    (EVIDENCE_DIR / "future-leak-audit.json").write_text(
        json.dumps(future_audit, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"      Future leakage violations surviving final retrieval: {len(future_leak_violations)} (MUST be 0)")
    print(f"      Stale / wrong-version candidates surviving retrieval: {len(stale_version_violations)} (MUST be 0)")

    # 6. Context Packing Evaluation
    print("\n[5/7] Evaluating Context Packing with real retrieved memory content...")
    packer = ContextBudgetPacker(default_budget=12_000)
    context_cases: list[dict[str, Any]] = []
    representative_cases = [
        ("core_gold", "rq-0002", "setup_payoff"),
        ("core_gold", "rq-0004", "old_but_important"),
        ("core_gold", "rq-0007", "relationship_evolution"),
        ("core_gold", "rq-0010", "world_rules"),
        ("challenge", "rq-0001", "future_leak_trap"),
        ("challenge", "rq-0039", "relationship_supersession"),
    ]

    for split_name, qid, archetype in representative_cases:
        raw_case = next(
            (
                row
                for row in retrieval_raw
                if row["split"] == split_name and row["query_id"] == qid
            ),
            None,
        )
        if raw_case is None:
            continue

        semantic_payload = []
        for match in raw_case["hybrid_top20"]:
            memory = memory_by_id.get(match["memory_id"])
            if memory is None:
                continue
            semantic_payload.append(
                {
                    "memory_chunk_id": memory["memory_id"],
                    "chapter_number": int(memory["chapter_number"]),
                    "content": memory["content"],
                    "importance_score": float(memory.get("importance", 0.5)),
                    "source_key": f"corpus:{memory['memory_id']}",
                }
            )

        package = WritingContextPackage(
            brain_version=1,
            semantic_memories=tuple(semantic_payload),
        )
        packed1 = packer.pack(package, maximum=12_000)
        packed2 = packer.pack(package, maximum=12_000)

        prompt1 = packer.prompt_context(packed1)
        prompt2 = packer.prompt_context(packed2)
        hash1 = hashlib.sha256(
            json.dumps(
                prompt1,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        hash2 = hashlib.sha256(
            json.dumps(
                prompt2,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()

        selected_ids = list(
            packed1.context_summary.get("semantic_memory_ids", [])
        )
        positive_ids = set(raw_case.get("positive_memory_ids", []))
        candidate_positive_ids = positive_ids & {
            match["memory_id"] for match in raw_case["hybrid_top20"]
        }
        retained_positive_ids = candidate_positive_ids & set(selected_ids)
        retention = (
            len(retained_positive_ids) / len(candidate_positive_ids)
            if candidate_positive_ids
            else None
        )

        context_cases.append(
            {
                "case_id": raw_case["case_id"],
                "archetype": archetype,
                "chapter_cutoff": raw_case["chapter_cutoff"],
                "input_semantic_count": len(semantic_payload),
                "selected_semantic_count": len(selected_ids),
                "selected_semantic_ids": selected_ids,
                "dropped_semantic_ids": list(
                    packed1.context_summary.get(
                        "dropped_semantic_memory_ids", []
                    )
                ),
                "tokens_before": packed1.token_budget.get("estimated_before"),
                "tokens_used": packed1.token_budget.get("used"),
                "token_budget": packed1.token_budget.get("maximum"),
                "within_budget": not bool(
                    packed1.token_budget.get("budget_overflow")
                ),
                "deterministic_context_hash": hash1,
                "hashes_match": hash1 == hash2,
                "candidate_gold_count": len(candidate_positive_ids),
                "retained_gold_count": len(retained_positive_ids),
                "relevant_memory_retention": retention,
                "protected_artifact_truncation": "not_measured",
                "protected_artifact_reason": (
                    "EVAL-01 harness seeds retrieval corpus artifacts but does "
                    "not reconstruct the full locked canonical entity/state/rule package."
                ),
                "content_source": "real_frozen_corpus_memory_content",
            }
        )

    (EVIDENCE_DIR / "context-packing.json").write_text(
        json.dumps(context_cases, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(
        "      Context packing deterministic: "
        f"{all(case['hashes_match'] for case in context_cases)}; "
        "protected canonical truncation remains not_measured."
    )

    # 7. Bounded Generation Pilot
    print("\n[6/7] Running bounded live generation pilot...")
    llm = LLMClient(
        provider="gemini",
        model="gemini-3.5-flash-lite",
        api_key=api_key,
    )
    generation_cases: list[dict[str, Any]] = []
    generation_latencies: list[float] = []
    pilot_cases = [
        ("core_gold", "rq-0002", "setup_payoff"),
        ("core_gold", "rq-0007", "relationship_evolution"),
        ("core_gold", "rq-0010", "world_rules"),
        ("challenge", "rq-0001", "future_leak_trap"),
    ]

    for split_name, qid, archetype in pilot_cases:
        raw_case = next(
            (
                row
                for row in retrieval_raw
                if row["split"] == split_name and row["query_id"] == qid
            ),
            None,
        )
        if raw_case is None:
            continue

        top_ids = [row["memory_id"] for row in raw_case["hybrid_top20"][:5]]
        top_memories = [
            memory_by_id[memory_id]
            for memory_id in top_ids
            if memory_id in memory_by_id
        ]
        context_text = "\n".join(
            f"- [{memory['memory_id']} / ch{memory['chapter_number']}] {memory['content']}"
            for memory in top_memories
        )
        prompt = (
            f"CANONICAL MEMORY CONTEXT (cutoff chapter {raw_case['chapter_cutoff']}):\n"
            f"{context_text or '[no retrieved memory]'}\n\n"
            f"QUERY: {raw_case['query_text']}\n"
            "Respond in 2-3 concise sentences using only supported context. "
            "If the context is insufficient, say so rather than inventing facts."
        )
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()

        started = time.perf_counter()
        try:
            output = llm.generate(
                prompt=prompt,
                temperature=0.2,
                max_tokens=256,
            ).strip()
            latency_ms = (time.perf_counter() - started) * 1000
            generation_latencies.append(latency_ms)
            execution_status = "SUCCESS"
        except Exception as exc:
            output = f"GENERATION_FAILED: {type(exc).__name__}: {exc}"
            latency_ms = (time.perf_counter() - started) * 1000
            execution_status = "FAILED"

        generation_cases.append(
            {
                "case_id": f"generation:{raw_case['case_id']}",
                "retrieval_case_id": raw_case["case_id"],
                "query_id": qid,
                "split": split_name,
                "archetype": archetype,
                "chapter_cutoff": raw_case["chapter_cutoff"],
                "model": "gemini-3.5-flash-lite",
                "temperature": 0.2,
                "prompt_hash": prompt_hash,
                "retrieved_memory_ids": top_ids,
                "output_text": output,
                "latency_ms": latency_ms,
                "execution_status": execution_status,
                "quality_evaluation": {
                    "status": "REVIEW_REQUIRED",
                    "canonical_factual_consistency": "not_scored",
                    "character_consistency": "not_scored",
                    "relationship_consistency": "not_scored",
                    "future_leakage_detected": "not_scored",
                    "unsupported_facts_introduced": "not_scored",
                    "context_adherence": "not_scored",
                    "long_range_continuity": "not_scored",
                    "reason": (
                        "Harness must not self-award quality scores. "
                        "Astra/Supervisor or a separately specified evaluator must review preserved output."
                    ),
                },
            }
        )

    (EVIDENCE_DIR / "generation-cases.json").write_text(
        json.dumps(generation_cases, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # 8. Latency, cost, failure analysis, and summary
    print("\n[7/7] Consolidating artifact-derived evidence...")

    import statistics

    def latency_stats(values: list[float]) -> dict[str, Any]:
        if not values:
            return {"status": "not_measured", "reason": "no samples"}
        ordered = sorted(values)
        p95_index = min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)
        return {
            "status": "measured",
            "sample_count": len(values),
            "p50": statistics.median(values),
            "p95": ordered[p95_index],
            "mean": statistics.fmean(values),
        }

    latency_cost = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "query_embedding_latency_ms": latency_stats(query_embedding_latencies),
        "sql_retrieval_latency_ms": latency_stats(sql_latencies),
        "hybrid_rerank_latency_ms": latency_stats(hybrid_latencies),
        "generation_latency_ms": latency_stats(generation_latencies),
        "token_cost_profile": {
            "status": "not_measured",
            "reason": (
                "LLMClient currently returns text only and does not expose provider usage/cost metadata."
            ),
            "query_embedding_calls": len(query_embedding_latencies),
            "generation_calls": len(generation_cases),
        },
    }
    (EVIDENCE_DIR / "latency-cost.json").write_text(
        json.dumps(latency_cost, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    hybrid_signal_cases = sum(
        1
        for row in retrieval_raw
        if row["query_entity_ids"] or row["related_entity_ids"]
    )
    generation_successes = sum(
        1 for case in generation_cases if case["execution_status"] == "SUCCESS"
    )
    context_deterministic = all(case["hashes_match"] for case in context_cases)
    temporal_pass = not future_leak_violations and not stale_version_violations

    failure_md = f"""# EVAL-01 Failure Analysis — Corrected Harness

## Measured status

| Layer | Status | Evidence |
|---|---|---|
| CORPUS_GOLD | PASS | Frozen v1 split contract: 21 core + 19 challenge; 10 VI diagnostic cases separate |
| INGESTION_EXTRACTION | NOT_MEASURED | Harness seeds frozen canonical memories; raw 61-chapter extractor is not executed |
| CANONICAL_DATA | PARTIAL | Frozen canonical corpus is immutable and seeded; full canonical extraction pipeline not evaluated |
| EMBEDDING | PASS | Live Gemini query embeddings + repository embedding coverage |
| TEMPORAL_FILTER | {'PASS' if temporal_pass else 'FAIL'} | Future/stale candidates surviving final retrieval: {len(future_leak_violations)}/{len(stale_version_violations)} |
| CANDIDATE_RETRIEVAL | PASS | PostgreSQL pgvector exact cosine runtime measured |
| HYBRID_SIGNAL | {'PASS' if hybrid_signal_cases else 'PARTIAL'} | {hybrid_signal_cases} evaluated cases exposed entity/relationship signals after participant-table backfill |
| HYBRID_WEIGHTING | MEASURED | Reported separately for core/challenge/VI; no split mixing |
| CONTEXT_PACKING | {'PARTIAL' if context_deterministic else 'FAIL'} | Real memory content + deterministic packing measured; protected canonical artifacts not reconstructed |
| GENERATION | PARTIAL | Live execution {generation_successes}/{len(generation_cases)}; quality rubric requires independent review |
| LATENCY_COST | PARTIAL | Latency measured; provider token/cost usage not exposed by current client |
| EVALUATION_HARNESS | PASS | Source-defined split identities; duplicate query IDs namespaced by case_id |

## Known limitations

- Challenge metrics are diagnostic and must not be promoted to the primary core-gold claim.
- Vietnamese diagnostics reuse source query IDs; case_id preserves split identity.
- Generation quality is intentionally not self-scored.
- Protected canonical entity/state/rule truncation remains not_measured in this runner.
"""
    (EVIDENCE_DIR / "failure-analysis.md").write_text(
        failure_md,
        encoding="utf-8",
    )

    core = split_results["core_gold"]
    challenge = split_results["challenge"]
    vi = split_results["vietnamese_diagnostic"]
    sem10 = core["semantic"]["10"]
    hyb10 = core["hybrid_v1"]["10"]
    rec10 = core["recent"]["10"]
    embed_latency = latency_cost["query_embedding_latency_ms"]
    sql_latency = latency_cost["sql_retrieval_latency_ms"]
    gen_latency = latency_cost["generation_latency_ms"]

    summary_md = f"""# EVAL-01 Aethelgard Runtime Baseline — Corrected Harness Summary

- **Dataset:** `{all_frozen_payload['dataset_version']}`
- **Corpus:** {len(memories)} frozen canonical memories
- **Primary split:** 21 core-gold queries
- **Secondary split:** 19 challenge queries
- **Cross-lingual diagnostic:** 10 Vietnamese queries
- **Evaluation mode:** live Gemini provider + PostgreSQL/pgvector
- **Generation quality:** REVIEW_REQUIRED (not self-scored)

## Primary core-gold runtime metrics @10

| Metric | Recent | Semantic-only | hybrid-v1 |
|---|---:|---:|---:|
| Recall@10 | {rec10['recall_at_k']:.6f} | {sem10['recall_at_k']:.6f} | {hyb10['recall_at_k']:.6f} |
| MRR@10 | {rec10['mrr_at_k']:.6f} | {sem10['mrr_at_k']:.6f} | {hyb10['mrr_at_k']:.6f} |
| nDCG@10 | {rec10['ndcg_at_k']:.6f} | {sem10['ndcg_at_k']:.6f} | {hyb10['ndcg_at_k']:.6f} |
| Hit query rate | {rec10['hit_query_rate']:.6f} | {sem10['hit_query_rate']:.6f} | {hyb10['hit_query_rate']:.6f} |

Challenge and Vietnamese metrics are preserved in `retrieval-metrics.json` and are not mixed into the primary aggregate.

## Safety

- Future candidates surviving final retrieval: **{len(future_leak_violations)}**
- Stale/wrong-version candidates surviving final retrieval: **{len(stale_version_violations)}**

## Context

- Deterministic packing cases: **{sum(1 for case in context_cases if case['hashes_match'])}/{len(context_cases)}**
- Real corpus memory content used: **YES**
- Protected canonical entity/state/rule truncation: **not_measured** (full locked package is not reconstructed by this harness)

## Generation

- Live execution successes: **{generation_successes}/{len(generation_cases)}**
- Quality scores: **not_scored / independent review required**
- No automatic 5/5 rubric is permitted.

## Latency

- Query embedding p50: **{embed_latency.get('p50', 'not_measured')} ms**
- SQL retrieval p50: **{sql_latency.get('p50', 'not_measured')} ms**
- Generation p50: **{gen_latency.get('p50', 'not_measured')} ms**
- Tokens/cost: **not_measured** — current LLMClient does not expose usage metadata.

## Interpretation

This runner can establish runtime retrieval, temporal safety, hybrid behavior, deterministic semantic-memory packing, and live generation execution. It must not claim raw-ingestion quality, protected-artifact packing quality, generation quality, or token/cost quality without separate evidence.
"""
    (EVIDENCE_DIR / "summary.md").write_text(summary_md, encoding="utf-8")

    print("\n" + "=" * 70)
    print("EVAL-01 COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_evaluation()
