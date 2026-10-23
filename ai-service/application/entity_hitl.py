"""Revision-bound human checkpoint; only Canon approval materializes its proposals."""
import hashlib
import json
import uuid
from types import SimpleNamespace

from application.ports import ContentHashMismatchError
from application.entity_review_service import registry, review_entities
from application.revision_analysis_service import RevisionAnalysisResult
from core.structured_call import call_structured
from domain.errors import OptimisticLockError
from services.source_grounding import quote_span


def scoped(service, tenant_id):
    configured = getattr(service._repository, '_tenant_id', None)
    if configured is not None and str(configured) != str(tenant_id):
        raise PermissionError('Tenant does not match repository scope')


def revision_for(service, request):
    scoped(service, request['tenant_id'])
    revision = service._revision_provider.get_revision(**{k: request[k] for k in
        ('tenant_id', 'novel_id', 'chapter_id', 'revision_id')})
    if (revision.novel_id, revision.chapter_id, revision.revision_id) != (
            request['novel_id'], request['chapter_id'], request['revision_id']):
        raise ValueError('Revision identity mismatch')
    if hashlib.sha256(revision.content.encode()).hexdigest() != request['content_hash'] or revision.content_hash != request['content_hash']:
        raise ContentHashMismatchError(revision.revision_id)
    if revision.chapter_number is None:
        raise ValueError('Immutable chapter number is required')
    return revision


def checkpoint(service, novel_id, run_id, tenant_id):
    scoped(service, tenant_id)
    audit = service._repository.get_entity_candidate_audit(novel_id, run_id)
    if not audit:
        raise KeyError(run_id)
    request = audit['request']
    if request['tenant_id'] != tenant_id or request['novel_id'] != novel_id:
        raise PermissionError('Checkpoint scope mismatch')
    revision = revision_for(service, request)
    brain = service._repository.get_story_brain(novel_id)
    if int(brain.metadata.get('brain_version', 1)) != audit['brain_version']:
        raise OptimisticLockError('Canon changed; start a new analysis')
    if service._repository.get_entity_guidance(novel_id)['version'] != audit['guidance_version']:
        raise OptimisticLockError('Guidance changed; start a new analysis')
    return audit, revision


def review(service, novel_id, run_id, tenant_id, decisions, expected_version):
    audit, revision = checkpoint(service, novel_id, run_id, tenant_id)
    from services.entity_pipeline.verification import EntityDecision
    normalized = [EntityDecision.model_validate(d).model_dump() for d in decisions]
    if audit['status'] in {'entities_reviewed', 'completed'}:
        if audit.get('reviewed_decisions') == normalized and audit.get('review_input_version') == expected_version:
            return audit
        raise OptimisticLockError('Frozen review cannot be replaced')
    return review_entities(service._repository, novel_id, run_id, normalized, expected_version, revision.content)


def analyze(service, **request):
    revision = revision_for(service, request)
    if not request['options'].get('extract_entities', True):
        raise ValueError('Entity review is required when verification is enabled')
    repository = service._repository
    novel = request['novel_id']
    digest = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
    run = repository.get_or_create_analysis_run(novel,
        idempotency_key=f"{request['tenant_id']}:{request['idempotency_key']}",
        input_hash=digest, operation=request['operation'], pipeline_version='entity-human-review-v1')
    audit = repository.get_entity_candidate_audit(novel, run.run_id)
    if audit:
        checkpoint(service, novel, run.run_id, request['tenant_id'])
        proposals = repository.list_proposals(novel, analysis_run_id=run.run_id)
        return RevisionAnalysisResult(run, tuple(proposals), True, audit['status'])
    brain = repository.get_story_brain(novel)
    guidance = repository.get_entity_guidance(novel)
    known = registry(repository, novel)
    verified = service._entity_pipeline.run_verified(revision.content,
        llm_service=service._llm_service, known_entities=known['entities'],
        known_aliases=known['aliases'], guidance=guidance['entries'], defer_materialization=True)
    audit = {**verified.audit, 'request': request, 'analysis_run_id': run.run_id,
        'revision_id': revision.revision_id, 'chapter_id': revision.chapter_id,
        'chapter_number': revision.chapter_number, 'brain_version': int(brain.metadata.get('brain_version', 1)),
        'guidance_version': guidance['version'], 'review_version': 1,
        'status': 'waiting_entity_review', 'entities': [], 'aliases': []}
    repository.save_entity_candidate_audit(novel, run.run_id, audit, expected_version=0)
    return RevisionAnalysisResult(run, (), False, 'waiting_entity_review')


