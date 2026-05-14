"""
Entity Resolution Module
-------------------------
Maps raw NER entities to canonical names stored in the Knowledge Base
using token-overlap fuzzy matching.

Strategy:
  1. Tokenize NER entity name and KB entity name by whitespace.
  2. If all tokens of the NER name are a contiguous subsequence of the KB name,
     it is considered a match (e.g. "Ô Thản" matches "Ô Thản Thành").
  3. Among all matches, pick the one with the highest token-overlap ratio.
  4. If no match is found, keep the original NER name.
"""

import logging
from typing import Any, Dict, List, Optional

from core.story_kb_manager import StoryKB

logger = logging.getLogger(__name__)


def _tokenize(name: str) -> List[str]:
    """Split a name into lowercase tokens."""
    return name.strip().lower().split()


def _is_subsequence(short_tokens: List[str], long_tokens: List[str]) -> bool:
    """Check if short_tokens appear as a contiguous subsequence in long_tokens."""
    if not short_tokens:
        return False
    if len(short_tokens) > len(long_tokens):
        return False

    for start in range(len(long_tokens) - len(short_tokens) + 1):
        if long_tokens[start:start + len(short_tokens)] == short_tokens:
            return True
    return False


def _overlap_ratio(ner_tokens: List[str], kb_tokens: List[str]) -> float:
    """Calculate how much of the KB name is covered by the NER tokens."""
    if not kb_tokens:
        return 0.0
    return len(ner_tokens) / len(kb_tokens)


def resolve_entity(ner_name: str, kb: StoryKB) -> str:
    """
    Resolve a single NER entity name to its canonical KB name.

    Strategy:
    - Find all KB entities where the NER name is a contiguous subsequence.
    - Among matches, prefer the one with the MOST tokens (the most specific full name).
    - If multiple have same max tokens, prefer the one with the highest overlap ratio.
    """
    ner_tokens = _tokenize(ner_name)
    if not ner_tokens:
        return ner_name

    # Check for exact match first, but ONLY return immediately if it's a multi-word name
    # Single-word names like "Kael" should still check for longer matches like "Kael Draven"
    key = ner_name.strip().lower()
    exact_match = kb.entities.get(key)
    if exact_match and len(ner_tokens) > 1:
        return exact_match.name

    best_match: Optional[str] = None
    max_tokens: int = 0
    best_ratio: float = 0.0

    for kb_key, kb_entity in kb.entities.items():
        kb_tokens = _tokenize(kb_entity.name)

        if _is_subsequence(ner_tokens, kb_tokens):
            num_tokens = len(kb_tokens)
            ratio = _overlap_ratio(ner_tokens, kb_tokens)
            
            # Selection criteria:
            # 1. Prefer longer KB names (more tokens)
            # 2. Tie-break with higher overlap ratio (unlikely but possible)
            if num_tokens > max_tokens:
                max_tokens = num_tokens
                best_ratio = ratio
                best_match = kb_entity.name
            elif num_tokens == max_tokens and ratio > best_ratio:
                best_ratio = ratio
                best_match = kb_entity.name

    if best_match:
        if best_match.lower() != ner_name.lower():
            logger.info("Entity resolved: '%s' -> '%s' (tokens=%d)", ner_name, best_match, max_tokens)
        return best_match

    return ner_name


