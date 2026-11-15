"""Unused extraction candidates can be rejected without discarding their batch."""
from dataclasses import replace
import uuid

import pytest

from application.bootstrap_service import ManuscriptBootstrapService
from domain.models import NarrativeProposal, ProposalStatus
from domain.projection import ProjectionError
from tests.test_p1_memory_entity_hitl import flow


def batch(f):
    group_id = str(uuid.uuid4())
    proposals = [
        NarrativeProposal(str(uuid.uuid4()), "entity",
                          {"canonical_name": name, "normalized_name": name.casefold(), "entity_type": "PER"},
                          dependency_group_id=group_id, materialization_order=i)
        for i, name in enumerate(["Tre", "Amane"])
    ]
    proposals.append(NarrativeProposal(str(uuid.uuid4()), "event",
        {"participants": ["Amane"], "summary": "Amane leaves.", "event_type": "movement", "chapter": 1},
        dependency_group_id=group_id, materialization_order=2))
    f.repo.get_story_brain(f.revision.novel_id)
    f.repo.save_proposals(f.revision.novel_id, proposals)
    return proposals


def test_reject_unused_entity_preserves_and_allows_accepting_remainder(flow):
    f = flow
    tre, amane, event = batch(f)
    before = {p.proposal_id: p for p in f.repo.list_proposals(f.revision.novel_id)}
    bootstrap = ManuscriptBootstrapService(f.repo, f.provider, f.service, f.llm)
    queue = {p['proposal_id']: p for p in bootstrap.review_queue(f.revision.novel_id)}
    assert queue[tre.proposal_id]['can_reject_individually'] is True
    assert queue[amane.proposal_id]['can_reject_individually'] is False
    response = f.client.post(f'/v1/proposals/{tre.proposal_id}/reject', json={}, headers=f.headers)
    assert response.status_code == 200, response.text
    proposals = {p.proposal_id: p for p in f.repo.list_proposals(f.revision.novel_id)}
    assert proposals[tre.proposal_id].status == ProposalStatus.REJECTED
    assert proposals[tre.proposal_id].dependency_group_id != tre.dependency_group_id
    assert proposals[amane.proposal_id] == before[amane.proposal_id]
    assert proposals[event.proposal_id] == before[event.proposal_id]
    assert int(f.repo.get_story_brain(f.revision.novel_id).metadata['brain_version']) == 1
    assert f.repo.list_entities(f.revision.novel_id) == []
    assert f.client.post(f'/v1/proposals/{tre.proposal_id}/reject', json={}, headers=f.headers).status_code == 409
    f.repo.accept_proposal_group(f.revision.novel_id, [amane.proposal_id, event.proposal_id], 1)
    assert [e.name for e in f.repo.list_entities(f.revision.novel_id)] == ['Amane']


def test_referenced_entity_cannot_be_rejected_alone(flow):
    f = flow
    proposals = batch(f)
    before = f.repo.list_proposals(f.revision.novel_id)
    with pytest.raises(ProjectionError, match='complete dependency group'):
        f.repo.decide_proposal(f.revision.novel_id, proposals[1].proposal_id, False)
    assert f.repo.list_proposals(f.revision.novel_id) == before


def test_reviewed_identity_retains_atomic_group_contract(flow):
    f = flow
    proposals = batch(f)
    reviewed = replace(proposals[0], payload={**proposals[0].payload, 'entity_id': str(uuid.uuid4())},
                       proposal_id=str(uuid.uuid4()))
    f.repo.save_proposals(f.revision.novel_id, [reviewed])
    with pytest.raises(ProjectionError, match='complete dependency group'):
        f.repo.decide_proposal(f.revision.novel_id, reviewed.proposal_id, False)
