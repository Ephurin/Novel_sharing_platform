"""C-01: all acceptance paths must commit the exact persisted dependency group."""
from concurrent.futures import ThreadPoolExecutor
import uuid

import pytest

from tests.test_p1_memory_entity_hitl import flow
from tests.test_p1_contract_alignment import pending, accept, snapshot
from domain.errors import OptimisticLockError, ProposalAlreadyDecidedError
from domain.projection import ProjectionError

pytestmark = [pytest.mark.postgres_integration,
    pytest.mark.parametrize('flow', ['postgres'], indirect=True)]


def group(f):
    f.body['options']['extract_state_transitions'] = True
    proposals = pending(f)
    assert {'entity', 'event', 'fact', 'state_transition'} <= {p.proposal_type for p in proposals}
    return proposals


def single(f, p, edited=True, version=1):
    body = {'expected_brain_version': version}
    if edited:
        body['edited_payload'] = p.payload
    return f.client.post(f'/v1/proposals/{p.proposal_id}/' + ('edit-and-accept' if edited else 'accept'),
        json=body, headers=f.headers)


@pytest.mark.parametrize('entry', ['edited_http', 'plain_http', 'service', 'repository', 'decision'])
def test_c01_partial_paths_cannot_mutate_canon(flow, entry):
    f = flow
    proposals = group(f)
    entity = next(p for p in proposals if p.proposal_type == 'entity')
    before = snapshot(f, 'C01-partial-before-' + entry)
    if entry.endswith('http'):
        response = single(f, entity, edited=entry == 'edited_http')
        snapshot(f, 'C01-partial-response-' + entry)
        assert response.status_code == 422, response.text
        assert 'complete dependency group' in response.text.lower()
    else:
        try:
            with pytest.raises(ProjectionError, match='complete dependency group'):
                if entry == 'service':
                    f.client.app.state.narrative_service.accept_proposal_by_id(entity.proposal_id, 1)
                elif entry == 'repository':
                    f.repo.accept_proposal_group(f.revision.novel_id, [entity.proposal_id], 1)
                else:
                    f.repo.decide_proposal(f.revision.novel_id, entity.proposal_id, accepted=True)
        finally:
            snapshot(f, 'C01-partial-result-' + entry)
    assert snapshot(f, 'C01-partial-after-' + entry) == before
    assert accept(f, proposals).status_code == 200  # Rejection preserved a fully usable group.


def test_c01_complete_edited_group_commits_once(flow):
    f = flow
    proposals = group(f)
    event = next(p for p in proposals if p.proposal_type == 'event')
    fact = next(p for p in proposals if p.proposal_type == 'fact')
    edits = {event.proposal_id: {**event.payload, 'summary': 'C01 exact author summary'},
        fact.proposal_id: {**fact.payload, 'fact_value': 'C01 exact author fact'}}
    assert accept(f, proposals, edits).status_code == 200
    brain = f.repo.get_story_brain(f.revision.novel_id)
    assert int(brain.metadata['brain_version']) == 2
    assert all(p.status.value == 'accepted' and p.payload == edits.get(p.proposal_id,
        next(o.payload for o in proposals if o.proposal_id == p.proposal_id)) for p in brain.proposals)
    assert any(e.summary == 'C01 exact author summary' for e in brain.events)
    assert any(v['fact_value'] == 'C01 exact author fact' for v in brain.facts)
    before = snapshot(f, 'C01-complete-before-retry')
    assert accept(f, proposals, edits).status_code == 409
    assert snapshot(f, 'C01-complete-after-retry') == before


@pytest.mark.parametrize('edited', [False, True])
def test_c01_genuine_singleton_still_materializes(flow, edited):
    f = flow
    proposal = f.service.create_author_entity(f.revision.novel_id, name='Standalone Minh', entity_type='PER')
    response = single(f, proposal, edited=edited)
    assert response.status_code == 200, response.text
    brain = f.repo.get_story_brain(f.revision.novel_id)
    assert int(brain.metadata['brain_version']) == 2
    assert len(brain.entities) == 1 and brain.entities[0].name == 'Standalone Minh'
    assert brain.proposals[0].status.value == 'accepted'
    snapshot(f, 'C01-singleton-' + str(edited))


@pytest.mark.parametrize('ordering', ['single_first', 'group_first', 'overlap'])
def test_c01_overlapping_paths_cannot_split_group(flow, ordering):
    f = flow
    proposals = group(f)
    entity = next(p for p in proposals if p.proposal_type == 'entity')
    if ordering == 'overlap':
        with ThreadPoolExecutor(2) as pool:
            a = pool.submit(single, f, entity)
            b = pool.submit(accept, f, proposals)
            partial, complete = a.result(), b.result()
    elif ordering == 'single_first':
        partial, complete = single(f, entity), accept(f, proposals)
    else:
        complete, partial = accept(f, proposals), single(f, entity)
    value = snapshot(f, 'C01-overlapping-' + ordering)
    assert partial.status_code in (409, 422), partial.text
    assert complete.status_code == 200, complete.text
    assert value['story_brains'][0]['brain_version'] == 2
    assert len(value['proposal_decisions']) == len(proposals)
    assert all(p['status'] == 'accepted' for p in value['proposals'])


@pytest.mark.parametrize('invalid', ['duplicate', 'mixed', 'wrong_novel', 'wrong_tenant', 'stale', 'decided_omitted'])
def test_c01_repository_rejects_invalid_selection_without_mutation(flow, invalid):
    f = flow
    proposals = group(f)
    ids = [p.proposal_id for p in proposals]
    repo, novel, version = f.repo, f.revision.novel_id, 1
    if invalid == 'duplicate': ids += ids[:1]
    if invalid == 'mixed':
        extra = f.service.create_author_entity(novel, name='Independent', entity_type='PER')
        ids.append(extra.proposal_id)
    if invalid == 'wrong_novel': novel = str(uuid.uuid4())
    if invalid == 'wrong_tenant':
        from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
        repo = PostgresNarrativeRepository(f.repo._session_factory, tenant_id=str(uuid.uuid4()), actor_id=str(f.repo._actor_id))
    if invalid == 'stale': version = 99
    if invalid == 'decided_omitted':
        fact = next(p for p in proposals if p.proposal_type == 'fact')
        f.repo.decide_proposal(novel, fact.proposal_id, accepted=False)
        ids.remove(fact.proposal_id)
    before = snapshot(f, 'C01-invalid-before-' + invalid)
    try:
        with pytest.raises((ProjectionError, ValueError, KeyError, OptimisticLockError, ProposalAlreadyDecidedError)):
            repo.accept_proposal_group(novel, ids, version)
    finally:
        snapshot(f, 'C01-invalid-result-' + invalid)
    assert snapshot(f, 'C01-invalid-after-' + invalid) == before
