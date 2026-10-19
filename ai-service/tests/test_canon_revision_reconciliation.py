import json
import uuid
from dataclasses import replace
import pytest
from domain.models import NarrativeProposal
from domain.canon_identity import active_events, active_facts
from domain.projection import ProjectionError
from services.canon_reconciliation import reconcile_proposals
from tests.test_state_projection import repo


class ComparisonLLM:
    def __init__(self, result): self.result = result
    def _call_llm(self, **kwargs):
        assert 'ONE chapter revision' in kwargs['system_prompt']
        return json.dumps(self.result)


def proposal(kind, payload, version=1, group='g'):
    return NarrativeProposal(str(uuid.uuid4()), kind, {'chapter_number': 1, **payload},
        dependency_group_id=group, expected_brain_version=version,
        evidence=({'revision_id': str(uuid.uuid4()), 'chapter_number': 1, 'start': 0, 'end': 24,
                   'quote': 'Minh gặp Lan tại bến.'},))


def seed(repo):
    minh = next(e for e in repo.list_entities('story') if e.name == 'Minh')
    event = proposal('event', {'event_type': 'meeting', 'summary': 'Minh met Lan at dock',
                              'participants': ['Minh', 'Lan'], 'chapter': 1})
    fact = proposal('fact', {'fact_key': 'age', 'fact_type': 'narrative_fact', 'fact_value': 19,
                            'subject_entity_id': minh.entity_id})
    repo.save_proposals('story', [event, fact])
    result = repo.accept_proposal_group('story', [event.proposal_id, fact.proposal_id], 1)
    return event, fact, result['canonical_artifact_ids'], minh


def candidates(repo):
    event, fact, ids, minh = seed(repo)
    changed = [proposal('event', {**event.payload, 'summary': 'At the landing Minh greeted Lan'}, 2, 'next'),
               proposal('fact', dict(fact.payload), 2, 'next')]
    return changed, ids, minh


def accept_comparison(repo, proposals, ids, action, text='Minh gặp Lan tại bến.'):
    result = reconcile_proposals(repo.get_story_brain('story'), proposals, 1, text, ComparisonLLM({
        'decisions': [{'proposal_id': p.proposal_id, 'action': action, 'target_id': identifier if action != 'new' else '',
                       'reason': 'Same source occurrence' if action != 'new' else 'A second visit later that day'}
                      for p, identifier in zip(proposals, ids)]}))
    repo.save_proposals('story', result)
    return repo.accept_proposal_group('story', [p.proposal_id for p in result], 2)


def test_review_reuses_same_occurrence_despite_summary_wording(repo):
    proposals, ids, _ = candidates(repo)
    result = accept_comparison(repo, proposals, ids, 'reuse')
    brain = repo.get_story_brain('story')
    assert len(brain.events) == len(brain.facts) == 1
    assert result['canonical_artifact_ids'] == ids


def test_changes_create_explicit_versions_and_context_excludes_old_fact(repo):
    proposals, ids, minh = candidates(repo)
    proposals[1] = replace(proposals[1], payload={**proposals[1].payload, 'fact_value': 20})
    accept_comparison(repo, proposals, ids, 'replace', 'Minh gặp Lan tại nhà. Minh hai mươi tuổi.')
    brain = repo.get_story_brain('story')
    assert len(brain.events) == len(brain.facts) == 2  # immutable history
    assert len(active_events(brain.events)) == len(active_facts(brain.facts)) == 1
    assert repo.get_current_state('story')['entities'][minh.entity_id]['age'] == 20
    context = repo.get_structured_context('story', chapter_number=1)
    assert [f['fact_value'] for f in context.world_rules if f['fact_key'] == 'age'] == [20]


def test_real_second_visit_is_not_collapsed_by_participants_or_action(repo):
    proposals, ids, _ = candidates(repo)
    accept_comparison(repo, proposals, ids, 'new', 'Minh gặp Lan tại bến. Tối đó Minh lại gặp Lan tại bến.')
    brain = repo.get_story_brain('story')
    assert len(active_events(brain.events)) == 2


def test_reconciliation_rejects_unknown_target_before_persistence(repo):
    proposals, _, _ = candidates(repo)
    with pytest.raises(ValueError, match='target'):
        reconcile_proposals(repo.get_story_brain('story'), proposals, 1, 'text', ComparisonLLM({
            'decisions': [{'proposal_id': p.proposal_id, 'action': 'reuse', 'target_id': 'another-story', 'reason': 'bad'} for p in proposals]}))
    assert len(repo.get_story_brain('story').events) == 1


