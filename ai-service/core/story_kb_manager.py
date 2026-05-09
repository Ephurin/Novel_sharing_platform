import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class KBEntity(BaseModel):
    name: str
    entity_type: str = "UNKNOWN"
    status: str = "Alive"
    location: str = "Unknown"
    mentions: int = 1

class KBRelation(BaseModel):
    subject: str
    relation: str
    object: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    source: str = "system"
    locked: bool = False

class KBEvent(BaseModel):
    event_type: str
    actors: List[str]
    result: str
    chapter: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StoryKB(BaseModel):
    story_id: str
    metadata: Dict[str, str] = Field(default_factory=lambda: {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    entities: Dict[str, KBEntity] = Field(default_factory=dict)
    relations: List[KBRelation] = Field(default_factory=list)
    events: List[KBEvent] = Field(default_factory=list)
    enhanced_events: List[Dict[str, Any]] = Field(default_factory=list)
    relation_history: List[Dict[str, Any]] = Field(default_factory=list)
    entity_states: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)

class StoryKBManager:
    """Manages file-based JSON Knowledge Base for a given story."""
    
    def __init__(self, storage_dir: str | Path = "data"):
        # Default storage relative to the ai-service root
        base_dir = Path(__file__).resolve().parent.parent
        self.storage_dir = base_dir / Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, story_id: str) -> Path:
        safe_id = "".join(c for c in story_id if c.isalnum() or c in ('-', '_'))
        if not safe_id:
            safe_id = "default_story"
        return self.storage_dir / f"{safe_id}.json"

    def load_kb(self, story_id: str) -> StoryKB:
        file_path = self._get_file_path(story_id)
        if not file_path.exists():
            return StoryKB(story_id=story_id)
        
        try:
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            return StoryKB.model_validate(data)
        except Exception as exc:
            logger.error(f"Failed to load KB for {story_id}: {exc}")
            return StoryKB(story_id=story_id)

    def save_kb(self, story_id: str, kb: StoryKB) -> None:
        file_path = self._get_file_path(story_id)
        kb.metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            with file_path.open("w", encoding="utf-8") as f:
                f.write(kb.model_dump_json(indent=2))
        except Exception as exc:
            logger.error(f"Failed to save KB for {story_id}: {exc}")

    def _ensure_entity_exists(self, kb: StoryKB, name: str, entity_type: str = "UNKNOWN") -> None:
        """Helper to ensure an entity is registered in the KB's entities dictionary."""
        if not name or len(name) < 3:
            return
        # Skip common pronouns
        if name.lower() in ["he", "she", "it", "they", "them", "him", "her", "hắn", "cô", "họ", "nó"]:
            return
        key = name.casefold()
        if key not in kb.entities:
            kb.entities[key] = KBEntity(name=name, entity_type=entity_type)
            logger.info(f"Auto-registered entity: {name} ({entity_type})")
        elif kb.entities[key].entity_type == "UNKNOWN" and entity_type != "UNKNOWN":
            # Update existing UNKNOWN entity with a better type if found
            kb.entities[key].entity_type = entity_type
            logger.info(f"Updated entity type: {name} -> {entity_type}")

    def upsert_entity(self, story_id: str, entity_data: Dict[str, Any]) -> Dict[str, Any]:
        kb = self.load_kb(story_id)
        
        name = str(entity_data.get("word") or entity_data.get("Entity") or entity_data.get("name") or entity_data.get("normalized_name") or entity_data.get("raw_name") or "").strip()
        label = str(entity_data.get("type") or entity_data.get("entity") or entity_data.get("Label") or "UNKNOWN").strip()
        
        logger.warning(f"[UPSERT DEBUG] name={name}, label={label}, raw_keys={list(entity_data.keys())}, type_val={entity_data.get('type')!r}, entity_val={entity_data.get('entity')!r}")
        
        if not name:
            return {"status": "skipped", "reason": "empty_entity_name"}

        key = name.casefold()
        if key in kb.entities:
            kb.entities[key].mentions += 1
            if kb.entities[key].entity_type == "UNKNOWN" and label != "UNKNOWN":
                kb.entities[key].entity_type = label
        else:
            kb.entities[key] = KBEntity(name=name, entity_type=label)

        # Append relation MENTIONED_IN
        score_raw = entity_data.get("score", entity_data.get("Score", 0.0))
        try:
            score = float(score_raw)
        except (TypeError, ValueError):
            score = 0.0

        kb.relations.append(KBRelation(
            subject=name,
            relation="MENTIONED_IN",
            object=story_id,
            metadata={"score": score}
        ))

        self.save_kb(story_id, kb)
        return {
            "entity": name,
            "label": label,
            "story_id": story_id,
            "status": "updated"
        }

    def append_relation(self, story_id: str, relation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Appends a new relation to the KB."""
        kb = self.load_kb(story_id)
        
        subject = str(relation_data.get("subject", "")).strip()
        relation_type = str(relation_data.get("relation", "")).strip()
        object_name = str(relation_data.get("object", "")).strip()
        
        subject_type = str(relation_data.get("subject_type") or "UNKNOWN").strip()
        object_type = str(relation_data.get("object_type") or "UNKNOWN").strip()
        
        if not subject or not relation_type or not object_name:
            return {"status": "skipped", "reason": "missing_relation_fields"}

        # Check if relation already exists and is locked
        for rel in kb.relations:
            if rel.subject == subject and rel.relation == relation_type and rel.object == object_name:
                if rel.locked:
                    return {"status": "skipped", "reason": "relation_locked_by_author"}
                break

        new_rel = KBRelation(
            subject=subject,
            relation=relation_type,
            object=object_name,
            metadata=relation_data.get("metadata", {}),
            source=relation_data.get("source", "system"),
            locked=relation_data.get("locked", False)
        )
        kb.relations.append(new_rel)
        
        # Ensure entities exist
        self._ensure_entity_exists(kb, subject, entity_type=subject_type)
        self._ensure_entity_exists(kb, object_name, entity_type=object_type)
        
        kb.relation_history.append({
            "action": "append",
            "relation": new_rel.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        self.save_kb(story_id, kb)
        return {"status": "success", "relation": relation_type}

    def append_entity_state(self, story_id: str, state_data: Dict[str, Any]) -> Dict[str, Any]:
        """Appends a state entry to the entity's state history. Never overwrites."""
        kb = self.load_kb(story_id)

        entity_id = str(state_data.get("entity_id", "")).strip()
        attribute = str(state_data.get("attribute", "")).strip()
        value = str(state_data.get("value", "")).strip()

        if not entity_id or not attribute or not value:
            return {"status": "skipped", "reason": "missing_state_fields"}

        key = entity_id.casefold()
        if key not in kb.entity_states:
            kb.entity_states[key] = []

        kb.entity_states[key].append({
            "attribute": attribute,
            "value": value,
            "confidence": state_data.get("confidence", 0.8),
            "source": state_data.get("source", "AI"),
            "timestamp": state_data.get("timestamp", datetime.now(timezone.utc).isoformat())
        })

        # Ensure entity exists
        self._ensure_entity_exists(kb, entity_id)

        # Also update the entity's quick-access fields
        if key in kb.entities:
            if attribute == "health" or attribute == "status":
                kb.entities[key].status = value
            elif attribute == "location":
                kb.entities[key].location = value

        self.save_kb(story_id, kb)
        return {"status": "success", "entity": entity_id, "attribute": attribute, "value": value}

    def get_latest_states(self, story_id: str, entity_id: str) -> Dict[str, Any]:
        """Returns the most recent state per attribute for a given entity."""
        kb = self.load_kb(story_id)
        key = entity_id.casefold()
        history = kb.entity_states.get(key, [])

        latest: Dict[str, Any] = {}
        for entry in history:
            attr = entry.get("attribute", "")
            latest[attr] = entry  # last one wins (history is append-only)

        return latest

    def override_relation(self, story_id: str, subject: str, relation_type: str, object_name: str, source: str = "author") -> Dict[str, Any]:
        """Overrides a relation and marks it as locked."""
        kb = self.load_kb(story_id)
        
        # Remove existing conflicting relations if any
        kb.relations = [r for r in kb.relations if not (r.subject == subject and r.object == object_name)]
        
        new_rel = KBRelation(
            subject=subject,
            relation=relation_type,
            object=object_name,
            source=source,
            locked=True
        )
        kb.relations.append(new_rel)
        
        kb.relation_history.append({
            "action": "override",
            "relation": new_rel.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        self.save_kb(story_id, kb)
        return {"status": "success", "relation": relation_type, "locked": True}

    def get_context_data(self, story_id: str) -> Dict[str, Any]:
        """Adapter format for legacy compatibility and context generation."""
        kb = self.load_kb(story_id)
        return kb.model_dump()
    
    # ---- ADAPTER LAYER FOR NEO4J REPLACEMENT ----
    def adapter_get_related_entities(self, story_id: str, entity_name: str, limit: int = 10) -> List[Dict[str, str]]:
        kb = self.load_kb(story_id)
        related = []
        target_name = entity_name.casefold()
        
        for rel in kb.relations:
            if rel.subject.casefold() == target_name:
                related.append({"name": rel.object, "relation": rel.relation})
            elif rel.object.casefold() == target_name:
                related.append({"name": rel.subject, "relation": rel.relation})
        
        return related[:limit]

    def adapter_get_consistency_graph_data(self, story_id: str, character_name: str) -> List[Dict[str, str]]:
        kb = self.load_kb(story_id)
        key = character_name.casefold()
        
        if key not in kb.entities:
            return []
            
        ent = kb.entities[key]
        return [{
            "name": ent.name,
            "status": ent.status,
            "location": ent.location
        }]

    def adapter_get_story_context(self, story_id: str, character_name: str, limit: int = 50) -> str:
        related = self.adapter_get_related_entities(story_id, character_name, limit)
        if not related:
            return f"Character '{character_name.strip()}' has no relationship context in graph."
            
        lines = [f"Center character: {character_name.strip()}", "One-hop relationships:"]
        for rel in related:
            lines.append(f"- {character_name.strip()} -[{rel['relation']}]- {rel['name']}")
        return "\n".join(lines)

    def get_known_locations(self, story_id: str) -> set[str]:
        """Returns a set of all entity names labeled as locations in the KB."""
        kb = self.load_kb(story_id)
        locations = set()
        for entity in kb.entities.values():
            if entity.entity_type.lower() in ["location", "loc"]:
                locations.add(entity.name)
        return locations

    def build_context(self, story_id: str, current_text: str, max_events: int = 5) -> str:
        """Builds a concise, relevant LLM context based on the current text."""
        kb = self.load_kb(story_id)
        
        # 1. Identify relevant entities via substring matching
        text_lower = current_text.casefold()
        relevant_keys = set()
        
        for key, entity in kb.entities.items():
            # A simple substring check
            if key in text_lower:
                relevant_keys.add(key)
                
        # 2. Gather Characters (with latest state info)
        chars = []
        for key in relevant_keys:
            ent = kb.entities[key]
            state_line = f"- {ent.name} ({ent.entity_type}): Status={ent.status}, Location={ent.location}"
            # Append extra state info if available
            if key in kb.entity_states:
                latest = {}
                for entry in kb.entity_states[key]:
                    latest[entry.get("attribute", "")] = entry.get("value", "")
                extras = [f"{k}={v}" for k, v in latest.items() if k not in ("status", "location") and v]
                if extras:
                    state_line += f", {', '.join(extras)}"
            chars.append(state_line)
            
        # 3. Gather Relations
        rels = []
        for rel in kb.relations:
            if rel.relation == "MENTIONED_IN":
                continue  # Skip internal tracking relations
            if rel.subject.casefold() in relevant_keys or rel.object.casefold() in relevant_keys:
                rels.append(f"- {rel.subject} [{rel.relation}] {rel.object}")
                
        # 4. Gather Events
        rel_events = []
        for evt in kb.events:
            # Check if any actor in the event is in our relevant_keys
            if any(actor.casefold() in relevant_keys for actor in evt.actors):
                rel_events.append(evt)
                
        # Fallback to general recent events if no specific ones match
        if not rel_events and kb.events:
            rel_events = kb.events[-max_events:]
            
        evts = []
        for evt in rel_events[-max_events:]:
            actors_str = ", ".join(evt.actors)
            evts.append(f"- Chap {evt.chapter}: {evt.event_type} [{actors_str}] -> {evt.result}")
            
        # 5. Format Output
        output = [
            "[Characters]",
            "\n".join(chars) if chars else "None",
            "",
            "[Relations]",
            "\n".join(rels) if rels else "None",
            "",
            "[Recent Events]",
            "\n".join(evts) if evts else "None"
        ]
        
        return "\n".join(output)
