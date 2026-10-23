"""Extract reviewable atomic facts directly from prose, including pre-existing state."""
import json
import logging
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from core.structured_call import call_structured
from services.source_grounding import quote_span, resolve_grounded_quote

logger = logging.getLogger(__name__)


class ProseFact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = ""
    fact_key: str = Field(min_length=1, max_length=100)
    fact_value: str | int | float | bool
    certainty: Literal["confirmed", "reported", "hypothesis", "proposed"]
    quote: str = Field(min_length=1)
    confidence: float = Field(default=0.7, ge=0, le=1)


class ProseFacts(BaseModel):
    facts: list[ProseFact]


def extract_prose_facts(text, llm, subjects=(), *, review_coverage=False, verified_aliases=None):
    raw = call_structured(llm, operation="prose_fact_extraction", system_prompt=(
        "Extract atomic narrative facts directly from the prose, not just changes or named entities. "
        "Cover explicit historical deaths, disabilities, possession/storage, counts, limitations, "
        "world rules and recurring signal patterns. Also extract physical identity attributes of named objects "
        "(markings, colors, shape, damage), and explicit limits on what observations prove. "
        "A proposed explanation, uncertain location or unverified identity must preserve that uncertainty. "
        "Do not invent missing facts. "
        "Use an exact contiguous source quote for each fact. Preserve uncertainty: reported speech, "
        "hypotheses and proposed limits are not confirmed world rules. subject is an exact named "
        "entity from supplied known_entities or empty for general facts. When inventory items contain entity_id, "
        "subject must use that exact ID; names/aliases may be ambiguous. Never convert an unresolved entity fact "
        "to a general fact to bypass identity review. fact_key is a short attribute name; "
        "use status with value Dead/Alive only for explicit confirmed life status. "
        "fact_value is an atomic string, number or boolean. Return JSON matching: "
        + json.dumps(ProseFacts.model_json_schema(), ensure_ascii=False)),
        user_prompt=json.dumps({"source_text": text, "known_entities": list(subjects),
                                'verified_aliases': verified_aliases or {}}, ensure_ascii=False))
    result = ProseFacts.model_validate_json(raw)
    if review_coverage:
        review = call_structured(llm, operation='prose_fact_coverage', system_prompt=(
            'Review coverage of extracted atomic narrative facts against the original prose. Return only missing '
            'facts, not repetitions. Check every named object\'s identity/physical attributes, ownership, '
            'measurements, source reliability, epistemic limits (what a sound/observation cannot prove), '
            'disabilities, quantities and constraints. No inference or invention. Preserve confirmed/reported/'
            'hypothesis/proposed distinctions. Each fact needs an exact unique source quote. Schema: '
            + json.dumps(ProseFacts.model_json_schema(), ensure_ascii=False)),
            user_prompt=json.dumps({'source_text': text, 'known_entities': list(subjects),
                                    'verified_aliases': verified_aliases or {},
                                    'extracted': [f.model_dump() for f in result.facts]}, ensure_ascii=False))
        result.facts.extend(ProseFacts.model_validate_json(review).facts)
    valid_facts = []
    seen = set()
    for fact in result.facts:
        _, _, resolved_quote = resolve_grounded_quote(
            text,
            fact.quote,
            context_hint=f"{fact.fact_key}: {fact.fact_value}",
            llm_service=llm,
            max_retries=2,
        )
        fact.quote = resolved_quote
        identity = json.dumps([fact.subject, fact.fact_key, fact.fact_value, fact.certainty, resolved_quote], ensure_ascii=False)
        if identity in seen:
            continue
        seen.add(identity)
        valid_facts.append(fact)
    return valid_facts

