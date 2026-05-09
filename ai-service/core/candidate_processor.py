import string
import uuid
from typing import Any, Dict, List

from pydantic import BaseModel, Field

class Candidate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    raw_name: str
    normalized_name: str
    type: str
    confidence: float
    status: str = "pending"
    source: str = "ner" # ner, expanded
    action: str = "suggest_add" # suggest_add, suggest_merge, ignore


class CandidateProcessor:
    """Processes NER output into structured, normalized candidates for HITL review."""

    def __init__(self):
        # A dictionary of known common aliases to map directly during normalization if needed
        # This could be loaded from config later
        self.known_aliases = {}

    def normalize_name(self, name: str) -> str:
        """Removes punctuation and normalizes spacing."""
        if not name:
            return ""
        # Strip punctuation from ends
        clean = name.strip(string.punctuation).strip()
        # Collapse multiple spaces
        clean = " ".join(clean.split())
        return clean.title()

    def assign_confidence(self, entity: Dict[str, Any], text: str) -> float:
        """Assigns a deterministic confidence score based on NER score and text frequency."""
        # Baseline is NER score
        raw_score = entity.get("score", entity.get("Score", 0.0))
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            score = 0.5

        name = str(entity.get("word") or entity.get("Entity") or "").strip()
        if not name:
            return score

        # Small bump for frequency in text
        count = text.count(name)
        if count > 1:
            score = min(0.99, score + (count * 0.01))

        return round(score, 4)

    def detect_duplicates(self, candidates: List[Candidate]) -> List[Candidate]:
        """Flags identical normalized names for merging."""
        seen = set()
        for cand in candidates:
            # If name is empty, flag to ignore
            if not cand.normalized_name:
                cand.action = "ignore"
                continue
                
            norm_lower = cand.normalized_name.casefold()
            if norm_lower in seen:
                cand.action = "suggest_merge"
            else:
                seen.add(norm_lower)
        return candidates

    def process_entities(self, entities: List[Dict[str, Any]], text: str) -> List[Candidate]:
        """Orchestrates candidate generation from raw NER entities."""
        candidates = []
        
        for entity in entities:
            raw_name = str(entity.get("word") or entity.get("Entity") or "")
            if not raw_name.strip():
                continue

            entity_type = str(entity.get("entity") or entity.get("Label") or "UNKNOWN")
            norm_name = self.normalize_name(raw_name)
            confidence = self.assign_confidence(entity, text)
            
            # Basic validation: ignore very short names or names starting with Markdown headers
            action = "suggest_add"
            if len(norm_name) < 2 or norm_name.startswith("#"):
                action = "ignore"
            # We no longer ignore UNKNOWN here because the LLM might identify the type later
                
            cand = Candidate(
                raw_name=raw_name,
                normalized_name=norm_name,
                type=entity_type,
                confidence=confidence,
                status="pending",
                source=entity.get("source", "ner"),
                action=action
            )
            candidates.append(cand)
            
        return self.detect_duplicates(candidates)
