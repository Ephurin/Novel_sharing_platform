"""Narrative facts and world rules of one chapter in one model call.

Live retest 8/9 measured about 11 calls per analysed chapter; facts and world rules each read the same
chapter text in a call of their own. They are now asked together. The two lists are checked
separately, as before: an invalid facts answer fails the analysis, while bad world rules are skipped.
"""
from __future__ import annotations

import json
import logging

from pydantic import BaseModel, ConfigDict, ValidationError

from core.structured_call import call_structured
from services.prose_facts import FACT_INSTRUCTIONS, ProseFact, ProseFacts, ground_facts
from services.world_rule_extraction import RULE_INSTRUCTIONS, WorldRuleBatch, WorldRuleOutput, select_world_rules

logger = logging.getLogger(__name__)
OPERATION = 'chapter_fact_extraction'


class ChapterFacts(BaseModel):
    model_config = ConfigDict(extra='forbid')
    facts: list[ProseFact]
    world_rules: list[WorldRuleOutput]


SYSTEM_PROMPT = (
    'Return two lists for this chapter.\n'
    'facts: ' + FACT_INSTRUCTIONS + '\n'
    'world_rules: ' + RULE_INSTRUCTIONS + 'Use known_rules for the rules already approved.\n'
    'Return JSON matching: ' + json.dumps(ChapterFacts.model_json_schema(), ensure_ascii=False))


def extract_chapter_facts(text, llm, subjects=(), known_rules=()):
    """(grounded facts, selected world rules) from one call."""
    raw = call_structured(llm, operation=OPERATION, system_prompt=SYSTEM_PROMPT,
                          user_prompt=json.dumps({'source_text': text, 'known_entities': list(subjects),
                                                  'known_rules': list(known_rules)}, ensure_ascii=False))
    data = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(data, dict):
        raise ValueError('Chapter facts output is not a JSON object')
    facts = ProseFacts.model_validate({'facts': data.get('facts', [])}).facts
    try:
        rules = WorldRuleBatch.model_validate({'rules': data.get('world_rules', [])}).rules
    except ValidationError as exc:
        logger.warning('World rule extraction skipped: %s', type(exc).__name__)
        rules = []
    return ground_facts(text, llm, facts), select_world_rules(text, rules, known_rules)