def test_retirement_keeps_history_and_removes_projected_state(repo):
    _, _, ids, minh = seed(repo)
    brain = repo.get_story_brain('story')
    # SQL fact source text is enriched by RevisionAnalysisService before comparison.
    brain = replace(brain, facts=tuple({**f, 'evidence': [{'quote': 'Minh gặp Lan tại bến.'}]} for f in brain.facts))
    source = proposal('entity', {'canonical_name': 'Minh', 'normalized_name': 'minh', 'entity_type': 'PER'}, 2, 'retire')
    result = reconcile_proposals(brain, [source], 1, 'Minh ở nhà một mình.', ComparisonLLM({'decisions': [], 'removed_ids': ids}))
    repo.save_proposals('story', result)
    repo.accept_proposal_group('story', [p.proposal_id for p in result], 2)
    brain = repo.get_story_brain('story')
    assert not active_events(brain.events) and not active_facts(brain.facts)
    assert 'age' not in repo.get_current_state('story').get('entities', {}).get(minh.entity_id, {})


def test_stale_reconciliation_cannot_insert_after_other_group_changes_canon(repo):
    proposals, ids, _ = candidates(repo)
    # Use extracted proposals to activate the transactional canon-base guard.
    proposals = [replace(p, analysis_run_id=str(uuid.uuid4())) for p in proposals]
    planned = reconcile_proposals(repo.get_story_brain('story'), proposals, 1, 'text', ComparisonLLM({
        'decisions': [{'proposal_id': p.proposal_id, 'action': 'reuse', 'target_id': i, 'reason': 'same'} for p, i in zip(proposals, ids)]}))
    extra = proposal('event', {'event_type': 'departure', 'summary': 'Minh left', 'participants': ['Minh'], 'source_type': 'author'}, 2, 'extra')
    repo.save_proposals('story', [extra])
    repo.accept_proposal_group('story', [extra.proposal_id], 2)
    repo.save_proposals('story', planned)
    with pytest.raises(ProjectionError, match='Canon changed'):
        repo.accept_proposal_group('story', [p.proposal_id for p in planned], 3)


def test_replacement_retains_original_position_before_later_event(repo):
    _, _, ids, _ = seed(repo)
    later = proposal('event', {'event_type': 'departure', 'summary': 'Minh left after meeting',
        'participants': ['Minh'], 'source_type': 'author'}, 2, 'later')
    repo.save_proposals('story', [later])
    repo.accept_proposal_group('story', [later.proposal_id], 2)
    correction = proposal('event', {'event_type': 'meeting', 'summary': 'Meeting corrected', 'participants': ['Minh', 'Lan'],
        'supersedes_id': ids[0], 'source_type': 'author'}, 3, 'correction')
    repo.save_proposals('story', [correction])
    repo.accept_proposal_group('story', [correction.proposal_id], 3)
    events = repo.get_structured_context('story', chapter_number=1).recent_events
    assert [e['summary'] for e in events] == ['Meeting corrected', 'Minh left after meeting']


def test_retiring_status_fact_does_not_restore_obsolete_entity_default(repo):
    minh = next(e for e in repo.list_entities('story') if e.name == 'Minh')
    fact = proposal('fact', {'fact_key': 'status', 'fact_value': 'Dead', 'subject_entity_id': minh.entity_id,
                            'source_type': 'author'}, 1, 'status')
    repo.save_proposals('story', [fact])
    fact_id = repo.accept_proposal_group('story', [fact.proposal_id], 1)['canonical_artifact_ids'][0]
    retired = proposal('fact', {**fact.payload, 'supersedes_id': fact_id, 'is_retired': True}, 2, 'retired-status')
    repo.save_proposals('story', [retired])
    repo.accept_proposal_group('story', [retired.proposal_id], 2)
    assert next(e for e in repo.list_entities('story') if e.name == 'Minh').status == 'Unknown'
    assert 'status' not in repo.get_current_state('story').get('entities', {}).get(minh.entity_id, {})


@pytest.mark.parametrize('message,expected', [
    ('STRUCTURED_OUTPUT_TRUNCATED trace_id=00000000-4290-0000-0000-000000000000', False),
    ('provider error trace_id=00000000-4290-0000-0000-000000000000', False),
    ('HTTP 429 RESOURCE_EXHAUSTED', True),
])
def test_trace_ids_cannot_turn_schema_failures_into_quota_fallback(message, expected):
    from core.llm_service import LLMService
    assert LLMService._is_quota_error(RuntimeError(message)) is expected
