"""Bounded occurrence verification with a complete, auditable decision inventory."""
from collections import Counter
from dataclasses import dataclass
import json
import logging
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from core.structured_call import call_structured
from core.structured_outputs import EntityType
from core.exceptions import EntityExtractionError
from domain.errors import AnalysisOutputError
from services.entity_pipeline.candidates import CandidateInventory, POLICY, chunks, occurrences, same_name
from services.source_grounding import quote_span

logger = logging.getLogger(__name__)
MAX_LOGGED_ERROR = 300


# F-LIVE-18: Vietnamese honorifics and descriptive labels in front of a name ("ông Hòa", "Chị Mai
# Linh", "Ông tên Hòa", "mã CV-04") refer to the same identity as the bare name. Live imports turned
# each variant into a separate entity. Only a leading honorific/label is removed, and only when a
# proper name (capitalised word or code) remains; short-name fragments ("Mai" vs "Mai Linh") are
# ambiguous and are never merged here.
PERSON_HONORIFICS = frozenset({
    'ông', 'bà', 'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thím', 'mợ', 'cụ', 'lão',
    'thầy', 'ngài', 'nàng', 'chàng', 'bé', 'già', 'bạn', 'cháu', 'con', 'tiểu', 'đại'})
LABEL_PREFIXES = frozenset({'mã', 'số', 'số hiệu', 'ký hiệu', 'mật danh'})


def base_name(name, entity_type=None):
    """Name without a leading honorific (persons) or label (other types); the name itself if none."""
    words = unicodedata.normalize('NFC', name or '').split()
    rest = words
    if entity_type in (None, 'PER') and len(words) >= 2 and words[0].casefold() in PERSON_HONORIFICS:
        rest = words[1:]
        if len(rest) >= 2 and rest[0].casefold() == 'tên':
            rest = rest[1:]
    elif entity_type != 'PER':
        for size in (2, 1):
            if len(words) > size and ' '.join(words[:size]).casefold() in LABEL_PREFIXES:
                rest = words[size:]
                break
    if rest is words or not rest or not (rest[0][:1].isupper() or rest[0][:1].isdigit()):
        return ' '.join(words)
    return ' '.join(rest)


def honorific_variant(left, right, entity_type=None):
    """Different surfaces that name the same identity once honorifics/labels are removed."""
    return not same_name(left, right) and same_name(base_name(left, entity_type), base_name(right, entity_type))


def _canonicalize(decisions, candidates, known):
    """After all batches: point honorific/label variants at the bare name - a known entity first,
    else a name verified as an entity in this chapter - so they become aliases of one identity."""
    by_id = {c.candidate_id: c for c in candidates}
    known_by_base = {}
    for entity in known.values():
        key = (base_name(entity['name'], entity.get('entity_type')).casefold(), entity.get('entity_type'))
        known_by_base.setdefault(key, []).append(entity)
    verified = {}
    for d in decisions:
        if d['verdict'] == 'entity' and not d['canonical_entity_id'] and d['entity_type']:
            verified.setdefault((unicodedata.normalize('NFC', d['canonical_name']).casefold(), d['entity_type']), d['canonical_name'])
    out = []
    for d in decisions:
        c = by_id.get(d['candidate_id'])
        if c is None or d['verdict'] != 'entity' or d['canonical_entity_id'] or d.get('provisional_identity_key') or not d['entity_type']:
            out.append(d)
            continue
        base = base_name(d['canonical_name'], d['entity_type'])
        matches = known_by_base.get((base.casefold(), d['entity_type']), [])
        if len(matches) == 1 and not same_name(matches[0]['name'], d['canonical_name']):
            target = matches[0]
            d = {**d, 'canonical_entity_id': str(target['entity_id']), 'canonical_name': target['name'],
                 'identity_quote': c.surface if not same_name(target['name'], c.surface) else ''}
        elif not same_name(base, d['canonical_name']) and (base.casefold(), d['entity_type']) in verified:
            name = verified[(base.casefold(), d['entity_type'])]
            d = {**d, 'canonical_name': name, 'identity_quote': c.surface if not same_name(name, c.surface) else ''}
        out.append(d)
    return out

def _redact(error: str) -> str:
    """Log-safe error: quoted values (manuscript names/quotes) are removed; the audit keeps detail."""
    return re.sub(r'"[^"]*"', '"…"', error)[:MAX_LOGGED_ERROR]

