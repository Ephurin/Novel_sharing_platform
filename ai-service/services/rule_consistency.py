"""World-rule consistency check (#146 / F-LIVE-05).

Compares a saved chapter revision with the author-approved, effective world rules and returns
only grounded violations: every finding must cite a supplied rule ID and an exact quote from the
chapter. The check reports to the author; it never edits Canon.
"""
from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from core.structured_call import call_structured

OPERATION = "rule_consistency"
MAX_RULES = 40


class RuleFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_id: str = Field(min_length=1)
    verdict: Literal["violates", "consistent", "unclear"]
    quote: str = ""
    explanation: str = ""


class RuleCheckBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    findings: list[RuleFinding]


SYSTEM_PROMPT = (
    "You check a novel chapter against the author's approved world rules. For each rule, decide "
    "whether the chapter text VIOLATES it, is consistent with it, or it is unclear. Report \"violates\" "
    "only when the text itself shows an event or statement that the rule forbids, taking the rule's own "
    "exceptions into account (for example a protective item that the text says the character carries). "
    "Do not use outside knowledge, plans or guesses. For \"violates\", quote the exact contiguous chapter "
    "text that shows the violation and explain briefly in Vietnamese. Use only the supplied rule_id values. "
    "Return JSON matching: " + json.dumps(RuleCheckBatch.model_json_schema(), ensure_ascii=False)
)


def world_rules_from_facts(facts: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Effective, non-retired world rules as {rule_id, text}."""
    rules = []
    for fact in facts:
        if fact.get("fact_type") != "world_rule" or fact.get("is_retired"):
            continue
        value = fact.get("fact_value")
        if isinstance(value, dict):
            value = value.get("content") or value.get("rule") or value.get("text")
        text = str(value or "").strip()
        if text and fact.get("fact_id"):
            rules.append({"rule_id": str(fact["fact_id"]), "text": text})
    return rules[:MAX_RULES]


def check_world_rules(chapter_text: str, rules: list[dict[str, str]], llm: Any) -> list[dict[str, str]]:
    """Grounded violations only; unknown rule IDs and quotes not found in the text are dropped."""
    if not rules or not chapter_text.strip():
        return []
    raw = call_structured(llm, operation=OPERATION, system_prompt=SYSTEM_PROMPT,
                          user_prompt=json.dumps({"chapter_text": chapter_text, "world_rules": rules}, ensure_ascii=False))
    batch = RuleCheckBatch.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    by_id = {r["rule_id"]: r["text"] for r in rules}
    findings, seen = [], set()
    for item in batch.findings:
        quote = item.quote.strip()
        if item.verdict != "violates" or item.rule_id not in by_id or not quote or quote not in chapter_text:
            continue
        key = (item.rule_id, quote)
        if key in seen:
            continue
        seen.add(key)
        findings.append({"rule_id": item.rule_id, "rule_text": by_id[item.rule_id],
                         "quote": quote, "explanation": item.explanation.strip()})
    return findings


# Live retest 2 (R4, issue 12): the check compared chapters with world rules only, so a chapter that
# moved the hero's home village ("làng Tây Giang" instead of the approved Thạch Khê) passed. The
# same grounded call now also receives approved story facts: entity locations and profiles,
# narrative facts and recent events. Every finding still cites a supplied ID and an exact quote.
MAX_CANON_FACTS = 40

CANON_SYSTEM_PROMPT = (
    "You check a novel chapter against what the author has already approved. \"world_rules\" are rules "
    "of the world. \"story_facts\" are approved facts: where people and places are, who someone is, and "
    "events that already happened. For each item decide whether the chapter text CONTRADICTS it "
    "(\"violates\"), is consistent with it, or it is unclear. Report \"violates\" only for a direct "
    "contradiction stated or shown in the text, such as a different home place, a dead character acting, "
    "or a rule broken without an exception the text gives. A new detail that does not conflict is not a "
    "violation. Do not use outside knowledge, plans or guesses. For \"violates\", quote the exact "
    "contiguous chapter text and explain briefly in Vietnamese. Use only the supplied rule_id values. "
    "Return JSON matching: " + json.dumps(RuleCheckBatch.model_json_schema(), ensure_ascii=False)
)


def canon_facts_from_brain(brain: Any, effective_facts: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Approved, non-rule story facts as {rule_id, text}: entity places and profiles, narrative facts,
    then the most recent events, at most MAX_CANON_FACTS."""
    names = {e.entity_id: e.name for e in getattr(brain, "entities", ())}
    items: list[dict[str, str]] = []
    for entity in getattr(brain, "entities", ()):
        location = str(getattr(entity, "location", "") or "").strip()
        if location and location.casefold() not in {"unknown", "không rõ"}:
            items.append({"rule_id": f"entity:{entity.entity_id}:location", "text": f"{entity.name} ở {location}"})
        for key, value in (getattr(entity, "approved_profile", None) or {}).items():
            if isinstance(value, str) and value.strip() and key not in {"effective_from_chapter"}:
                items.append({"rule_id": f"entity:{entity.entity_id}:{key}", "text": f"{entity.name} — {key}: {value.strip()[:200]}"})
    for fact in effective_facts:
        if fact.get("fact_type") == "world_rule" or fact.get("is_retired") or not fact.get("fact_id"):
            continue
        value = fact.get("fact_value")
        if isinstance(value, dict):
            value = value.get("content") or value.get("text") or json.dumps(value, ensure_ascii=False)
        subject = names.get(fact.get("subject_entity_id") or "", "")
        text = f"{subject + ': ' if subject else ''}{fact.get('fact_key', '')} = {value}".strip()
        if value not in (None, ""):
            items.append({"rule_id": f"fact:{fact['fact_id']}", "text": text[:300]})
    events = sorted(getattr(brain, "events", ()), key=lambda e: e.chapter)
    room = max(0, MAX_CANON_FACTS - len(items))
    for event in events[-room:] if room else []:
        if event.summary.strip():
            items.append({"rule_id": f"event:{event.event_id}", "text": f"Chương {event.chapter}: {event.summary.strip()[:300]}"})
    return items[:MAX_CANON_FACTS]


def check_canon(chapter_text: str, rules: list[dict[str, str]], facts: list[dict[str, str]], llm: Any) -> list[dict[str, str]]:
    """Grounded contradictions with world rules or approved story facts, in one call. Each finding
    carries "kind": "rule" or "fact"."""
    if not (rules or facts) or not chapter_text.strip():
        return []
    raw = call_structured(llm, operation=OPERATION, system_prompt=CANON_SYSTEM_PROMPT,
                          user_prompt=json.dumps({"chapter_text": chapter_text, "world_rules": rules,
                                                  "story_facts": facts}, ensure_ascii=False))
    batch = RuleCheckBatch.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    by_id = {r["rule_id"]: ("rule", r["text"]) for r in rules} | {f["rule_id"]: ("fact", f["text"]) for f in facts}
    findings, seen = [], set()
    for item in batch.findings:
        quote = item.quote.strip()
        if item.verdict != "violates" or item.rule_id not in by_id or not quote or quote not in chapter_text:
            continue
        key = (item.rule_id, quote)
        if key in seen:
            continue
        seen.add(key)
        kind, text = by_id[item.rule_id]
        findings.append({"rule_id": item.rule_id, "rule_text": text, "kind": kind,
                         "quote": quote, "explanation": item.explanation.strip()})
    return findings
