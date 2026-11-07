"""Setup-v1 contracts, source validation and provider privacy; no live providers."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import uuid
import pytest
from pydantic import ValidationError
from api.setup_schemas import SetupRequest
from application.setup_service import SetupService, SetupFailure, digest, public_job
from tests.test_p2_bootstrap_guard import fixture, TENANT


def request_data(novel=None, **changes):
    value = dict(contract_version='setup-v1', novel_id=novel or str(uuid.uuid4()), mode='extract',
        idempotency_key='operation', expected_setup_version=0,
        setup=dict(text='', declarations=[dict(declaration_id='one',entity_type='character',display_name='Minh'),
            dict(declaration_id='two',entity_type='character',display_name='Minh')],
            world_rules=[dict(declaration_id='rule',text='Không ai bay được.')], initial_conditions=[]),
        hints=[dict(name='HintOnly')], outline='OutlineOnly betrays someone in chapter 8',
        private_author_notes=['PrivateOnly'], author_constraints=['ConstraintOnly'])
    value.update(changes)
    return value


def service(provider=None):
    _, bootstrap, _, _ = fixture()
    bootstrap._llm_service = provider
    return SetupService(bootstrap)


def test_structured_offline_cards_keep_homonyms_separate_and_no_private_candidates():
    request = SetupRequest.model_validate(request_data())
    cards, raw = service().candidates(request.model_dump(exclude_none=True))
    assert [c['payload'].get('canonical_name') for c in cards[:2]] == ['Minh','Minh']
    assert cards[0]['source_refs'] != cards[1]['source_refs']
    assert all(c['origin']=='author_declared' for c in cards)
    assert raw is None and len(cards)==3
    assert not any(secret in json.dumps(cards) for secret in ['PrivateOnly','HintOnly','OutlineOnly','ConstraintOnly'])


def test_extract_provider_sees_only_exact_text_and_locale_with_unicode_offsets():
    text = '😀 e\u0301 Minh ở An Thành.'
    def extract(**kw):
        assert kw == {'text':text,'locale':'vi-VN'}
        return dict(entities=[dict(entity_type=kind,display_name=name,source_ref=dict(kind='setup_span',
            field_path='/setup/text',offset_kind='unicode_codepoints',start=text.index(name),
            end=text.index(name)+len(name),quote=name)) for kind,name in [('character','Minh'),('location','An Thành')]],world_rules=[])
    data=request_data(); data['setup']['text']=text
    cards,_=service(SimpleNamespace(extract_setup_text=extract)).candidates(SetupRequest.model_validate(data).model_dump(exclude_none=True))
    assert [c['origin'] for c in cards[-2:]]==['extracted_explicit']*2
    assert cards[-1]['payload']['entity_type']=='location'


@pytest.mark.parametrize('change', ['quote','offset','path','name','type','authority','empty'])
def test_fabricated_or_invalid_extract_output_fails_closed(change):
    text='Minh ở An Thành.'
    item=dict(entity_type='character',display_name='Minh',source_ref=dict(kind='setup_span',
        field_path='/setup/text',offset_kind='unicode_codepoints',start=0,end=4,quote='Minh'))
    if change=='quote': item['source_ref']['quote']='Lan'
    if change=='offset': item['source_ref']['end']=99
    if change=='path': item['source_ref']['field_path']='/outline'
    if change=='name': item['display_name']='PrivateOnly'
    if change=='type': item['entity_type']='event'
    if change=='authority': item['entity_id']=str(uuid.uuid4())
    output=dict(entities=[] if change=='empty' else [item],world_rules=[])
    data=request_data();data['setup']['text']=text
    with pytest.raises((SetupFailure,ValidationError)):
        service(SimpleNamespace(extract_setup_text=lambda **kw:output)).candidates(SetupRequest.model_validate(data).model_dump(exclude_none=True))


def test_provider_unavailable_is_not_empty_extraction_success():
    data=request_data();data['setup']['text']='Prose requiring NLP'
    with pytest.raises(SetupFailure,match='SETUP_EXTRACT_PROVIDER_UNAVAILABLE'):
        service().candidates(SetupRequest.model_validate(data).model_dump(exclude_none=True))


def test_blueprint_has_separate_allowlist_and_model_origin():
    def blueprint(**kw):
        assert set(kw)=={'setup','outline','preferences','locale'}
        assert not any(secret in json.dumps(kw) for secret in ['PrivateOnly','ConstraintOnly','HintOnly'])
        return dict(entities=[dict(entity_type='character',display_name='CreativeName')],world_rules=['Creative rule'])
    data=SetupRequest.model_validate(request_data(mode='blueprint')).model_dump(exclude_none=True)
    cards,raw=service(SimpleNamespace(suggest_setup_blueprint=blueprint)).candidates(data)
    assert len(cards)==5 and all(c['origin']=='model_proposed' for c in cards[-2:])
    assert all(c['source_refs']==[{'kind':'model_suggestion'}] for c in cards[-2:])
    assert raw['entities'][0]['display_name']=='CreativeName'


def test_rc1_request_examples_and_unicode_vectors_preserved():
    # The original proposed DTO fixture cases remain intact, not renamed into runtime PASS.
    path=Path(__file__).resolve().parents[2]/'docs/development/p2/setup-v1-rc1/fixtures.json'
    fixture_data=json.loads(path.read_text(encoding='utf-8'))
    for case in fixture_data['schema_cases']:
        if case['dto'] == 'request':
            if case['valid']:
                SetupRequest.model_validate(case['value'])
            else:
                with pytest.raises(ValidationError):
                    SetupRequest.model_validate(case['value'])
    for vector in fixture_data['reference_vectors']:
        assert digest(vector['setup']) == vector['setup_hash']
        for span in vector['spans']:
            SetupService.validate_span(vector['setup']['text'], span)
    data=request_data()
    original=deepcopy(data)
    data['setup']['text']='e\u0301 😀'
    assert digest(data['setup']) != digest({**data['setup'],'text':'é 😀'})
    assert data['private_author_notes']==original['private_author_notes']


@pytest.mark.parametrize('mutation', ['unknown','alias','nested','version','key','duplicate','subject'])
def test_strict_request_and_source_integrity(mutation):
    data=request_data()
    if mutation=='unknown':data['status']='accepted'
    if mutation=='alias':data['idea']='alternate source'
    if mutation=='nested':data['setup']['declarations'][0]['entity_id']=str(uuid.uuid4())
    if mutation=='version':data['expected_setup_version']=True
    if mutation=='key':del data['idempotency_key']
    if mutation=='duplicate':data['setup']['declarations'][1]['declaration_id']='one'
    if mutation=='subject':data['setup']['initial_conditions']=[dict(declaration_id='condition',subject_declaration_id='foreign',attribute_key='hp',value=1)]
    with pytest.raises(ValidationError):SetupRequest.model_validate(data)


def test_json_and_inmemory_production_dispatch_fail_closed_before_provider():
    svc=service(SimpleNamespace(extract_setup_text=lambda **kw:pytest.fail('provider called')))
    with pytest.raises(SetupFailure,match='SETUP_REQUIRES_POSTGRES'):
        svc.start(SetupRequest.model_validate(request_data()),tenant_id=TENANT,actor_id=str(uuid.uuid4()))