class EntityDecision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    candidate_id: str = Field(description='Exact candidate_id from the request.')
    verdict: Literal['entity', 'not_entity', 'unresolved'] = Field(
        description="Verdict: 'entity' for real named entities; 'not_entity' for common words, nouns, phrases; 'unresolved' for ambiguous identity."
    )
    entity_type: EntityType | None = Field(
        default=None,
        description="PER, LOC, ORG, ITEM, or SKILL for 'entity'. MUST be null for 'not_entity' and 'unresolved'."
    )
    canonical_name: str = Field(
        default='',
        description="Exact known canonical name or supplied candidate surface for 'entity'. MUST be empty string '' for 'not_entity' and 'unresolved'."
    )
    canonical_entity_id: str = Field(
        default='',
        description="Known entity ID if matching known entities for 'entity'. MUST be empty string '' for 'not_entity' and 'unresolved'."
    )
    provisional_identity_key: str = Field(default='', max_length=130, description='Human review only: checkpoint scope / author group label. Never assign in machine verification.')
    identity_quote: str = Field(
        default='',
        description="Verbatim source quote proving alias identity for 'entity'. MUST be empty string '' for 'not_entity' and 'unresolved'."
    )
    initial_status: Literal['Alive', 'Dead', 'Unknown'] = Field(
        default='Unknown',
        description="Life status for PER with direct confirmed source status_quote. MUST be 'Unknown' for 'not_entity' and 'unresolved'."
    )
    status_quote: str = Field(
        default='',
        description="Verbatim source quote evidencing life status for PER. MUST be empty string '' for 'not_entity' and 'unresolved'."
    )
    confidence: float = Field(default=0.7, ge=0, le=1)
    reason: str = Field(min_length=1, description='Linguistic context reason for this verdict.')


class EntityDecisionBatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decisions: list[EntityDecision]


@dataclass
class VerifiedEntities:
    entities: list[dict]
    aliases: list[dict]
    audit: dict


