"""Live check R4 (BB3): archiving or deleting a chapter closes its analysis, so nothing from a removed
chapter can still reach Canon."""
from tests.test_p1_memory_entity_hitl import flow, discover, freeze  # noqa: F401  (fixture)


def close(f, chapter=None):
    response = f.client.post(f'{f.base}/chapters/{chapter or f.revision.chapter_id}/close-analysis',
                             headers=f.headers, json={})
    assert response.status_code == 200, response.text
    return response.json()['data']


def test_a_waiting_review_of_a_removed_chapter_is_discarded(flow):
    f = flow
    run, _ = discover(f)
    assert [r['analysis_run_id'] for r in f.client.get(f'{f.base}/entity-reviews', headers=f.headers).json()['data']] == [run]
    assert close(f) == {'discarded_runs': [run], 'rejected_proposals': []}
    assert f.client.get(f'{f.base}/entity-reviews', headers=f.headers).json()['data'] == []
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 409


def test_pending_proposals_of_a_removed_chapter_are_rejected_and_canon_is_unchanged(flow):
    f = flow
    run, audit = discover(f)
    freeze(f, run, audit)
    assert f.client.post(f'{f.base}/entity-reviews/{run}/continue', headers=f.headers).status_code == 200
    pending = f.repo.list_proposals(f.revision.novel_id, status='pending')
    assert pending
    version = f.repo.get_story_brain(f.revision.novel_id).metadata.get('brain_version')
    result = close(f)
    assert sorted(result['rejected_proposals']) == sorted(
        str(f.repo._stable_uuid('proposal', p.proposal_id)) if hasattr(f.repo, '_stable_uuid') else p.proposal_id
        for p in pending)
    assert f.repo.list_proposals(f.revision.novel_id, status='pending') == []
    assert f.repo.get_story_brain(f.revision.novel_id).metadata.get('brain_version') == version


def test_another_chapter_is_not_touched(flow):
    f = flow
    run, _ = discover(f)
    assert close(f, '00000000-0000-0000-0000-0000000000aa') == {'discarded_runs': [], 'rejected_proposals': []}
    assert [r['analysis_run_id'] for r in f.client.get(f'{f.base}/entity-reviews', headers=f.headers).json()['data']] == [run]
