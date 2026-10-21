"""Wave 1D: one authoritative dispatcher, offline-only until live pricing is verified.

No canned provider responses, public reservations, client tickets or ledger resets.
The process owns an OS file lock; workers use HTTP, never write the ledger.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import time
import uuid
import urllib.error
import urllib.request
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from decimal import Decimal

class BudgetExceededError(RuntimeError): pass
class BudgetMeterUnavailableError(RuntimeError): pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise BudgetMeterUnavailableError("UPSTREAM_REDIRECT_DENIED")

class AuthoritativeBudgetLedger:
    def __init__(self, state_file, max_calls=200, max_cost_usd=5.0,
                 admission_cost_usd=4.5, max_wall_clock_seconds=7200,
                 strict_fail_closed=True, *, initialize=False, run_id=None):
        self.state_file = Path(state_file)
        self._lock = threading.RLock()
        self._init_error = None
        self._owner = None
        self.state = {}
        try:
            if not strict_fail_closed:
                raise BudgetMeterUnavailableError("Fail-open mode is forbidden")
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self._owner = open(str(self.state_file) + '.lock', 'a+b')
            if os.name == 'nt':
                import msvcrt
                self._owner.seek(0); self._owner.write(b'0'); self._owner.flush(); self._owner.seek(0)
                msvcrt.locking(self._owner.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
            marker = Path(str(self.state_file) + '.initialized')
            if not self.state_file.exists():
                if not initialize or marker.exists():
                    raise BudgetMeterUnavailableError("MISSING_AUTHORITATIVE_LEDGER")
                if not run_id:
                    raise BudgetMeterUnavailableError("Explicit new offline run_id required")
                for value in (max_calls, max_cost_usd, admission_cost_usd, max_wall_clock_seconds):
                    if not math.isfinite(value) or value <= 0:
                        raise ValueError('Invalid budget ceiling')
                if max_calls > 200 or max_cost_usd > 5 or admission_cost_usd > max_cost_usd or max_wall_clock_seconds > 7200:
                    raise ValueError('Requested budget exceeds task ceilings')
                started = time.time()
                self.state = dict(schema=2, run_id=run_id, max_calls=max_calls,
                    max_cost_usd=str(max_cost_usd), admission_cost_usd=str(admission_cost_usd),
                    deadline=started + max_wall_clock_seconds, started=started,
                    total_calls=0, charged_usd='0', outstanding_usd='0', call_history=[],
                    status='OFFLINE_ONLY', actual_invoice_usd='UNKNOWN')
                with marker.open('x', encoding='utf-8') as stream:
                    json.dump({'run_id': run_id}, stream); stream.flush(); os.fsync(stream.fileno())
                self._save_durable()
            else:
                self.state = self._read_verified()
                if not marker.is_file() or json.loads(marker.read_text())['run_id'] != self.state['run_id']:
                    raise BudgetMeterUnavailableError('LEDGER_MARKER_MISMATCH')
        except Exception as exc:
            self._init_error = BudgetMeterUnavailableError(str(exc))

    def close(self):
        if self._owner:
            self._owner.close(); self._owner = None

    def _read_verified(self):
        envelope = json.loads(self.state_file.read_text(encoding='utf-8'))
        data = envelope['state']
        encoded = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
        if envelope['sha256'] != hashlib.sha256(encoded).hexdigest() or data['schema'] != 2:
            raise BudgetMeterUnavailableError('CORRUPT_OR_LEGACY_LEDGER')
        if (data['total_calls'] != len(data['call_history']) or not 0 <= data['total_calls'] <= data['max_calls']
            or not math.isfinite(data['deadline']) or data['deadline'] - data['started'] > 7200):
            raise BudgetMeterUnavailableError('INVALID_LEDGER_COUNTERS')
        if (type(data['max_calls']) is not int or data['max_calls'] > 200 or
            not Decimal('0') < Decimal(data['admission_cost_usd']) <= Decimal(data['max_cost_usd']) <= Decimal('5')):
            raise BudgetMeterUnavailableError('INVALID_PERSISTED_CEILINGS')
        entries = data['call_history']
        if len({e['ticket_id'] for e in entries}) != len(entries):
            raise BudgetMeterUnavailableError('DUPLICATE_LEDGER_TICKET')
        outstanding = sum((Decimal(e['liability_usd']) for e in entries if e['status'] == 'RESERVED'), Decimal(0))
        charged = sum((Decimal(e['charged_usd']) for e in entries if e['status'] != 'RESERVED'), Decimal(0))
        if outstanding != Decimal(data['outstanding_usd']) or charged != Decimal(data['charged_usd']):
            raise BudgetMeterUnavailableError('INVALID_LEDGER_LIABILITY')
        if min(charged, outstanding) < 0:
            raise BudgetMeterUnavailableError('NEGATIVE_LEDGER_LIABILITY')
        return data

    def _healthy(self):
        if self._init_error:
            raise self._init_error
        try:
            if self._read_verified() != self.state:
                raise BudgetMeterUnavailableError('AUTHORITATIVE_LEDGER_CHANGED')
        except Exception as exc:
            self._init_error = BudgetMeterUnavailableError(str(exc))
            raise self._init_error

    def _save_durable(self):
        temporary = self.state_file.with_name(self.state_file.name + '.tmp-' + uuid.uuid4().hex)
        try:
            data = json.dumps(self.state, sort_keys=True, separators=(',', ':')).encode()
            with temporary.open('xb') as stream:
                stream.write(json.dumps({'state': self.state, 'sha256': hashlib.sha256(data).hexdigest()}).encode())
                stream.flush(); os.fsync(stream.fileno())
            # Windows/OneDrive may transiently hold the destination. Retry ONLY
            # atomic replacement; never truncate/rewrite the authoritative file.
            for attempt in range(8):
                try:
                    os.replace(temporary, self.state_file)
                    break
                except PermissionError:
                    if attempt == 7: raise
                    time.sleep(.01 * (2 ** attempt))
            if os.name != 'nt':
                directory = os.open(self.state_file.parent, os.O_RDONLY)
                try: os.fsync(directory)
                finally: os.close(directory)
        except Exception as exc:
            self._init_error = BudgetMeterUnavailableError('LEDGER_DURABILITY_FAILURE')
            raise self._init_error from exc
        finally:
            if temporary.exists(): temporary.unlink()

    def reserve(self, operation='generic', estimated_cost=None, provider='gemini', model='',
                client_service='unknown', *, liability_usd=None):
        # Only the gateway supplies a policy-derived upper bound, never HTTP clients.
        with self._lock:
            self._healthy()
            if liability_usd is None:
                raise BudgetExceededError('CONSERVATIVE_LIABILITY_REQUIRED')
            amount = Decimal(str(liability_usd))
            if not amount.is_finite() or amount <= 0:
                raise BudgetExceededError('INVALID_LIABILITY')
            s = self.state
            if time.time() >= s['deadline']: raise BudgetExceededError('ABSOLUTE_DEADLINE_EXPIRED')
            if s['total_calls'] >= s['max_calls']: raise BudgetExceededError('MAX_CALLS_REACHED')
            committed = Decimal(s['charged_usd']) + Decimal(s['outstanding_usd']) + amount
            if committed > min(Decimal(s['admission_cost_usd']), Decimal(s['max_cost_usd'])):
                raise BudgetExceededError('OUTSTANDING_LIABILITY_COST_LIMIT')
            ticket = dict(ticket_id=str(uuid.uuid4()), call_index=s['total_calls'] + 1,
                client_service=client_service, operation=operation, provider=provider, model=model,
                liability_usd=str(amount), charged_usd='0', status='RESERVED', timestamp=time.time())
            s['total_calls'] += 1; s['call_history'].append(ticket)
            s['outstanding_usd'] = str(Decimal(s['outstanding_usd']) + amount)
            self._save_durable()  # Must succeed BEFORE transport can be called.
            return copy.deepcopy(ticket)

    def finalize(self, ticket_id, status='SUCCESS', *, cost_usd=None, **usage):
        with self._lock:
            self._healthy()
            entry = next((e for e in self.state['call_history'] if e['ticket_id'] == ticket_id), None)
            if not entry: raise ValueError('Unknown reservation')
            if entry['status'] != 'RESERVED': return copy.deepcopy(entry)
            liability = Decimal(entry['liability_usd'])
            # Timeout/errors/missing usage retain the full ceiling (not assumed free).
            amount = liability if cost_usd is None else Decimal(str(cost_usd))
            if not amount.is_finite() or not 0 <= amount <= liability:
                raise BudgetMeterUnavailableError('UNVERIFIED_USAGE_EXCEEDS_LIABILITY')
            entry.update(status=status, charged_usd=str(amount), finished=time.time())
            self.state['outstanding_usd'] = str(Decimal(self.state['outstanding_usd']) - liability)
            self.state['charged_usd'] = str(Decimal(self.state['charged_usd']) + amount)
            self._save_durable()
            return copy.deepcopy(entry)

    def get_summary(self):
        with self._lock:
            self._healthy()
            return {**copy.deepcopy(self.state), 'live_authorized': False,
                'live_cost_hard_cap': 'BUDGET_COST_HARD_CAP_UNPROVEN',
                'pricing_scope': 'SYNTHETIC_OFFLINE_TEXT_ONLY', 'actual_invoice_usd': 'UNKNOWN'}

class BudgetGatewayHandler(BaseHTTPRequestHandler):
    ledger = None
    upstream_base_url = None
    upstream_api_key = None
    client_tokens = None
    upstream_timeout = 3
    max_output_tokens = 8192
    max_body_bytes = 65536
    offline_only = True
    # Synthetic upper-bound tariffs for OFFLINE TESTS ONLY, never live price claims.
    input_rate = Decimal('1') / 1000000
    output_rate = Decimal('4') / 1000000

    def _send_json(self, status, data):
        body = json.dumps(data).encode()
        try:
            self.send_response(status); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass

    def do_GET(self):
        if self.path in ('/health', '/status', '/api/budget/status'):
            try: self._send_json(200, self.ledger.get_summary())
            except BudgetMeterUnavailableError: self._send_json(503, {'error': 'BUDGET_METER_UNAVAILABLE'})
        elif self.path == '/v1/models':
            if 'X-Budget-Ticket' in self.headers: return self._send_json(403, {'error': 'CLIENT_TICKETS_FORBIDDEN'})
            token = self.headers.get('Authorization', '').removeprefix('Bearer ')
            target = urlparse(self.upstream_base_url or '')
            if token not in (self.client_tokens or {}): return self._send_json(401, {'error': 'WORKER_AUTH_REQUIRED'})
            if not self.offline_only or target.scheme != 'http' or target.hostname not in {'127.0.0.1', 'localhost', 'fake-upstream'}:
                return self._send_json(503, {'error': 'BUDGET_COST_HARD_CAP_UNPROVEN'})
            try:
                ticket = self.ledger.reserve(operation='models_discovery', provider='fake-metadata',
                    client_service=self.client_tokens[token], liability_usd='0.000001')
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
                request = urllib.request.Request(self.upstream_base_url.rstrip('/') + '/v1/models', headers={
                    'Authorization': 'Bearer ' + (self.upstream_api_key or ''),
                    'X-Gateway-Dispatch-Id': ticket['ticket_id'], 'X-Gateway-Client': self.client_tokens[token]})
                try:
                    with opener.open(request, timeout=2) as response:
                        result = json.loads(response.read(65536))
                    self.ledger.finalize(ticket['ticket_id'], 'SUCCESS')
                    self._send_json(200, result)
                except Exception:
                    self.ledger.finalize(ticket['ticket_id'], 'UNKNOWN')
                    self._send_json(503, {'error': 'MODEL_DISCOVERY_UNAVAILABLE'})
            except BudgetExceededError as exc: self._send_json(429, {'error': str(exc)})
            except Exception: self._send_json(503, {'error': 'MODEL_DISCOVERY_UNAVAILABLE'})
        else: self._send_json(404, {'error': 'UNSUPPORTED_UNGUARDED_ROUTE'})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > self.max_body_bytes or self.headers.get('Transfer-Encoding'):
                return self._send_json(413, {'error': 'BOUNDED_CONTENT_LENGTH_REQUIRED'})
            # Drain only a bounded request before an early denial. Closing with unread
            # body bytes can reset Windows TCP and lose the intended 403/401 response.
            previous_timeout = self.connection.gettimeout()
            try:
                self.connection.settimeout(3)
                raw_body = self.rfile.read(length)
            except (TimeoutError, OSError):
                return self._send_json(408, {'error': 'REQUEST_BODY_UNAVAILABLE'})
            finally:
                self.connection.settimeout(previous_timeout)
            if len(raw_body) != length:
                return self._send_json(400, {'error': 'TRUNCATED_REQUEST_BODY'})
            if 'X-Budget-Ticket' in self.headers:
                return self._send_json(403, {'error': 'CLIENT_TICKETS_FORBIDDEN'})
            if self.path.startswith('/api/budget/'):
                return self._send_json(403, {'error': 'GATEWAY_OWNS_RESERVATION_AND_SETTLEMENT'})
            token = self.headers.get('Authorization', '').removeprefix('Bearer ') or self.headers.get('x-goog-api-key', '')
            client = (self.client_tokens or {}).get(token)
            if not client: return self._send_json(401, {'error': 'WORKER_AUTH_REQUIRED'})
            body = json.loads(raw_body)
            native = self.path.startswith('/v1beta/models/') and self.path.endswith(':generateContent')
            compat = self.path == '/v1/chat/completions'
            if not (native or compat): return self._send_json(403, {'error': 'UNSUPPORTED_BILLABLE_ROUTE'})
            model = self.path.split('/models/', 1)[1].split(':')[0] if native else body.get('model')
            if str(model).removeprefix('models/') != 'gemini-3.5-flash-lite':
                return self._send_json(403, {'error': 'MODEL_NOT_IN_OFFLINE_POLICY'})
            config = body.get('generationConfig', {}) if native else body
            limit = config.get('maxOutputTokens') if native else config.get('max_tokens')
            if type(limit) is not int or not 1 <= limit <= self.max_output_tokens or body.get('stream'):
                return self._send_json(422, {'error': 'BOUNDED_TEXT_OUTPUT_REQUIRED'})
            variants = config.get('candidateCount', 1) if native else body.get('n', 1)
            if type(variants) is not int or variants != 1 or 'best_of' in body:
                return self._send_json(403, {'error': 'UNPRICED_MULTIPLE_OUTPUTS'})
            if config.get('responseModalities', ['TEXT']) != ['TEXT']:
                return self._send_json(403, {'error': 'UNPRICED_OUTPUT_MODALITY'})
            # Reject multimodal/tools/caching/thinking variants without verified liability tariffs.
            forbidden = ('inlineData', 'fileData', 'image_url', 'audio', 'video', 'tools',
                         'cachedContent', 'thinkingConfig', 'max_completion_tokens')
            def has_forbidden(value):
                if isinstance(value, dict): return any(k in forbidden or has_forbidden(v) for k,v in value.items())
                if isinstance(value, list): return any(has_forbidden(v) for v in value)
                return False
            if has_forbidden(body): return self._send_json(403, {'error': 'UNPRICED_BILLABLE_VARIANT'})
            parsed = urlparse(self.upstream_base_url or '')
            if (not self.offline_only or parsed.scheme != 'http' or parsed.hostname not in
                    {'127.0.0.1', 'localhost', 'fake-upstream'} or parsed.username or parsed.query):
                return self._send_json(503, {'error': 'BUDGET_COST_HARD_CAP_UNPROVEN'})
            # One token per UTF8 request byte + framing allowance is a conservative
            # synthetic text-fixture ceiling. This is NOT a verified live tariff.
            wire = json.dumps(body, ensure_ascii=False).encode('utf-8')
            liability = (len(wire) + 4096) * self.input_rate + limit * self.output_rate
            ticket = self.ledger.reserve(operation='gemini_generate_content' if native else 'chat_completions',
                provider='gemini-native' if native else 'gemini-openai-compatible', model=model,
                client_service=client, liability_usd=liability)
            url = self.upstream_base_url.rstrip('/') + self.path
            headers = {'Content-Type':'application/json', 'X-Gateway-Dispatch-Id':ticket['ticket_id'],
                       'X-Gateway-Client':client}
            if self.upstream_api_key:
                headers['x-goog-api-key' if native else 'Authorization'] = ('' if native else 'Bearer ') + self.upstream_api_key
            request = urllib.request.Request(url, data=wire, headers=headers, method='POST')
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            try:
                with opener.open(request, timeout=self.upstream_timeout) as response:
                    raw = response.read(2_000_001)
                    if len(raw) > 2_000_000: raise ValueError('Upstream response exceeds bound')
                    result = json.loads(raw)
                # Retain full synthetic liability; untrusted usage never releases budget.
                self.ledger.finalize(ticket['ticket_id'], 'SUCCESS')
                return self._send_json(200, result)
            except urllib.error.HTTPError as exc:
                self.ledger.finalize(ticket['ticket_id'], 'FAILED')
                return self._send_json(exc.code, {'error': 'UPSTREAM_HTTP_ERROR'})
            except Exception:
                self.ledger.finalize(ticket['ticket_id'], 'UNKNOWN')
                return self._send_json(502, {'error': 'UPSTREAM_ERROR_OR_TIMEOUT'})
        except BudgetExceededError as exc: self._send_json(429, {'error': str(exc)})
        except BudgetMeterUnavailableError: self._send_json(503, {'error': 'BUDGET_METER_UNAVAILABLE'})
        except (ValueError, TypeError, KeyError): self._send_json(422, {'error': 'INVALID_REQUEST'})

    def log_message(self, *args): pass

# Backward import name for diagnostics; not a second dispatcher.
ThreadedHTTPServer = ThreadingHTTPServer

def start_budget_gateway(state_file, host='127.0.0.1', port=18090, max_calls=200,
                         max_cost_usd=5., admission_cost_usd=4.5, max_wall_clock_seconds=7200,
                         upstream_base_url=None, upstream_api_key=None, *, initialize=False,
                         run_id=None, client_tokens=None, upstream_timeout=3, offline_only=True):
    ledger = AuthoritativeBudgetLedger(state_file, max_calls, max_cost_usd, admission_cost_usd,
        max_wall_clock_seconds, initialize=initialize, run_id=run_id)
    class Handler(BudgetGatewayHandler): pass
    Handler.ledger = ledger; Handler.upstream_base_url = upstream_base_url
    Handler.upstream_api_key = upstream_api_key; Handler.client_tokens = client_tokens or {}
    Handler.upstream_timeout = upstream_timeout; Handler.offline_only = offline_only
    server = ThreadingHTTPServer((host, port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    return server, thread, ledger

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True); parser.add_argument('--initialize', action='store_true')
    parser.add_argument('--run-id'); parser.add_argument('--port', type=int, default=18090)
    args = parser.parse_args()
    if args.initialize:
        ledger = AuthoritativeBudgetLedger(args.state, initialize=True, run_id=args.run_id)
        ledger.get_summary(); ledger.close()
    else:
        server, thread, ledger = start_budget_gateway(args.state, host='0.0.0.0', port=args.port,
            upstream_base_url=os.environ['OFFLINE_UPSTREAM_URL'],
            upstream_api_key=os.environ.get('OFFLINE_UPSTREAM_KEY'),
            client_tokens=json.loads(os.environ['WORKER_AUTH_TOKENS']),
            upstream_timeout=float(os.getenv('GATEWAY_UPSTREAM_TIMEOUT_SECONDS', '3')))
        thread.join()
