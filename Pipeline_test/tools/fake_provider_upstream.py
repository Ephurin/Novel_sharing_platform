"""A separate, text-only HTTP upstream for Wave 1D. NEVER forwards traffic."""
import hashlib
import json
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def integration_response(text, body=None, *, scenario=None):
    """Scripted source-grounded responses for integration's legacy prompt framing.
    Not model quality or real-provider evidence. Unknown prompts fail explicitly.
    """
    messages = (body or {}).get('messages', [])
    system = '\n'.join(str(m.get('content', '')) for m in messages if m.get('role') == 'system') or text
    def payload():
        users = [m for m in messages if m.get('role') == 'user']
        if not users:
            raise ValueError('Offline structured fixture requires a user JSON payload')
        return json.loads(users[-1]['content'])
    if 'Verify EVERY supplied candidate OCCURRENCE' in system:
        data = payload()
        # With an existing inventory the fake cannot establish identity. Leave every
        # occurrence unresolved for explicit human canonical/provisional selection.
        known = bool(data.get('known_entities'))
        return json.dumps({'decisions': [dict(candidate_id=c['candidate_id'], verdict='unresolved' if known else 'entity',
            entity_type=None if known else ('LOC' if c['surface'] == 'Cồn Vân' else 'PER'), canonical_name='' if known else c['surface'],
            canonical_entity_id='', provisional_identity_key='', identity_quote='',
            initial_status='Unknown', status_quote='', confidence=0.9,
            reason='Offline fixture suggestion; explicit human identity review required')
            for c in data['candidates']]}, ensure_ascii=False)
    if 'Extract narrative events only from this source' in system:
        data = payload()
        source = data['source_text']
        if not isinstance(source, str) or not source.strip():
            raise ValueError('Offline event fixture requires nonempty immutable source')
        return json.dumps({'events': [dict(event_type='observation', summary=source, quote=source,
            participants=[e['entity_id'] for e in data['known_entities'] if e['entity_type'] == 'PER'],
            locations=[e['entity_id'] for e in data['known_entities'] if e['entity_type'] == 'LOC'],
            consequences=[])]}, ensure_ascii=False)
    if 'Extract atomic narrative facts directly from the prose' in system:
        return json.dumps({'facts': []})
    if ('Extract only state changes explicitly supported by this event' in system
            or 'Extract only explicit state changes supported by this event' in system):
        return json.dumps({'transitions':[]})
    if 'narrative state extractor' in text:
        return json.dumps({'states':[]})
    if 'expert fantasy novel analyst' in text:
        source=text.split('Text to analyze:\n\n',1)[1]
        names=[('Mai Linh','PER'),('Duy','PER'),('Cồn Vân','LOC'),('Lâm Phong','PER'),('Tô Mặc','PER'),('Thanh Phong','LOC'),('Thiên Kiếm Tông','ORG'),('Huyết Ngọc Bội','ITEM')]
        return json.dumps([{'phrase':n,'entity':t,'score':9} for n,t in names if n in source],ensure_ascii=False)
    if 'narrative event extractor' in text:
        source=text.split('Text passage: ',1)[1].split('\nKnown entities:',1)[0]
        return json.dumps({'events':[{'event_type':'observation','participants':[n for n in ['Mai Linh','Duy'] if n in source],
          'locations':['Cồn Vân'] if 'Cồn Vân' in source else [],'summary':source.split('\n\n',1)[0],
          'emotion_tags':[],'importance_score':0.5,'consequences':[]}]},ensure_ascii=False)
    if 'Story Brain' in text or 'Author AI Copilot' in text:
        if 'Lâm Phong' in text or 'Thanh Phong' in text:
            return json.dumps({'draft_text':'Lâm Phong giữ chặt Huyết Ngọc Bội trong tay áo, lặng lẽ quan sát Tô Mặc giữa trấn Thanh Phong.',
              'explanation':'FAKE_PROVIDER_OUTPUT scripted continuation for P1 live safety fixture'},ensure_ascii=False)
        return json.dumps({'draft_text':'Mai Linh đặt một thẻ giấy ghi “kiểm tra micro” cạnh máy thu.\n\nDuy đứng bên Mai Linh tại Cồn Vân.',
          'explanation':'FAKE_PROVIDER_OUTPUT scripted continuation for persistence only'},ensure_ascii=False)
    if scenario in ('p1-live-safety-v1', 'wave1d-negative-only'):
        return 'Separate fake upstream response.'
    raise ValueError('Unsupported integration fake prompt')


