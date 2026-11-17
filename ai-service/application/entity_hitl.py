"""Revision-bound human checkpoint; only Canon approval materializes its proposals."""
import hashlib
import json
import uuid
from types import SimpleNamespace

from application.ports import ContentHashMismatchError
from application.entity_review_service import registry, review_entities
from application.revision_analysis_service import RevisionAnalysisResult
from core.structured_call import call_structured
from core.exceptions import StateExtractionError
from core.output_language import VIETNAMESE_EVENT_OUTPUT
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


def checkpoint(service, novel_id, run_id, tenant_id, *, check_guidance=True):
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
    if check_guidance and service._repository.get_entity_guidance(novel_id)['version'] != audit['guidance_version']:
        raise OptimisticLockError('Guidance changed; start a new analysis')
    return audit, revision


def review(service, novel_id, run_id, tenant_id, decisions, expected_version, finalize=True):
    audit, revision = checkpoint(service, novel_id, run_id, tenant_id)
    from services.entity_pipeline.verification import EntityDecision
    normalize = lambda values: [EntityDecision.model_validate(d).model_dump() for d in values]
    normalized = normalize(decisions)
    if audit['status'] == 'waiting_entity_review' and not finalize and audit.get('review_finalize') is False:
        if normalize(audit.get('review_submitted_decisions', [])) == normalized and audit.get('review_input_version') == expected_version:
            return audit
    if audit['status'] in {'entities_reviewed', 'completed'}:
        if finalize and normalize(audit.get('review_submitted_decisions', audit.get('reviewed_decisions', []))) == normalized and audit.get('review_input_version') == expected_version:
            if audit['status'] == 'entities_reviewed' and audit.get('identity_inventory_version') is None:
                if any(not e.get('canonical_entity_id') and not e.get('provisional_identity_key')
                        and len(e.get('candidate_ids', [])) > 1 for e in audit['entities']):
                    raise OptimisticLockError('Legacy new identity grouping is ambiguous; start a new author review')
                from copy import deepcopy
                from application.entity_review_service import freeze_inventory
                value = deepcopy(audit)
                value['entities'], value['aliases'] = freeze_inventory(audit, value['entities'], value['aliases'], revision.content)
                value.update(identity_inventory_version=2, review_version=audit['review_version'] + 1,
                    identity_inventory_upgraded_from_version=audit['review_version'])
                service._repository.save_entity_candidate_audit(novel_id, run_id, value, expected_version=audit['review_version'])
                return value
            return audit
        raise OptimisticLockError('Frozen review cannot be replaced')
    try:
        return review_entities(service._repository, novel_id, run_id, normalized, expected_version, revision.content, finalize=finalize)
    except OptimisticLockError:
        current, _ = checkpoint(service, novel_id, run_id, tenant_id)
        if (current.get('review_input_version') == expected_version
                and current.get('review_finalize') == finalize
                and current.get('review_submitted_decisions') == normalized):
            return current
        raise


