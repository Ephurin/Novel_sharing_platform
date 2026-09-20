"""
Enhanced interactions router.

Xử lý các luồng phức tạp: NER → Entity Resolution → LLM Event Extraction
→ State Extraction → Interaction Decision → KB Updates.

Sau refactor:
- Schemas dùng từ api/schemas.py
- Services inject qua api/deps.py
- Entity conversion dùng entity_helpers
"""

import time
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException

from application.narrative_service import NarrativeApplicationService
from api.schemas import ProcessInteractionsRequest, RelationOverrideRequest
from api.deps import (
    get_entity_pipeline,
    get_llm_service,
    get_narrative_service,
    get_story_kb,
    require_service_token,
)
from core.entity_resolver import resolve_entities, find_kb_entities_in_text
from core.exceptions import EntityExtractionError
from core.story_kb_manager import StoryKBManager
from services.interaction_service import decide_interaction
from services.state_extraction import extract_states
from services.entity_pipeline.pipeline import EntityPipeline
from services.entity_helpers import pipeline_to_interaction_format
from models.event import Event


router = APIRouter(
    prefix="/v1/enhanced",
    tags=["interactions"],
    dependencies=[Depends(require_service_token)],
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
#  POST /process-interactions
# ──────────────────────────────────────────────

@router.post("/process-interactions")
def process_interactions(
    payload: ProcessInteractionsRequest,
    pipeline: EntityPipeline = Depends(get_entity_pipeline),
    llm_service=Depends(get_llm_service),
    kb_manager: StoryKBManager = Depends(get_story_kb),
):
    # Phase 6.5 invariant: Direct write to canonical Story Brain is locked
    raise HTTPException(
        status_code=403,
        detail={
            "code": "DIRECT_WRITE_DISABLED",
            "message": "Direct write to canonical Story Brain is disabled; use revision analysis and proposal review pipeline",
        },
    )

    # ── Step 1.5: Entity Resolution ─────────────────────
    kb = kb_manager.load_kb(payload.story_id)
    resolved_entities = resolve_entities(entities, kb)

    # ── Step 1.6: KB-Anchored Extraction ────────────────
    kb_anchored_entities = find_kb_entities_in_text(payload.text, kb)

    # Merge and deduplicate by 'resolved_name'
    merged = {e["resolved_name"]: e for e in resolved_entities}
    for e in kb_anchored_entities:
        if e["resolved_name"] not in merged:
            merged[e["resolved_name"]] = e
    final_entities = list(merged.values())

    # ── Step 1.7: Persist resolved entities into KB ─────
    # We upsert ALL resolved entities to ensure 'mentions' count is accurate
    for ent in resolved_entities:
        kb_manager.upsert_entity(payload.story_id, ent)
    kb = kb_manager.load_kb(payload.story_id)

    # ── Step 2 & 3: LLM Event & Relation Extraction ────
    events, suggested_relations = _extract_events_and_relations(
        llm_service, payload.text, final_entities
    )

    # ── Step 2.5: State Extraction ──────────────────────
    extracted_states = _extract_and_persist_states(
        llm_service, kb_manager, kb, payload, final_entities
    )

    # ── Step 3.5: Ensure all LLM actors exist in KB ────
    for event in events:
        kb_manager._ensure_entity_exists(kb, event.subject_id, entity_type=event.subject_type)
        kb_manager._ensure_entity_exists(kb, event.object_id, entity_type=event.object_type)

    # ── Step 4: Interaction Decision & Conflict ─────────
    applied_relations, suggested_to_user, ignored_relations = _process_interactions(
        events, suggested_relations, kb, kb_manager, payload.story_id
    )

    # ── Step 5: Enrich entities with KB data for UI ─────
    enriched_entities = _enrich_entities(
        final_entities, events, kb_manager, payload.story_id
    )

    processing_ms = round((time.perf_counter() - started) * 1000.0, 3)

    return {
        "story_id": payload.story_id,
        "entities_extracted": len(entities),
        "entities_resolved": len(resolved_entities),
        "entities_anchored": len(kb_anchored_entities),
        "entities": enriched_entities,
        "events_extracted": len(events),
        "states_extracted": len(extracted_states),
        "applied_relations": applied_relations,
        "suggested_relations": suggested_to_user,
        "ignored_relations": ignored_relations,
        "processing_ms": processing_ms,
    }


# ──────────────────────────────────────────────
#  GET /kb/{story_id}
# ──────────────────────────────────────────────

@router.get("/kb/{story_id}")
def get_kb(
    story_id: str,
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
):
    return narrative.get_snapshot(story_id)


# ──────────────────────────────────────────────
#  POST /relation/override
# ──────────────────────────────────────────────

@router.post("/relation/override")
def override_relation(
    payload: RelationOverrideRequest,
    narrative: NarrativeApplicationService = Depends(get_narrative_service),
):
    try:
        result = narrative.override_relation(
            story_id=payload.story_id,
            subject=payload.subject,
            relation_type=payload.relation,
            object_name=payload.object,
        )
        return result
    except Exception as exc:
        logger.error("Failed to override relation: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────
#  Private helper functions
# ──────────────────────────────────────────────

def _extract_events_and_relations(llm_service, text: str, final_entities: list[dict]):
    """Gọi LLM để trích xuất events và suggested relations từ text."""
    events: list[Event] = []
    suggested_relations: list[dict] = []

    if not llm_service:
        return events, suggested_relations

    llm_result = llm_service.extract_events_and_relations(text, final_entities)
    raw_events = llm_result.get("events", [])

    for raw in raw_events:
        event_id = str(uuid.uuid4())
        subject = raw.get("subject", "Unknown")
        action = raw.get("action", "interacted_with")
        object_name = raw.get("object", "Unknown")
        subject_type = raw.get("subject_type", "UNKNOWN")
        object_type = raw.get("object_type", "UNKNOWN")
        rel_type = raw.get("suggested_relation", "").upper() if raw.get("suggested_relation") else ""
        confidence = float(raw.get("confidence", 0.8))

        # VALIDATION: Fallback to KNOWS if LLM hallucinates strange formats like "ALLY_OF | KNOWS"
        valid_relations = ["ALLY_OF", "ENEMY_OF", "KNOWS", "LOVES", "HAS_ITEM", "BELONGS_TO"]
        if rel_type and rel_type not in ["", "NONE", "NULL", "RỖNG", "KHÔNG CÓ"]:
            if rel_type not in valid_relations:
                logger.warning(f"LLM hallucinated relation '{rel_type}'. Falling back to 'KNOWS'.")
                rel_type = "KNOWS"

        # Map names back to entity IDs if possible
        subj_id = subject
        obj_id = object_name
        for e in final_entities:
            if e.get("resolved_name") == subject or e.get("word") == subject:
                subj_id = e.get("id", subject)
            if e.get("resolved_name") == object_name or e.get("word") == object_name:
                obj_id = e.get("id", object_name)

        event = Event(
            id=event_id,
            subject_id=subj_id,
            subject_type=subject_type,
            action=action,
            object_id=obj_id,
            object_type=object_type,
            intent=raw.get("intent"),
            emotion=raw.get("emotion"),
            polarity=raw.get("polarity"),
            confidence=confidence,
            source="LLM",
            raw_text=text,
        )
        events.append(event)

        if rel_type and rel_type not in ["", "NONE", "NULL", "RỖNG", "KHÔNG CÓ"]:
            suggested_relations.append({
                "subject": subj_id,
                "subject_type": subject_type,
                "relation": rel_type,
                "object": obj_id,
                "object_type": object_type,
                "confidence": confidence,
                "metadata": {
                    "source_event_id": event_id,
                    "context": text,
                },
            })

    return events, suggested_relations


def _extract_and_persist_states(llm_service, kb_manager, kb, payload, final_entities):
    """Trích xuất entity states bằng LLM và lưu vào KB."""
    extracted_states = []
    if not llm_service:
        return extracted_states

    extracted_states = extract_states(payload.text, final_entities, llm_service)
    for state in extracted_states:
        kb_manager.append_entity_state(payload.story_id, state.model_dump())
        # Find entity type from final_entities
        e_type = "UNKNOWN"
        for e in final_entities:
            if e.get("resolved_name") == state.entity_id or e.get("word") == state.entity_id:
                e_type = e.get("entity_type") or e.get("type") or "UNKNOWN"
                break
        kb_manager._ensure_entity_exists(kb, state.entity_id, entity_type=e_type)

    return extracted_states


def _process_interactions(events, suggested_relations, kb, kb_manager, story_id):
    """Quyết định auto-apply, suggest, hoặc ignore cho từng relation."""
    applied_relations = []
    suggested_to_user = []
    ignored_relations = []

    for event in events:
        event_relations = [
            r for r in suggested_relations
            if r["metadata"].get("source_event_id") == event.id
        ]

        for rel in event_relations:
            decision = decide_interaction(event, rel, kb)

            if decision["action"] == "auto_apply":
                kb_manager.append_relation(story_id, rel)
                applied_relations.append({"relation": rel, "reason": decision["reason"]})
            elif decision["action"] == "suggest_user":
                suggested_to_user.append({"relation": rel, "reason": decision["reason"]})
            else:
                ignored_relations.append({"relation": rel, "reason": decision["reason"]})

        # Store event into KB
        kb = kb_manager.load_kb(story_id)
        kb.enhanced_events.append(event.model_dump())
        kb_manager.save_kb(story_id, kb)

    return applied_relations, suggested_to_user, ignored_relations


def _enrich_entities(final_entities, events, kb_manager, story_id):
    """Bổ sung metadata từ KB vào danh sách entities cho frontend hiển thị."""
    kb = kb_manager.load_kb(story_id)

    all_discovered_names = set(
        e.get("resolved_name", e.get("word", "")) for e in final_entities
    )

    # Include entities discovered by LLM events
    for evt in events:
        for actor in [evt.subject_id, evt.object_id]:
            if actor and actor != "Unknown" and actor.casefold() not in [n.casefold() for n in all_discovered_names]:
                all_discovered_names.add(actor)
                final_entities.append({
                    "word": actor,
                    "resolved_name": actor,
                    "entity_type": evt.subject_type if actor == evt.subject_id else evt.object_type,
                })

    enriched = []
    for ent in final_entities:
        name = ent.get("resolved_name") or ent.get("word")
        if not name:
            continue
        kb_ent = kb.entities.get(name.casefold())
        if kb_ent:
            enriched.append({
                **ent,
                "entity_type": kb_ent.entity_type,
                "status": kb_ent.status,
                "location": kb_ent.location,
                "attributes": kb_manager.get_latest_states(story_id, name),
            })
        else:
            enriched.append(ent)

    return enriched