class FakeHandler(BaseHTTPRequestHandler):
    received = []
    lock = threading.Lock()
    expected_key = 'fake-upstream-only'
    log_path = None
    scenario = 'wave1d-negative-only'

    def reply(self, status, body):
        data = json.dumps(body).encode()
        try:
            self.send_response(status); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass

    def do_GET(self):
        if self.path == '/received': return self.reply(200, self.received)
        if self.path == '/v1/models':
            if self.headers.get('Authorization') != 'Bearer ' + self.expected_key or not self.headers.get('X-Gateway-Dispatch-Id'):
                return self.reply(403, {'error': 'Gateway-only metadata access'})
            entry = {'path': self.path, 'dispatch_id': self.headers['X-Gateway-Dispatch-Id'],
                     'client': self.headers['X-Gateway-Client'], 'upstream_auth_valid': True}
            with self.lock:
                self.received.append(entry)
                if self.log_path:
                    with Path(self.log_path).open('a', encoding='utf-8') as stream: stream.write(json.dumps(entry) + '\n')
            return self.reply(200, {'data': [{'id': 'gemini-3.5-flash-lite'}]})
        self.reply(404, {})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        native = self.path.startswith('/v1beta/models/') and self.path.endswith(':generateContent')
        auth = self.headers.get('x-goog-api-key') if native else self.headers.get('Authorization', '').removeprefix('Bearer ')
        if auth != self.expected_key or not self.headers.get('X-Gateway-Dispatch-Id'):
            return self.reply(403, {'error': 'Gateway-only upstream credential required'})
        if native:
            config = body['generationConfig']
            assert isinstance(config['maxOutputTokens'], int)
            text = '\n'.join(p.get('text', '') for c in body['contents'] for p in c['parts'])
            if config.get('responseMimeType') == 'application/json':
                schema = config.get('responseJsonSchema', {})
                props = schema.get('properties', {})
                if self.scenario in ('p123-core-v1', 'p123-next-v1','p123-p3-v1') and 'removed_ids' in props:
                    try:
                        from .fake_p123_scenario import reconciliation
                    except ImportError:
                        from fake_p123_scenario import reconciliation
                    output = reconciliation(text)
                elif 'decisions' in props:
                    request = json.loads(text.split('\n\n')[-1])
                    output = {'decisions': [{'candidate_id': c['candidate_id'], 'verdict': 'not_entity',
                        'reason': 'Offline deterministic fixture, not a quality verdict'} for c in request['candidates']]}
                    if self.scenario == 'wave1e-mixed-v1':
                        try:
                            from .fake_entity_scenario import mixed_decisions
                        except ImportError:
                            from fake_entity_scenario import mixed_decisions
                        output = mixed_decisions(request)
                    elif self.scenario == 'p1-live-safety-v1':
                        known_map = {
                            'Lâm Phong': 'PER',
                            'Tô Mặc': 'PER',
                            'Thanh Phong': 'LOC',
                            'Trấn Thanh Phong': 'LOC',
                            'Thiên Kiếm Tông': 'ORG',
                            'Huyết Ngọc Bội': 'ITEM',
                        }
                        decisions = []
                        for c in request['candidates']:
                            surf = c.get('surface', '')
                            if surf in known_map:
                                etype = known_map[surf]
                                decisions.append({
                                    'candidate_id': c['candidate_id'],
                                    'verdict': 'entity',
                                    'entity_type': etype,
                                    'canonical_name': surf,
                                    'canonical_entity_id': '',
                                    'provisional_identity_key': '',
                                    'identity_quote': '',
                                    'initial_status': 'Unknown',
                                    'status_quote': '',
                                    'confidence': 0.92,
                                    'reason': 'Deterministic fake-upstream verification for P1-LIVE-SAFETY-01',
                                })
                            else:
                                decisions.append({
                                    'candidate_id': c['candidate_id'],
                                    'verdict': 'not_entity',
                                    'entity_type': None,
                                    'canonical_name': '',
                                    'canonical_entity_id': '',
                                    'provisional_identity_key': '',
                                    'identity_quote': '',
                                    'initial_status': 'Unknown',
                                    'status_quote': '',
                                    'confidence': 0.9,
                                    'reason': 'Deterministic fake-upstream non-entity',
                                })
                        output = {'decisions': decisions}
                elif 'events' in props:
                    if self.scenario == 'p1-live-safety-v1' and ('Lâm Phong' in text or 'Thanh Phong' in text):
                        req_payload = json.loads(text.split('\n\n')[-1])
                        src = req_payload.get('source_text', '')
                        quote = src.split('.')[0].strip() + '.' if '.' in src else src[:120]
                        output = {'events': [{
                            'event_type': 'encounter',
                            'summary': 'Lâm Phong gặp Tô Mặc tại trấn Thanh Phong.',
                            'quote': quote,
                            'participants': [e['entity_id'] for e in req_payload.get('known_entities', []) if e.get('entity_type') == 'PER'],
                            'locations': [e['entity_id'] for e in req_payload.get('known_entities', []) if e.get('entity_type') == 'LOC'],
                            'consequences': [],
                        }]}
                    else:
                        output = {'events': []}
                elif 'facts' in props: output = {'facts': []}
                else: output = {'entities': []}
                if self.scenario in ('wave1f-grounded-v1', 'p123-core-v1','p123-next-v1','p123-p3-v1') and 'removed_ids' not in props:
                    try:
                        from .fake_wave1f_scenario import output as wave1f_output
                    except ImportError:
                        from fake_wave1f_scenario import output as wave1f_output
                    output=wave1f_output(props,text)
                if self.scenario in ('p123-next-v1','p123-p3-v1'):
                    try:
                        from .fake_p123_next_scenario import setup_output
                    except ImportError:
                        from fake_p123_next_scenario import setup_output
                    output = setup_output(text, output)
                content = json.dumps(output)
            elif 'expert fantasy novel analyst' in text:
                source = text.split('Text to analyze:\n\n', 1)[1]
                names = [
                    ('Mai Linh', 'PER'),
                    ('Duy', 'PER'),
                    ('Cồn Vân', 'LOC'),
                    ('Lâm Phong', 'PER'),
                    ('Tô Mặc', 'PER'),
                    ('Thanh Phong', 'LOC'),
                    ('Thiên Kiếm Tông', 'ORG'),
                    ('Huyết Ngọc Bội', 'ITEM'),
                ]
                content = json.dumps(
                    [{'phrase': n, 'entity': t, 'score': 9} for n, t in names if n in source],
                    ensure_ascii=False,
                )
            elif 'Story Brain' in text or 'Author AI Copilot' in text:
                if 'Lâm Phong' in text or 'Thanh Phong' in text:
                    content = json.dumps({
                        'draft_text': 'Lâm Phong giữ chặt Huyết Ngọc Bội trong tay áo, lặng lẽ quan sát Tô Mặc giữa trấn Thanh Phong.',
                        'explanation': 'FAKE_PROVIDER_OUTPUT scripted continuation for P1 live safety fixture'
                    }, ensure_ascii=False)
                else:
                    content = json.dumps({
                        'draft_text': 'Mai Linh tiếp tục theo dõi các chỉ số tín hiệu trên màn hình máy thu CV-04.',
                        'explanation': 'Tiếp tục mạch truyện phù hợp bối cảnh'
                    })
            else:
                content = 'Separate fake upstream response.'
            if 'fault:empty' in text:
                content = ''
            if self.scenario in ('p123-next-v1','p123-p3-v1'):
                try:
                    from .fake_p123_next_scenario import response_text
                except ImportError:
                    from fake_p123_next_scenario import response_text
                content = response_text(text, content)
            if self.scenario == 'p123-p3-v1':
                try:
                    from .fake_p3_scenario import response as p3_response
                except ImportError:
                    from fake_p3_scenario import response as p3_response
                content = p3_response(text, content)
            result = {'candidates': [{'content': {'role': 'model', 'parts': [{'text': content}]},
                                      'finishReason': 'STOP'}],
                      'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 10, 'totalTokenCount': 20},
                      'modelVersion': 'gemini-3.5-flash-lite', 'responseId': self.headers['X-Gateway-Dispatch-Id']}
        else:
            assert self.path == '/v1/chat/completions' and body['max_tokens'] > 0
            text = '\n\n'.join(str(m.get('content','')) for m in body['messages'])
            content = '' if 'fault:empty' in text else integration_response(text, body, scenario=self.scenario)
            config = {'max_tokens': body['max_tokens']}
            result = {'id': self.headers['X-Gateway-Dispatch-Id'], 'object': 'chat.completion',
                      'created': int(time.time()), 'model': body['model'],
                      'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}],
                      'usage': {'prompt_tokens': 10, 'completion_tokens': 10, 'total_tokens': 20}}
        entry = {'path': self.path, 'request_sha256': hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
                 'dispatch_id': self.headers['X-Gateway-Dispatch-Id'], 'client': self.headers['X-Gateway-Client'],
                 'native_schema': config.get('responseJsonSchema'), 'output_limit': config.get('maxOutputTokens', config.get('max_tokens')),
                 'upstream_auth_valid': True, 'prompt_text': text}
        if self.scenario in ('wave1e-mixed-v1','wave1f-grounded-v1','wave1h-context-verify-v1','p123-core-v1','p123-next-v1','p123-p3-v1','p1-live-safety-v1'):
            entry.update(scenario=self.scenario,received_at=time.time(),response=result,
                         operation=('canon_reconciliation' if 'removed_ids' in config.get('responseJsonSchema',{}).get('properties',{}) else
                                    'writing_generation' if ('Story Brain' in text or 'Author AI Copilot' in text) else
                                    'entity_verification' if 'decisions' in config.get('responseJsonSchema',{}).get('properties',{}) else
                                    'events' if 'events' in config.get('responseJsonSchema',{}).get('properties',{}) else
                                    'facts' if 'facts' in config.get('responseJsonSchema',{}).get('properties',{}) else 'discovery'))
        if self.scenario in ('wave1f-grounded-v1','wave1h-context-verify-v1','p123-core-v1','p123-next-v1','p123-p3-v1'):
            if 'Suggest future events' in text:entry['operation']='plan_suggestions'
            if 'findings' in config.get('responseJsonSchema',{}).get('properties',{}):entry['operation']='consistency'
        with self.lock:
            self.received.append(entry)
            if self.log_path:
                with Path(self.log_path).open('a', encoding='utf-8') as stream: stream.write(json.dumps(entry) + '\n')
        if 'fault:redirect' in text:
            self.send_response(302)
            self.send_header('Location', 'https://must-not-resolve.invalid/')
            self.end_headers()
            return
        if 'fault:hang' in text:
            time.sleep(60.0)
            return
        if 'fault:sleep_long' in text:
            time.sleep(5.0)
            return self.reply(200, result)
        if 'fault:slow_trickle' in text:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Transfer-Encoding', 'chunked')
            self.end_headers()
            try:
                for chunk_idx in range(40):
                    time.sleep(0.08)
                    data = f'{{"chunk": {chunk_idx}}} '.encode('utf-8')
                    self.wfile.write(f"{len(data):X}\r\n".encode('ascii') + data + b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return
        if 'fault:oversized' in text:
            large_data = (b" " * 2_050_000)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(large_data)))
            self.end_headers()
            self.wfile.write(large_data)
            return
        if 'fault:timeout_long' in text: time.sleep(2.5)
        elif 'fault:timeout' in text: time.sleep(0.5)
        for status in (401, 404, 429, 500, 503):
            if f'fault:{status}' in text: return self.reply(status, {'error': f'offline injected fault {status}'})
        self.reply(200, result)

    def log_message(self, *args): pass


def start_fake_upstream(port=0, host='127.0.0.1', log_path=None, expected_key='fake-upstream-only', scenario='wave1d-negative-only'):
    class Handler(FakeHandler): pass
    Handler.received = []; Handler.log_path = log_path; Handler.expected_key = expected_key; Handler.scenario = scenario
    server = ThreadingHTTPServer((host, port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    return server, thread, Handler.received


if __name__ == '__main__':
    server, thread, _ = start_fake_upstream(18091, '0.0.0.0', os.getenv('FAKE_REQUEST_LOG'), os.environ['OFFLINE_UPSTREAM_KEY'], os.getenv('FAKE_SCENARIO','wave1d-negative-only'))
    thread.join()
