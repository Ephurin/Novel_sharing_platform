"""Authoritative rejection transactions; actual PostgreSQL readbacks, fake discovery."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from types import SimpleNamespace
import uuid
import json

import pytest
from sqlalchemy import text

from tests.test_p1_memory_entity_hitl import flow, TENANT, ACTOR
from tests.test_c01_canon_group import group, single
from tests.test_p1_contract_alignment import accept, snapshot as contract_snapshot
from domain.projection import ProjectionError

pytestmark = [pytest.mark.postgres_integration,
    pytest.mark.parametrize('flow', ['postgres'], indirect=True)]


def snapshot(f, stage):
    value = contract_snapshot(f, stage)
    with f.engine.connect() as c:
        tables = c.execute(text("SELECT table_name FROM information_schema.columns WHERE table_schema='narrative' AND column_name IN ('tenant_id','novel_id') GROUP BY table_name HAVING count(*)=2")).scalars()
        for table in tables:
            if table not in value:
                rows = c.execute(text(f'SELECT * FROM narrative.{table} WHERE tenant_id=:t AND novel_id=:n ORDER BY 1'),
                    {'t': TENANT, 'n': f.revision.novel_id}).mappings()
                value[table] = [dict(r) for r in rows]
    print('ATOMIC_REJECT_PG_READBACK ' + json.dumps({'stage': stage, 'data': value}, default=str))
    return value


def reject(f, proposals, version=1, headers=None, **extra):
    return f.client.post(f'/v1/proposal-groups/{proposals[0].dependency_group_id}/reject',
        json={'expected_brain_version': version, 'reason': 'Human rejects whole group', **extra},
        headers=headers or f.headers)


@pytest.mark.parametrize('entry', ['http', 'service', 'repository'])
def test_partial_reject_is_closed_and_preserves_complete_group(flow, entry):
    f = flow
    proposals = group(f)
    before = snapshot(f, 'reject-partial-before-' + entry)
    try:
        if entry == 'http':
            response = f.client.post(f'/v1/proposals/{proposals[0].proposal_id}/reject',
                json={'reason': 'one only'}, headers=f.headers)
            print('GROUP_REJECT_HTTP', response.status_code, response.text)
            assert response.status_code == 422, response.text
        else:
            with pytest.raises(ProjectionError, match='complete dependency group'):
                if entry == 'service':
                    f.client.app.state.narrative_service.reject_proposal_by_id(proposals[0].proposal_id)
                else:
                    f.repo.decide_proposal(f.revision.novel_id, proposals[0].proposal_id, False)
    finally:
        after = snapshot(f, 'reject-partial-after-' + entry)
        assert after == before
    assert accept(f, proposals).status_code == 200


def test_group_reject_is_atomic_audited_and_no_canon_version_change(flow):
    f = flow
    proposals = group(f)
    before = snapshot(f, 'reject-complete-before')
    memory = f.client.get(f'{f.base}/memory', headers=f.headers).json()
    actor = str(uuid.uuid4())
    response = reject(f, proposals, headers={**f.headers, 'X-Author-Id': actor})
    print('GROUP_REJECT_HTTP', response.status_code, response.text)
    after = snapshot(f, 'reject-complete-after')
    assert response.status_code == 200, response.text
    assert response.json()['data'] == {'group_id': proposals[0].dependency_group_id,
        'proposal_ids': [str(p['id']) for p in sorted(after['proposals'],
            key=lambda p: (p['materialization_order'], str(p['id'])))],
        'status': 'rejected', 'brain_version': 1}
    assert all(p['status'] == 'rejected' for p in after['proposals'])
    assert len(after['proposal_decisions']) == len(proposals)
    assert all(str(d['actor_id']) == actor and d['decision'] == 'reject' and
        d['reason'] == 'Human rejects whole group' for d in after['proposal_decisions'])
    for key in before.keys() - {'proposals', 'proposal_decisions'}:
        assert after[key] == before[key], key
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json() == memory
    assert reject(f, proposals).status_code == 409
    assert snapshot(f, 'reject-retry-after') == after
    assert accept(f, proposals).status_code == 409
    assert snapshot(f, 'reject-then-accept-after') == after


def test_true_singleton_reject_keeps_existing_request(flow):
    f = flow
    proposal = f.service.create_author_entity(f.revision.novel_id, name='Standalone', entity_type='PER')
    response = f.client.post(f'/v1/proposals/{proposal.proposal_id}/reject',
        json={'reason': 'No longer needed'}, headers=f.headers)
    assert response.status_code == 200, response.text
    value = snapshot(f, 'reject-singleton')
    assert value['story_brains'][0]['brain_version'] == 1
    assert not value['entities'] and len(value['proposal_decisions']) == 1
    assert value['proposals'][0]['status'] == 'rejected'
    assert f.client.post(f'/v1/proposals/{proposal.proposal_id}/reject',
        json={}, headers=f.headers).status_code == 409
    assert snapshot(f, 'reject-singleton-retry') == value


def test_concurrent_rejection_records_one_decision_set(flow):
    f = flow
    proposals = group(f)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: reject(f, proposals), range(2)))
    assert sorted(r.status_code for r in responses) == [200, 409]
    value = snapshot(f, 'reject-concurrent-replay')
    assert len(value['proposal_decisions']) == len(proposals)
    assert {p['status'] for p in value['proposals']} == {'rejected'}
    assert value['story_brains'][0]['brain_version'] == 1


def test_group_rejection_has_no_nontransactional_fallback(flow):
    f = flow
    proposals = group(f)
    before = snapshot(f, 'reject-unsupported-before')
    service = f.client.app.state.narrative_service
    original = service._repository
    try:
        from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
        service._repository = InMemoryNarrativeRepository()
        assert reject(f, proposals).status_code == 503
    finally:
        service._repository = original
    assert snapshot(f, 'reject-unsupported-after') == before


def test_obsolete_pending_group_can_be_discarded_with_current_cas(flow):
    f = flow
    proposals = group(f)
    singleton = f.service.create_author_entity(f.revision.novel_id, name='Independent', entity_type='PER')
    assert single(f, singleton).status_code == 200
    before = snapshot(f, 'reject-old-group-before')
    assert reject(f, proposals).status_code == 409
    assert snapshot(f, 'reject-old-group-stale') == before
    assert reject(f, proposals, version=2).status_code == 200
    after = snapshot(f, 'reject-old-group-after')
    for key in before.keys() - {'proposals', 'proposal_decisions'}:
        assert after[key] == before[key], key
    assert after['story_brains'][0]['brain_version'] == 2


@pytest.mark.parametrize('ordering', ['accept_first', 'reject_first', 'overlap'])
def test_accept_reject_serializes_whole_group(flow, ordering):
    f = flow
    proposals = group(f)
    if ordering == 'overlap':
        with ThreadPoolExecutor(2) as pool:
            a, r = pool.submit(accept, f, proposals), pool.submit(reject, f, proposals)
            approved, rejected = a.result(), r.result()
    elif ordering == 'accept_first':
        approved, rejected = accept(f, proposals), reject(f, proposals)
    else:
        rejected, approved = reject(f, proposals), accept(f, proposals)
    assert sorted([approved.status_code, rejected.status_code]) == [200, 409]
    value = snapshot(f, 'reject-race-' + ordering)
    winner = 'accepted' if approved.status_code == 200 else 'rejected'
    assert {p['status'] for p in value['proposals']} == {winner}
    assert len(value['proposal_decisions']) == len(proposals)
    assert {d['decision'] for d in value['proposal_decisions']} == ({'accept'} if winner == 'accepted' else {'reject'})
    assert value['story_brains'][0]['brain_version'] == (2 if winner == 'accepted' else 1)
    if winner == 'rejected':
        assert not any(value[k] for k in ('entities', 'events', 'facts', 'state_transitions'))


@pytest.mark.parametrize('invalid', ['stale', 'missing', 'tenant', 'actor', 'body_scope', 'missing_cas',
    'missing_author', 'missing_tenant', 'service', 'decided'])
def test_group_reject_negative_full_readback(flow, invalid):
    f = flow
    proposals = group(f)
    headers = dict(f.headers)
    body = {'expected_brain_version': 1}
    gid = proposals[0].dependency_group_id
    expected = 422
    if invalid == 'stale': body['expected_brain_version'], expected = 99, 409
    if invalid == 'missing': gid, expected = str(uuid.uuid4()), 404
    if invalid == 'tenant': headers['X-Tenant-Id'], expected = str(uuid.uuid4()), 403
    if invalid == 'actor': headers['X-Author-Id'] = 'not-a-uuid'
    if invalid == 'body_scope': body['novel_id'] = str(uuid.uuid4())
    if invalid == 'missing_cas': body = {'reason': 'missing version'}
    if invalid == 'missing_author': headers.pop('X-Author-Id')
    if invalid == 'missing_tenant': headers.pop('X-Tenant-Id')
    if invalid == 'service': headers['X-Service-Token'], expected = 'invalid', 403
    if invalid == 'decided':
        # Historical inconsistent data: public operations must never create this.
        with f.engine.begin() as c:
            c.execute(text("UPDATE narrative.proposals SET status='rejected' WHERE id=:id"),
                {'id': proposals[-1].proposal_id})
        expected = 409
    before = snapshot(f, 'reject-negative-before-' + invalid)
    response = f.client.post(f'/v1/proposal-groups/{gid}/reject', json=body, headers=headers)
    print('GROUP_REJECT_HTTP', invalid, response.status_code, response.text)
    assert response.status_code == expected, response.text
    assert snapshot(f, 'reject-negative-after-' + invalid) == before


@pytest.mark.parametrize('scope', ['novel', 'tenant', 'ambiguous_group'])
def test_repository_rejects_foreign_scope_without_mutation(flow, scope):
    f = flow
    proposals = group(f)
    repo, novel = f.repo, f.revision.novel_id
    foreign = str(uuid.uuid4())
    foreign_proposal = f.service.create_author_entity(foreign, name='Foreign', entity_type='PER')
    if scope == 'ambiguous_group':
        with f.engine.begin() as c:
            c.execute(text('UPDATE narrative.proposals SET dependency_group_id=:g WHERE id=:p'),
                {'g': proposals[0].dependency_group_id, 'p': foreign_proposal.proposal_id})
    other = SimpleNamespace(engine=f.engine, revision=replace(f.revision, novel_id=foreign))
    try:
        before, other_before = snapshot(f, 'reject-scope-before'), snapshot(other, 'reject-foreign-before')
        if scope == 'novel': novel = foreign
        elif scope == 'tenant':
            from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
            repo = PostgresNarrativeRepository(f.repo._session_factory, tenant_id=str(uuid.uuid4()), actor_id=ACTOR)
        if scope == 'ambiguous_group':
            assert reject(f, proposals).status_code == 404
        else:
            with pytest.raises(KeyError):
                repo.reject_proposal_group(novel, proposals[0].dependency_group_id, 1)
        assert snapshot(f, 'reject-scope-after') == before
        assert snapshot(other, 'reject-foreign-after') == other_before
    finally:
        with f.engine.begin() as c:
            c.execute(text('DELETE FROM narrative.story_brains WHERE novel_id=:n'), {'n': foreign})


def test_failure_on_final_decision_insert_rolls_back_every_member(flow):
    f = flow
    proposals = group(f)
    before = snapshot(f, 'reject-persistence-before')
    last = sorted(before['proposals'], key=lambda p: (p['materialization_order'], str(p['id'])))[-1]['id']
    name = 'reject_failure_' + uuid.uuid4().hex
    with f.engine.begin() as c:
        c.exec_driver_sql(f"CREATE FUNCTION narrative.{name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.proposal_id = '{last}'::uuid THEN RAISE EXCEPTION 'owned final decision failure'; END IF; RETURN NEW; END $$")
        c.exec_driver_sql(f'CREATE TRIGGER {name} BEFORE INSERT ON narrative.proposal_decisions FOR EACH ROW EXECUTE FUNCTION narrative.{name}()')
    try:
        from fastapi.testclient import TestClient
        with TestClient(f.client.app, raise_server_exceptions=False) as client:
            response = client.post(f'/v1/proposal-groups/{proposals[0].dependency_group_id}/reject',
                json={'expected_brain_version': 1}, headers=f.headers)
        assert response.status_code == 500, response.text
        assert snapshot(f, 'reject-persistence-after') == before
        from sqlalchemy.exc import DBAPIError
        with pytest.raises(DBAPIError, match='owned final decision failure'):
            f.repo.reject_proposal_group(f.revision.novel_id, proposals[0].dependency_group_id, 1)
        assert snapshot(f, 'reject-persistence-repository-after') == before
    finally:
        with f.engine.begin() as c:
            c.exec_driver_sql(f'DROP TRIGGER {name} ON narrative.proposal_decisions')
            c.exec_driver_sql(f'DROP FUNCTION narrative.{name}()')
    assert reject(f, proposals).status_code == 200
