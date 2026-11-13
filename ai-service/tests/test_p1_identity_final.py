"""H-04/H-05: human provisional identity and exact-pair locks, including real PostgreSQL."""
import hashlib
import json
import uuid
from dataclasses import replace

import pytest

from tests.test_p1_memory_entity_hitl import flow, discover, TENANT
from tests.test_p1_entity_semantics import prepare, homonyms, readback
from domain.models import NarrativeProposal, NarrativeRelation, NarrativeEntity
from domain.errors import OptimisticLockError
from domain.projection import ProjectionError


def scope(audit):
    r = audit['request']
    return hashlib.sha256(json.dumps([r['tenant_id'], r['novel_id'], audit['revision_id'],
        audit['source_hash'], audit['analysis_run_id']], separators=(',', ':')).encode()).hexdigest()


def choices(audit, separate=True):
    decisions = [dict(d) for d in audit['decisions']]
    for i, d in enumerate(decisions):
        if d['verdict'] == 'entity' and not d['canonical_entity_id']:
            d['provisional_identity_key'] = scope(audit) + '/' + (str(i) if separate else 'person')
    return decisions


def submit(f, run, audit, decisions, expected=200):
    response = f.client.post(f'{f.base}/entity-reviews/{run}/review', headers=f.headers,
        json={'expected_version': audit['review_version'], 'decisions': decisions})
    assert response.status_code == expected, response.text
    return response.json().get('data')


def test_h04_new_homonyms_are_distinct_human_identities(flow):
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    frozen = submit(f, run, audit, choices(audit))
    assert len(frozen['entities']) == 2
    ids = {e['entity_id'] for e in frozen['entities']}
    assert len(ids) == 2 and {e['phrase'] for e in frozen['entities']} == {'Minh'}
    assert submit(f, run, audit, choices(audit)) == frozen
    readback(f, run, 'H04-two-new-homonyms-frozen')


def test_h04_ambiguous_new_occurrences_do_not_silently_merge(flow):
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    stored = json.loads(json.dumps(f.repo.get_entity_candidate_audit(f.revision.novel_id, run)))
    before = snapshot(f, 'H04-C-before-ambiguous-review')
    submit(f, run, audit, audit['decisions'], expected=422)
    assert snapshot(f, 'H04-C-after-ambiguous-review') == before
    assert json.loads(json.dumps(f.repo.get_entity_candidate_audit(f.revision.novel_id, run))) == stored
    assert f.client.get(f'{f.base}/entity-candidate-audits/{run}', headers=f.headers).json()['data'] == audit
    assert not f.repo.list_proposals(f.revision.novel_id)
    readback(f, run, 'H04-ambiguous-review-unchanged')


def test_h05_exact_id_locked_subject_does_not_block_homonym(flow):
    f = flow
    run, frozen = homonyms(f)
    a, b = f.llm.ids
    # This durable author lock is A -> A. B -> A is a different identity pair.
    f.repo.override_relation(f.revision.novel_id, a, 'ally', a)
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    brain = f.repo.get_story_brain(f.revision.novel_id)
    locked = next(r for r in brain.relations if r.locked)
    assert locked.metadata['subject_entity_id'] == a and locked.metadata['object_entity_id'] == a
    assert any(r.metadata.get('subject_entity_id') == b and r.metadata.get('object_entity_id') == a
        and r.relation == 'knows' and not r.locked for r in brain.relations)
    readback(f, run, 'H05-exact-lock-and-independent-homonym')


