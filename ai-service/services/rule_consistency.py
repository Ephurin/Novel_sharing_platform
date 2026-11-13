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
