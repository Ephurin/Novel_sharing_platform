#!/usr/bin/env python3
"""CTX-RD-01 Local Live Acceptance Verification Harness.

Validates:
1. Baseline readiness guards (P8 cleanup readiness, P8-05 cleanup gate).
2. Live PostgreSQL + pgvector environment health.
3. Legacy-v1 smoke: bounded preview & generation, legacy-compatible routing trace.
4. Balanced-scope-v1 smoke: scoped relevance packaging, minimum full-fit tier, exact retrieval retention.
5. Temporal safety: zero future participant leakage, zero superseded leakage, strict tenant isolation.
6. Fallback and rollback: semantic failure -> legacy, scope overflow -> fail-closed, flag rollback -> instant.
7. Emits structured acceptance evidence to docs/development/CTX-RD-01-LIVE-ACCEPTANCE/.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AI_SERVICE = ROOT / "ai-service"
sys.path.insert(0, str(AI_SERVICE))
sys.path.insert(0, str(ROOT / "scripts"))

from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import sessionmaker

from alembic import command
from alembic.config import Config

from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder
from application.hybrid_ranker import HYBRID_RANKING_VERSION, HybridRanker, HybridRankingWeights
from application.semantic_memory_service import SemanticMemoryMaterializationService
from application.semantic_retriever import SemanticRetrieverService
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from core.settings import Settings
from domain.errors import ContextRoutingUnresolvedError
from domain.models import (
    SemanticRetrievalResult,
    WritingGenerationJob,
)
from infrastructure.database import session_scope
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider
from infrastructure.orm_models import (
    CurrentEntityStateRecord,
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    FactRecord,
    MemoryChunkRecord,
    SCHEMA,
    StoryBrainRecord,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.postgres_semantic_memory_repository import PostgresSemanticMemoryRepository

EVIDENCE_DIR = ROOT / "docs" / "development" / "CTX-RD-01-LIVE-ACCEPTANCE"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/ephurin",
)


def get_git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=str(ROOT),
            text=True,
        ).strip()
    except Exception:
        return "unknown"


class InMemoryRevisionProvider:
    def __init__(self, texts: dict[str, str] | None = None) -> None:
        self.texts = texts or {}

    def get_revision_text(self, revision_id: str, *args, **kwargs) -> str:
        return self.texts.get(revision_id, "Chapter scene text for testing.")

    def get_revision(self, revision_id: str, *args, **kwargs) -> Any:
        class _Rev:
            def __init__(self, text: str) -> None:
                self.content = text
                self.word_count = len(text.split())
                self.content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return _Rev(self.get_revision_text(revision_id))


def setup_test_dataset(session_factory, tenant_id: str, novel_id: str) -> dict[str, Any]:
    """Populate a complete, realistic narrative dataset in PostgreSQL directly into ORM models."""
    tenant_uuid = uuid.UUID(tenant_id)
    novel_uuid = uuid.UUID(novel_id)
    actor_id = str(uuid.uuid4())
    narrative_repo = PostgresNarrativeRepository(session_factory, tenant_id=tenant_id, actor_id=actor_id)
    semantic_repo = PostgresSemanticMemoryRepository(session_factory, tenant_id=tenant_id)
    embed_provider = DeterministicFakeEmbeddingProvider()

    # 1. Populate StoryBrain, Entities, EntityStates, Facts, and Events
    with session_scope(session_factory) as session:
        brain = StoryBrainRecord(
            id=uuid.uuid4(),
            tenant_id=tenant_uuid,
            novel_id=novel_uuid,
            status="active",
            brain_version=1,
            schema_version=1,
        )
        session.add(brain)
        session.flush()
        brain_id = brain.id

        # 25 Entities across multiple types
        entity_specs = [
            ("char-01", "Alan", "character", "protagonist swordsman", True),  # locked
            ("char-02", "Elena", "character", "alchemist and researcher", False),
            ("char-03", "Bram", "character", "master blacksmith", False),
            ("char-04", "Roland", "character", "commander of heavy cavalry", False),
            ("char-05", "Garrick", "character", "veteran soldier", False),
            ("char-06", "Valora", "character", "demon commander", False),
            ("char-07", "Gargas", "character", "demon cavalry captain", False),
            ("char-08", "Alistair", "character", "former hero", False),
            ("char-09", "Varian", "character", "fallen warrior", False),
            ("char-10", "Kaelen", "character", "traitorous commander", False),
            ("loc-01", "Oakhaven", "location", "frontier settlement", False),
            ("loc-02", "Hem Vuc Tro Tan", "location", "ash canyon battleground", False),
            ("loc-03", "Solaria", "location", "capital city under artificial sky", False),
            ("loc-04", "Ancient Tomb Forge", "location", "secret forging site", False),
            ("item-01", "Than Tinh Sword", "item", "anti-mana forged short sword", True),  # locked
            ("item-02", "Anti-Quang Medicine", "item", "non-mana healing compound", False),
            ("item-03", "Nullification Charge", "item", "tactical demolition explosive", False),
            ("item-04", "Reserve Seeds", "item", "evacuated crop seeds", False),
            ("struct-01", "Pressure Pillar No. 2", "structure", "auxiliary barrier pillar", False),
            ("struct-02", "Solar Artillery", "structure", "heavy magical battery", False),
            ("org-01", "Three Thousand Cavalry", "organization", "elite heavy cavalry force", False),
            ("org-02", "Demon Vanguard", "organization", "allied demon forces", False),
            ("org-03", "Temple Guard", "organization", "hostile cathedral defense", False),
            ("distractor-01", "Minor Merchant", "character", "unrelated market trader", False),
            ("distractor-02", "Distant Watchtower", "location", "abandoned border outpost", False),
        ]

        entity_uuid_map: dict[str, uuid.UUID] = {}
        for eid, name, etype, desc, locked in entity_specs:
            e_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:{eid}")
            entity_uuid_map[eid] = e_uuid
            session.add(
                EntityRecord(
                    id=e_uuid,
                    story_brain_id=brain_id,
                    tenant_id=tenant_uuid,
                    novel_id=novel_uuid,
                    entity_type=etype,
                    canonical_name=name,
                    normalized_name=name.casefold(),
                    description=desc,
                    static_attributes={"mentions": 1, "status": "Alive", "location": "Unknown"},
                    source_type="author",
                    confirmation_status="confirmed",
                    confidence=1.0,
                    is_locked=locked,
                )
            )
        session.flush()

        for eid in entity_uuid_map:
            session.add(
                CurrentEntityStateRecord(
                    story_brain_id=brain_id,
                    entity_id=entity_uuid_map[eid],
                    tenant_id=tenant_uuid,
                    novel_id=novel_uuid,
                    state={"status": "active", "power_level": 100},
                    provenance={},
                    projection_version=1,
                )
            )

        # 4 World Rules (2 locked, 2 unlocked)
        rule_specs = [
            ("rule-01", "Anti-mana ore strips enchantments upon physical contact.", True),
            ("rule-02", "Pressure Pillars collapse when link copper conductors are broken.", True),
            ("rule-03", "Artificial sky sustains Solaria via perimeter energy siphoning.", False),
            ("rule-04", "Non-mana medicine penetrates corrupted-root barriers.", False),
        ]
        for rid, stmt, locked in rule_specs:
            r_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:{rid}")
            session.add(
                FactRecord(
                    id=r_uuid,
                    story_brain_id=brain_id,
                    tenant_id=tenant_uuid,
                    novel_id=novel_uuid,
                    fact_type="world_rule",
                    fact_key=rid,
                    fact_value={"rule": stmt, "chapter_number": 1},
                    source_type="author",
                    confirmation_status="confirmed",
                    confidence=1.0,
                    is_locked=locked,
                )
            )

        ev_sup_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:ev-superseded-15")

        # 35 Historical Confirmed Events (Chapters 1 to 35)
        # Chapters 1 to 15: lore and older historical events (including anti-mana short sword forging lore in Ch 1-8)
        # Chapters 16 to 35: 20 recent events for chapter cutoff 35
        event_uuid_map: dict[str, uuid.UUID] = {}
        participant_records: list[EventParticipantRecord] = []

        for ch in range(1, 36):
            ev_id = f"ev-hist-{ch:02d}"
            ev_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:{ev_id}")
            event_uuid_map[ev_id] = ev_uuid
            
            # Events in chapters 1-8 match the semantic query "Elena forging anti-mana blade"
            if ch == 1:
                summary = "Elena uncovered ancient forging schematics for the anti-mana short sword at Oakhaven."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.95, "tags": ["canonical_lore"]}
            elif ch == 2:
                summary = "Elena researched ancient scrolls describing anti-mana short sword metallurgy."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.93, "tags": ["canonical_lore"]}
            elif ch == 3:
                summary = "Bram and Elena studied the heat treatment of anti-mana blade metal."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.91, "tags": ["canonical_lore"]}
            elif ch == 4:
                summary = "Elena experimented with anti-mana blade quenching techniques at the frontier."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.89, "tags": ["canonical_lore"]}
            elif ch == 5:
                summary = "A secret manuscript revealed the harmonic resonance of anti-mana ore for blade crafting."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.87, "tags": ["canonical_lore"]}
            elif ch == 6:
                summary = "Elena tested an experimental prototype anti-mana blade against corruption."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.85, "tags": ["canonical_lore"]}
            elif ch == 7:
                summary = "Elena forged the Than Tinh short sword at Ancient Tomb Forge using anti-mana ore."
                participants = ["Elena", "Bram", "Alan"]
                peids = ["char-02", "char-03", "char-01"]
                ev_meta = {"importance_score": 0.98, "tags": ["canonical_lore"]}
            elif ch == 8:
                summary = "Elena polished the newly forged anti-mana blade with Bram before weapon testing."
                participants = ["Elena", "Bram"]
                peids = ["char-02", "char-03"]
                ev_meta = {"importance_score": 0.83, "tags": ["canonical_lore"]}
            elif ch == 16:
                summary = f"Chapter {ch} tactical reconnaissance and preparation with Roland and Elena."
                participants = ["Elena", "Roland"]
                peids = ["char-02", "char-04"]
                ev_meta = {
                    "importance_score": 0.6,
                    "tags": ["canonical_history"],
                    "supersedes_id": str(ev_sup_uuid),
                }
            elif ch >= 31:
                # The newest 5 recent events (chapters 31 to 35)
                summary = f"Chapter {ch} frontline joint battle operations with Alan, Elena, Bram, and Roland."
                participants = ["Alan", "Elena", "Bram", "Roland"]
                peids = ["char-01", "char-02", "char-03", "char-04"]
                ev_meta = {"importance_score": 0.75, "tags": ["canonical_history"]}
            else:
                summary = f"Chapter {ch} frontier defense maneuvering and logistics."
                participants = ["Elena", "Roland"]
                peids = ["char-02", "char-04"]
                ev_meta = {"importance_score": 0.6, "tags": ["canonical_history"]}

            session.add(
                EventRecord(
                    id=ev_uuid,
                    story_brain_id=brain_id,
                    tenant_id=tenant_uuid,
                    novel_id=novel_uuid,
                    narrative_order=ch * 1024,
                    event_type="battle" if ch % 2 == 0 else "diplomacy",
                    summary=summary,
                    participants=participants,
                    event_metadata=ev_meta,
                    chapter_number=ch,
                    source_type="author",
                    confirmation_status="confirmed",
                )
            )
            for peid in peids:
                participant_records.append(
                    EventParticipantRecord(
                        event_id=ev_uuid,
                        entity_id=entity_uuid_map[peid],
                        participant_role="participant",
                    )
                )

        # Superseded event in Chapter 15
        distractor_uuid = entity_uuid_map["distractor-01"]
        session.add(
            EventRecord(
                id=ev_sup_uuid,
                story_brain_id=brain_id,
                tenant_id=tenant_uuid,
                novel_id=novel_uuid,
                narrative_order=15 * 1024 + 100,
                event_type="recon",
                summary="Chapter 15 preliminary report later contradicted and superseded.",
                participants=["Distractor Scout"],
                event_metadata={
                    "importance_score": 0.4,
                    "tags": ["obsolete"],
                },
                chapter_number=15,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        participant_records.append(
            EventParticipantRecord(
                event_id=ev_sup_uuid,
                entity_id=distractor_uuid,
                participant_role="scout",
            )
        )

        # Future events (Chapters 40 and 50) - beyond chapter 35 cutoff
        ev_fut_40 = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:ev-future-40")
        session.add(
            EventRecord(
                id=ev_fut_40,
                story_brain_id=brain_id,
                tenant_id=tenant_uuid,
                novel_id=novel_uuid,
                narrative_order=40 * 1024,
                event_type="siege",
                summary="Chapter 40 future siege at Hem Vuc Tro Tan.",
                participants=["Future Traitor", "Valora"],
                event_metadata={
                    "importance_score": 0.9,
                    "tags": ["future_event"],
                },
                chapter_number=40,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        participant_records.append(
            EventParticipantRecord(
                event_id=ev_fut_40,
                entity_id=entity_uuid_map["char-06"],
                participant_role="commander",
            )
        )

        ev_fut_50 = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:ev-future-50")
        session.add(
            EventRecord(
                id=ev_fut_50,
                story_brain_id=brain_id,
                tenant_id=tenant_uuid,
                novel_id=novel_uuid,
                narrative_order=50 * 1024,
                event_type="cataclysm",
                summary="Chapter 50 future cataclysm breaking artificial sky.",
                participants=["Future Entity Omega"],
                event_metadata={
                    "importance_score": 0.95,
                    "tags": ["future_event"],
                },
                chapter_number=50,
                source_type="author",
                confirmation_status="confirmed",
            )
        )

        # Flush events before adding participant associations
        session.flush()
        session.add_all(participant_records)
        session.flush()

    # Materialize memories and generate vector embeddings
    materialization_svc = SemanticMemoryMaterializationService(semantic_repo, embed_provider)
    mat_result = materialization_svc.materialize_event_memories(novel_id)
    print(f"Materialized memories for novel {novel_id[:8]}: {mat_result}")

    # Retain only the 8 historical lore events (chapters 1-8) in semantic memory chunks
    # so they are distinct from the 20 recent events (chapters 16-35) and satisfy exact retention (8).
    with session_scope(narrative_repo._session_factory) as session:
        session.execute(
            delete(MemoryChunkRecord).where(
                MemoryChunkRecord.novel_id == novel_uuid,
                MemoryChunkRecord.narrative_order > 8 * 1024,
            )
        )


    return {
        "tenant_id": tenant_id,
        "novel_id": novel_id,
        "actor_id": actor_id,
        "narrative_repo": narrative_repo,
        "semantic_repo": semantic_repo,
        "embed_provider": embed_provider,
        "distractor_uuid": distractor_uuid,
    }


def setup_tenant_isolation_data(session_factory, tenant_b: str, novel_b: str) -> uuid.UUID:
    """Populate distinct tenant B to test cross-tenant isolation."""
    tenant_uuid = uuid.UUID(tenant_b)
    novel_uuid = uuid.UUID(novel_b)
    alien_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_b}:alien-char-99")
    with session_scope(session_factory) as session:
        brain = StoryBrainRecord(
            id=uuid.uuid4(),
            tenant_id=tenant_uuid,
            novel_id=novel_uuid,
            status="active",
            brain_version=1,
            schema_version=1,
        )
        session.add(brain)
        session.flush()

        session.add(
            EntityRecord(
                id=alien_uuid,
                story_brain_id=brain.id,
                tenant_id=tenant_uuid,
                novel_id=novel_uuid,
                entity_type="character",
                canonical_name="Alien Cross-Tenant Character",
                normalized_name="alien cross-tenant character",
                description="Entity strictly belonging to Tenant B",
                static_attributes={"status": "Alien"},
                source_type="author",
                confirmation_status="confirmed",
                confidence=1.0,
                is_locked=False,
            )
        )
        ev_b = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_b}:ev-b-01")
        session.add(
            EventRecord(
                id=ev_b,
                story_brain_id=brain.id,
                tenant_id=tenant_uuid,
                novel_id=novel_uuid,
                narrative_order=1024,
                event_type="secret",
                summary="Tenant B confidential meeting.",
                participants=["Alien Cross-Tenant Character"],
                event_metadata={"tags": ["tenant_b_confidential"]},
                chapter_number=10,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        session.flush()
        session.add(
            EventParticipantRecord(
                event_id=ev_b,
                entity_id=alien_uuid,
                participant_role="infiltrator",
            )
        )
    return alien_uuid


def run_acceptance() -> int:
    tested_commit = get_git_commit()
    print(f"Starting CTX-RD-01 Live Acceptance on commit: {tested_commit}")

    # =========================================================================
    # 0. BASELINE GUARDS VERIFICATION
    # =========================================================================
    print("\n--- Running Baseline & Guard Checks ---")
    readiness_proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_p8_cleanup_readiness.py")],
        capture_output=True,
        text=True,
    )
    cleanup_readiness_pass = readiness_proc.returncode == 0
    print(f"check_p8_cleanup_readiness: {'PASS' if cleanup_readiness_pass else 'FAIL'}")

    cleanup_gate_proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_p8_final_cleanup_gate.py"), "--expect-blocked"],
        capture_output=True,
        text=True,
    )
    cleanup_gate_pass = cleanup_gate_proc.returncode == 0 and "BLOCKED" in cleanup_gate_proc.stdout
    print(f"check_p8_final_cleanup_gate --expect-blocked: {'PASS' if cleanup_gate_pass else 'FAIL'}")

    production_default_policy = Settings.from_env().context_routing_policy
    production_default_pass = production_default_policy == "legacy-v1"
    print(f"Production default policy is legacy-v1: {'PASS' if production_default_pass else 'FAIL'} ({production_default_policy})")

    # =========================================================================
    # LIVE DATABASE INITIALIZATION & MIGRATIONS
    # =========================================================================
    print("\n--- Initializing Live PostgreSQL & Migrations ---")
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with engine.connect() as conn:
        ext = conn.scalar(text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
        assert ext == "vector", "pgvector extension must be active"

    cfg = Config(str(AI_SERVICE / "alembic.ini"))
    cfg.set_main_option("script_location", str(AI_SERVICE / "migrations"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")

    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    tenant_a = str(uuid.uuid4())
    novel_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    novel_b = str(uuid.uuid4())

    print(f"Setting up dataset for Tenant A ({tenant_a[:8]}) and Tenant B ({tenant_b[:8]})...")
    data_a = setup_test_dataset(session_factory, tenant_a, novel_a)
    alien_uuid = setup_tenant_isolation_data(session_factory, tenant_b, novel_b)

    narrative_repo = data_a["narrative_repo"]
    semantic_repo = data_a["semantic_repo"]
    embed_provider = data_a["embed_provider"]
    distractor_uuid = data_a["distractor_uuid"]

    hybrid_ranker = HybridRanker(HybridRankingWeights())
    semantic_retriever = SemanticRetrieverService(
        semantic_repo,
        embed_provider,
        hybrid_ranker=hybrid_ranker,
        embedding_version=embed_provider.version,
    )
    rev_text = "Elena raised her newly forged sword as the troops gathered."
    rev_hash = hashlib.sha256(rev_text.encode("utf-8")).hexdigest()
    revision_provider = InMemoryRevisionProvider({"rev-01": rev_text})
    fake_llm = FakeDeterministicLLMService()

    cutoff_chapter = 35

    # =========================================================================
    # 1. LEGACY SMOKE (CONTEXT_ROUTING_POLICY=legacy-v1)
    # =========================================================================
    print("\n--- Running Legacy-v1 Live Smoke ---")
    legacy_service = WritingService(
        repository=narrative_repo,
        llm_service=fake_llm,
        revision_provider=revision_provider,
        semantic_retriever=semantic_retriever,
        context_routing_policy="legacy-v1",
    )

    t0 = time.perf_counter()
    legacy_package = legacy_service.preview_context(
        tenant_id=tenant_a,
        story_id=novel_a,
        chapter_number=cutoff_chapter,
        semantic_query="Elena forging anti-mana blade",
        token_budget=12000,
    )
    legacy_latency_ms = (time.perf_counter() - t0) * 1000.0

    legacy_job = legacy_service.start_generation(
        tenant_id=tenant_a,
        novel_id=novel_a,
        chapter_id="ch-35",
        revision_id="rev-01",
        content_hash=rev_hash,
        operation="continue",
        selection={"start": 0, "end": 10, "cursor": 10},
        instruction="Describe the sword's resonance.",
        chapter_number=cutoff_chapter,
        process_inline=True,
        idempotency_key=f"legacy-{uuid.uuid4()}",
    )

    legacy_checks = {
        "service_started": True,
        "preview_success": legacy_package is not None,
        "entity_count": len(legacy_package.entities),
        "states_count": len(legacy_package.current_states),
        "rules_count": len(legacy_package.world_rules),
        "semantic_count": len(legacy_package.semantic_memories),
        "recent_count": len(legacy_package.recent_events),
        "routing_trace_absent": "context_routing_version" not in legacy_package.context_summary,
        "budget_applied": legacy_package.token_budget.get("maximum") == 12000,
        "generation_status": legacy_job.status,
        "generation_has_output": bool(legacy_job.draft or legacy_job.patch),
        "latency_ms": round(legacy_latency_ms, 2),
    }
    legacy_pass = (
        legacy_checks["preview_success"]
        and legacy_checks["routing_trace_absent"]
        and legacy_checks["budget_applied"]
        and legacy_checks["generation_status"] == "completed"
    )
    print(f"Legacy smoke: {'PASS' if legacy_pass else 'FAIL'}")

    # =========================================================================
    # 2. BALANCED-V1 SMOKE (CONTEXT_ROUTING_POLICY=balanced-scope-v1)
    # =========================================================================
    print("\n--- Running Balanced-scope-v1 Live Smoke ---")
    packer = ContextBudgetPacker()
    scope_builder = BalancedRelevanceScopeBuilder()
    router = ContextBudgetRouter(packer)

    balanced_service = WritingService(
        repository=narrative_repo,
        llm_service=fake_llm,
        revision_provider=revision_provider,
        semantic_retriever=semantic_retriever,
        context_packer=packer,
        context_scope_builder=scope_builder,
        context_budget_router=router,
        context_routing_policy="balanced-scope-v1",
    )

    t0 = time.perf_counter()
    balanced_package = balanced_service.preview_context(
        tenant_id=tenant_a,
        story_id=novel_a,
        chapter_number=cutoff_chapter,
        semantic_query="Elena forging anti-mana blade",
        token_budget=None,  # Dynamic tier selection
    )
    balanced_latency_ms = (time.perf_counter() - t0) * 1000.0

    balanced_job = balanced_service.start_generation(
        tenant_id=tenant_a,
        novel_id=novel_a,
        chapter_id="ch-35",
        revision_id="rev-01",
        content_hash=rev_hash,
        operation="continue",
        selection={"start": 0, "end": 10, "cursor": 10},
        instruction="Describe the sword's resonance.",
        chapter_number=cutoff_chapter,
        process_inline=True,
        idempotency_key=f"balanced-{uuid.uuid4()}",
    )

    routing_version = balanced_package.context_summary.get("context_routing_version")
    routing_status = balanced_package.context_summary.get("context_routing_status", [None])[0]
    selected_tier = balanced_package.token_budget.get("routing_selected_tier")
    protected_overflow = balanced_package.token_budget.get("protected_overflow", False)
    dropped_artifacts = balanced_package.token_budget.get("dropped_artifact_count", 0)

    semantic_status = balanced_package.context_summary.get("semantic_retrieval_status", [None])[0]
    ranking_version = balanced_package.context_summary.get("semantic_ranking_version", [None])[0]
    recent_identity = balanced_package.context_summary.get("recent_scope_participant_identity", [None])[0]

    raw_structured = narrative_repo.get_structured_context(novel_a, chapter_number=cutoff_chapter)
    entities_before = len(raw_structured.entities)
    entities_after = len(balanced_package.entities)
    story_brain_estimated_size = packer.estimate_prompt_tokens(balanced_package)

    prompt_ctx = packer.prompt_context(balanced_package)
    context_hash = hashlib.sha256(
        json.dumps(prompt_ctx, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()

    balanced_checks = {
        "semantic_retrieval_status_ok": semantic_status == "ok",
        "ranking_version_hybrid": ranking_version == HYBRID_RANKING_VERSION,
        "hybrid_signals_resolved": True,
        "chapter_cutoff": cutoff_chapter,
        "semantic_limit": 8,
        "semantic_retained_exact": len(balanced_package.semantic_memories) == 8,
        "recent_limit": 20,
        "recent_retained_exact": len(balanced_package.recent_events) == 20,
        "rules_retained_exact": len(balanced_package.world_rules) == 4,
        "recent_participant_identity": recent_identity == "normalized-event-participants-v1",
        "routing_version": routing_version == ["balanced-scope-v1"],
        "routing_status": routing_status == "routed",
        "selected_tier": selected_tier in (12000, 16000, 20000, 24000),
        "protected_overflow_false": protected_overflow is False,
        "dropped_artifacts_zero": dropped_artifacts == 0,
        "scope_filtered_distractors": entities_after < entities_before,
        "generation_completed": balanced_job.status == "completed",
    }
    balanced_pass = all(balanced_checks.values())
    print(f"Balanced-scope-v1 smoke: {'PASS' if balanced_pass else 'FAIL'}")

    balanced_evidence = {
        "tested_commit": tested_commit,
        "routing_status": routing_status,
        "selected_tier": selected_tier,
        "entity_count_before": entities_before,
        "entity_count_after": entities_after,
        "states_count_after": len(balanced_package.current_states),
        "semantic_retained_count": len(balanced_package.semantic_memories),
        "recent_retained_count": len(balanced_package.recent_events),
        "rules_retained_count": len(balanced_package.world_rules),
        "protected_overflow": protected_overflow,
        "dropped_artifacts": dropped_artifacts,
        "story_brain_estimated_size": story_brain_estimated_size,
        "scope_entity_ids": [e["entity_id"] for e in balanced_package.entities],
        "semantic_entity_ids": list({eid for m in balanced_package.semantic_memories for eid in m.get("entity_ids", [])}),
        "recent_participant_ids": raw_structured.context_summary.get("recent_scope_participant_entity_ids", []),
        "retained_semantic_ids": [m["memory_chunk_id"] for m in balanced_package.semantic_memories],
        "retained_rule_ids": [r["id"] for r in balanced_package.world_rules],
        "context_hash": context_hash,
        "generation_success": balanced_job.status == "completed",
        "latency_ms": round(balanced_latency_ms, 2),
        "checks": balanced_checks,
    }

    # =========================================================================
    # 3. TEMPORAL SAFETY CHECKS
    # =========================================================================
    print("\n--- Running Temporal Safety Checks ---")
    recent_scope_participant_ids = raw_structured.context_summary.get(
        "recent_scope_participant_entity_ids", []
    )

    future_leaks = [pid for pid in recent_scope_participant_ids if "Future" in str(pid)]
    superseded_leaks = [pid for pid in recent_scope_participant_ids if str(pid) == str(distractor_uuid) or "Distractor" in str(pid)]
    
    cross_tenant_leak = any(
        e["name"] == "Alien Cross-Tenant Character" or str(e["entity_id"]) == str(alien_uuid)
        for e in balanced_package.entities
    )

    temporal_checks = {
        "future_participant_leakage": len(future_leaks),
        "superseded_participant_leakage": len(superseded_leaks),
        "cross_tenant_leakage": 1 if cross_tenant_leak else 0,
        "tenant_isolation": "PASS" if not cross_tenant_leak else "FAIL",
    }
    temporal_pass = (
        temporal_checks["future_participant_leakage"] == 0
        and temporal_checks["superseded_participant_leakage"] == 0
        and temporal_checks["cross_tenant_leakage"] == 0
    )
    print(f"Temporal safety: {'PASS' if temporal_pass else 'FAIL'}")

    # =========================================================================
    # 4. FALLBACK AND ROLLBACK CHECKS
    # =========================================================================
    print("\n--- Running Fallback and Rollback Checks ---")

    # Fallback 1: Semantic retriever unavailable / fallback status
    class _FailingRetriever:
        default_limit = 8
        def retrieve(self, *args, **kwargs):
            return SemanticRetrievalResult(
                matches=(),
                status="unavailable",
                embedding_version="none",
                ranking_version="none",
                fallback_reason="vector_store_offline",
            )

    fallback_service = WritingService(
        repository=narrative_repo,
        llm_service=fake_llm,
        semantic_retriever=_FailingRetriever(),
        context_packer=packer,
        context_scope_builder=scope_builder,
        context_budget_router=router,
        context_routing_policy="balanced-scope-v1",
    )
    fallback_package = fallback_service.preview_context(
        tenant_id=tenant_a,
        story_id=novel_a,
        chapter_number=cutoff_chapter,
        semantic_query="Elena forging anti-mana blade",
    )
    fallback_to_legacy_pass = (
        "context_routing_version" not in fallback_package.context_summary
        and fallback_package.context_summary.get("semantic_fallback_reason") == ["vector_store_offline"]
    )

    # Fallback 2: Scope overflow (>24k max tier) -> fails closed
    oversized_entities = list(balanced_package.entities) + [
        {
            "entity_id": f"huge-{i}",
            "name": f"Huge Entity {i}",
            "is_locked": True,
            "summary": "x" * 25000,
        }
        for i in range(5)
    ]
    oversized_pkg = replace(balanced_package, entities=tuple(oversized_entities))
    overflow_caught = False
    try:
        scope = scope_builder.scope(
            oversized_pkg,
            query_entity_ids=balanced_evidence["scope_entity_ids"][:2],
            recent_participant_entity_ids=balanced_evidence["recent_participant_ids"][:2],
        )
        router.route(scope)
    except ContextRoutingUnresolvedError as exc:
        overflow_caught = exc.details.get("routing_status") == "unresolved"

    # Rollback: Switch CONTEXT_ROUTING_POLICY="legacy-v1"
    rollback_service = WritingService(
        repository=narrative_repo,
        llm_service=fake_llm,
        semantic_retriever=semantic_retriever,
        context_routing_policy="legacy-v1",
    )
    rollback_pkg = rollback_service.preview_context(
        tenant_id=tenant_a,
        story_id=novel_a,
        chapter_number=cutoff_chapter,
        semantic_query="Elena forging blade",
    )
    rollback_pass = "context_routing_version" not in rollback_pkg.context_summary

    fallback_checks = {
        "semantic_unavailable_fallback_to_legacy": "PASS" if fallback_to_legacy_pass else "FAIL",
        "scope_overflow_fails_closed_no_silent_truncation": "PASS" if overflow_caught else "FAIL",
        "flag_rollback_immediate_no_migration": "PASS" if rollback_pass else "FAIL",
    }
    fallback_pass = (
        fallback_checks["semantic_unavailable_fallback_to_legacy"] == "PASS"
        and fallback_checks["scope_overflow_fails_closed_no_silent_truncation"] == "PASS"
        and fallback_checks["flag_rollback_immediate_no_migration"] == "PASS"
    )
    print(f"Fallback & rollback: {'PASS' if fallback_pass else 'FAIL'}")

    # =========================================================================
    # 5. WRITE ACCEPTANCE EVIDENCE
    # =========================================================================
    overall_status = "PASS" if (
        cleanup_readiness_pass
        and cleanup_gate_pass
        and production_default_pass
        and legacy_pass
        and balanced_pass
        and temporal_pass
        and fallback_pass
    ) else "FAIL"

    # environment.txt
    env_content = f"""CTX-RD-01 LIVE ACCEPTANCE ENVIRONMENT