def snapshot(f, stage):
    """Read every affected durable artifact; compare whole rows for negative cases."""
    if not f.engine:
        return f.repo.get_story_brain(f.revision.novel_id)
    from sqlalchemy import text
    value = {}
    with f.engine.connect() as c:
        for table in ('story_brains', 'analysis_runs', 'entities', 'relationships', 'events', 'facts',
                'proposals', 'state_transitions', 'current_entity_states', 'entity_mentions'):
            rows = c.execute(text(f'SELECT * FROM narrative.{table} WHERE tenant_id=:t AND novel_id=:n'),
                {'t':TENANT, 'n':f.revision.novel_id}).mappings()
            value[table] = sorted([dict(r) for r in rows], key=lambda r: str(r.get('id', r.get('entity_id'))))
        value['event_participants'] = [dict(r) for r in c.execute(text('SELECT * FROM narrative.event_participants WHERE event_id IN '
            '(SELECT id FROM narrative.events WHERE tenant_id=:t AND novel_id=:n) ORDER BY event_id,entity_id'),
            {'t':TENANT, 'n':f.revision.novel_id}).mappings()]
    print('IDENTITY_PG_READBACK ' + json.dumps({'stage':stage, 'data':value}, default=str, ensure_ascii=True))
    return value


def test_h04_explicit_same_group_has_one_identity(flow):
    f = prepare(flow, 'Minh gặp Minh. Minh chào Minh.')
    run, audit = discover(f)
    frozen = submit(f, run, audit, choices(audit, separate=False))
    assert len(frozen['entities']) == 1
    assert set(frozen['entities'][0]['candidate_ids']) == {c['candidate_id'] for c in audit['candidates']}
    assert len(frozen['entities'][0]['occurrences']) == 4
    f.llm.ids = [frozen['entities'][0]['entity_id']]
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert len([p for p in proposals if p.proposal_type == 'entity']) == 1
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    assert {e.entity_id for e in f.repo.get_story_brain(f.revision.novel_id).entities} == set(f.llm.ids)
    snapshot(f, 'H04-B-one-explicit-group')


@pytest.mark.parametrize('boundary', ['tenant', 'novel', 'revision', 'hash', 'checkpoint'])
def test_h04_provisional_namespace_cannot_cross_scope(flow, boundary):
    from copy import deepcopy
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    foreign = deepcopy(audit)
    if boundary in ('tenant', 'novel'): foreign['request'][boundary + '_id'] = str(uuid.uuid4())
    elif boundary == 'revision': foreign['revision_id'] = str(uuid.uuid4())
    elif boundary == 'hash': foreign['source_hash'] = '0' * 64
    else: foreign['analysis_run_id'] = str(uuid.uuid4())
    before = snapshot(f, 'H04-F-before-' + boundary)
    submit(f, run, audit, choices(foreign), expected=422)
    assert snapshot(f, 'H04-F-after-' + boundary) == before


@pytest.mark.parametrize('invalid', ['type', 'name', 'status', 'dual', 'uuid', 'rejected'])
def test_h04_invalid_identity_decision_is_atomic(flow, invalid):
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    decisions = choices(audit, separate=False)
    if invalid == 'type': decisions[1]['entity_type'] = 'LOC'
    if invalid == 'name': decisions[1]['canonical_name'] = 'Other'
    if invalid == 'status':
        for d, status in zip(decisions, ['Alive', 'Dead']):
            d.update(initial_status=status, status_quote=f.revision.content)
    if invalid == 'dual': decisions[0]['canonical_entity_id'] = str(uuid.uuid4())
    if invalid == 'uuid':
        decisions[0]['canonical_entity_id'] = str(uuid.uuid4()); decisions[0]['provisional_identity_key'] = ''
    if invalid == 'rejected': decisions[0].update(verdict='not_entity', canonical_name='', entity_type=None)
    before = snapshot(f, 'H04-invalid-before-' + invalid)
    submit(f, run, audit, decisions, expected=422)
    assert snapshot(f, 'H04-invalid-after-' + invalid) == before


def test_h04_refresh_preserves_distinct_groups_and_reserved_ids(flow):
    from tests.test_p1_entity_semantics import add_hint, refresh
    from tests.test_p1_memory_entity_hitl import author_choices
    f = prepare(flow)
    run, audit = discover(f)
    old = submit(f, run, audit, choices(audit))
    add_hint(f)
    fresh = refresh(f, run, old['review_version'])
    assert fresh['preserved_decisions'] == old['reviewed_decisions']
    pending = [d for d in author_choices(fresh) if d['candidate_id'] in fresh['pending_candidate_ids']]
    new = submit(f, run, fresh, pending)
    mapping = lambda a: {e['provisional_identity_key']: (e['entity_id'], e['candidate_ids']) for e in a['entities']}
    assert mapping(old).items() <= mapping(new).items()
    assert len(new['entities']) == 3
    snapshot(f, 'H04-D-refresh-stable-distinct-homonyms')


