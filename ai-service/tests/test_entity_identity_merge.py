import uuid

import pytest

from domain.models import NarrativeProposal
from tests.test_p1_memory_entity_hitl import flow


def test_merge_preserves_aliases_and_rewrites_event_and_relationship_identity(flow):
    f = flow
    novel = f.revision.novel_id
    for name in ['Amane', 'Fujiyama Amane', 'Mahiru']:
        f.repo.upsert_entity(novel, {'name': name, 'type': 'PER'})
    ids = {e.name: e.entity_id for e in f.repo.list_entities(novel)}
    group = str(uuid.uuid4())
    proposals = [NarrativeProposal(str(uuid.uuid4()), 'event', {
        'participants': ['Amane', 'Fujiyama Amane'], 'summary': 'Amane speaks.', 'event_type': 'interaction', 'chapter': 1
    }, dependency_group_id=group)]
    f.repo.save_proposals(novel, proposals)
    f.repo.accept_proposal_group(novel, [p.proposal_id for p in proposals], 1)
    f.repo.override_relation(novel, ids['Amane'], 'friend', ids['Mahiru'])
    version = int(f.repo.get_story_brain(novel).metadata['brain_version'])
    response = f.client.post(f'/v1/story-brains/{novel}/entities/merge', headers=f.headers,
        json={'source_entity_id': ids['Amane'], 'target_entity_id': ids['Fujiyama Amane'], 'expected_brain_version': version})
    assert response.status_code == 200, response.text
    brain = f.repo.get_story_brain(novel)
    assert {e.name for e in brain.entities} == {'Fujiyama Amane', 'Mahiru'}
    assert any(a.alias == 'Amane' and a.entity_id == ids['Fujiyama Amane'] for a in brain.aliases)
    assert list(brain.events[0].participants) == ['Fujiyama Amane']
    assert brain.events[0].summary == 'Amane speaks.'
    friend = next(r for r in brain.relations if r.relation == 'friend')
    assert friend.subject == 'Fujiyama Amane'
    assert friend.metadata['subject_entity_id'] == ids['Fujiyama Amane']
    assert friend.metadata['object_entity_id'] == ids['Mahiru']
    assert int(brain.metadata['brain_version']) == version + 1


def test_merge_rejects_different_entity_types_without_mutation(flow):
    f = flow
    novel = f.revision.novel_id
    f.repo.upsert_entity(novel, {'name': 'Amane', 'type': 'PER'})
    f.repo.upsert_entity(novel, {'name': 'Tokyo', 'type': 'LOC'})
    before = f.repo.get_story_brain(novel)
    with pytest.raises(ValueError, match='same type'):
        f.repo.merge_entities(novel, before.entities[0].entity_id, before.entities[1].entity_id, 1)
    assert f.repo.get_story_brain(novel) == before
