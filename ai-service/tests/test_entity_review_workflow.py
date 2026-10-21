"""Offline contracts for the author entity gate, across all repository backends."""
from copy import deepcopy
import json

import pytest

from application.entity_review_service import save_guidance, registry
from domain.errors import OptimisticLockError
from tests.test_entity_candidates import Verifier, service
from tests.test_state_projection import repo


def accept_machine(repository, analysis, args, result):
    audit = repository.get_entity_candidate_audit('story', result.analysis_run.run_id)
    return analysis.review_entities('story', result.analysis_run.run_id, tenant_id=args['tenant_id'],
        decisions=audit['decisions'], expected_version=audit['review_version'])


def test_entity_gate_is_durable_and_resume_does_not_repeat_entity_llm(repo):
    llm = Verifier()
    repository, analysis, args = service('An tới trạm Bốn.', llm, repo)
    before = registry(repository, 'story')
    first = analysis.analyze(**args)
    assert first.status == 'waiting_entity_review' and not first.proposals
    calls = len(llm.calls)
    assert analysis.analyze(**args).status == 'waiting_entity_review'
    assert len(llm.calls) == calls
    assert repository.list_proposals('story') == []
    assert registry(repository, 'story') == before
    audit = accept_machine(repository, analysis, args, first)
    assert repository.list_entity_reviews('story')[0]['status'] == 'entities_reviewed'
    assert 'entity_guidance' not in json.dumps(repository.get_story_brain('story').metadata)
    assert registry(repository, 'story') == before
    with pytest.raises(OptimisticLockError):
        analysis.review_entities('story', first.analysis_run.run_id, tenant_id=args['tenant_id'],
            decisions=audit['decisions'], expected_version=audit['review_version'] - 1)
    finished = analysis.continue_entity_review('story', first.analysis_run.run_id, tenant_id=args['tenant_id'])
    assert finished.status == 'completed' and finished.proposals
    assert len(llm.calls) == calls
    assert not repository.list_entity_reviews('story')
    assert analysis.analyze(**args).deduplicated


def test_request_cannot_bypass_entity_gate_by_disabling_entity_extraction():
    from domain.errors import AnalysisOutputError
    repository, analysis, args = service('An tới.', Verifier())
    args['options'] = {'extract_entities': False, 'extract_events': True}
    with pytest.raises(AnalysisOutputError, match='requires the entity review stage'):
        analysis.analyze(**args)
    assert not analysis._llm_service.calls and not repository.list_proposals('story')


def test_guidance_is_scoped_versioned_and_never_creates_occurrences(repo):
    original = registry(repo, 'story')
    value = save_guidance(repo, 'story', [{'name': 'vòng bạc'}, {'name': 'Vắng Mặt', 'kind': 'declared', 'entity_type': 'PER'}], 0)
    value['entries'][0]['name'] = 'mutated'
    assert repo.get_entity_guidance('story')['entries'][0]['name'] == 'vòng bạc'
    assert repo.get_entity_guidance('other')['version'] == 0
    with pytest.raises(OptimisticLockError):
        save_guidance(repo, 'story', [], 0)
    assert registry(repo, 'story') == original
    llm = Verifier({'vòng bạc': ('vòng bạc', 'ITEM')})
    repository, analysis, args = service('chiếc vòng bạc nằm trên bàn.', llm, repo)
    result = analysis.analyze(**args)
    audit = repository.get_entity_candidate_audit('story', result.analysis_run.run_id)
    assert any(c['surface'] == 'vòng bạc' and 'author_guidance' in c['origins'] for c in audit['candidates'])
    assert not any(c['surface'] == 'Vắng Mặt' for c in audit['candidates'])
    prompt = json.loads(next(p for op, p in llm.calls if op == 'entity_candidate_verification'))
    assert prompt['author_guidance'][1]['kind'] == 'declared'
    assert registry(repo, 'story') == original


def test_guidance_change_requires_entity_rerun_and_preserves_valid_review_decisions():
    repository, analysis, args = service('An nhặt vòng bạc.', Verifier())
    first = analysis.analyze(**args)
    reviewed = accept_machine(repository, analysis, args, first)
    save_guidance(repository, 'story', [{'name': 'vòng bạc'}], 0)
    second = analysis.continue_entity_review('story', first.analysis_run.run_id, tenant_id='t')
    assert second.status == 'waiting_entity_review'
    audit = repository.get_entity_candidate_audit('story', first.analysis_run.run_id)
    assert audit['guidance_version'] == 1
    # New hint adds a candidate; untouched source decisions stay available for review.
    assert audit['reviewed_decisions']
    assert any(c['surface'] == 'vòng bạc' for c in audit['candidates'])
    assert not repository.list_proposals('story')
    with pytest.raises(OptimisticLockError):
        analysis.review_entities('story', first.analysis_run.run_id, tenant_id='t',
            decisions=reviewed['decisions'], expected_version=reviewed['review_version'])


def test_unresolved_requires_author_decision_and_rejection_does_not_create_identity():
    repository, analysis, args = service('An tới.', Verifier(unresolved=True))
    first = analysis.analyze(**args)
    audit = repository.get_entity_candidate_audit('story', first.analysis_run.run_id)
    with pytest.raises(ValueError, match='Resolve or reject'):
        analysis.review_entities('story', first.analysis_run.run_id, tenant_id='t',
            decisions=audit['decisions'], expected_version=audit['review_version'])
    decisions = [{'candidate_id': d['candidate_id'], 'verdict': 'not_entity', 'reason': 'Author rejected'}
                 for d in audit['decisions']]
    analysis.review_entities('story', first.analysis_run.run_id, tenant_id='t',
        decisions=decisions, expected_version=audit['review_version'])
    result = analysis.continue_entity_review('story', first.analysis_run.run_id, tenant_id='t')
    assert result.status == 'completed' and not result.proposals
    calls = len(analysis._llm_service.calls)
    assert analysis.analyze(**args).deduplicated
    assert len(analysis._llm_service.calls) == calls
    assert repository.list_entities('story') == []


