import hashlib
import json
import os
from unittest.mock import patch

import pytest

from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from core.settings import Settings
from domain.errors import AnalysisOutputError
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.entity_pipeline.candidates import CandidateInventory, chunks
from services.entity_pipeline.pipeline import EntityPipeline
from services.entity_pipeline.verification import verify_entities
from tests.test_state_projection import repo


class Verifier:
    model = 'offline-verifier'

    def __init__(self, rules=None, *, malformed=False, unresolved=False):
        self.calls = []
        self.rules = rules or {'An': ('An', 'PER'), 'Mai Linh': ('Mai Linh', 'PER'),
                               'CV-04': ('CV-04', 'ITEM'), 'trạm Bốn': ('trạm Bốn', 'LOC')}
        self.malformed = malformed
        self.unresolved = unresolved

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        self.calls.append((operation, user_prompt))
        if operation == 'entity_extraction':
            # Discovery misses everything: deterministic collection must rescue named entities.
            return '{"entities":[]}'
        if operation == 'event_extraction':
            return json.dumps({'events': [{'participants': ['Linh'], 'locations': [],
                'summary': 'Linh tới kho.', 'event_type': 'arrival', 'evidence_quote': 'Linh tới kho.'}]})
        if operation == 'prose_fact_extraction':
            return json.dumps({'facts': [{'subject': 'Linh', 'fact_key': 'location', 'fact_value': 'kho',
                'certainty': 'confirmed', 'quote': 'Linh tới kho.'}]})
        if operation == 'prose_fact_coverage':
            return '{"facts":[]}'
        assert operation == 'entity_candidate_verification'
        request = json.loads(user_prompt)
        decisions = []
        for c in request['candidates']:
            d = {'candidate_id': c['candidate_id'], 'verdict': 'not_entity', 'reason': 'Not a named entity in this context'}
            current_context = c['context'][c['start'] - c['context_start']:].casefold()
            if c['surface'] in self.rules and not current_context.startswith('an toàn'):
                name, kind = self.rules[c['surface']]
                d.update(verdict='entity', canonical_name=name, entity_type=kind, confidence=0.9)
                if c['surface'] != name:
                    d['identity_quote'] = 'Linh là tên gọi của Mai Linh.'
                target = next((e for e in request['known_entities'] if e['name'] == name), None)
                if target:
                    d['canonical_entity_id'] = target['entity_id']
            if self.unresolved and c['surface'] == 'An':
                d = {'candidate_id': c['candidate_id'], 'verdict': 'unresolved', 'reason': 'Identity is ambiguous'}
            decisions.append(d)
        if self.malformed:
            decisions = decisions[:-1]
        return json.dumps({'decisions': decisions}, ensure_ascii=False)


def extract(text, llm, **kwargs):
    return verify_entities(text, llm, lambda source, model: [], **kwargs)


def service(text, llm, repository=None):
    repository = repository or InMemoryNarrativeRepository()
    revision = RevisionContent('revision-candidates', 'story', 'chapter', text,
                               hashlib.sha256(text.encode()).hexdigest(), 1)
    analysis = RevisionAnalysisService(repository, InMemoryRevisionContentProvider([revision]),
        EntityPipeline(candidate_verification_enabled=True), llm)
    args = dict(tenant_id=getattr(repository, '_tenant_id', 't'), novel_id='story', chapter_id='chapter',
        revision_id=revision.revision_id, content_hash=revision.content_hash, operation='test',
        idempotency_key='candidate-test', options={'extract_events': False, 'extract_prose_facts': False})
    return repository, analysis, args


