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

    Returns the best matching KB entity name, or the original name if no match.
    """
    ner_tokens = _tokenize(ner_name)
    if not ner_tokens:
        return ner_name

    # Exact match (case-insensitive)
    key = ner_name.strip().lower()
    if key in kb.entities:
        return kb.entities[key].name

    # Fuzzy match: find KB entities where NER tokens are a contiguous subsequence
    best_match: Optional[str] = None
    best_ratio: float = 0.0

    for kb_key, kb_entity in kb.entities.items():
        kb_tokens = _tokenize(kb_entity.name)

        if _is_subsequence(ner_tokens, kb_tokens):
            ratio = _overlap_ratio(ner_tokens, kb_tokens)
            # Prefer higher coverage (more specific match)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = kb_entity.name

    if best_match:
        logger.info("Entity resolved: '%s' -> '%s' (ratio=%.2f)", ner_name, best_match, best_ratio)
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

    resolved = []
    # Collect known KB entity names for whitelist matching
    kb_known = {name.casefold() for name in kb.entities} if kb and hasattr(kb, 'entities') else set()

    for ent in entities:
        raw_name = ent.get("word", ent.get("Entity", "")).strip()

        # Filter: skip empty, single-char (except special initials if any), or stop-word entities
        if not raw_name or len(raw_name) <= 3:
            # Western names or locations are rarely <= 3 chars in this context
            # (Exceptions like 'Lee', 'UK' exist but for this story 'Kael', 'Lucien' are > 3)
            # Actually, let's keep 3 for now.
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
            # Also filter out names that are just common nouns with 'the'
            if name_lower.startswith("the ") and len(name_lower.split()) <= 2:
                # Allow if the second word is capitalized (e.g., "the Ashen")
                # raw_name might be "the Ashen Knight" -> normalized to "The Ashen Knight"
                # If raw_name was "the Ashen", let's check original capitalization
                tokens = raw_name.split()
                if len(tokens) > 1 and tokens[1][0].isupper():
                    pass # Keep it
                else:
                    continue
            # Filter out numeric strings or single words that are common verbs
            if name_lower.isdigit() or len(name_lower.split()) == 1 and name_lower in ["run", "said", "walk", "look", "fire"]:
                continue

        canonical = resolve_entity(raw_name, kb)
        ent_copy = dict(ent)
        ent_copy["resolved_name"] = canonical
        resolved.append(ent_copy)

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