def test_h04_concurrent_freeze_reuses_winning_assignment(flow):
    if not flow.engine: pytest.skip('Real row-lock concurrency is PostgreSQL-only')
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from application.entity_hitl import review
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    barrier = Barrier(2)
    original = f.repo.save_entity_candidate_audit
    def overlap(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)
    f.repo.save_entity_candidate_audit = overlap
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            values = list(pool.map(lambda _: review(f.service, f.revision.novel_id, run, TENANT, choices(audit), 1), range(2)))
    finally:
        f.repo.save_entity_candidate_audit = original
    assert values[0] == values[1]
    assert len({e['entity_id'] for e in values[0]['entities']}) == 2
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run) == values[0]
    snapshot(f, 'H04-E-one-durable-freeze')


def test_verified_mentions_follow_refreshed_author_mapping(flow):
    if not flow.engine:
        pytest.skip('Durable mention reconciliation requires PostgreSQL')
    from tests.test_p1_entity_semantics import add_hint, refresh
    f = flow
    run, frozen = homonyms(f)
    before = snapshot(f, 'R4-original-finalized')
    assert len(before['entity_mentions']) == 2
    add_hint(f)
    fresh = refresh(f, run, frozen['review_version'])
    waiting = snapshot(f, 'R4-refreshed')
    decisions = [{**d, 'canonical_entity_id': f.llm.ids[1]} if d['verdict'] == 'entity' else d
                 for d in fresh['reviewed_decisions']]
    reviewed = submit(f, run, fresh, decisions)
    after = snapshot(f, 'R4-reassigned')
    assert {str(row['entity_id']) for row in after['entity_mentions']} == {f.llm.ids[1]}
    assert len(after['entity_mentions']) == 2
    assert waiting['entity_mentions'] == []
    assert before['events'] == after['events'] == []
    assert reviewed['brain_version'] == frozen['brain_version']
    assert reviewed['superseded_occurrence_reviews'][0]['entities'] == frozen['entities']
    submit(f, run, fresh, decisions)
    assert snapshot(f, 'R4-identical-replay') == after
    submit(f, run, fresh, frozen['reviewed_decisions'], expected=409)
    assert snapshot(f, 'R4-conflicting-replay') == after


@pytest.mark.parametrize('existing', [True, False])
def test_verified_mentions_survive_only_authorized_rejection_boundary(flow, existing):
    if not flow.engine:
        pytest.skip('Durable mentions require PostgreSQL')
    f = flow
    if existing:
        run, frozen = homonyms(f)
    else:
        prepare(f, 'Minh gặp Minh.')
        run, audit = discover(f)
        frozen = submit(f, run, audit, choices(audit))
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    before = snapshot(f, 'R4-before-rejection')
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert any(p.proposal_type == 'event' for p in proposals)
    result = f.repo.reject_proposal_group(f.revision.novel_id, proposals[0].dependency_group_id,
                                        frozen['brain_version'])
    after = snapshot(f, 'R4-after-rejection')
    assert result['brain_version'] == frozen['brain_version']
    assert len(before['entity_mentions']) == (2 if existing else 0)
    for table in ('entity_mentions', 'entities', 'events', 'facts', 'story_brains'):
        assert after[table] == before[table]


