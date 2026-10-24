"""Author IDE wire contracts: authoritative PostgreSQL readbacks, fake providers only."""
from copy import deepcopy
import json
import uuid

import pytest

from tests.test_p1_memory_entity_hitl import flow, discover, freeze, author_choices, TENANT
from tests.test_p1_identity_final import snapshot as identity_snapshot


def snapshot(f, stage):
    value = identity_snapshot(f, stage)
    if f.engine:
        from sqlalchemy import text
        with f.engine.connect() as c:
            value['proposal_decisions'] = [dict(r) for r in c.execute(text(
                'SELECT d.* FROM narrative.proposal_decisions d JOIN narrative.proposals p ON p.id=d.proposal_id '
                'WHERE p.tenant_id=:t AND p.novel_id=:n ORDER BY d.id'), {'t': TENANT, 'n': f.revision.novel_id}).mappings()]
        print('CONTRACT_PG_READBACK ' + json.dumps({'stage': stage, 'data': value}, default=str, ensure_ascii=True))
    return value


def pending(f):
    run, audit = discover(f)
    freeze(f, run, audit)
    result = f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers)
    assert result.status_code == 200, result.text
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    return proposals


def accept(f, proposals, edits=None, version=1):
    return f.client.post(f'/v1/proposal-groups/{proposals[0].dependency_group_id}/accept',
        headers=f.headers, json={'proposal_ids': [p.proposal_id for p in proposals],
        'expected_brain_version': version, 'edited_payloads': edits or {}})


def test_edited_group_exact_readback_and_retry(flow):
    f = flow
    proposals = pending(f)
    event = next(p for p in proposals if p.proposal_type == 'event')
    fact = next(p for p in proposals if p.proposal_type == 'fact')
    edits = {event.proposal_id: {**event.payload, 'summary': 'Author edited summary'},
        fact.proposal_id: {**fact.payload, 'fact_value': 'Author edited fact'}}
    response = accept(f, proposals, edits)
    assert response.status_code == 200, response.text
    brain = f.repo.get_story_brain(f.revision.novel_id)
    snapshot(f, 'edited-group-readback') if f.engine else None
    assert any(e.summary == 'Author edited summary' for e in brain.events)
    assert any(p.payload == edits[p.proposal_id] for p in brain.proposals if p.proposal_id == fact.proposal_id)
    for original in proposals:
        saved = next(p for p in brain.proposals if p.proposal_id == original.proposal_id)
        assert saved.payload == edits.get(original.proposal_id, original.payload)
        assert saved.evidence == original.evidence
    before = snapshot(f, 'before-retry') if f.engine else brain
    assert accept(f, proposals, edits).status_code == 409
    after = snapshot(f, 'after-retry') if f.engine else f.repo.get_story_brain(f.revision.novel_id)
    assert before == after


@pytest.mark.parametrize('invalid', ['unknown_edit', 'evidence', 'revision_id', 'event_id',
    'foreign_entity', 'invalid_summary', 'empty_edit', 'stale'])
def test_invalid_group_leaves_durable_state_unchanged(flow, invalid):
    f = flow
    proposals = pending(f)
    event = next(p for p in proposals if p.proposal_type == 'event')
    edited = deepcopy(event.payload)
    edits = {event.proposal_id: edited}
    if invalid == 'unknown_edit': edits[str(uuid.uuid4())] = edited
    if invalid == 'evidence': edited['evidence'] = [{'revision_id': str(uuid.uuid4())}]
    if invalid == 'revision_id': edited['revision_id'] = str(uuid.uuid4())
    if invalid == 'event_id': edited['event_id'] = str(uuid.uuid4())
    if invalid == 'foreign_entity': edited['participants'] = [str(uuid.uuid4())]
    if invalid == 'invalid_summary': edited['summary'] = ''
    if invalid == 'empty_edit': edits[event.proposal_id] = {}
    before = snapshot(f, 'before-invalid-' + invalid) if f.engine else f.repo.get_story_brain(f.revision.novel_id)
    response = accept(f, proposals, edits, version=99 if invalid == 'stale' else 1)
    assert response.status_code in ({409} if invalid == 'stale' else {422}), response.text
    after = snapshot(f, 'after-invalid-' + invalid) if f.engine else f.repo.get_story_brain(f.revision.novel_id)
    assert before == after


def test_group_dependency_selection_cannot_be_partial_or_duplicate(flow):
    f = flow
    proposals = pending(f)
    before = snapshot(f, 'dependency-before')
    assert accept(f, proposals[:-1]).status_code == 422
    assert accept(f, proposals + proposals[:1]).status_code == 422
    assert snapshot(f, 'dependency-after') == before