def test_collects_titles_unicode_identifiers_and_lowercase_known_aliases():
    text = '🙂 Mai Linh gặp ông Hòa ở trạm Bốn. Mã CV-04 còn nguyên. chiếc vòng được giữ lại.'
    inventory = CandidateInventory(text).collect(['chiếc vòng'])
    items = inventory.items
    assert {'Mai Linh', 'ông Hòa', 'trạm Bốn', 'CV-04', 'chiếc vòng'} <= {c.surface for c in items}
    for c in items:
        assert text[c.start:c.end] == c.surface
        assert text[c.context_start:c.context_end] == c.context
    assert len({(c.start, c.end) for c in items}) == len(items)


@pytest.mark.parametrize('prefix', ['Đi cho an toàn. ', 'An toàn là trên hết. '])
def test_occurrence_decision_does_not_anchor_an_to_an_toan(prefix):
    text = prefix + 'An đến bến.'
    known = [{'entity_id': 'an-id', 'name': 'An', 'entity_type': 'PER'}]
    result = extract(text, Verifier(), known_entities=known)
    assert len(result.entities) == 1
    entity = result.entities[0]
    assert entity['verified_start'] == text.index('An đến')
    candidates = {c['candidate_id']: c for c in result.audit['candidates']}
    false_mention = next(c for c in candidates.values() if c['surface'].casefold() == 'an' and c['start'] < len(prefix))
    assert next(d for d in result.audit['decisions'] if d['candidate_id'] == false_mention['candidate_id'])['verdict'] == 'not_entity'


def test_deterministic_candidates_rescue_names_omitted_by_discovery():
    result = extract('Mai Linh mang CV-04 tới trạm Bốn.', Verifier())
    assert {e['phrase'] for e in result.entities} == {'Mai Linh', 'CV-04', 'trạm Bốn'}
    assert len(result.audit['decisions']) == len(result.audit['candidates'])
    assert result.audit['status'] == 'completed'


def test_unresolved_is_retained_and_never_forwarded_as_entity():
    result = extract('An đến bến.', Verifier(unresolved=True))
    assert result.entities == []
    assert result.audit['counts']['unresolved'] == 1


def test_alias_is_reviewable_and_does_not_create_an_extra_identity():
    llm = Verifier({'Mai Linh': ('Mai Linh', 'PER'), 'Linh': ('Mai Linh', 'PER')})
    result = extract('Linh là tên gọi của Mai Linh. Linh tới kho.', llm)
    assert [e['phrase'] for e in result.entities] == ['Mai Linh']
    assert {a['alias'] for a in result.aliases} == {'Linh'}
    assert all(a['identity_quote'] == 'Linh là tên gọi của Mai Linh.' for a in result.aliases)


def test_incomplete_decisions_repair_is_bounded_and_audit_preserves_failure():
    saved = []
    llm = Verifier(malformed=True)
    with pytest.raises(AnalysisOutputError, match='incomplete or invalid') as caught:
        extract('An tới trạm Bốn.', llm, audit_sink=lambda a: saved.append(json.loads(json.dumps(a))))
    assert caught.value.attempts == 2
    assert len(llm.calls) == 2
    assert saved[-1]['status'] == 'failed'
    assert saved[-1]['candidates']


def test_same_short_alias_for_different_people_is_not_silently_merged_or_dropped():
    text = 'Linh là tên gọi của Mai Linh. Linh là tên gọi của Nguyễn Linh.'
    class Ambiguous(Verifier):
        def _call_structured(self, **kwargs):
            request = json.loads(kwargs['user_prompt'])
            result = json.loads(super()._call_structured(**kwargs))
            by_id = {c['candidate_id']: c for c in request['candidates']}
            for d in result['decisions']:
                c = by_id[d['candidate_id']]
                if c['surface'] == 'Linh':
                    canonical = 'Mai Linh' if c['start'] < text.index('Linh là', 1) else 'Nguyễn Linh'
                    d.update(verdict='entity', canonical_name=canonical, entity_type='PER',
                             identity_quote=f'Linh là tên gọi của {canonical}.')
            return json.dumps(result)
    saved = []
    with pytest.raises(AnalysisOutputError, match='multiple entities'):
        extract(text, Ambiguous({'Mai Linh': ('Mai Linh', 'PER'), 'Nguyễn Linh': ('Nguyễn Linh', 'PER')}),
                audit_sink=lambda a: saved.append(json.loads(json.dumps(a))))
    assert saved[-1]['status'] == 'failed'


