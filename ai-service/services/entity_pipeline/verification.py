"""Bounded occurrence verification with a complete, auditable decision inventory."""
from collections import Counter
from dataclasses import dataclass
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from core.structured_call import call_structured
from core.structured_outputs import EntityType
from domain.errors import AnalysisOutputError
from services.entity_pipeline.candidates import CandidateInventory, POLICY, chunks, occurrences, same_name
from services.source_grounding import quote_span


class EntityDecision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    candidate_id: str
    verdict: Literal['entity', 'not_entity', 'unresolved']
    entity_type: EntityType | None = None
    canonical_name: str = ''
    canonical_entity_id: str = ''
    identity_quote: str = ''
    initial_status: Literal['Alive', 'Dead', 'Unknown'] = 'Unknown'
    status_quote: str = ''
    confidence: float = Field(default=0.7, ge=0, le=1)
    reason: str = Field(min_length=1)


class EntityDecisionBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decisions: list[EntityDecision]


@dataclass
class VerifiedEntities:
    entities: list[dict]
    aliases: list[dict]
    audit: dict


def verify_entities(text, llm, discover, *, known_entities=(), known_aliases=(), audit_sink=None,
                    batch_size=24, guidance=(), defer_materialization=False):
    if not 1 <= batch_size <= 32:
        raise ValueError('Entity verification batch size must be1..32')
    if len(known_entities) + len(known_aliases) > 512:
        raise AnalysisOutputError('ENTITY_CANDIDATE_LIMIT', 'Known identity inventory exceeds limit.', attempts=0)
    known = {str(e['entity_id']): e for e in known_entities if e.get('entity_id')}
    names = [e['name'] for e in known_entities] + [a['alias'] for a in known_aliases]
    hint_names = [n for e in guidance for n in [e['name'], *e.get('aliases', [])]]
    inventory = CandidateInventory(text)
    audit = {'policy': POLICY, 'status': 'collecting', 'source_hash': inventory.digest,
             'candidates': [], 'decisions': [], 'chunks': [], 'counts': {}, 'unanchored_discoveries': []}

    def save(status):
        audit['status'] = status
        audit['candidates'] = [c.to_dict() for c in inventory.items]
        audit['counts'] = {'candidates': len(inventory.items),
                           **dict(Counter(d['verdict'] for d in audit['decisions']))}
        if audit_sink:
            audit_sink(audit)

    try:
        inventory.collect(names)
        for name in hint_names:
            inventory.add_name(name, 'author_guidance')
        # Discovery is complementary to deterministic collection, not the sole source of candidates.
        for chunk in chunks(text):
            for item in discover(chunk.text, llm):
                if not list(occurrences(chunk.text, item['phrase'])):
                    audit['unanchored_discoveries'].append({'name': item['phrase'], 'chunk_start': chunk.start})
                inventory.add_name(item['phrase'], 'llm_discovery', chunk=chunk)
            audit['chunks'].append({'start': chunk.start, 'end': chunk.end})
        save('verifying')
        all_names = sorted(set(names + [c.surface for c in inventory.items]))
        system = (
            'Verify EVERY supplied candidate OCCURRENCE in its original context, not just the name string. '
            'Candidates intentionally overgenerate; sentence-initial common words and "an" in "an toàn" '
            'are not the character An. Verdict entity/not_entity/unresolved; unresolved is not approved truth. '
            'Return exactly one decision per candidate_id, no missing/extra/duplicate IDs. '
            'Use PER/LOC/ORG/ITEM/SKILL for entity verdicts. canonical_name must be an exact known canonical '
            'name or a supplied surface. canonical_entity_id may reference ONLY a supplied known ID. '
            'Distinct people sharing a short name must NOT be merged. An alias needs identity_quote copied '
            'verbatim from source that establishes that identity; if identity is ambiguous use unresolved. '
            'Non-Unknown life status only for PER with explicit confirmed source status_quote, not hearsay '
            'or an inference. A proper name alone does not prove Alive. Explain each decision. Schema: '
            + json.dumps(EntityDecisionBatch.model_json_schema()))
        for start in range(0, len(inventory.items), batch_size):
            batch = inventory.items[start:start + batch_size]
            request = {'candidates': [c.to_dict() for c in batch], 'known_entities': list(known_entities),
                       'known_aliases': list(known_aliases), 'allowed_names': all_names,
                       'author_guidance': list(guidance),
                       'guidance_policy': 'Hints are search instructions, never evidence of an occurrence or event. '
                           'Author declarations describe world identities, not chapter presence. '
                           'Do not merge identities or invent source facts from these entries.'}
            last_error = ''
            for attempt in range(2):
                raw = call_structured(llm, operation='entity_candidate_verification', system_prompt=system,
                                      user_prompt=json.dumps(request, ensure_ascii=False))
                try:
                    decisions = EntityDecisionBatch.model_validate_json(raw).decisions
                    _validate(decisions, batch, text, known, all_names)
                    break
                except ValueError as exc:
                    last_error = str(exc)
                    request.update(previous_result=raw, validation_error=last_error,
                                   repair_instruction='Return a corrected complete decision batch.')
            else:
                raise AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED',
                    'Candidate decisions are incomplete or invalid after bounded repair.', attempts=2)
            audit['decisions'].extend(d.model_dump() for d in decisions)
            save('verifying')
        try:
            result = _materializable(inventory.items, audit['decisions'], known, text)
        except AnalysisOutputError as exc:
            if not defer_materialization:
                raise
            audit['review_error'] = str(exc)
            result = ([], [])
        save('completed')
        return VerifiedEntities(result[0], result[1], audit)
    except Exception as exc:
        audit['error_code'] = getattr(exc, 'code', 'ENTITY_CANDIDATE_EXTRACTION_FAILED')
        save('failed')
        raise


