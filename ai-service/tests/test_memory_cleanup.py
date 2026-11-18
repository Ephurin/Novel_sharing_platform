"""Demo walkthrough 2026-11-18: the author removes a wrong entity or corrects / removes a fact after
approval. Nothing is deleted: history stays, and events that still name a removed entity are kept."""
import uuid

from domain.models import NarrativeProposal
from tests.test_p1_memory_entity_hitl import flow  # noqa: F401  (fixture: in-memory and PostgreSQL)


def _version(f):
    return int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version'])


def _memory(f):
    response = f.client.get(f'{f.base}/memory', headers=f.headers)
    assert response.status_code == 200, response.text
    return response.json()['data']


def _seed(f):
    novel = f.revision.novel_id
    for name, kind in [('Amane', 'PER'), ('Quỷ Môn Quan', 'LOC')]:
        f.repo.upsert_entity(novel, {'name': name, 'type': kind})
    ids = {e.name: e.entity_id for e in f.repo.list_entities(novel)}
    group = str(uuid.uuid4())
    proposals = [
        NarrativeProposal(str(uuid.uuid4()), 'event', {'participants': [ids['Amane'], ids['Quỷ Môn Quan']],
            'summary': 'Amane đứng trước Quỷ Môn Quan.', 'event_type': 'discovery', 'chapter': 1}, dependency_group_id=group),
        NarrativeProposal(str(uuid.uuid4()), 'fact', {'subject_entity_id': ids['Amane'], 'fact_key': 'hair_color',
            'fact_value': 'silver'}, dependency_group_id=group, materialization_order=1)]
    f.repo.save_proposals(novel, proposals)
    f.repo.accept_proposal_group(novel, [p.proposal_id for p in proposals], _version(f))
    return ids


def test_retired_entity_leaves_lists_but_events_keep_naming_it(flow):
    f = flow
    ids = _seed(f)
    version = _version(f)
    response = f.client.post(f"{f.base}/entities/{ids['Quỷ Môn Quan']}/retire", headers=f.headers,
                             json={'expected_brain_version': version, 'reason': 'thành ngữ, không phải địa danh'})
    assert response.status_code == 200, response.text
    assert response.json()['data']['brain_version'] == version + 1

    memory = _memory(f)
    retired = next(e for e in memory['entities'] if e['entity_id'] == ids['Quỷ Môn Quan'])
    assert retired['is_retired'] is True
    assert not next(e for e in memory['entities'] if e['entity_id'] == ids['Amane'])['is_retired']
    # The event is kept and still names the removed entity, so the UI can flag it for the author.
    assert any(ids['Quỷ Môn Quan'] in e['participants'] for e in memory['events'])
    # Entity review no longer offers it.
    registry = f.repo.get_entity_registry(f.revision.novel_id)
    assert ids['Quỷ Môn Quan'] not in {e['entity_id'] for e in registry['entities']}

    again = f.client.post(f"{f.base}/entities/{ids['Quỷ Môn Quan']}/retire", headers=f.headers,
                          json={'expected_brain_version': version + 1})
    assert again.status_code == 400
    stale = f.client.post(f"{f.base}/entities/{ids['Amane']}/retire", headers=f.headers,
                          json={'expected_brain_version': version})
    assert stale.status_code == 409


def test_fact_can_be_corrected_then_removed_with_history_kept(flow):
    f = flow
    ids = _seed(f)
    old = next(x for x in _memory(f)['facts'] if x['fact_key'] == 'hair_color')

    corrected = f.client.post(f"{f.base}/facts/{old['fact_id']}/corrections", headers=f.headers,
                              json={'expected_brain_version': _version(f), 'fact_value': 'bạc trắng'})
    assert corrected.status_code == 200, corrected.text
    memory = _memory(f)
    hair = [x for x in memory['facts'] if x['fact_key'] == 'hair_color']
    assert [x['fact_value'] for x in hair] == ['bạc trắng']
    assert memory['current_state']['entities'][ids['Amane']]['hair_color'] == 'bạc trắng'

    # The replaced fact cannot be changed again; the new one can be removed.
    replaced = f.client.post(f"{f.base}/facts/{old['fact_id']}/corrections", headers=f.headers,
                             json={'expected_brain_version': _version(f), 'fact_value': 'đen'})
    assert replaced.status_code == 400
    removed = f.client.post(f"{f.base}/facts/{hair[0]['fact_id']}/corrections", headers=f.headers,
                            json={'expected_brain_version': _version(f), 'retire': True})
    assert removed.status_code == 200, removed.text
    memory = _memory(f)
    assert not [x for x in memory['facts'] if x['fact_key'] == 'hair_color']
    assert 'hair_color' not in memory['current_state']['entities'].get(ids['Amane'], {})


def test_fact_correction_needs_a_value(flow):
    f = flow
    _seed(f)
    fact = next(x for x in _memory(f)['facts'] if x['fact_key'] == 'hair_color')
    response = f.client.post(f"{f.base}/facts/{fact['fact_id']}/corrections", headers=f.headers,
                             json={'expected_brain_version': _version(f), 'fact_value': '  '})
    assert response.status_code == 400