@pytest.mark.parametrize('bad', ['duplicate', 'foreign_id', 'invented_identity', 'wrong_type', 'forged_alias_quote'])
def test_invalid_verdicts_cannot_sneak_through(bad):
    class Invalid(Verifier):
        def _call_structured(self, **kwargs):
            result = json.loads(super()._call_structured(**kwargs))
            d = next(x for x in result['decisions'] if x['verdict'] == 'entity')
            if bad == 'duplicate': result['decisions'].append(dict(d))
            if bad == 'foreign_id': d['canonical_entity_id'] = 'other-tenant-entity'
            if bad == 'invented_identity': d['canonical_name'] = 'Invented Person'
            if bad == 'wrong_type': d['entity_type'] = 'ALIEN'
            if bad == 'forged_alias_quote':
                d['canonical_name'] = 'Bến';d['identity_quote'] = 'An chính là Bến.'
            return json.dumps(result)
    with pytest.raises(AnalysisOutputError):
        extract('An đến Bến.', Invalid())


def test_chunk_boundaries_preserve_source_and_names_with_overlap():
    text = '🙂 ' + 'đá ' * 22 + 'Mai Linh tới trạm Bốn.\n' + 'nước ' * 34
    parts = chunks(text, size=80, overlap=16)
    covered = set()
    for p in parts:
        assert p.text == text[p.start:p.end]
        covered.update(range(p.start, p.end))
    assert covered == set(range(len(text)))
    assert any('Mai Linh' in p.text for p in parts)


def test_decomposed_unicode_keeps_exact_original_occurrence():
    import unicodedata
    name = unicodedata.normalize('NFD', 'Hòa')
    text = '🙂 ' + name + ' tới bến.'
    result = extract(text, Verifier({name: (name, 'PER')}))
    entity = result.entities[0]
    assert text[entity['verified_start']:entity['verified_end']] == name
    assert entity['verified_start'] == 2


def test_limits_are_explicit_not_silent_truncation():
    with pytest.raises(AnalysisOutputError, match='silently discarded'):
        CandidateInventory('An Duy Linh Hòa.', maximum=2).collect()


def test_no_such_discovery_name_is_recorded_not_promoted():
    result = verify_entities('An tới.', Verifier(),
        lambda *_: [{'phrase': 'An'}, {'phrase': 'Invented Person'}])
    assert result.audit['unanchored_discoveries'][0]['name'] == 'Invented Person'
    assert [e['phrase'] for e in result.entities] == ['An']


def test_revision_uses_verified_occurrence_and_persists_audit_without_canon_write():
    repository, analysis, args = service('Đi cho an toàn. An tới trạm Bốn.', Verifier())
    result = analysis.analyze(**args)
    assert result.status == 'waiting_entity_review'
    audit = repository.get_entity_candidate_audit('story', result.analysis_run.run_id)
    analysis.review_entities('story', result.analysis_run.run_id, tenant_id='t',
        decisions=audit['decisions'], expected_version=audit['review_version'])
    result = analysis.continue_entity_review('story', result.analysis_run.run_id, tenant_id='t')
    an = next(p for p in result.proposals if p.payload.get('canonical_name') == 'An')
    assert an.evidence[0]['start'] == len('Đi cho an toàn. ')
    assert not repository.list_entities('story')
    audit = repository.get_entity_candidate_audit('story', result.analysis_run.run_id)
    assert audit['revision_id'] == 'revision-candidates'
    assert audit['counts']['candidates'] == len(audit['decisions'])
    assert analysis.analyze(**args).deduplicated


