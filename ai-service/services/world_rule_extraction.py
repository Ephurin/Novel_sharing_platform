"""World rules from manuscript prose (F-LIVE-17).

Manuscript import never produced world rules: the entity-first path only extracted narrative facts,
and the legacy path only matched lines that start with "Luật:". An imported novel therefore had no
rules, and the rule-based consistency check had nothing to check. This module asks the model for
general rules the chapter states or shows, keeps only those grounded in an exact chapter quote, and
drops restatements of rules the author already approved. The results are proposals for the author.
"""
from __future__ import annotations

import json
import logging
import unicodedata
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.structured_call import call_structured

logger = logging.getLogger(__name__)

OPERATION = "world_rule_extraction"
MAX_RULES_PER_CHAPTER = 5
MIN_CONFIDENCE = 0.6
DUPLICATE_JACCARD = 0.8


class WorldRuleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule: str = Field(min_length=1, max_length=400)
    quote: str = Field(min_length=1)
    confidence: float = Field(default=0.7, ge=0, le=1)


class WorldRuleBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rules: list[WorldRuleOutput]


SYSTEM_PROMPT = (
    "You read one chapter of a novel and list the general RULES OF ITS WORLD that the text states or "
    "clearly shows to hold always (laws of magic or technology, physical or supernatural constraints, "
    "customs and laws of a society, fixed facts about places that limit what can happen). "
    "Do NOT list single events, a character's mood or habits, plans, rumours, hypotheses or anything "
    "only one character believes. Do not repeat a rule in known_rules, even reworded. "
    "rule: one short sentence in Vietnamese, present tense, general (no 'hôm nay', no one-off scene). "
    "quote: the exact contiguous chapter text that states or shows the rule. "
    "confidence: how sure you are it is a lasting world rule (0..1). Return an empty list if there is none. "
    "Return JSON matching: " + json.dumps(WorldRuleBatch.model_json_schema(), ensure_ascii=False)
)


def _normalize(value: str) -> str:
    folded = unicodedata.normalize("NFC", value or "").casefold()
    return " ".join("".join(ch if ch.isalnum() else " " for ch in folded).split())


def _duplicate(rule: str, known: list[str]) -> bool:
    norm = _normalize(rule)
    words = set(norm.split())
    for other in known:
        if norm == other:
            return True
        other_words = set(other.split())
        union = words | other_words
        if union and len(words & other_words) / len(union) >= DUPLICATE_JACCARD:
            return True
    return False


def known_world_rules(facts: Any) -> list[str]:
    """Texts of the approved, non-retired world rules in a story brain's facts."""
    rules = []
    for fact in facts or ():
        if not isinstance(fact, dict) or fact.get("fact_type") != "world_rule" or fact.get("is_retired"):
            continue
        value = fact.get("fact_value")
        if isinstance(value, dict):
            value = value.get("content") or value.get("rule") or value.get("text")
        if value:
            rules.append(str(value))
    return rules


def extract_world_rules(text: str, llm: Any, known_rules: list[str] | tuple[str, ...] = ()) -> list[dict]:
    """Grounded world-rule candidates: {rule, quote, start, end, confidence}. Never raises on bad output."""
    if not text or not text.strip():
        return []
    try:
        raw = call_structured(llm, operation=OPERATION, system_prompt=SYSTEM_PROMPT,
                              user_prompt=json.dumps({"chapter_text": text, "known_rules": list(known_rules)},
                                                     ensure_ascii=False))
        batch = WorldRuleBatch.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    except (ValidationError, ValueError) as exc:
        # Rules are an addition to the chapter's proposals; a bad answer must not fail the chapter.
        logger.warning("World rule extraction skipped: %s", type(exc).__name__)
        return []
    seen = [n for n in (_normalize(r) for r in known_rules) if n]
    out = []
    for item in sorted(batch.rules, key=lambda r: -r.confidence):
        quote = item.quote.strip()
        start = text.find(quote) if quote else -1
        if item.confidence < MIN_CONFIDENCE or start < 0 or _duplicate(item.rule, seen):
            continue
        seen.append(_normalize(item.rule))
        out.append({"rule": item.rule.strip(), "quote": quote, "start": start, "end": start + len(quote),
                    "confidence": item.confidence})
        if len(out) >= MAX_RULES_PER_CHAPTER:
            break
    return out