def continue_review(service, novel_id, run_id, tenant_id):
    audit, revision = checkpoint(service, novel_id, run_id, tenant_id)
    repo = service._repository
    run = SimpleNamespace(run_id=run_id)
    if audit['status'] == 'completed':
        return RevisionAnalysisResult(run, tuple(repo.list_proposals(novel_id, analysis_run_id=run_id)), True)
    if audit['status'] != 'entities_reviewed':
        raise OptimisticLockError('Complete entity review before continuing')
    group_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'proposal-group:{run_id}'))
    proposals = []
    def add(kind, payload, quote, confidence=1.0, span=None):
        start, end = span if span is not None else quote_span(revision.content, quote)
        if not 0 <= start < end <= len(revision.content) or revision.content[start:end] != quote:
            raise ValueError('Evidence offsets do not match immutable source')
        evidence = {'revision_id': revision.revision_id, 'chapter_id': revision.chapter_id,
            'chapter_number': revision.chapter_number, 'text_hash': revision.content_hash,
            'start': start, 'end': end, 'quote': quote}
        payload = {**payload, 'chapter_number': revision.chapter_number}
        proposals.append(service._proposal(run, group_id, kind, payload, evidence,
            confidence, audit['brain_version'], len(proposals)))
    inventory = {e['phrase']: e for e in audit['entities']}
    for name, entity in inventory.items():
        if entity.get('canonical_entity_id'):
            continue
        # Explicit occurrence offsets also support repeated identical source phrases.
        candidate = next(c for c in audit['candidates'] if c['candidate_id'] in entity['candidate_ids'])
        add('entity', {'canonical_name': name, 'normalized_name': name.casefold(),
            'entity_type': entity['entity'], 'initial_status': 'Unknown', 'source_type': 'prose'},
            revision.content[candidate['start']:candidate['end']], entity['score'] / 10,
            span=(candidate['start'], candidate['end']))
    for alias in audit['aliases']:
        add('alias', {'alias': alias['alias'], 'entity_name': alias['entity_name'],
            'entity_id': alias['entity_id']}, alias['identity_quote'], alias['confidence'])
    aliases = {a['alias']: a['entity_name'] for a in audit['aliases']}
    def identity(name):
        name = aliases.get(name, name)
        if name not in inventory:
            raise ValueError('Downstream identity is outside the reviewed inventory')
        return name
    # Do not reuse the legacy fuzzy participant matcher in the verified path.
    if audit['request']['options'].get('extract_events', True) and inventory:
        raw = call_structured(service._llm_service, operation='hitl_event_extraction',
            system_prompt='Extract narrative events only from this source and the reviewed inventory. Return JSON {"events":[{"event_type":"...","summary":"...","participants":["exact name"],"locations":[],"consequences":[],"quote":"exact unique source quote"}]}. No predictions or invented identities.',
            user_prompt=json.dumps({'source_text': revision.content, 'known_entities': list(inventory), 'aliases': aliases}, ensure_ascii=False))
        from pydantic import BaseModel, ConfigDict, Field
        class Event(BaseModel):
            model_config = ConfigDict(extra='forbid')
            event_type: str = Field(min_length=1)
            summary: str = Field(min_length=1)
            participants: list[str]
            locations: list[str] = []
            consequences: list[str] = []
            quote: str = Field(min_length=1)
        class Events(BaseModel):
            events: list[Event]
        for event in Events.model_validate_json(raw).events:
            payload = event.model_dump(exclude={'quote'})
            payload['participants'] = [identity(n) for n in event.participants]
            payload['locations'] = [identity(n) for n in event.locations]
            payload['chapter'] = revision.chapter_number
            add('event', payload, event.quote)
    if audit['request']['options'].get('extract_world_rules', False):
        from services.prose_facts import extract_prose_facts
        for fact in extract_prose_facts(revision.content, service._llm_service, inventory):
            if fact.certainty != 'confirmed':
                continue
            if fact.subject:
                identity(fact.subject)
            add('fact', {'fact_type': 'narrative_fact', 'fact_key': fact.fact_key,
                'fact_value': fact.fact_value, 'subject_entity_name': identity(fact.subject) if fact.subject else None}, fact.quote, fact.confidence)
    if audit['request']['options'].get('extract_state_transitions', False):
        from dataclasses import replace
        from services.state_transition_proposals import generate_state_transition_proposals
        expanded = []
        for proposal in proposals:
            expanded.append(proposal)
            if proposal.proposal_type == 'event':
                changes = generate_state_transition_proposals(proposal, service._llm_service)
                for change in changes:
                    identity(change.payload['entity_id'])
                    if change.payload['attribute_key'] == 'active_relationships':
                        if not isinstance(change.payload['new_value'], dict):
                            raise ValueError('Relationship state must be a mapping')
                        for target in change.payload['new_value']:
                            identity(target)
                expanded.extend(changes)
        proposals = [replace(p, materialization_order=i) for i, p in enumerate(expanded)]
    repo.record_revision_provenance(story_id=novel_id, chapter_id=revision.chapter_id,
        revision_id=revision.revision_id, chapter_number=revision.chapter_number)
    # Recheck source/scope before the atomic checkpoint+proposal transaction.
    checkpoint(service, novel_id, run_id, tenant_id)
    proposals = repo.complete_entity_review(novel_id, run_id, audit, proposals)
    return RevisionAnalysisResult(run, tuple(proposals), False)
