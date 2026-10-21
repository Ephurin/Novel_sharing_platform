"""A separate, text-only HTTP upstream for Wave 1D. NEVER forwards traffic."""
import hashlib
import json
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


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
                if 'decisions' in props:
                    request = json.loads(text.split('\n\n')[-1])
                    output = {'decisions': [{'candidate_id': c['candidate_id'], 'verdict': 'not_entity',
                        'reason': 'Offline deterministic fixture, not a quality verdict'} for c in request['candidates']]}
                    if self.scenario == 'wave1e-mixed-v1':
                        try:
                            from .fake_entity_scenario import mixed_decisions
                        except ImportError:
                            from fake_entity_scenario import mixed_decisions
                        output = mixed_decisions(request)
                elif 'events' in props: output = {'events': []}
                elif 'facts' in props: output = {'facts': []}
                else: output = {'entities': []}
                if self.scenario == 'wave1f-grounded-v1':
                    try:
                        from .fake_wave1f_scenario import output as wave1f_output
                    except ImportError:
                        from fake_wave1f_scenario import output as wave1f_output
                    output=wave1f_output(props,text)
                content = json.dumps(output)
            else: content = 'Separate fake upstream response.'
            result = {'candidates': [{'content': {'role': 'model', 'parts': [{'text': content}]},
                                     'finishReason': 'STOP'}],
                      'usageMetadata': {'promptTokenCount': 10, 'candidatesTokenCount': 10, 'totalTokenCount': 20},
                      'modelVersion': 'gemini-3.5-flash-lite', 'responseId': self.headers['X-Gateway-Dispatch-Id']}
        else:
            assert self.path == '/v1/chat/completions' and body['max_tokens'] > 0
            text = json.dumps(body['messages'])
            config = {'max_tokens': body['max_tokens']}
            result = {'id': self.headers['X-Gateway-Dispatch-Id'], 'object': 'chat.completion',
                      'created': int(time.time()), 'model': body['model'],
                      'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'Separate fake upstream response.'}, 'finish_reason': 'stop'}],
                      'usage': {'prompt_tokens': 10, 'completion_tokens': 10, 'total_tokens': 20}}
        entry = {'path': self.path, 'request_sha256': hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
                 'dispatch_id': self.headers['X-Gateway-Dispatch-Id'], 'client': self.headers['X-Gateway-Client'],
                 'native_schema': config.get('responseJsonSchema'), 'output_limit': config.get('maxOutputTokens', config.get('max_tokens')),
                 'upstream_auth_valid': True}
        if self.scenario in ('wave1e-mixed-v1','wave1f-grounded-v1'):
            entry.update(scenario=self.scenario,received_at=time.time(),response=result,
                         operation=('entity_verification' if 'decisions' in config.get('responseJsonSchema',{}).get('properties',{}) else
                                    'events' if 'events' in config.get('responseJsonSchema',{}).get('properties',{}) else
                                    'facts' if 'facts' in config.get('responseJsonSchema',{}).get('properties',{}) else 'discovery'))
        if self.scenario == 'wave1f-grounded-v1':
            if 'Suggest future events' in text:entry['operation']='plan_suggestions'
            if 'findings' in config.get('responseJsonSchema',{}).get('properties',{}):entry['operation']='consistency'
        with self.lock:
            self.received.append(entry)
            if self.log_path:
                with Path(self.log_path).open('a', encoding='utf-8') as stream: stream.write(json.dumps(entry) + '\n')
        if 'fault:redirect' in text:
            self.send_response(302); self.send_header('Location', 'https://must-not-resolve.invalid/'); self.end_headers(); return
        if 'fault:timeout' in text: time.sleep(0.5)
        for status in (429, 500):
            if f'fault:{status}' in text: return self.reply(status, {'error': 'offline injected fault'})
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
