import re
from typing import Any, Dict, List

class SpanExpander:
    """
    Expands incomplete NER entities based on surrounding text context.
    Example: 'Lạch' -> 'Lạch Tray' if 'Tray' follows and starts with Uppercase.
    """

    KNOWN_LOCATIONS = {
        "Lạch Tray",
        "Vân Lam Tông",
        "Ô Thản Thành",
        "Gia Mã Đế Quốc"
    }

    def __init__(self):
        # Patterns for locations that usually have a suffix
        self.location_suffixes = ["Thành", "Tông", "Sơn", "Đảo", "Quận"]

    def expand_single_entity(self, text: str, entity: Dict[str, Any], start_search_at: int = 0, extra_locations: set = None) -> Dict[str, Any]:
        """
        Attempts to expand a single entity. Returns updated entity and the end index of the match.
        """
        raw_name = entity.get("word") or entity.get("raw_name") or ""
        entity_type = entity.get("entity") or entity.get("type") or ""
        
        if not raw_name or not entity_type:
            return entity, start_search_at

        # Only expand locations for now as per requirements
        if entity_type.lower() not in ["location", "loc"]:
            return {**entity, "expanded_name": raw_name, "source": "ner"}, start_search_at

        # Find the entity in the text
        match = re.search(re.escape(raw_name), text[start_search_at:])
        if not match:
            return {**entity, "expanded_name": raw_name, "source": "ner"}, start_search_at

        start_idx = start_search_at + match.start()
        end_idx = start_search_at + match.end()
        
        # Look at the next word
        after_text = text[end_idx:]
        next_word_match = re.search(r"^\s+([^\s\.\,\!\?]+)", after_text)
        
        if next_word_match:
            next_word = next_word_match.group(1)
            combined_name = f"{raw_name} {next_word}"
            
            should_expand = False
            
            # Rule 1: Check KNOWN_LOCATIONS + extra_locations
            all_known = self.KNOWN_LOCATIONS
            if extra_locations:
                all_known = all_known.union(extra_locations)

            if combined_name in all_known:
                should_expand = True
            
            # Rule 2: Next word starts with Uppercase (and not just a common word)
            elif next_word and next_word[0].isupper():
                should_expand = True

            if should_expand:
                return {
                    **entity,
                    "word": combined_name, # Keep compatibility with NER output
                    "raw_name": raw_name,
                    "expanded_name": combined_name,
                    "type": entity_type,
                    "confidence": entity.get("score", entity.get("confidence", 0.5)),
                    "source": "expanded"
                }, end_idx + next_word_match.end()

        return {
            **entity,
            "expanded_name": raw_name,
            "source": "ner"
        }, end_idx

    def expand_entities(self, text: str, entities: List[Dict[str, Any]], extra_locations: set = None) -> List[Dict[str, Any]]:
        """
        Orchestrates expansion for a list of entities.
        """
        expanded_list = []
        cursor = 0
        
        for ent in entities:
            expanded_ent, new_cursor = self.expand_single_entity(text, ent, cursor, extra_locations)
            expanded_list.append(expanded_ent)
            cursor = new_cursor
            
        return expanded_list
