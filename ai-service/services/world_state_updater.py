"""
World State Updater Service
===========================
Synchronises and updates CurrentWorldState snapshots from EventHistoryEntry consequences.
"""
import logging
import json
import re
from typing import Dict, Any

from core.story_kb_manager import CurrentWorldState, CharacterStateSnapshot, EventHistoryEntry

logger = logging.getLogger(__name__)

def update_world_state(
    current_state: CurrentWorldState,
    event: EventHistoryEntry,
    llm_service
) -> CurrentWorldState:
    """
    Updates the character states inside CurrentWorldState based on the consequences of the given event.
    """
    if not event or not event.participants:
        return current_state

    # 1. Initialize participants in the state if they do not exist
    for p in event.participants:
        if p not in current_state.characters:
            current_state.characters[p] = CharacterStateSnapshot()

    # 2. Extract current snapshots of participants for context
    participants_context = {}
    for p in event.participants:
        participants_context[p] = current_state.characters[p].model_dump()

    # 3. Format LLM request
    system_prompt = (
        "You are an expert world state tracking agent for stories.\n"
        "Your task is to update the Character State Snapshots based on a new Event and its consequences.\n"
        "Only output updates for the characters involved in the event.\n"
        "For each character, update only the fields affected by the event or consequences:\n"
        "- location: current location name (string)\n"
        "- realm: cultivation realm / power level (string)\n"
        "- health: integer (0 to 100). If injured, decrease health. If dead, set health to 0.\n"
        "- status: 'Alive' | 'Dead' | 'Captured' | 'Injured' (string)\n"
        "- inventory: list of strings (items they have)\n"
        "- active_relationships: dictionary mapping other character names to relationship types (e.g. ALLY_OF, ENEMY_OF, FRIEND_OF, LOVES, NEUTRAL)\n"
        "\n"
        "CRITICAL RULE: Do NOT translate proper nouns (names of characters, factions, locations like 'Thương Loan Sơn', items) into English or Chinese. Keep them exactly as they are written in the event details and context.\n"
        "\n"
        "Provide ONLY a valid JSON object matching the format below, no explanations:\n"
        "{\n"
        "  \"character_updates\": {\n"
        "    \"Character Name\": {\n"
        "      \"location\": \"Location Name\",\n"
        "      \"realm\": \"Realm Name\",\n"
        "      \"health\": 90,\n"
        "      \"status\": \"Alive\",\n"
        "      \"inventory\": [\"Item A\"],\n"
        "      \"active_relationships\": {\"Other Character\": \"ALLY_OF\"}\n"
        "    }\n"
        "  }\n"
        "}"
    )

    user_prompt = (
        f"Event Summary: {event.summary}\n"
        f"Event Type: {event.event_type}\n"
        f"Event Locations: {', '.join(event.locations) if event.locations else 'Unknown'}\n"
        f"Consequences: {event.consequences}\n"
        f"Current Character States before Event: {json.dumps(participants_context, ensure_ascii=False)}\n"
        "Please generate the updated states."
    )

    if not llm_service:
        # Fallback if no LLM service is configured
        logger.warning("No LLM service provided for world state update. Skipping.")
        return current_state

    try:
        raw_output = llm_service._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt
        )
        
        # Parse output
        cleaned = raw_output.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            
        parsed = llm_service._parse_json_like_output(cleaned)
        
        updates = {}
        if isinstance(parsed, dict) and "character_updates" in parsed:
            updates = parsed["character_updates"]
        
        # Merge updates back
        for char_name, update_data in updates.items():
            # Match character case-insensitively to ensure consistency
            matched_char = None
            for p in current_state.characters:
                if p.lower() == char_name.lower():
                    matched_char = p
                    break
                    
            if not matched_char:
                # Add new character if not found
                matched_char = char_name
                current_state.characters[matched_char] = CharacterStateSnapshot()

            snapshot = current_state.characters[matched_char]
            
            if "location" in update_data:
                snapshot.location = str(update_data["location"]).strip()
            if "realm" in update_data:
                snapshot.realm = str(update_data["realm"]).strip()
            if "health" in update_data:
                try:
                    snapshot.health = max(0, min(100, int(update_data["health"])))
                except (TypeError, ValueError):
                    pass
            if "status" in update_data:
                snapshot.status = str(update_data["status"]).strip()
            if "inventory" in update_data:
                snapshot.inventory = [str(item).strip() for item in update_data["inventory"] if str(item).strip()]
            if "active_relationships" in update_data:
                rel_dict = update_data["active_relationships"]
                if isinstance(rel_dict, dict):
                    for target, rel_type in rel_dict.items():
                        snapshot.active_relationships[target] = str(rel_type).upper().strip()

            logger.info("Updated state for %s: %s", matched_char, snapshot.model_dump())

    except Exception as exc:
        logger.error("Failed to update world state with LLM: %s", exc)

    return current_state