@pytest.mark.parametrize('field,invalid', [('start', -1), ('quote', 'Fake'), ('text_hash', '0' * 64)])
def test_verified_mention_failure_rolls_back_refresh_finalization(flow, monkeypatch, field, invalid):
    if not flow.engine:
        pytest.skip('Durable mention rollback requires PostgreSQL')
    from tests.test_p1_entity_semantics import add_hint, refresh
    f = flow
    run, frozen = homonyms(f)
    add_hint(f)
    fresh = refresh(f, run, frozen['review_version'])
    before = snapshot(f, 'R4-before-invalid-source')
    original = f.repo._persist_reviewed_mentions
    calls = []

    def corrupt_second(session, brain, audit, entity):
        calls.append(entity['entity_id'])
        if len(calls) == 2:
            entity = {**entity, 'occurrences': [{**entity['occurrences'][0], field: invalid}]}
        original(session, brain, audit, entity)

    monkeypatch.setattr(f.repo, '_persist_reviewed_mentions', corrupt_second)
    submit(f, run, fresh, fresh['reviewed_decisions'], expected=422)
    assert len(calls) == 2
    assert snapshot(f, 'R4-after-invalid-source-rollback') == before


def test_verified_mentions_concurrent_replacement_has_one_winner(flow, monkeypatch):
    if not flow.engine:
        pytest.skip('Real row-lock concurrency requires PostgreSQL')
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from application.entity_hitl import review
    from tests.test_p1_entity_semantics import add_hint, refresh
    f = flow
    run, frozen = homonyms(f)
    add_hint(f)
    fresh = refresh(f, run, frozen['review_version'])
    original = f.repo.save_entity_candidate_audit
    barrier = Barrier(2)

    def synchronized(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)

    def finalize(identity):
        decisions = [{**d, 'canonical_entity_id': identity} if d['verdict'] == 'entity' else d
                     for d in fresh['reviewed_decisions']]
        try:
            return review(f.service, f.revision.novel_id, run, TENANT, decisions, fresh['review_version'])
        except OptimisticLockError:
            return None

    monkeypatch.setattr(f.repo, 'save_entity_candidate_audit', synchronized)
    with ThreadPoolExecutor(max_workers=2) as pool:
        winners = [value for value in pool.map(finalize, f.llm.ids) if value is not None]
    assert len(winners) == 1
    winner = winners[0]
    assert winner['review_version'] == fresh['review_version'] + 1
    after = snapshot(f, 'R4-concurrent-finalization-winner')
    assert {str(row['entity_id']) for row in after['entity_mentions']} == {winner['entities'][0]['entity_id']}
    assert len(after['entity_mentions']) == 2
    assert after['events'] == []
    assert after['story_brains'][0]['brain_version'] == frozen['brain_version']


def pending_relationship(f, subject, target, relation='enemy'):
    group, event = str(uuid.uuid4()), str(uuid.uuid4())
    proposals = [NarrativeProposal(event, 'event', {'event_id':event, 'event_type':'meeting',
        'summary':f.revision.content, 'participants':[subject, target], 'chapter':1}, dependency_group_id=group),
        NarrativeProposal(str(uuid.uuid4()), 'fact', {'subject_entity_id':subject, 'fact_key':'mood',
            'fact_value':'calm'}, dependency_group_id=group, materialization_order=1),
        NarrativeProposal(str(uuid.uuid4()), 'state_transition', {'event_id':event, 'entity_id':subject,
            'attribute_key':'active_relationships', 'new_value':{target:relation}}, dependency_group_id=group, materialization_order=2)]
    version = int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version'])
    evidence = {'revision_id':f.revision.revision_id, 'chapter_id':f.revision.chapter_id,
        'text_hash':f.revision.content_hash, 'chapter_number':1, 'quote':f.revision.content,
        'start':0, 'end':len(f.revision.content)}
    proposals = [replace(p, expected_brain_version=version, evidence=(evidence,)) for p in proposals]
    f.repo.save_proposals(f.revision.novel_id, proposals)
    return proposals