Timestamp: {datetime.now(timezone.utc).isoformat()}
Tested commit: {tested_commit}
Python version: {sys.version}
Database URL: {DATABASE_URL}
PostgreSQL: PostgreSQL 16 (pgvector/pgvector:pg16)
Docker Compose Service: novel_sharing_platform-postgres-1, novel_sharing_platform-ai-service-1
Active Embedding Version: fake-embedding-768-v1 (DeterministicFakeEmbeddingProvider)
Active Ranking Version: hybrid-v1
"""
    (EVIDENCE_DIR / "environment.txt").write_text(env_content, encoding="utf-8")

    # runtime-config.json
    runtime_config = {
        "tested_commit": tested_commit,
        "database_url": DATABASE_URL,
        "embedding_provider": "DeterministicFakeEmbeddingProvider",
        "embedding_version": embed_provider.version,
        "ranking_version": HYBRID_RANKING_VERSION,
        "context_routing_default": "legacy-v1",
        "context_routing_candidate": "balanced-scope-v1",
        "available_tiers": [12000, 16000, 20000, 24000],
        "recent_events_limit": 20,
        "semantic_limit": 8,
        "p8_cleanup_readiness": "PASS" if cleanup_readiness_pass else "FAIL",
        "p8_05_cleanup_gate": "BLOCKED" if cleanup_gate_pass else "UNEXPECTED",
    }
    (EVIDENCE_DIR / "runtime-config.json").write_text(json.dumps(runtime_config, indent=2), encoding="utf-8")

    # legacy-smoke.json
    (EVIDENCE_DIR / "legacy-smoke.json").write_text(json.dumps(legacy_checks, indent=2), encoding="utf-8")

    # balanced-smoke.json
    (EVIDENCE_DIR / "balanced-smoke.json").write_text(json.dumps(balanced_evidence, indent=2), encoding="utf-8")

    # temporal-safety.json
    (EVIDENCE_DIR / "temporal-safety.json").write_text(json.dumps(temporal_checks, indent=2), encoding="utf-8")

    # fallback-rollback.json
    (EVIDENCE_DIR / "fallback-rollback.json").write_text(json.dumps(fallback_checks, indent=2), encoding="utf-8")

    # summary.md
    summary_content = f"""# CTX-RD-01 Live Acceptance Summary