def test_concurrent_edited_acceptance_materializes_once(flow):
    f = flow
    if not f.engine:
        pytest.skip('Authoritative transaction concurrency requires PostgreSQL')
    from concurrent.futures import ThreadPoolExecutor
    proposals = pending(f)
    event = next(p for p in proposals if p.proposal_type == 'event')
    edits = {event.proposal_id: {**event.payload, 'summary': 'Concurrent author edit'}}
    with ThreadPoolExecutor(2) as executor:
        responses = list(executor.map(lambda _: accept(f, proposals, edits), range(2)))
    assert sorted(r.status_code for r in responses) == [200, 409]
    value = snapshot(f, 'concurrent-edited-acceptance')
    assert value['story_brains'][0]['brain_version'] == 2
    assert len(value['proposal_decisions']) == len(proposals)
    assert len(value['events']) == sum(p.proposal_type == 'event' for p in proposals)
    assert any(e['summary'] == 'Concurrent author edit' for e in value['events'])


def test_invalid_late_materialization_rolls_back_edited_group(flow):
    f = flow
    assert accept(f, pending(f)).status_code == 200
    from tests.test_p1_identity_final import pending_relationship
    ids = [e.entity_id for e in f.repo.get_story_brain(f.revision.novel_id).entities]
    proposals = pending_relationship(f, *ids[:2])
    event, _, transition = proposals
    edits = {event.proposal_id: {**event.payload, 'summary': 'Must roll back'},
        transition.proposal_id: {**transition.payload, 'attribute_key': 'health', 'new_value': 999}}
    before = snapshot(f, 'late-materialization-before')
    response = accept(f, proposals, edits, version=2)
    assert response.status_code == 422, response.text
    assert snapshot(f, 'late-materialization-after') == before


def test_real_foreign_novel_identity_cannot_enter_edited_group_or_lock(flow):
    f = flow
    if not f.engine:
        pytest.skip('Foreign durable registry isolation requires PostgreSQL')
    foreign = str(uuid.uuid4())
    from sqlalchemy import text
    try:
        proposal = f.service.create_author_entity(foreign, name='Foreign', entity_type='PER')
        f.repo.accept_proposal_group(foreign, [proposal.proposal_id], 1)
        foreign_brain = f.repo.get_story_brain(foreign)
        foreign_id = foreign_brain.entities[0].entity_id
        proposals = pending(f)
        event = next(p for p in proposals if p.proposal_type == 'event')
        before = snapshot(f, 'foreign-registry-before')
        response = accept(f, proposals, {event.proposal_id: {**event.payload, 'participants': [foreign_id]}})
        assert response.status_code == 422, response.text
        assert snapshot(f, 'foreign-registry-after') == before
        assert f.repo.get_story_brain(foreign) == foreign_brain
        assert accept(f, proposals).status_code == 200
        own_id = f.repo.get_story_brain(f.revision.novel_id).entities[0].entity_id
        before = snapshot(f, 'foreign-lock-before')
        response = f.client.post(f'{f.base}/relationship-locks', headers=f.headers,
            json={'subject_entity_id': own_id, 'object_entity_id': foreign_id,
                'relation_type': 'ally', 'expected_brain_version': 2})
        assert response.status_code == 422, response.text
        assert snapshot(f, 'foreign-lock-after') == before
        assert f.repo.get_story_brain(foreign) == foreign_brain
    finally:
        with f.engine.begin() as c:
            c.execute(text('DELETE FROM narrative.story_brains WHERE novel_id=:n AND tenant_id=:t'), {'n': foreign, 't': TENANT})


def test_author_edit_cannot_bypass_frozen_review_inventory(flow):
    f = flow
    if not f.engine:
        pytest.skip('Frozen inventory transaction guard requires PostgreSQL')
    existing = f.service.create_author_entity(f.revision.novel_id, name='Absent Author', entity_type='PER')
    f.repo.accept_proposal_group(f.revision.novel_id, [existing.proposal_id], 1)
    absent_id = f.repo.get_story_brain(f.revision.novel_id).entities[0].entity_id
    proposals = pending(f)
    event = next(p for p in proposals if p.proposal_type == 'event')
    before = snapshot(f, 'outside-frozen-inventory-before')
    response = accept(f, proposals, {event.proposal_id: {**event.payload, 'participants': [absent_id]}}, version=2)
    assert response.status_code == 422, response.text
    assert snapshot(f, 'outside-frozen-inventory-after') == before


