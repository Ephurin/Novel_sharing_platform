import json
from dataclasses import replace

import pytest

from domain.errors import AnalysisOutputError
from services.canon_reconciliation import reconcile_proposals
from services.source_grounding import resolve_grounded_quote
from tests.test_canon_revision_reconciliation import candidates
from tests.test_memory_grounding_repairs import Responses, make_service
from tests.test_state_projection import repo


def test_two_reuse_claims_keep_one_canon_fact_and_both_review_decisions(repo):
    items, ids, _ = candidates(repo)
    duplicate = replace(items[1], proposal_id='second-fact',
                        payload={**items[1].payload, 'fact_key': 'years_of_age'})
    items.append(duplicate)
    llm = Responses({'decisions': [
        {'proposal_id': p.proposal_id, 'action': 'reuse', 'target_id': target, 'reason': 'Same proposition'}
        for p, target in zip(items, [*ids, ids[1]])]})
    result = reconcile_proposals(repo.get_story_brain('story'), items, 1, 'Minh gặp Lan tại bến.', llm)
    repo.save_proposals('story', result)
    decision = repo.accept_proposal_group('story', [p.proposal_id for p in result], 2)
    assert len(repo.get_story_brain('story').facts) == 1
    assert decision['canonical_artifact_ids'] == [*ids, ids[1]]
    assert len(result) == 3


@pytest.mark.parametrize('actions', [('replace', 'replace'), ('reuse', 'replace'), ('replace', 'reuse')])
def test_conflicting_claims_repair_before_persisting(repo, actions):
    items, ids, _ = candidates(repo)
    items = [items[1], replace(items[1], proposal_id='second-fact')]
    bad = {'decisions': [{'proposal_id': p.proposal_id, 'action': a, 'target_id': ids[1], 'reason': 'bad'}
                         for p, a in zip(items, actions)]}
    good = {'decisions': [{**d, 'action': 'reuse', 'reason': 'Same unchanged age'} for d in bad['decisions']]}
    class Repair:
        calls = 0
        def _call_llm(self, **kwargs):
            self.calls += 1
            if self.calls == 2:
                request = json.loads(kwargs['user_prompt'])
                assert 'Conflicting replacement' in request['validation_error']
            return json.dumps(bad if self.calls == 1 else good)
    llm = Repair()
    result = reconcile_proposals(repo.get_story_brain('story'), items, 1, 'unchanged source', llm)
    assert llm.calls == 2
    assert all(p.payload.get('reuse_artifact_id') == ids[1] for p in result)
    assert len(repo.get_story_brain('story').facts) == 1


def test_invalid_comparison_exhausts_bounded_repair_without_partial_canon(repo):
    items, _, _ = candidates(repo)
    llm = Responses({'decisions': []}, {'decisions': []}, {'decisions': []})
    with pytest.raises(AnalysisOutputError) as err:
        reconcile_proposals(repo.get_story_brain('story'), items, 1, 'source', llm)
    assert err.value.code == 'CANON_RECONCILIATION_UNRESOLVED'
    assert err.value.attempts == 3
    assert len(repo.get_story_brain('story').facts) == 1


def test_ambiguous_whitespace_quote_must_be_expanded_not_first_matched():
    text = 'Sáng: An giữ\nchìa khóa. Tối: An giữ\nchìa khóa.'
    with pytest.raises(AnalysisOutputError):
        resolve_grounded_quote(text, 'An giữ chìa khóa.', max_retries=0)
    start, end, quote = resolve_grounded_quote(text, 'An giữ chìa khóa.',
        llm_service=Responses({'exact_quote': 'Tối: An giữ\nchìa khóa.'}))
    assert start == text.index('Tối:')
    assert text[start:end] == quote


def test_fact_analysis_repairs_ambiguous_quote_and_keeps_original_offsets():
    text = 'Sáng: An giữ chìa khóa. Tối: An giữ chìa khóa.'
    llm = Responses({'facts': [{'subject': 'An', 'fact_key': 'possession',
        'fact_value': 'chìa khóa vào buổi tối', 'certainty': 'confirmed', 'quote': 'An giữ chìa khóa.'}]},
        {'exact_quote': 'Tối: An giữ chìa khóa.'})
    repository, service, revision = make_service(text, llm)
    result = service.analyze(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev',
        content_hash=revision.content_hash, operation='test', idempotency_key='repair',
        options={'extract_entities': False, 'extract_events': False, 'extract_prose_facts': True})
    ev = result.proposals[0].evidence[0]
    assert ev['start'] == text.index('Tối:')
    assert text[ev['start']:ev['end']] == ev['quote']
    assert not repository.get_story_brain('novel').facts


def test_exhausted_fact_grounding_persists_no_partial_proposals():
    text = 'Sáng: An giữ chìa khóa. Tối: An giữ chìa khóa.'
    llm = Responses({'facts': [{'subject': 'An', 'fact_key': 'possession', 'fact_value': 'key',
        'certainty': 'confirmed', 'quote': 'An giữ chìa khóa.'}]},
        {'exact_quote': 'An giữ chìa khóa.'}, {'exact_quote': 'An giữ chìa khóa.'})
    repository, service, revision = make_service(text, llm)
    with pytest.raises(AnalysisOutputError):
        service.analyze(tenant_id='t', novel_id='novel', chapter_id='chapter', revision_id='rev',
            content_hash=revision.content_hash, operation='test', idempotency_key='unresolved',
            options={'extract_entities': False, 'extract_events': False, 'extract_prose_facts': True})
    assert repository.list_proposals('novel') == []
