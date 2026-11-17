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
# Live retest N6: "Làng Thạch Khê" and "Thạch Khê" became two locations. A location head in front of a
# proper name names the same place. The merge in _canonicalize only happens when the bare name is
# itself known or verified, so "Chùa Cầu" is never folded into a lone "Cầu" that is not an entity.
LOCATION_HEADS = frozenset({'làng', 'thôn', 'xóm', 'xã', 'bản', 'phố', 'thành', 'trấn', 'thị trấn', 'kinh thành',
                            'núi', 'sông', 'hồ', 'rừng', 'đảo', 'động', 'đèo', 'vực', 'thung lũng', 'cửa ải'})


def base_name(name, entity_type=None):
    """Name without a leading honorific (persons) or label (other types); the name itself if none."""
    words = unicodedata.normalize('NFC', name or '').split()
    rest = words
    if entity_type in (None, 'PER') and len(words) >= 2 and words[0].casefold() in PERSON_HONORIFICS:
        rest = words[1:]
        if len(rest) >= 2 and rest[0].casefold() == 'tên':
            rest = rest[1:]
    elif entity_type != 'PER':
        heads = LABEL_PREFIXES | (LOCATION_HEADS if entity_type == 'LOC' else frozenset())
        for size in (2, 1):
            if len(words) > size and ' '.join(words[:size]).casefold() in heads:
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


KNOWN_NAME_REASON = 'Tên đã duyệt, khớp chính xác; hệ thống tự xác nhận, không cần AI.'
ENTITY_TYPES = {'PER', 'LOC', 'ORG', 'ITEM', 'SKILL'}


def known_name_decisions(items, known_entities, known_aliases):
    """Live retest 7 (option A): 85-95% of verified occurrences were exact approved names, which the
    model can only confirm. An occurrence is decided here when its surface is exactly (case and
    accents included) the canonical name of one known entity, the name has at least two words, and no
    other entity or alias shares it. Aliases and short names still go to the model."""
    by_name, shared = {}, set()
    for e in known_entities:
        key = same_key(e['name'])
        if key in by_name:
            shared.add(key)
        by_name[key] = e
    shared |= {same_key(a['alias']) for a in known_aliases}
    decided = {}
    for c in items:
        e = by_name.get(same_key(c.surface))
        name = c.surface
        if e is None:
            # Live retest 8 (V2): "làng Thạch Khê" for the approved place "Thạch Khê". A location head,
            # label or honorific in front of an exact approved name is the same identity (see base_name).
            matches = [k for k in known_entities if k.get('entity_type') in ENTITY_TYPES
                       and base_name(c.surface, k['entity_type']) == k['name'] != c.surface]
            e = matches[0] if len(matches) == 1 else None
            name = e['name'] if e else ''
        if (e is None or same_key(name) in shared or same_key(c.surface) in shared or name != e['name'] or len(name.split()) < 2
                or not e.get('entity_id') or e.get('entity_type') not in ENTITY_TYPES):
            continue
        decided[c.candidate_id] = EntityDecision(candidate_id=c.candidate_id, verdict='entity',
            entity_type=e['entity_type'], canonical_name=e['name'], canonical_entity_id=str(e['entity_id']),
            confidence=1.0, reason=KNOWN_NAME_REASON)
    return decided


def align_known_name(d, c, known):
    """V2: the model linked "làng Thạch Khê" to the known "Thạch Khê" by ID but kept the surface as
    canonical_name, so the identity check rejected it. When the ID is known and the names differ only
    by a head word, label or honorific, the known canonical name is used."""
    target = known.get(d.canonical_entity_id) if d.verdict == 'entity' and d.canonical_entity_id else None
    if target is None or c is None or d.canonical_name == target['name'] or d.entity_type != target['entity_type']:
        return d
    names_target = same_name(base_name(d.canonical_name, d.entity_type), target['name'])
    surface_variant = same_name(d.canonical_name, c.surface) and same_name(base_name(c.surface, d.entity_type), target['name'])
    if names_target or surface_variant:
        return d.model_copy(update={'canonical_name': target['name']})
    return d


def same_key(name):
    return unicodedata.normalize('NFC', str(name)).casefold()