@pytest.mark.parametrize('target_side', [False, True])
def test_h05_homonyms_lock_only_exact_pair_and_reload(flow, target_side):
    f = flow
    run, _ = homonyms(f)
    a, b = f.llm.ids
    x = str(uuid.uuid4())
    brain = f.repo.get_story_brain(f.revision.novel_id)
    if f.engine:
        from infrastructure.orm_models import EntityRecord
        with f.repo._session_factory.begin() as session:
            session.add(EntityRecord(id=uuid.UUID(x), story_brain_id=uuid.UUID(brain.metadata['brain_id']),
                tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.revision.novel_id), entity_type='PER',
                canonical_name='Lan', normalized_name='lan', static_attributes={}, source_type='author',
                confirmation_status='confirmed'))
    else:
        f.repo._brains[f.revision.novel_id] = replace(brain, entities=brain.entities+(NarrativeEntity('Lan', x, 'PER'),))
    locked_pair = (x, a) if target_side else (a, x)
    f.repo.override_relation(f.revision.novel_id, locked_pair[0], 'ally', locked_pair[1])
    subject, target = (x, b) if target_side else (b, x)
    proposals = pending_relationship(f, subject, target)
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    brain = f.repo.get_story_brain(f.revision.novel_id)
    assert {(r.metadata['subject_entity_id'], r.metadata['object_entity_id'], r.relation, r.locked)
        for r in brain.relations} == {(*locked_pair, 'ally', True), (subject, target, 'enemy', False)}
    state = brain.current_state
    assert f.repo.rebuild_projection(f.revision.novel_id, 2) == state
    assert f.repo.rebuild_projection(f.revision.novel_id, 2) == state
    again = f.repo.get_story_brain(f.revision.novel_id)
    assert sorted(brain.relations, key=lambda r:r.locked) == sorted(again.relations, key=lambda r:r.locked)
    assert state['relationships'][0]['transition_id'] == proposals[-1].proposal_id
    snapshot(f, 'H05-A-C-E-rebuilt-target-' + str(target_side))


def test_h05_exact_locked_pair_conflict_rolls_back_every_artifact(flow):
    f = flow
    run, _ = homonyms(f)
    a, b = f.llm.ids
    f.repo.override_relation(f.revision.novel_id, a, 'ally', b)
    proposals = pending_relationship(f, a, b)
    before = snapshot(f, 'H05-B-F-before-conflicting-canon')
    with pytest.raises(OptimisticLockError):
        f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    assert snapshot(f, 'H05-B-F-after-conflicting-canon') == before


def test_h05_ambiguous_legacy_lock_is_preserved_without_partial_canon(flow):
    f = flow
    run, _ = homonyms(f)
    brain = f.repo.get_story_brain(f.revision.novel_id)
    if f.engine:
        from infrastructure.orm_models import RelationshipRecord
        with f.repo._session_factory.begin() as s:
            s.add(RelationshipRecord(story_brain_id=uuid.UUID(brain.metadata['brain_id']), tenant_id=uuid.UUID(TENANT),
                novel_id=uuid.UUID(f.revision.novel_id), subject_name='Minh', object_name='Minh',
                relation_type='ally', source_type='author', is_locked=True, relation_metadata={'historical':'preserve'}))
    else:
        f.repo._brains[f.revision.novel_id] = replace(brain, relations=(NarrativeRelation('Minh', 'ally', 'Minh',
            metadata={'historical':'preserve'}, source='author', locked=True),))
    proposals = pending_relationship(f, *f.llm.ids)
    before = snapshot(f, 'H05-D-legacy-before')
    with pytest.raises(ProjectionError):
        f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    assert snapshot(f, 'H05-D-legacy-after') == before
    with pytest.raises(ProjectionError):
        f.repo.override_relation(f.revision.novel_id, *[f.llm.ids[0], 'knows', f.llm.ids[1]])
    assert snapshot(f, 'H05-D-legacy-correction-after') == before


