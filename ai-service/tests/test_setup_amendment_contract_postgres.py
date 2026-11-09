"""UX-05 Stage-0 characterization probes, NOT amendment acceptance.

Deliberately describe missing contracts on the frozen baseline. Replace these
probes with one-effective-version acceptance after the contract is reviewed.
Hypothetical fact chains are test-only inserts in a disposable novel scope;
no production endpoint, accepted-row UPDATE, chapter, event or outbox is used.
"""
import json
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from api.entity_hitl_routes import memory
from application.writing_service import WritingService
from domain.errors import BootstrapConflictError
from infrastructure.orm_models import FactRecord
from tests.test_p2_bootstrap_postgres import engine, f, TENANT, ACTOR
from tests.test_setup_activation_postgres import owned, ready, activate, state

pytestmark = pytest.mark.postgres_integration


def emit(stage, **evidence):
    print('UX05_CONTRACT_PROBE ' + json.dumps(dict(stage=stage,
        classification='BLOCKER_CONFIRMED_NOT_FEATURE_PASS', **evidence), sort_keys=True))


@pytest.mark.parametrize('locked', [False, True])
def test_probe_fact_chain_memory_and_writer_disagree(owned, locked):
    f = owned
    job, activation = ready(f)
    activate(f, job, activation)  # Real verified M0, not a fabricated chapter.
    before = state(f, 'ux05-before-chain-fixture')
    parent, leaf = uuid.uuid4(), uuid.uuid4()
    brain = before['story_brains'][0]['id']
    # Seed a hypothetical already-retired parent and its successor. This is NOT
    # a supported amendment operation; missing reader semantics are the probe.
    with f.repo._session_factory() as session:
        for identity, value, retired, supersedes in [
            (parent, 'UX05 prior world rule', True, None),
            (leaf, 'UX05 replacement world rule', False, parent),
        ]:
            session.add(FactRecord(id=identity, story_brain_id=uuid.UUID(brain),
                tenant_id=uuid.UUID(TENANT), novel_id=uuid.UUID(f.src.novel_id),
                fact_type='world_rule', fact_key='ux05_probe_rule', fact_value=value,
                source_type='author_setup', confirmation_status='confirmed',
                is_locked=locked, is_retired=retired, supersedes_id=supersedes,
                created_by=uuid.UUID(ACTOR)))
        session.commit()
    ids = {str(parent), str(leaf)}
    visible_memory = memory(uuid.UUID(f.src.novel_id), service=SimpleNamespace(_repository=f.repo))
    memory_ids = {row['fact_id'] for row in visible_memory['data']['facts']} & ids
    writer = WritingService(f.repo, llm_service=None)
    context = writer.preview_context(tenant_id=TENANT, story_id=f.src.novel_id,
        chapter_number=1, author_plan_snapshot=())
    writer_ids = {row['id'] for row in context.world_rules} & ids
    assert memory_ids == {str(leaf)}
    assert writer_ids == ids, 'Baseline changed: replace Stage-0 probe with approved acceptance'
    after = state(f, 'ux05-after-chain-readers')
    for table in ('events', 'entity_mentions', 'state_transitions', 'chapters',
                  'chapter_revisions', 'revision_outbox_events', 'proposals',
                  'decisions', 'bootstrap_jobs', 'story_brains'):
        assert before[table] == after[table], table
    original = {row['id']: row for row in before['facts']}
    assert {row['id']: row for row in after['facts'] if row['id'] in original} == original
    assert len(after['facts']) == len(before['facts']) + 2
    assert f.llm.calls == 0
    emit('reader-disagreement', locked=locked, novel_id=f.src.novel_id,
        parent_id=str(parent), leaf_id=str(leaf), memory_ids=sorted(memory_ids),
        writer_ids=sorted(writer_ids), retired_parent_reaches_writing_context=True,
        accepted_row_updates=0, fabricated_history=0, provider_calls=0)


def test_probe_fresh_brain_token_cannot_rebase_old_setup_review(owned):
    f = owned
    job, body = ready(f)
    # An authorized future amendment would increment Brain. No FactRecord is
    # changed here: this tests M0's existing audit equality at a fresh token.
    with f.engine.begin() as connection:
        version = connection.execute(text('UPDATE narrative.story_brains '
            'SET brain_version=brain_version+1 WHERE tenant_id=:t AND novel_id=:n '
            'RETURNING brain_version'), dict(t=TENANT, n=f.src.novel_id)).scalar_one()
    body['expected_brain_version'] = version
    before = state(f, 'ux05-before-stale-review-activation')
    with pytest.raises(BootstrapConflictError, match='M0_REVIEW_STALE'):
        activate(f, job, body)
    after = state(f, 'ux05-after-stale-review-activation')
    assert after == before
    assert f.llm.calls == 0
    emit('pre-m0-audit-rebase-missing', novel_id=f.src.novel_id,
        fresh_expected_brain_version=version, reason='M0_REVIEW_STALE',
        activation_mutations=0, accepted_row_updates=0, provider_calls=0)