def refresh(service, novel_id, run_id, tenant_id, expected_version):
    # Only refresh permits changed guidance; all source/Canon/scope fences still apply.
    audit, revision = checkpoint(service, novel_id, run_id, tenant_id, check_guidance=False)
    repo = service._repository
    guidance = repo.get_entity_guidance(novel_id)
    if audit.get('refresh_input_version') == expected_version and audit['guidance_version'] == guidance['version']:
        return audit
    if audit['review_version'] != expected_version or audit['status'] not in {'waiting_entity_review', 'entities_reviewed'}:
        raise OptimisticLockError('Refresh checkpoint changed or downstream extraction already completed')
    if audit['guidance_version'] == guidance['version']:
        raise OptimisticLockError('Save changed guidance before refreshing')
    known = registry(repo, novel_id)
    verified = service._entity_pipeline.run_verified(revision.content, llm_service=service._llm_service,
        known_entities=known['entities'], known_aliases=known['aliases'], guidance=guidance['entries'], defer_materialization=True)
    from application.entity_review_service import carry_decisions
    preserved = carry_decisions(audit, verified.audit, repo, novel_id, revision.content)
    kept_ids = {d['candidate_id'] for d in preserved}
    value = {**verified.audit, 'request': audit['request'], 'analysis_run_id': run_id,
        'revision_id': audit['revision_id'], 'chapter_id': audit['chapter_id'], 'chapter_number': audit['chapter_number'],
        'brain_version': audit['brain_version'], 'guidance_version': guidance['version'],
        'status': 'waiting_entity_review', 'review_version': expected_version + 1,
        'refresh_input_version': expected_version, 'refresh_generation': audit.get('refresh_generation', 0) + 1,
        'preserved_decisions': preserved, 'reviewed_decisions': preserved,
        'pending_candidate_ids': [c['candidate_id'] for c in verified.audit['candidates'] if c['candidate_id'] not in kept_ids],
        'preserved_entities': audit.get('entities') or audit.get('preserved_entities', []), 'entities': [], 'aliases': []}
    from application.entity_review_service import provisional_scope
    value['provisional_identity_scope'] = provisional_scope(value)
    value = json.loads(json.dumps(value))  # Match the durable JSON shape on either CAS path.
    try:
        repo.save_entity_candidate_audit(novel_id, run_id, value, expected_version=expected_version)
    except OptimisticLockError:
        current, _ = checkpoint(service, novel_id, run_id, tenant_id)
        if current.get('refresh_input_version') == expected_version and current['guidance_version'] == guidance['version']:
            return current
        raise
    return value


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
    from application.entity_review_service import provisional_scope
    audit['provisional_identity_scope'] = provisional_scope(audit)
    repository.save_entity_candidate_audit(novel, run.run_id, audit, expected_version=0)
    return RevisionAnalysisResult(run, (), False, 'waiting_entity_review')


# Live retest 4 (Q3): the old one-line instruction gave no granularity, and the model returned one or
# two events for chapters of 1,500 words; most chapters also had no place for their events.
HITL_EVENT_INSTRUCTIONS = (
    'Extract the narrative events of this chapter, in story order, only from this source and the reviewed '
    'inventory. An event is one distinct thing that happens and changes the story: an arrival or departure, '
    'a meeting, a fight, a discovery, a decision, a revelation, an injury or death, a gain or loss of an '
    'item or power. List each such change as its own event; do not merge separate scenes or steps into one '
    'summary. A chapter of about 1,500 words usually has 3 to 8 events; return fewer only when fewer happen, '
    'and never pad with description, mood or dialogue that changes nothing. '
    'participants: reviewed entity_id values of the people, groups or creatures who take part. '
    'locations: reviewed entity_id values of the places where the event happens, when the text names or '
    'clearly implies one from the inventory; otherwise an empty list. '
    'quote: one short exact contiguous sentence or clause copied from the source (under 200 characters) '
    'that shows the event. '
    'Return JSON {"events":[{"event_type":"...","summary":"...","participants":["exact reviewed entity_id"],'
    '"locations":["exact reviewed entity_id"],"consequences":[],"quote":"exact unique source quote"}]}. '
    'No predictions or invented identities. '
    # Live retest 5 (S2): ch. 8 opened by continuing ch. 7's last scene and re-proposed its event.
    'already_recorded_events are approved events from earlier chapters, latest last. When this chapter only '
    'continues, recalls or retells one of them, do not list it again; list it only if it happens anew.'
)

RECORDED_EVENTS_IN_PROMPT = 6


def recorded_events_before(repo, novel_id, chapter):
    """The latest approved events of earlier chapters, as {chapter, summary}, for the event prompt."""
    try:
        events = repo.get_story_brain(novel_id, read_only=True).events
    except TypeError:
        events = repo.get_story_brain(novel_id).events
    earlier = [e for e in events if chapter is None or (e.chapter or 0) < chapter]
    earlier = [e for e in earlier if not (e.metadata or {}).get('is_retired')]
    return [{'chapter': e.chapter, 'summary': e.summary} for e in earlier[-RECORDED_EVENTS_IN_PROMPT:]]