def test_h04_h05_combined_new_homonyms_exact_canon_and_locked_memory(flow):
    f = prepare(flow, 'Minh gặp Minh.')
    f.body['options']['extract_state_transitions'] = True
    run, audit = discover(f)
    frozen = submit(f, run, audit, choices(audit))
    ids = [e['entity_id'] for e in frozen['entities']]
    f.llm.ids = ids
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert len([p for p in proposals if p.proposal_type == 'entity']) == 2
    assert f.repo.get_story_brain(f.revision.novel_id).entities == ()
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version']) == 1
    assert set(next(p for p in proposals if p.proposal_type=='event').payload['participants']) == set(ids)
    assert next(p for p in proposals if p.proposal_type=='fact').payload['subject_entity_id'] == ids[0]
    assert all(p.evidence[0]['revision_id'] == f.revision.revision_id for p in proposals)
    # Existing trusted-service Canon API; public owner/foreign/anonymous guards run in live Gateway suite.
    result = f.client.post('/v1/proposal-groups/' + proposals[0].dependency_group_id + '/accept', headers=f.headers,
        json={'proposal_ids':[p.proposal_id for p in proposals], 'expected_brain_version':1})
    assert result.status_code == 200, result.text
    f.repo.override_relation(f.revision.novel_id, ids[0], 'ally', ids[0])
    later = pending_relationship(f, ids[1], ids[0])
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version']) == 2
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in later], 2)
    state = f.repo.get_current_state(f.revision.novel_id)
    assert f.repo.rebuild_projection(f.revision.novel_id, 3) == state
    brain = f.repo.get_story_brain(f.revision.novel_id)
    assert {e.entity_id for e in brain.entities} == set(ids)
    assert any(r.locked and r.metadata['subject_entity_id'] == ids[0] for r in brain.relations)
    assert any(not r.locked and r.metadata['subject_entity_id'] == ids[1] and r.relation=='enemy' for r in brain.relations)
    snapshot(f, 'COMBINED-empty-to-approved-distinct-identities-and-locks')


@pytest.mark.parametrize('version', [None, 2])
def test_legacy_implicit_new_group_requires_review_without_mutation(flow, version):
    f = prepare(flow, 'Minh gặp Minh.')
    run, audit = discover(f)
    frozen = submit(f, run, audit, choices(audit, separate=False))
    frozen.pop('identity_inventory_version', None)
    if version is not None: frozen['identity_inventory_version'] = version
    for e in frozen['entities']: e.pop('provisional_identity_key', None)
    for d in frozen['reviewed_decisions']: d.pop('provisional_identity_key', None)
    f.repo.save_entity_candidate_audit(f.revision.novel_id, run, frozen, expected_version=frozen['review_version'])
    before = snapshot(f, 'H04-legacy-ambiguous-before-' + str(version))
    response = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert response.status_code == 409, response.text
    assert snapshot(f, 'H04-legacy-ambiguous-after-' + str(version)) == before


def test_new_homonym_aliases_keep_their_explicit_provisional_targets(flow):
    content = 'Minh gọi m. Minh trả lời m.'
    f = prepare(flow, content)
    f.repo.get_story_brain(f.revision.novel_id)
    f.repo.save_entity_guidance(f.revision.novel_id, {'entries':[{'name':'m','kind':'hint'}]}, 0)
    run, audit = discover(f)
    candidates = {c['candidate_id']:c for c in audit['candidates']}
    decisions = choices(audit)
    for d in decisions:
        c = candidates[d['candidate_id']]
        group = 'first' if c['start'] < content.index('Minh', 1) else 'second'
        d.update(verdict='entity', entity_type='PER', canonical_name='Minh',
            provisional_identity_key=scope(audit)+'/'+group,
            identity_quote='Minh gọi m.' if group=='first' else 'Minh trả lời m.')
    frozen = submit(f, run, audit, decisions)
    assert len(frozen['entities']) == 2 and len(frozen['aliases']) == 2
    mapping = {e['provisional_identity_key']:e['entity_id'] for e in frozen['entities']}
    assert all(a['entity_id'] == mapping[a['provisional_identity_key']] for a in frozen['aliases'])
    assert len({a['entity_id'] for a in frozen['aliases']}) == 2
    snapshot(f, 'H04-new-shared-alias-exact-provisional-targets')