def test_partial_refresh_frozen_projection_does_not_rewrite_checkpoint(flow):
    f = flow
    run, audit = discover(f)
    partial = f.client.post(f'{f.base}/entity-reviews/{run}/review', headers=f.headers,
        json={'expected_version': 1, 'decisions': author_choices(audit)[:1], 'finalize': False})
    assert partial.status_code == 200, partial.text
    value = partial.json()['data']
    assert len(value['reviewed_decisions']) == 1
    assert len(value['pending_candidate_ids']) == len(audit['candidates']) - 1
    saved = deepcopy(f.repo.get_entity_candidate_audit(f.revision.novel_id, run))
    assert f.client.get(f'{f.base}/entity-candidate-audits/{run}', headers=f.headers).json()['data'] == value
    assert f.repo.get_entity_candidate_audit(f.revision.novel_id, run) == saved
    assert f.client.post(f'{f.base}/entity-guidance', headers=f.headers,
        json={'expected_version': 0, 'entries': []}).status_code == 200
    refreshed = f.client.post(f'{f.base}/entity-reviews/{run}/refresh', headers=f.headers,
        json={'expected_version': value['review_version']})
    assert refreshed.status_code == 200, refreshed.text
    refreshed = refreshed.json()['data']
    assert refreshed['reviewed_decisions'] == value['reviewed_decisions']
    assert isinstance(refreshed['known_entities'], list)
    frozen = freeze(f, run, refreshed).json()['data']
    assert frozen['pending_candidate_ids'] == []
    assert f.client.get(f'{f.base}/entity-candidate-audits/{run}', headers=f.headers).json()['data'] == frozen
    snapshot(f, 'partial-refresh-frozen')


@pytest.mark.parametrize('invalid', ['identity', 'chapter', 'version', 'provenance'])
def test_event_correction_rejects_invalid_input_without_proposals(flow, invalid):
    f = flow
    assert accept(f, pending(f)).status_code == 200
    event = f.repo.get_story_brain(f.revision.novel_id).events[0]
    body = {'expected_brain_version': 2, 'replacement': {'event_type': event.event_type,
        'summary': 'Correction', 'participants': list(event.participants)}, 'transitions': []}
    if invalid == 'identity': body['replacement']['participants'] = [str(uuid.uuid4())]
    if invalid == 'chapter': body['replacement']['chapter'] = 987
    if invalid == 'version': body['expected_brain_version'] = 1
    if invalid == 'provenance': body['replacement']['evidence'] = [{'revision_id': str(uuid.uuid4())}]
    before = snapshot(f, 'correction-before-' + invalid)
    response = f.client.post(f'{f.base}/events/{event.event_id}/corrections', json=body, headers=f.headers)
    assert response.status_code == (409 if invalid == 'version' else 422), response.text
    assert snapshot(f, 'correction-after-' + invalid) == before


def test_correction_approved_transitions_and_superseded_event(flow):
    f = flow
    assert accept(f, pending(f)).status_code == 200
    brain = f.repo.get_story_brain(f.revision.novel_id)
    event = brain.events[0]
    entity_id = event.participants[0]
    body = {'expected_brain_version': 2, 'replacement': {'event_type': event.event_type,
        'summary': 'Author correction', 'participants': list(event.participants)},
        'transitions': [{'entity_id': entity_id, 'attribute_key': 'health', 'new_value': 95}]}
    original = f.client.get(f'{f.base}/memory', headers=f.headers).json()
    response = f.client.post(f'{f.base}/events/{event.event_id}/corrections', json=body, headers=f.headers)
    assert response.status_code == 201, response.text
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json() == original
    proposals = [p for p in f.repo.list_proposals(f.revision.novel_id) if p.status.value == 'pending']
    assert accept(f, proposals, version=2).status_code == 200
    memory = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert not any(e['event_id'] == event.event_id for e in memory['events'])
    assert not any(t.get('event_id') == event.event_id for t in memory['transitions'])
    assert any(t['entity_id'] == entity_id and t['new_value'] == 95 for t in memory['transitions'])
    before = snapshot(f, 'superseded-before')
    response = f.client.post(f'{f.base}/events/{event.event_id}/corrections',
        json={**body, 'expected_brain_version': 3}, headers=f.headers)
    assert response.status_code == 422
    assert snapshot(f, 'superseded-after') == before