def resolve_entities(
    entities: List[Dict[str, Any]],
    kb: StoryKB
) -> List[Dict[str, Any]]:
    """
    Resolve a list of NER entities against the KB.

    For each entity, adds a 'resolved_name' field with the canonical KB name.
    Also filters out entities that are clearly not valid (single-character, common words).
    """
    STOP_WORDS = {
        # Vietnamese
        "của", "và", "là", "một", "các", "có", "được", "trong", "với",
        "này", "đã", "cho", "từ", "về", "đến", "theo", "phía", "nhập",
        "người", "hắn", "nàng", "ta", "nó", "họ", "tàn", "đông", "đoàn",
        "nhóm", "vị", "tên", "loại", "thứ", "nơi", "vùng",
        # English articles, pronouns, common words
        "the", "a", "an", "he", "she", "it", "they", "them", "him", "her",
        "his", "its", "who", "whom", "that", "this", "these", "those",
        "but", "and", "for", "not", "you", "all", "can", "had", "has",
        "was", "were", "will", "with", "what", "when", "where", "how",
    }

    # English generic noun prefixes that indicate non-proper-nouns
    GENERIC_PREFIXES = ("his ", "her ", "their ", "its ", "my ", "our ", "your ")
    # Common generic nouns that are NOT named entities
    GENERIC_NOUNS = {
        "the enemy", "the walls", "the gates", "the city", "the army",
        "the soldiers", "the people", "the king", "the queen", "the lord",
        "the men", "his men", "her men", "their men", "the guards",
        "the dark magic", "the magic", "the sword", "the shield",
        "the battle", "the war", "the fight", "the sky", "the ground",
        "the door", "the window", "the tower", "the castle",
    }

    # 1. Sort by word count (descending) so full names (anchors) are processed first
    # This ensures "Kael Draven" is seen before "Kael" in the same batch.
    entities.sort(key=lambda x: len(x.get("word", x.get("Entity", "")).split()), reverse=True)

    resolved = []
    # Collect known KB entity names for whitelist matching
    kb_known = {name.casefold() for name in kb.entities} if kb and hasattr(kb, 'entities') else set()
    
    # Local session mapping to track anchors found in THIS text
    # We use a copy of the KB entities to avoid mutating the original KB object during resolution
    from copy import deepcopy
    from core.story_kb_manager import KBEntity
    
    temp_entities = deepcopy(kb.entities) if kb and hasattr(kb, 'entities') else {}

    for ent in entities:
        raw_name = ent.get("word", ent.get("Entity", "")).strip()

        # Filter: skip empty, single-char, or stop-word entities
        if not raw_name or len(raw_name) < 2:
            continue
            
        if raw_name.lower() in STOP_WORDS:
            continue
            
        # Filter out broken spans often produced by NER models
        if raw_name.startswith(("#", "---", "*", "_")):
            continue
            
        if raw_name.lower().endswith((" of the", " the", " and", " of", " in")):
            continue

        name_lower = raw_name.lower()

        # Skip generic English noun phrases unless already in KB
        if name_lower not in kb_known:
            if name_lower in GENERIC_NOUNS:
                continue
            if any(name_lower.startswith(prefix) for prefix in GENERIC_PREFIXES):
                continue
            if name_lower.startswith("the ") and len(name_lower.split()) <= 2:
                tokens = raw_name.split()
                if len(tokens) > 1 and tokens[1][0].isupper():
                    pass 
                else:
                    continue
            if name_lower.isdigit() or len(name_lower.split()) == 1 and name_lower in ["run", "said", "walk", "look", "fire"]:
                continue

        # Create a mock KB for the resolution function
        class MockKB:
            def __init__(self, entities): self.entities = entities
        
        canonical = resolve_entity(raw_name, MockKB(temp_entities))
        
        # If this is a new anchor (longer name), add it to temp_entities so subsequent short names match it
        canonical_key = canonical.casefold()
        if canonical_key not in temp_entities:
            temp_entities[canonical_key] = KBEntity(name=canonical, entity_type=ent.get("entity", "UNKNOWN"))

        ent_copy = dict(ent)
        ent_copy["resolved_name"] = canonical
        ent_copy["word"] = canonical # Update word to canonical for KB consistency
        ent_copy["Entity"] = canonical # Update Entity to canonical for KB consistency
        resolved.append(ent_copy)

    # Restore original order if needed? Actually, sorting by score is better later.
    return resolved

def find_kb_entities_in_text(text: str, kb: StoryKB) -> List[Dict[str, Any]]:
    """
    Scans the text for known entities from the KB.
    This acts as a fallback/anchor when the NER model fails to extract them.
    """
    found_entities = []
    text_lower = text.lower()
    
    for key, entity in kb.entities.items():
        if entity.name.lower() in text_lower:
            found_entities.append({
                "word": entity.name,
                "Entity": entity.name,
                "type": entity.entity_type,
                "entity": entity.entity_type,
                "score": 1.0,
                "resolved_name": entity.name,
                "source": "kb_anchor"
            })
            
    return found_entities