@pytest.mark.parametrize('invalid', ['subject', 'target', 'incomplete'])
def test_h05_invalid_lock_identity_metadata_cannot_fall_back_to_names(flow, invalid):
    f = flow
    run, _ = homonyms(f)
    a, b = f.llm.ids
    brain = f.repo.get_story_brain(f.revision.novel_id)
    metadata = {'subject_entity_id':a, 'object_entity_id':b}
    if invalid == 'incomplete': metadata.pop('object_entity_id')
    else: metadata['subject_entity_id' if invalid=='subject' else 'object_entity_id'] = str(uuid.uuid4())
    if f.engine:
        from infrastructure.orm_models import RelationshipRecord
        with f.repo._session_factory.begin() as session:
            session.add(RelationshipRecord(story_brain_id=uuid.UUID(brain.metadata['brain_id']),
                tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.revision.novel_id), subject_name='Minh',
                object_name='Minh', relation_type='ally', source_type='author', is_locked=True, relation_metadata=metadata))
    else:
        f.repo._brains[f.revision.novel_id] = replace(brain, relations=(NarrativeRelation('Minh','ally','Minh',
            source='author', locked=True, metadata=metadata),))
    proposals = pending_relationship(f, a, b)
    before = snapshot(f, 'H05-invalid-metadata-before-' + invalid)
    with pytest.raises(ProjectionError):
        f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    assert snapshot(f, 'H05-invalid-metadata-after-' + invalid) == before


def test_h05_unique_legacy_names_resolve_both_ids_without_losing_lock(flow):
    f = flow
    for name in ('Minh', 'Lan'): f.repo.upsert_entity(f.revision.novel_id, {'name':name,'type':'PER'})
    brain = f.repo.get_story_brain(f.revision.novel_id)
    a, b = (next(e.entity_id for e in brain.entities if e.name == name) for name in ('Minh','Lan'))
    if f.engine:
        from infrastructure.orm_models import RelationshipRecord
        with f.repo._session_factory.begin() as session:
            session.add(RelationshipRecord(story_brain_id=uuid.UUID(brain.metadata['brain_id']),
                tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.revision.novel_id), subject_name='Minh',
                object_name='Lan', relation_type='ally', source_type='author', is_locked=True,
                relation_metadata={'historical':'preserved'}))
    else:
        f.repo._brains[f.revision.novel_id] = replace(brain, relations=(NarrativeRelation('Minh','ally','Lan',
            source='author', locked=True, metadata={'historical':'preserved'}),))
    proposals = pending_relationship(f, a, b, 'ally')
    f.repo.accept_proposal_group(f.revision.novel_id, [p.proposal_id for p in proposals], 1)
    r = next(r for r in f.repo.get_story_brain(f.revision.novel_id).relations if r.locked)
    assert r.metadata == {'historical':'preserved','subject_entity_id':a,'object_entity_id':b}
    f.repo.rebuild_projection(f.revision.novel_id, 2)
    assert next(r for r in f.repo.get_story_brain(f.revision.novel_id).relations if r.locked) == r
    snapshot(f, 'H05-unique-legacy-ID-pair-and-lock-preserved')


@pytest.mark.parametrize('change', ['display_label', 'type'])
def test_reserved_provisional_key_is_identity_not_a_display_label(flow, change):
    from tests.test_p1_entity_semantics import refresh
    f = prepare(flow, 'Minh gọi m. Minh chào m.')
    run, audit = discover(f)
    old = submit(f, run, audit, choices(audit, separate=False))
    f.repo.save_entity_guidance(f.revision.novel_id, {'entries':[{'name':'m','kind':'hint'}]}, 0)
    fresh = refresh(f, run, old['review_version'])
    decisions = [dict(d) for d in fresh['decisions']]
    for d in decisions:
        d.update(canonical_name='m' if change=='display_label' else 'Minh', entity_type='LOC' if change=='type' else 'PER',
            provisional_identity_key=old['entities'][0]['provisional_identity_key'], identity_quote=f.revision.content)
    before = snapshot(f, 'H04-reserved-group-before-' + change)
    frozen = submit(f, run, fresh, decisions, expected=422 if change=='type' else 200)
    if change=='type':
        assert snapshot(f, 'H04-reserved-group-after-type-conflict') == before
    else:
        assert len(frozen['entities']) == 1
        assert frozen['entities'][0]['phrase'] == 'm'
        assert frozen['entities'][0]['entity_id'] == old['entities'][0]['entity_id']
        snapshot(f, 'H04-reserved-ID-survives-human-label-change')
