"""Author IDE wire contracts: authoritative PostgreSQL readbacks, fake providers only."""
from copy import deepcopy
import json
import uuid

import pytest

from tests.test_p1_memory_entity_hitl import flow, discover, freeze
from tests.test_p1_identity_final import snapshot


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
    'foreign_entity', 'invalid_summary', 'stale'])
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
    before = snapshot(f, 'before-invalid-' + invalid) if f.engine else f.repo.get_story_brain(f.revision.novel_id)
    response = accept(f, proposals, edits, version=99 if invalid == 'stale' else 1)
    assert response.status_code in ({409} if invalid == 'stale' else {422}), response.text
    after = snapshot(f, 'after-invalid-' + invalid) if f.engine else f.repo.get_story_brain(f.revision.novel_id)
    assert before == after


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
