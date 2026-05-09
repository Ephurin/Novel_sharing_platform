import time
import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from core.entity_resolver import resolve_entities, find_kb_entities_in_text
from services.interaction_service import decide_interaction
from services.state_extraction import extract_states
import uuid
from models.event import Event

router = APIRouter(prefix="/v1/enhanced", tags=["interactions"])
logger = logging.getLogger(__name__)

class ProcessInteractionsRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    use_existing_entities: bool = True

class RelationOverrideRequest(BaseModel):
    story_id: str = Field(..., min_length=1)
    subject: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)
    object: str = Field(..., min_length=1)

@router.post("/process-interactions")
def process_interactions(payload: ProcessInteractionsRequest, request: Request):
    started = time.perf_counter()
    
    # 1. NER pipeline
    # 1. New Hybrid NER pipeline
    try:
        # Run the new rule-based + ML pipeline with LLM labeling
        llm_service = getattr(request.app.state, "llm_service", None)
        extracted_candidates = request.app.state.entity_pipeline.run(payload.text, llm_service=llm_service)
        
        # Convert to the internal format expected by subsequent steps
        entities = []
        for cand in extracted_candidates:
            entities.append({
                "word": cand["phrase"],
                "Entity": cand["phrase"],
                "entity": cand.get("entity", "UNKNOWN"),
                "score": cand["score"] / 10.0,
                "source": "hybrid_pipeline"
            })
    except Exception as exc:
        logger.error(f"Hybrid pipeline failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    # Load Knowledge Base
    kb = request.app.state.story_kb.load_kb(payload.story_id)
    
    # 1.5. Entity Resolution — map NER names to canonical KB names
    resolved_entities = resolve_entities(entities, kb)
    
    # 1.6. KB-Anchored Extraction — find missed entities
    kb_anchored_entities = find_kb_entities_in_text(payload.text, kb)
    
    # Merge and deduplicate by 'resolved_name'
    merged_entities_dict = {e["resolved_name"]: e for e in resolved_entities}
    for e in kb_anchored_entities:
        if e["resolved_name"] not in merged_entities_dict:
            merged_entities_dict[e["resolved_name"]] = e
            
    final_entities = list(merged_entities_dict.values())
    
    # 1.7. Persist all resolved entities into KB with their NER type (PER/LOC/ORG)
    for ent in final_entities:
        request.app.state.story_kb.upsert_entity(payload.story_id, ent)
    # Reload KB after upserts to get latest state
    kb = request.app.state.story_kb.load_kb(payload.story_id)
    # 2 & 3. LLM-Powered Event & Relation Extraction
    events = []
    suggested_relations = []
    
    if hasattr(request.app.state, 'llm_service') and request.app.state.llm_service:
        llm_result = request.app.state.llm_service.extract_events_and_relations(payload.text, final_entities)
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
                raw_text=payload.text
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
                        "context": payload.text
                    }
                })

    # 2.5. State Extraction (NEW — Entity State Management)
    extracted_states = []
    if hasattr(request.app.state, 'llm_service') and request.app.state.llm_service:
        extracted_states = extract_states(payload.text, final_entities, request.app.state.llm_service)
        for state in extracted_states:
            request.app.state.story_kb.append_entity_state(
                payload.story_id, state.model_dump()
            )
            # Ensure entity exists in KB
            # Find the type from final_entities if possible
            e_type = "UNKNOWN"
            for e in final_entities:
                if e.get("resolved_name") == state.entity_id or e.get("word") == state.entity_id:
                    e_type = e.get("entity_type") or e.get("type") or "UNKNOWN"
                    break
            request.app.state.story_kb._ensure_entity_exists(kb, state.entity_id, entity_type=e_type)

    # 3.5. Ensure all LLM-extracted actors exist in KB
    for event in events:
        request.app.state.story_kb._ensure_entity_exists(kb, event.subject_id, entity_type=event.subject_type)
        request.app.state.story_kb._ensure_entity_exists(kb, event.object_id, entity_type=event.object_type)

    # 4. Interaction Decision & Conflict Detection
    applied_relations = []
    ignored_relations = []
    suggested_to_user = []
    
    for event in events:
        # Match event to its relation suggestions
        event_relations = [r for r in suggested_relations if r["metadata"].get("source_event_id") == event.id]
        
        for rel in event_relations:
            decision = decide_interaction(event, rel, kb)
            
            if decision["action"] == "auto_apply":
                request.app.state.story_kb.append_relation(payload.story_id, rel)
                applied_relations.append({"relation": rel, "reason": decision["reason"]})
            elif decision["action"] == "suggest_user":
                suggested_to_user.append({"relation": rel, "reason": decision["reason"]})
            else:
                ignored_relations.append({"relation": rel, "reason": decision["reason"]})
                
        # Also store the event itself if it resulted in any action (or just store all events)
        kb = request.app.state.story_kb.load_kb(payload.story_id)
        kb.enhanced_events.append(event.model_dump())
        request.app.state.story_kb.save_kb(payload.story_id, kb)

    # 5. Enrich final_entities with full data from KB for UI
    # AND include any NEW entities discovered by LLM (registered in KB but not in final_entities)
    kb = request.app.state.story_kb.load_kb(payload.story_id)
    
    all_discovered_names = set(final_entities[i].get("resolved_name", final_entities[i].get("word", "")) for i in range(len(final_entities)))
    
    # Check for entities registered by LLM in this pass
    for evt in events:
        for actor in [evt.subject_id, evt.object_id]:
            if actor and actor != "Unknown" and actor.casefold() not in [n.casefold() for n in all_discovered_names]:
                all_discovered_names.add(actor)
                # Mock a basic entity object
                final_entities.append({"word": actor, "resolved_name": actor, "entity_type": evt.subject_type if actor == evt.subject_id else evt.object_type})

    enriched_entities = []
    for ent in final_entities:
        name = ent.get("resolved_name") or ent.get("word")
        if not name: continue
        kb_ent = kb.entities.get(name.casefold())
        if kb_ent:
            enriched = {
                **ent,
                "entity_type": kb_ent.entity_type,
                "status": kb_ent.status,
                "location": kb_ent.location,
                "attributes": request.app.state.story_kb.get_latest_states(payload.story_id, name)
            }
            enriched_entities.append(enriched)
        else:
            enriched_entities.append(ent)

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
        "processing_ms": processing_ms
    }

@router.get("/kb/{story_id}")
def get_kb(story_id: str, request: Request):
    kb = request.app.state.story_kb.load_kb(story_id)
    return kb.model_dump()

@router.post("/relation/override")
def override_relation(payload: RelationOverrideRequest, request: Request):
    try:
        result = request.app.state.story_kb.override_relation(
            story_id=payload.story_id,
            subject=payload.subject,
            relation_type=payload.relation,
            object_name=payload.object,
            source="author"
        )
        return result
    except Exception as exc:
        logger.error(f"Failed to override relation: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