def test_initial_review_and_memory_contract(flow):
    f = flow
    run, audit = discover(f)
    assert audit['review_schema_version'] == 1
    assert audit['reviewed_decisions'] == []
    assert audit['known_entities'] == []
    assert set(audit['pending_candidate_ids']) == {c['candidate_id'] for c in audit['candidates']}
    freeze(f, run, audit)
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    proposals = f.repo.list_proposals(f.revision.novel_id, analysis_run_id=run)
    assert accept(f, proposals).status_code == 200
    memory = f.client.get(f'{f.base}/memory', headers=f.headers).json()['data']
    assert 'transitions' in memory
    assert memory['transitions'] == list(f.repo.get_story_brain(f.revision.novel_id).transitions)
    complete = f.client.get(f'{f.base}/entity-candidate-audits/{run}', headers=f.headers).json()['data']
    assert complete['pending_candidate_ids'] == []
    assert {e['entity_id'] for e in complete['known_entities']} == {e['entity_id'] for e in memory['entities']}


def test_author_relationship_lock_exact_pair_and_cas(flow):
    f = flow
    if not f.engine:
        pytest.skip('Public relationship mutation requires PostgreSQL')
    proposals = pending(f)
    assert accept(f, proposals).status_code == 200
    from sqlalchemy import text
    with f.engine.begin() as c:
        c.execute(text("UPDATE narrative.entities SET canonical_name='Minh', normalized_name='minh' WHERE novel_id=:n"), {'n': f.revision.novel_id})
    brain = f.repo.get_story_brain(f.revision.novel_id)
    a, b = [e.entity_id for e in brain.entities][:2]
    before_ambiguous = snapshot(f, 'ambiguous-correction-before')
    response = f.client.post(f'{f.base}/events/{brain.events[0].event_id}/corrections', headers=f.headers,
        json={'expected_brain_version': 2, 'replacement': {'event_type': 'meeting',
            'summary': 'Ambiguous identity', 'participants': ['Minh']}})
    assert response.status_code == 422, response.text
    assert snapshot(f, 'ambiguous-correction-after') == before_ambiguous
    payload = {'subject_entity_id': a, 'object_entity_id': b,
        'relation_type': 'ally', 'expected_brain_version': 2}
    result = f.client.post(f'{f.base}/relationship-locks', json=payload, headers=f.headers)
    assert result.status_code == 200, result.text
    assert result.json()['data']['brain_version'] == 3
    locked = next(r for r in f.repo.get_story_brain(f.revision.novel_id).relations if r.locked)
    assert locked.metadata['subject_entity_id'] == a and locked.metadata['object_entity_id'] == b
    before = snapshot(f, 'locked-before-retry')
    assert f.client.post(f'{f.base}/relationship-locks', json=payload, headers=f.headers).status_code == 409
    assert snapshot(f, 'locked-after-retry') == before
    for change in ({'object_entity_id': str(uuid.uuid4())}, {'subject_entity_id': 'Minh'}):
        response = f.client.post(f'{f.base}/relationship-locks', json={**payload,
            'expected_brain_version': 3, **change}, headers=f.headers)
        assert response.status_code == 422, response.text
        assert snapshot(f, 'locked-invalid-target') == before
    for headers in ({}, {**f.headers, 'X-Tenant-Id': str(uuid.uuid4())}):
        response = f.client.post(f'{f.base}/relationship-locks', json=payload, headers=headers)
        assert response.status_code in (401, 403)
        assert snapshot(f, 'locked-invalid-scope') == before
    response = f.client.post(f'{f.base}/relationship-locks', json={**payload,
        'subject_entity_id': b, 'object_entity_id': a, 'expected_brain_version': 3}, headers=f.headers)
    assert response.status_code == 200, response.text
    brain = f.repo.get_story_brain(f.revision.novel_id)
    assert {(r.metadata['subject_entity_id'], r.metadata['object_entity_id']) for r in brain.relations if r.locked} == {(a, b), (b, a)}
    state = f.repo.rebuild_projection(f.revision.novel_id, 4)
    assert f.repo.get_story_brain(f.revision.novel_id).relations == brain.relations
    assert f.repo.rebuild_projection(f.revision.novel_id, 4) == state
    from infrastructure.orm_models import RelationshipRecord
    with f.repo._session_factory.begin() as session:
        session.add(RelationshipRecord(story_brain_id=uuid.UUID(brain.metadata['brain_id']),
            tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.revision.novel_id),
            subject_name='Minh', object_name='Minh', relation_type='historical', source_type='author',
            is_locked=True, relation_metadata={'historical': 'preserve'}))
    before = snapshot(f, 'legacy-ambiguous-lock-before')
    response = f.client.post(f'{f.base}/relationship-locks', json={**payload,
        'expected_brain_version': 4}, headers=f.headers)
    assert response.status_code == 422, response.text
    assert snapshot(f, 'legacy-ambiguous-lock-after') == before