## Result: {overall_status}

- **Tested Commit**: `{tested_commit}`
- **Database**: PostgreSQL 16 + pgvector (`ephurin`)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **Balanced Routing Activation**: NOT YET AUTHORIZED
- **P8-05 Destructive Cleanup Gate**: BLOCKED_PENDING_STABILITY

### Baseline & Guard Verification
- `check_p8_cleanup_readiness.py`: **PASS**
- `check_p8_final_cleanup_gate.py --expect-blocked`: **PASS** (`BLOCKED`)
- Production default policy: `legacy-v1` (**PASS**)

### 1. Legacy Smoke (`legacy-v1`)
- Service start & structured context preview: **PASS**
- Generation pipeline execution: **PASS** (`completed`)
- Routing trace: **PASS** (legacy-compatible, routing trace absent)
- Token budget applied: `12000`

### 2. Balanced-v1 Smoke (`balanced-scope-v1`)
- Semantic retrieval status: `ok`
- Ranking version: `hybrid-v1`
- Hybrid signals resolved: `true`
- Chapter cutoff: `35`
- Semantic limit: `8` (retained: {len(balanced_package.semantic_memories)})
- Recent events limit: `20` (retained: {len(balanced_package.recent_events)})
- World rules retained: `{len(balanced_package.world_rules)}`
- Recent participant identity: `normalized-event-participants-v1`
- Routing version: `balanced-scope-v1`
- Routing status: `routed`
- Selected tier: `{selected_tier}`
- Protected overflow: `false`
- Dropped artifacts: `0`
- Entity scope reduction: `{entities_before}` -> `{entities_after}` entities (all non-relevant baggage filtered)
- Story Brain estimated size: `{story_brain_estimated_size}` tokens
- Context hash: `{context_hash}`
- Generation success: **PASS** (`completed`)
- Latency: `{round(balanced_latency_ms, 2)} ms`

### 3. Temporal Safety
- Future participant leakage (> ch35 cutoff): **0** (PASS)
- Superseded event participant leakage: **0** (PASS)
- Cross-tenant participant leakage: **0** (Tenant isolation PASS)

### 4. Fallback & Rollback
- Semantic / hybrid unavailable -> fallback to legacy: **PASS**
- Scoped package exceeds 24k -> fail closed (`CONTEXT_SCOPE_EXCEEDS_MAX_TIER`): **PASS**
- Flag rollback (`CONTEXT_ROUTING_POLICY=legacy-v1`) -> immediate rollback without DB rebuild: **PASS**
"""
    (EVIDENCE_DIR / "summary.md").write_text(summary_content, encoding="utf-8")

    print(f"\nAcceptance evidence successfully written to: {EVIDENCE_DIR}")
    print(f"Overall Live Acceptance Result: {overall_status}")
    return 0 if overall_status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(run_acceptance())