@pytest.mark.parametrize('mode', ['malformed', 'unresolved'])
def test_bad_or_unresolved_verification_stops_before_event_fact_or_partial_proposals(mode):
    llm = Verifier(malformed=mode == 'malformed', unresolved=mode == 'unresolved')
    repository, analysis, args = service('An tới trạm Bốn.', llm)
    args['options'] = {'extract_events': True, 'extract_prose_facts': True}
    if mode == 'malformed':
        with pytest.raises(AnalysisOutputError):
            analysis.analyze(**args)
    else:
        assert analysis.analyze(**args).status == 'waiting_entity_review'
    assert repository.list_proposals('story') == []
    assert repository.list_entities('story') == []
    assert not any(op in {'event_extraction', 'prose_fact_extraction'} for op, _ in llm.calls)


def test_alias_names_flow_to_event_and_fact_canonical_subjects_then_review():
    llm = Verifier({'Mai Linh': ('Mai Linh', 'PER'), 'Linh': ('Mai Linh', 'PER')})
    repository, analysis, args = service('Linh là tên gọi của Mai Linh. Linh tới kho.', llm)
    args['options'] = {'extract_events': True, 'extract_prose_facts': True}
    result = analysis.analyze(**args)
    audit = repository.get_entity_candidate_audit('story', result.analysis_run.run_id)
    analysis.review_entities('story', result.analysis_run.run_id, tenant_id='t',
        decisions=audit['decisions'], expected_version=audit['review_version'])
    result = analysis.continue_entity_review('story', result.analysis_run.run_id, tenant_id='t')
    event = next(p for p in result.proposals if p.proposal_type == 'event')
    fact = next(p for p in result.proposals if p.proposal_type == 'fact')
    assert event.payload['participants'] == ['Mai Linh']
    assert fact.payload['subject_entity_name'] == 'Mai Linh'
    assert not repository.list_entities('story')
    repository.accept_proposal_group('story', [p.proposal_id for p in result.proposals], 1)
    brain = repository.get_story_brain('story')
    assert [e.name for e in brain.entities] == ['Mai Linh']
    assert any(a.alias == 'Linh' for a in brain.aliases)


def test_audit_storage_and_alias_review_across_repositories(repo):
    from domain.models import NarrativeProposal
    run = repo.get_or_create_analysis_run('story', idempotency_key=f"{getattr(repo, '_tenant_id', 't')}:audit",
        input_hash='hash', operation='test', pipeline_version='entity-candidates-v1')
    audit = {'status': 'completed', 'decisions': [{'verdict': 'not_entity'}]}
    repo.save_entity_candidate_audit('story', run.run_id, audit)
    audit['status'] = 'mutated'
    assert repo.get_entity_candidate_audit('story', run.run_id)['status'] == 'completed'
    assert 'entity_candidate_audit' not in json.dumps(repo.get_story_brain('story').metadata)
    assert repo.get_entity_candidate_audit('other-story', run.run_id) is None
    original = repo.get_entity_candidate_audit('story', run.run_id)
    original['status'] = 'mutated-again'
    assert repo.get_entity_candidate_audit('story', run.run_id)['status'] == 'completed'
    prop = NarrativeProposal('candidate-alias', 'alias', {'entity_name': 'Minh', 'alias': 'M'}, dependency_group_id='alias')
    repo.save_proposals('story', [prop])
    repo.accept_proposal_group('story', [prop.proposal_id], 1)
    assert any(a.alias == 'M' for a in repo.get_story_brain('story').aliases)
    assert repo.get_entity_candidate_audit('story', run.run_id)['status'] == 'completed'


def test_feature_flag_defaults_off_and_is_opt_in():
    with patch.dict(os.environ, {}, clear=True):
        assert not Settings.from_env().entity_candidate_verification_enabled
    with patch.dict(os.environ, {'ENTITY_CANDIDATE_VERIFICATION_ENABLED': 'true'}, clear=True):
        assert Settings.from_env().entity_candidate_verification_enabled