def _build_repair_instruction(validation_error: str) -> str:
    """Construct an actionable repair instruction tailored to the validation error."""
    base = f"Validation failed: {validation_error}\n"
    if "carries resolved identity/status fields" in validation_error or "canonical_name" in validation_error:
        return (
            base +
            "ACTIONABLE CORRECTION REQUIRED:\n"
            "- For any candidate with verdict 'not_entity' or 'unresolved', you MUST set:\n"
            "    canonical_name = ''\n"
            "    canonical_entity_id = ''\n"
            "    entity_type = null\n"
            "    identity_quote = ''\n"
            "    initial_status = 'Unknown'\n"
            "    status_quote = ''\n"
            "- DO NOT keep the candidate surface as canonical_name for negative or unresolved decisions.\n"
            "- DO NOT change verdict to 'entity' merely to bypass this validation; keep the negative verdict if the occurrence is not a true entity.\n"
            "- Return a complete, corrected decision batch covering all candidate IDs."
        )
    if "Every candidate must have exactly one decision" in validation_error:
        return (
            base +
            "ACTIONABLE CORRECTION REQUIRED:\n"
            "- Every candidate_id in the request must have exactly one decision.\n"
            "- Do not omit, duplicate, or add candidate IDs.\n"
            "- Return a complete, corrected decision batch."
        )
    if "Alias identity" in validation_error:
        return (
            base +
            "ACTIONABLE CORRECTION REQUIRED:\n"
            "- An alias must have identity_quote containing verbatim source text that mentions both candidate surface and canonical name.\n"
            "- If the context does not explicitly establish this identity, change verdict to 'unresolved' and clear canonical_name/entity_type.\n"
            "- Return a complete, corrected decision batch."
        )
    return (
        base +
        "ACTIONABLE CORRECTION REQUIRED:\n"
        "- Correct the validation error identified above while preserving strict schema adherence.\n"
        "- Return a complete, corrected decision batch."
    )


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
            try:
                discovered = discover(chunk.text, llm)
            except EntityExtractionError as exc:
                # Discovery only adds candidates; known names and author guidance are already
                # collected. One bad chunk must not fail the chapter (or a whole manuscript import).
                audit.setdefault('discovery_errors', []).append(
                    {'chunk_start': chunk.start, 'error': _redact(str(exc))})
                logger.warning('Entity discovery skipped for chunk at %d: %s', chunk.start, _redact(str(exc)))
                discovered = []
            for item in discovered:
                if not list(occurrences(chunk.text, item['phrase'])):
                    audit['unanchored_discoveries'].append({'name': item['phrase'], 'chunk_start': chunk.start})
                inventory.add_name(item['phrase'], 'llm_discovery', chunk=chunk)
            audit['chunks'].append({'start': chunk.start, 'end': chunk.end})
        save('verifying')
        all_names = sorted(set(names + [c.surface for c in inventory.items]))
        system = (
            'Verify EVERY supplied candidate OCCURRENCE in its original context, not just the name string. '
            'Candidates intentionally overgenerate; sentence-initial common words (e.g. "Chương", "Bến", "Chiếc") '
            'and common phrases (e.g. "an" in "an toàn") are NOT entities. '
            'Return exactly one decision per candidate_id, with no missing, extra, or duplicate candidate IDs. '
            'Verdicts must be strictly partitioned as follows:\n'
            '1. For verdict "entity":\n'
            '   - entity_type: must be one of PER, LOC, ORG, ITEM, SKILL.\n'
            '   - canonical_name: must be an exact known canonical name or the supplied candidate surface.\n'
            '   - canonical_entity_id: reference ONLY a supplied known entity ID matching this entity, else empty string "".\n'
            '   - Distinct people sharing a short name must NOT be merged.\n'
            '   - An alias requires identity_quote copied verbatim from source context proving identity; if ambiguous use "unresolved".\n'
            '   - Non-Unknown life status only for PER with explicit confirmed source status_quote, not hearsay or inference.\n'
            '2. For verdict "not_entity" and "unresolved":\n'
            '   - canonical_name MUST be empty string "" (DO NOT retain or copy the candidate surface name into canonical_name).\n'
            '   - canonical_entity_id MUST be empty string "".\n'
            '   - entity_type MUST be null.\n'
            '   - identity_quote MUST be empty string "".\n'
            '   - initial_status MUST be "Unknown".\n'
            '   - status_quote MUST be empty string "".\n'
            '   - For "not_entity": state the linguistic or context reason (e.g. common noun, chapter header, sentence-initial word).\n'
            '   - For "unresolved": state what ambiguity prevents confirmation (unresolved is not approved truth).\n'
            'Explain each decision in reason. Schema: '
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
            parsed = None  # last schema-valid output, kept for per-candidate salvage
            for attempt in range(2):
                raw = call_structured(llm, operation='entity_candidate_verification', system_prompt=system,
                                      user_prompt=json.dumps(request, ensure_ascii=False))
                try:
                    parsed = EntityDecisionBatch.model_validate_json(raw).decisions
                    _validate(parsed, batch, text, known, all_names)
                    decisions = parsed
                    break
                except ValueError as exc:
                    last_error = str(exc)
                    # #148: keep the reason; it was previously lost when the batch failed.
                    audit.setdefault('repair_errors', []).append(
                        {'batch_start': start, 'attempt': attempt + 1, 'error': last_error[:MAX_LOGGED_ERROR]})
                    logger.warning('Entity verification batch %d attempt %d invalid: %s',
                                   start, attempt + 1, _redact(last_error))
                    repair_instruction = _build_repair_instruction(last_error)
                    request.update(previous_result=raw, validation_error=last_error,
                                   repair_instruction=repair_instruction)
            else:
                if parsed is None:
                    raise AnalysisOutputError('ENTITY_VERIFICATION_UNRESOLVED',
                        'Candidate decisions are incomplete or invalid after bounded repair: '
                        + last_error[:MAX_LOGGED_ERROR], attempts=2)
                # #148: one bad decision no longer fails the chapter. Valid decisions are kept; invalid or
                # missing ones become 'unresolved' (never materialized, left to the author's review).
                decisions, degraded = _salvage(parsed, batch, text, known, all_names)
                audit.setdefault('degraded_candidates', []).extend(degraded)
                logger.warning('Entity verification batch %d: %d candidate(s) left unresolved after bounded repair',
                               start, len(degraded))
            audit['decisions'].extend(d.model_dump() for d in decisions)
            save('verifying')
        audit['decisions'] = _canonicalize(audit['decisions'], inventory.items, known)
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

def _salvage(decisions, batch, text, known, allowed):
    """Per-candidate fallback after bounded repair: keep each valid decision, mark the rest unresolved."""
    first = {}
    for d in decisions:
        first.setdefault(d.candidate_id, d)
    kept, degraded = [], []
    for c in batch:
        d = first.get(c.candidate_id)
        error = 'missing decision'
        if d is not None:
            try:
                _validate([d], [c], text, known, allowed)
                kept.append(d)
                continue
            except ValueError as exc:
                error = str(exc)
        kept.append(EntityDecision(candidate_id=c.candidate_id, verdict='unresolved', confidence=0,
                                   reason='Model decision invalid after bounded repair; needs author review.'))
        degraded.append({'candidate_id': c.candidate_id, 'error': error[:MAX_LOGGED_ERROR]})
    return kept, degraded

def _validate(decisions, batch, text, known, allowed, *, human=False):
    by_id = {c.candidate_id: c for c in batch}
    if len(decisions) != len(batch) or {d.candidate_id for d in decisions} != set(by_id):
        raise ValueError('Every candidate must have exactly one decision')
    for d in decisions:
        c = by_id[d.candidate_id]
        if d.provisional_identity_key and (not human or d.canonical_entity_id or d.verdict != 'entity'):
            raise ValueError('Provisional identity is human-only and mutually exclusive with canonical identity')
        if d.verdict != 'entity':
            invalid_fields = []
            if d.canonical_name:
                invalid_fields.append(f'canonical_name="{d.canonical_name}" (must be "")')
            if d.canonical_entity_id:
                invalid_fields.append(f'canonical_entity_id="{d.canonical_entity_id}" (must be "")')
            if d.entity_type is not None:
                invalid_fields.append(f'entity_type="{d.entity_type}" (must be null)')
            if d.identity_quote:
                invalid_fields.append(f'identity_quote="{d.identity_quote}" (must be "")')
            if d.initial_status != 'Unknown':
                invalid_fields.append(f'initial_status="{d.initial_status}" (must be "Unknown")')
            if d.status_quote:
                invalid_fields.append(f'status_quote="{d.status_quote}" (must be "")')
            if invalid_fields:
                raise ValueError(
                    f'Candidate {d.candidate_id} (surface="{c.surface}") has verdict="{d.verdict}" '
                    f'but carries resolved identity/status fields: {", ".join(invalid_fields)}. '
                    f'For non-entity/unresolved verdicts, canonical_name, canonical_entity_id, identity_quote, status_quote must be "", '
                    f'entity_type must be null, initial_status must be "Unknown".'
                )
            continue
        if not d.entity_type or d.canonical_name not in allowed:
            raise ValueError('Entity must use a supplied name and a valid type')
        if d.canonical_entity_id:
            target = known.get(d.canonical_entity_id)
            if not target or target['name'] != d.canonical_name or target['entity_type'] != d.entity_type:
                raise ValueError('Unknown or mismatched canonical identity')
        elif not d.provisional_identity_key and any(same_name(e['name'], d.canonical_name) for e in known.values()):
            raise ValueError('Use explicit canonical ID for a known entity')
        if not same_name(d.canonical_name, c.surface) and not honorific_variant(d.canonical_name, c.surface, d.entity_type):
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


def _materializable(candidates, decisions, known, text, *, human=False):
    by_id = {c.candidate_id: c for c in candidates}
    groups = {}
    for d in decisions:
        if d['verdict'] == 'entity':
            if human and not d['canonical_entity_id'] and not d.get('provisional_identity_key'):
                raise ValueError('New identities require an explicit author provisional group')
            key = ('canonical', d['canonical_entity_id']) if d['canonical_entity_id'] else (
                'provisional', d.get('provisional_identity_key') or d['canonical_name'].casefold())
            groups.setdefault(key, []).append(d)
    entities, aliases = [], []
    # #145: spans of verified full-name occurrences. A fragment inside one of them ("Lâm" in
    # "Lâm Phong") is the same occurrence, not evidence of a separate alias.
    full_spans = [(by_id[d['candidate_id']].start, by_id[d['candidate_id']].end)
                  for group in groups.values() for d in group
                  if same_name(by_id[d['candidate_id']].surface, d['canonical_name'])]
    def inside_full_name(mention):
        return any(s <= mention.start and mention.end <= e and (s, e) != (mention.start, mention.end)
                   for s, e in full_spans)
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
        if human and len(statuses) > 1:
            raise ValueError('Provisional group has conflicting identity status')
        status = next(iter(statuses)) if len(statuses) == 1 else 'Unknown'
        status_decision = next((d for d in group if d['initial_status'] == status), chosen)
        entities.append({'phrase': chosen['canonical_name'], 'entity': chosen['entity_type'],
                         'score': chosen['confidence'] * 10, 'initial_status': status,
                         'status_quote': status_decision['status_quote'] if status != 'Unknown' else '',
                         'verified_start': c.start, 'verified_end': c.end,
                         'canonical_entity_id': chosen['canonical_entity_id'],
                         'provisional_identity_key': chosen.get('provisional_identity_key', ''),
                         'candidate_ids': [d['candidate_id'] for d in group]})
        seen = set()
        for d in group:
            mention = by_id[d['candidate_id']]
            if (same_name(mention.surface, d['canonical_name']) or inside_full_name(mention)
                    or (mention.surface.casefold(), mention.start, mention.end) in seen):
                continue
            seen.add((mention.surface.casefold(), mention.start, mention.end))
            # No direct identity mutation: these mappings still require the normal proposal review.
            aliases.append({'alias': mention.surface, 'entity_name': d['canonical_name'],
                            'entity_id': d['canonical_entity_id'], 'provisional_identity_key': d.get('provisional_identity_key', ''), 'start': mention.start, 'end': mention.end,
                            'confidence': d['confidence'], 'identity_quote': d['identity_quote']})
    # Shared aliases retain occurrence-level IDs; downstream rejects ambiguous labels.
    return entities, aliases