def _provider_unavailable(exc):
    return 'PROVIDER_UNAVAILABLE' in str(exc)


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
        audit['pruned_candidates'] = inventory.prune(protected=names + hint_names)
        save('verifying')
        all_names = sorted(set(names + [c.surface for c in inventory.items]))
        system = (
            'Verify EVERY supplied candidate OCCURRENCE in its original context, not just the name string. '
            'Candidates intentionally overgenerate; sentence-initial common words (e.g. "Chương", "Bến", "Chiếc") '
            'and common phrases (e.g. "an" in "an toàn") are NOT entities. '
            'One syllable of a longer name inside that name (e.g. "Hà" in "Thu Hà") is part of the name, not a separate entity. '
            'ITEM is only for a named or story-unique artifact; ordinary objects (e.g. "gậy tre", "đèn bão") are not_entity. '
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
        auto = known_name_decisions(inventory.items, known_entities, known_aliases)
        audit['decisions'].extend(d.model_dump() for d in auto.values())
        audit['known_name_decisions'] = len(auto)
        pending = [c for c in inventory.items if c.candidate_id not in auto]
        # U1: one chapter's verification batch failed with a provider 503 every time while other calls
        # worked. A failing batch is split once; if its first half fails too, it is an outage.
        work = [(start, pending[start:start + batch_size], False) for start in range(0, len(pending), batch_size)]
        while work:
            start, batch, is_split = work.pop(0)
            request = {'candidates': [c.to_dict() for c in batch], 'known_entities': list(known_entities),
                       'known_aliases': list(known_aliases), 'allowed_names': all_names,
                       'author_guidance': list(guidance),
                       'guidance_policy': 'Hints are search instructions, never evidence of an occurrence or event. '
                           'Author declarations describe world identities, not chapter presence. '
                           'Do not merge identities or invent source facts from these entries.'}
            last_error = ''
            parsed = None  # last schema-valid output, kept for per-candidate salvage
            by_cid = {c.candidate_id: c for c in batch}
            # Live retest 8 (V3): one invalid item made the whole batch go back to the model. Valid
            # decisions from the first attempt are kept and only the invalid ones are repaired.
            kept, todo = [], batch
            for attempt in range(2):
                try:
                    raw = call_structured(llm, operation='entity_candidate_verification', system_prompt=system,
                                          user_prompt=json.dumps(request, ensure_ascii=False))
                except Exception as exc:
                    if not _provider_unavailable(exc) or is_split or len(todo) < 2:
                        raise
                    half = len(todo) // 2
                    audit.setdefault('split_batches', []).append({'batch_start': start, 'size': len(todo)})
                    logger.warning('Entity verification batch %d (%d candidates) failed at the provider; '
                                   'retrying as two halves', start, len(todo))
                    audit['decisions'].extend(d.model_dump() for d in kept)
                    work[:0] = [(start, todo[:half], True), (start + half, todo[half:], True)]
                    raw = None
                    break
                try:
                    parsed = [align_known_name(d, by_cid.get(d.candidate_id), known)
                              for d in EntityDecisionBatch.model_validate_json(raw).decisions]
                    _validate(parsed, todo, text, known, all_names)
                    decisions = kept + parsed
                    break
                except ValueError as exc:
                    last_error = str(exc)
                    # #148: keep the reason; it was previously lost when the batch failed.
                    audit.setdefault('repair_errors', []).append(
                        {'batch_start': start, 'attempt': attempt + 1, 'error': last_error[:MAX_LOGGED_ERROR]})
                    logger.warning('Entity verification batch %d attempt %d invalid: %s',
                                   start, attempt + 1, _redact(last_error))
                    if attempt == 0 and parsed is not None:
                        good, bad, errors = _split_valid(parsed, todo, text, known, all_names)
                        if good and bad:
                            bad_ids = {c.candidate_id for c in bad}
                            kept, todo = good, bad
                            audit.setdefault('partial_repairs', []).append(
                                {'batch_start': start, 'kept': len(good), 'repaired': len(bad)})
                            last_error = '; '.join(errors)
                            request['candidates'] = [c.to_dict() for c in todo]
                            raw = json.dumps({'decisions': [d.model_dump() for d in parsed if d.candidate_id in bad_ids]},
                                             ensure_ascii=False)
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
                decisions, degraded = _salvage(parsed, todo, text, known, all_names)
                decisions = kept + decisions
                audit.setdefault('degraded_candidates', []).extend(degraded)
                logger.warning('Entity verification batch %d: %d candidate(s) left unresolved after bounded repair',
                               start, len(degraded))
            if raw is None:
                continue  # split into halves; they are verified next
            audit['decisions'].extend(d.model_dump() for d in decisions)
            save('verifying')
        audit['decisions'] = _canonicalize(audit['decisions'], inventory.items, known)
        # Every machine decision must pass the same validation the author's save uses; otherwise a
        # single bad suggestion blocks saving the whole chapter. Invalid ones become unresolved.
        by_candidate = {c.candidate_id: c for c in inventory.items}
        checked = []
        for d in audit['decisions']:
            c = by_candidate.get(d['candidate_id'])
            try:
                if c is not None:
                    _validate([EntityDecision.model_validate(d)], [c], text, known, all_names)
                checked.append(d)
            except ValueError as exc:
                checked.append(EntityDecision(candidate_id=d['candidate_id'], verdict='unresolved', confidence=0,
                    reason='Machine suggestion failed validation; needs author review.').model_dump())
                audit.setdefault('degraded_candidates', []).append(
                    {'candidate_id': d['candidate_id'], 'error': str(exc)[:MAX_LOGGED_ERROR]})
        checked = _hold_weak_new_identities(checked, known, hint_names, audit)
        # Group check: a new name whose only anchor occurrence is unresolved would leave its aliases
        # pointing at nothing ("Mai", "Lâm" -> "Mai Lâm" while "Mai Lâm" is unresolved), and the author's
        # save would fail. Such groups become unresolved together.
        anchored = set()
        for d in checked:
            c = by_candidate.get(d['candidate_id'])
            if c is not None and d['verdict'] == 'entity' and not d['canonical_entity_id'] and (
                    same_name(c.surface, d['canonical_name'])
                    or honorific_variant(d['canonical_name'], c.surface, d['entity_type'])):
                anchored.add((d['canonical_name'].casefold(), d['entity_type']))
        for i, d in enumerate(checked):
            if (d['verdict'] == 'entity' and not d['canonical_entity_id']
                    and (d['canonical_name'].casefold(), d['entity_type']) not in anchored):
                checked[i] = EntityDecision(candidate_id=d['candidate_id'], verdict='unresolved', confidence=0,
                    reason=f"Suggested as {d['canonical_name']}, whose own occurrence is unresolved; decide together.").model_dump()
                audit.setdefault('degraded_candidates', []).append(
                    {'candidate_id': d['candidate_id'], 'error': 'unanchored new identity'})
        audit['decisions'] = checked
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

def _hold_weak_new_identities(decisions, known, declared, audit):
    """Long-run live test (2026-11-15): 7 of 19 memory entities were name fragments ("Thu", "Hà" of
    "Thu Hà"; "Hội", "An" of "Hội An") and common objects ("gậy tre", "đèn bão"); approved fragments
    then produced more candidates. A NEW identity is held as unresolved, for the author to decide,
    when it is one syllable of a longer known or verified name, or a lowercase-only item. Links to
    known entities and names the author declared are not touched."""
    declared = {unicodedata.normalize('NFC', n).casefold() for n in declared if n}
    longer = {e['name'] for e in known.values()} | {
        d['canonical_name'] for d in decisions if d['verdict'] == 'entity' and d['canonical_name']}
    syllables = {}
    for name in longer:
        # "Cậu Linh" names Linh; its syllable "Linh" is the bare name, not a fragment.
        words = base_name(name).split()
        if len(words) > 1:
            for word in words:
                syllables.setdefault(word.casefold(), name)
    out = []
    for d in decisions:
        name = unicodedata.normalize('NFC', d.get('canonical_name') or '')
        reason = None
        if (d['verdict'] == 'entity' and not d['canonical_entity_id'] and name
                and name.casefold() not in declared):
            if len(name.split()) == 1 and name.casefold() in syllables:
                reason = f'One syllable of "{syllables[name.casefold()]}"; author decides whether it is a separate entity.'
            elif d['entity_type'] == 'ITEM' and not any(ch.isupper() for ch in name):
                reason = 'Common object without a proper name; author decides whether it matters to the story.'
        if reason:
            out.append(EntityDecision(candidate_id=d['candidate_id'], verdict='unresolved', confidence=0,
                                      reason=reason).model_dump())
            audit.setdefault('held_new_identities', []).append(
                {'candidate_id': d['candidate_id'], 'reason': reason[:MAX_LOGGED_ERROR]})
        else:
            out.append(d)
    return out


def _split_valid(decisions, batch, text, known, allowed):
    """Per-candidate check: (valid decisions, candidates without a valid decision, their errors)."""
    first = {}
    for d in decisions:
        first.setdefault(d.candidate_id, d)
    good, bad, errors = [], [], []
    for c in batch:
        d = first.get(c.candidate_id)
        error = 'missing decision'
        if d is not None:
            try:
                _validate([d], [c], text, known, allowed)
                good.append(d)
                continue
            except ValueError as exc:
                error = str(exc)
        bad.append(c)
        errors.append(f'{c.candidate_id}: {error}'[:MAX_LOGGED_ERROR])
    return good, bad, errors


def _salvage(decisions, batch, text, known, allowed):
    """Per-candidate fallback after bounded repair: keep each valid decision, mark the rest unresolved."""
    good, bad, errors = _split_valid(decisions, batch, text, known, allowed)
    kept = {d.candidate_id: d for d in good}
    for c, error in zip(bad, errors):
        kept[c.candidate_id] = EntityDecision(candidate_id=c.candidate_id, verdict='unresolved', confidence=0,
                                              reason='Model decision invalid after bounded repair; needs author review.')
    degraded = [{'candidate_id': c.candidate_id, 'error': e.split(': ', 1)[1][:MAX_LOGGED_ERROR]}
                for c, e in zip(bad, errors)]
    return [kept[c.candidate_id] for c in batch], degraded

def _starts(text, quote):
    if not quote or not quote.strip():
        raise ValueError('An exact source quote is required')
    found, at = [], text.find(quote)
    while at >= 0:
        found.append(at)
        at = text.find(quote, at + 1)
    if not found:
        raise ValueError('Evidence quote is not present in the source revision')
    return found


def context_quote_span(text, quote, c):
    """Live retest 8 (V1): the model quoted "Thượng cổ Lôi Long", which occurs many times in the
    chapter, so a whole-chapter search called it ambiguous and the new main character stayed
    unresolved. Identity evidence only has to sit in this occurrence's own verification context, so
    the quote is looked up there; the occurrence nearest the candidate wins."""
    inside = [a for a in _starts(text, quote) if c.context_start <= a and a + len(quote) <= c.context_end]
    if not inside:
        raise ValueError('Identity evidence is outside this occurrence verification context')
    start = min(inside, key=lambda a: 0 if a <= c.start and c.end <= a + len(quote) else min(abs(a - c.start), abs(a + len(quote) - c.end)))
    return start, start + len(quote)


def status_quote_span(text, quote, c):
    """The status quote must contain this occurrence; a sentence repeated elsewhere is not ambiguous."""
    for a in _starts(text, quote):
        if a <= c.start and c.end <= a + len(quote):
            return a, a + len(quote)
    raise ValueError('Status evidence must anchor this occurrence')


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
            context_quote_span(text, d.identity_quote, c)
            if c.surface.casefold() not in d.identity_quote.casefold():
                raise ValueError('Alias identity quote must include the candidate surface')
            if d.canonical_name.casefold() not in d.identity_quote.casefold():
                raise ValueError('Alias identity quote must include the canonical name')
        if d.initial_status != 'Unknown':
            if d.entity_type != 'PER' or not d.status_quote:
                raise ValueError('Only evidenced person life status may be asserted')
            status_quote_span(text, d.status_quote, c)


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
        # An honorific occurrence ("Bà Sâm") is the source occurrence of its bare name ("Sâm") when the
        # chapter never writes the bare name alone (final live acceptance).
        if not chosen['canonical_entity_id'] and not any(
                same_name(by_id[d['candidate_id']].surface, d['canonical_name'])
                or honorific_variant(d['canonical_name'], by_id[d['candidate_id']].surface, d['entity_type'])
                for d in group):
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
            quote_at = {}
            if d['identity_quote'] and hasattr(mention, 'context_start'):
                try:
                    quote_at = dict(zip(('quote_start', 'quote_end'), context_quote_span(text, d['identity_quote'], mention)))
                except ValueError:
                    quote_at = {}
            # No direct identity mutation: these mappings still require the normal proposal review.
            aliases.append({'alias': mention.surface, 'entity_name': d['canonical_name'],
                            'entity_id': d['canonical_entity_id'], 'provisional_identity_key': d.get('provisional_identity_key', ''), 'start': mention.start, 'end': mention.end,
                            'confidence': d['confidence'],
                            # Honorific variants may carry no quote; the alias occurrence itself is the evidence.
                            'identity_quote': d['identity_quote'] or mention.surface, **quote_at})
    # Shared aliases retain occurrence-level IDs; downstream rejects ambiguous labels.
    return entities, aliases