def _validate(decisions, batch, text, known, allowed):
    by_id = {c.candidate_id: c for c in batch}
    if len(decisions) != len(batch) or {d.candidate_id for d in decisions} != set(by_id):
        raise ValueError('Every candidate must have exactly one decision')
    for d in decisions:
        c = by_id[d.candidate_id]
        if d.verdict != 'entity':
            if d.canonical_entity_id or d.canonical_name or d.entity_type or d.initial_status != 'Unknown' or d.status_quote:
                raise ValueError('Rejected/unresolved occurrence cannot carry a resolved identity or status')
            continue
        if not d.entity_type or d.canonical_name not in allowed:
            raise ValueError('Entity must use a supplied name and a valid type')
        if d.canonical_entity_id:
            target = known.get(d.canonical_entity_id)
            if not target or target['name'] != d.canonical_name or target['entity_type'] != d.entity_type:
                raise ValueError('Unknown or mismatched canonical identity')
        elif any(same_name(e['name'], d.canonical_name) for e in known.values()):
            raise ValueError('Use explicit canonical ID for a known entity')
        if not same_name(d.canonical_name, c.surface):
            if not d.identity_quote:
                raise ValueError('Alias identity requires an exact source quote')
            identity_start, identity_end = quote_span(text, d.identity_quote)
            if identity_start < c.context_start or identity_end > c.context_end:
                raise ValueError('Identity evidence is outside this occurrence verification context')
            if c.surface.casefold() not in d.identity_quote.casefold():
                raise ValueError('Alias identity quote must include the candidate surface')
            if d.canonical_name.casefold() not in d.identity_quote.casefold():
                raise ValueError('Alias identity quote must include the canonical name')
        if d.initial_status != 'Unknown':
            if d.entity_type != 'PER' or not d.status_quote:
                raise ValueError('Only evidenced person life status may be asserted')
            a, b = quote_span(text, d.status_quote)
            if not (a <= c.start and c.end <= b):
                raise ValueError('Status evidence must anchor this occurrence')


def _materializable(candidates, decisions, known, text):
    by_id = {c.candidate_id: c for c in candidates}
    groups = {}
    for d in decisions:
        if d['verdict'] == 'entity':
            key = d['canonical_entity_id'] or d['canonical_name'].casefold()
            groups.setdefault(key, []).append(d)
    entities, aliases = [], []
    for group in groups.values():
        # Conflicting identity/type evidence stays visible and fails before downstream extraction.
        if len({(d['canonical_name'], d['entity_type']) for d in group}) != 1:
            raise AnalysisOutputError('ENTITY_IDENTITY_CONFLICT',
                                     'Verified occurrences disagree about entity identity/type.', attempts=0)
        chosen = max(group, key=lambda d: (same_name(by_id[d['candidate_id']].surface, d['canonical_name']), d['confidence']))
        if not chosen['canonical_entity_id'] and not any(
                same_name(by_id[d['candidate_id']].surface, d['canonical_name']) for d in group):
            raise AnalysisOutputError('ENTITY_IDENTITY_CONFLICT',
                                     'A new canonical name needs its own verified source occurrence.', attempts=0)
        c = by_id[chosen['candidate_id']]
        statuses = {d['initial_status'] for d in group if d['initial_status'] != 'Unknown'}
        status = next(iter(statuses)) if len(statuses) == 1 else 'Unknown'
        status_decision = next((d for d in group if d['initial_status'] == status), chosen)
        entities.append({'phrase': chosen['canonical_name'], 'entity': chosen['entity_type'],
                         'score': chosen['confidence'] * 10, 'initial_status': status,
                         'status_quote': status_decision['status_quote'] if status != 'Unknown' else '',
                         'verified_start': c.start, 'verified_end': c.end,
                         'canonical_entity_id': chosen['canonical_entity_id'],
                         'candidate_ids': [d['candidate_id'] for d in group]})
        seen = set()
        for d in group:
            mention = by_id[d['candidate_id']]
            if same_name(mention.surface, d['canonical_name']) or mention.surface.casefold() in seen:
                continue
            seen.add(mention.surface.casefold())
            # No direct identity mutation: these mappings still require the normal proposal review.
            aliases.append({'alias': mention.surface, 'entity_name': d['canonical_name'],
                            'entity_id': d['canonical_entity_id'], 'start': mention.start, 'end': mention.end,
                            'confidence': d['confidence'], 'identity_quote': d['identity_quote']})
    alias_targets = {}
    for alias in aliases:
        alias_targets.setdefault(alias['alias'].casefold(), set()).add(
            alias['entity_id'] or alias['entity_name'].casefold())
    if any(len(targets) > 1 for targets in alias_targets.values()):
        raise AnalysisOutputError('ENTITY_IDENTITY_CONFLICT',
            'A short alias refers to multiple entities; resolve its occurrences before downstream extraction.', attempts=0)
    return entities, aliases