def continue_review(service, novel_id, run_id, tenant_id):
    audit, revision = checkpoint(service, novel_id, run_id, tenant_id)
    repo = service._repository
    run = SimpleNamespace(run_id=run_id)
    if audit['status'] == 'completed':
        return RevisionAnalysisResult(run, tuple(repo.list_proposals(novel_id, analysis_run_id=run_id)), True)
    if audit['status'] != 'entities_reviewed':
        raise OptimisticLockError('Complete entity review before continuing')
    if any(not e.get('canonical_entity_id') and not e.get('provisional_identity_key')
            and len(e.get('candidate_ids', [])) > 1 for e in audit['entities']):
        raise OptimisticLockError('Legacy new identity grouping is ambiguous; start a new author review')
    if audit.get('identity_inventory_version') is None:
        # Existing human approval remains authoritative; upgrade only its storage format.
        try:
            audit = review(service, novel_id, run_id, tenant_id, audit['reviewed_decisions'], audit['review_input_version'])
        except OptimisticLockError:
            audit, revision = checkpoint(service, novel_id, run_id, tenant_id)
            if audit['status'] == 'completed':
                return RevisionAnalysisResult(run, tuple(repo.list_proposals(novel_id, analysis_run_id=run_id)), True)
            if audit['status'] != 'entities_reviewed' or audit.get('identity_inventory_version') != 2:
                raise
    group_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'proposal-group:{run_id}'))
    proposals = []
    dropped_events = 0
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
    from application.reviewed_inventory import ReviewedInventory
    inventory = ReviewedInventory(audit)
    for entity in inventory.entities.values():
        if entity.get('canonical_entity_id'):
            continue
        candidate = next(c for c in audit['candidates'] if c['candidate_id'] in entity['candidate_ids'])
        add('entity', {'entity_id': entity['entity_id'], 'canonical_name': entity['phrase'],
            'normalized_name': entity['phrase'].casefold(), 'entity_type': entity['entity'],
            'initial_status': 'Unknown', 'source_type': 'prose'},
            revision.content[candidate['start']:candidate['end']], entity['score'] / 10,
            span=(candidate['start'], candidate['end']))
    # Live retest 10 (X4): "làng Thạch Khê" was proposed again every chapter although the author had
    # already approved it as an alias of "Thạch Khê". An approved (alias, entity) pair is not proposed.
    seen_aliases = approved_alias_keys(repo, novel_id)
    for alias in audit['aliases']:
        key = (alias['alias'].casefold(), alias['entity_id'])
        if key in seen_aliases:
            continue
        seen_aliases.add(key)
        # A quote equal to the alias occurrence itself (honorific variants, F-LIVE-18) can repeat in
        # the chapter; anchor it at that occurrence instead of searching for a unique match.
        start, end = alias.get('start'), alias.get('end')
        has_span = isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(revision.content)
        quote = alias['identity_quote']
        if (not quote or quote not in revision.content) and has_span:
            # Honorific variants skip the identity-quote check, so a paraphrased model quote can reach
            # here (final live acceptance, chapter 5); the alias occurrence itself is exact evidence.
            quote = revision.content[start:end]
        span = (start, end) if has_span and revision.content[start:end] == quote else None
        # Live retest 8 (V1): a quote repeated elsewhere in the chapter was located in this
        # occurrence's context during verification; use that position instead of a global search.
        qs, qe = alias.get('quote_start'), alias.get('quote_end')
        if span is None and isinstance(qs, int) and isinstance(qe, int) and revision.content[qs:qe] == quote:
            span = (qs, qe)
        add('alias', {'alias': alias['alias'], 'entity_name': alias['entity_name'],
            'entity_id': alias['entity_id']}, quote, alias['confidence'], span=span)
    identity = inventory.resolve
    # Do not reuse the legacy fuzzy participant matcher in the verified path.
    if audit['request']['options'].get('extract_events', True) and inventory:
        raw = call_structured(service._llm_service, operation='hitl_event_extraction',
            system_prompt=VIETNAMESE_EVENT_OUTPUT + HITL_EVENT_INSTRUCTIONS,
            user_prompt=json.dumps({'source_text': revision.content, 'known_entities': inventory.items, 'aliases': audit['aliases'],
                                    'already_recorded_events': recorded_events_before(repo, novel_id, revision.chapter_number)}, ensure_ascii=False))
        from core.structured_outputs import HitlEventBatch
        for event in HitlEventBatch.model_validate_json(raw).events:
            payload = event.model_dump(exclude={'quote'})
            payload['participants'] = [identity(n) for n in event.participants]
            payload['locations'] = [identity(n) for n in event.locations]
            payload['chapter'] = revision.chapter_number
            try:
                add('event', payload, event.quote)
            except ValueError as exc:
                # One event whose quote is not verbatim (final live acceptance, chapter 5) must not
                # fail the chapter; identity errors above still fail closed.
                if 'quote' not in str(exc).lower() and 'offsets' not in str(exc).lower():
                    raise
                # Live retest 2 (R2): chapter 4 lost every event this way. Re-ground the quote to an
                # exact source span (quotes, spacing, one bounded repair call) before giving up.
                from services.source_grounding import resolve_grounded_quote
                try:
                    start, end, verbatim = resolve_grounded_quote(
                        revision.content, event.quote, context_hint=event.summary,
                        llm_service=service._llm_service, max_retries=1)
                    add('event', payload, verbatim, span=(start, end))
                except ValueError as grounding_error:
                    import logging
                    dropped_events += 1
                    logging.getLogger(__name__).warning('Dropped event with an ungrounded quote: %s',
                                                        str(grounding_error)[:120])
    if audit['request']['options'].get('extract_world_rules', False):
        # Live retest 9: facts and world rules (F-LIVE-17) come from one call.
        import hashlib
        from services.chapter_facts import extract_chapter_facts
        from services.world_rule_extraction import known_world_rules
        approved = known_world_rules(getattr(repo.get_story_brain(novel_id), 'facts', ()))
        facts, rules = extract_chapter_facts(revision.content, service._llm_service, inventory.items, approved)
        for fact in facts:
            if fact.certainty != 'confirmed':
                continue
            if fact.subject:
                identity(fact.subject)
            add('fact', {'fact_type': 'narrative_fact', 'fact_key': fact.fact_key,
                'fact_value': fact.fact_value, 'subject_entity_id': identity(fact.subject) if fact.subject else None}, fact.quote, fact.confidence)
        for rule in rules:
            rule_hash = hashlib.sha256(rule['rule'].casefold().encode('utf-8')).hexdigest()[:16]
            add('fact', {'fact_type': 'world_rule', 'fact_key': f'world_rule_{rule_hash}',
                'fact_value': rule['rule'], 'priority': 100}, rule['quote'], rule['confidence'],
                span=(rule['start'], rule['end']))
    if audit['request']['options'].get('extract_state_transitions', False):
        from dataclasses import replace
        from services.state_transition_proposals import generate_chapter_state_transitions
        try:
            by_event = generate_chapter_state_transitions([p for p in proposals if p.proposal_type == 'event'],
                service._llm_service, identity_inventory=inventory.items, identity_resolver=identity)
        except StateExtractionError as exc:
            raise ValueError(str(exc)) from exc
        expanded = []
        for proposal in proposals:
            expanded.append(proposal)
            if proposal.proposal_type == 'event':
                changes = by_event.get(proposal.proposal_id, [])
                for change in changes:
                    identity(change.payload['entity_id'])
                    if change.payload['attribute_key'] == 'active_relationships':
                        if not isinstance(change.payload['new_value'], dict):
                            raise ValueError('Relationship state must be a mapping')
                        for target in change.payload['new_value']:
                            identity(target)
                expanded.extend(changes)
        proposals = [replace(p, materialization_order=i) for i, p in enumerate(expanded)]
    # Recheck source/scope before the atomic checkpoint+proposal transaction.
    checkpoint(service, novel_id, run_id, tenant_id)
    completion = repo.complete_entity_review(novel_id, run_id, audit, proposals)
    return RevisionAnalysisResult(run, completion.proposals, completion.deduplicated,
                                  dropped_events=dropped_events)


def approved_alias_keys(repo, novel_id):
    """(alias casefold, entity_id) pairs the author already approved (live retest 10, X4)."""
    registry = getattr(repo, 'get_entity_registry', None)
    aliases = registry(novel_id).get('aliases', []) if callable(registry) else []
    return {(str(a['alias']).casefold(), str(a['entity_id'])) for a in aliases}
