from typing import List, Dict, Any
from models.event import Event
from core.story_kb_manager import KBRelation

def suggest_relations(events: List[Event], existing_relations: List[KBRelation]) -> List[Dict[str, Any]]:
    """
    Suggests new relations based on extracted events without overriding existing ones.
    """
    suggested_relations = []
    existing_pairs = {(rel.subject, rel.object) for rel in existing_relations}
    
    for event in events:
        if (event.subject_id, event.object_id) in existing_pairs:
            continue
            
        suggested_relation = "KNOWS"
        
        if event.action == "attacked":
            suggested_relation = "ENEMY_OF"
        elif event.action == "helped":
            suggested_relation = "ALLY_OF"
            
        suggestion = {
            "subject": event.subject_id,
            "relation": suggested_relation,
            "object": event.object_id,
            "metadata": {
                "source_event_id": event.id,
                "confidence": event.confidence
            }
        }
        suggested_relations.append(suggestion)
        
    return suggested_relations