def test_unknown_downstream_identity_reopens_gate_without_partial_proposals():
    class UnknownSubject(Verifier):
        def _call_structured(self, *, operation, system_prompt, user_prompt):
            if operation == 'event_extraction':
                self.calls.append((operation, user_prompt))
                return json.dumps({'events': [{'participants': ['Linh'], 'locations': [], 'summary': 'Linh tới.',
                    'event_type': 'arrival', 'evidence_quote': 'Linh tới.'}]})
            return super()._call_structured(operation=operation, system_prompt=system_prompt, user_prompt=user_prompt)
    repository, analysis, args = service('An tới. Linh tới.', UnknownSubject())
    args['options']['extract_events'] = True
    first = analysis.analyze(**args)
    accept_machine(repository, analysis, args, first)
    second = analysis.continue_entity_review('story', first.analysis_run.run_id, tenant_id='t')
    assert second.status == 'waiting_entity_review'
    assert not repository.list_proposals('story')
    audit = repository.get_entity_candidate_audit('story', first.analysis_run.run_id)
    assert any(d['verdict'] == 'unresolved' for d in audit['decisions'])


def test_author_declaration_has_no_chapter_occurrence_and_requires_normal_approval(repo):
    repository, analysis, _ = service('An tới.', Verifier(), repo)
    original = registry(repository, 'story')
    proposal = analysis.create_author_entity('story', 'Nguyệt', 'PER')
    assert not proposal.evidence and proposal.payload['initial_status'] == 'Unknown'
    assert proposal.payload['source_type'] == 'author_declaration'
    assert registry(repository, 'story') == original
    repository.accept_proposal_group('story', [proposal.proposal_id], proposal.expected_brain_version)
    assert any(e['name'] == 'Nguyệt' for e in registry(repository, 'story')['entities'])
    assert not repository.get_story_brain('story').events
    with pytest.raises(ValueError, match='already exists'):
        analysis.create_author_entity('story', 'Nguyệt', 'LOC')


@pytest.mark.parametrize('entries', [[{'name': ''}], [{'name': 'An', 'entity_type': 'WRONG'}],
    [{'name': 'An', 'kind': 'declared'}], [{'name': 'An'}, {'name': 'an'}],
    [{'name': 'An', 'aliases': 'bad'}]])
def test_invalid_guidance_fails_before_persistence(entries):
    repository, _, _ = service('An tới.', Verifier())
    with pytest.raises(ValueError):
        save_guidance(repository, 'story', entries, 0)
    assert repository.get_entity_guidance('story')['version'] == 0


def test_p1_import_pauses_and_resumes_from_entity_checkpoint_without_rediscovery():
    from application.bootstrap_service import ManuscriptBootstrapService
    llm = Verifier({'Mai Linh': ('Mai Linh', 'PER'), 'Linh': ('Mai Linh', 'PER')})
    repository, analysis, args = service('Linh là tên gọi của Mai Linh. Linh tới kho.', llm)
    bootstrap = ManuscriptBootstrapService(repository, analysis._revision_provider, analysis)
    job = bootstrap.start(tenant_id='t', novel_id='story', revisions=[{
        'chapter_id': args['chapter_id'], 'revision_id': args['revision_id'], 'content_hash': args['content_hash']}],
        locale='vi-VN', options={'require_review_for_all': True})
    waiting = bootstrap.process(job.job_id)
    assert waiting.status == 'waiting_entity_review' and waiting.progress_current == 0
    run_id = waiting.revisions[0].analysis_run_id
    audit = repository.get_entity_candidate_audit('story', run_id)
    analysis.review_entities('story', run_id, tenant_id='t', decisions=audit['decisions'],
        expected_version=audit['review_version'])
    discovery_count = sum(op == 'entity_candidate_verification' for op, _ in llm.calls)
    # Isolate the bootstrap resume contract from optional downstream state-transition LLM output.
    from unittest.mock import patch
    with patch('application.revision_analysis_service.generate_state_transition_proposals', return_value=[]):
        finished = bootstrap.resume(job.job_id)
    assert finished.status == 'waiting_review' and finished.progress_current == 1
    assert finished.result['scene_count'] == 1
    assert sum(op == 'entity_candidate_verification' for op, _ in llm.calls) == discovery_count


def test_p2_setup_receives_guidance_without_inventing_unmentioned_entity_or_events():
    from application.bootstrap_service import ManuscriptBootstrapService
    from tests.test_author_workflow import StubLLM
    repository, _, _ = service('An tới.', Verifier())
    save_guidance(repository, 'story', [{'name': 'An'}, {'name': 'Vắng Mặt'}], 0)
    llm = StubLLM({'entities': [{'name': 'An', 'entity_type': 'character'},
                              {'name': 'Vắng Mặt', 'entity_type': 'character'}]})
    bootstrap = ManuscriptBootstrapService(repository, None, None, llm_service=llm)
    job = bootstrap.start_from_idea(tenant_id='t', novel_id='story', idea='An ở Cồn Vân.', mode='extract')
    assert job.status == 'waiting_review'
    prompt = json.loads(llm.calls[0]['user_prompt'])
    assert prompt['author_guidance'][1]['name'] == 'Vắng Mặt'
    assert [p.payload['canonical_name'] for p in repository.list_proposals('story')] == ['An']
    assert not repository.list_entities('story') and not repository.get_story_brain('story').events
