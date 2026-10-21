"""Human entity checkpoint. No candidate or guidance is canonical memory."""
from copy import deepcopy
from types import SimpleNamespace

from domain.errors import OptimisticLockError
from services.entity_pipeline.candidates import same_name
from services.entity_pipeline.verification import EntityDecision, _validate, _materializable


TYPE_MAP = {'character': 'PER', 'person': 'PER', 'location': 'LOC', 'place': 'LOC',
            'item': 'ITEM', 'object': 'ITEM', 'organization': 'ORG', 'skill': 'SKILL'}


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


def review_entities(repository, story_id, run_id, decisions, expected_version, text):
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
    parsed = [EntityDecision.model_validate(d) for d in decisions]
    if any(d.verdict == 'unresolved' for d in parsed):
        raise ValueError('Resolve or reject every candidate before continuing')
    current = registry(repository, story_id)
    known = {e['entity_id']: e for e in current['entities']}
    allowed = [e['name'] for e in current['entities']] + [c.surface for c in candidates]
    _validate(parsed, candidates, text, known, allowed)
    # Author decisions can reject false occurrences without declaring the name absent everywhere.
    entities, aliases = _materializable(candidates, [d.model_dump() for d in parsed], known, text)
    value = {**deepcopy(audit), 'status': 'entities_reviewed', 'review_version': expected_version + 1,
             'reviewed_decisions': [d.model_dump() for d in parsed], 'entities': entities, 'aliases': aliases}
    repository.save_entity_candidate_audit(story_id, run_id, value, expected_version=expected_version)
    return value
