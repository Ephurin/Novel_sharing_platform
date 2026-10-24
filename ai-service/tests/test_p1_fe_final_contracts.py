"""Independent FE-19 audit: correction authority and offline shared tooling."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from io import BytesIO
import http.client
from http.server import ThreadingHTTPServer
import threading
from urllib.error import HTTPError

import pytest

from tests.test_p1_memory_entity_hitl import flow
from tests.test_p1_contract_alignment import pending, accept, snapshot

ROOT = Path(__file__).resolve().parents[2]


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'Pipeline_test/tools' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_offline_events_quote_exact_source_and_use_reviewed_identity_ids():
    fake = load_tool('fake_provider_upstream')
    source = 'Bác sĩ Minh gặp tài xế Minh.'
    payload = {'source_text': source, 'known_entities': [
        {'entity_id': 'id-doctor', 'name': 'Minh', 'entity_type': 'PER'},
        {'entity_id': 'id-driver', 'name': 'Minh', 'entity_type': 'PER'}]}
    prompt = 'Extract narrative events only from this source and the reviewed inventory.'
    output = json.loads(fake.integration_response(prompt, {'messages': [{'role': 'user', 'content': json.dumps(payload)}]}))
    assert output['events'][0]['quote'] == source
    assert output['events'][0]['participants'] == ['id-doctor', 'id-driver']
    assert output['events'][0]['summary'] == source


def test_offline_candidate_dispatch_does_not_match_a_prose_keyword():
    fake = load_tool('fake_provider_upstream')
    payload = {'candidates': [{'candidate_id': 'c1', 'surface': 'Minh', 'context': 'transitions'}]}
    result = json.loads(fake.integration_response('Verify EVERY supplied candidate OCCURRENCE. transitions',
        {'messages': [{'role': 'user', 'content': json.dumps(payload)}]}))
    assert result['decisions'][0]['candidate_id'] == 'c1'
    assert result['decisions'][0]['canonical_entity_id'] == ''


@pytest.mark.parametrize('prompt,body', [
    ('ordinary prose contains transitions', None),
    ('Verify EVERY supplied candidate OCCURRENCE', {'messages': [{'content': 'invalid json'}]}),
])
def test_offline_unsupported_or_malformed_prompts_fail_closed(prompt, body):
    with pytest.raises(ValueError):
        load_tool('fake_provider_upstream').integration_response(prompt, body)


@pytest.mark.parametrize('method', ['GET', 'POST', 'PATCH'])
def test_test_ingress_has_fixed_destination_and_no_credentialed_cors_reflection(monkeypatch, method):
    ingress = load_tool('headless_http_ingress')
    calls = []
    def upstream(req, **kwargs):
        calls.append((req.full_url, req.method))
        raise HTTPError(req.full_url, 409, 'conflict', {'Content-Type': 'application/json'}, BytesIO(b'{"conflict":true}'))
    monkeypatch.setattr(ingress.request, 'urlopen', upstream)
    server = ThreadingHTTPServer(('127.0.0.1', 0), ingress.Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        client = http.client.HTTPConnection(*server.server_address)
        client.request(method, '/api/v1/chapters/owned', headers={'Origin': 'https://untrusted.invalid'})
        response = client.getresponse()
        assert response.status == 409 and json.loads(response.read()) == {'conflict': True}
        assert response.getheader('Access-Control-Allow-Origin') is None
        assert response.getheader('Access-Control-Allow-Credentials') is None
        assert calls == [('http://backend:4000/api/v1/chapters/owned', method)]
        client.close()
    finally:
        server.shutdown(); server.server_close(); worker.join()


def test_correction_author_marker_preserves_original_revision_and_requires_separate_canon(flow):
    f = flow
    assert accept(f, pending(f)).status_code == 200
    original = deepcopy(f.repo.get_story_brain(f.revision.novel_id).events[0])
    memory_before = f.client.get(f'{f.base}/memory', headers=f.headers).json()
    body = {'expected_brain_version': 2, 'replacement': {'event_type': original.event_type,
        'summary': 'Explicit author correction', 'participants': list(original.participants)}, 'transitions': []}
    response = f.client.post(f'{f.base}/events/{original.event_id}/corrections', headers=f.headers, json=body)
    assert response.status_code == 201, response.text
    proposals = [p for p in f.repo.list_proposals(f.revision.novel_id) if p.status.value == 'pending']
    assert len(proposals) == 1 and proposals[0].payload['source_type'] == 'author'
    assert proposals[0].evidence == tuple(original.metadata['evidence'])
    assert proposals[0].payload['supersedes_id'] == original.event_id
    assert proposals[0].evidence[0]['revision_id'] == f.revision.revision_id
    assert f.client.get(f'{f.base}/memory', headers=f.headers).json() == memory_before
    assert accept(f, proposals, version=2).status_code == 200
    current = f.repo.get_story_brain(f.revision.novel_id)
    corrected = next(e for e in current.events if e.summary == 'Explicit author correction')
    assert corrected.metadata['evidence'] == original.metadata['evidence']
    assert corrected.metadata['supersedes_id'] == original.event_id
    assert int(current.metadata['brain_version']) == 3
    for field in ('source_type', 'evidence', 'revision_id'):
        before = snapshot(f, 'FE19-invalid-before-' + field)
        bad = deepcopy(body)
        bad['expected_brain_version'] = 3
        bad['replacement'][field] = 'forged'
        assert f.client.post(f'{f.base}/events/{corrected.event_id}/corrections', headers=f.headers, json=bad).status_code == 422
        assert snapshot(f, 'FE19-invalid-after-' + field) == before
