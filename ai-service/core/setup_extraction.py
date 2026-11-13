"""Real-model World Setup extraction and blueprint (#144 / F-LIVE-01).

The model returns exact names and rule sentences only; offsets are computed here, and anything
that is not a verbatim substring of the author's text is dropped, so every extracted card stays
grounded the same way the fake fixture contract required. Blueprint suggestions are labelled
model_proposed by SetupService and still need author review.
"""
from __future__ import annotations

import html
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_ENTITIES = 30
MAX_RULES = 20


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExtractedName(_Strict):
    entity_type: Literal["character", "location"]
    display_name: str = Field(min_length=1, max_length=120)


class ExtractedRule(_Strict):
    text: str = Field(min_length=1, max_length=600)


class SetupTextExtraction(_Strict):
    entities: list[ExtractedName]
    world_rules: list[ExtractedRule]


class BlueprintSuggestion(_Strict):
    entities: list[ExtractedName]
    world_rules: list[str]


EXTRACT_PROMPT = (
    "Extract World Setup items that the author EXPLICITLY wrote in the text. entities: named characters "
    "and named locations only; display_name must be copied exactly as it appears in the text (same "
    "spelling, accents and capitalization), no descriptions. world_rules: sentences or clauses that state "
    "a general rule of the world (how magic, nature, society or a curse always works), copied verbatim "
    "as one contiguous span. Do not include plot events, one-off actions, guesses or anything not in the "
    "text. Return JSON matching: " + json.dumps(SetupTextExtraction.model_json_schema(), ensure_ascii=False)
)

BLUEPRINT_PROMPT = (
    "Propose a small World Setup for the author's story idea, in the idea's language. entities: up to 5 "
    "key characters or locations with short proper names (no descriptions). world_rules: up to 4 short, "
    "concrete rules of the world that fit the idea. These are suggestions for the author to accept or "
    "reject, not facts. Do not contradict the idea or outline. Return JSON matching: "
    + json.dumps(BlueprintSuggestion.model_json_schema(), ensure_ascii=False)
)


def _clean(value: str) -> str:
    # Live Gemini sometimes returns HTML numeric entities ("Th&#xE0;nh") inside JSON strings.
    return html.unescape(value).strip()


def _span(text: str, quote: str) -> dict | None:
    start = text.find(quote)
    if start < 0:
        return None
    return dict(kind="setup_span", field_path="/setup/text", offset_kind="unicode_codepoints",
                start=start, end=start + len(quote), quote=quote)


def ground_extraction(text: str, raw: str | dict) -> dict:
    """Convert model output to the ExtractOutput contract, keeping only verbatim, unique items."""
    parsed = SetupTextExtraction.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    entities, rules, seen = [], [], set()
    for item in parsed.entities[:MAX_ENTITIES]:
        name = _clean(item.display_name)
        ref = _span(text, name) if name else None
        if ref and (item.entity_type, name.casefold()) not in seen:
            seen.add((item.entity_type, name.casefold()))
            entities.append(dict(entity_type=item.entity_type, display_name=name, source_ref=ref))
    for item in parsed.world_rules[:MAX_RULES]:
        quote = _clean(item.text)
        ref = _span(text, quote) if quote else None
        if ref and ("rule", quote) not in seen:
            seen.add(("rule", quote))
            rules.append(dict(text=quote, source_ref=ref))
    return dict(entities=entities, world_rules=rules)


def clean_blueprint(raw: str | dict) -> dict:
    parsed = BlueprintSuggestion.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    entities, seen = [], set()
    for item in parsed.entities[:5]:
        name = _clean(item.display_name)
        if name and name.casefold() not in seen:
            seen.add(name.casefold())
            entities.append(dict(entity_type=item.entity_type, display_name=name))
    rules = [_clean(r) for r in parsed.world_rules[:4] if _clean(r)]
    return dict(entities=entities, world_rules=rules)
