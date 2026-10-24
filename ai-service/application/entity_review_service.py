"""Human entity checkpoint. No candidate or guidance is canonical memory."""
from copy import deepcopy
from types import SimpleNamespace
import uuid
import hashlib
import json
import re

from domain.errors import OptimisticLockError
from services.entity_pipeline.candidates import same_name
from services.entity_pipeline.verification import EntityDecision, _validate, _materializable


TYPE_MAP = {'character': 'PER', 'person': 'PER', 'location': 'LOC', 'place': 'LOC',
            'item': 'ITEM', 'object': 'ITEM', 'organization': 'ORG', 'skill': 'SKILL'}


def provisional_scope(audit):
    request = audit['request']
    return hashlib.sha256(json.dumps([request['tenant_id'], request['novel_id'], audit['revision_id'],
        audit['source_hash'], audit['analysis_run_id']], separators=(',', ':')).encode()).hexdigest()


def validate_provisional_scope(audit, decisions):
    prefix = provisional_scope(audit) + '/'
    groups = {}
    for d in decisions:
        key = d.provisional_identity_key
        if key and (not key.startswith(prefix) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', key[len(prefix):])):
            raise ValueError('Provisional identity belongs to another checkpoint/source scope or has invalid label')
        if key:
            identity = (d.canonical_name, d.entity_type)
            if key in groups and groups[key] != identity:
                raise ValueError('Provisional group has conflicting name/type')
            groups[key] = identity
        if d.verdict == 'entity' and not d.canonical_entity_id and not key:
            raise ValueError('New identities require an explicit author provisional group')


def registry(repository, story_id):
    data = repository.get_entity_registry(story_id)
    for e in data['entities']:
        e['entity_type'] = TYPE_MAP.get(e['entity_type'].lower(), e['entity_type'].upper())
    return data


def save_guidance(repository, story_id, entries, expected_version):
    if len(entries) > 256:
        raise ValueError('At most 256 guidance entries')
    clean, seen = [], set()
    for entry in entries:
        name = str(entry.get('name', '')).strip()
        kind = entry.get('kind', 'hint')
        entity_type = entry.get('entity_type') or None
        aliases = entry.get('aliases', [])
        if not name or len(name) > 255 or kind not in {'hint', 'declared'}:
            raise ValueError('Provide a name and hint/declared kind')
        if entity_type not in {None, 'PER', 'LOC', 'ITEM', 'ORG', 'SKILL'}:
            raise ValueError('Invalid entity type')
        if kind == 'declared' and entity_type is None:
            raise ValueError('An author-declared identity requires a type')
        if not isinstance(aliases, list) or len(aliases) > 16 or any(
                not isinstance(a, str) or not a.strip() or len(a) > 255 for a in aliases):
            raise ValueError('Invalid aliases')
        if name.casefold() in seen:
            raise ValueError('Duplicate guidance name')
        seen.add(name.casefold())
        clean.append({'name': name, 'kind': kind, 'entity_type': entity_type,
                      'aliases': [a.strip() for a in aliases], 'notes': str(entry.get('notes', ''))[:1000]})
    if sum(1 + len(e['aliases']) for e in clean) > 512:
        raise ValueError('At most 512 guidance names including aliases')
    return repository.save_entity_guidance(story_id, {'entries': clean}, expected_version)


def review_entities(repository, story_id, run_id, decisions, expected_version, text, *, finalize=True):
    audit = repository.get_entity_candidate_audit(story_id, run_id)
    if not audit:
        raise KeyError(run_id)
    if audit.get('status') != 'waiting_entity_review' or audit.get('review_version') != expected_version:
        raise OptimisticLockError('Entity checkpoint changed; reload it')
    if repository.get_entity_guidance(story_id)['version'] != audit['guidance_version']:
        raise OptimisticLockError('Guidance changed; rerun the entity stage first')
    import hashlib
    if hashlib.sha256(text.encode()).hexdigest() != audit['source_hash']:
        raise ValueError('Entity checkpoint source changed')
    candidates = [SimpleNamespace(**c) for c in audit['candidates']]
    submitted = [EntityDecision.model_validate(d).model_dump() for d in decisions]
    if len({d['candidate_id'] for d in submitted}) != len(submitted):
        raise ValueError('Duplicate author decisions')
    merged = {d['candidate_id']: d for d in audit.get('reviewed_decisions', audit.get('preserved_decisions', []))}
    merged.update({d['candidate_id']: d for d in submitted})
    parsed = [EntityDecision.model_validate(d) for d in merged.values()]
    if any(d.verdict == 'unresolved' for d in parsed):
        raise ValueError('Resolve or reject every candidate before continuing')
    validate_provisional_scope(audit, parsed)
    current = registry(repository, story_id)
    known = {e['entity_id']: e for e in current['entities']}
    allowed = [e['name'] for e in current['entities']] + [c.surface for c in candidates]
    if not finalize:
        by_id = {c.candidate_id:c for c in candidates}
        if set(merged) - set(by_id):
            raise ValueError('Unknown author decision candidate')
        _validate(parsed, [by_id[cid] for cid in merged], text, known, allowed, human=True)
        value = {**deepcopy(audit), 'review_version':expected_version+1, 'review_input_version':expected_version,
            'review_finalize':False, 'review_submitted_decisions':submitted,
            'reviewed_decisions':[d.model_dump() for d in parsed],
            'pending_candidate_ids':[c.candidate_id for c in candidates if c.candidate_id not in merged]}
        repository.save_entity_candidate_audit(story_id, run_id, value, expected_version=expected_version)
        return value
    _validate(parsed, candidates, text, known, allowed, human=True)
    # Author decisions can reject false occurrences without declaring the name absent everywhere.
    entities, aliases = _materializable(candidates, [d.model_dump() for d in parsed], known, text, human=True)
    entities, aliases = freeze_inventory(audit, entities, aliases, text)
    value = {**deepcopy(audit), 'status': 'entities_reviewed', 'review_version': expected_version + 1,
             'pending_candidate_ids': [],
             'identity_inventory_version': 2, 'review_finalize':True, 'review_submitted_decisions': submitted,
             'review_input_version': expected_version, 'reviewed_decisions': [d.model_dump() for d in parsed], 'entities': entities, 'aliases': aliases}
    repository.save_entity_candidate_audit(story_id, run_id, value, expected_version=expected_version)
    return value


def freeze_inventory(audit, entities, aliases, text):
    """Opaque new identity UUIDs are allocated once at the human freeze, never by position/name."""
    candidates = {c['candidate_id']: c for c in audit['candidates']}
    previous = audit.get('preserved_entities', audit.get('entities', []))
    for entity in entities:
        identity = entity['canonical_entity_id']
        if not identity:
            key = entity.get('provisional_identity_key')
            matching = [e for e in previous if key and e.get('entity_id')
                and not e.get('canonical_entity_id') and e.get('provisional_identity_key') == key]
            if len(matching) > 1 or (matching and matching[0]['entity'] != entity['entity']):
                raise ValueError('A reserved provisional group cannot change identity type; choose a new group')
            identity = matching[0]['entity_id'] if matching else entity.get('entity_id') or str(uuid.uuid4())
        entity['entity_id'] = identity
        entity['occurrences'] = [dict(candidate_id=c['candidate_id'], start=c['start'], end=c['end'],
            quote=text[c['start']:c['end']], revision_id=audit['revision_id'], text_hash=audit['source_hash'])
            for c in (candidates[cid] for cid in entity['candidate_ids'])]
    for alias in aliases:
        if alias['entity_id']:
            targets = [e for e in entities if e['canonical_entity_id'] == alias['entity_id']]
        elif alias.get('provisional_identity_key'):
            targets = [e for e in entities if e.get('provisional_identity_key') == alias['provisional_identity_key']]
        else:
            targets = [e for e in entities if e['phrase'] == alias['entity_name']]
        if len(targets) != 1:
            raise ValueError('Alias must identify exactly one reviewed identity')
        alias['entity_id'] = targets[0]['entity_id']
    return entities, aliases


def carry_decisions(previous, refreshed, repository, story_id, text):
    """Compare source occurrence and machine semantics; human choices stay a separate record."""
    old_candidates = {c['candidate_id']: c for c in previous['candidates']}
    new_candidates = {c['candidate_id']: c for c in refreshed['candidates']}
    old_machine = {d['candidate_id']: EntityDecision.model_validate(d).model_dump() for d in previous['decisions']}
    new_machine = {d['candidate_id']: EntityDecision.model_validate(d).model_dump() for d in refreshed['decisions']}
    occurrence = ('candidate_id','surface','start','end','context_start','context_end','context')
    semantics = ('verdict','entity_type','canonical_name','canonical_entity_id','identity_quote','initial_status','status_quote')
    current = registry(repository, story_id)
    known = {e['entity_id']:e for e in current['entities']}
    allowed = [e['name'] for e in current['entities']] + [c['surface'] for c in new_candidates.values()]
    kept = []
    if previous.get('policy') != refreshed.get('policy'):
        return kept
    for decision in previous.get('reviewed_decisions', []):
        cid = decision['candidate_id']
        old, new = old_candidates.get(cid), new_candidates.get(cid)
        if old is None or new is None or cid not in old_machine or cid not in new_machine:
            continue
        if any(old.get(k) != new.get(k) for k in occurrence) or any(old_machine[cid][k] != new_machine[cid][k] for k in semantics):
            continue
        if text[new['start']:new['end']] != new['surface'] or text[new['context_start']:new['context_end']] != new['context']:
            continue
        try:
            validate_provisional_scope(previous, [EntityDecision.model_validate(decision)])
            _validate([EntityDecision.model_validate(decision)], [SimpleNamespace(**new)], text, known, allowed, human=True)
        except ValueError:
            continue
        kept.append(deepcopy(decision))
    return kept
