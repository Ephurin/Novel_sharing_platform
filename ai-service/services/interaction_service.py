from typing import Dict, Any, Tuple
from models.event import Event
from core.story_kb_manager import StoryKB

def detect_conflict(relation: Dict[str, Any], existing_kb: StoryKB) -> Tuple[bool, str]:
    """
    Detects if the suggested relation conflicts with existing locked/historical relations.
    Returns (is_conflict, reason).
    """
    subject = relation.get("subject")
    object_name = relation.get("object")
    suggested_rel = relation.get("relation")
    
    for rel in existing_kb.relations:
        if rel.subject == subject and rel.object == object_name:
            if rel.relation == "ENEMY_OF" and suggested_rel == "ALLY_OF":
                return True, f"Conflict: {subject} is already an ENEMY_OF {object_name}"
            if rel.relation == "ALLY_OF" and suggested_rel == "ENEMY_OF":
                return True, f"Conflict: {subject} is already an ALLY_OF {object_name}"
            if rel.locked and rel.relation != suggested_rel:
                return True, f"Conflict: relation {rel.relation} is locked by {rel.source}"
                
    return False, ""

def decide_interaction(event: Event, relation: Dict[str, Any], existing_kb: StoryKB) -> Dict[str, Any]:
    """
    Decides whether to auto apply, suggest to user, or ignore.
    """
    is_conflict, reason = detect_conflict(relation, existing_kb)
    
    if is_conflict:
        return {
            "action": "ignore",
            "conflict": True,
            "reason": reason
        }
        
    if event.confidence >= 0.7:
        return {
            "action": "auto_apply",
            "conflict": False,
            "reason": "Sufficient confidence interaction"
        }
    elif event.confidence >= 0.5:
        return {
            "action": "suggest_user",
            "conflict": False,
            "reason": "Moderate confidence, requires user review"
        }
    else:
        return {
            "action": "ignore",
            "conflict": False,
            "reason": "Low confidence"
        }
